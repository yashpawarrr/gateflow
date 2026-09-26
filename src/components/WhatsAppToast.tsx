import { useEffect, useState } from 'react';
import { MessageCircle, X } from 'lucide-react';

interface WhatsAppToast {
  id: number;
  phone: string;
  message: string;
}

let toastId = 0;
const listeners: ((toast: WhatsAppToast) => void)[] = [];

export function showWhatsAppToast(phone: string, message: string) {
  const toast = { id: ++toastId, phone, message };
  listeners.forEach((l) => l(toast));
}

export function WhatsAppToastContainer() {
  const [toasts, setToasts] = useState<WhatsAppToast[]>([]);

  useEffect(() => {
    const listener = (toast: WhatsAppToast) => {
      setToasts((prev) => [...prev, toast]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== toast.id));
      }, 7000);
    };
    listeners.push(listener);
    return () => {
      const idx = listeners.indexOf(listener);
      if (idx >= 0) listeners.splice(idx, 1);
    };
  }, []);

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className="bg-white rounded-xl shadow-xl border border-slate-200 overflow-hidden animate-in slide-in-from-right"
        >
          <div className="flex items-center gap-2 px-3 py-2 bg-emerald-500 text-white">
            <MessageCircle className="w-4 h-4" />
            <span className="text-xs font-bold">WhatsApp (Simulated)</span>
            <span className="text-[10px] opacity-80 ml-auto">Mock send</span>
          </div>
          <div className="p-3">
            <p className="text-xs font-semibold text-slate-500 mb-1">To: {toast.phone}</p>
            <p className="text-sm text-slate-700">{toast.message}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
