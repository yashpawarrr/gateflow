/*
# Hierarchical Approval Flow + Scanner Fix

## Changes

### 1. New Approval Hierarchy
- Student leave requests now go to TG (mentor) first, then to HOD
- TG/teacher leave requests go directly to HOD
- Old flow: Student → HOD → (escalate to) TG
- New flow: Student → TG → HOD → Approved

### 2. New Status Values
- PENDING_TG: Student request awaiting TG (mentor) approval
- PENDING_HOD: Request (from TG approval or direct TG request) awaiting HOD approval
- APPROVED, REJECTED, USED, EXPIRED remain
- FORWARDED_TG removed (replaced by PENDING_TG)

### 3. Scanner Fix
- verify_and_scan now accepts p_guard_auth_uid parameter so the edge function
  can pass the guard's auth UID (extracted from the JWT) instead of relying
  on auth.uid() which returns NULL with the service role key.

### 4. Updated Functions
- create_pass: Student requests start as PENDING_TG; TG requests start as PENDING_HOD
- approve_pass: TG approves PENDING_TG → moves to PENDING_HOD; HOD approves PENDING_HOD → APPROVED
- reject_pass: Works for both PENDING_TG and PENDING_HOD
- escalate_pending_passes: Now escalates PENDING_TG → PENDING_HOD (not PENDING_HOD → FORWARDED_TG)
- verify_and_scan: Accepts guard auth UID as parameter

### 5. Updated Constraint
- pass_requests status CHECK constraint updated to new status values
*/

-- Update status constraint
ALTER TABLE pass_requests DROP CONSTRAINT IF EXISTS pass_requests_status_check;
ALTER TABLE pass_requests ADD CONSTRAINT pass_requests_status_check
  CHECK (status = ANY (ARRAY['PENDING_TG'::text, 'PENDING_HOD'::text, 'APPROVED'::text, 'REJECTED'::text, 'USED'::text, 'EXPIRED'::text]));

-- Migrate existing data
UPDATE pass_requests SET status = 'PENDING_TG' WHERE status = 'PENDING_HOD' AND student_id IN (SELECT id FROM users WHERE role = 'STUDENT');
UPDATE pass_requests SET status = 'PENDING_HOD' WHERE status = 'FORWARDED_TG';
UPDATE pass_requests SET status = 'PENDING_HOD' WHERE status = 'PENDING_HOD' AND student_id IN (SELECT id FROM users WHERE role != 'STUDENT');

-- Change default status from PENDING_HOD to PENDING_TG
ALTER TABLE pass_requests ALTER COLUMN status SET DEFAULT 'PENDING_TG';

-- Update create_pass function
CREATE OR REPLACE FUNCTION public.create_pass(
  p_pass_type text,
  p_reason text,
  p_leaving_datetime timestamptz,
  p_expected_return_datetime timestamptz,
  p_parent_phone text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_pass_id uuid;
  v_student users%ROWTYPE;
  v_auth_uid uuid := auth.uid();
  v_initial_status text;
BEGIN
  IF v_auth_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_student FROM users WHERE auth_id = v_auth_uid;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'User profile not found';
  END IF;

  IF v_student.role NOT IN ('STUDENT', 'TG') THEN
    RAISE EXCEPTION 'Only students and teachers can request passes';
  END IF;

  -- Students start at PENDING_TG (mentor first), TGs start at PENDING_HOD (direct to HOD)
  IF v_student.role = 'STUDENT' THEN
    v_initial_status := 'PENDING_TG';
  ELSE
    v_initial_status := 'PENDING_HOD';
  END IF;

  INSERT INTO pass_requests (
    student_id, pass_type, reason,
    leaving_datetime, expected_return_datetime,
    status
  )
  VALUES (
    v_student.id, p_pass_type, p_reason,
    p_leaving_datetime, p_expected_return_datetime,
    v_initial_status
  )
  RETURNING id INTO v_pass_id;

  IF p_parent_phone IS NOT NULL AND p_parent_phone != '' THEN
    UPDATE users SET parent_phone = p_parent_phone WHERE id = v_student.id;
  END IF;

  RETURN v_pass_id;
END;
$function$;

-- Update approve_pass: TG approves PENDING_TG → PENDING_HOD; HOD approves PENDING_HOD → APPROVED
CREATE OR REPLACE FUNCTION public.approve_pass(p_pass_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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

  -- TG approves PENDING_TG → moves to PENDING_HOD
  IF v_pass.status = 'PENDING_TG' THEN
    IF v_approver.role NOT IN ('TG', 'HOD') THEN
      RETURN jsonb_build_object('success', false, 'error', 'Only TG can approve mentor-stage requests');
    END IF;

    UPDATE pass_requests SET
      status = 'PENDING_HOD',
      approved_by_user_id = v_approver.id,
      approved_at = now()
    WHERE id = p_pass_id;

    RETURN jsonb_build_object(
      'success', true,
      'pass_id', p_pass_id,
      'message', 'Forwarded to HOD for final approval'
    );
  END IF;

  -- HOD approves PENDING_HOD → APPROVED (generates QR)
  IF v_pass.status = 'PENDING_HOD' THEN
    IF v_approver.role NOT IN ('HOD', 'TG') THEN
      RETURN jsonb_build_object('success', false, 'error', 'Only HOD can approve at this stage');
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
      'success', true,
      'pass_id', p_pass_id,
      'qr_hash', v_qr_hash,
      'whatsapp_message', v_whatsapp_msg,
      'whatsapp_phone', COALESCE(v_student.parent_phone, '')
    );
  END IF;

  RETURN jsonb_build_object('success', false, 'error', 'Pass is ' || v_pass.status);
END;
$function$;

-- Update reject_pass: works for both PENDING_TG and PENDING_HOD
CREATE OR REPLACE FUNCTION public.reject_pass(p_pass_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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

  IF v_pass.status NOT IN ('PENDING_TG', 'PENDING_HOD') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Pass is ' || v_pass.status);
  END IF;

  IF v_pass.status = 'PENDING_TG' AND v_rejecter.role NOT IN ('TG', 'HOD') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only TG can reject mentor-stage requests');
  END IF;

  IF v_pass.status = 'PENDING_HOD' AND v_rejecter.role NOT IN ('HOD', 'TG') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only HOD can reject at this stage');
  END IF;

  UPDATE pass_requests SET
    status = 'REJECTED',
    approved_by_user_id = v_rejecter.id,
    approved_at = now()
  WHERE id = p_pass_id;

  RETURN jsonb_build_object('success', true, 'pass_id', p_pass_id);
END;
$function$;

-- Update escalate_pending_passes: PENDING_TG → PENDING_HOD (skip mentor if too slow)
CREATE OR REPLACE FUNCTION public.escalate_pending_passes()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_escalate_minutes int;
  v_count int;
BEGIN
  SELECT auto_escalate_minutes INTO v_escalate_minutes FROM system_settings WHERE id = 1;

  UPDATE pass_requests
  SET status = 'PENDING_HOD'
  WHERE status = 'PENDING_TG'
  AND created_at < now() - (v_escalate_minutes || ' minutes')::interval;

  GET DIAGNOSTICS v_count = ROW_COUNT;

  RETURN v_count;
END;
$function$;

-- Update verify_and_scan to accept guard auth UID as parameter
CREATE OR REPLACE FUNCTION public.verify_and_scan(p_qr_hash text, p_guard_auth_uid uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_token_check jsonb;
  v_pass pass_requests%ROWTYPE;
  v_student users%ROWTYPE;
  v_guard users%ROWTYPE;
  v_pass_type_label text;
  v_short_id text;
  v_auth_uid uuid;
BEGIN
  -- Use parameter if provided (from edge function), otherwise fall back to auth.uid()
  v_auth_uid := COALESCE(p_guard_auth_uid, auth.uid());

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
$function$;
