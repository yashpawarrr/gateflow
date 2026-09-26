import { STATUS_LABELS, STATUS_COLORS } from '@/lib/constants';
import type { PassStatus } from '@/types';

export function StatusBadge({ status }: { status: PassStatus }) {
  const colors = STATUS_COLORS[status];
  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold border ${colors.badge}`}>
      {STATUS_LABELS[status]}
    </span>
  );
}
