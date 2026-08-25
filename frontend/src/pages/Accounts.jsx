import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { Plus, Minus, BookOpen, Search, List, PieChart, TrendingUp, ChevronRight, Download, Edit2 } from 'lucide-react';
import Modal from '../components/Modal';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export default function Accounts() {
  const [activeTab, setActiveTab] = useState('journals');
  const [journals, setJournals] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);

  // Modals
  const [isExpenseModalOpen, setExpenseModalOpen] = useState(false);
  const [isIncomeModalOpen, setIncomeModalOpen] = useState(false);
  const [isAccountModalOpen, setAccountModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Forms
  const [form, setForm] = useState({ account_id: '', amount: 0, description: '', reference: '' });
  const [accountForm, setAccountForm] = useState({ code: '', name: '', type: 'EXPENSE' });
  const [editingAccountId, setEditingAccountId] = useState(null);

  // Ledger Filter
  const [ledgerAccountId, setLedgerAccountId] = useState('');

  // Date Filter
  const [startDate, setStartDate] = useState(new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);

  useEffect(() => {
    fetchData();
  }, [startDate, endDate]);

  async function fetchData() {
    setLoading(true);
    try {
      const { data: accountsData } = await supabase.from('chart_of_accounts').select('*').order('code');
      if (accountsData) {
        setAccounts(accountsData);
        if (accountsData.length > 0 && !ledgerAccountId) setLedgerAccountId(accountsData[0].id);
      }

      let query = supabase
        .from('journal_entries')
        .select(`
          *,
          journal_lines (
            id, account_id, debit, credit, description,
            chart_of_accounts ( name, code, type )
          )
        `)
        .order('date', { ascending: false });

      if (startDate) query = query.gte('date', startDate);
      if (endDate) query = query.lte('date', endDate);

      const { data: journalsData } = await query;
        
      if (journalsData) setJournals(journalsData);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  }

  // --- Handlers ---
  async function handleAddIncome(e) {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const cashAccount = accounts.find(a => a.type === 'ASSET' && a.code.startsWith('1'));
      if (!cashAccount) throw new Error("Could not find a Cash asset account.");

      const { data: entry, error: entryError } = await supabase.from('journal_entries').insert({
        description: form.description,
        reference: form.reference || null,
        status: 'POSTED'
      }).select().single();
      if (entryError) throw entryError;

      await supabase.from('journal_lines').insert([
        { entry_id: entry.id, account_id: cashAccount.id, debit: form.amount, credit: 0 },
        { entry_id: entry.id, account_id: form.account_id, debit: 0, credit: form.amount }
      ]);

      setIncomeModalOpen(false);
      setForm({ account_id: '', amount: 0, description: '', reference: '' });
      fetchData();
    } catch (error) {
      alert('Error recording income: ' + error.message);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleAddExpense(e) {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const cashAccount = accounts.find(a => a.type === 'ASSET' && a.code.startsWith('1'));
      if (!cashAccount) throw new Error("Could not find a Cash asset account.");

      const { data: entry, error: entryError } = await supabase.from('journal_entries').insert({
        description: form.description,
        reference: form.reference || null,
        status: 'POSTED'
      }).select().single();
      if (entryError) throw entryError;

      await supabase.from('journal_lines').insert([
        { entry_id: entry.id, account_id: form.account_id, debit: form.amount, credit: 0 },
        { entry_id: entry.id, account_id: cashAccount.id, debit: 0, credit: form.amount }
      ]);

      setExpenseModalOpen(false);
      setForm({ account_id: '', amount: 0, description: '', reference: '' });
      fetchData();
    } catch (error) {
      alert('Error recording expense: ' + error.message);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleAddAccount(e) {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      if (editingAccountId) {
        const { error } = await supabase.from('chart_of_accounts')
          .update(accountForm)
          .eq('id', editingAccountId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('chart_of_accounts').insert(accountForm);
        if (error) throw error;
      }
      
      setAccountModalOpen(false);
      setEditingAccountId(null);
      setAccountForm({ code: '', name: '', type: 'EXPENSE' });
      fetchData();
    } catch (error) {
      alert('Error saving account: ' + error.message);
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleEditAccount(acc) {
    setAccountForm({ code: acc.code, name: acc.name, type: acc.type });
    setEditingAccountId(acc.id);
    setAccountModalOpen(true);
  }

  // --- Calculations for Reports ---
  
  // Calculate running balances per account for Trial Balance and Income Statement
  const accountBalances = useMemo(() => {
    const balances = {};
    accounts.forEach(a => {
      balances[a.id] = { ...a, totalDebit: 0, totalCredit: 0, netBalance: 0 };
    });

    journals.forEach(journal => {
      journal.journal_lines?.forEach(line => {
        if (balances[line.account_id]) {
          balances[line.account_id].totalDebit += Number(line.debit || 0);
          balances[line.account_id].totalCredit += Number(line.credit || 0);
        }
      });
    });

    Object.values(balances).forEach(acc => {
      // Normal balances: ASSET & EXPENSE are Debit normal. LIABILITY, EQUITY, REVENUE are Credit normal.
      if (acc.type === 'ASSET' || acc.type === 'EXPENSE') {
        acc.netBalance = acc.totalDebit - acc.totalCredit;
      } else {
        acc.netBalance = acc.totalCredit - acc.totalDebit;
      }
    });

    return balances;
  }, [accounts, journals]);

  // --- Export Function ---
  function handleExport(format) {
    const title = activeTab === 'journals' ? 'Journal Entries' :
                  activeTab === 'chart' ? 'Chart of Accounts' :
                  activeTab === 'ledger' ? 'General Ledger' :
                  activeTab === 'trial' ? 'Trial Balance' : 'Income Statement';
    
    let tableData = [];
    let headers = [];

    if (activeTab === 'journals') {
      headers = ['Date', 'Reference', 'Description', 'Account', 'Debit', 'Credit'];
      journals.forEach(entry => {
        entry.journal_lines?.forEach(line => {
          tableData.push([
            new Date(entry.date).toLocaleDateString(),
            entry.reference || '',
            entry.description || '',
            `${line.chart_of_accounts?.code} - ${line.chart_of_accounts?.name}`,
            line.debit || 0,
            line.credit || 0
          ]);
        });
      });
    } else if (activeTab === 'chart') {
      headers = ['Code', 'Account Name', 'Type'];
      accounts.forEach(acc => {
        tableData.push([acc.code, acc.name, acc.type]);
      });
    } else if (activeTab === 'ledger') {
      headers = ['Date', 'Description', 'Debit', 'Credit', 'Balance'];
      let ledgerLines = [];
      let runningBalance = 0;
      if (ledgerAccountId) {
        const selectedAccount = accounts.find(a => a.id === ledgerAccountId);
        const isDebitNormal = selectedAccount?.type === 'ASSET' || selectedAccount?.type === 'EXPENSE';
        let totalDebit = 0;
        let totalCredit = 0;
        journals.forEach(j => {
          j.journal_lines?.forEach(line => {
            if (line.account_id === ledgerAccountId) {
              ledgerLines.push({ date: j.date, description: j.description, debit: Number(line.debit), credit: Number(line.credit) });
            }
          });
        });
        ledgerLines.sort((a, b) => new Date(a.date) - new Date(b.date));
        ledgerLines.forEach(line => {
          if (isDebitNormal) runningBalance += line.debit - line.credit;
          else runningBalance += line.credit - line.debit;
          totalDebit += line.debit;
          totalCredit += line.credit;
          tableData.push([new Date(line.date).toLocaleDateString(), line.description, line.debit, line.credit, runningBalance]);
        });
        if (ledgerLines.length > 0) {
          tableData.push(['', 'TOTAL', totalDebit, totalCredit, '']);
        }
      }
    } else if (activeTab === 'trial') {
      headers = ['Account', 'Debit', 'Credit'];
      const balances = Object.values(accountBalances).filter(a => a.totalDebit > 0 || a.totalCredit > 0);
      balances.forEach(acc => {
        const isDebit = acc.type === 'ASSET' || acc.type === 'EXPENSE';
        tableData.push([`${acc.code} - ${acc.name}`, isDebit && acc.netBalance !== 0 ? acc.netBalance : 0, !isDebit && acc.netBalance !== 0 ? acc.netBalance : 0]);
      });
    } else if (activeTab === 'income') {
      headers = ['Category', 'Account', 'Amount'];
      const revenues = Object.values(accountBalances).filter(a => a.type === 'REVENUE' && a.netBalance !== 0);
      const expenses = Object.values(accountBalances).filter(a => a.type === 'EXPENSE' && a.netBalance !== 0);
      
      let totalRev = 0;
      revenues.forEach(acc => {
        tableData.push(['Revenue', acc.name, acc.netBalance]);
        totalRev += acc.netBalance;
      });
      tableData.push(['Summary', 'Total Revenue', totalRev]);
      
      let totalExp = 0;
      expenses.forEach(acc => {
        tableData.push(['Expense', acc.name, acc.netBalance]);
        totalExp += acc.netBalance;
      });
      tableData.push(['Summary', 'Total Expenses', totalExp]);
      
      tableData.push(['Summary', 'Net Income', totalRev - totalExp]);
    }

    if (format === 'excel') {
      const dataObj = tableData.map(row => {
        let obj = {};
        headers.forEach((h, i) => obj[h] = row[i]);
        return obj;
      });
      const ws = XLSX.utils.json_to_sheet(dataObj);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, title.substring(0, 31));
      XLSX.writeFile(wb, `${title.replace(/\\s+/g, '_')}.xlsx`);
    } else if (format === 'pdf') {
      const doc = new jsPDF();
      doc.text(title, 14, 15);
      autoTable(doc, {
        head: [headers],
        body: tableData,
        startY: 20
      });
      doc.save(`${title.replace(/\\s+/g, '_')}.pdf`);
    }
  }

  // --- Render Helpers ---

  const renderJournals = () => (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between' }}>
        <h3 style={{ margin: 0 }}>Recent Journal Entries</h3>
      </div>
      <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        {journals.length === 0 ? <p style={{ color: 'var(--text-muted)' }}>No entries found.</p> : null}
        {journals.map(entry => (
          <div key={entry.id} style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
            <div style={{ backgroundColor: 'var(--bg-elevated)', padding: '1rem 1.5rem', display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border)' }}>
              <div>
                <span style={{ fontWeight: 600, marginRight: '1rem' }}>{new Date(entry.date).toLocaleDateString()}</span>
                <span style={{ color: 'var(--text-muted)' }}>Ref: {entry.reference || 'N/A'}</span>
              </div>
            </div>
            <div style={{ padding: '1rem 1.5rem' }}>
              <p style={{ marginBottom: '1rem', fontWeight: 500 }}>{entry.description}</p>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                <thead>
                  <tr style={{ color: 'var(--text-muted)', borderBottom: '1px solid var(--border)' }}>
                    <th style={{ textAlign: 'left', paddingBottom: '0.5rem', fontWeight: 500 }}>Account</th>
                    <th style={{ textAlign: 'right', paddingBottom: '0.5rem', fontWeight: 500 }}>Debit (৳)</th>
                    <th style={{ textAlign: 'right', paddingBottom: '0.5rem', fontWeight: 500 }}>Credit (৳)</th>
                  </tr>
                </thead>
                <tbody>
                  {entry.journal_lines?.map(line => (
                    <tr key={line.id}>
                      <td style={{ paddingTop: '0.5rem' }}>
                        <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', marginRight: '0.5rem' }}>{line.chart_of_accounts?.code}</span>
                        {line.chart_of_accounts?.name}
                      </td>
                      <td style={{ paddingTop: '0.5rem', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{line.debit > 0 ? Number(line.debit).toLocaleString() : '-'}</td>
                      <td style={{ paddingTop: '0.5rem', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{line.credit > 0 ? Number(line.credit).toLocaleString() : '-'}</td>
                    </tr>
                  ))}
                  <tr style={{ fontWeight: 600 }}>
                    <td style={{ paddingTop: '0.5rem', textAlign: 'right', borderTop: '1px solid var(--border)' }}>Total:</td>
                    <td style={{ paddingTop: '0.5rem', textAlign: 'right', fontFamily: 'var(--font-mono)', borderTop: '1px solid var(--border)' }}>{entry.journal_lines?.reduce((sum, line) => sum + Number(line.debit || 0), 0).toLocaleString()}</td>
                    <td style={{ paddingTop: '0.5rem', textAlign: 'right', fontFamily: 'var(--font-mono)', borderTop: '1px solid var(--border)' }}>{entry.journal_lines?.reduce((sum, line) => sum + Number(line.credit || 0), 0).toLocaleString()}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  const renderChartOfAccounts = () => (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ margin: 0 }}>Chart of Accounts</h3>
        <button className="btn btn-primary" onClick={() => setAccountModalOpen(true)}>
          <Plus size={16} style={{ marginRight: '0.5rem' }} /> New Account
        </button>
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
        <thead>
          <tr style={{ backgroundColor: 'var(--bg-elevated)', borderBottom: '1px solid var(--border)' }}>
            <th style={{ padding: '1rem 1.5rem', fontWeight: 500, color: 'var(--text-muted)' }}>Code</th>
            <th style={{ padding: '1rem 1.5rem', fontWeight: 500, color: 'var(--text-muted)' }}>Account Name</th>
            <th style={{ padding: '1rem 1.5rem', fontWeight: 500, color: 'var(--text-muted)' }}>Type</th>
            <th style={{ padding: '1rem 1.5rem', fontWeight: 500, color: 'var(--text-muted)', textAlign: 'right' }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {accounts.map(acc => (
            <tr key={acc.id} style={{ borderBottom: '1px solid var(--border)' }}>
              <td style={{ padding: '1rem 1.5rem', fontFamily: 'var(--font-mono)' }}>{acc.code}</td>
              <td style={{ padding: '1rem 1.5rem', fontWeight: 500 }}>{acc.name}</td>
              <td style={{ padding: '1rem 1.5rem' }}>
                <span style={{ padding: '0.25rem 0.5rem', backgroundColor: 'var(--bg-elevated)', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 600 }}>{acc.type}</span>
              </td>
              <td style={{ padding: '1rem 1.5rem', textAlign: 'right' }}>
                <button onClick={() => handleEditAccount(acc)} className="btn btn-secondary" style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }} title="Edit Account">
                  <Edit2 size={16} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  const renderGeneralLedger = () => {
    // Flatten lines for the selected account
    let ledgerLines = [];
    let runningBalance = 0;
    
    if (ledgerAccountId) {
      const selectedAccount = accounts.find(a => a.id === ledgerAccountId);
      const isDebitNormal = selectedAccount?.type === 'ASSET' || selectedAccount?.type === 'EXPENSE';

      // Gather all lines
      journals.forEach(j => {
        j.journal_lines?.forEach(line => {
          if (line.account_id === ledgerAccountId) {
            ledgerLines.push({
              id: line.id,
              date: j.date,
              reference: j.reference,
              description: j.description,
              debit: Number(line.debit),
              credit: Number(line.credit)
            });
          }
        });
      });

      // Sort chronological (oldest first) to calculate running balance
      ledgerLines.sort((a, b) => new Date(a.date) - new Date(b.date));

      ledgerLines = ledgerLines.map(line => {
        if (isDebitNormal) {
          runningBalance += line.debit - line.credit;
        } else {
          runningBalance += line.credit - line.debit;
        }
        return { ...line, balance: runningBalance };
      });
      
      // Reverse for display (newest first)
      ledgerLines.reverse();
    }

    return (
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--border)', display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <h3 style={{ margin: 0, whiteSpace: 'nowrap' }}>General Ledger</h3>
          <select className="input-field" value={ledgerAccountId} onChange={e => setLedgerAccountId(e.target.value)} style={{ maxWidth: '300px' }}>
            {accounts.map(a => <option key={a.id} value={a.id}>{a.code} - {a.name}</option>)}
          </select>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ backgroundColor: 'var(--bg-elevated)', borderBottom: '1px solid var(--border)' }}>
                <th style={{ padding: '1rem 1.5rem', fontWeight: 500, color: 'var(--text-muted)' }}>Date</th>
                <th style={{ padding: '1rem 1.5rem', fontWeight: 500, color: 'var(--text-muted)' }}>Description</th>
                <th style={{ padding: '1rem 1.5rem', fontWeight: 500, color: 'var(--text-muted)', textAlign: 'right' }}>Debit</th>
                <th style={{ padding: '1rem 1.5rem', fontWeight: 500, color: 'var(--text-muted)', textAlign: 'right' }}>Credit</th>
                <th style={{ padding: '1rem 1.5rem', fontWeight: 500, color: 'var(--text-muted)', textAlign: 'right' }}>Balance</th>
              </tr>
            </thead>
            <tbody>
              {ledgerLines.length === 0 ? (
                <tr><td colSpan="5" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>No transactions found for this account.</td></tr>
              ) : (
                <>
                  {ledgerLines.map(line => (
                    <tr key={line.id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '1rem 1.5rem', color: 'var(--text-muted)' }}>{new Date(line.date).toLocaleDateString()}</td>
                      <td style={{ padding: '1rem 1.5rem' }}>{line.description}</td>
                      <td style={{ padding: '1rem 1.5rem', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{line.debit > 0 ? line.debit.toLocaleString() : '-'}</td>
                      <td style={{ padding: '1rem 1.5rem', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{line.credit > 0 ? line.credit.toLocaleString() : '-'}</td>
                      <td style={{ padding: '1rem 1.5rem', textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>৳{line.balance.toLocaleString()}</td>
                    </tr>
                  ))}
                  <tr style={{ backgroundColor: 'var(--bg-elevated)', fontWeight: 600 }}>
                    <td colSpan="2" style={{ padding: '1rem 1.5rem', textAlign: 'right' }}>TOTAL</td>
                    <td style={{ padding: '1rem 1.5rem', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                      {ledgerLines.reduce((sum, line) => sum + line.debit, 0).toLocaleString()}
                    </td>
                    <td style={{ padding: '1rem 1.5rem', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                      {ledgerLines.reduce((sum, line) => sum + line.credit, 0).toLocaleString()}
                    </td>
                    <td style={{ padding: '1rem 1.5rem' }}></td>
                  </tr>
                </>
              )}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  const renderTrialBalance = () => {
    const balances = Object.values(accountBalances).filter(a => a.totalDebit > 0 || a.totalCredit > 0);
    const totalDebit = balances.reduce((sum, a) => sum + (a.type === 'ASSET' || a.type === 'EXPENSE' ? a.netBalance : 0), 0);
    const totalCredit = balances.reduce((sum, a) => sum + (a.type !== 'ASSET' && a.type !== 'EXPENSE' ? a.netBalance : 0), 0);

    return (
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--border)' }}>
          <h3 style={{ margin: 0 }}>Trial Balance</h3>
          <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.875rem' }}>As of {new Date().toLocaleDateString()}</p>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead>
            <tr style={{ backgroundColor: 'var(--bg-elevated)', borderBottom: '1px solid var(--border)' }}>
              <th style={{ padding: '1rem 1.5rem', fontWeight: 500, color: 'var(--text-muted)' }}>Account</th>
              <th style={{ padding: '1rem 1.5rem', fontWeight: 500, color: 'var(--text-muted)', textAlign: 'right' }}>Debit (৳)</th>
              <th style={{ padding: '1rem 1.5rem', fontWeight: 500, color: 'var(--text-muted)', textAlign: 'right' }}>Credit (৳)</th>
            </tr>
          </thead>
          <tbody>
            {balances.map(acc => {
              const isDebit = acc.type === 'ASSET' || acc.type === 'EXPENSE';
              return (
                <tr key={acc.id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '1rem 1.5rem' }}>
                    <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', marginRight: '1rem' }}>{acc.code}</span>
                    {acc.name}
                  </td>
                  <td style={{ padding: '1rem 1.5rem', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{isDebit && acc.netBalance !== 0 ? acc.netBalance.toLocaleString() : '-'}</td>
                  <td style={{ padding: '1rem 1.5rem', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{!isDebit && acc.netBalance !== 0 ? acc.netBalance.toLocaleString() : '-'}</td>
                </tr>
              );
            })}
            <tr style={{ backgroundColor: 'var(--bg-elevated)', fontWeight: 600 }}>
              <td style={{ padding: '1rem 1.5rem', textAlign: 'right' }}>TOTAL</td>
              <td style={{ padding: '1rem 1.5rem', textAlign: 'right', fontFamily: 'var(--font-mono)', color: totalDebit === totalCredit ? 'var(--success)' : 'var(--danger)' }}>{totalDebit.toLocaleString()}</td>
              <td style={{ padding: '1rem 1.5rem', textAlign: 'right', fontFamily: 'var(--font-mono)', color: totalDebit === totalCredit ? 'var(--success)' : 'var(--danger)' }}>{totalCredit.toLocaleString()}</td>
            </tr>
          </tbody>
        </table>
      </div>
    );
  };

  const renderIncomeStatement = () => {
    const revenues = Object.values(accountBalances).filter(a => a.type === 'REVENUE' && a.netBalance !== 0);
    const expenses = Object.values(accountBalances).filter(a => a.type === 'EXPENSE' && a.netBalance !== 0);

    const totalRevenue = revenues.reduce((sum, a) => sum + a.netBalance, 0);
    const totalExpense = expenses.reduce((sum, a) => sum + a.netBalance, 0);
    const netIncome = totalRevenue - totalExpense;

    return (
      <div className="card" style={{ padding: '2rem' }}>
        <h2 style={{ textAlign: 'center', marginBottom: '0.5rem' }}>Income Statement</h2>
        <p style={{ textAlign: 'center', color: 'var(--text-muted)', marginBottom: '3rem' }}>
          {startDate && endDate ? `${new Date(startDate).toLocaleDateString()} - ${new Date(endDate).toLocaleDateString()}` : 'All-Time Summary'}
        </p>

        <div style={{ marginBottom: '2rem' }}>
          <h4 style={{ borderBottom: '2px solid var(--border)', paddingBottom: '0.5rem', marginBottom: '1rem', color: 'var(--primary)' }}>Revenues</h4>
          {revenues.length === 0 && <p style={{ color: 'var(--text-muted)' }}>No revenue recorded.</p>}
          {revenues.map(acc => (
            <div key={acc.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0' }}>
              <span>{acc.name}</span>
              <span style={{ fontFamily: 'var(--font-mono)' }}>{acc.netBalance.toLocaleString()}</span>
            </div>
          ))}
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '1rem 0', fontWeight: 600, borderTop: '1px solid var(--border)', marginTop: '0.5rem' }}>
            <span>Total Revenue</span>
            <span style={{ fontFamily: 'var(--font-mono)' }}>৳{totalRevenue.toLocaleString()}</span>
          </div>
        </div>

        <div style={{ marginBottom: '2rem' }}>
          <h4 style={{ borderBottom: '2px solid var(--border)', paddingBottom: '0.5rem', marginBottom: '1rem', color: 'var(--danger)' }}>Expenses</h4>
          {expenses.length === 0 && <p style={{ color: 'var(--text-muted)' }}>No expenses recorded.</p>}
          {expenses.map(acc => (
            <div key={acc.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0' }}>
              <span>{acc.name}</span>
              <span style={{ fontFamily: 'var(--font-mono)' }}>{acc.netBalance.toLocaleString()}</span>
            </div>
          ))}
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '1rem 0', fontWeight: 600, borderTop: '1px solid var(--border)', marginTop: '0.5rem' }}>
            <span>Total Expenses</span>
            <span style={{ fontFamily: 'var(--font-mono)' }}>৳{totalExpense.toLocaleString()}</span>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '1.5rem', backgroundColor: netIncome >= 0 ? 'var(--success-bg)' : 'var(--danger-bg)', borderRadius: 'var(--radius-md)', fontWeight: 700, fontSize: '1.25rem', color: netIncome >= 0 ? 'var(--success)' : 'var(--danger)' }}>
          <span>Net Income</span>
          <span style={{ fontFamily: 'var(--font-mono)' }}>৳{netIncome.toLocaleString()}</span>
        </div>
      </div>
    );
  };

  return (
    <div className="animate-fade-in">
      <div className="flex-between" style={{ marginBottom: '2rem' }}>
        <div>
          <h1>Income & Expense</h1>
          <p style={{ color: 'var(--text-muted)' }}>Double-entry accounting ledger and comprehensive financial reports.</p>
        </div>
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', justifyContent: 'flex-end', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', backgroundColor: 'var(--bg-elevated)', padding: '0.25rem 0.5rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} style={{ background: 'transparent', border: 'none', outline: 'none', color: 'var(--text-main)', fontSize: '0.875rem' }} />
            <span style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>to</span>
            <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} style={{ background: 'transparent', border: 'none', outline: 'none', color: 'var(--text-main)', fontSize: '0.875rem' }} />
          </div>
          <button className="btn btn-secondary" onClick={() => handleExport('excel')} title="Export current view to Excel">
            <Download size={18} style={{ marginRight: '0.5rem' }} /> Excel
          </button>
          <button className="btn btn-secondary" onClick={() => handleExport('pdf')} title="Export current view to PDF">
            <Download size={18} style={{ marginRight: '0.5rem' }} /> PDF
          </button>
          <button className="btn btn-secondary" onClick={() => setExpenseModalOpen(true)}>
            <Minus size={18} style={{ marginRight: '0.5rem' }} /> New Expense
          </button>
          <button className="btn btn-primary" onClick={() => setIncomeModalOpen(true)}>
            <Plus size={18} style={{ marginRight: '0.5rem' }} /> New Income
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '250px 1fr', gap: '2rem' }}>
        {/* Navigation Sidebar */}
        <div className="card" style={{ padding: '1rem', alignSelf: 'start', position: 'sticky', top: '2rem' }}>
          <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem', padding: '0 0.5rem' }}>
            <BookOpen size={18} color="var(--primary)" /> Accounting
          </h3>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            {[
              { id: 'journals', label: 'Journal Entries', icon: <List size={16} /> },
              { id: 'chart', label: 'Chart of Accounts', icon: <BookOpen size={16} /> },
              { id: 'ledger', label: 'General Ledger', icon: <List size={16} /> },
              { id: 'trial', label: 'Trial Balance', icon: <PieChart size={16} /> },
              { id: 'income', label: 'Income Statement', icon: <TrendingUp size={16} /> }
            ].map(tab => (
              <li key={tab.id}>
                <button 
                  onClick={() => setActiveTab(tab.id)}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '0.75rem 1rem',
                    backgroundColor: activeTab === tab.id ? 'var(--primary-subtle)' : 'transparent',
                    color: activeTab === tab.id ? 'var(--primary)' : 'var(--text-main)',
                    border: 'none',
                    borderRadius: 'var(--radius-md)',
                    cursor: 'pointer',
                    fontWeight: activeTab === tab.id ? 600 : 500,
                    transition: 'all var(--transition-fast)'
                  }}
                  className="hover:bg-var(--bg-elevated)"
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    {tab.icon} {tab.label}
                  </div>
                  {activeTab === tab.id && <ChevronRight size={16} />}
                </button>
              </li>
            ))}
          </ul>
        </div>

        {/* Main Content Area */}
        {loading ? (
          <div className="card" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '400px' }}>
            <p style={{ color: 'var(--text-muted)' }}>Loading financial data...</p>
          </div>
        ) : (
          <div>
            {activeTab === 'journals' && renderJournals()}
            {activeTab === 'chart' && renderChartOfAccounts()}
            {activeTab === 'ledger' && renderGeneralLedger()}
            {activeTab === 'trial' && renderTrialBalance()}
            {activeTab === 'income' && renderIncomeStatement()}
          </div>
        )}
      </div>

      {/* --- Modals --- */}
      <Modal isOpen={isIncomeModalOpen} onClose={() => setIncomeModalOpen(false)} title="Record New Income">
        <form onSubmit={handleAddIncome} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>Income Source / Account</label>
            <select required className="input-field" value={form.account_id} onChange={e => setForm({...form, account_id: e.target.value})}>
              <option value="">Select Income Account</option>
              {accounts.filter(a => a.type === 'REVENUE').map(a => <option key={a.id} value={a.id}>{a.code} - {a.name}</option>)}
            </select>
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>Amount (৳)</label>
            <input required type="number" min="1" className="input-field" value={form.amount || ''} onChange={e => setForm({...form, amount: Number(e.target.value)})} />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>Description</label>
            <input required type="text" className="input-field" value={form.description} onChange={e => setForm({...form, description: e.target.value})} placeholder="e.g. Monthly Donation" />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>Reference (Optional)</label>
            <input type="text" className="input-field" value={form.reference} onChange={e => setForm({...form, reference: e.target.value})} placeholder="Receipt / Trx ID" />
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '1rem' }}>
            <button type="button" className="btn btn-secondary" onClick={() => setIncomeModalOpen(false)}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={isSubmitting}>{isSubmitting ? 'Saving...' : 'Save Income'}</button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={isExpenseModalOpen} onClose={() => setExpenseModalOpen(false)} title="Record New Expense">
        <form onSubmit={handleAddExpense} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>Expense Category / Account</label>
            <select required className="input-field" value={form.account_id} onChange={e => setForm({...form, account_id: e.target.value})}>
              <option value="">Select Expense Account</option>
              {accounts.filter(a => a.type === 'EXPENSE').map(a => <option key={a.id} value={a.id}>{a.code} - {a.name}</option>)}
            </select>
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>Amount (৳)</label>
            <input required type="number" min="1" className="input-field" value={form.amount || ''} onChange={e => setForm({...form, amount: Number(e.target.value)})} />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>Description</label>
            <input required type="text" className="input-field" value={form.description} onChange={e => setForm({...form, description: e.target.value})} placeholder="e.g. Office Supplies" />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>Reference (Optional)</label>
            <input type="text" className="input-field" value={form.reference} onChange={e => setForm({...form, reference: e.target.value})} placeholder="Invoice / Voucher No" />
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '1rem' }}>
            <button type="button" className="btn btn-secondary" onClick={() => setExpenseModalOpen(false)}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={isSubmitting}>{isSubmitting ? 'Saving...' : 'Save Expense'}</button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={isAccountModalOpen} onClose={() => setAccountModalOpen(false)} title="Create New Account">
        <form onSubmit={handleAddAccount} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>Account Type</label>
            <select required className="input-field" value={accountForm.type} onChange={e => setAccountForm({...accountForm, type: e.target.value})}>
              <option value="ASSET">Asset</option>
              <option value="LIABILITY">Liability</option>
              <option value="EQUITY">Equity</option>
              <option value="REVENUE">Revenue</option>
              <option value="EXPENSE">Expense</option>
            </select>
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>Account Code (e.g., 5200)</label>
            <input required type="text" className="input-field" value={accountForm.code} onChange={e => setAccountForm({...accountForm, code: e.target.value})} />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>Account Name</label>
            <input required type="text" className="input-field" value={accountForm.name} onChange={e => setAccountForm({...accountForm, name: e.target.value})} placeholder="e.g. Internet Bill" />
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '1rem' }}>
            <button type="button" className="btn btn-secondary" onClick={() => { setAccountModalOpen(false); setEditingAccountId(null); setAccountForm({ code: '', name: '', type: 'EXPENSE' }); }}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={isSubmitting}>{isSubmitting ? 'Saving...' : (editingAccountId ? 'Update Account' : 'Create Account')}</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
