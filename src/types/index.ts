export type UserRole = 'STUDENT' | 'HOD' | 'TG' | 'GUARD' | 'STAFF';

export type PassType = 'HALF_DAY' | 'SICK_LEAVE' | 'FULL_DAY' | 'EMERGENCY_OUTING';

export type PassStatus =
  | 'PENDING_TG'
  | 'PENDING_HOD'
  | 'APPROVED'
  | 'REJECTED'
  | 'USED'
  | 'EXPIRED';

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  department: string;
  roll_number: string | null;
  parent_phone: string | null;
  phone: string | null;
  semester: number | null;
  year: number | null;
  hod_name: string | null;
  hod_phone: string | null;
  tg_name: string | null;
  tg_phone: string | null;
  photo_url: string | null;
  created_at: string;
}

export interface PassRequest {
  id: string;
  student_id: string;
  pass_type: PassType;
  reason: string;
  leaving_datetime: string;
  expected_return_datetime: string;
  status: PassStatus;
  approved_by_user_id: string | null;
  approved_at: string | null;
  qr_hash: string | null;
  qr_expires_at: string | null;
  scanned_at: string | null;
  scanned_by_guard_id: string | null;
  created_at: string;
  student?: User;
  approver?: User;
}

export interface SystemSettings {
  id: number;
  hod_out_of_office: boolean;
  auto_escalate_minutes: number;
}

export interface ApproveResult {
  success: boolean;
  pass_id?: string;
  qr_hash?: string;
  whatsapp_message?: string;
  whatsapp_phone?: string;
  error?: string;
}

export interface ScanResult {
  success: boolean;
  pass_id?: string;
  short_id?: string;
  student_name?: string;
  student_roll?: string;
  student_dept?: string;
  student_photo?: string;
  pass_type?: string;
  reason?: string;
  leaving_time?: string;
  return_time?: string;
  error?: string;
}
