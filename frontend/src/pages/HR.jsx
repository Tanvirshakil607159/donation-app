import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Plus, Users, Calendar, DollarSign, Search, Download } from 'lucide-react';
import Modal from '../components/Modal';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export default function HR() {
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('employees');

  const [isEmpModalOpen, setEmpModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [empForm, setEmpForm] = useState({ name: '', designation: '', department: '', basic_salary: 0 });

  // Attendance State
  const [attendanceDate, setAttendanceDate] = useState(new Date().toISOString().split('T')[0]);
  const [attendanceRecords, setAttendanceRecords] = useState({});
  const [isSavingAttendance, setIsSavingAttendance] = useState(false);

  // Reports State
  const [reportMonth, setReportMonth] = useState(new Date().toISOString().substring(0, 7));
  const [monthlyAttendance, setMonthlyAttendance] = useState([]);

  useEffect(() => {
    fetchEmployees();
  }, []);

  useEffect(() => {
    if (activeTab === 'attendance') fetchAttendance();
  }, [attendanceDate, activeTab]);

  useEffect(() => {
    if (activeTab === 'payroll' || activeTab === 'attendance') fetchMonthlyData();
  }, [reportMonth, activeTab]);

  async function fetchMonthlyData() {
    try {
      const { data } = await supabase
        .from('attendance')
        .select('*')
        .gte('date', `${reportMonth}-01`)
        .lte('date', `${reportMonth}-31`);
      if (data) setMonthlyAttendance(data);
    } catch (error) {
      console.error(error);
    }
  }

  const employeeStats = employees.map(emp => {
    const records = monthlyAttendance.filter(r => r.employee_id === emp.id);
    const present = records.filter(r => r.status === 'PRESENT').length;
    const absent = records.filter(r => r.status === 'ABSENT').length;
    const leave = records.filter(r => r.status === 'LEAVE').length;
    const perDaySalary = emp.basic_salary / 30;
    const deductions = absent * perDaySalary;
    const netPay = emp.basic_salary - deductions;
    return { ...emp, present, absent, leave, netPay: Math.round(netPay), deductions: Math.round(deductions) };
  });

  const totalBasic = employeeStats.reduce((sum, emp) => sum + emp.basic_salary, 0);
  const totalDeductions = employeeStats.reduce((sum, emp) => sum + emp.deductions, 0);
  const totalNetPay = employeeStats.reduce((sum, emp) => sum + emp.netPay, 0);

  const [isPosting, setIsPosting] = useState(false);

  async function postPayrollToAccounts() {
    setIsPosting(true);
    try {
      if (totalNetPay <= 0) throw new Error("No payroll to post.");

      const { data: accounts } = await supabase.from('chart_of_accounts').select('*');
      
      let cashAccount = accounts.find(a => a.type === 'ASSET' && a.code.startsWith('1'));
      if (!cashAccount) throw new Error("Could not find a Cash asset account. Please create one in Accounts.");

      let salaryAccount = accounts.find(a => a.name.toLowerCase().includes('salary') && a.type === 'EXPENSE');
      if (!salaryAccount) {
        let codeNum = 5100;
        while(accounts.find(a => a.code === codeNum.toString())) { codeNum++; }
        
        const { data: newAcc, error: accErr } = await supabase.from('chart_of_accounts').insert({
          code: codeNum.toString(),
          name: 'Salary Expense',
          type: 'EXPENSE'
        }).select().single();
        if (accErr) throw accErr;
        salaryAccount = newAcc;
      }

      const ref = `PAYROLL-${reportMonth}`;
      const { data: existing } = await supabase.from('journal_entries').select('id').eq('reference', ref).single();
      if (existing) {
        throw new Error(`Payroll for ${reportMonth} has already been posted to accounts.`);
      }

      const { data: entry, error: entryError } = await supabase.from('journal_entries').insert({
        description: `Payroll for ${reportMonth}`,
        reference: ref,
        status: 'POSTED'
      }).select().single();
      if (entryError) throw entryError;

      await supabase.from('journal_lines').insert([
        { entry_id: entry.id, account_id: salaryAccount.id, debit: totalNetPay, credit: 0 },
        { entry_id: entry.id, account_id: cashAccount.id, debit: 0, credit: totalNetPay }
      ]);

      alert('Payroll successfully posted to Accounts as an expense!');
    } catch (error) {
      alert(error.message);
    } finally {
      setIsPosting(false);
    }
  }

  function exportData(format, title, headers, data) {
    if (format === 'excel') {
      const dataObj = data.map(row => {
        let obj = {};
        headers.forEach((h, i) => obj[h] = row[i]);
        return obj;
      });
      const ws = XLSX.utils.json_to_sheet(dataObj);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Report");
      XLSX.writeFile(wb, `${title}.xlsx`);
    } else {
      const doc = new jsPDF();
      doc.text(title, 14, 15);
      autoTable(doc, { head: [headers], body: data, startY: 20 });
      doc.save(`${title}.pdf`);
    }
  }

  function handleExportAttendance(format) {
    const headers = ['Employee Name', 'Department', 'Present', 'Absent', 'Leave'];
    const data = employeeStats.map(e => [e.name, e.department, e.present, e.absent, e.leave]);
    exportData(format, `Attendance_Report_${reportMonth}`, headers, data);
  }

  function handleExportPayroll(format) {
    const headers = ['Employee Name', 'Basic Salary', 'Absent Days', 'Deductions', 'Net Pay'];
    const data = employeeStats.map(e => [e.name, e.basic_salary, e.absent, e.deductions, e.netPay]);
    data.push(['TOTAL PAYROLL', totalBasic, '', totalDeductions, totalNetPay]);
    exportData(format, `Payroll_Report_${reportMonth}`, headers, data);
  }

  async function fetchAttendance() {
    try {
      const { data } = await supabase
        .from('attendance')
        .select('*')
        .eq('date', attendanceDate);
      
      const records = {};
      if (data) {
        data.forEach(r => { records[r.employee_id] = r.status; });
      }
      setAttendanceRecords(records);
    } catch (error) {
      console.error('Error fetching attendance:', error);
    }
  }

  async function saveAttendance() {
    setIsSavingAttendance(true);
    try {
      const activeEmployees = employees.filter(e => e.status === 'active');
      const upserts = activeEmployees.map(emp => ({
        employee_id: emp.id,
        date: attendanceDate,
        status: attendanceRecords[emp.id] || 'PRESENT'
      }));

      const { error } = await supabase.from('attendance').upsert(upserts, { onConflict: 'employee_id, date' });
      if (error) throw error;
      alert('Attendance saved successfully!');
    } catch (error) {
      alert('Error saving attendance: ' + error.message);
    } finally {
      setIsSavingAttendance(false);
    }
  }

  async function fetchEmployees() {
    setLoading(true);
    try {
      const { data } = await supabase
        .from('employees')
        .select('*')
        .order('name');
      if (data) setEmployees(data);
    } catch (error) {
      console.error('Error fetching employees:', error);
    } finally {
      setLoading(false);
    }
  }

  async function handleAddEmployee(e) {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const { error } = await supabase.from('employees').insert({
        name: empForm.name,
        designation: empForm.designation,
        department: empForm.department,
        basic_salary: empForm.basic_salary,
        status: 'active'
      });
      if (error) throw error;
      setEmpModalOpen(false);
      setEmpForm({ name: '', designation: '', department: '', basic_salary: 0 });
      fetchEmployees();
    } catch (error) {
      alert('Error adding employee: ' + error.message);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="animate-fade-in">
      <div className="flex-between" style={{ marginBottom: '2rem' }}>
        <div>
          <h1>HR & Payroll</h1>
          <p style={{ color: 'var(--text-muted)' }}>Manage employees, daily attendance, and monthly payroll runs.</p>
        </div>
        <div style={{ display: 'flex', gap: '1rem' }}>
          <button className="btn btn-primary" onClick={() => setEmpModalOpen(true)}>
            <Plus size={18} style={{ marginRight: '0.5rem' }} /> Add Employee
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '2rem', borderBottom: '1px solid var(--border)', marginBottom: '2rem' }}>
        <button 
          onClick={() => setActiveTab('employees')}
          style={{ 
            background: 'none', border: 'none', padding: '1rem 0', 
            fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem',
            color: activeTab === 'employees' ? 'var(--primary)' : 'var(--text-muted)',
            borderBottom: activeTab === 'employees' ? '2px solid var(--primary)' : '2px solid transparent',
            marginBottom: '-1px'
          }}>
          <Users size={18} /> Employees
        </button>
        <button 
          onClick={() => setActiveTab('attendance')}
          style={{ 
            background: 'none', border: 'none', padding: '1rem 0', 
            fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem',
            color: activeTab === 'attendance' ? 'var(--primary)' : 'var(--text-muted)',
            borderBottom: activeTab === 'attendance' ? '2px solid var(--primary)' : '2px solid transparent',
            marginBottom: '-1px'
          }}>
          <Calendar size={18} /> Attendance
        </button>
        <button 
          onClick={() => setActiveTab('payroll')}
          style={{ 
            background: 'none', border: 'none', padding: '1rem 0', 
            fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem',
            color: activeTab === 'payroll' ? 'var(--primary)' : 'var(--text-muted)',
            borderBottom: activeTab === 'payroll' ? '2px solid var(--primary)' : '2px solid transparent',
            marginBottom: '-1px'
          }}>
          <DollarSign size={18} /> Payroll
        </button>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {activeTab === 'employees' && (
          <>
            <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--border)' }}>
              <div style={{ position: 'relative', maxWidth: '400px' }}>
                <Search size={18} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                <input type="text" className="input-field" placeholder="Search employees..." style={{ paddingLeft: '2.75rem' }} />
              </div>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                <thead>
                  <tr style={{ backgroundColor: 'var(--bg-elevated)', borderBottom: '1px solid var(--border)' }}>
                    <th style={{ padding: '1rem 1.5rem', fontWeight: 500, color: 'var(--text-muted)', fontSize: '0.875rem' }}>Name</th>
                    <th style={{ padding: '1rem 1.5rem', fontWeight: 500, color: 'var(--text-muted)', fontSize: '0.875rem' }}>Designation</th>
                    <th style={{ padding: '1rem 1.5rem', fontWeight: 500, color: 'var(--text-muted)', fontSize: '0.875rem' }}>Department</th>
                    <th style={{ padding: '1rem 1.5rem', fontWeight: 500, color: 'var(--text-muted)', fontSize: '0.875rem' }}>Basic Salary</th>
                    <th style={{ padding: '1rem 1.5rem', fontWeight: 500, color: 'var(--text-muted)', fontSize: '0.875rem' }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan="5" style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>Loading...</td></tr>
                  ) : employees.length === 0 ? (
                    <tr><td colSpan="5" style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>No employees found.</td></tr>
                  ) : (
                    employees.map(emp => (
                      <tr key={emp.id} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '1rem 1.5rem', fontWeight: 500 }}>{emp.name}</td>
                        <td style={{ padding: '1rem 1.5rem' }}>{emp.designation}</td>
                        <td style={{ padding: '1rem 1.5rem', color: 'var(--text-muted)' }}>{emp.department}</td>
                        <td style={{ padding: '1rem 1.5rem', fontFamily: 'var(--font-mono)' }}>৳{emp.basic_salary}</td>
                        <td style={{ padding: '1rem 1.5rem' }}>
                          <span style={{ 
                            padding: '0.25rem 0.75rem', borderRadius: '1rem', 
                            backgroundColor: emp.status === 'active' ? 'var(--success-bg)' : 'var(--border)', 
                            color: emp.status === 'active' ? 'var(--success)' : 'var(--text-muted)',
                            fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase'
                          }}>
                            {emp.status}
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

        {activeTab === 'attendance' && (
          <div style={{ padding: '1.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <label style={{ fontWeight: 500 }}>Log Date:</label>
                <input type="date" className="input-field" value={attendanceDate} onChange={e => setAttendanceDate(e.target.value)} style={{ width: 'auto' }} />
                <button className="btn btn-primary" onClick={saveAttendance} disabled={isSavingAttendance}>
                  {isSavingAttendance ? 'Saving...' : 'Save Attendance'}
                </button>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', paddingLeft: '1rem', borderLeft: '1px solid var(--border)' }}>
                <label style={{ fontWeight: 500, color: 'var(--text-muted)' }}>Report:</label>
                <input type="month" className="input-field" value={reportMonth} onChange={e => setReportMonth(e.target.value)} style={{ width: 'auto' }} />
                <button className="btn btn-secondary" onClick={() => handleExportAttendance('excel')} title="Export Monthly Attendance Excel"><Download size={18} /></button>
                <button className="btn btn-secondary" onClick={() => handleExportAttendance('pdf')} title="Export Monthly Attendance PDF"><Download size={18} /></button>
              </div>
            </div>
            
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                <thead>
                  <tr style={{ backgroundColor: 'var(--bg-elevated)', borderBottom: '1px solid var(--border)' }}>
                    <th style={{ padding: '1rem 1.5rem', fontWeight: 500, color: 'var(--text-muted)', fontSize: '0.875rem' }}>Employee Name</th>
                    <th style={{ padding: '1rem 1.5rem', fontWeight: 500, color: 'var(--text-muted)', fontSize: '0.875rem' }}>Department</th>
                    <th style={{ padding: '1rem 1.5rem', fontWeight: 500, color: 'var(--text-muted)', fontSize: '0.875rem' }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan="3" style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>Loading...</td></tr>
                  ) : employees.filter(e => e.status === 'active').length === 0 ? (
                    <tr><td colSpan="3" style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>No active employees found.</td></tr>
                  ) : (
                    employees.filter(e => e.status === 'active').map(emp => (
                      <tr key={emp.id} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '1rem 1.5rem', fontWeight: 500 }}>{emp.name}</td>
                        <td style={{ padding: '1rem 1.5rem', color: 'var(--text-muted)' }}>{emp.department}</td>
                        <td style={{ padding: '1rem 1.5rem' }}>
                          <select 
                            className="input-field" 
                            style={{ width: '150px' }}
                            value={attendanceRecords[emp.id] || 'PRESENT'}
                            onChange={e => setAttendanceRecords({...attendanceRecords, [emp.id]: e.target.value})}
                          >
                            <option value="PRESENT">Present</option>
                            <option value="ABSENT">Absent</option>
                            <option value="LEAVE">Leave</option>
                          </select>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'payroll' && (
          <div style={{ padding: '1.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <label style={{ fontWeight: 500 }}>Payroll Month:</label>
                <input type="month" className="input-field" value={reportMonth} onChange={e => setReportMonth(e.target.value)} style={{ width: 'auto' }} />
              </div>
              <div style={{ display: 'flex', gap: '1rem' }}>
                <button className="btn btn-primary" onClick={postPayrollToAccounts} disabled={isPosting || employeeStats.length === 0}>
                  {isPosting ? 'Posting...' : 'Post to Accounts'}
                </button>
                <button className="btn btn-secondary" onClick={() => handleExportPayroll('excel')}>
                  <Download size={18} style={{ marginRight: '0.5rem' }} /> Excel
                </button>
                <button className="btn btn-secondary" onClick={() => handleExportPayroll('pdf')}>
                  <Download size={18} style={{ marginRight: '0.5rem' }} /> PDF
                </button>
              </div>
            </div>
            
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                <thead>
                  <tr style={{ backgroundColor: 'var(--bg-elevated)', borderBottom: '1px solid var(--border)' }}>
                    <th style={{ padding: '1rem 1.5rem', fontWeight: 500, color: 'var(--text-muted)', fontSize: '0.875rem' }}>Employee Name</th>
                    <th style={{ padding: '1rem 1.5rem', fontWeight: 500, color: 'var(--text-muted)', fontSize: '0.875rem' }}>Basic Salary</th>
                    <th style={{ padding: '1rem 1.5rem', fontWeight: 500, color: 'var(--text-muted)', fontSize: '0.875rem' }}>Attendance</th>
                    <th style={{ padding: '1rem 1.5rem', fontWeight: 500, color: 'var(--text-muted)', fontSize: '0.875rem' }}>Deductions</th>
                    <th style={{ padding: '1rem 1.5rem', fontWeight: 500, color: 'var(--text-muted)', fontSize: '0.875rem' }}>Net Pay</th>
                  </tr>
                </thead>
                <tbody>
                  {employeeStats.length === 0 ? (
                    <tr><td colSpan="5" style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>No active employees found.</td></tr>
                  ) : (
                    <>
                      {employeeStats.map(emp => (
                        <tr key={emp.id} style={{ borderBottom: '1px solid var(--border)' }}>
                          <td style={{ padding: '1rem 1.5rem', fontWeight: 500 }}>{emp.name}</td>
                          <td style={{ padding: '1rem 1.5rem', fontFamily: 'var(--font-mono)' }}>৳{emp.basic_salary.toLocaleString()}</td>
                          <td style={{ padding: '1rem 1.5rem' }}>
                            <div style={{ fontSize: '0.75rem', color: 'var(--success)', fontWeight: 600 }}>{emp.present} Present</div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--danger)', fontWeight: 600 }}>{emp.absent} Absent</div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--warning)', fontWeight: 600 }}>{emp.leave} Leave</div>
                          </td>
                          <td style={{ padding: '1rem 1.5rem', fontFamily: 'var(--font-mono)', color: 'var(--danger)' }}>-৳{emp.deductions.toLocaleString()}</td>
                          <td style={{ padding: '1rem 1.5rem', fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--success)' }}>৳{emp.netPay.toLocaleString()}</td>
                        </tr>
                      ))}
                      <tr style={{ backgroundColor: 'var(--bg-elevated)', fontWeight: 700, borderTop: '2px solid var(--border)' }}>
                        <td style={{ padding: '1rem 1.5rem', textAlign: 'right' }}>TOTAL PAYROLL</td>
                        <td style={{ padding: '1rem 1.5rem', fontFamily: 'var(--font-mono)' }}>৳{totalBasic.toLocaleString()}</td>
                        <td style={{ padding: '1rem 1.5rem' }}></td>
                        <td style={{ padding: '1rem 1.5rem', fontFamily: 'var(--font-mono)', color: 'var(--danger)' }}>-৳{totalDeductions.toLocaleString()}</td>
                        <td style={{ padding: '1rem 1.5rem', fontFamily: 'var(--font-mono)', color: 'var(--success)' }}>৳{totalNetPay.toLocaleString()}</td>
                      </tr>
                    </>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      <Modal isOpen={isEmpModalOpen} onClose={() => setEmpModalOpen(false)} title="Add New Employee">
        <form onSubmit={handleAddEmployee} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>Full Name</label>
            <input required type="text" className="input-field" value={empForm.name} onChange={e => setEmpForm({...empForm, name: e.target.value})} />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>Designation</label>
            <input required type="text" className="input-field" value={empForm.designation} onChange={e => setEmpForm({...empForm, designation: e.target.value})} />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>Department</label>
            <select required className="input-field" value={empForm.department} onChange={e => setEmpForm({...empForm, department: e.target.value})}>
              <option value="">Select Department</option>
              <option value="IT">IT</option>
              <option value="Administration">Administration</option>
              <option value="Finance">Finance</option>
              <option value="Support">Support</option>
            </select>
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>Basic Salary (৳)</label>
            <input required type="number" className="input-field" value={empForm.basic_salary} onChange={e => setEmpForm({...empForm, basic_salary: Number(e.target.value)})} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '1rem' }}>
            <button type="button" className="btn btn-secondary" onClick={() => setEmpModalOpen(false)}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={isSubmitting}>{isSubmitting ? 'Saving...' : 'Save Employee'}</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
