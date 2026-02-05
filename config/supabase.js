const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl) {
  console.error('❌ SUPABASE_URL is not set in backend/.env');
  process.exit(1);
}

if (!supabaseAnonKey) {
  console.error('❌ SUPABASE_ANON_KEY is not set in backend/.env');
  console.error('⚠️  This key is required for authentication. Get it from your Supabase dashboard.');
  process.exit(1);
}

// For auth (signInWithPassword, signUp, getUser) we only need the anon key.
// This avoids issues with invalid/rotated service role keys and is safe with RLS.
const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

module.exports = supabase;
