import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import { supabase } from '@/lib/supabase';
import type { User, PassRequest, SystemSettings } from '@/types';

interface AppContextValue {
  currentUser: User | null;
  passes: PassRequest[];
  settings: SystemSettings | null;
  departments: string[];
  loading: boolean;
  signOut: () => Promise<void>;
  refreshPasses: () => Promise<void>;
  refreshSettings: () => Promise<void>;
}

const AppContext = createContext<AppContextValue | undefined>(undefined);

export function AppProvider({ children }: { children: ReactNode }) {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [passes, setPasses] = useState<PassRequest[]>([]);
  const [settings, setSettings] = useState<SystemSettings | null>(null);
  const [departments, setDepartments] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  const loadUserProfile = useCallback(async () => {
    const { data: rpcData, error: rpcError } = await supabase.rpc('get_current_user');
    if (rpcError || !rpcData?.success) {
      setCurrentUser(null);
      setLoading(false);
      return;
    }
    setCurrentUser(rpcData.user as User);
  }, []);

  // Init: check session + listen for auth changes
  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        await loadUserProfile();
      } else {
        setLoading(false);
      }
    })();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      (async () => {
        if (session) {
          // Retry profile load — during signup the profile row may not exist yet
          // on the first onAuthStateChange fire
          let retries = 0;
          while (retries < 3) {
            const { data: rpcData } = await supabase.rpc('get_current_user');
            if (rpcData?.success) {
              setCurrentUser(rpcData.user as User);
              break;
            }
            retries++;
            if (retries < 3) await new Promise((r) => setTimeout(r, 500));
          }
          if (retries >= 3) {
            setCurrentUser(null);
          }
          setLoading(false);
        } else {
          setCurrentUser(null);
          setLoading(false);
        }
      })();
    });

    return () => subscription.unsubscribe();
  }, [loadUserProfile]);

  // Load departments + settings when user is set
  useEffect(() => {
    if (!currentUser) return;

    (async () => {
      const [{ data: deptData }, { data: settingsData }] = await Promise.all([
        supabase.from('departments').select('name').order('name'),
        supabase.from('system_settings').select('*').eq('id', 1).maybeSingle(),
      ]);

      if (deptData) setDepartments(deptData.map((d: { name: string }) => d.name));
      if (settingsData) setSettings(settingsData as SystemSettings);
    })();
  }, [currentUser]);

  const refreshPasses = useCallback(async () => {
    const { data, error } = await supabase
      .from('pass_requests')
      .select('*, student:users!pass_requests_student_id_fkey(*), approver:users!pass_requests_approved_by_user_id_fkey(*)')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error loading passes:', error);
      return;
    }
    setPasses((data || []) as PassRequest[]);
  }, []);

  const refreshSettings = useCallback(async () => {
    const { data } = await supabase
      .from('system_settings')
      .select('*')
      .eq('id', 1)
      .maybeSingle();
    if (data) setSettings(data as SystemSettings);
  }, []);

  // Load passes + realtime when user is set
  useEffect(() => {
    if (!currentUser) return;

    refreshPasses();

    const channel = supabase
      .channel('gateflow-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pass_requests' }, () => {
        refreshPasses();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'system_settings' }, () => {
        refreshSettings();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentUser, refreshPasses, refreshSettings]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setCurrentUser(null);
    setPasses([]);
    setSettings(null);
  }, []);

  return (
    <AppContext.Provider
      value={{ currentUser, passes, settings, departments, loading, signOut, refreshPasses, refreshSettings }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
