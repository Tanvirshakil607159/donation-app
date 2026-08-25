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

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { member_code, phone, amount, donation_months, return_url } = await req.json();

    if (!member_code || !phone || !amount || !donation_months || !Array.isArray(donation_months) || donation_months.length === 0) {
      throw new Error("Missing required fields or no months selected.");
    }

    // Verify member
    const { data: member, error: memberError } = await supabase
      .from("members")
      .select("id, full_name, email, phone, address, status")
      .eq("member_code", member_code)
      .eq("phone", phone)
      .single();

    if (memberError || !member || member.status !== "active") {
      throw new Error("Invalid member credentials or inactive member.");
    }

    // Verify none of the selected months are already PAID
    const { data: existingDonations } = await supabase
      .from("donations")
      .select("donation_month, status")
      .eq("member_id", member.id)
      .in("donation_month", donation_months.map(m => `${m}-01`))
      .eq("status", "SUCCESS");

    if (existingDonations && existingDonations.length > 0) {
      throw new Error("One or more selected months are already paid.");
    }

    // Delete any old PENDING rows for these months so they are replaced and don't clutter the DB
    await supabase
      .from("donations")
      .delete()
      .eq("member_id", member.id)
      .in("donation_month", donation_months.map(m => `${m}-01`))
      .eq("status", "PENDING");

    // Generate transaction ID
    const tran_id = `DON-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    const perMonthAmount = amount / donation_months.length;

    // Insert pending donations
    const rowsToInsert = donation_months.map((month: string) => ({
      member_id: member.id,
      tran_id: tran_id,
      amount: perMonthAmount,
      currency: "BDT",
      donation_month: `${month}-01`,
      status: "PENDING"
    }));

    const { error: insertError } = await supabase
      .from("donations")
      .insert(rowsToInsert);

    if (insertError) throw insertError;

    // Fetch AmarPay secrets
    const STORE_ID = Deno.env.get("AAMARPAY_STORE_ID") || "aamarpaytest";
    const SIGNATURE_KEY = Deno.env.get("AAMARPAY_SIGNATURE_KEY") || "dbb74894e82415a2f7ff0ec3a97e4183";
    const IS_SANDBOX = Deno.env.get("AAMARPAY_SANDBOX") !== "false";
    const APP_BASE_URL = Deno.env.get("APP_BASE_URL") || "";

    const amarpayUrl = IS_SANDBOX 
      ? "https://sandbox.aamarpay.com/jsonpost.php" 
      : "https://secure.aamarpay.com/jsonpost.php";

    const clientOrigin = return_url || req.headers.get("referer") || req.headers.get("origin") || APP_BASE_URL || "http://localhost:5173";
    const payload = {
      store_id: STORE_ID,
      signature_key: SIGNATURE_KEY,
      cus_name: member.full_name,
      cus_email: member.email || "no-email@example.com",
      cus_phone: member.phone,
      cus_add1: member.address || "N/A",
      cus_add2: "N/A",
      cus_city: "Dhaka",
      cus_country: "Bangladesh",
      amount: amount.toString(),
      tran_id: tran_id,
      currency: "BDT",
      success_url: `${Deno.env.get("SUPABASE_URL")}/functions/v1/payment-ipn`,
      fail_url: `${Deno.env.get("SUPABASE_URL")}/functions/v1/payment-ipn`,
      cancel_url: `${Deno.env.get("SUPABASE_URL")}/functions/v1/payment-ipn`,
      desc: "Monthly Donation",
      opt_a: clientOrigin,
      type: "json"
    };

    const initRes = await fetch(amarpayUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    const initData = await initRes.json();

    // Log the INIT event
    await supabase.from("amarpay_logs").insert({
      tran_id,
      event_type: initData.result === "true" ? "INIT" : "INIT_ERROR",
      payload: initData
    });

    if (initData.result !== "true") {
      throw new Error("Failed to initialize payment gateway.");
    }

    return new Response(
      JSON.stringify({ gateway_url: initData.payment_url }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  }
});
