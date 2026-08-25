import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Search, DollarSign, CheckCircle, Clock, Filter, Download } from 'lucide-react';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export default function Dashboard() {
  const [donations, setDonations] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Filter state
  const currentMonthStr = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-01`;
  const [filterMonth, setFilterMonth] = useState('ALL'); // Default to showing all months
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');

  useEffect(() => {
    fetchData();
  }, [filterMonth]);

  async function fetchData() {
    setLoading(true);
    try {
      // Fetch donations
      let query = supabase
        .from('donations')
        .select(`
          *,
          member:member_id(full_name, member_code, phone)
        `)
        .order('created_at', { ascending: false });

      if (filterMonth !== 'ALL') {
        query = query.eq('donation_month', filterMonth);
      }

      const { data: donationsData } = await query;

      if (donationsData) {
        const adjustedData = donationsData.map(d => {
          if (d.status === 'PENDING' && d.donation_month > currentMonthStr) {
            return { ...d, status: 'UPCOMING' };
          }
          return d;
        });
        setDonations(adjustedData);
      }
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    } finally {
      setLoading(false);
    }
  }

  // Calculate Metrics
  const totalCollected = donations.filter(d => d.status === 'SUCCESS').reduce((acc, curr) => acc + Number(curr.amount), 0);
  const pendingCount = donations.filter(d => d.status === 'PENDING').length;
  const successCount = donations.filter(d => d.status === 'SUCCESS').length;

  // Filtered List based on Search and Status
  const displayDonations = donations.filter(d => {
    if (statusFilter !== 'ALL' && d.status !== statusFilter) return false;
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return d.member?.full_name?.toLowerCase().includes(term) || d.member?.member_code?.toLowerCase().includes(term) || d.tran_id?.toLowerCase().includes(term);
  });

  // Export functions
  function exportExcel() {
    const data = displayDonations.map(d => ({
      'Transaction ID': d.tran_id,
      'Member Code': d.member?.member_code,
      'Name': d.member?.full_name,
      'Amount (BDT)': d.amount,
      'Status': d.status,
      'Date': new Date(d.created_at).toLocaleString()
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Payments");
    XLSX.writeFile(wb, `Fee_Report_${filterMonth === 'ALL' ? 'All_Time' : filterMonth}.xlsx`);
  }

  function exportPDF() {
    try {
      const doc = new jsPDF();
      doc.text(`Fee Report - ${filterMonth === 'ALL' ? 'All Time' : filterMonth}`, 14, 15);
      
      const tableData = displayDonations.map(d => [
        d.tran_id || '',
        d.member?.member_code || '',
        d.member?.full_name || '',
        d.amount ? String(d.amount) : '0',
        d.status || '',
        d.created_at ? new Date(d.created_at).toLocaleDateString() : ''
      ]);

      autoTable(doc, {
        head: [['Transaction ID', 'Member Code', 'Name', 'Amount', 'Status', 'Date']],
        body: tableData,
        startY: 20
      });
      
      doc.save(`Fee_Report_${filterMonth === 'ALL' ? 'All_Time' : filterMonth}.pdf`);
    } catch (error) {
      alert("Error generating PDF: " + error.message);
      console.error(error);
    }
  }

  return (
    <div className="animate-fade-in">
      <div className="flex-between" style={{ marginBottom: '2rem' }}>
        <div>
          <h1>Fee Report & Payments</h1>
          <p style={{ color: 'var(--text-muted)' }}>Overview of all member contributions and pending dues.</p>
        </div>
        <div style={{ display: 'flex', gap: '1rem' }}>
          <button className="btn btn-secondary" onClick={exportExcel}>
            <Download size={18} style={{ marginRight: '0.5rem' }} /> Excel
          </button>
          <button className="btn btn-secondary" onClick={exportPDF}>
            <Download size={18} style={{ marginRight: '0.5rem' }} /> PDF
          </button>
        </div>
      </div>

      {/* Metrics Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.5rem', marginBottom: '2rem' }}>
        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '1rem', borderLeft: '4px solid var(--success)' }}>
          <div style={{ padding: '1rem', backgroundColor: 'var(--success-bg)', borderRadius: 'var(--radius-md)' }}>
            <CheckCircle size={24} color="var(--success)" />
          </div>
          <div>
            <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--text-muted)' }}>Total Collected</p>
            <h2 style={{ margin: 0, fontSize: '1.5rem' }}>৳{totalCollected.toLocaleString()}</h2>
          </div>
        </div>
        
        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '1rem', borderLeft: '4px solid var(--primary)' }}>
          <div style={{ padding: '1rem', backgroundColor: 'var(--primary-subtle)', borderRadius: 'var(--radius-md)' }}>
            <DollarSign size={24} color="var(--primary)" />
          </div>
          <div>
            <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--text-muted)' }}>Successful Payments</p>
            <h2 style={{ margin: 0, fontSize: '1.5rem' }}>{successCount} Members</h2>
          </div>
        </div>

        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '1rem', borderLeft: '4px solid var(--warning)' }}>
          <div style={{ padding: '1rem', backgroundColor: 'var(--warning-bg)', borderRadius: 'var(--radius-md)' }}>
            <Clock size={24} color="var(--warning)" />
          </div>
          <div>
            <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--text-muted)' }}>Pending Transactions</p>
            <h2 style={{ margin: 0, fontSize: '1.5rem' }}>{pendingCount} Pending</h2>
          </div>
        </div>
      </div>

      {/* Payment Database Table */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--border)', display: 'flex', gap: '1rem', justifyContent: 'space-between', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: '1rem', flex: 1 }}>
            <div style={{ position: 'relative', maxWidth: '300px', width: '100%' }}>
              <Search size={18} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              <input type="text" className="input-field" placeholder="Search by name, code or ID..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} style={{ paddingLeft: '2.75rem' }} />
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Filter size={18} color="var(--text-muted)" />
            <select className="input-field" value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={{ width: 'auto' }}>
              <option value="ALL">All Status</option>
              <option value="SUCCESS">Success</option>
              <option value="PENDING">Pending</option>
              <option value="UPCOMING">Upcoming</option>
              <option value="FAILED">Failed</option>
            </select>
            <select className="input-field" value={filterMonth === 'ALL' ? 'ALL' : 'CUSTOM'} onChange={e => {
              if (e.target.value === 'ALL') setFilterMonth('ALL');
              else setFilterMonth(currentMonthStr);
            }} style={{ width: 'auto' }}>
              <option value="ALL">All Months</option>
              <option value="CUSTOM">Specific Month</option>
            </select>
            
            {filterMonth !== 'ALL' && (
              <input type="month" className="input-field" value={filterMonth.substring(0, 7)} onChange={e => {
                if (e.target.value) {
                  setFilterMonth(`${e.target.value}-01`);
                }
              }} style={{ width: 'auto' }} />
            )}
          </div>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ backgroundColor: 'var(--bg-elevated)', borderBottom: '1px solid var(--border)' }}>
                <th style={{ padding: '1rem 1.5rem', fontWeight: 500, color: 'var(--text-muted)', fontSize: '0.875rem' }}>Transaction ID</th>
                <th style={{ padding: '1rem 1.5rem', fontWeight: 500, color: 'var(--text-muted)', fontSize: '0.875rem' }}>Member</th>
                <th style={{ padding: '1rem 1.5rem', fontWeight: 500, color: 'var(--text-muted)', fontSize: '0.875rem' }}>Amount</th>
                <th style={{ padding: '1rem 1.5rem', fontWeight: 500, color: 'var(--text-muted)', fontSize: '0.875rem' }}>Date</th>
                <th style={{ padding: '1rem 1.5rem', fontWeight: 500, color: 'var(--text-muted)', fontSize: '0.875rem' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="5" style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>Loading payments...</td></tr>
              ) : displayDonations.length === 0 ? (
                <tr><td colSpan="5" style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>No payments found for this period.</td></tr>
              ) : (
                displayDonations.map(donation => (
                  <tr key={donation.id} style={{ borderBottom: '1px solid var(--border)', transition: 'background var(--transition-fast)' }} className="hover:bg-var(--bg-elevated)">
                    <td style={{ padding: '1rem 1.5rem', fontFamily: 'var(--font-mono)', fontSize: '0.875rem' }}>{donation.tran_id}</td>
                    <td style={{ padding: '1rem 1.5rem' }}>
                      <div style={{ fontWeight: 500 }}>{donation.member?.full_name || 'Unknown'}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{donation.member?.member_code}</div>
                    </td>
                    <td style={{ padding: '1rem 1.5rem', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>৳{donation.amount}</td>
                    <td style={{ padding: '1rem 1.5rem', color: 'var(--text-muted)' }}>{new Date(donation.created_at).toLocaleString()}</td>
                    <td style={{ padding: '1rem 1.5rem' }}>
                      <span style={{ 
                        padding: '0.25rem 0.75rem', borderRadius: '1rem', 
                        backgroundColor: donation.status === 'SUCCESS' ? 'var(--success-bg)' : donation.status === 'PENDING' ? 'var(--warning-bg)' : donation.status === 'UPCOMING' ? 'var(--bg-elevated)' : 'var(--danger-bg)', 
                        color: donation.status === 'SUCCESS' ? 'var(--success)' : donation.status === 'PENDING' ? 'var(--warning)' : donation.status === 'UPCOMING' ? 'var(--text-muted)' : 'var(--danger)',
                        fontSize: '0.75rem', fontWeight: 600
                      }}>
                        {donation.status}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
