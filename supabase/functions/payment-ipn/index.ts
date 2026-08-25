import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const APP_BASE_URL = Deno.env.get("APP_BASE_URL") || "";

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Parse form data - handle both IPN (POST) and redirects (POST from gateway)
    let payload: Record<string, string> = {};
    try {
      const formData = await req.formData();
      payload = Object.fromEntries(
        [...formData.entries()].map(([k, v]) => [k, String(v)])
      );
    } catch {
      // If formData fails, try URL params (some redirects use GET)
      const url = new URL(req.url);
      payload = Object.fromEntries(url.searchParams.entries());
    }

    const tran_id = payload.mer_txnid || payload.tran_id; // AmarPay usually uses mer_txnid
    const status = payload.pay_status;

    if (!tran_id) {
      throw new Error("Missing tran_id in payload");
    }

    // Determine if this is a server IPN or browser redirect
    const referer = req.headers.get("referer") || "";
    const isServerIPN = !referer || !referer.includes("aamarpay");
    const eventPrefix = isServerIPN ? "IPN" : "REDIRECT";

    // Log the event
    await supabase.from("amarpay_logs").insert({
      tran_id,
      event_type: status === "Successful" 
        ? (isServerIPN ? "IPN" : "REDIRECT_SUCCESS")
        : status === "Failed"
        ? (isServerIPN ? "IPN" : "REDIRECT_FAIL")
        : status === "Canceled"
        ? (isServerIPN ? "IPN" : "REDIRECT_CANCEL")
        : eventPrefix,
      payload
    });

    // Handle non-Successful statuses
    if (status !== "Successful") {
      const finalStatus = status === "Failed" ? "FAILED" : "CANCELLED";
      await supabase
        .from("donations")
        .update({ status: finalStatus, updated_at: new Date().toISOString() })
        .eq("tran_id", tran_id)
        .eq("status", "PENDING");

      if (APP_BASE_URL) {
        return Response.redirect(
          `${APP_BASE_URL}?payment=${finalStatus.toLowerCase()}&tran_id=${tran_id}`, 302
        );
      }
      return new Response("OK");
    }

    // Status is Successful — independently verify via AmarPay validation API
    const STORE_ID = Deno.env.get("AAMARPAY_STORE_ID") || "aamarpaytest";
    const SIGNATURE_KEY = Deno.env.get("AAMARPAY_SIGNATURE_KEY") || "dbb74894e82415a2f7ff0ec3a97e4183";
    const IS_SANDBOX = Deno.env.get("AAMARPAY_SANDBOX") !== "false";

    const baseUrl = IS_SANDBOX
      ? "https://sandbox.aamarpay.com"
      : "https://secure.aamarpay.com";
      
    const validateUrl = `${baseUrl}/api/v1/trxcheck/request.php?request_id=${tran_id}&store_id=${STORE_ID}&signature_key=${SIGNATURE_KEY}&type=json`;

    let valData: any;
    try {
      const valRes = await fetch(validateUrl);
      valData = await valRes.json();
    } catch (fetchErr: any) {
      // Log the fetch failure
      await supabase.from("amarpay_logs").insert({
        tran_id,
        event_type: "VALIDATE_ERROR",
        payload: { error: "Validation API fetch failed: " + fetchErr.message }
      });
      throw new Error("Validation API request failed: " + fetchErr.message);
    }

    // Log the validation result
    const isValidated = valData.pay_status === "Successful";
    await supabase.from("amarpay_logs").insert({
      tran_id,
      event_type: isValidated ? "VALIDATE" : "VALIDATE_ERROR",
      payload: valData
    });

    if (!isValidated) {
      // Log but don't mark as failed — could be a timing issue
      // The payment might still come through via a subsequent IPN
      if (APP_BASE_URL) {
        return Response.redirect(
          `${APP_BASE_URL}?payment=pending&tran_id=${tran_id}`, 302
        );
      }
      return new Response("Validation rejected");
    }

    // Validation passed — update PENDING rows to SUCCESS
    const { data: pendingRows } = await supabase
      .from("donations")
      .select("id")
      .eq("tran_id", tran_id)
      .eq("status", "PENDING");

    if (!pendingRows || pendingRows.length === 0) {
      // Already processed (idempotent)
      if (APP_BASE_URL) {
        return Response.redirect(`${APP_BASE_URL}?payment=success&tran_id=${tran_id}`, 302);
      }
      return new Response("OK");
    }

    const rowCount = pendingRows.length;
    const storeAmountPerMonth = Number(valData.store_amount || valData.amount) / rowCount;

    const { error: updateError } = await supabase
      .from("donations")
      .update({
        status: "SUCCESS",
        val_id: valData.pg_txnid || payload.pg_txnid,
        bank_tran_id: valData.bank_txn || payload.bank_txn,
        card_type: valData.card_type || payload.card_type,
        card_issuer: valData.card_issuer || "AmarPay",
        card_brand: valData.card_brand || "AmarPay",
        store_amount: storeAmountPerMonth,
        risk_level: valData.risk_level || "0",
        gateway_response: valData,
        validated_at: new Date().toISOString(),
        paid_at: valData.date || valData.tran_date || new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq("tran_id", tran_id)
      .eq("status", "PENDING");

    if (updateError) {
      // Log the DB error so it can be diagnosed later
      await supabase.from("amarpay_logs").insert({
        tran_id,
        event_type: "UPDATE_ERROR",
        payload: { error: updateError.message, code: updateError.code, details: updateError.details }
      });
      throw updateError;
    }

    // CREATE JOURNAL ENTRY FOR DIRECT INCOME
    try {
      const { data: accounts } = await supabase.from("chart_of_accounts").select("id, code");
      const cashAcct = accounts?.find(a => a.code === '1000');
      const donationAcct = accounts?.find(a => a.code === '4000');

      if (cashAcct && donationAcct) {
        const { data: entry } = await supabase.from("journal_entries").insert({
          reference: tran_id,
          description: `Online Donation/Fee collected via AmarPay - ${tran_id}`,
          status: 'POSTED'
        }).select().single();

        if (entry) {
          const totalAmount = Number(valData.store_amount || valData.amount);
          await supabase.from("journal_lines").insert([
            { entry_id: entry.id, account_id: cashAcct.id, debit: totalAmount, credit: 0, description: 'Donation Received' },
            { entry_id: entry.id, account_id: donationAcct.id, debit: 0, credit: totalAmount, description: 'Donation Received' }
          ]);
        }
      }
    } catch (jErr: any) {
      // Log but don't fail the IPN
      await supabase.from("amarpay_logs").insert({
        tran_id,
        event_type: "JOURNAL_ERROR",
        payload: { error: jErr.message }
      });
    }

    if (APP_BASE_URL) {
      return Response.redirect(`${APP_BASE_URL}?payment=success&tran_id=${tran_id}`, 302);
    }
    return new Response("OK");

  } catch (error: any) {
    if (APP_BASE_URL) {
      return Response.redirect(
        `${APP_BASE_URL}?payment=error&message=${encodeURIComponent(error.message)}`, 302
      );
    }
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
    });
  }
});
