/**
 * Verify Supabase Realtime Configuration
 * 
 * This script checks if the required tables are added to the supabase_realtime publication.
 * Run this after applying the migration to verify the configuration.
 * 
 * Usage: node scripts/verify-realtime-config.js
 * 
 * Requirements: SUPABASE_URL and SUPABASE_SERVICE_KEY environment variables
 */

import { createClient } from '@supabase/supabase-js';

const REQUIRED_TABLES = ['applications', 'payments', 'in_app_notifications'];

async function verifyRealtimeConfig() {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_KEY environment variables');
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  console.log('🔍 Checking Supabase Realtime publication configuration...\n');

  try {
    // Query the pg_publication_tables to check which tables are in the publication
    const { data, error } = await supabase.rpc('get_realtime_tables');

    if (error) {
      // If RPC doesn't exist, try direct query (requires service key)
      console.log('ℹ️  RPC not available, checking via direct query...');
      
      const { data: tables, error: queryError } = await supabase
        .from('pg_publication_tables')
        .select('tablename')
        .eq('pubname', 'supabase_realtime');

      if (queryError) {
        console.log('⚠️  Cannot query publication tables directly.');
        console.log('   Please run the following SQL in Supabase SQL Editor to verify:\n');
        console.log('   SELECT tablename FROM pg_publication_tables WHERE pubname = \'supabase_realtime\';\n');
        return;
      }

      checkTables(tables?.map(t => t.tablename) || []);
      return;
    }

    checkTables(data || []);
  } catch (err) {
    console.error('❌ Error checking realtime configuration:', err.message);
    console.log('\n📋 Manual verification SQL:');
    console.log('   SELECT tablename FROM pg_publication_tables WHERE pubname = \'supabase_realtime\';');
  }
}

function checkTables(configuredTables) {
  console.log('📊 Realtime Publication Status:\n');
  
  let allConfigured = true;
  
  for (const table of REQUIRED_TABLES) {
    const isConfigured = configuredTables.includes(table);
    const status = isConfigured ? '✅' : '❌';
    console.log(`   ${status} ${table}`);
    
    if (!isConfigured) {
      allConfigured = false;
    }
  }

  console.log('');

  if (allConfigured) {
    console.log('✅ All required tables are configured for realtime updates!');
  } else {
    console.log('⚠️  Some tables are missing from the realtime publication.');
    console.log('   Run the migration: supabase/migrations/20250115_enable_realtime_tables.sql');
  }
}

// SQL to add tables if needed (for reference)
const MIGRATION_SQL = `
-- Run this in Supabase SQL Editor if migration hasn't been applied:

ALTER PUBLICATION supabase_realtime ADD TABLE applications;
ALTER PUBLICATION supabase_realtime ADD TABLE payments;
ALTER PUBLICATION supabase_realtime ADD TABLE in_app_notifications;

-- Verify with:
SELECT tablename FROM pg_publication_tables WHERE pubname = 'supabase_realtime';
`;

console.log('='.repeat(60));
console.log('Supabase Realtime Configuration Verification');
console.log('='.repeat(60));
console.log('');

verifyRealtimeConfig().catch(console.error);
