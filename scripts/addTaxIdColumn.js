#!/usr/bin/env node
/**
 * Script to add tax_id column to clients table in Supabase
 * This fixes the schema cache issue when tax_id column is missing
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL || 'https://taboklgtcpykicqufkha.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRhYm9rbGd0Y3B5a2ljcXVma2hhIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NzQ1ODYzMiwiZXhwIjoyMDgzMDM0NjMyfQ.ejd8-EN_SNkr4UQNjhfqqTkIAw2064MRObMdrAbNAvk';

// Use service role key for admin operations
const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

async function addTaxIdColumn() {
  try {
    console.log('🔍 Checking if tax_id column exists in clients table...\n');

    // First, check if the column exists by trying to query it
    const { data: testData, error: testError } = await supabase
      .from('clients')
      .select('tax_id')
      .limit(1);

    if (!testError) {
      console.log('✅ tax_id column already exists in clients table!\n');
      console.log('💡 If you\'re still seeing schema cache errors, try:');
      console.log('   1. Refresh your browser');
      console.log('   2. Wait a few seconds for Supabase schema cache to update');
      console.log('   3. Restart the backend server\n');
      return;
    }

    // If we get a schema cache error, the column doesn't exist
    if (testError && testError.message.includes('tax_id')) {
      console.log('❌ tax_id column is missing from clients table\n');
      console.log('📋 To add the column, please run this SQL in Supabase SQL Editor:\n');
      console.log('   https://taboklgtcpykicqufkha.supabase.co/project/_/sql\n');
      console.log('   SQL to run:');
      console.log('   ──────────────────────────────────────────────────────────────');
      console.log('   ALTER TABLE clients ADD COLUMN IF NOT EXISTS tax_id VARCHAR(100);');
      console.log('   ──────────────────────────────────────────────────────────────\n');
      console.log('   Or run the complete fix script:');
      console.log('   backend/scripts/ensureAllClientsColumns.sql\n');
      console.log('   After running the SQL, refresh your browser and restart the backend.\n');
      
      // Try to execute via RPC if available, otherwise provide instructions
      console.log('⚠️  Note: Supabase client library cannot execute DDL commands directly.');
      console.log('   You must run the SQL in Supabase SQL Editor.\n');
      
      process.exit(1);
    }

    // Other errors
    throw testError;
  } catch (error) {
    console.error('❌ Error checking tax_id column:', error.message);
    console.error('\n💡 Please run this SQL in Supabase SQL Editor:');
    console.error('   ALTER TABLE clients ADD COLUMN IF NOT EXISTS tax_id VARCHAR(100);\n');
    process.exit(1);
  }
}

// Run the script
addTaxIdColumn();
