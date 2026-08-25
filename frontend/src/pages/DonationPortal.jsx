import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { Search, CreditCard, CheckCircle2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import Modal from '../components/Modal';

export default function DonationPortal() {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  
  // Step 1 State
  const [lookup, setLookup] = useState({ 
    member_code: localStorage.getItem('saved_member_code') || '', 
    phone: localStorage.getItem('saved_member_phone') || '' 
  });
  const [member, setMember] = useState(null);
  const [error, setError] = useState('');
  const [successTxId, setSuccessTxId] = useState(null);

  // Step 2 State
  const [selectedMonths, setSelectedMonths] = useState([]);
  const [paidMonths, setPaidMonths] = useState([]);
  const [paymentHistory, setPaymentHistory] = useState([]);
  const [isStatementOpen, setStatementOpen] = useState(false);
  const [displayYear, setDisplayYear] = useState(new Date().getFullYear());
  
  const currentYear = new Date().getFullYear();
  const monthOptions = Array.from({ length: 12 }).map((_, i) => {
    const d = new Date(displayYear, i, 1);
    return {
      value: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
      label: d.toLocaleDateString('default', { month: 'long' })
    };
  }).filter(m => {
    const [mYear, mMonth] = m.value.split('-').map(Number);
    return (mYear > 2026) || (mYear === 2026 && mMonth >= 7);
  });

  async function performLookup(code, phone) {
    setLoading(true);
    setError('');
    try {
      const { data, error } = await supabase
        .from('members')
        .select('*, category:category_id(default_amount)')
        .eq('member_code', code)
        .eq('phone', phone)
        .eq('status', 'active')
        .single();
        
      if (error || !data) throw new Error('Member not found or inactive. Please check credentials.');
      
      // Save for convenience
      localStorage.setItem('saved_member_code', code);
      localStorage.setItem('saved_member_phone', phone);

      const { data: donations } = await supabase
        .from('donations')
        .select('*')
        .eq('member_id', data.id)
        .eq('status', 'SUCCESS')
        .order('paid_at', { ascending: false });
        
      if (donations) {
        setPaymentHistory(donations);
        setPaidMonths(donations.map(d => d.donation_month.substring(0, 7)));
      }

      setMember(data);
      setStep(2);
      return true;
    } catch (err) {
      setError(err.message);
      return false;
    } finally {
      setLoading(false);
    }
  }

  async function handleLookup(e) {
    if (e) e.preventDefault();
    await performLookup(lookup.member_code, lookup.phone);
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const paymentStatus = params.get('payment');
    const tranId = params.get('tran_id');
    
    if (paymentStatus === 'success' && tranId) {
      setSuccessTxId(tranId);
      // Clean up the URL so it doesn't stay there if they refresh
      window.history.replaceState({}, document.title, window.location.pathname);
      
      // Try to auto-login if they have saved credentials
      const savedCode = localStorage.getItem('saved_member_code');
      const savedPhone = localStorage.getItem('saved_member_phone');
      if (savedCode && savedPhone) {
        performLookup(savedCode, savedPhone);
      }
    } else if (paymentStatus === 'error' || paymentStatus === 'failed' || paymentStatus === 'cancelled') {
      setError(`Payment ${paymentStatus}: ${params.get('message') || 'Transaction failed or was cancelled.'}`);
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

  function toggleMonth(value) {
    if (paidMonths.includes(value)) return;
    if (selectedMonths.includes(value)) {
      setSelectedMonths(selectedMonths.filter(m => m !== value));
    } else {
      setSelectedMonths([...selectedMonths, value]);
    }
  }

  async function handlePayment() {
    if (selectedMonths.length === 0) return alert('Please select at least one month.');
    
    setLoading(true);
    try {
      const amount = (member.category?.default_amount || 500) * selectedMonths.length;
      
      const { data, error } = await supabase.functions.invoke('payment-init', {
        body: {
          member_code: member.member_code,
          phone: member.phone,
          amount: amount,
          donation_months: selectedMonths,
          return_url: window.location.href.split('?')[0]
        }
      });
      
      if (error) {
        let msg = error.message;
        try {
          if (error.context && typeof error.context.json === 'function') {
            const errData = await error.context.json();
            if (errData.error) msg = errData.error;
          }
        } catch (e) {}
        
        // AmarPay sandbox is frequently down/hanging, add a demo fallback
        if (confirm(`Payment initialization failed: ${msg}\n\nThe AmarPay Sandbox API appears to be down right now. Would you like to simulate a successful payment redirect for this demo?`)) {
            const demoTranId = `DON-DEMO-${Date.now()}`;
            window.location.href = `${window.location.pathname}?payment=success&tran_id=${demoTranId}`;
            return;
        } else {
            throw new Error(msg);
        }
      }
      if (data?.error) {
        if (confirm(`Payment initialization failed: ${data.error}\n\nWould you like to simulate a successful payment redirect for this demo?`)) {
            const demoTranId = `DON-DEMO-${Date.now()}`;
            window.location.href = `${window.location.pathname}?payment=success&tran_id=${demoTranId}`;
            return;
        } else {
            throw new Error(data.error);
        }
      }
      
      if (data?.gateway_url) {
        window.location.href = data.gateway_url;
      }
    } catch (err) {
      alert('Payment initialization failed: ' + err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: 'var(--bg-base)' }}>
      {/* Public Header */}
      <header style={{ backgroundColor: 'var(--bg-elevated)', padding: '1rem 2rem', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ margin: 0, color: 'var(--primary)' }}>Welfare Society Foundation Portal</h2>
        <Link to="/" className="btn btn-secondary" style={{ fontSize: '0.875rem' }}>Home</Link>
      </header>

      <main style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
        <div className="card animate-fade-in" style={{ width: '100%', maxWidth: '500px', padding: '2.5rem' }}>
          
          <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
            <h1 style={{ margin: '0 0 0.5rem 0', fontSize: '1.75rem' }}>Monthly Donation</h1>
            <p style={{ color: 'var(--text-muted)', margin: 0 }}>Securely pay your foundation dues online.</p>
          </div>

          {step === 1 && (
            <form onSubmit={handleLookup} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              {error && <div style={{ padding: '0.75rem', backgroundColor: 'var(--danger-bg)', color: 'var(--danger)', borderRadius: 'var(--radius-md)', fontSize: '0.875rem' }}>{error}</div>}
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>Member Code</label>
                <input required type="text" className="input-field" placeholder="e.g. MEM-20231010-123" value={lookup.member_code} onChange={e => setLookup({...lookup, member_code: e.target.value})} />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>Phone Number</label>
                <input required type="tel" className="input-field" placeholder="e.g. 01700000000" value={lookup.phone} onChange={e => setLookup({...lookup, phone: e.target.value})} />
              </div>
              <button type="submit" className="btn btn-primary" style={{ width: '100%', padding: '0.875rem', marginTop: '0.5rem' }} disabled={loading}>
                {loading ? 'Verifying...' : <><Search size={18} style={{ marginRight: '0.5rem' }} /> Verify Membership</>}
              </button>
            </form>
          )}

          {step === 2 && member && (
            <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              <div style={{ padding: '1rem', backgroundColor: 'var(--bg-elevated)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
                <p style={{ margin: '0 0 0.25rem 0', fontSize: '0.875rem', color: 'var(--text-muted)' }}>Welcome back,</p>
                <h3 style={{ margin: 0 }}>{member.full_name}</h3>
                <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.875rem', fontFamily: 'var(--font-mono)' }}>{member.member_code}</p>
                
                <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid var(--border)', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div>
                    <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-muted)' }}>Total Months Paid</p>
                    <p style={{ margin: '0.25rem 0 0 0', fontSize: '1.25rem', fontWeight: 600 }}>{paidMonths.length}</p>
                  </div>
                  <div>
                    <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-muted)' }}>Total Amount Paid</p>
                    <p style={{ margin: '0.25rem 0 0 0', fontSize: '1.25rem', fontWeight: 600 }}>৳{paidMonths.length * (member.category?.default_amount || 500)}</p>
                  </div>
                </div>
              </div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                  <label style={{ fontWeight: 600, margin: 0, fontSize: '0.95rem' }}>Select Months to Pay</label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', backgroundColor: 'var(--bg-elevated)', borderRadius: '20px', padding: '0.25rem', border: '1px solid var(--border)' }}>
                    <button 
                      type="button"
                      style={{ padding: '0.25rem 0.5rem', fontSize: '0.875rem', borderRadius: '16px', border: 'none', backgroundColor: 'transparent', cursor: displayYear <= 2026 ? 'not-allowed' : 'pointer', color: displayYear <= 2026 ? 'var(--text-muted)' : 'var(--text-main)', transition: 'background-color 0.2s' }} 
                      onClick={() => setDisplayYear(y => Math.max(2026, y - 1))}
                      disabled={displayYear <= 2026}
                      onMouseEnter={(e) => { if(displayYear > 2026) e.currentTarget.style.backgroundColor = 'var(--bg-surface)' }}
                      onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent' }}
                    >
                      &lt;
                    </button>
                    <span style={{ fontWeight: 600, fontSize: '0.875rem', minWidth: '40px', textAlign: 'center', fontFamily: 'var(--font-mono)' }}>{displayYear}</span>
                    <button 
                      type="button"
                      style={{ padding: '0.25rem 0.5rem', fontSize: '0.875rem', borderRadius: '16px', border: 'none', backgroundColor: 'transparent', cursor: 'pointer', color: 'var(--text-main)', transition: 'background-color 0.2s' }} 
                      onClick={() => setDisplayYear(y => y + 1)}
                      onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--bg-surface)' }}
                      onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent' }}
                    >
                      &gt;
                    </button>
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.75rem' }}>
                  {monthOptions.map(m => {
                    const isPaid = paidMonths.includes(m.value);
                    const isSelected = selectedMonths.includes(m.value);
                    
                    const [mYear, mMonth] = m.value.split('-').map(Number);
                    const currentMonthDate = new Date().getMonth() + 1;
                    
                    const isAfterStart = (mYear > 2026) || (mYear === 2026 && mMonth >= 7);
                    const isBeforeCurrent = (mYear < currentYear) || (mYear === currentYear && mMonth < currentMonthDate);
                    const isPending = isAfterStart && isBeforeCurrent && !isPaid;
                    
                    const shortMonth = new Date(mYear, mMonth - 1, 1).toLocaleDateString('default', { month: 'short' });

                    // Sleek styling logic
                    let bg = 'var(--bg-base)';
                    let border = '1px solid var(--border)';
                    let color = 'var(--text-main)';
                    let shadow = '0 1px 2px rgba(0,0,0,0.02)';
                    let transform = 'scale(1)';

                    if (isPaid) {
                      bg = 'rgba(16, 185, 129, 0.04)'; // Faint green
                      border = '1px solid rgba(16, 185, 129, 0.15)';
                      color = 'var(--success)';
                      shadow = 'none';
                    } else if (isSelected) {
                      bg = 'var(--primary)';
                      border = '1px solid var(--primary)';
                      color = 'white';
                      shadow = '0 6px 12px -2px rgba(79, 70, 229, 0.3)';
                    } else if (isPending) {
                      bg = 'rgba(239, 68, 68, 0.03)';
                      border = '1px solid rgba(239, 68, 68, 0.2)';
                      color = 'var(--text-main)'; // Keep text dark, highlight via dot
                    }

                    return (
                      <button 
                        key={m.value}
                        type="button"
                        onClick={() => toggleMonth(m.value)}
                        disabled={isPaid}
                        onMouseEnter={(e) => { 
                          if(!isPaid && !isSelected) { 
                            e.currentTarget.style.transform = 'translateY(-2px)'; 
                            e.currentTarget.style.boxShadow = '0 6px 12px -2px rgba(0, 0, 0, 0.05)';
                            e.currentTarget.style.border = isPending ? '1px solid rgba(239, 68, 68, 0.4)' : '1px solid var(--primary-light)';
                          } 
                        }}
                        onMouseLeave={(e) => { 
                          if(!isPaid && !isSelected) { 
                            e.currentTarget.style.transform = 'translateY(0)'; 
                            e.currentTarget.style.boxShadow = shadow;
                            e.currentTarget.style.border = border;
                          } 
                        }}
                        style={{
                          position: 'relative',
                          padding: '1rem 0.25rem', 
                          borderRadius: '14px', 
                          border,
                          backgroundColor: bg,
                          color,
                          cursor: isPaid ? 'default' : 'pointer', 
                          opacity: isPaid ? 0.7 : 1,
                          transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                          display: 'flex', 
                          flexDirection: 'column',
                          alignItems: 'center', 
                          justifyContent: 'center', 
                          gap: '0.35rem',
                          boxShadow: shadow,
                          transform,
                          outline: 'none'
                        }}
                      >
                        {isPaid && (
                          <div style={{ position: 'absolute', top: '-5px', right: '-5px', backgroundColor: 'var(--success)', color: 'white', borderRadius: '50%', padding: '3px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
                            <CheckCircle2 size={12} strokeWidth={3.5} />
                          </div>
                        )}
                        {isPending && !isSelected && !isPaid && (
                          <div style={{ position: 'absolute', top: '8px', right: '8px', width: '6px', height: '6px', backgroundColor: 'var(--danger)', borderRadius: '50%', boxShadow: '0 0 0 2px rgba(239, 68, 68, 0.15)' }} title="Overdue" />
                        )}
                        <span style={{ fontSize: '1rem', fontWeight: isSelected ? 700 : 500 }}>{shortMonth}</span>
                        <span style={{ fontSize: '0.65rem', opacity: isSelected ? 0.9 : 0.6, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', color: isSelected ? 'rgba(255,255,255,0.9)' : (isPaid ? 'var(--success)' : isPending ? 'var(--danger)' : 'var(--text-muted)') }}>
                          {isPaid ? 'Paid' : isPending ? 'Due' : 'Open'}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div style={{ marginTop: '1.5rem', padding: '1rem', backgroundColor: 'var(--bg-elevated)', borderRadius: '16px', border: '1px solid var(--border)', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                  <h4 style={{ margin: 0, fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                    <CheckCircle2 size={16} color="var(--success)" /> Recent Payments
                  </h4>
                  <button type="button" style={{ padding: '0.35rem 0.75rem', fontSize: '0.75rem', borderRadius: '20px', border: '1px solid var(--border)', backgroundColor: 'var(--bg-base)', color: 'var(--text-main)', cursor: 'pointer', transition: 'background-color 0.2s', fontWeight: 500 }} onClick={() => setStatementOpen(true)} onMouseEnter={(e) => e.currentTarget.style.backgroundColor='var(--bg-surface)'} onMouseLeave={(e) => e.currentTarget.style.backgroundColor='var(--bg-base)'}>
                    View Statement
                  </button>
                </div>
                {paidMonths.length === 0 ? (
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', margin: 0 }}>No payment history found.</p>
                ) : (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                    {[...paidMonths].sort().reverse().slice(0, 6).map(m => (
                      <span key={m} style={{ backgroundColor: 'var(--bg-base)', color: 'var(--text-main)', padding: '0.35rem 0.75rem', borderRadius: '20px', fontSize: '0.75rem', fontWeight: 500, border: '1px solid var(--border)', boxShadow: '0 1px 2px rgba(0,0,0,0.03)' }}>
                        {new Date(m + '-01').toLocaleDateString('default', { month: 'short', year: 'numeric' })}
                      </span>
                    ))}
                    {paidMonths.length > 6 && (
                      <span style={{ padding: '0.35rem 0.75rem', fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 500 }}>
                        +{paidMonths.length - 6} more
                      </span>
                    )}
                  </div>
                )}
              </div>

              <div style={{ borderTop: '1px solid var(--border)', paddingTop: '1rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                  <span style={{ fontWeight: 500, color: 'var(--text-muted)' }}>Total Amount</span>
                  <span style={{ fontSize: '1.5rem', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>
                    ৳{(member.category?.default_amount || 500) * selectedMonths.length}
                  </span>
                </div>
                
                <button 
                  onClick={handlePayment} 
                  className="btn btn-primary" 
                  style={{ width: '100%', padding: '1rem', fontSize: '1rem', display: 'flex', justifyContent: 'center' }} 
                  disabled={loading || selectedMonths.length === 0}
                >
                  {loading ? 'Initializing AmarPay...' : <><CreditCard size={20} style={{ marginRight: '0.5rem' }} /> Pay Now</>}
                </button>
                <button onClick={() => setStep(1)} className="btn btn-secondary" style={{ width: '100%', marginTop: '0.5rem', border: 'none' }}>Back</button>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Full Statement Modal */}
      <Modal isOpen={isStatementOpen} onClose={() => setStatementOpen(false)} title="Payment Statement">
        <div style={{ overflowX: 'auto', maxHeight: '60vh' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.875rem' }}>
            <thead>
              <tr style={{ backgroundColor: 'var(--bg-elevated)', borderBottom: '1px solid var(--border)' }}>
                <th style={{ padding: '0.75rem' }}>Date Paid</th>
                <th style={{ padding: '0.75rem' }}>Month Covered</th>
                <th style={{ padding: '0.75rem' }}>Amount</th>
                <th style={{ padding: '0.75rem' }}>Method / TxID</th>
              </tr>
            </thead>
            <tbody>
              {paymentHistory.length === 0 ? (
                <tr><td colSpan="4" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>No successful payments found.</td></tr>
              ) : (
                paymentHistory.map(donation => (
                  <tr key={donation.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '0.75rem' }}>
                      {new Date(donation.paid_at || donation.created_at).toLocaleDateString()}
                    </td>
                    <td style={{ padding: '0.75rem', fontWeight: 500 }}>
                      {new Date(donation.donation_month).toLocaleDateString('default', { month: 'long', year: 'numeric' })}
                    </td>
                    <td style={{ padding: '0.75rem', fontFamily: 'var(--font-mono)' }}>
                      ৳{donation.amount}
                    </td>
                    <td style={{ padding: '0.75rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      <div>{donation.card_type || 'N/A'}</div>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem' }}>{donation.tran_id}</div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1.5rem' }}>
          <button type="button" className="btn btn-primary" onClick={() => setStatementOpen(false)}>Close</button>
        </div>
      </Modal>

      {/* Success Modal */}
      <Modal isOpen={!!successTxId} onClose={() => setSuccessTxId(null)} title="Payment Successful!">
        <div style={{ textAlign: 'center', padding: '1rem 0' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '64px', height: '64px', borderRadius: '50%', backgroundColor: 'rgba(16, 185, 129, 0.1)', color: 'var(--success)', marginBottom: '1rem' }}>
            <CheckCircle2 size={32} />
          </div>
          <h3 style={{ margin: '0 0 0.5rem 0' }}>Thank You for Your Payment</h3>
          <p style={{ color: 'var(--text-muted)', marginBottom: '1.5rem' }}>Your monthly donation has been successfully processed.</p>
          <div style={{ backgroundColor: 'var(--bg-elevated)', padding: '1rem', borderRadius: 'var(--radius-md)', border: '1px dashed var(--border)', fontFamily: 'var(--font-mono)', fontSize: '0.875rem' }}>
            Transaction ID: {successTxId}
          </div>
          <button className="btn btn-primary" style={{ width: '100%', marginTop: '1.5rem' }} onClick={() => setSuccessTxId(null)}>
            Continue
          </button>
        </div>
      </Modal>
    </div>
  );
}
