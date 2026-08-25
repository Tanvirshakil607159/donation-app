import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { phone, message } = await req.json()

    if (!phone || !message) {
      return new Response(JSON.stringify({ error: 'Phone and message are required' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      })
    }

    // Connect to Supabase
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    )

    // Verify user is an admin
    const { data: { user } } = await supabaseClient.auth.getUser()
    if (!user) throw new Error('Unauthorized')

    const { data: adminCheck } = await supabaseClient
      .from('app_admins')
      .select('id')
      .eq('id', user.id)
      .single()

    if (!adminCheck) throw new Error('Forbidden')

    // Prepare BulkSMS BD payload
    const apiKey = Deno.env.get('BULKSMSBD_API_KEY')
    const senderId = Deno.env.get('BULKSMSBD_SENDER_ID')

    // Log to SMS Logs as PENDING
    const { data: logEntry, error: insertError } = await supabaseClient
      .from('sms_logs')
      .insert({ phone, message, status: 'PENDING' })
      .select()
      .single()

    if (insertError) throw insertError

    // Call BulkSMS BD API
    const smsResponse = await fetch(`http://bulksmsbd.net/api/smsapi`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        api_key: apiKey!,
        senderid: senderId!,
        number: phone,
        message: message
      })
    })

    const smsResult = await smsResponse.json()

    // Update log status based on response
    const status = smsResult.response_code === 202 ? 'SENT' : 'FAILED'
    
    await supabaseClient
      .from('sms_logs')
      .update({ status, gateway_response: smsResult })
      .eq('id', logEntry.id)

    return new Response(JSON.stringify({ success: true, result: smsResult }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})
