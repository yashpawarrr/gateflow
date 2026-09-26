import { useState } from 'react';
import { Shield, Mail, Lock, User, GraduationCap, UserCog, Users, ChevronDown, AlertTriangle, Loader2, BookOpen, UserCheck, Briefcase } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { PhoneInput } from '@/components/PhoneInput';
import type { UserRole } from '@/types';

interface AuthScreenProps {
  onAuthSuccess: () => void;
}

const ROLES: { value: UserRole; label: string; icon: typeof User }[] = [
  { value: 'STUDENT', label: 'Student', icon: GraduationCap },
  { value: 'HOD', label: 'Head of Dept', icon: UserCog },
  { value: 'TG', label: 'Teacher / TG', icon: Users },
  { value: 'STAFF', label: 'Staff Member', icon: Briefcase },
  { value: 'GUARD', label: 'Security Guard', icon: Shield },
];

const DEPARTMENTS = [
  'Computer Science',
  'Electronics & Communication',
  'Mechanical Engineering',
  'Civil Engineering',
  'Electrical Engineering',
  'Information Technology',
  'Security',
  'Scholarship Dept',
  'Library',
  'Transportation',
  'Administration',
  'Accounts',
  'Hostel Office',
  'Examination Cell',
  'Other',
];

const SEMESTERS = [1, 2, 3, 4, 5, 6, 7, 8];
const YEARS = [1, 2, 3, 4];

function Field({
  icon: Icon,
  label,
  children,
}: {
  icon: typeof User;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-sm font-semibold text-slate-700 mb-1.5">{label}</label>
      <div className="relative">
        <Icon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
        {children}
      </div>
    </div>
  );
}

const inputClass =
  'w-full pl-10 pr-3 py-2.5 rounded-lg border border-slate-200 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500';

export function AuthScreen({ onAuthSuccess }: AuthScreenProps) {
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Shared
  const [name, setName] = useState('');
  const [role, setRole] = useState<UserRole>('STUDENT');
  const [department, setDepartment] = useState('Computer Science');

  // Student fields
  const [rollNumber, setRollNumber] = useState('');
  const [parentPhone, setParentPhone] = useState('');
  const [semester, setSemester] = useState(1);
  const [year, setYear] = useState(1);
  const [hodName, setHodName] = useState('');
  const [tgName, setTgName] = useState('');
  const [tgPhone, setTgPhone] = useState('');

  // TG/Faculty/Staff fields
  const [phone, setPhone] = useState('');
  const [hodPhone, setHodPhone] = useState('');

  // Staff fields
  const [staffRole, setStaffRole] = useState('');

  function handleRoleSelect(r: UserRole) {
    setRole(r);
    if (r === 'GUARD') setDepartment('Security');
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (mode === 'signup') {
        // Validate role-specific fields
        if (role === 'STUDENT') {
          if (!rollNumber.trim()) throw new Error('Enrollment number is required');
          if (!parentPhone.trim()) throw new Error('Parent phone number is required');
          if (!tgName.trim()) throw new Error('Mentor (TG) name is required');
          if (!tgPhone.trim()) throw new Error('Mentor (TG) phone number is required');
          if (!hodName.trim()) throw new Error('HOD name is required');
        } else if (role === 'TG') {
          if (!phone.trim()) throw new Error('Your phone number is required');
          if (!hodName.trim()) throw new Error('HOD name is required');
          if (!hodPhone.trim()) throw new Error('HOD phone number is required');
        } else if (role === 'STAFF') {
          if (!staffRole.trim()) throw new Error('Please specify your staff role');
          if (!phone.trim()) throw new Error('Your phone number is required');
          if (!hodName.trim()) throw new Error('HOD name is required');
          if (!hodPhone.trim()) throw new Error('HOD phone number is required');
        }

        const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
          email,
          password,
        });

        if (signUpError) throw signUpError;
        if (!signUpData.user) throw new Error('Signup failed');

        const { error: profileError } = await supabase.rpc('signup_user', {
          p_name: name.trim(),
          p_role: role,
          p_department: department,
          p_roll_number: role === 'STUDENT' || role === 'TG' || role === 'STAFF' ? rollNumber.trim() : '',
          p_parent_phone: role === 'STUDENT' ? '+91' + parentPhone.trim() : '',
          p_phone: role === 'TG' || role === 'STAFF' ? '+91' + phone.trim() : '',
          p_semester: role === 'STUDENT' ? semester : null,
          p_year: role === 'STUDENT' ? year : null,
          p_hod_name: role === 'STUDENT' || role === 'TG' || role === 'STAFF' ? hodName.trim() : '',
          p_hod_phone: role === 'TG' || role === 'STAFF' ? '+91' + hodPhone.trim() : '',
          p_tg_name: role === 'STUDENT' ? tgName.trim() : '',
          p_tg_phone: role === 'STUDENT' ? '+91' + tgPhone.trim() : '',
        });

        if (profileError) throw profileError;

        await new Promise((resolve) => setTimeout(resolve, 500));
        const { data: profile } = await supabase.rpc('get_current_user');
        if (profile?.success) {
          onAuthSuccess();
        } else {
          throw new Error('Profile creation failed. Please try signing in.');
        }
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (signInError) throw signInError;
        onAuthSuccess();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-indigo-50 flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-lg">
        {/* Logo */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-600 to-indigo-700 shadow-lg mb-3">
            <Shield className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-slate-800">GateFlow</h1>
          <p className="text-sm text-slate-500">Digital Gate Pass System</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden">
          {/* Tabs */}
          <div className="flex border-b border-slate-100">
            <button
              onClick={() => { setMode('login'); setError(''); }}
              className={`flex-1 py-3 text-sm font-semibold transition-colors ${
                mode === 'login'
                  ? 'text-indigo-600 border-b-2 border-indigo-600 bg-indigo-50/50'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              Sign In
            </button>
            <button
              onClick={() => { setMode('signup'); setError(''); }}
              className={`flex-1 py-3 text-sm font-semibold transition-colors ${
                mode === 'signup'
                  ? 'text-indigo-600 border-b-2 border-indigo-600 bg-indigo-50/50'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              Create Account
            </button>
          </div>

          <form onSubmit={handleSubmit} className="p-5 space-y-4">
            {/* Signup-only fields */}
            {mode === 'signup' && (
              <>
                <Field icon={User} label="Full Name">
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    placeholder="Enter your full name"
                    className={inputClass}
                  />
                </Field>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">Role</label>
                  <div className="grid grid-cols-2 gap-2">
                    {ROLES.map((r) => {
                      const Icon = r.icon;
                      return (
                        <button
                          key={r.value}
                          type="button"
                          onClick={() => handleRoleSelect(r.value)}
                          className={`flex items-center gap-2 px-3 py-2.5 rounded-lg text-xs font-medium border transition-all ${
                            role === r.value
                              ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                              : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300'
                          }`}
                        >
                          <Icon className="w-4 h-4" />
                          {r.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Department for all except Guard */}
                {role !== 'GUARD' && (
                  <Field icon={BookOpen} label="Department / Branch">
                    <div className="relative">
                      <select
                        value={department}
                        onChange={(e) => setDepartment(e.target.value)}
                        className={`${inputClass} appearance-none pr-10 bg-white`}
                      >
                        {DEPARTMENTS.filter((d) => d !== 'Security').map((d) => (
                          <option key={d} value={d}>{d}</option>
                        ))}
                      </select>
                      <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                    </div>
                  </Field>
                )}

                {/* Student-specific fields */}
                {role === 'STUDENT' && (
                  <div className="space-y-4 p-4 rounded-xl bg-indigo-50/40 border border-indigo-100">
                    <p className="text-xs font-bold text-indigo-700 uppercase tracking-wide">Student Details</p>

                    <Field icon={GraduationCap} label="Enrollment / Roll Number">
                      <input
                        type="text"
                        value={rollNumber}
                        onChange={(e) => setRollNumber(e.target.value)}
                        required
                        placeholder="e.g. CSE20045"
                        className={inputClass}
                      />
                    </Field>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-sm font-semibold text-slate-700 mb-1.5">Semester</label>
                        <div className="relative">
                          <select
                            value={semester}
                            onChange={(e) => setSemester(Number(e.target.value))}
                            className={`${inputClass} appearance-none pr-10 bg-white`}
                          >
                            {SEMESTERS.map((s) => (
                              <option key={s} value={s}>Semester {s}</option>
                            ))}
                          </select>
                          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                        </div>
                      </div>
                      <div>
                        <label className="block text-sm font-semibold text-slate-700 mb-1.5">Year</label>
                        <div className="relative">
                          <select
                            value={year}
                            onChange={(e) => setYear(Number(e.target.value))}
                            className={`${inputClass} appearance-none pr-10 bg-white`}
                          >
                            {YEARS.map((y) => (
                              <option key={y} value={y}>Year {y}</option>
                            ))}
                          </select>
                          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                        </div>
                      </div>
                    </div>

                    <PhoneInput
                      value={parentPhone}
                      onChange={setParentPhone}
                      label="Parent Phone Number"
                      required
                    />

                    <div className="space-y-4 pt-2 border-t border-indigo-100">
                      <p className="text-xs font-bold text-indigo-700 uppercase tracking-wide">Mentor / TG Details</p>
                      <Field icon={UserCheck} label="Mentor (TG) Name">
                        <input
                          type="text"
                          value={tgName}
                          onChange={(e) => setTgName(e.target.value)}
                          required
                          placeholder="Mentor's full name"
                          className={inputClass}
                        />
                      </Field>
                      <PhoneInput
                        value={tgPhone}
                        onChange={setTgPhone}
                        label="Mentor (TG) Mobile Number"
                        required
                      />
                    </div>

                    <div className="space-y-4 pt-2 border-t border-indigo-100">
                      <p className="text-xs font-bold text-indigo-700 uppercase tracking-wide">HOD Details</p>
                      <Field icon={UserCog} label="HOD Name">
                        <input
                          type="text"
                          value={hodName}
                          onChange={(e) => setHodName(e.target.value)}
                          required
                          placeholder="HOD's full name"
                          className={inputClass}
                        />
                      </Field>
                    </div>
                  </div>
                )}

                {/* TG/Faculty-specific fields */}
                {role === 'TG' && (
                  <div className="space-y-4 p-4 rounded-xl bg-amber-50/40 border border-amber-100">
                    <p className="text-xs font-bold text-amber-700 uppercase tracking-wide">Faculty Details</p>

                    <Field icon={GraduationCap} label="Registration / Roll Number">
                      <input
                        type="text"
                        value={rollNumber}
                        onChange={(e) => setRollNumber(e.target.value)}
                        placeholder="Your college registration number"
                        className={inputClass}
                      />
                    </Field>

                    <PhoneInput
                      value={phone}
                      onChange={setPhone}
                      label="Your Mobile Number"
                      required
                    />

                    <div className="space-y-4 pt-2 border-t border-amber-100">
                      <p className="text-xs font-bold text-amber-700 uppercase tracking-wide">HOD Details</p>
                      <Field icon={UserCog} label="HOD Name">
                        <input
                          type="text"
                          value={hodName}
                          onChange={(e) => setHodName(e.target.value)}
                          required
                          placeholder="HOD's full name"
                          className={inputClass}
                        />
                      </Field>
                      <PhoneInput
                        value={hodPhone}
                        onChange={setHodPhone}
                        label="HOD Mobile Number"
                        required
                      />
                    </div>
                  </div>
                )}

                {/* Staff-specific fields */}
                {role === 'STAFF' && (
                  <div className="space-y-4 p-4 rounded-xl bg-cyan-50/40 border border-cyan-100">
                    <p className="text-xs font-bold text-cyan-700 uppercase tracking-wide">Staff Details</p>

                    <Field icon={Briefcase} label="Staff Role / Designation">
                      <input
                        type="text"
                        value={staffRole}
                        onChange={(e) => setStaffRole(e.target.value)}
                        required
                        placeholder="e.g. Library Staff, Transport Staff"
                        className={inputClass}
                      />
                    </Field>

                    <Field icon={GraduationCap} label="Registration / Employee ID">
                      <input
                        type="text"
                        value={rollNumber}
                        onChange={(e) => setRollNumber(e.target.value)}
                        placeholder="Your college employee ID"
                        className={inputClass}
                      />
                    </Field>

                    <PhoneInput
                      value={phone}
                      onChange={setPhone}
                      label="Your Mobile Number"
                      required
                    />

                    <div className="space-y-4 pt-2 border-t border-cyan-100">
                      <p className="text-xs font-bold text-cyan-700 uppercase tracking-wide">HOD Details</p>
                      <Field icon={UserCog} label="HOD Name">
                        <input
                          type="text"
                          value={hodName}
                          onChange={(e) => setHodName(e.target.value)}
                          required
                          placeholder="HOD's full name"
                          className={inputClass}
                        />
                      </Field>
                      <PhoneInput
                        value={hodPhone}
                        onChange={setHodPhone}
                        label="HOD Mobile Number"
                        required
                      />
                    </div>
                  </div>
                )}

                {/* HOD-specific: no extra fields needed */}
                {role === 'HOD' && (
                  <div className="p-4 rounded-xl bg-emerald-50/40 border border-emerald-100">
                    <p className="text-xs text-emerald-700">
                      As Head of Department, you will receive leave requests forwarded by mentors (TGs) and direct requests from faculty.
                    </p>
                  </div>
                )}

                {/* Guard-specific */}
                {role === 'GUARD' && (
                  <div className="p-4 rounded-xl bg-rose-50/40 border border-rose-100">
                    <p className="text-xs text-rose-700">
                      Security guards verify passes at the main gate using QR scanning or manual token entry.
                    </p>
                  </div>
                )}
              </>
            )}

            {/* Email */}
            <Field icon={Mail} label="Email">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="you@campus.edu"
                className={inputClass}
              />
            </Field>

            {/* Password */}
            <Field icon={Lock} label="Password">
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                placeholder="Minimum 6 characters"
                className={inputClass}
              />
            </Field>

            {error && (
              <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-sm">
                <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 transition-colors shadow-sm disabled:opacity-50"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {mode === 'signup' ? 'Creating account...' : 'Signing in...'}
                </>
              ) : (
                mode === 'signup' ? 'Create Account' : 'Sign In'
              )}
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-slate-400 mt-4">
          {mode === 'login'
            ? "Don't have an account? Switch to Create Account above."
            : 'Already have an account? Switch to Sign In above.'}
        </p>
      </div>
    </div>
  );
}
