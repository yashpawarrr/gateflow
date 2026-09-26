import { useState } from 'react';
import { CheckCircle, XCircle, MessageCircle, Clock, X, Send, AlertTriangle } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { supabase } from '@/lib/supabase';
import { useApp } from '@/context/AppContext';
import { useClock, formatCountdown, formatDateTime } from '@/lib/time';
import { PASS_TYPE_LABELS, STATUS_COLORS } from '@/lib/constants';
import { PassCard } from '@/components/PassCard';
import { showWhatsAppToast } from '@/components/WhatsAppToast';
import type { PassRequest, PassType } from '@/types';

const PASS_TYPES: PassType[] = ['HALF_DAY', 'SICK_LEAVE', 'FULL_DAY', 'EMERGENCY_OUTING'];

export function TgDashboard() {
  const { currentUser, passes, settings, refreshPasses } = useApp();
  const now = useClock();
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [previewPass, setPreviewPass] = useState<PassRequest | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Form state
  const [passType, setPassType] = useState<PassType>('HALF_DAY');
  const [reason, setReason] = useState('');
  const [leavingTime, setLeavingTime] = useState('');
  const [returnTime, setReturnTime] = useState('');

  if (!currentUser) return null;

  const pendingStudentPasses = passes.filter((p) => p.status === 'PENDING_TG');
  const myPasses = passes.filter((p) => p.student_id === currentUser.id);
  const activePass = myPasses.find(
    (p) => p.status === 'APPROVED' && p.qr_hash && p.qr_expires_at && new Date(p.qr_expires_at) > now
  );
  const myPastPasses = myPasses.filter((p) => p.id !== activePass?.id);
  const escalateMs = (settings?.auto_escalate_minutes || 5) * 60 * 1000;

  async function handleApprove(passId: string) {
    setActionLoading(passId);
    const { data, error } = await supabase.rpc('approve_pass', {
      p_pass_id: passId,
    });

    if (!error && data?.success) {
      if (data.whatsapp_message) {
        showWhatsAppToast(data.whatsapp_phone || '', data.whatsapp_message);
      }
      await refreshPasses();
    } else if (error) {
      alert(error.message);
    } else if (data?.error) {
      alert(data.error);
    }
    setActionLoading(null);
  }

  async function handleReject(passId: string) {
    setActionLoading(passId);
    const { data, error } = await supabase.rpc('reject_pass', {
      p_pass_id: passId,
    });

    if (!error && data?.success) {
      await refreshPasses();
    } else if (error) {
      alert(error.message);
    } else if (data?.error) {
      alert(data.error);
    }
    setActionLoading(null);
  }

  function validate(): boolean {
    setError('');
    if (!reason.trim()) {
      setError('Please provide a reason for your pass request.');
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
      setError('Failed to create pass request. Please try again.');
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

  function buildWhatsAppMessage(pass: PassRequest): string {
    if (!pass.student) return '';
    const shortId = pass.id.substring(0, 8);
    return `Dear Parent, your ward ${pass.student.name}'s ${PASS_TYPE_LABELS[pass.pass_type]} pass has been APPROVED by ${currentUser!.department} Dept. Pass ID: #${shortId}. Gate exit permitted.`;
  }

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-800">Teacher Guardian Dashboard</h2>
          <p className="text-sm text-slate-500">
            {currentUser.name} · {currentUser.department}
          </p>
        </div>
        {!showForm && !activePass && (
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 transition-colors shadow-sm"
          >
            <Send className="w-4 h-4" />
            Request Leave
          </button>
        )}
      </div>

      {/* Mentor approval queue */}
      <div>
        <h3 className="text-base font-bold text-slate-800 mb-3">
          Student Requests — Mentor Approval
          {pendingStudentPasses.length > 0 && (
            <span className="ml-2 text-sm font-normal text-slate-400">({pendingStudentPasses.length})</span>
          )}
        </h3>

        {pendingStudentPasses.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-xl border border-slate-200">
            <CheckCircle className="w-10 h-10 text-emerald-400 mx-auto mb-2" />
            <p className="text-sm font-semibold text-slate-600">No pending student requests</p>
            <p className="text-xs text-slate-400">All caught up!</p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {pendingStudentPasses.map((pass) => {
              const msToEscalate = escalateMs - (now.getTime() - new Date(pass.created_at).getTime());
              const isUrgent = msToEscalate < 60000;

              return (
                <PassCard key={pass.id} pass={pass} showStudent>
                  <div className="flex items-center gap-1.5 text-xs mb-2">
                    <Clock className={`w-3.5 h-3.5 ${isUrgent ? 'text-rose-500' : 'text-amber-500'}`} />
                    <span className={isUrgent ? 'text-rose-600 font-semibold' : 'text-amber-600'}>
                      {msToEscalate <= 0
                        ? 'Escalating to HOD...'
                        : `Auto-escalating to HOD in ${formatCountdown(msToEscalate)}`}
                    </span>
                    <span className="text-slate-300">·</span>
                    <span className="text-slate-400">Submitted {formatDateTime(pass.created_at)}</span>
                  </div>

                  <div className="flex flex-col sm:flex-row gap-2">
                    <button
                      onClick={() => handleApprove(pass.id)}
                      disabled={actionLoading === pass.id}
                      className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 transition-colors disabled:opacity-50"
                    >
                      {actionLoading === pass.id ? (
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <CheckCircle className="w-4 h-4" />
                      )}
                      Approve
                    </button>
                    <button
                      onClick={() => handleReject(pass.id)}
                      disabled={actionLoading === pass.id}
                      className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-rose-600 text-white text-sm font-semibold hover:bg-rose-700 transition-colors disabled:opacity-50"
                    >
                      <XCircle className="w-4 h-4" />
                      Reject
                    </button>
                    <button
                      onClick={() => setPreviewPass(pass)}
                      className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-slate-100 text-slate-700 text-sm font-semibold hover:bg-slate-200 transition-colors border border-slate-200"
                    >
                      <MessageCircle className="w-4 h-4" />
                      Preview
                    </button>
                  </div>
                </PassCard>
              );
            })}
          </div>
        )}
      </div>

      {/* Leave request form for TG */}
      {showForm && !activePass && (
        <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-bold text-slate-800">Request Leave Pass</h3>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="text-slate-400 hover:text-slate-600 text-sm"
            >
              Cancel
            </button>
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">Pass Type</label>
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

      {/* My active pass with QR */}
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

      {/* My pass history */}
      {myPastPasses.length > 0 && (
        <div>
          <h3 className="text-base font-bold text-slate-800 mb-3">My Pass History</h3>
          <div className="space-y-2.5">
            {myPastPasses.map((pass) => (
              <PassCard key={pass.id} pass={pass} showApprover />
            ))}
          </div>
        </div>
      )}

      {/* WhatsApp Preview Modal */}
      {previewPass && previewPass.student && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setPreviewPass(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl max-w-sm w-full overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 bg-emerald-500 text-white">
              <div className="flex items-center gap-2">
                <MessageCircle className="w-5 h-5" />
                <span className="text-sm font-bold">WhatsApp Preview (Simulated)</span>
              </div>
              <button onClick={() => setPreviewPass(null)} className="text-white/80 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 space-y-3">
              <div>
                <p className="text-xs font-semibold text-slate-500 mb-1">Recipient</p>
                <p className="text-sm text-slate-700">
                  {previewPass.student.parent_phone || 'No parent phone on file'}
                </p>
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-500 mb-1">Message</p>
                <div className="bg-emerald-50 rounded-lg p-3 border border-emerald-100">
                  <p className="text-sm text-slate-700">{buildWhatsAppMessage(previewPass)}</p>
                </div>
              </div>
              <p className="text-xs text-slate-400 text-center">
                This is a simulated message. No real WhatsApp API call is made.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setPreviewPass(null)}
                  className="flex-1 px-3 py-2 rounded-lg bg-slate-100 text-slate-700 text-sm font-semibold hover:bg-slate-200 transition-colors"
                >
                  Close
                </button>
                <button
                  onClick={() => {
                    handleApprove(previewPass.id);
                    setPreviewPass(null);
                  }}
                  disabled={actionLoading === previewPass.id}
                  className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 transition-colors disabled:opacity-50"
                >
                  <CheckCircle className="w-4 h-4" />
                  Approve & Send
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
