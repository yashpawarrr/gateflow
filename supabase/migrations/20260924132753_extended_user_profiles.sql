/*
# Extended User Profiles for Hierarchical Routing

## Summary
Students now provide: name, enrollment/roll number, branch (department), semester, year,
HOD name, TG/mentor name, TG mobile number, and a valid parent phone number.
TGs/faculties now provide: name, department/branch, their phone number, roll number/registered number,
HOD name, and HOD phone number (so their leave request goes to the right HOD).

## New Columns on `users`
- `phone` (text, nullable) — personal mobile number (TG/faculty)
- `semester` (int, nullable) — current semester (student)
- `year` (int, nullable) — current academic year (student)
- `hod_name` (text, nullable) — name of the student's/TG's HOD
- `hod_phone` (text, nullable) — phone of the student's/TG's HOD
- `tg_name` (text, nullable) — name of the student's mentor/TG (student only)
- `tg_phone` (text, nullable) — phone of the student's mentor/TG (student only)

## Updated Functions
- `signup_user`: accepts all new parameters and stores them
- `get_current_user`: returns all new columns (automatic via `SELECT *`)

## Security
- No RLS policy changes (existing policies still apply)
*/

ALTER TABLE users ADD COLUMN IF NOT EXISTS phone text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS semester int;
ALTER TABLE users ADD COLUMN IF NOT EXISTS year int;
ALTER TABLE users ADD COLUMN IF NOT EXISTS hod_name text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS hod_phone text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS tg_name text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS tg_phone text;

CREATE OR REPLACE FUNCTION public.signup_user(
  p_name text,
  p_role text,
  p_department text,
  p_roll_number text,
  p_parent_phone text,
  p_phone text DEFAULT NULL,
  p_semester int DEFAULT NULL,
  p_year int DEFAULT NULL,
  p_hod_name text DEFAULT NULL,
  p_hod_phone text DEFAULT NULL,
  p_tg_name text DEFAULT NULL,
  p_tg_phone text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid;
  v_auth_uid uuid := auth.uid();
  v_email text;
BEGIN
  IF v_auth_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT email INTO v_email FROM auth.users WHERE id = v_auth_uid;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Auth user not found';
  END IF;

  SELECT id INTO v_user_id FROM users WHERE auth_id = v_auth_uid;
  IF FOUND THEN
    RETURN v_user_id;
  END IF;

  INSERT INTO users (
    name, email, role, department,
    roll_number, parent_phone, phone,
    semester, year,
    hod_name, hod_phone,
    tg_name, tg_phone,
    auth_id
  )
  VALUES (
    p_name, v_email, p_role, p_department,
    NULLIF(p_roll_number, ''), NULLIF(p_parent_phone, ''), NULLIF(p_phone, ''),
    p_semester, p_year,
    NULLIF(p_hod_name, ''), NULLIF(p_hod_phone, ''),
    NULLIF(p_tg_name, ''), NULLIF(p_tg_phone, ''),
    v_auth_uid
  )
  RETURNING id INTO v_user_id;

  RETURN v_user_id;
END;
$function$;
