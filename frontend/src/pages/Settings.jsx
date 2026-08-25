import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/AuthContext';
import { Shield, ShieldAlert, Key, UserCheck, Trash2 } from 'lucide-react';
import Modal from '../components/Modal';

export default function Settings() {
  const { isSuperAdmin, adminProfile } = useAuth();
  const [roles, setRoles] = useState([]);
  const [admins, setAdmins] = useState([]);
  const [loading, setLoading] = useState(true);

  const [isAdminModalOpen, setAdminModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [adminForm, setAdminForm] = useState({ name: '', username: '', password: '', role_id: '' });

  useEffect(() => {
    fetchSecurityData();
  }, []);

  async function fetchSecurityData() {
    setLoading(true);
    try {
      const { data: rolesData } = await supabase
        .from('roles')
        .select('*')
        .order('name');
      if (rolesData) setRoles(rolesData);

      const { data: adminsData } = await supabase
        .from('app_admins')
        .select(`
          *,
          role:role_id(name)
        `);
      if (adminsData) setAdmins(adminsData);
    } catch (error) {
      console.error('Error fetching security data:', error);
    } finally {
      setLoading(false);
    }
  }

  async function handleAddAdmin(e) {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const hiddenEmail = `${adminForm.username.toLowerCase().trim()}@app.com`;

      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: hiddenEmail,
        password: adminForm.password,
      });

      if (authError) throw authError;

      const realUserId = authData.user?.id;
      if (!realUserId) {
        throw new Error("Failed to create auth user. Username may already be taken.");
      }

      // Now insert into app_admins with the valid foreign key
      const { error } = await supabase.from('app_admins').insert({
        user_id: realUserId,
        full_name: adminForm.name,
        email: hiddenEmail,
        role_id: adminForm.role_id
      });

      if (error) {
        if (error.message?.includes('violates foreign key constraint')) {
          throw new Error("This username is already registered. Please choose a different username.");
        }
        throw error;
      }

      setAdminModalOpen(false);
      setAdminForm({ name: '', username: '', password: '', role_id: '' });
      fetchSecurityData();
    } catch (error) {
      alert('Error adding admin: ' + error.message);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleDeleteAdmin(userId, name) {
    if (!window.confirm(`Are you sure you want to revoke admin access for ${name}?`)) return;
    
    try {
      const { error } = await supabase.from('app_admins').delete().eq('user_id', userId);
      if (error) throw error;
      fetchSecurityData();
    } catch (error) {
      alert('Error deleting admin: ' + error.message);
    }
  }

  return (
    <div className="animate-fade-in">
      <div className="flex-between" style={{ marginBottom: '2rem' }}>
        <div>
          <h1>Security & Roles</h1>
          <p style={{ color: 'var(--text-muted)' }}>Manage system access and administrator roles.</p>
        </div>
        <button className="btn btn-primary" onClick={() => setAdminModalOpen(true)}>
          <UserCheck size={18} style={{ marginRight: '0.5rem' }} /> Add Administrator
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
        {/* Roles Configuration */}
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.5rem' }}>
            <Shield color="var(--primary)" size={24} />
            <h3 style={{ margin: 0 }}>System Roles</h3>
          </div>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {loading ? (
              <p style={{ color: 'var(--text-muted)' }}>Loading roles...</p>
            ) : (
              roles.map(role => (
                <div key={role.id} style={{ padding: '1rem', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', backgroundColor: 'var(--bg-base)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h4 style={{ margin: 0, color: 'var(--text-main)' }}>{role.name}</h4>
                    <span style={{ fontSize: '0.75rem', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>{role.id.split('-')[0]}...</span>
                  </div>
                  <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>{role.description}</p>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Admin Users */}
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.5rem' }}>
            <Key color="var(--primary)" size={24} />
            <h3 style={{ margin: 0 }}>Administrator Accounts</h3>
          </div>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {loading ? (
              <p style={{ color: 'var(--text-muted)' }}>Loading admins...</p>
            ) : admins.length === 0 ? (
              <div style={{ padding: '2rem', textAlign: 'center', border: '1px dashed var(--border)', borderRadius: 'var(--radius-md)' }}>
                <ShieldAlert size={32} color="var(--warning)" style={{ marginBottom: '1rem' }} />
                <p style={{ color: 'var(--text-muted)' }}>No administrators found. Run the seed script in Supabase.</p>
              </div>
            ) : (
              admins.map(admin => (
                <div key={admin.user_id} style={{ padding: '1rem', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <h4 style={{ margin: 0 }}>{admin.full_name || 'Unnamed Admin'}</h4>
                    <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--text-muted)' }}>@{admin.email.split('@')[0]}</p>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <span style={{ 
                      padding: '0.25rem 0.75rem', borderRadius: '1rem', 
                      backgroundColor: 'var(--bg-elevated)', color: 'var(--text-main)',
                      fontSize: '0.75rem', fontWeight: 600
                    }}>
                      {admin.role?.name || 'No Role Assigned'}
                    </span>
                    {isSuperAdmin && admin.user_id !== adminProfile?.user_id && (
                      <button 
                        className="btn" 
                        style={{ padding: '0.5rem', color: 'var(--danger)', backgroundColor: 'transparent' }}
                        onClick={() => handleDeleteAdmin(admin.user_id, admin.full_name)}
                        title="Delete Admin"
                      >
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <Modal isOpen={isAdminModalOpen} onClose={() => setAdminModalOpen(false)} title="Add Administrator">
        <form onSubmit={handleAddAdmin} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>Full Name</label>
            <input required type="text" className="input-field" value={adminForm.name} onChange={e => setAdminForm({...adminForm, name: e.target.value})} />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>Username</label>
            <input required type="text" className="input-field" value={adminForm.username} onChange={e => setAdminForm({...adminForm, username: e.target.value})} placeholder="e.g. jdoe" />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>Password</label>
            <input required type="password" minLength="6" className="input-field" value={adminForm.password} onChange={e => setAdminForm({...adminForm, password: e.target.value})} placeholder="Minimum 6 characters" />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>Assign Role</label>
            <select required className="input-field" value={adminForm.role_id} onChange={e => setAdminForm({...adminForm, role_id: e.target.value})}>
              <option value="">Select a Role</option>
              {roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '1rem' }}>
            <button type="button" className="btn btn-secondary" onClick={() => setAdminModalOpen(false)}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={isSubmitting}>{isSubmitting ? 'Saving...' : 'Add Admin'}</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
