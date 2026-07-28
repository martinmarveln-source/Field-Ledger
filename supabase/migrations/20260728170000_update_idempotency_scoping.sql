-- 1. Create the table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.api_idempotency (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    idempotency_key text NOT NULL,
    user_id uuid NOT NULL,
    status text NOT NULL DEFAULT 'pending',
    payload_hash text NOT NULL DEFAULT 'legacy_unhashed',
    retry_count int NOT NULL DEFAULT 0,
    last_attempted_at timestamptz,
    created_at timestamptz DEFAULT now(),
    UNIQUE(idempotency_key, user_id)
);

-- Ensure columns exist in case table was already there without them
ALTER TABLE public.api_idempotency 
ADD COLUMN IF NOT EXISTS payload_hash text NOT NULL DEFAULT 'legacy_unhashed',
ADD COLUMN IF NOT EXISTS retry_count int NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_attempted_at timestamptz;

-- 2. Create the race-condition-safe UPSERT function
CREATE OR REPLACE FUNCTION public.check_idempotency(
    p_key text, 
    p_user_id uuid, 
    p_payload_hash text
)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
    v_row record;
    v_result jsonb;
BEGIN
    -- Atomic UPSERT: We attempt to insert the new pending record.
    -- If it conflicts (key + user_id exists), we do a dummy update to touch 
    -- retry_count/last_attempted_at so RETURNING gives us the locked row safely.
    INSERT INTO public.api_idempotency (idempotency_key, user_id, payload_hash, status, created_at)
    VALUES (p_key, p_user_id, p_payload_hash, 'pending', now())
    ON CONFLICT (idempotency_key, user_id) 
    DO UPDATE SET 
        retry_count = api_idempotency.retry_count + 1,
        last_attempted_at = now()
    RETURNING * INTO v_row;

    -- Evaluate the outcome based on the returned row
    IF v_row.retry_count = 0 THEN
        -- It was a fresh insert
        v_result := jsonb_build_object('allowed', true, 'reason', 'new', 'status', v_row.status);
    ELSIF v_row.payload_hash != p_payload_hash THEN
        -- Hash mismatch: client reused key for different payload
        v_result := jsonb_build_object('allowed', false, 'reason', 'key_reuse_mismatch', 'status', v_row.status);
    ELSE
        -- Hash matches: legitimate retry
        IF v_row.status = 'completed' THEN
            v_result := jsonb_build_object('allowed', true, 'reason', 'retry_completed', 'status', v_row.status);
        ELSE
            v_result := jsonb_build_object('allowed', true, 'reason', 'retry_pending', 'status', v_row.status);
        END IF;
    END IF;

    RETURN v_result;
END;
$$;
