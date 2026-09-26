import { AppProvider, useApp } from '@/context/AppContext';
import { Navbar } from '@/components/Navbar';
import { AuthScreen } from '@/components/AuthScreen';
import { WhatsAppToastContainer } from '@/components/WhatsAppToast';
import { StudentDashboard } from '@/dashboards/StudentDashboard';
import { HodDashboard } from '@/dashboards/HodDashboard';
import { TgDashboard } from '@/dashboards/TgDashboard';
import { GuardDashboard } from '@/dashboards/GuardDashboard';
import { StaffDashboard } from '@/dashboards/StaffDashboard';
function DashboardRouter() {
  const { currentUser, loading } = useApp();

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-3 border-indigo-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-slate-500">Loading GateFlow...</p>
        </div>
      </div>
    );
  }

  if (!currentUser) {
    return <AuthScreen onAuthSuccess={() => {}} />;
  }

  switch (currentUser.role) {
    case 'STUDENT':
      return <StudentDashboard />;
    case 'HOD':
      return <HodDashboard />;
    case 'TG':
      return <TgDashboard />;
    case 'GUARD':
      return <GuardDashboard />;
    case 'STAFF':
      return <StaffDashboard />;
    default:
      return null;
  }
}

function App() {
  return (
    <AppProvider>
      <div className="min-h-screen bg-slate-50">
        <Navbar />
        <DashboardRouter />
        <WhatsAppToastContainer />
      </div>
    </AppProvider>
  );
}

export default App;
