import { createClient } from '@supabase/supabase-js';

// Fallback to valid strings if env vars are missing to prevent crash during setup
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://ocfdnzokcbdzpnmxahtp.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.placeholder';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
