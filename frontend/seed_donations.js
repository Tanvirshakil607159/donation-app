import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://ocfdnzokcbdzpnmxahtp.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9jZmRuem9rY2JkenBubXhhaHRwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY2NDA3MzIsImV4cCI6MjEwMjIxNjczMn0.WeVPB0Q0rqH2roewdG44-eDxs-X-gmw55bxK9hhFdqE';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function run() {
  console.log("Fetching members...");
  const { data: members, error: memErr } = await supabase.from('members').select('id, monthly_amount');
  
  if (memErr) {
    console.error("Error fetching members:", memErr);
    return;
  }
  
  if (!members || members.length === 0) {
    console.log("No members found. Please run the member seed script first.");
    return;
  }

  // Shuffle and pick 50 members
  const shuffled = members.sort(() => 0.5 - Math.random());
  const selectedMembers = shuffled.slice(0, 50);

  const donations = [];
  const cardTypes = ['VISA', 'MASTERCARD', 'BKASH', 'NAGAD'];
  
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1; // 1-12

  for (const member of selectedMembers) {
    const tran_id = `DON-DEMO-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    const card = cardTypes[Math.floor(Math.random() * cardTypes.length)];
    const fee = member.monthly_amount * 0.02; // 2% gateway fee
    const store_amount = member.monthly_amount - fee;
    
    // Pick a random recent month for the donation_month
    const monthOffset = Math.floor(Math.random() * 3); // 0, 1, or 2 months ago
    let dMonth = currentMonth - monthOffset;
    let dYear = currentYear;
    if (dMonth <= 0) {
      dMonth += 12;
      dYear -= 1;
    }
    const donation_month = `${dYear}-${String(dMonth).padStart(2, '0')}-01`;
    
    const pastDate = new Date();
    pastDate.setDate(pastDate.getDate() - Math.floor(Math.random() * 30));

    donations.push({
      member_id: member.id,
      tran_id: tran_id,
      amount: member.monthly_amount,
      currency: "BDT",
      donation_month: donation_month,
      status: "SUCCESS",
      val_id: `VAL-${Math.floor(Math.random() * 1000000)}`,
      bank_tran_id: `BANK-${Math.floor(Math.random() * 1000000)}`,
      card_type: card,
      card_issuer: card === 'BKASH' ? 'bKash' : card === 'NAGAD' ? 'Nagad' : 'Demo Bank',
      card_brand: card,
      store_amount: store_amount,
      risk_level: "0",
      gateway_response: { demo: true },
      validated_at: pastDate.toISOString(),
      paid_at: pastDate.toISOString(),
      created_at: pastDate.toISOString(),
      updated_at: pastDate.toISOString()
    });
  }

  console.log(`Inserting 50 donations...`);
  const { error: insertErr } = await supabase.from('donations').insert(donations);
  
  if (insertErr) {
    console.error("Error inserting donations:", insertErr);
  } else {
    console.log("Successfully generated 50 random payment records!");
  }
}

run();
