import { useState } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/AuthContext';
import { LayoutDashboard, Users, UserCog, Wallet, Settings, LogOut, MessageSquare, Home, User, FileText, Menu, X } from 'lucide-react';

export default function Layout() {
  const navigate = useNavigate();
  const { adminProfile } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);

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
    <div className="admin-layout">
      {/* Sidebar Overlay (Mobile) */}
      <div 
        className={`sidebar-overlay ${sidebarOpen ? 'open' : ''}`} 
        onClick={() => setSidebarOpen(false)}
      ></div>

      {/* Sidebar */}
      <aside className={`admin-sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2 style={{ fontSize: '1.25rem', color: 'var(--primary)', margin: 0 }}>Welfare Society</h2>
            <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>Admin Portal</p>
          </div>
          <button className="mobile-menu-btn" onClick={() => setSidebarOpen(false)}>
            <X size={24} />
          </button>
        </div>
        
        <nav style={{ flex: 1, padding: '1.5rem 1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem', overflowY: 'auto' }}>
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              onClick={() => setSidebarOpen(false)}
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
      <main className="admin-main">
        <header className="admin-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <button className="mobile-menu-btn" onClick={() => setSidebarOpen(true)}>
              <Menu size={24} />
            </button>
            {/* Provide empty div space if no menu button to push right items to end */}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <NavLink to="/" className="btn btn-secondary" style={{ fontSize: '0.875rem', display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 0.75rem' }}>
              <Home size={16} /> <span className="header-btn-text">Home</span>
            </NavLink>
            <NavLink to="/donate" className="btn btn-secondary" style={{ fontSize: '0.875rem', display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 0.75rem' }}>
              <User size={16} /> <span className="header-btn-text">Portal</span>
            </NavLink>
            <div style={{ width: '32px', height: '32px', borderRadius: '50%', backgroundColor: 'var(--primary-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 'bold' }}>
              {adminProfile?.full_name ? adminProfile.full_name.charAt(0).toUpperCase() : 'A'}
            </div>
            <span className="header-btn-text" style={{ fontWeight: 500 }}>{adminProfile?.full_name || 'Admin'}</span>
          </div>
        </header>

        <div style={{ padding: '1rem', flex: 1, overflowY: 'auto', backgroundColor: 'var(--bg-elevated)' }}>
          <Outlet />
        </div>
      </main>
    </div>
  );
}
