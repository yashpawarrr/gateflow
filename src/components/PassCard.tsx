import { CheckCircle, XCircle, Clock, Calendar, AlertTriangle, Thermometer, User } from 'lucide-react';
import { StatusBadge } from '@/components/StatusBadge';
import { PASS_TYPE_LABELS } from '@/lib/constants';
import { formatDateTime } from '@/lib/time';
import type { PassRequest } from '@/types';

const PASS_TYPE_ICON: Record<string, typeof Clock> = {
  HALF_DAY: Clock,
  SICK_LEAVE: Thermometer,
  FULL_DAY: Calendar,
  EMERGENCY_OUTING: AlertTriangle,
};

interface PassCardProps {
  pass: PassRequest;
  children?: React.ReactNode;
  showStudent?: boolean;
  selected?: boolean;
  onSelect?: (id: string) => void;
  showApprover?: boolean;
}

export function PassCard({ pass, children, showStudent, selected, onSelect, showApprover }: PassCardProps) {
  const Icon = PASS_TYPE_ICON[pass.pass_type] || Clock;
  const shortId = pass.id.substring(0, 8);

  return (
    <div
      className={`bg-white rounded-xl border shadow-sm transition-all ${
        selected ? 'border-indigo-400 ring-2 ring-indigo-100' : 'border-slate-200 hover:shadow-md'
      }`}
    >
      <div className="p-4">
        <div className="flex items-start gap-3">
          {/* Checkbox for bulk selection */}
          {onSelect && (
            <input
              type="checkbox"
              checked={selected || false}
              onChange={() => onSelect(pass.id)}
              className="mt-1 w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
            />
          )}

          {/* Student photo */}
          {showStudent && pass.student && (
            <div className="flex-shrink-0">
              {pass.student.photo_url ? (
                <img
                  src={pass.student.photo_url}
                  alt={pass.student.name}
                  className="w-12 h-12 rounded-full object-cover ring-2 ring-slate-100"
                />
              ) : (
                <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center">
                  <User className="w-5 h-5 text-slate-400" />
                </div>
              )}
            </div>
          )}

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2 mb-2">
              <div className="min-w-0">
                {showStudent && pass.student && (
                  <p className="text-sm font-bold text-slate-800 truncate">
                    {pass.student.name}
                  </p>
                )}
                {showStudent && pass.student?.roll_number && (
                  <p className="text-xs text-slate-500">{pass.student.roll_number}</p>
                )}
                <div className="flex items-center gap-1.5 mt-1">
                  <Icon className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                  <span className="text-xs font-medium text-slate-600">
                    {PASS_TYPE_LABELS[pass.pass_type]}
                  </span>
                  <span className="text-xs text-slate-300">·</span>
                  <span className="text-xs text-slate-400">#{shortId}</span>
                </div>
              </div>
              <StatusBadge status={pass.status} />
            </div>

            <p className="text-sm text-slate-600 mb-2 line-clamp-2">{pass.reason}</p>

            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
              <span className="flex items-center gap-1">
                <Calendar className="w-3 h-3" />
                {formatDateTime(pass.leaving_datetime)}
              </span>
            </div>

            {showApprover && pass.approver && (
              <div className="flex items-center gap-1.5 mt-2 text-xs text-emerald-600">
                <CheckCircle className="w-3.5 h-3.5" />
                <span>Approved by {pass.approver.name}</span>
              </div>
            )}
            {pass.status === 'REJECTED' && pass.approver && (
              <div className="flex items-center gap-1.5 mt-2 text-xs text-rose-600">
                <XCircle className="w-3.5 h-3.5" />
                <span>Rejected by {pass.approver.name}</span>
              </div>
            )}
          </div>
        </div>

        {children && <div className="mt-3 pt-3 border-t border-slate-100">{children}</div>}
      </div>
    </div>
  );
}
