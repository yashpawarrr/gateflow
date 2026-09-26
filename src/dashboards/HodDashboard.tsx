import { useState } from 'react';
import { CheckCircle, XCircle, Clock, AlertTriangle, Check, Info } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useApp } from '@/context/AppContext';
import { useClock, formatDateTime } from '@/lib/time';
import { PassCard } from '@/components/PassCard';
import { showWhatsAppToast } from '@/components/WhatsAppToast';

export function HodDashboard() {
  const { currentUser, passes, settings, refreshPasses, refreshSettings } = useApp();
  const now = useClock();
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkLoading, setBulkLoading] = useState(false);

  if (!currentUser || !settings) return null;

  const pendingPasses = passes.filter((p) => p.status === 'PENDING_HOD');

  async function toggleBusyMode() {
    const newValue = !settings!.hod_out_of_office;
    await supabase
      .from('system_settings')
      .update({ hod_out_of_office: newValue })
      .eq('id', 1);
    await refreshSettings();
  }

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

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleBulkApprove() {
    setBulkLoading(true);
    for (const id of selectedIds) {
      await handleApprove(id);
    }
    setSelectedIds(new Set());
    setBulkLoading(false);
  }

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-xl font-bold text-slate-800">HOD Dashboard</h2>
        <p className="text-sm text-slate-500">
          {currentUser.name} · {currentUser.department} Department
        </p>
      </div>

      {/* Out of Office Toggle */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className={`flex items-center justify-center w-10 h-10 rounded-lg ${
                settings.hod_out_of_office ? 'bg-amber-100' : 'bg-emerald-100'
              }`}
            >
              {settings.hod_out_of_office ? (
                <AlertTriangle className="w-5 h-5 text-amber-600" />
              ) : (
                <CheckCircle className="w-5 h-5 text-emerald-600" />
              )}
            </div>
            <div>
              <p className="text-sm font-bold text-slate-800">Busy / Out of Office Mode</p>
              <p className="text-xs text-slate-500">
                {settings.hod_out_of_office
                  ? 'Student requests skip mentor and go directly to HOD'
                  : 'Student requests go to mentor (TG) first, then HOD after ' +
                    settings.auto_escalate_minutes +
                    ' min if not actioned'}
              </p>
            </div>
          </div>
          <button
            onClick={toggleBusyMode}
            className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors ${
              settings.hod_out_of_office ? 'bg-amber-500' : 'bg-emerald-500'
            }`}
          >
            <span
              className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition-transform ${
                settings.hod_out_of_office ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>
      </div>

      {/* Approval flow info */}
      <div className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-blue-50 border border-blue-200 text-blue-700 text-sm">
        <Info className="w-4 h-4 flex-shrink-0" />
        <span>
          Mentor (TG) approvals are now final — no HOD step needed. You receive requests only when TG doesn't act within {settings.auto_escalate_minutes} min, or when faculty/staff submit directly.
        </span>
      </div>

      {/* Pending Requests */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-base font-bold text-slate-800">
            Pending Final Approvals
            {pendingPasses.length > 0 && (
              <span className="ml-2 text-sm font-normal text-slate-400">({pendingPasses.length})</span>
            )}
          </h3>
          {selectedIds.size > 0 && (
            <button
              onClick={handleBulkApprove}
              disabled={bulkLoading}
              className="flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 transition-colors shadow-sm disabled:opacity-50"
            >
              {bulkLoading ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <Check className="w-4 h-4" />
              )}
              Approve Selected ({selectedIds.size})
            </button>
          )}
        </div>

        {pendingPasses.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-xl border border-slate-200">
            <CheckCircle className="w-10 h-10 text-emerald-400 mx-auto mb-2" />
            <p className="text-sm font-semibold text-slate-600">No pending approvals</p>
            <p className="text-xs text-slate-400">All caught up!</p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {pendingPasses.map((pass) => (
              <PassCard
                key={pass.id}
                pass={pass}
                showStudent
                selected={selectedIds.has(pass.id)}
                onSelect={toggleSelect}
              >
                <div className="flex items-center gap-1.5 text-xs mb-2 text-slate-500">
                  <Clock className="w-3.5 h-3.5" />
                  <span>Submitted {formatDateTime(pass.created_at)}</span>
                </div>

                <div className="flex gap-2">
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
                </div>
              </PassCard>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
