import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { FileText, Filter, FileSpreadsheet } from 'lucide-react';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export default function Reports() {
  const [reportType, setReportType] = useState('members');
  const [startDate, setStartDate] = useState(new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState([]);
  const [headers, setHeaders] = useState([]);

  useEffect(() => {
    // Clear data when report type changes to prevent mismatched columns
    setData([]);
    setHeaders([]);
  }, [reportType]);

  async function generateReport() {
    setLoading(true);
    try {
      if (reportType === 'members') {
        const { data: members, error } = await supabase
          .from('members')
          .select('member_code, full_name, phone, status, created_at, category:category_id(name)')
          .order('created_at', { ascending: false });
        
        if (error) throw error;
        
        setHeaders(['Member Code', 'Full Name', 'Phone', 'Category', 'Status', 'Join Date']);
        setData(members.map(m => [
          m.member_code,
          m.full_name,
          m.phone,
          m.category?.name || 'Uncategorized',
          m.status,
          new Date(m.created_at).toLocaleDateString()
        ]));

      } else if (reportType === 'donations') {
        let query = supabase
          .from('donations')
          .select('paid_at, amount, donation_month, tran_id, card_type, member:member_id(full_name, member_code)')
          .eq('status', 'SUCCESS')
          .order('paid_at', { ascending: false });
          
        if (startDate) query = query.gte('paid_at', startDate + 'T00:00:00.000Z');
        if (endDate) query = query.lte('paid_at', endDate + 'T23:59:59.999Z');

        const { data: donations, error } = await query;
        if (error) throw error;

        setHeaders(['Date Paid', 'Member Name', 'Member Code', 'Month Covered', 'Amount (৳)', 'Method', 'Transaction ID']);
        setData(donations.map(d => [
          new Date(d.paid_at).toLocaleDateString(),
          d.member?.full_name || 'N/A',
          d.member?.member_code || 'N/A',
          new Date(d.donation_month).toLocaleDateString('default', { month: 'short', year: 'numeric' }),
          d.amount,
          d.card_type || 'Unknown',
          d.tran_id
        ]));

      } else if (reportType === 'expenses') {
        let query = supabase
          .from('journal_entries')
          .select(`
            date, description, reference,
            journal_lines!inner ( account_id, debit, chart_of_accounts!inner(name, type) )
          `)
          .eq('status', 'POSTED')
          .eq('journal_lines.chart_of_accounts.type', 'EXPENSE')
          .gt('journal_lines.debit', 0)
          .order('date', { ascending: false });

        if (startDate) query = query.gte('date', startDate);
        if (endDate) query = query.lte('date', endDate);

        const { data: entries, error } = await query;
        if (error) throw error;

        setHeaders(['Date', 'Expense Account', 'Description', 'Reference', 'Amount (৳)']);
        const flatData = [];
        entries.forEach(entry => {
          entry.journal_lines.forEach(line => {
            flatData.push([
              new Date(entry.date).toLocaleDateString(),
              line.chart_of_accounts?.name,
              entry.description,
              entry.reference || 'N/A',
              line.debit
            ]);
          });
        });
        setData(flatData);
      }
    } catch (err) {
      alert("Error generating report: " + err.message);
    } finally {
      setLoading(false);
    }
  }

  function handleExport(format) {
    if (data.length === 0) return alert("Please generate a report first.");

    let title = 'Report';
    if (reportType === 'members') title = 'Member Directory Report';
    if (reportType === 'donations') title = 'Donations Collection Report';
    if (reportType === 'expenses') title = 'Expense Summary Report';

    if (format === 'excel') {
      const dataObj = data.map(row => {
        let obj = {};
        headers.forEach((h, i) => obj[h] = row[i]);
        return obj;
      });
      const ws = XLSX.utils.json_to_sheet(dataObj);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, title.substring(0, 31));
      XLSX.writeFile(wb, `${title.replace(/\s+/g, '_')}.xlsx`);
    } else if (format === 'pdf') {
      const doc = new jsPDF();
      doc.text(title, 14, 15);
      
      if (reportType !== 'members') {
        doc.setFontSize(10);
        doc.text(`Date Range: ${startDate} to ${endDate}`, 14, 22);
      }

      autoTable(doc, {
        head: [headers],
        body: data,
        startY: reportType === 'members' ? 20 : 28
      });
      doc.save(`${title.replace(/\s+/g, '_')}.pdf`);
    }
  }

  return (
    <div className="animate-fade-in">
      <div className="flex-between" style={{ marginBottom: '2rem' }}>
        <div>
          <h1>System Reports</h1>
          <p style={{ color: 'var(--text-muted)' }}>Generate and export data into PDF or Excel.</p>
        </div>
        <div style={{ display: 'flex', gap: '1rem' }}>
          <button className="btn btn-secondary" onClick={() => handleExport('excel')} disabled={data.length === 0}>
            <FileSpreadsheet size={18} style={{ marginRight: '0.5rem', color: '#10b981' }} /> Excel
          </button>
          <button className="btn btn-secondary" onClick={() => handleExport('pdf')} disabled={data.length === 0}>
            <FileText size={18} style={{ marginRight: '0.5rem', color: '#ef4444' }} /> PDF
          </button>
        </div>
      </div>

      <div className="card" style={{ marginBottom: '2rem', padding: '1.5rem', display: 'flex', gap: '1.5rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 200px' }}>
          <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>Report Type</label>
          <select className="input-field" value={reportType} onChange={(e) => setReportType(e.target.value)}>
            <option value="members">Member Directory</option>
            <option value="donations">Donations / Collections</option>
            <option value="expenses">Expense Summary</option>
          </select>
        </div>

        {reportType !== 'members' && (
          <>
            <div style={{ flex: '1 1 150px' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>Start Date</label>
              <input type="date" className="input-field" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div style={{ flex: '1 1 150px' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>End Date</label>
              <input type="date" className="input-field" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
          </>
        )}

        <div>
          <button className="btn btn-primary" onClick={generateReport} disabled={loading} style={{ height: '42px' }}>
            <Filter size={18} style={{ marginRight: '0.5rem' }} /> {loading ? 'Fetching...' : 'Generate Preview'}
          </button>
        </div>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--border)' }}>
          <h3 style={{ margin: 0 }}>Data Preview {data.length > 0 && <span style={{ color: 'var(--text-muted)', fontSize: '0.875rem', fontWeight: 'normal', marginLeft: '0.5rem' }}>({data.length} records)</span>}</h3>
        </div>
        <div style={{ overflowX: 'auto', maxHeight: '500px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ backgroundColor: 'var(--bg-elevated)', borderBottom: '1px solid var(--border)' }}>
                {headers.map((h, i) => (
                  <th key={i} style={{ padding: '1rem', fontWeight: 500, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.length === 0 ? (
                <tr>
                  <td colSpan={Math.max(1, headers.length)} style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                    {loading ? 'Fetching data...' : 'Select filters and click "Generate Preview" to load data.'}
                  </td>
                </tr>
              ) : (
                data.map((row, rowIndex) => (
                  <tr key={rowIndex} style={{ borderBottom: '1px solid var(--border)' }}>
                    {row.map((cell, cellIndex) => (
                      <td key={cellIndex} style={{ padding: '1rem', whiteSpace: 'nowrap' }}>{cell}</td>
                    ))}
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
