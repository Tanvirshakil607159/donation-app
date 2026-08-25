import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/AuthContext';
import { Plus, Search, Edit2, Trash2, Tag } from 'lucide-react';
import Modal from '../components/Modal';

export default function Members() {
  const { isSuperAdmin } = useAuth();
  const [members, setMembers] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('members');
  
  // Modal states
  const [isMemberModalOpen, setMemberModalOpen] = useState(false);
  const [isCatModalOpen, setCatModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form states
  const [memberForm, setMemberForm] = useState({ member_code: '', full_name: '', phone: '', category_id: '' });
  const [catForm, setCatForm] = useState({ name: '', default_amount: 500 });

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    setLoading(true);
    try {
      const { data: catData } = await supabase.from('member_categories').select('*').order('name');
      if (catData) setCategories(catData);

      const { data: memData } = await supabase.from('members')
        .select('*, category:category_id(name)')
        .order('created_at', { ascending: false });
      if (memData) setMembers(memData);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  }

  async function handleAddMember(e) {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      let code = memberForm.member_code;
      if (!code) {
        let maxNum = 0;
        members.forEach(m => {
          if (m.member_code && m.member_code.toUpperCase().startsWith('U13')) {
            const numStr = m.member_code.replace(/^U13-?/i, '');
            const num = parseInt(numStr, 10);
            if (!isNaN(num) && num > maxNum) {
              maxNum = num;
            }
          }
        });
        const nextNum = maxNum + 1;
        code = `U13${String(nextNum).padStart(3, '0')}`;
      }
      
      const { error } = await supabase.from('members').insert({
        member_code: code,
        full_name: memberForm.full_name,
        phone: memberForm.phone,
        category_id: memberForm.category_id || null,
        status: 'active'
      });
      
      if (error) throw error;
      setMemberModalOpen(false);
      setMemberForm({ member_code: '', full_name: '', phone: '', category_id: '' });
      fetchData();
    } catch (error) {
      alert('Error adding member: ' + error.message);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleAddCategory(e) {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const { error } = await supabase.from('member_categories').insert(catForm);
      if (error) throw error;
      setCatModalOpen(false);
      setCatForm({ name: '', default_amount: 500 });
      fetchData();
    } catch (error) {
      alert('Error adding category: ' + error.message);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleDeleteMember(id, name) {
    if (!window.confirm(`Are you sure you want to permanently delete member ${name}?`)) return;
    
    try {
      const { error } = await supabase.from('members').delete().eq('id', id);
      if (error) throw error;
      fetchData();
    } catch (error) {
      alert('Error deleting member: ' + error.message);
    }
  }

  return (
    <div className="animate-fade-in">
      <div className="flex-between" style={{ marginBottom: '2rem' }}>
        <div>
          <h1>Members</h1>
          <p style={{ color: 'var(--text-muted)' }}>Manage foundation members and their categories.</p>
        </div>
        <div style={{ display: 'flex', gap: '1rem' }}>
          <button className="btn btn-secondary" onClick={() => setActiveTab('categories')}>
            <Tag size={18} style={{ marginRight: '0.5rem' }} /> Categories
          </button>
          <button className="btn btn-primary" onClick={() => setMemberModalOpen(true)}>
            <Plus size={18} style={{ marginRight: '0.5rem' }} /> Add Member
          </button>
        </div>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {activeTab === 'categories' ? (
          <div style={{ padding: '2rem' }}>
            <div className="flex-between" style={{ marginBottom: '1.5rem' }}>
              <h2 style={{ margin: 0 }}>Member Categories</h2>
              <button className="btn btn-secondary" onClick={() => setCatModalOpen(true)}>
                <Plus size={18} style={{ marginRight: '0.5rem' }} /> New Category
              </button>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead>
                <tr style={{ backgroundColor: 'var(--bg-elevated)', borderBottom: '1px solid var(--border)' }}>
                  <th style={{ padding: '1rem', fontWeight: 500 }}>Category Name</th>
                  <th style={{ padding: '1rem', fontWeight: 500 }}>Default Amount (৳)</th>
                </tr>
              </thead>
              <tbody>
                {categories.map(c => (
                  <tr key={c.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '1rem' }}>{c.name}</td>
                    <td style={{ padding: '1rem', fontFamily: 'var(--font-mono)' }}>{c.default_amount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <>
            <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--border)', display: 'flex', gap: '1rem' }}>
              <div style={{ position: 'relative', flex: 1 }}>
                <Search size={18} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                <input type="text" className="input-field" placeholder="Search members by name, code or phone..." style={{ paddingLeft: '2.75rem' }} />
              </div>
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                <thead>
                  <tr style={{ backgroundColor: 'var(--bg-elevated)', borderBottom: '1px solid var(--border)' }}>
                    <th style={{ padding: '1rem 1.5rem', fontWeight: 500, color: 'var(--text-muted)', fontSize: '0.875rem' }}>Code</th>
                    <th style={{ padding: '1rem 1.5rem', fontWeight: 500, color: 'var(--text-muted)', fontSize: '0.875rem' }}>Name</th>
                    <th style={{ padding: '1rem 1.5rem', fontWeight: 500, color: 'var(--text-muted)', fontSize: '0.875rem' }}>Phone</th>
                    <th style={{ padding: '1rem 1.5rem', fontWeight: 500, color: 'var(--text-muted)', fontSize: '0.875rem' }}>Category</th>
                    <th style={{ padding: '1rem 1.5rem', fontWeight: 500, color: 'var(--text-muted)', fontSize: '0.875rem' }}>Status</th>
                    {isSuperAdmin && <th style={{ padding: '1rem 1.5rem', fontWeight: 500, color: 'var(--text-muted)', fontSize: '0.875rem' }}>Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan="5" style={{ padding: '3rem', textAlign: 'center' }}>Loading data...</td></tr>
                  ) : members.length === 0 ? (
                    <tr><td colSpan="5" style={{ padding: '3rem', textAlign: 'center' }}>No members found.</td></tr>
                  ) : (
                    members.map(member => (
                      <tr key={member.id} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '1rem 1.5rem', fontFamily: 'var(--font-mono)', fontSize: '0.875rem' }}>{member.member_code}</td>
                        <td style={{ padding: '1rem 1.5rem', fontWeight: 500 }}>{member.full_name}</td>
                        <td style={{ padding: '1rem 1.5rem', color: 'var(--text-muted)' }}>{member.phone}</td>
                        <td style={{ padding: '1rem 1.5rem' }}>
                          <span style={{ padding: '0.25rem 0.75rem', borderRadius: '1rem', backgroundColor: 'var(--bg-elevated)', fontSize: '0.75rem', fontWeight: 500 }}>
                            {member.category?.name || 'Uncategorized'}
                          </span>
                        </td>
                        <td style={{ padding: '1rem 1.5rem' }}>
                          <span style={{ padding: '0.25rem 0.75rem', borderRadius: '1rem', backgroundColor: member.status === 'active' ? 'var(--success-bg)' : 'var(--danger-bg)', color: member.status === 'active' ? 'var(--success)' : 'var(--danger)', fontSize: '0.75rem', fontWeight: 600 }}>
                            {member.status}
                          </span>
                        </td>
                        {isSuperAdmin && (
                          <td style={{ padding: '1rem 1.5rem' }}>
                            <button 
                              className="btn" 
                              style={{ padding: '0.5rem', color: 'var(--danger)', backgroundColor: 'transparent' }}
                              onClick={() => handleDeleteMember(member.id, member.full_name)}
                              title="Delete Member"
                            >
                              <Trash2 size={16} />
                            </button>
                          </td>
                        )}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {/* Add Member Modal */}
      <Modal isOpen={isMemberModalOpen} onClose={() => setMemberModalOpen(false)} title="Add New Member">
        <form onSubmit={handleAddMember} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>Member Code (Optional)</label>
            <input type="text" className="input-field" placeholder="Leave blank to auto-generate" value={memberForm.member_code} onChange={e => setMemberForm({...memberForm, member_code: e.target.value})} />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>Full Name</label>
            <input required type="text" className="input-field" value={memberForm.full_name} onChange={e => setMemberForm({...memberForm, full_name: e.target.value})} />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>Phone Number</label>
            <input required type="tel" className="input-field" value={memberForm.phone} onChange={e => setMemberForm({...memberForm, phone: e.target.value})} />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>Category</label>
            <select className="input-field" value={memberForm.category_id} onChange={e => setMemberForm({...memberForm, category_id: e.target.value})}>
              <option value="">Select Category (Optional)</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '1rem' }}>
            <button type="button" className="btn btn-secondary" onClick={() => setMemberModalOpen(false)}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={isSubmitting}>{isSubmitting ? 'Saving...' : 'Save Member'}</button>
          </div>
        </form>
      </Modal>

      {/* Add Category Modal */}
      <Modal isOpen={isCatModalOpen} onClose={() => setCatModalOpen(false)} title="Add Member Category">
        <form onSubmit={handleAddCategory} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>Category Name</label>
            <input required type="text" className="input-field" value={catForm.name} onChange={e => setCatForm({...catForm, name: e.target.value})} />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>Default Monthly Amount (৳)</label>
            <input required type="number" className="input-field" value={catForm.default_amount} onChange={e => setCatForm({...catForm, default_amount: Number(e.target.value)})} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '1rem' }}>
            <button type="button" className="btn btn-secondary" onClick={() => setCatModalOpen(false)}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={isSubmitting}>{isSubmitting ? 'Saving...' : 'Save Category'}</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
