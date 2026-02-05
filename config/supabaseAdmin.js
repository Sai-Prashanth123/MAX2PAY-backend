/**
 * Supabase Admin Client (Service Role)
 * Use this for backend operations that need to bypass RLS
 * NEVER expose this to the frontend!
 */
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl) {
  console.error('❌ SUPABASE_URL is not set in backend/.env');
  process.exit(1);
}

if (!supabaseServiceKey) {
  console.error('❌ SUPABASE_SERVICE_ROLE_KEY is not set in backend/.env');
  console.error('⚠️  This key is required for backend operations. Get it from your Supabase dashboard.');
  process.exit(1);
}

// Service role client - bypasses RLS
// Note: Supabase JS client expects JWT format for service role key
// If using new API key format (sb_secret_...), you may need to use the legacy JWT format instead
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
  db: {
    schema: 'public',
  },
});

// Test the connection on startup
(async () => {
  try {
    const { error } = await supabaseAdmin.from('user_profiles').select('id').limit(1);
    if (error && error.message.includes('Invalid API key')) {
      console.error('❌ SUPABASE_SERVICE_ROLE_KEY appears to be invalid or in wrong format');
      console.error('⚠️  If you\'re using the new API key format (sb_secret_...), try using the legacy JWT format instead');
      console.error('⚠️  Get the JWT format key from: Supabase Dashboard → Project Settings → API → service_role key (JWT)');
    }
  } catch (err) {
    // Ignore connection errors during startup - they'll be caught at runtime
  }
})();

module.exports = supabaseAdmin;
