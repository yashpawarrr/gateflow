/*
# Add real authentication to CampusPass

## Overview
Links the existing `users` table to Supabase Auth (`auth.users`) so real users can
sign up and log in. Adds a `departments` table for multi-department support.
Updates RLS policies to use `auth.uid()` for proper authorization.

## Changes

### 1. New Table: departments
- `id` (uuid PK)
- `name` (text, unique) - department name
- `created_at` (timestamptz)

### 2. Modified Table: users
- Added `auth_id` (uuid, FK -> auth.users, nullable) linking to the auth account

### 3. RLS Policy Changes
- `users`: authenticated users can read all profiles. Users can update only own.
- `pass_requests`: authenticated users can read all. INSERT/UPDATE via RPC with auth checks.
- `system_settings`: authenticated can read; only HOD can update.
- `departments`: authenticated can read all.

### 4. RPC Functions (use auth.uid() instead of passed-in IDs)
- `create_pass(pass_type, reason, leaving, return, parent_phone)` - student creates pass
- `approve_pass(pass_id)` - HOD/TG approves
- `reject_pass(pass_id)` - HOD/TG rejects
- `verify_and_scan(qr_hash)` - guard scans
- `signup_user(name, role, dept, roll, phone)` - creates profile after auth signup
- `get_current_user()` - returns profile for logged-in user

### 5. Seed Data
- Departments: Computer Science, Electronics, Mechanical, Civil, Electrical, IT, Security
*/

-- ============================================================
-- DEPARTMENTS TABLE
-- ============================================================

CREATE TABLE IF NOT EXISTS departments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text UNIQUE NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- ============================================================
-- ADD auth_id COLUMN TO users
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'auth_id'
  ) THEN
    ALTER TABLE users ADD COLUMN auth_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
END$$;

-- ============================================================
-- SEED DEPARTMENTS
-- ============================================================

INSERT INTO departments (name) VALUES
  ('Computer Science'),
  ('Electronics & Communication'),
  ('Mechanical Engineering'),
  ('Civil Engineering'),
  ('Electrical Engineering'),
  ('Information Technology'),
  ('Security')
ON CONFLICT (name) DO NOTHING;

-- ============================================================
-- UPDATE RLS POLICIES
-- ============================================================

-- USERS
DROP POLICY IF EXISTS "anon_select_users" ON users;
DROP POLICY IF EXISTS "anon_insert_users" ON users;
DROP POLICY IF EXISTS "anon_update_users" ON users;

CREATE POLICY "authed_select_users" ON users FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "authed_update_own_user" ON users FOR UPDATE
  TO authenticated USING (auth.uid() = auth_id) WITH CHECK (auth.uid() = auth_id);

CREATE POLICY "authed_insert_own_user" ON users FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = auth_id);

-- PASS_REQUESTS
DROP POLICY IF EXISTS "anon_select_pass_requests" ON pass_requests;
DROP POLICY IF EXISTS "anon_insert_pass_requests" ON pass_requests;
DROP POLICY IF EXISTS "anon_update_pass_requests" ON pass_requests;

CREATE POLICY "authed_select_pass_requests" ON pass_requests FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "authed_insert_pass_requests" ON pass_requests FOR INSERT
  TO authenticated WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "authed_update_pass_requests" ON pass_requests FOR UPDATE
  TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

-- SYSTEM_SETTINGS
DROP POLICY IF EXISTS "anon_select_system_settings" ON system_settings;
DROP POLICY IF EXISTS "anon_update_system_settings" ON system_settings;

CREATE POLICY "authed_select_system_settings" ON system_settings FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "authed_update_system_settings" ON system_settings FOR UPDATE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE users.auth_id = auth.uid() AND users.role = 'HOD'))
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE users.auth_id = auth.uid() AND users.role = 'HOD'));

-- DEPARTMENTS
ALTER TABLE departments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authed_select_departments" ON departments;
CREATE POLICY "authed_select_departments" ON departments FOR SELECT
  TO authenticated USING (true);

-- ============================================================
-- RPC FUNCTIONS (auth.uid()-based)
-- ============================================================

CREATE OR REPLACE FUNCTION create_pass(
  p_pass_type text,
  p_reason text,
  p_leaving_datetime timestamptz,
  p_expected_return_datetime timestamptz,
  p_parent_phone text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pass_id uuid;
  v_student users%ROWTYPE;
  v_hod_busy boolean;
  v_initial_status text;
  v_auth_uid uuid := auth.uid();
BEGIN
  IF v_auth_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_student FROM users WHERE auth_id = v_auth_uid AND role = 'STUDENT';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Only students can create pass requests';
  END IF;

  IF p_expected_return_datetime <= p_leaving_datetime THEN
    RAISE EXCEPTION 'Return time must be after leaving time';
  END IF;

  SELECT hod_out_of_office INTO v_hod_busy FROM system_settings WHERE id = 1;
  IF v_hod_busy THEN
    v_initial_status := 'FORWARDED_TG';
  ELSE
    v_initial_status := 'PENDING_HOD';
  END IF;

  INSERT INTO pass_requests (
    student_id, pass_type, reason,
    leaving_datetime, expected_return_datetime, status
  ) VALUES (
    v_student.id, p_pass_type, p_reason,
    p_leaving_datetime, p_expected_return_datetime, v_initial_status
  ) RETURNING id INTO v_pass_id;

  IF p_parent_phone IS NOT NULL AND p_parent_phone <> '' THEN
    UPDATE users SET parent_phone = p_parent_phone WHERE id = v_student.id;
  END IF;

  RETURN v_pass_id;
END;
$$;

CREATE OR REPLACE FUNCTION approve_pass(p_pass_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pass pass_requests%ROWTYPE;
  v_approver users%ROWTYPE;
  v_student users%ROWTYPE;
  v_qr_hash text;
  v_qr_expires timestamptz;
  v_whatsapp_msg text;
  v_pass_type_label text;
  v_short_id text;
  v_auth_uid uuid := auth.uid();
BEGIN
  IF v_auth_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  SELECT * INTO v_approver FROM users WHERE auth_id = v_auth_uid;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'User profile not found');
  END IF;

  SELECT * INTO v_pass FROM pass_requests WHERE id = p_pass_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Pass not found');
  END IF;

  IF v_pass.status NOT IN ('PENDING_HOD', 'FORWARDED_TG') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Pass is ' || v_pass.status);
  END IF;

  IF v_pass.status = 'PENDING_HOD' AND v_approver.role NOT IN ('HOD', 'TG') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only HOD can approve pending requests');
  END IF;

  IF v_pass.status = 'FORWARDED_TG' AND v_approver.role NOT IN ('TG', 'HOD') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only TG can approve forwarded requests');
  END IF;

  SELECT * INTO v_student FROM users WHERE id = v_pass.student_id;

  v_qr_expires := v_pass.expected_return_datetime;
  v_qr_hash := generate_pass_token(p_pass_id, v_pass.student_id, v_qr_expires);

  UPDATE pass_requests SET
    status = 'APPROVED',
    approved_by_user_id = v_approver.id,
    approved_at = now(),
    qr_hash = v_qr_hash,
    qr_expires_at = v_qr_expires
  WHERE id = p_pass_id;

  v_pass_type_label := CASE v_pass.pass_type
    WHEN 'HALF_DAY' THEN 'Half Day'
    WHEN 'SICK_LEAVE' THEN 'Sick Leave'
    WHEN 'FULL_DAY' THEN 'Full Day'
    WHEN 'EMERGENCY_OUTING' THEN 'Emergency Outing'
  END;

  v_short_id := substring(v_pass.id::text, 1, 8);

  v_whatsapp_msg := 'Dear Parent, your ward ' || v_student.name || '''s ' || v_pass_type_label ||
    ' pass has been APPROVED by ' || v_approver.department || ' Dept. Pass ID: #' || v_short_id ||
    '. Gate exit permitted.';

  RETURN jsonb_build_object(
    'success', true, 'pass_id', p_pass_id, 'qr_hash', v_qr_hash,
    'whatsapp_message', v_whatsapp_msg,
    'whatsapp_phone', COALESCE(v_student.parent_phone, '')
  );
END;
$$;

CREATE OR REPLACE FUNCTION reject_pass(p_pass_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pass pass_requests%ROWTYPE;
  v_rejecter users%ROWTYPE;
  v_auth_uid uuid := auth.uid();
BEGIN
  IF v_auth_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  SELECT * INTO v_rejecter FROM users WHERE auth_id = v_auth_uid;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'User profile not found');
  END IF;

  SELECT * INTO v_pass FROM pass_requests WHERE id = p_pass_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Pass not found');
  END IF;

  IF v_pass.status NOT IN ('PENDING_HOD', 'FORWARDED_TG') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Pass is ' || v_pass.status);
  END IF;

  IF v_pass.status = 'PENDING_HOD' AND v_rejecter.role NOT IN ('HOD', 'TG') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only HOD can reject pending requests');
  END IF;

  IF v_pass.status = 'FORWARDED_TG' AND v_rejecter.role NOT IN ('TG', 'HOD') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only TG can reject forwarded requests');
  END IF;

  UPDATE pass_requests SET
    status = 'REJECTED',
    approved_by_user_id = v_rejecter.id,
    approved_at = now()
  WHERE id = p_pass_id;

  RETURN jsonb_build_object('success', true, 'pass_id', p_pass_id);
END;
$$;

CREATE OR REPLACE FUNCTION verify_and_scan(p_qr_hash text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_token_check jsonb;
  v_pass pass_requests%ROWTYPE;
  v_student users%ROWTYPE;
  v_guard users%ROWTYPE;
  v_pass_type_label text;
  v_short_id text;
  v_auth_uid uuid := auth.uid();
BEGIN
  IF v_auth_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  SELECT * INTO v_guard FROM users WHERE auth_id = v_auth_uid AND role = 'GUARD';
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only guards can scan passes');
  END IF;

  v_token_check := verify_pass_token(p_qr_hash);
  IF NOT (v_token_check->>'valid')::boolean THEN
    RETURN jsonb_build_object('success', false, 'error', v_token_check->>'reason');
  END IF;

  SELECT * INTO v_pass FROM pass_requests WHERE qr_hash = p_qr_hash FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'INVALID QR TOKEN');
  END IF;

  IF v_pass.status = 'USED' THEN
    RETURN jsonb_build_object('success', false, 'error', 'ALREADY USED AT ' || to_char(v_pass.scanned_at, 'HH:MI:SS AM on DD Mon'));
  END IF;

  IF v_pass.status = 'EXPIRED' THEN
    RETURN jsonb_build_object('success', false, 'error', 'EXPIRED PASS');
  END IF;

  IF v_pass.status <> 'APPROVED' THEN
    RETURN jsonb_build_object('success', false, 'error', 'PASS NOT APPROVED');
  END IF;

  IF v_pass.qr_expires_at < now() THEN
    UPDATE pass_requests SET status = 'EXPIRED' WHERE id = v_pass.id;
    RETURN jsonb_build_object('success', false, 'error', 'EXPIRED PASS');
  END IF;

  UPDATE pass_requests SET
    status = 'USED', scanned_at = now(), scanned_by_guard_id = v_guard.id
  WHERE id = v_pass.id AND status = 'APPROVED';

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'ALREADY USED');
  END IF;

  SELECT * INTO v_student FROM users WHERE id = v_pass.student_id;

  v_pass_type_label := CASE v_pass.pass_type
    WHEN 'HALF_DAY' THEN 'Half Day' WHEN 'SICK_LEAVE' THEN 'Sick Leave'
    WHEN 'FULL_DAY' THEN 'Full Day' WHEN 'EMERGENCY_OUTING' THEN 'Emergency Outing'
  END;

  v_short_id := substring(v_pass.id::text, 1, 8);

  RETURN jsonb_build_object(
    'success', true, 'pass_id', v_pass.id, 'short_id', v_short_id,
    'student_name', v_student.name, 'student_roll', COALESCE(v_student.roll_number, 'N/A'),
    'student_dept', v_student.department, 'student_photo', COALESCE(v_student.photo_url, ''),
    'pass_type', v_pass_type_label, 'reason', v_pass.reason,
    'leaving_time', to_char(v_pass.leaving_datetime, 'DD Mon YYYY, HH:MI:SS AM'),
    'return_time', to_char(v_pass.expected_return_datetime, 'DD Mon YYYY, HH:MI:SS AM')
  );
END;
$$;

CREATE OR REPLACE FUNCTION signup_user(
  p_name text, p_role text, p_department text, p_roll_number text, p_parent_phone text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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

  INSERT INTO users (name, email, role, department, roll_number, parent_phone, auth_id)
  VALUES (p_name, v_email, p_role, p_department, NULLIF(p_roll_number, ''), NULLIF(p_parent_phone, ''), v_auth_uid)
  RETURNING id INTO v_user_id;

  RETURN v_user_id;
END;
$$;

CREATE OR REPLACE FUNCTION get_current_user()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user users%ROWTYPE;
  v_auth_uid uuid := auth.uid();
BEGIN
  IF v_auth_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  SELECT * INTO v_user FROM users WHERE auth_id = v_auth_uid;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Profile not found');
  END IF;

  RETURN jsonb_build_object('success', true, 'user', row_to_json(v_user));
END;
$$;

-- Grant execute
GRANT EXECUTE ON FUNCTION create_pass TO authenticated;
GRANT EXECUTE ON FUNCTION approve_pass TO authenticated;
GRANT EXECUTE ON FUNCTION reject_pass TO authenticated;
GRANT EXECUTE ON FUNCTION verify_and_scan TO authenticated;
GRANT EXECUTE ON FUNCTION signup_user TO authenticated;
GRANT EXECUTE ON FUNCTION get_current_user TO authenticated;
GRANT EXECUTE ON FUNCTION escalate_pending_passes TO authenticated;
GRANT EXECUTE ON FUNCTION generate_pass_token TO authenticated;
GRANT EXECUTE ON FUNCTION verify_pass_token TO authenticated;
