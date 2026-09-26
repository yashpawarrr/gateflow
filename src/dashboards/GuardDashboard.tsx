import { useState, useRef, useEffect } from 'react';
import { Camera, Shield, CheckCircle, XCircle, Keyboard, X, AlertTriangle } from 'lucide-react';
import { Html5Qrcode } from 'html5-qrcode';
import { supabase } from '@/lib/supabase';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

import { useApp } from '@/context/AppContext';
import type { ScanResult } from '@/types';

type ScanMode = 'idle' | 'camera' | 'manual';
type OverlayState = { result: ScanResult } | null;

export function GuardDashboard() {
  const { currentUser } = useApp();
  const [mode, setMode] = useState<ScanMode>('idle');
  const [scanning, setScanning] = useState(false);
  const [manualHash, setManualHash] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [overlay, setOverlay] = useState<OverlayState>(null);
  const [cameraError, setCameraError] = useState('');
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const scannerDivId = 'qr-scanner-region';

  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  if (!currentUser) return null;

  async function verifyPass(qrHash: string) {
    setVerifying(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token || SUPABASE_ANON_KEY;

      const response = await fetch(`${SUPABASE_URL}/functions/v1/verify-pass`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ qr_hash: qrHash }),
      });

      const data: ScanResult = await response.json();
      setOverlay({ result: data });
    } catch {
      setOverlay({
        result: { success: false, error: 'Network error. Please try again.' },
      });
    } finally {
      setVerifying(false);
    }
  }

  async function startCamera() {
    setCameraError('');
    setMode('camera');
    try {
      await Html5Qrcode.getCameras();
    } catch {
      setCameraError('Camera access denied. Use manual entry below.');
      setMode('manual');
      return;
    }

    setTimeout(async () => {
      try {
        const html5Qr = new Html5Qrcode(scannerDivId);
        scannerRef.current = html5Qr;
        await html5Qr.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: { width: 220, height: 220 } },
          (decodedText: string) => {
            html5Qr.stop().then(() => {
              setScanning(false);
              setMode('idle');
              verifyPass(decodedText);
            });
          },
          () => {}
        );
        setScanning(true);
      } catch {
        setCameraError('Failed to start camera. Use manual entry below.');
        setMode('manual');
      }
    }, 100);
  }

  async function stopCamera() {
    if (scannerRef.current) {
      try {
        await scannerRef.current.stop();
        await scannerRef.current.clear();
      } catch {
        // ignore
      }
      scannerRef.current = null;
    }
    setScanning(false);
  }

  function handleManualSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!manualHash.trim()) return;
    verifyPass(manualHash.trim());
    setManualHash('');
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-slate-50">
      <div className="max-w-2xl mx-auto px-4 py-6 space-y-5">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-gradient-to-br from-rose-500 to-rose-600 shadow-md">
            <Shield className="w-6 h-6 text-white" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-800">Security Gate Scanner</h2>
            <p className="text-sm text-slate-500">{currentUser.name} · Main Gate</p>
          </div>
        </div>

        {/* Scanner Mode */}
        {mode === 'idle' && !overlay && (
          <div className="space-y-3">
            <button
              onClick={startCamera}
              className="w-full flex items-center justify-center gap-3 px-4 py-6 rounded-2xl bg-indigo-600 text-white text-base font-bold hover:bg-indigo-700 transition-colors shadow-lg"
            >
              <Camera className="w-7 h-7" />
              Open Camera Scanner
            </button>
            <button
              onClick={() => setMode('manual')}
              className="w-full flex items-center justify-center gap-2 px-4 py-3.5 rounded-xl bg-white text-slate-700 text-sm font-semibold hover:bg-slate-50 transition-colors border border-slate-200 shadow-sm"
            >
              <Keyboard className="w-5 h-5" />
              Manual Entry (Type / Paste QR Hash)
            </button>
          </div>
        )}

        {/* Camera Scanner */}
        {mode === 'camera' && (
          <div className="space-y-3">
            <div className="relative bg-slate-900 rounded-2xl overflow-hidden aspect-square max-w-sm mx-auto">
              <div id={scannerDivId} className="w-full h-full" />
              {/* Scanning frame overlay */}
              <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                <div className="w-56 h-56 border-2 border-white/70 rounded-2xl relative">
                  <div className="absolute -top-1 -left-1 w-6 h-6 border-t-4 border-l-4 border-indigo-400 rounded-tl-lg" />
                  <div className="absolute -top-1 -right-1 w-6 h-6 border-t-4 border-r-4 border-indigo-400 rounded-tr-lg" />
                  <div className="absolute -bottom-1 -left-1 w-6 h-6 border-b-4 border-l-4 border-indigo-400 rounded-bl-lg" />
                  <div className="absolute -bottom-1 -right-1 w-6 h-6 border-b-4 border-r-4 border-indigo-400 rounded-br-lg" />
                </div>
              </div>
              {scanning && (
                <div className="absolute top-3 left-1/2 -translate-x-1/2 bg-black/60 text-white text-xs px-3 py-1 rounded-full">
                  Scanning...
                </div>
              )}
            </div>
            {cameraError && (
              <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-700 text-sm">
                <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                {cameraError}
              </div>
            )}
            <button
              onClick={async () => {
                await stopCamera();
                setMode('idle');
              }}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-slate-100 text-slate-700 text-sm font-semibold hover:bg-slate-200 transition-colors"
            >
              <X className="w-4 h-4" />
              Cancel Scan
            </button>
            <button
              onClick={() => setMode('manual')}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-white text-slate-600 text-sm font-semibold hover:bg-slate-50 transition-colors border border-slate-200"
            >
              <Keyboard className="w-4 h-4" />
              Switch to Manual Entry
            </button>
          </div>
        )}

        {/* Manual Entry */}
        {mode === 'manual' && (
          <form onSubmit={handleManualSubmit} className="space-y-3">
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
              <label className="block text-sm font-semibold text-slate-700 mb-2">
                Enter QR Token Hash
              </label>
              <textarea
                value={manualHash}
                onChange={(e) => setManualHash(e.target.value)}
                rows={3}
                placeholder="Paste the QR token hash here..."
                className="w-full px-3 py-2.5 rounded-lg border border-slate-200 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 resize-none font-mono"
              />
              <p className="text-xs text-slate-400 mt-1.5">
                The guard can type or paste the token if the camera is unavailable.
              </p>
            </div>
            <button
              type="submit"
              disabled={verifying || !manualHash.trim()}
              className="w-full flex items-center justify-center gap-2 px-4 py-3.5 rounded-xl bg-indigo-600 text-white text-sm font-bold hover:bg-indigo-700 transition-colors shadow-sm disabled:opacity-50"
            >
              {verifying ? (
                <>
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Verifying...
                </>
              ) : (
                <>
                  <Shield className="w-5 h-5" />
                  Verify Pass
                </>
              )}
            </button>
            <button
              type="button"
              onClick={() => setMode('idle')}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-slate-100 text-slate-700 text-sm font-semibold hover:bg-slate-200 transition-colors"
            >
              <X className="w-4 h-4" />
              Back
            </button>
          </form>
        )}

        {/* Verifying spinner */}
        {verifying && mode !== 'manual' && mode !== 'camera' && (
          <div className="flex flex-col items-center justify-center py-12">
            <div className="w-10 h-10 border-3 border-indigo-600 border-t-transparent rounded-full animate-spin mb-3" />
            <p className="text-sm text-slate-500">Verifying pass...</p>
          </div>
        )}
      </div>

      {/* Full-screen Result Overlay */}
      {overlay && (
        <ResultOverlay
          result={overlay.result}
          onDismiss={() => {
            setOverlay(null);
            setMode('idle');
          }}
        />
      )}
    </div>
  );
}

function ResultOverlay({ result, onDismiss }: { result: ScanResult; onDismiss: () => void }) {
  const [audioPlayed, setAudioPlayed] = useState(false);

  useEffect(() => {
    if (!audioPlayed) {
      try {
        const ctx = new AudioContext();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);

        if (result.success) {
          osc.frequency.value = 880;
          gain.gain.setValueAtTime(0.3, ctx.currentTime);
          osc.start();
          osc.stop(ctx.currentTime + 0.15);
          osc.frequency.setValueAtTime(1100, ctx.currentTime + 0.15);
          osc.start(ctx.currentTime + 0.15);
          osc.stop(ctx.currentTime + 0.3);
        } else {
          osc.frequency.value = 200;
          gain.gain.setValueAtTime(0.3, ctx.currentTime);
          osc.start();
          osc.stop(ctx.currentTime + 0.3);
          osc.frequency.setValueAtTime(150, ctx.currentTime + 0.15);
          osc.start(ctx.currentTime + 0.15);
          osc.stop(ctx.currentTime + 0.3);
        }
      } catch {
        // audio not available
      }
      setAudioPlayed(true);
    }
  }, [audioPlayed, result.success]);

  const isSuccess = result.success;

  return (
    <div
      className={`fixed inset-0 z-50 flex flex-col items-center justify-between p-6 ${
        isSuccess ? 'bg-emerald-600' : 'bg-rose-600'
      }`}
    >
      {/* Top: dismiss */}
      <div className="w-full max-w-md flex justify-end">
        <button
          onClick={onDismiss}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/20 text-white text-sm font-semibold hover:bg-white/30 transition-colors"
        >
          <X className="w-4 h-4" />
          Dismiss
        </button>
      </div>

      {/* Center: result */}
      <div className="flex-1 flex flex-col items-center justify-center w-full max-w-md">
        {isSuccess ? (
          <>
            <div className="w-24 h-24 rounded-full bg-white/20 flex items-center justify-center mb-4 animate-in zoom-in duration-300">
              <CheckCircle className="w-14 h-14 text-white" strokeWidth={2.5} />
            </div>
            <h2 className="text-2xl font-bold text-white text-center mb-1">PASS VERIFIED</h2>
            <p className="text-lg font-semibold text-white/90 mb-6 text-center">ENTRY PERMITTED</p>

            {/* Student info card */}
            {result.student_photo && (
              <img
                src={result.student_photo}
                alt={result.student_name}
                className="w-20 h-20 rounded-full object-cover ring-4 ring-white/30 mb-3"
              />
            )}
            <p className="text-xl font-bold text-white mb-1">{result.student_name}</p>
            <p className="text-sm text-white/80 mb-4">
              {result.student_roll} · {result.student_dept}
            </p>

            <div className="w-full bg-white/15 rounded-xl p-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-white/70">Pass Type</span>
                <span className="text-white font-semibold">{result.pass_type}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-white/70">Pass ID</span>
                <span className="text-white font-semibold">#{result.short_id}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-white/70">Departure</span>
                <span className="text-white font-semibold text-right">{result.leaving_time}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-white/70">Return</span>
                <span className="text-white font-semibold text-right">{result.return_time}</span>
              </div>
              <div className="pt-2 border-t border-white/20">
                <p className="text-white/70 text-xs">Reason</p>
                <p className="text-white text-sm">{result.reason}</p>
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="w-24 h-24 rounded-full bg-white/20 flex items-center justify-center mb-4">
              <XCircle className="w-14 h-14 text-white" strokeWidth={2.5} />
            </div>
            <h2 className="text-2xl font-bold text-white text-center mb-1">ACCESS DENIED</h2>
            <p className="text-lg font-semibold text-white/90 mb-6 text-center">
              {result.error || 'Verification failed'}
            </p>
          </>
        )}
      </div>

      {/* Bottom: tap to continue */}
      <div className="w-full max-w-md text-center">
        <button
          onClick={onDismiss}
          className="w-full px-4 py-3 rounded-xl bg-white/20 text-white text-sm font-bold hover:bg-white/30 transition-colors"
        >
          Tap to Continue Scanning
        </button>
      </div>
    </div>
  );
}
