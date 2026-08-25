import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Search, MessageSquare, AlertTriangle, Send, RefreshCw, Clock } from 'lucide-react';
import Modal from '../components/Modal';

export default function SmsGateway() {
  const [logs, setLogs] = useState([]);
  const [members, setMembers] = useState([]);
  const [pendingPayments, setPendingPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState('pending');

  // Modal State
  const [isModalOpen, setModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [form, setForm] = useState({ member_id: '', phone: '', message: '' });

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    setLoading(true);
    try {
      const { data: membersData } = await supabase.from('members').select('id, full_name, phone').order('full_name');
      if (membersData) setMembers(membersData);

      const { data: logsData } = await supabase
        .from('sms_logs')
        .select('*')
        .order('created_at', { ascending: false });

      if (logsData) setLogs(logsData);

      const currentMonthStr = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-01`;
      const { data: pendingData } = await supabase
        .from('donations')
        .select(`*, member:member_id(full_name, phone)`)
        .eq('status', 'PENDING')
        .lte('donation_month', currentMonthStr);
        
      if (pendingData) setPendingPayments(pendingData);
    } catch (error) {
      console.error('Error fetching SMS data:', error);
    } finally {
      setLoading(false);
    }
  }

  async function handleSendSms(e) {
    e.preventDefault();
    if (!form.phone || !form.message) return alert('Phone and Message are required.');
    
    setIsSubmitting(true);
    let status = 'FAILED';
    try {
      let apiKey = localStorage.getItem('BULKSMSBD_API_KEY');
      let senderId = localStorage.getItem('BULKSMSBD_SENDER_ID');
      
      if (apiKey && senderId) {
        const number = form.phone.replace(/[^0-9]/g, '');
        const url = `https://bulksmsbd.net/api/smsapi?api_key=${apiKey}&type=text&number=${number}&senderid=${senderId}&message=${encodeURIComponent(form.message)}`;
        const res = await fetch(url);
        const text = await res.text();
        if (res.ok && (text.includes('202') || text.toLowerCase().includes('success'))) {
          status = 'SENT';
        } else {
          console.error("SMS API Error:", text);
        }
      } else {
        alert("Sending in Demo Mode. Configure keys for real SMS.");
        status = 'SENT';
      }

      await supabase.from('sms_logs').insert({
        phone: form.phone,
        message: form.message,
        status: status
      });
      
      setModalOpen(false);
      setForm({ member_id: '', phone: '', message: '' });
      fetchData();
    } catch (error) {
      alert('Error sending SMS: ' + error.message);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleSendBulkReminders() {
    if (pendingPayments.length === 0) return alert("No pending payments found.");
    
    let apiKey = localStorage.getItem('BULKSMSBD_API_KEY');
    let senderId = localStorage.getItem('BULKSMSBD_SENDER_ID');
    
    if (!apiKey || !senderId) {
      apiKey = prompt("Please enter your BulkSMSBD API Key (or cancel for Demo Mode):", apiKey || "");
      if (apiKey === null) return;
      senderId = prompt("Please enter your BulkSMSBD Sender ID:", senderId || "");
      if (senderId === null) return;

      if (apiKey && senderId) {
        localStorage.setItem('BULKSMSBD_API_KEY', apiKey);
        localStorage.setItem('BULKSMSBD_SENDER_ID', senderId);
      } else {
        alert("Running in Demo Mode. Actual SMS will NOT be sent.");
      }
    }

    setIsSubmitting(true);
    let sentCount = 0;
    try {
      for (const donation of pendingPayments) {
        if (!donation.member?.phone) continue;
        
        const message = `Hello ${donation.member.full_name}, your payment of ৳${donation.amount} is PENDING. Please complete the transaction.`;
        const number = donation.member.phone.replace(/[^0-9]/g, '');
        
        let status = 'FAILED';
        if (apiKey && senderId) {
          const url = `https://bulksmsbd.net/api/smsapi?api_key=${apiKey}&type=text&number=${number}&senderid=${senderId}&message=${encodeURIComponent(message)}`;
          const res = await fetch(url);
          const text = await res.text();
          if (res.ok && (text.includes('202') || text.toLowerCase().includes('success'))) {
            status = 'SENT';
            sentCount++;
          }
        } else {
          status = 'SENT';
          sentCount++;
        }
        
        await supabase.from('sms_logs').insert({ phone: donation.member.phone, message: message, status: status });
      }
      alert(`Successfully processed ${sentCount} reminders!`);
      fetchData();
    } catch (err) {
      alert("Error sending bulk SMS: " + err.message);
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleMemberSelect(memberId) {
    const mem = members.find(m => m.id === memberId);
    setForm(prev => ({ 
      ...prev, 
      member_id: memberId, 
      phone: mem?.phone || prev.phone 
    }));
  }

  // Metrics
  const totalSent = logs.filter(l => l.status === 'SENT').length;
  const totalPending = logs.filter(l => l.status === 'PENDING').length;
  const totalFailed = logs.filter(l => l.status === 'FAILED').length;

  // Filter
  const displayLogs = logs.filter(l => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return l.phone?.toLowerCase().includes(term) || l.message?.toLowerCase().includes(term);
  });

  return (
    <div className="animate-fade-in">
      <div className="flex-between" style={{ marginBottom: '2rem' }}>
        <div>
          <h1>SMS Gateway</h1>
          <p style={{ color: 'var(--text-muted)' }}>Manage and track all outbound text messages.</p>
        </div>
        <div style={{ display: 'flex', gap: '1rem' }}>
          <button className="btn btn-secondary" onClick={fetchData}>
            <RefreshCw size={18} style={{ marginRight: '0.5rem' }} /> Refresh
          </button>
          <button className="btn btn-primary" onClick={() => setModalOpen(true)}>
            <Send size={18} style={{ marginRight: '0.5rem' }} /> Send SMS
          </button>
        </div>
      </div>

      {/* Metrics Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.5rem', marginBottom: '2rem' }}>
        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '1rem', borderLeft: '4px solid var(--success)' }}>
          <div style={{ padding: '1rem', backgroundColor: 'var(--success-bg)', borderRadius: 'var(--radius-md)' }}>
            <MessageSquare size={24} color="var(--success)" />
          </div>
          <div>
            <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--text-muted)' }}>Successfully Sent</p>
            <h2 style={{ margin: 0, fontSize: '1.5rem' }}>{totalSent}</h2>
          </div>
        </div>
        
        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '1rem', borderLeft: '4px solid var(--warning)' }}>
          <div style={{ padding: '1rem', backgroundColor: 'var(--warning-bg)', borderRadius: 'var(--radius-md)' }}>
            <Clock size={24} color="var(--warning)" />
          </div>
          <div>
            <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--text-muted)' }}>Pending Delivery</p>
            <h2 style={{ margin: 0, fontSize: '1.5rem' }}>{totalPending}</h2>
          </div>
        </div>

        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '1rem', borderLeft: '4px solid var(--danger)' }}>
          <div style={{ padding: '1rem', backgroundColor: 'var(--danger-bg)', borderRadius: 'var(--radius-md)' }}>
            <AlertTriangle size={24} color="var(--danger)" />
          </div>
          <div>
            <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--text-muted)' }}>Failed Messages</p>
            <h2 style={{ margin: 0, fontSize: '1.5rem' }}>{totalFailed}</h2>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '2rem', borderBottom: '1px solid var(--border)', marginBottom: '2rem' }}>
        <button 
          onClick={() => setActiveTab('pending')}
          style={{ 
            background: 'none', border: 'none', padding: '1rem 0', 
            fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem',
            color: activeTab === 'pending' ? 'var(--primary)' : 'var(--text-muted)',
            borderBottom: activeTab === 'pending' ? '2px solid var(--primary)' : '2px solid transparent',
            marginBottom: '-1px'
          }}>
          <AlertTriangle size={18} /> Pending Payments
        </button>
        <button 
          onClick={() => setActiveTab('logs')}
          style={{ 
            background: 'none', border: 'none', padding: '1rem 0', 
            fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem',
            color: activeTab === 'logs' ? 'var(--primary)' : 'var(--text-muted)',
            borderBottom: activeTab === 'logs' ? '2px solid var(--primary)' : '2px solid transparent',
            marginBottom: '-1px'
          }}>
          <MessageSquare size={18} /> SMS Logs
        </button>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {activeTab === 'pending' && (
          <>
            <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ margin: 0 }}>Pending Payment Reminders</h3>
                <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.875rem' }}>Members with pending dues requiring SMS notification.</p>
              </div>
              <button className="btn btn-primary" onClick={handleSendBulkReminders} disabled={isSubmitting || pendingPayments.length === 0}>
                {isSubmitting ? 'Sending...' : 'Send Reminders to All'}
              </button>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                <thead>
                  <tr style={{ backgroundColor: 'var(--bg-elevated)', borderBottom: '1px solid var(--border)' }}>
                    <th style={{ padding: '1rem 1.5rem', fontWeight: 500, color: 'var(--text-muted)', fontSize: '0.875rem' }}>Transaction ID</th>
                    <th style={{ padding: '1rem 1.5rem', fontWeight: 500, color: 'var(--text-muted)', fontSize: '0.875rem' }}>Member Name</th>
                    <th style={{ padding: '1rem 1.5rem', fontWeight: 500, color: 'var(--text-muted)', fontSize: '0.875rem' }}>Phone Number</th>
                    <th style={{ padding: '1rem 1.5rem', fontWeight: 500, color: 'var(--text-muted)', fontSize: '0.875rem' }}>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan="4" style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>Loading...</td></tr>
                  ) : pendingPayments.length === 0 ? (
                    <tr><td colSpan="4" style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>No pending payments right now.</td></tr>
                  ) : (
                    pendingPayments.map(p => (
                      <tr key={p.id} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '1rem 1.5rem', fontFamily: 'var(--font-mono)', fontSize: '0.875rem' }}>{p.tran_id}</td>
                        <td style={{ padding: '1rem 1.5rem', fontWeight: 500 }}>{p.member?.full_name}</td>
                        <td style={{ padding: '1rem 1.5rem', fontFamily: 'var(--font-mono)' }}>{p.member?.phone}</td>
                        <td style={{ padding: '1rem 1.5rem', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>৳{p.amount}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}

        {activeTab === 'logs' && (
          <>
            <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--border)' }}>
              <div style={{ position: 'relative', maxWidth: '300px' }}>
                <Search size={18} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                <input type="text" className="input-field" placeholder="Search phone or message..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} style={{ paddingLeft: '2.75rem' }} />
              </div>
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ backgroundColor: 'var(--bg-elevated)', borderBottom: '1px solid var(--border)' }}>
                <th style={{ padding: '1rem 1.5rem', fontWeight: 500, color: 'var(--text-muted)', fontSize: '0.875rem' }}>Date</th>
                <th style={{ padding: '1rem 1.5rem', fontWeight: 500, color: 'var(--text-muted)', fontSize: '0.875rem' }}>Phone Number</th>
                <th style={{ padding: '1rem 1.5rem', fontWeight: 500, color: 'var(--text-muted)', fontSize: '0.875rem' }}>Message</th>
                <th style={{ padding: '1rem 1.5rem', fontWeight: 500, color: 'var(--text-muted)', fontSize: '0.875rem' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="4" style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>Loading SMS logs...</td></tr>
              ) : displayLogs.length === 0 ? (
                <tr><td colSpan="4" style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>No messages found.</td></tr>
              ) : (
                displayLogs.map(log => (
                  <tr key={log.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '1rem 1.5rem', color: 'var(--text-muted)', fontSize: '0.875rem' }}>{new Date(log.created_at).toLocaleString()}</td>
                    <td style={{ padding: '1rem 1.5rem', fontFamily: 'var(--font-mono)', fontWeight: 500 }}>{log.phone}</td>
                    <td style={{ padding: '1rem 1.5rem', maxWidth: '300px' }}>
                      <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontSize: '0.875rem' }}>{log.message}</div>
                    </td>
                    <td style={{ padding: '1rem 1.5rem' }}>
                      <span style={{ 
                        padding: '0.25rem 0.75rem', borderRadius: '1rem', 
                        backgroundColor: log.status === 'SENT' ? 'var(--success-bg)' : log.status === 'PENDING' ? 'var(--warning-bg)' : 'var(--danger-bg)', 
                        color: log.status === 'SENT' ? 'var(--success)' : log.status === 'PENDING' ? 'var(--warning)' : 'var(--danger)',
                        fontSize: '0.75rem', fontWeight: 600
                      }}>
                            {log.status}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {/* Manual Send Modal */}
      <Modal isOpen={isModalOpen} onClose={() => setModalOpen(false)} title="Send SMS Message">
        <form onSubmit={handleSendSms} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>Select Member (Optional)</label>
            <select className="input-field" value={form.member_id} onChange={e => handleMemberSelect(e.target.value)}>
              <option value="">-- Custom Phone Number --</option>
              {members.map(m => <option key={m.id} value={m.id}>{m.full_name} ({m.phone})</option>)}
            </select>
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>Phone Number</label>
            <input required type="text" className="input-field" value={form.phone} onChange={e => setForm({...form, phone: e.target.value})} placeholder="+8801..." />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>Message</label>
            <textarea required className="input-field" value={form.message} onChange={e => setForm({...form, message: e.target.value})} placeholder="Type your message here..." rows={4} maxLength={160} />
            <div style={{ textAlign: 'right', fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
              {form.message.length} / 160 characters
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '1rem' }}>
            <button type="button" className="btn btn-secondary" onClick={() => setModalOpen(false)}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={isSubmitting}>{isSubmitting ? 'Sending...' : 'Send SMS'}</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
