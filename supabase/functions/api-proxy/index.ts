import "jsr:@supabase/functions-js/edge-runtime.d.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { provider, method, endpoint, payload, queryParams } = await req.json();

    if (!provider || !endpoint) {
      throw new Error('Provider and endpoint are required');
    }

    const isFasterVerify = provider === 'fasterverify';
    
    // Get secrets from Supabase environment
    const checkmyninKey = Deno.env.get('CHECKMYNIN_API_KEY') || Deno.env.get('VITE_API_KEY');
    const fasterverifyKey = Deno.env.get('FASTERVERIFY_API_KEY') || Deno.env.get('VITE_FASTERVERIFY_KEY');
    
    const key = isFasterVerify ? fasterverifyKey : checkmyninKey;

    if (!key) {
      throw new Error(`API key for ${provider} is not configured on the server.`);
    }

    const baseUrl = isFasterVerify 
      ? 'https://fasterverify.com.ng/api/v1' 
      : 'https://checkmyninbvn.com.ng/api';

    const headers = new Headers();
    headers.set('Content-Type', 'application/json');
    if (isFasterVerify) {
      headers.set('Authorization', `Bearer ${key}`);
    } else {
      headers.set('x-api-key', key);
    }

    let url = `${baseUrl}/${endpoint}`;
    let fetchOptions: RequestInit = {
      method: method || 'POST',
      headers,
    };

    if (fetchOptions.method === 'GET' && queryParams) {
      url += `?${queryParams}`;
    } else if (fetchOptions.method === 'POST' && payload) {
      fetchOptions.body = JSON.stringify(payload);
    }

    const response = await fetch(url, fetchOptions);
    const data = await response.json();

    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: response.status,
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    });
  }
});
