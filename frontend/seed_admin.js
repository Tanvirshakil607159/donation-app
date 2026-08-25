import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://ocfdnzokcbdzpnmxahtp.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9jZmRuem9rY2JkenBubXhhaHRwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY2NDA3MzIsImV4cCI6MjEwMjIxNjczMn0.WeVPB0Q0rqH2roewdG44-eDxs-X-gmw55bxK9hhFdqE';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function createAdmin() {
  const username = 'admin';
  const password = 'password123';
  const hiddenEmail = `${username.toLowerCase().trim()}@app.com`;

  console.log(`Attempting to create user: ${username}`);
  
  const { data: authData, error: authError } = await supabase.auth.signUp({
    email: hiddenEmail,
    password: password
  });

  if (authError) {
    if (authError.message.includes('rate limit')) {
      console.error("\n❌ ERROR: Email rate limit exceeded.");
      console.error("This means 'Email Confirmations' is still ENABLED in your Supabase project.");
      console.error("Please go to Supabase Dashboard -> Authentication -> Providers -> Email, and turn OFF 'Confirm email'.");
    } else {
      console.error("Error creating admin:", authError.message);
    }
    return;
  }

  // Insert into admins table if it exists (Optional, adjust if your table is different)
  if (authData.user) {
    const { error: dbError } = await supabase.from('admins').insert([{
      id: authData.user.id,
      username: username,
      full_name: 'System Admin'
    }]);
    
    if (dbError && dbError.code !== '23505') { // Ignore duplicate key errors if admin already in table
      console.warn("User authenticated but error inserting into admins table:", dbError.message);
    } else {
      console.log(`\n✅ Admin created successfully!`);
      console.log(`Username: ${username}`);
      console.log(`Password: ${password}`);
      console.log(`\nYou can now log in at /login`);
    }
  }
}

createAdmin();
