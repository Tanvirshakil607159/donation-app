import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://ocfdnzokcbdzpnmxahtp.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9jZmRuem9rY2JkenBubXhhaHRwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY2NDA3MzIsImV4cCI6MjEwMjIxNjczMn0.WeVPB0Q0rqH2roewdG44-eDxs-X-gmw55bxK9hhFdqE';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function run() {
  console.log("Starting data wipe...");
  
  // 1. Delete donations
  const { error: errDonations } = await supabase.from('donations').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  if (errDonations) console.error("Error deleting donations:", errDonations);
  
  // 2. Delete logs
  const { error: errLogs } = await supabase.from('sslcommerz_logs').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  if (errLogs) console.error("Error deleting logs:", errLogs);
  
  // 3. Delete members
  const { error: errMembers } = await supabase.from('members').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  if (errMembers) console.error("Error deleting members:", errMembers);

  console.log("Database wiped. Seeding 100 demo members...");

  const members = [];
  for (let i = 1; i <= 100; i++) {
    const code = `U13-${String(i).padStart(3, '0')}`;
    members.push({
      member_code: code,
      full_name: `Demo Member ${i}`,
      phone: `01700000${String(i).padStart(3, '0')}`,
      address: `Road ${Math.floor(Math.random() * 20) + 1}, Dhaka`,
      monthly_amount: 500 + Math.floor(Math.random() * 3) * 500, // 500, 1000, or 1500
      status: 'active',
      join_date: new Date().toISOString().split('T')[0]
    });
  }

  // Insert in batches of 50
  for (let i = 0; i < members.length; i += 50) {
    const batch = members.slice(i, i + 50);
    const { error: insertErr } = await supabase.from('members').insert(batch);
    if (insertErr) {
      console.error("Error inserting batch:", insertErr);
    } else {
      console.log(`Inserted batch of ${batch.length} members.`);
    }
  }

  console.log("Seeding complete!");
}

run();
