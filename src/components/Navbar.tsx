import { useState, useRef, useEffect } from 'react';
import { Shield, User, LogOut, ChevronDown } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { ROLE_LABELS, ROLE_COLORS } from '@/lib/constants';

export function Navbar() {
  const { currentUser, signOut } = useApp();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  if (!currentUser) return null;

  return (
    <nav className="sticky top-0 z-40 bg-white/90 backdrop-blur-md border-b border-slate-200 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <div className="flex items-center gap-2.5">
            <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-gradient-to-br from-indigo-600 to-indigo-700 shadow-md">
              <Shield className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-base font-bold text-slate-800 leading-tight">GateFlow</h1>
              <p className="text-[10px] text-slate-500 leading-tight">Digital Gate Pass System</p>
            </div>
          </div>

          {/* User menu */}
          <div className="relative" ref={dropdownRef}>
            <button
              onClick={() => setDropdownOpen(!dropdownOpen)}
              className="flex items-center gap-2.5 px-3 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 transition-colors border border-slate-200"
            >
              {currentUser.photo_url ? (
                <img
                  src={currentUser.photo_url}
                  alt={currentUser.name}
                  className="w-7 h-7 rounded-full object-cover ring-2 ring-white"
                />
              ) : (
                <div className="w-7 h-7 rounded-full bg-indigo-100 flex items-center justify-center">
                  <User className="w-4 h-4 text-indigo-600" />
                </div>
              )}
              <div className="text-left hidden sm:block">
                <p className="text-xs font-semibold text-slate-700 leading-tight">{currentUser.name}</p>
                <p className={`text-[10px] font-medium leading-tight ${ROLE_COLORS[currentUser.role]}`}>
                  {ROLE_LABELS[currentUser.role]}
                </p>
              </div>
              <ChevronDown className="w-4 h-4 text-slate-400" />
            </button>

            {dropdownOpen && (
              <div className="absolute right-0 mt-2 w-56 bg-white rounded-xl shadow-xl border border-slate-200 overflow-hidden">
                <div className="px-3 py-2.5 border-b border-slate-100">
                  <p className="text-sm font-semibold text-slate-700">{currentUser.name}</p>
                  <p className="text-xs text-slate-500">{currentUser.email}</p>
                  <p className={`text-xs font-medium mt-0.5 ${ROLE_COLORS[currentUser.role]}`}>
                    {ROLE_LABELS[currentUser.role]} · {currentUser.department}
                  </p>
                </div>
                <button
                  onClick={() => {
                    signOut();
                    setDropdownOpen(false);
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-rose-600 hover:bg-rose-50 transition-colors"
                >
                  <LogOut className="w-4 h-4" />
                  Sign Out
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}
