import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://ocfdnzokcbdzpnmxahtp.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9jZmRuem9rY2JkenBubXhhaHRwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY2NDA3MzIsImV4cCI6MjEwMjIxNjczMn0.WeVPB0Q0rqH2roewdG44-eDxs-X-gmw55bxK9hhFdqE';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function run() {
  console.log("Fetching donations without journal entries...");
  const { data: donations, error: donErr } = await supabase.from('donations').select('*').eq('status', 'SUCCESS');
  if (donErr) { console.error(donErr); return; }

  const { data: accounts } = await supabase.from('chart_of_accounts').select('id, code');
  const cashAcct = accounts?.find(a => a.code === '1000');
  const donationAcct = accounts?.find(a => a.code === '4000');
  if (!cashAcct || !donationAcct) { console.error("Accounts not found"); return; }

  const { data: existingEntries } = await supabase.from('journal_entries').select('reference');
  const existingRefs = new Set(existingEntries?.map(e => e.reference) || []);

  const toBackfill = donations.filter(d => !existingRefs.has(d.tran_id));
  console.log(`Found ${toBackfill.length} donations missing journal entries.`);

  for (const donation of toBackfill) {
    const { data: entry, error: entryErr } = await supabase.from('journal_entries').insert({
      reference: donation.tran_id,
      description: `Online Donation/Fee collected via SSLCommerz - ${donation.tran_id}`,
      status: 'POSTED',
      date: donation.paid_at || donation.created_at
    }).select().single();

    if (entryErr) { console.error("Error creating entry:", entryErr); continue; }

    await supabase.from('journal_lines').insert([
      { entry_id: entry.id, account_id: cashAcct.id, debit: Number(donation.store_amount), credit: 0, description: 'Donation Received' },
      { entry_id: entry.id, account_id: donationAcct.id, debit: 0, credit: Number(donation.store_amount), description: 'Donation Received' }
    ]);
  }
  
  console.log("Backfill complete!");
}
run();
