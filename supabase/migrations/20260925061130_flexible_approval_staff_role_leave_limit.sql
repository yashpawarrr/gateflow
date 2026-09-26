/*
# Flexible Approval Flow + Staff Role + Monthly Leave Limit

## Summary
1. TG approval now directly approves student passes (no mandatory HOD step).
   If TG doesn't act within 5 minutes, the request auto-escalates to HOD.
2. TG/Faculty leave requests still go directly to HOD (unchanged).
3. New STAFF role added — staff members (scholarship, library, transport, etc.)
   can request leave, which goes directly to HOD.
4. Monthly leave limit: max 4 leaves per user per calendar month.

## Changes

### `create_pass` function
- Now accepts STUDENT, TG, and STAFF roles.
- STUDENT → starts at PENDING_TG (mentor first, escalates to HOD after 5 min).
- TG → starts at PENDING_HOD (direct to HOD).
- STAFF → starts at PENDING_HOD (direct to HOD).
- Enforces monthly leave limit of 4 per user.

### `approve_pass` function
- TG approving PENDING_TG → directly APPROVED (generates QR, sends WhatsApp).
  Previously this forwarded to PENDING_HOD. Now TG has full authority.
- HOD approving PENDING_HOD → APPROVED (unchanged).
- HOD can also approve PENDING_TG directly (override).

### `reject_pass` function
- Updated to allow STAFF role rejections at PENDING_HOD stage.

### `escalate_pending_passes` function
- Unchanged: escalates PENDING_TG → PENDING_HOD after timeout.

### No schema changes needed
- Uses existing pass_requests table and system_settings.
- Leave limit is enforced in the function, not stored as a separate column.

## Security
- No RLS policy changes.
- All functions remain SECURITY DEFINER with search_path = public.
*/

CREATE OR REPLACE FUNCTION public.create_pass(
  p_pass_type text,
  p_reason text,
  p_leaving_datetime timestamp with time zone,
  p_expected_return_datetime timestamp with time zone,
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
  v_month_count int;
BEGIN
  IF v_auth_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_student FROM users WHERE auth_id = v_auth_uid;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'User profile not found';
  END IF;

  IF v_student.role NOT IN ('STUDENT', 'TG', 'STAFF') THEN
    RAISE EXCEPTION 'Only students, teachers, and staff can request passes';
  END IF;

  -- Enforce monthly leave limit: max 4 per user per calendar month
  SELECT count(*) INTO v_month_count
  FROM pass_requests
  WHERE student_id = v_student.id
    AND status IN ('APPROVED', 'USED', 'EXPIRED', 'PENDING_TG', 'PENDING_HOD')
    AND date_trunc('month', created_at) = date_trunc('month', now());

  IF v_month_count >= 4 THEN
    RAISE EXCEPTION 'Monthly leave limit reached. You have already used 4 leaves this month.';
  END IF;

  -- Students start at PENDING_TG (mentor first, escalates to HOD after 5 min)
  -- TG and STAFF start at PENDING_HOD (direct to HOD)
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

  -- TG approves PENDING_TG → directly APPROVED (full authority)
  IF v_pass.status = 'PENDING_TG' THEN
    IF v_approver.role NOT IN ('TG', 'HOD') THEN
      RETURN jsonb_build_object('success', false, 'error', 'Only TG can approve mentor-stage requests');
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

  -- HOD approves PENDING_HOD → APPROVED (generates QR)
  IF v_pass.status = 'PENDING_HOD' THEN
    IF v_approver.role NOT IN ('HOD') THEN
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

  IF v_pass.status = 'PENDING_HOD' AND v_rejecter.role NOT IN ('HOD') THEN
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
