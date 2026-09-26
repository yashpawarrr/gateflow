import { useState } from 'react';
import { Clock, Send, Calendar, AlertTriangle, CheckCircle, QrCode, Copy, Check } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { supabase } from '@/lib/supabase';
import { useApp } from '@/context/AppContext';
import { useClock, formatTime, formatCountdown, formatDateTime } from '@/lib/time';
import { PASS_TYPE_LABELS } from '@/lib/constants';
import { MONTHLY_LEAVE_LIMIT } from '@/lib/constants';
import { PassCard } from '@/components/PassCard';
import type { PassType, PassRequest } from '@/types';

const PASS_TYPES: PassType[] = ['HALF_DAY', 'SICK_LEAVE', 'FULL_DAY', 'EMERGENCY_OUTING'];

export function StaffDashboard() {
  const { currentUser, passes, refreshPasses } = useApp();
  const now = useClock();

  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const [passType, setPassType] = useState<PassType>('HALF_DAY');
  const [reason, setReason] = useState('');
  const [leavingTime, setLeavingTime] = useState('');
  const [returnTime, setReturnTime] = useState('');

  if (!currentUser) return null;

  const myPasses = passes.filter((p) => p.student_id === currentUser.id);
  const activePass = myPasses.find(
    (p) => p.status === 'APPROVED' && p.qr_hash && p.qr_expires_at && new Date(p.qr_expires_at) > now
  );
  const pastPasses = myPasses.filter((p) => p.id !== activePass?.id);

  const currentMonth = new Date().getMonth();
  const currentYear = new Date().getFullYear();
  const leavesThisMonth = myPasses.filter((p) => {
    const d = new Date(p.created_at);
    return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
  }).length;
  const remainingLeaves = MONTHLY_LEAVE_LIMIT - leavesThisMonth;

  function validate(): boolean {
    setError('');
    if (!reason.trim()) {
      setError('Please provide a reason for your leave request.');
      return false;
    }
    if (!leavingTime) {
      setError('Please select a departure time.');
      return false;
    }
    if (!returnTime) {
      setError('Please select an expected return time.');
      return false;
    }
    const leaving = new Date(leavingTime);
    const ret = new Date(returnTime);
    if (leaving < new Date()) {
      setError('Leaving time cannot be in the past.');
      return false;
    }
    if (ret <= leaving) {
      setError('Return time must be after leaving time.');
      return false;
    }
    return true;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate() || !currentUser) return;
    setSubmitting(true);
    setError('');

    const { data, error: rpcError } = await supabase.rpc('create_pass', {
      p_pass_type: passType,
      p_reason: reason.trim(),
      p_leaving_datetime: new Date(leavingTime).toISOString(),
      p_expected_return_datetime: new Date(returnTime).toISOString(),
      p_parent_phone: null,
    });

    if (rpcError) {
      setError(rpcError.message);
      setSubmitting(false);
      return;
    }

    if (!data) {
      setError('Failed to create leave request. Please try again.');
      setSubmitting(false);
      return;
    }

    await refreshPasses();
    setShowForm(false);
    setReason('');
    setLeavingTime('');
    setReturnTime('');
    setSubmitting(false);
  }

  const msToExpiry = activePass?.qr_expires_at
    ? new Date(activePass.qr_expires_at).getTime() - now.getTime()
    : 0;

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-800">Staff Dashboard</h2>
          <p className="text-sm text-slate-500">
            {currentUser.name} · {currentUser.department}
          </p>
        </div>
        {!showForm && !activePass && (
          <button
            onClick={() => remainingLeaves > 0 ? setShowForm(true) : setError('Monthly leave limit reached. You have already used ' + MONTHLY_LEAVE_LIMIT + ' leaves this month.')}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 transition-colors shadow-sm"
          >
            <Send className="w-4 h-4" />
            Request Leave
          </button>
        )}
      </div>

      {/* Leave balance indicator */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-cyan-100">
              <Calendar className="w-5 h-5 text-cyan-600" />
            </div>
            <div>
              <p className="text-sm font-bold text-slate-800">Monthly Leave Balance</p>
              <p className="text-xs text-slate-500">
                {remainingLeaves} of {MONTHLY_LEAVE_LIMIT} leaves remaining this month
              </p>
            </div>
          </div>
          <div className="flex gap-1">
            {Array.from({ length: MONTHLY_LEAVE_LIMIT }).map((_, i) => (
              <div
                key={i}
                className={`w-3 h-3 rounded-full ${
                  i < leavesThisMonth ? 'bg-cyan-500' : 'bg-slate-200'
                }`}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Request Form */}
      {showForm && !activePass && (
        <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-bold text-slate-800">Request Leave</h3>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="text-slate-400 hover:text-slate-600 text-sm"
            >
              Cancel
            </button>
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">Leave Type</label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {PASS_TYPES.map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setPassType(type)}
                  className={`px-3 py-2.5 rounded-lg text-sm font-medium border transition-all ${
                    passType === type
                      ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                      : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300'
                  }`}
                >
                  {PASS_TYPE_LABELS[type]}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">Reason</label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder="Describe the reason for your leave request..."
              className="w-full px-3 py-2.5 rounded-lg border border-slate-200 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 resize-none"
            />
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">Departure Time</label>
              <input
                type="datetime-local"
                value={leavingTime}
                onChange={(e) => setLeavingTime(e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg border border-slate-200 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">Expected Return Time</label>
              <input
                type="datetime-local"
                value={returnTime}
                onChange={(e) => setReturnTime(e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg border border-slate-200 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>
          </div>

          <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-blue-50 border border-blue-200 text-blue-700 text-sm">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            Your request will go directly to the HOD for approval.
          </div>

          {error && (
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-sm">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 transition-colors shadow-sm disabled:opacity-50"
          >
            {submitting ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Submitting...
              </>
            ) : (
              <>
                <Send className="w-4 h-4" />
                Submit Request
              </>
            )}
          </button>
        </form>
      )}

      {/* Active Pass with QR */}
      {activePass && activePass.qr_hash && (
        <div className="bg-white rounded-2xl border border-emerald-200 shadow-lg overflow-hidden">
          <div className="flex items-center gap-2 px-5 py-3 bg-emerald-600 text-white">
            <CheckCircle className="w-5 h-5" />
            <h3 className="text-base font-bold">Active Gate Pass — Approved</h3>
          </div>
          <div className="p-5 flex flex-col sm:flex-row gap-5">
            <div className="bg-white p-3 rounded-lg shadow-sm border border-slate-200 mx-auto">
              <QRCodeSVG value={activePass.qr_hash} size={180} level="H" includeMargin={false} />
            </div>
            <div className="flex-1 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-500">Pass Type</span>
                <span className="font-semibold text-slate-700">{PASS_TYPE_LABELS[activePass.pass_type]}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Pass ID</span>
                <span className="font-semibold text-slate-700">#{activePass.id.substring(0, 8)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Departure</span>
                <span className="font-semibold text-slate-700 text-right">{formatDateTime(activePass.leaving_datetime)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Return</span>
                <span className="font-semibold text-slate-700 text-right">{formatDateTime(activePass.expected_return_datetime)}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Pass History */}
      {pastPasses.length > 0 && (
        <div>
          <h3 className="text-base font-bold text-slate-800 mb-3">Pass History</h3>
          <div className="space-y-2.5">
            {pastPasses.map((pass) => (
              <PassCard key={pass.id} pass={pass} showApprover />
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {!showForm && !activePass && pastPasses.length === 0 && (
        <div className="text-center py-16">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-slate-100 mb-4">
            <QrCode className="w-8 h-8 text-slate-400" />
          </div>
          <h3 className="text-base font-semibold text-slate-700 mb-1">No leave requests yet</h3>
          <p className="text-sm text-slate-500">Click "Request Leave" to create your first gate pass.</p>
        </div>
      )}
    </div>
  );
}
