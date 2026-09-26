/*
# Fix generate_pass_token and verify_pass_token for pgjwt API

pgjwt's sign() takes (payload json, secret text, algorithm text) -> text
pgjwt's verify() takes (token text, secret text, algorithm text) -> TABLE(header json, payload json, valid boolean)
Updated both functions to use the correct API.
*/

CREATE OR REPLACE FUNCTION generate_pass_token(p_pass_id uuid, p_student_id uuid, p_expires_at timestamptz)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_token text;
  v_secret text := 'campuspass_jwt_secret_2024_demo';
BEGIN
  v_token := sign(
    json_build_object(
      'pass_id', p_pass_id,
      'student_id', p_student_id,
      'exp', extract(epoch from p_expires_at)::bigint,
      'iat', extract(epoch from now())::bigint
    )::json,
    v_secret,
    'HS256'
  );

  RETURN v_token;
END;
$$;

CREATE OR REPLACE FUNCTION verify_pass_token(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_secret text := 'campuspass_jwt_secret_2024_demo';
  v_header json;
  v_payload json;
  v_valid boolean;
  v_exp bigint;
BEGIN
  SELECT header, payload, valid INTO v_header, v_payload, v_valid
  FROM verify(p_token, v_secret, 'HS256');

  IF NOT v_valid OR v_payload IS NULL THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'INVALID QR TOKEN');
  END IF;

  v_exp := (v_payload->>'exp')::bigint;
  IF v_exp < extract(epoch from now())::bigint THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'EXPIRED PASS');
  END IF;

  RETURN jsonb_build_object('valid', true, 'payload', v_payload::jsonb);
END;
$$;
