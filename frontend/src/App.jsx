import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './lib/AuthContext';
import { supabase } from './lib/supabase';
import Layout from './components/Layout';
import Landing from './pages/Landing';
import DonationPortal from './pages/DonationPortal';
import Dashboard from './pages/Dashboard';
import Members from './pages/Members';
import HR from './pages/HR';
import Accounts from './pages/Accounts';
import Reports from './pages/Reports';
import Settings from './pages/Settings';
import SmsGateway from './pages/SmsGateway';
import Login from './pages/Login';
import './index.css';

// Auth Guard Component
function RequireAuth({ children }) {
  const { session, adminProfile, loading } = useAuth();
  const location = useLocation();

  if (loading) return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Loading secure portal...</div>;
  if (!session) return <Navigate to="/login" state={{ from: location }} replace />;
  
  // If they have a session but no admin profile, they were likely deleted or are not an admin.
  if (session && !adminProfile) {
    supabase.auth.signOut();
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return children;
}

function App() {
  return (
    <AuthProvider>
      <Router basename={import.meta.env.BASE_URL}>
        <Routes>
          {/* Public Routes */}
          <Route path="/" element={<Landing />} />
          <Route path="/donate" element={<DonationPortal />} />
          <Route path="/login" element={<Login />} />
          
          {/* Admin Routes with Layout and Auth Guard */}
          <Route path="/admin" element={<RequireAuth><Layout /></RequireAuth>}>
            <Route index element={<Dashboard />} />
            <Route path="members" element={<Members />} />
            <Route path="hr" element={<HR />} />
            <Route path="accounts" element={<Accounts />} />
            <Route path="sms" element={<SmsGateway />} />
            <Route path="reports" element={<Reports />} />
            <Route path="settings" element={<Settings />} />
          </Route>
          
          {/* Fallback Route */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Router>
    </AuthProvider>
  );
}

export default App;
