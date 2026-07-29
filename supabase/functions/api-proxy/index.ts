import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'

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
    const { provider, method, endpoint, payload, queryParams, idempotency_key } = await req.json();

    // --- IDEMPOTENCY CHECK ---
    // WHY: Prevents idempotency key reuse across different request payloads 
    // from being silently treated as a duplicate of an unrelated request.
    if (idempotency_key) {
      const authHeader = req.headers.get('Authorization');
      if (!authHeader) {
        return new Response(JSON.stringify({ error: 'Missing Authorization header for idempotency', edge_status: 401 }), { status: 200, headers: corsHeaders });
      }
      
      const supabaseClient = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_ANON_KEY') ?? '',
        { global: { headers: { Authorization: authHeader || '' } } }
      );
      
      let userId = '00000000-0000-0000-0000-000000000000';
      if (authHeader) {
        const { data: { user } } = await supabaseClient.auth.getUser();
        if (user) userId = user.id;
      }

      const sortObjectKeys = (obj: any): any => {
        if (typeof obj !== 'object' || obj === null) return obj;
        if (Array.isArray(obj)) return obj.map(sortObjectKeys);
        return Object.keys(obj).sort().reduce((result: any, key: string) => {
          result[key] = sortObjectKeys(obj[key]);
          return result;
        }, {});
      };

      const canonicalPayload = JSON.stringify(sortObjectKeys(payload || {}));
      const hashData = new TextEncoder().encode(`${endpoint}|${canonicalPayload}`);
      const hashBuffer = await crypto.subtle.digest('SHA-256', hashData);
      const payloadHash = Array.from(new Uint8Array(hashBuffer))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');

      const { data: idempCheck, error: idempError } = await supabaseClient.rpc(
        'check_idempotency', 
        { p_key: idempotency_key, p_user_id: userId, p_payload_hash: payloadHash }
      );

      if (idempError || !idempCheck) {
        console.error('Idempotency RPC Error:', idempError);
        return new Response(JSON.stringify({ error: 'Internal server error during idempotency check', edge_status: 500 }), { status: 200, headers: corsHeaders });
      }

      if (idempCheck.allowed === false) {
        if (idempCheck.reason === 'key_reuse_mismatch') {
          return new Response(JSON.stringify({ error: 'Idempotency key already used with different request data. Use a new key for a new request.', edge_status: 409 }), { status: 200, headers: corsHeaders });
        }
        return new Response(JSON.stringify({ error: 'Duplicate request rejected', edge_status: 409 }), { status: 200, headers: corsHeaders });
      }

      if (idempCheck.reason === 'retry_completed') {
         return new Response(JSON.stringify({ error: 'Request already completed successfully previously. Please check ledger.', edge_status: 409 }), { status: 200, headers: corsHeaders });
      }
    }
    // --- END IDEMPOTENCY CHECK ---

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

    return new Response(JSON.stringify({ ...data, edge_status: response.status }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message, edge_status: 400 }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  }
});
