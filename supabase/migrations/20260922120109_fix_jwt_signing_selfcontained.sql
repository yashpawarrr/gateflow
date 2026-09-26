/*
# Fix JWT signing using pgcrypto hmac directly

pgjwt's sign() function internally calls public.hmac() which doesn't exist
(hmac lives in the extensions schema). Instead of relying on pgjwt, we implement
JWT signing directly using pgcrypto's hmac function from the extensions schema.

This creates a self-contained token signing/verification that doesn't depend on pgjwt.
*/

-- Helper: base64url encode
CREATE OR REPLACE FUNCTION base64url_encode(data bytea)
RETURNS text
LANGUAGE sql
IMMUTABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT replace(replace(encode(data, 'base64'), '+', '-'), '/', '_');
$$;

-- Helper: base64url decode
CREATE OR REPLACE FUNCTION base64url_decode(data text)
RETURNS bytea
LANGUAGE sql
IMMUTABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT decode(replace(replace(data, '-', '+'), '_', '/'), 'base64');
$$;

-- Generate a signed JWT token for a pass
CREATE OR REPLACE FUNCTION generate_pass_token(p_pass_id uuid, p_student_id uuid, p_expires_at timestamptz)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_secret text := 'campuspass_jwt_secret_2024_demo';
  v_header text;
  v_payload text;
  v_header_b64 text;
  v_payload_b64 text;
  v_signing_input text;
  v_signature text;
  v_sig_bytea bytea;
BEGIN
  v_header := '{"alg":"HS256","typ":"JWT"}';
  v_payload := json_build_object(
    'pass_id', p_pass_id,
    'student_id', p_student_id,
    'exp', extract(epoch from p_expires_at)::bigint,
    'iat', extract(epoch from now())::bigint
  )::text;

  v_header_b64 := base64url_encode(convert_to(v_header, 'UTF8'));
  v_payload_b64 := base64url_encode(convert_to(v_payload, 'UTF8'));
  v_signing_input := v_header_b64 || '.' || v_payload_b64;

  -- Use hmac from extensions schema (pgcrypto)
  v_sig_bytea := hmac(v_signing_input, v_secret, 'sha256');
  v_signature := base64url_encode(v_sig_bytea);

  RETURN v_signing_input || '.' || v_signature;
END;
$$;

-- Verify a JWT token signature and expiry
CREATE OR REPLACE FUNCTION verify_pass_token(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_secret text := 'campuspass_jwt_secret_2024_demo';
  v_parts text[];
  v_signing_input text;
  v_provided_sig text;
  v_expected_sig text;
  v_payload jsonb;
  v_exp bigint;
BEGIN
  v_parts := string_to_array(p_token, '.');

  IF array_length(v_parts, 1) <> 3 THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'INVALID QR TOKEN');
  END IF;

  v_signing_input := v_parts[1] || '.' || v_parts[2];
  v_provided_sig := v_parts[3];
  v_expected_sig := base64url_encode(hmac(v_signing_input, v_secret, 'sha256'));

  IF v_provided_sig <> v_expected_sig THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'INVALID QR TOKEN');
  END IF;

  -- Decode payload
  BEGIN
    v_payload := convert_from(base64url_decode(v_parts[2]), 'UTF8')::jsonb;
  EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'INVALID QR TOKEN');
  END;

  -- Check expiry
  v_exp := (v_payload->>'exp')::bigint;
  IF v_exp < extract(epoch from now())::bigint THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'EXPIRED PASS');
  END IF;

  RETURN jsonb_build_object('valid', true, 'payload', v_payload);
END;
$$;
