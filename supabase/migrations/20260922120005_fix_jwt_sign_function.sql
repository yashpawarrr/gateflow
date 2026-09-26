/*
# Fix generate_pass_token function

The pgjwt sign() function expects text arguments, not jsonb.
This fixes the type mismatch that prevented pass approval from working.
*/

CREATE OR REPLACE FUNCTION generate_pass_token(p_pass_id uuid, p_student_id uuid, p_expires_at timestamptz)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_token text;
  v_header text;
  v_payload text;
  v_secret text;
BEGIN
  v_secret := 'campuspass_jwt_secret_2024_demo';

  v_header := jsonb_build_object('alg','HS256','typ','JWT')::text;
  v_payload := jsonb_build_object(
    'pass_id', p_pass_id,
    'student_id', p_student_id,
    'exp', extract(epoch from p_expires_at)::bigint,
    'iat', extract(epoch from now())::bigint
  )::text;

  v_token := sign(v_header, v_payload, v_secret);

  RETURN v_token;
END;
$$;

-- Also fix verify_pass_token to use text instead of jsonb
CREATE OR REPLACE FUNCTION verify_pass_token(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_secret text := 'campuspass_jwt_secret_2024_demo';
  v_verified jsonb;
  v_exp bigint;
BEGIN
  v_verified := verify(p_token, v_secret);

  IF v_verified IS NULL THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'INVALID QR TOKEN');
  END IF;

  v_exp := (v_verified->>'exp')::bigint;
  IF v_exp < extract(epoch from now())::bigint THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'EXPIRED PASS');
  END IF;

  RETURN jsonb_build_object('valid', true, 'payload', v_verified);
END;
$$;
