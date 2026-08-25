import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://ocfdnzokcbdzpnmxahtp.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9jZmRuem9rY2JkenBubXhhaHRwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY2NDA3MzIsImV4cCI6MjEwMjIxNjczMn0.WeVPB0Q0rqH2roewdG44-eDxs-X-gmw55bxK9hhFdqE';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function run() {
  console.log("Fetching employees...");
  const { data: employees } = await supabase.from('employees').select('id').eq('status', 'active');
  if (!employees || employees.length === 0) {
    console.log("No active employees found. Creating a demo employee...");
    return;
  }

  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth(); // 0-indexed
  const daysInMonth = today.getDate(); // Up to today's date

  const attendanceData = [];
  const statuses = ['PRESENT', 'PRESENT', 'PRESENT', 'PRESENT', 'ABSENT', 'LEAVE']; // weighted

  console.log(`Generating attendance for ${employees.length} employees up to day ${daysInMonth}...`);

  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    
    // Skip weekends (Friday/Saturday in BD)
    const d = new Date(year, month, day);
    if (d.getDay() === 5 || d.getDay() === 6) continue;

    for (const emp of employees) {
      const status = statuses[Math.floor(Math.random() * statuses.length)];
      attendanceData.push({
        employee_id: emp.id,
        date: dateStr,
        status: status
      });
    }
  }

  console.log(`Upserting ${attendanceData.length} records...`);
  
  // Insert in batches of 100
  for (let i = 0; i < attendanceData.length; i += 100) {
    const batch = attendanceData.slice(i, i + 100);
    const { error } = await supabase.from('attendance').upsert(batch, { onConflict: 'employee_id, date' });
    if (error) {
      console.error("Error inserting batch:", error);
    } else {
      console.log(`Inserted ${i + batch.length} / ${attendanceData.length}`);
    }
  }

  console.log("Random attendance generation complete!");
}

run();
