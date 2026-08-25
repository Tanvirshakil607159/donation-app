import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/AuthContext';
import { LayoutDashboard, Users, UserCog, Wallet, Settings, LogOut, MessageSquare, Home, User, FileText } from 'lucide-react';

export default function Layout() {
  const navigate = useNavigate();
  const { adminProfile } = useAuth();

  async function handleLogout() {
    await supabase.auth.signOut();
    navigate('/login');
  }
  const navItems = [
    { to: "/admin", icon: <LayoutDashboard size={20} />, label: "Dashboard", end: true },
    { to: "/admin/members", icon: <Users size={20} />, label: "Members" },
    { to: "/admin/hr", icon: <UserCog size={20} />, label: "HR & Payroll" },
    { to: "/admin/accounts", icon: <Wallet size={20} />, label: "Income & Expense" },
    { to: "/admin/sms", icon: <MessageSquare size={20} />, label: "SMS Gateway" },
    { to: "/admin/reports", icon: <FileText size={20} />, label: "Reports" },
    { to: "/admin/settings", icon: <Settings size={20} />, label: "Settings" },
  ];

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', backgroundColor: 'var(--bg-base)' }}>
      {/* Sidebar */}
      <aside style={{
        width: '260px',
        backgroundColor: 'var(--bg-surface)',
        borderRight: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0
      }}>
        <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--border)' }}>
          <h2 style={{ fontSize: '1.25rem', color: 'var(--primary)', margin: 0 }}>Welfare Society Foundation Portal</h2>
          <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>Admin Portal</p>
        </div>
        
        <nav style={{ flex: 1, padding: '1.5rem 1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              style={({ isActive }) => ({
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                padding: '0.75rem 1rem',
                borderRadius: 'var(--radius-md)',
                color: isActive ? 'var(--primary)' : 'var(--text-main)',
                backgroundColor: isActive ? 'var(--bg-elevated)' : 'transparent',
                fontWeight: isActive ? 500 : 400,
              })}
            >
              {item.icon}
              {item.label}
            </NavLink>
          ))}
        </nav>
        
        <div style={{ padding: '1.5rem', borderTop: '1px solid var(--border)' }}>
          <button className="btn btn-secondary" style={{ width: '100%', gap: '0.5rem' }} onClick={handleLogout}>
            <LogOut size={18} />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <header style={{
          height: '64px',
          flexShrink: 0,
          backgroundColor: 'var(--bg-surface)',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          padding: '0 2rem',
          justifyContent: 'flex-end'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <NavLink to="/" className="btn btn-secondary" style={{ fontSize: '0.875rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Home size={16} /> Home
            </NavLink>
            <NavLink to="/donate" className="btn btn-secondary" style={{ fontSize: '0.875rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <User size={16} /> Member Portal
            </NavLink>
            <div style={{ width: '32px', height: '32px', borderRadius: '50%', backgroundColor: 'var(--primary-light)' }}></div>
            <span style={{ fontWeight: 500 }}>{adminProfile?.full_name || 'Admin User'}</span>
          </div>
        </header>

        
        <div style={{ padding: '2rem', flex: 1, overflowY: 'auto' }}>
          <Outlet />
        </div>
      </main>
    </div>
  );
}
