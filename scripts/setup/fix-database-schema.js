#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://mylgegkqoddcrxtwcclb.supabase.co';
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im15bGdlZ2txb2RkY3J4dHdjY2xiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NzUxMjA4MywiZXhwIjoyMDczMDg4MDgzfQ.FsspKE5bjcG4TW8IvG-N0o7W0E7ljxznwlzJCm50ZRE';

async function fixDatabaseSchema() {
  console.log('🔧 Fixing Database Schema...');
  
  const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  
  const fixes = [
    {
      name: 'Add additional_subjects column',
      sql: 'ALTER TABLE applications ADD COLUMN IF NOT EXISTS additional_subjects JSONB;'
    },
    {
      name: 'Add address_line_1 column', 
      sql: 'ALTER TABLE applications ADD COLUMN IF NOT EXISTS address_line_1 VARCHAR(255);'
    },
    {
      name: 'Add address_line_2 column',
      sql: 'ALTER TABLE applications ADD COLUMN IF NOT EXISTS address_line_2 VARCHAR(255);'
    },
    {
      name: 'Add postal_code column',
      sql: 'ALTER TABLE applications ADD COLUMN IF NOT EXISTS postal_code VARCHAR(20);'
    },
    {
      name: 'Create application number function',
      sql: `CREATE OR REPLACE FUNCTION generate_application_number(prefix VARCHAR DEFAULT 'MIHAS')
RETURNS VARCHAR AS $$
DECLARE
    year_part VARCHAR := EXTRACT(YEAR FROM NOW())::VARCHAR;
    random_part VARCHAR := LPAD(FLOOR(RANDOM() * 10000)::VARCHAR, 4, '0');
BEGIN
    RETURN prefix || year_part || random_part;
END;
$$ LANGUAGE plpgsql;`
    }
  ];
  
  for (const fix of fixes) {
    try {
      console.log(`🔄 ${fix.name}...`);
      const { error } = await adminClient.rpc('exec_sql', { sql: fix.sql });
      
      if (error) {
        console.log(`❌ ${fix.name}: ${error.message}`);
      } else {
        console.log(`✅ ${fix.name}: Success`);
      }
    } catch (err) {
      console.log(`❌ ${fix.name}: ${err.message}`);
    }
  }
  
  console.log('\n🎉 Schema fixes completed!');
}

fixDatabaseSchema().catch(console.error);