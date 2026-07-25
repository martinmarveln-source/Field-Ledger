import { serve } from "https://deno.land/std@0.177.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { reference, userPhone } = await req.json()
    
    // 1. Get Paystack Secret Key from Supabase Edge Function Secrets
    const paystackSecret = Deno.env.get('PAYSTACK_SECRET_KEY')
    if (!paystackSecret) throw new Error('Missing PAYSTACK_SECRET_KEY in Edge Function secrets')

    // 2. Call Paystack Verification API
    const paystackRes = await fetch(`https://api.paystack.co/transaction/verify/${reference}`, {
      headers: {
        Authorization: `Bearer ${paystackSecret}`
      }
    })
    
    const paystackData = await paystackRes.json()
    if (!paystackData.status || paystackData.data.status !== 'success') {
      throw new Error('Payment verification failed or payment was not successful')
    }

    // Amount is in kobo, convert to Naira
    const grossAmount = paystackData.data.amount / 100
    const feeAmount = grossAmount * 0.07 // 7% fee
    const verifiedAmount = grossAmount - feeAmount

    // 3. Connect to Supabase using Service Role Key (to bypass RLS and access kv_store)
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // 4. Get the current user data from kv_store
    const { data: userData, error: userError } = await supabase
      .from('kv_store')
      .select('value')
      .eq('key', `users:${userPhone}`)
      .single()

    if (userError || !userData) throw new Error('User not found in database')
    
    // Handle stringified JSON in jsonb column
    const user = typeof userData.value === 'string' ? JSON.parse(userData.value) : userData.value
    
    // Add verified amount
    user.balance = (user.balance || 0) + verifiedAmount

    // 5. Save updated user back to kv_store
    const { error: updateError } = await supabase
      .from('kv_store')
      .update({ value: JSON.stringify(user) })
      .eq('key', `users:${userPhone}`)
      
    if (updateError) throw new Error('Failed to update user balance')
    
    // 6. Log the transaction securely
    const tx = {
      id: Math.random().toString(36).substr(2, 9),
      userPhone,
      type: 'deposit',
      amount: verifiedAmount,
      desc: `Deposit (7% Fee: -N${feeAmount})`,
      date: new Date().toISOString()
    }
    await supabase.from('kv_store').upsert({ key: `transactions:${tx.id}`, value: JSON.stringify(tx) })

    return new Response(JSON.stringify({ success: true, newBalance: user.balance }), {
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
