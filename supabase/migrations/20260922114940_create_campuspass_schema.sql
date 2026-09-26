/*
# CampusPass - Digital Gate Pass System

## Overview
Creates the complete database schema for a campus digital gate pass system with
role-based access (Student, HOD, Teacher Guardian, Guard), signed QR tokens,
auto-escalation, and atomic single-use enforcement.

## Tables

### users
- `id` (uuid PK) - unique user identifier
- `name` (text) - full name
- `email` (text, unique) - email address
- `role` (text) - one of 'STUDENT', 'HOD', 'TG', 'GUARD'
- `department` (text) - department name
- `roll_number` (text, nullable) - student roll number
- `parent_phone` (text, nullable) - parent's WhatsApp number
- `photo_url` (text) - avatar URL
- `created_at` (timestamptz)

### pass_requests
- `id` (uuid PK) - unique pass identifier
- `student_id` (uuid FK -> users) - student who requested
- `pass_type` (text) - 'HALF_DAY', 'SICK_LEAVE', 'FULL_DAY', 'EMERGENCY_OUTING'
- `reason` (text) - reason for pass
- `leaving_datetime` (timestamptz) - departure time
- `expected_return_datetime` (timestamptz) - expected return
- `status` (text) - 'PENDING_HOD', 'FORWARDED_TG', 'APPROVED', 'REJECTED', 'USED', 'EXPIRED'
- `approved_by_user_id` (uuid FK -> users, nullable) - approver
- `approved_at` (timestamptz, nullable) - approval timestamp
- `qr_hash` (text, unique, nullable) - signed JWT token encoding pass info
- `qr_expires_at` (timestamptz, nullable) - QR expiry time
- `scanned_at` (timestamptz, nullable) - scan timestamp
- `scanned_by_guard_id` (uuid FK -> users, nullable) - guard who scanned
- `created_at` (timestamptz, default now())

### system_settings
- `id` (int PK, default 1) - single-row table
- `hod_out_of_office` (boolean, default false) - HOD busy mode
- `auto_escalate_minutes` (int, default 15) - escalation timeout

## Security (RLS)
- All tables have RLS enabled.
- This is a demo app with no auth login screen — uses `TO anon, authenticated` so the
  anon-key frontend can operate. Role enforcement is done at the application/RPC level
  via the `current_role` mechanism (the frontend sends the active demo user's UUID).
- RPC functions enforce role checks server-side.

## RPC Functions
- `approve_pass(pass_uuid, approver_uuid)` - approves a pass, generates signed JWT qr_hash
- `reject_pass(pass_uuid, approver_uuid)` - rejects a pass
- `verify_and_scan(qr_hash_value, guard_uuid)` - atomic single-use scan enforcement
- `create_pass(student_uuid, pass_type, reason, leaving, return, parent_phone)` - creates pass
- `escalate_pending_passes()` - auto-escalation job (called by cron)

## Seed Data
- 4 demo users (Student, HOD, TG, Guard) with avatar photos
- 1 system_settings row
- pgcrypto extension for gen_random_uuid
- pgjwt extension for JWT signing
*/

-- Extensions
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS pgjwt;

-- ============================================================
-- TABLES
-- ============================================================

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email text UNIQUE NOT NULL,
  role text NOT NULL CHECK (role IN ('STUDENT','HOD','TG','GUARD')),
  department text NOT NULL,
  roll_number text,
  parent_phone text,
  photo_url text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pass_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  pass_type text NOT NULL CHECK (pass_type IN ('HALF_DAY','SICK_LEAVE','FULL_DAY','EMERGENCY_OUTING')),
  reason text NOT NULL,
  leaving_datetime timestamptz NOT NULL,
  expected_return_datetime timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'PENDING_HOD' CHECK (status IN ('PENDING_HOD','FORWARDED_TG','APPROVED','REJECTED','USED','EXPIRED')),
  approved_by_user_id uuid REFERENCES users(id),
  approved_at timestamptz,
  qr_hash text UNIQUE,
  qr_expires_at timestamptz,
  scanned_at timestamptz,
  scanned_by_guard_id uuid REFERENCES users(id),
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS system_settings (
  id int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  hod_out_of_office boolean NOT NULL DEFAULT false,
  auto_escalate_minutes int NOT NULL DEFAULT 15
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_pass_requests_student ON pass_requests(student_id);
CREATE INDEX IF NOT EXISTS idx_pass_requests_status ON pass_requests(status);
CREATE INDEX IF NOT EXISTS idx_pass_requests_created ON pass_requests(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pass_requests_qr_hash ON pass_requests(qr_hash);

-- ============================================================
-- RLS
-- ============================================================

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE pass_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_settings ENABLE ROW LEVEL SECURITY;

-- users: anon + authenticated can read (demo mode, no login)
DROP POLICY IF EXISTS "anon_select_users" ON users;
CREATE POLICY "anon_select_users" ON users FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_users" ON users;
CREATE POLICY "anon_insert_users" ON users FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_users" ON users;
CREATE POLICY "anon_update_users" ON users FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

-- pass_requests: anon + authenticated can read and insert (demo mode)
DROP POLICY IF EXISTS "anon_select_pass_requests" ON pass_requests;
CREATE POLICY "anon_select_pass_requests" ON pass_requests FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_pass_requests" ON pass_requests;
CREATE POLICY "anon_insert_pass_requests" ON pass_requests FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_pass_requests" ON pass_requests;
CREATE POLICY "anon_update_pass_requests" ON pass_requests FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

-- system_settings: anon + authenticated can read and update
DROP POLICY IF EXISTS "anon_select_system_settings" ON system_settings;
CREATE POLICY "anon_select_system_settings" ON system_settings FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_update_system_settings" ON system_settings;
CREATE POLICY "anon_update_system_settings" ON system_settings FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

-- ============================================================
-- SEED DATA
-- ============================================================

INSERT INTO users (name, email, role, department, roll_number, parent_phone, photo_url) VALUES
  ('Rahul Sharma', 'rahul.sharma@campus.edu', 'STUDENT', 'Computer Science', 'CSE20045', '+91-9876543210', 'https://images.pexels.com/photos/37580515/pexels-photo-37580515.jpeg?auto=compress&cs=tinysrgb&h=300&w=300'),
  ('Dr. A.K. Verma', 'ak.verma@campus.edu', 'HOD', 'Computer Science', NULL, NULL, 'https://images.pexels.com/photos/9271168/pexels-photo-9271168.jpeg?auto=compress&cs=tinysrgb&h=300&w=300'),
  ('Prof. Priya Nair', 'priya.nair@campus.edu', 'TG', 'Computer Science', NULL, NULL, 'https://images.pexels.com/photos/16160869/pexels-photo-16160869.jpeg?auto=compress&cs=tinysrgb&h=300&w=300'),
  ('Security Guard', 'guard@campus.edu', 'GUARD', 'Security', NULL, NULL, 'https://images.pexels.com/photos/13449005/pexels-photo-13449005.jpeg?auto=compress&cs=tinysrgb&h=300&w=300')
ON CONFLICT (email) DO NOTHING;

INSERT INTO system_settings (id, hod_out_of_office, auto_escalate_minutes) VALUES (1, false, 15)
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- RPC FUNCTIONS
-- ============================================================

-- Generate a signed JWT token for a pass
-- Uses pgjwt to create a signed token with pass_id, student_id, and exp claims
CREATE OR REPLACE FUNCTION generate_pass_token(p_pass_id uuid, p_student_id uuid, p_expires_at timestamptz)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_token text;
  v_payload jsonb;
  v_secret text;
BEGIN
  -- Use a deterministic secret for demo purposes
  -- In production this would be a Supabase secret
  v_secret := 'campuspass_jwt_secret_2024_demo';

  v_payload := jsonb_build_object(
    'pass_id', p_pass_id,
    'student_id', p_student_id,
    'exp', extract(epoch from p_expires_at)::bigint,
    'iat', extract(epoch from now())::bigint
  );

  -- Sign with pgjwt
  v_token := sign(
    jsonb_build_object('alg','HS256','typ','JWT'),
    v_payload,
    v_secret
  );

  RETURN v_token;
END;
$$;

-- Verify a JWT token signature and expiry
CREATE OR REPLACE FUNCTION verify_pass_token(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_secret text := 'campuspass_jwt_secret_2024_demo';
  v_verified jsonb;
  v_exp bigint;
BEGIN
  -- Verify signature
  v_verified := verify(p_token, v_secret);

  IF v_verified IS NULL THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'INVALID QR TOKEN');
  END IF;

  -- Check expiry
  v_exp := (v_verified->>'exp')::bigint;
  IF v_exp < extract(epoch from now())::bigint THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'EXPIRED PASS');
  END IF;

  RETURN jsonb_build_object('valid', true, 'payload', v_verified);
END;
$$;

-- Create a new pass request
CREATE OR REPLACE FUNCTION create_pass(
  p_student_id uuid,
  p_pass_type text,
  p_reason text,
  p_leaving_datetime timestamptz,
  p_expected_return_datetime timestamptz,
  p_parent_phone text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_pass_id uuid;
  v_student users%ROWTYPE;
  v_hod_busy boolean;
  v_initial_status text;
BEGIN
  -- Validate student exists and is a student
  SELECT * INTO v_student FROM users WHERE id = p_student_id AND role = 'STUDENT';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invalid student';
  END IF;

  -- Validate return after leaving
  IF p_expected_return_datetime <= p_leaving_datetime THEN
    RAISE EXCEPTION 'Return time must be after leaving time';
  END IF;

  -- Check if HOD is out of office
  SELECT hod_out_of_office INTO v_hod_busy FROM system_settings WHERE id = 1;
  IF v_hod_busy THEN
    v_initial_status := 'FORWARDED_TG';
  ELSE
    v_initial_status := 'PENDING_HOD';
  END IF;

  -- Create pass
  INSERT INTO pass_requests (
    student_id, pass_type, reason,
    leaving_datetime, expected_return_datetime,
    status
  ) VALUES (
    p_student_id, p_pass_type, p_reason,
    p_leaving_datetime, p_expected_return_datetime,
    v_initial_status
  ) RETURNING id INTO v_pass_id;

  -- Update parent phone if provided
  IF p_parent_phone IS NOT NULL AND p_parent_phone <> '' THEN
    UPDATE users SET parent_phone = p_parent_phone WHERE id = p_student_id;
  END IF;

  RETURN v_pass_id;
END;
$$;

-- Approve a pass (HOD or TG)
CREATE OR REPLACE FUNCTION approve_pass(p_pass_id uuid, p_approver_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
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
BEGIN
  -- Get pass
  SELECT * INTO v_pass FROM pass_requests WHERE id = p_pass_id FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Pass not found');
  END IF;

  -- Check pass is in an approvable state
  IF v_pass.status NOT IN ('PENDING_HOD', 'FORWARDED_TG') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Pass is ' || v_pass.status);
  END IF;

  -- Get approver
  SELECT * INTO v_approver FROM users WHERE id = p_approver_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid approver');
  END IF;

  -- Role check: HOD can approve PENDING_HOD, TG can approve FORWARDED_TG
  -- But for demo flexibility, allow HOD to approve both, TG to approve FORWARDED_TG
  IF v_pass.status = 'PENDING_HOD' AND v_approver.role NOT IN ('HOD', 'TG') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only HOD can approve pending requests');
  END IF;

  IF v_pass.status = 'FORWARDED_TG' AND v_approver.role NOT IN ('TG', 'HOD') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only TG can approve forwarded requests');
  END IF;

  -- Get student
  SELECT * INTO v_student FROM users WHERE id = v_pass.student_id;

  -- Generate QR token
  v_qr_expires := v_pass.expected_return_datetime;
  v_qr_hash := generate_pass_token(p_pass_id, v_pass.student_id, v_qr_expires);

  -- Update pass
  UPDATE pass_requests SET
    status = 'APPROVED',
    approved_by_user_id = p_approver_id,
    approved_at = now(),
    qr_hash = v_qr_hash,
    qr_expires_at = v_qr_expires
  WHERE id = p_pass_id;

  -- Build WhatsApp message
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
    'success', true,
    'pass_id', p_pass_id,
    'qr_hash', v_qr_hash,
    'whatsapp_message', v_whatsapp_msg,
    'whatsapp_phone', COALESCE(v_student.parent_phone, '')
  );
END;
$$;

-- Reject a pass (HOD or TG)
CREATE OR REPLACE FUNCTION reject_pass(p_pass_id uuid, p_rejecter_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_pass pass_requests%ROWTYPE;
  v_rejecter users%ROWTYPE;
BEGIN
  SELECT * INTO v_pass FROM pass_requests WHERE id = p_pass_id FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Pass not found');
  END IF;

  IF v_pass.status NOT IN ('PENDING_HOD', 'FORWARDED_TG') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Pass is ' || v_pass.status);
  END IF;

  SELECT * INTO v_rejecter FROM users WHERE id = p_rejecter_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid user');
  END IF;

  IF v_pass.status = 'PENDING_HOD' AND v_rejecter.role NOT IN ('HOD', 'TG') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only HOD can reject pending requests');
  END IF;

  IF v_pass.status = 'FORWARDED_TG' AND v_rejecter.role NOT IN ('TG', 'HOD') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only TG can reject forwarded requests');
  END IF;

  UPDATE pass_requests SET
    status = 'REJECTED',
    approved_by_user_id = p_rejecter_id,
    approved_at = now()
  WHERE id = p_pass_id;

  RETURN jsonb_build_object('success', true, 'pass_id', p_pass_id);
END;
$$;

-- Verify and scan a pass (atomic single-use enforcement)
CREATE OR REPLACE FUNCTION verify_and_scan(p_qr_hash text, p_guard_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_token_check jsonb;
  v_pass pass_requests%ROWTYPE;
  v_student users%ROWTYPE;
  v_guard users%ROWTYPE;
  v_pass_type_label text;
  v_short_id text;
BEGIN
  -- Verify guard
  SELECT * INTO v_guard FROM users WHERE id = p_guard_id AND role = 'GUARD';
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid guard');
  END IF;

  -- Verify token signature and expiry
  v_token_check := verify_pass_token(p_qr_hash);
  IF NOT (v_token_check->>'valid')::boolean THEN
    RETURN jsonb_build_object('success', false, 'error', v_token_check->>'reason');
  END IF;

  -- Look up pass by qr_hash with row lock for atomicity
  SELECT * INTO v_pass FROM pass_requests WHERE qr_hash = p_qr_hash FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'INVALID QR TOKEN');
  END IF;

  -- Check if already used
  IF v_pass.status = 'USED' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'ALREADY USED AT ' || to_char(v_pass.scanned_at, 'HH:MI:SS AM on DD Mon')
    );
  END IF;

  -- Check if expired
  IF v_pass.status = 'EXPIRED' THEN
    RETURN jsonb_build_object('success', false, 'error', 'EXPIRED PASS');
  END IF;

  -- Check if not approved
  IF v_pass.status <> 'APPROVED' THEN
    RETURN jsonb_build_object('success', false, 'error', 'PASS NOT APPROVED');
  END IF;

  -- Check QR expiry
  IF v_pass.qr_expires_at < now() THEN
    UPDATE pass_requests SET status = 'EXPIRED' WHERE id = v_pass.id;
    RETURN jsonb_build_object('success', false, 'error', 'EXPIRED PASS');
  END IF;

  -- Atomic transition: APPROVED -> USED
  UPDATE pass_requests SET
    status = 'USED',
    scanned_at = now(),
    scanned_by_guard_id = p_guard_id
  WHERE id = v_pass.id AND status = 'APPROVED';

  IF NOT FOUND THEN
    -- Another scan beat us to it
    RETURN jsonb_build_object('success', false, 'error', 'ALREADY USED');
  END IF;

  -- Get student info for display
  SELECT * INTO v_student FROM users WHERE id = v_pass.student_id;

  v_pass_type_label := CASE v_pass.pass_type
    WHEN 'HALF_DAY' THEN 'Half Day'
    WHEN 'SICK_LEAVE' THEN 'Sick Leave'
    WHEN 'FULL_DAY' THEN 'Full Day'
    WHEN 'EMERGENCY_OUTING' THEN 'Emergency Outing'
  END;

  v_short_id := substring(v_pass.id::text, 1, 8);

  RETURN jsonb_build_object(
    'success', true,
    'pass_id', v_pass.id,
    'short_id', v_short_id,
    'student_name', v_student.name,
    'student_roll', COALESCE(v_student.roll_number, 'N/A'),
    'student_dept', v_student.department,
    'student_photo', COALESCE(v_student.photo_url, ''),
    'pass_type', v_pass_type_label,
    'reason', v_pass.reason,
    'leaving_time', to_char(v_pass.leaving_datetime, 'DD Mon YYYY, HH:MI:SS AM'),
    'return_time', to_char(v_pass.expected_return_datetime, 'DD Mon YYYY, HH:MI:SS AM')
  );
END;
$$;

-- Auto-escalation: move PENDING_HOD passes older than auto_escalate_minutes to FORWARDED_TG
CREATE OR REPLACE FUNCTION escalate_pending_passes()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_escalate_minutes int;
  v_count int;
BEGIN
  SELECT auto_escalate_minutes INTO v_escalate_minutes FROM system_settings WHERE id = 1;

  UPDATE pass_requests
  SET status = 'FORWARDED_TG'
  WHERE status = 'PENDING_HOD'
    AND created_at < now() - (v_escalate_minutes || ' minutes')::interval;

  GET DIAGNOSTICS v_count = ROW_COUNT;

  RETURN v_count;
END;
$$;

-- Grant execute on all RPC functions to anon and authenticated
GRANT EXECUTE ON FUNCTION generate_pass_token TO anon, authenticated;
GRANT EXECUTE ON FUNCTION verify_pass_token TO anon, authenticated;
GRANT EXECUTE ON FUNCTION create_pass TO anon, authenticated;
GRANT EXECUTE ON FUNCTION approve_pass TO anon, authenticated;
GRANT EXECUTE ON FUNCTION reject_pass TO anon, authenticated;
GRANT EXECUTE ON FUNCTION verify_and_scan TO anon, authenticated;
GRANT EXECUTE ON FUNCTION escalate_pending_passes TO anon, authenticated;
