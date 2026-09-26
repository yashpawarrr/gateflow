import { Phone } from 'lucide-react';

interface PhoneInputProps {
  value: string;
  onChange: (value: string) => void;
  label: string;
  required?: boolean;
}

export function PhoneInput({ value, onChange, label, required }: PhoneInputProps) {
  const digits = value.replace(/\D/g, '').slice(-10);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value.replace(/\D/g, '').slice(0, 10);
    onChange(raw);
  }

  return (
    <div>
      <label className="block text-sm font-semibold text-slate-700 mb-1.5">
        {label}{required && <span className="text-rose-500"> *</span>}
      </label>
      <div className="relative flex items-center">
        <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
        <div className="flex items-stretch w-full">
          <span className="inline-flex items-center pl-10 pr-2 py-2.5 rounded-l-lg border border-r-0 border-slate-200 bg-slate-50 text-sm font-semibold text-slate-600 select-none">
            +91
          </span>
          <input
            type="tel"
            value={digits}
            onChange={handleChange}
            required={required}
            maxLength={10}
            placeholder="XXXXXXXXXX"
            className="w-full px-3 py-2.5 rounded-r-lg border border-slate-200 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
          />
        </div>
      </div>
    </div>
  );
}
