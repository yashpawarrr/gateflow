import type { PassType, PassStatus, UserRole } from '@/types';

export const PASS_TYPE_LABELS: Record<PassType, string> = {
  HALF_DAY: 'Half Day',
  SICK_LEAVE: 'Sick Leave',
  FULL_DAY: 'Full Day',
  EMERGENCY_OUTING: 'Emergency Outing',
};

export const PASS_TYPE_ICONS: Record<PassType, string> = {
  HALF_DAY: 'Clock',
  SICK_LEAVE: 'Thermometer',
  FULL_DAY: 'Calendar',
  EMERGENCY_OUTING: 'AlertTriangle',
};

export const STATUS_LABELS: Record<PassStatus, string> = {
  PENDING_TG: 'Pending Mentor',
  PENDING_HOD: 'Pending HOD',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  USED: 'Used',
  EXPIRED: 'Expired',
};

export const STATUS_COLORS: Record<PassStatus, { bg: string; text: string; badge: string }> = {
  PENDING_TG: { bg: 'bg-blue-50', text: 'text-blue-700', badge: 'bg-blue-100 text-blue-700 border-blue-200' },
  PENDING_HOD: { bg: 'bg-amber-50', text: 'text-amber-700', badge: 'bg-amber-100 text-amber-700 border-amber-200' },
  APPROVED: { bg: 'bg-emerald-50', text: 'text-emerald-700', badge: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  REJECTED: { bg: 'bg-rose-50', text: 'text-rose-700', badge: 'bg-rose-100 text-rose-700 border-rose-200' },
  USED: { bg: 'bg-emerald-50', text: 'text-emerald-700', badge: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  EXPIRED: { bg: 'bg-rose-50', text: 'text-rose-700', badge: 'bg-rose-100 text-rose-700 border-rose-200' },
};

export const ROLE_LABELS: Record<UserRole, string> = {
  STUDENT: 'Student',
  HOD: 'Head of Dept',
  TG: 'Teacher Guardian',
  GUARD: 'Security Guard',
  STAFF: 'Staff Member',
};

export const ROLE_COLORS: Record<UserRole, string> = {
  STUDENT: 'text-indigo-600',
  HOD: 'text-emerald-600',
  TG: 'text-amber-600',
  GUARD: 'text-rose-600',
  STAFF: 'text-cyan-600',
};

export const MONTHLY_LEAVE_LIMIT = 4;
