/**
 * Data Migration Script: Supabase → Neon Postgres
 * 
 * Uses pg (node-postgres) instead of @neondatabase/serverless
 * because pg supports regular SQL strings, not just tagged templates.
 * 
 * Usage:
 *   bun run scripts/migrate-data-to-neon.ts
 * 
 * Environment Variables Required:
 *   - SUPABASE_URL
 *   - SUPABASE_SERVICE_ROLE_KEY
 *   - DATABASE_URL (Neon connection string)
 */

import { Client } from 'pg';

const MIGRATION_ORDER = [
  'institutions',
  'subjects', 
  'intakes',
  'programs',
  'profiles',
  'applications',
  'application_documents',
  'application_grades',
  'device_sessions',
  'audit_logs',
];

interface TableStats {
  table: string;
  sourceCount: number;
  targetCount: number;
  migrated: number;
  errors: string[];
}

// Schema mappings for tables with different column structures
const SCHEMA_MAPPINGS: Record<string, {
  sourceColumns: string[];
  targetColumns: string[];
  transform?: (row: Record<string, unknown>) => Record<string, unknown>;
}> = {
  institutions: {
    sourceColumns: ['id', 'slug', 'name', 'address', 'contact_email', 'contact_phone', 'is_active', 'created_at', 'updated_at'],
    targetColumns: ['id', 'name', 'code', 'type', 'address', 'phone', 'email', 'accreditation_status', 'is_active', 'created_at', 'updated_at'],
    transform: (row) => ({
      id: row.id,
      name: row.name,
      code: (row.slug as string)?.toUpperCase() || 'UNKNOWN',
      type: 'Institute',
      address: row.address,
      phone: row.contact_phone,
      email: row.contact_email,
      accreditation_status: 'Active',
      is_active: row.is_active,
      created_at: row.created_at,
      updated_at: row.updated_at,
    }),
  },
  subjects: {
    sourceColumns: ['id', 'name', 'code', 'is_active', 'created_at'],
    targetColumns: ['id', 'name', 'code', 'category', 'is_core', 'is_active', 'created_at'],
    transform: (row) => {
      const name = (row.name as string)?.toLowerCase() || '';
      let category = 'General';
      let isCore = false;
      if (['biology', 'physics', 'chemistry', 'mathematics', 'science'].some(s => name.includes(s))) {
        category = 'Sciences'; isCore = true;
      } else if (name.includes('english')) {
        category = 'Languages'; isCore = true;
      } else if (['history', 'geography', 'religious', 'civic'].some(s => name.includes(s))) {
        category = 'Humanities';
      } else if (['art', 'music'].some(s => name.includes(s))) {
        category = 'Arts';
      } else if (name.includes('computer')) {
        category = 'Technology';
      }
      return { id: row.id, name: row.name, code: row.code, category, is_core: isCore, is_active: row.is_active, created_at: row.created_at };
    },
  },
  intakes: {
    sourceColumns: ['id', 'name', 'year', 'semester', 'start_date', 'end_date', 'application_deadline', 'total_capacity', 'available_spots', 'is_active', 'created_at', 'updated_at'],
    targetColumns: ['id', 'name', 'year', 'semester', 'start_date', 'end_date', 'application_deadline', 'max_capacity', 'current_enrollment', 'is_active', 'created_at', 'updated_at'],
    transform: (row) => ({
      id: row.id, name: row.name, year: row.year, semester: row.semester,
      start_date: row.start_date, end_date: row.end_date, application_deadline: row.application_deadline,
      max_capacity: row.total_capacity,
      current_enrollment: ((row.total_capacity as number) || 0) - ((row.available_spots as number) || 0),
      is_active: row.is_active, created_at: row.created_at, updated_at: row.updated_at,
    }),
  },
  programs: {
    sourceColumns: ['id', 'name', 'code', 'description', 'duration_years', 'accreditation_body', 'is_active', 'created_at', 'updated_at'],
    targetColumns: ['id', 'name', 'code', 'description', 'duration_months', 'application_fee', 'regulatory_body', 'accreditation_status', 'is_active', 'created_at', 'updated_at'],
    transform: (row) => ({
      id: row.id, name: row.name,
      code: row.code || (row.name as string)?.split(' ').map(w => w[0]).join('').toUpperCase(),
      description: row.description,
      duration_months: ((row.duration_years as number) || 3) * 12,
      application_fee: 153.00,
      regulatory_body: row.accreditation_body,
      accreditation_status: row.accreditation_body ? 'Accredited' : null,
      is_active: row.is_active, created_at: row.created_at, updated_at: row.updated_at,
    }),
  },
  profiles: {
    sourceColumns: ['id', 'email', 'first_name', 'last_name', 'phone', 'role', 'is_active', 'created_at', 'updated_at', 'date_of_birth', 'nationality', 'residence_town', 'password_hash', 'refresh_token_hash', 'failed_login_attempts', 'locked_until'],
    targetColumns: ['id', 'email', 'role', 'first_name', 'last_name', 'phone', 'is_active', 'password_hash', 'refresh_token_hash', 'failed_login_attempts', 'locked_until', 'email_verified', 'date_of_birth', 'nationality', 'address', 'created_at', 'updated_at'],
    transform: (row) => ({
      id: row.id, email: row.email, role: row.role || 'student',
      first_name: row.first_name, last_name: row.last_name, phone: row.phone,
      is_active: row.is_active ?? true,
      password_hash: row.password_hash, refresh_token_hash: row.refresh_token_hash,
      failed_login_attempts: row.failed_login_attempts || 0, locked_until: row.locked_until,
      email_verified: true, date_of_birth: row.date_of_birth,
      nationality: row.nationality || 'Zambian', address: row.residence_town,
      created_at: row.created_at, updated_at: row.updated_at,
    }),
  },
};

async function fetchFromSupabase(table: string, supabaseUrl: string, serviceKey: string, columns?: string[]): Promise<Record<string, unknown>[]> {
  const selectColumns = columns ? columns.join(',') : '*';
  const url = `${supabaseUrl}/rest/v1/${table}?select=${selectColumns}&limit=10000`;
  const response = await fetch(url, {
    headers: { 'apikey': serviceKey, 'Authorization': `Bearer ${serviceKey}` },
  });
  if (!response.ok) {
    if (response.status === 404) return [];
    throw new Error(`Failed to fetch ${table}: ${response.status}`);
  }
  return response.json();
}

function formatValue(val: unknown): string {
  if (val === null || val === undefined) return 'NULL';
  if (typeof val === 'string') return `'${val.replace(/'/g, "''")}'`;
  if (typeof val === 'boolean') return val ? 'TRUE' : 'FALSE';
  if (typeof val === 'number') return String(val);
  if (val instanceof Date) return `'${val.toISOString()}'`;
  if (typeof val === 'object') return `'${JSON.stringify(val).replace(/'/g, "''")}'`;
  return `'${String(val).replace(/'/g, "''")}'`;
}

async function migrateTable(table: string, supabaseUrl: string, serviceKey: string, client: Client): Promise<TableStats> {
  const stats: TableStats = { table, sourceCount: 0, targetCount: 0, migrated: 0, errors: [] };
  console.log(`\n📋 Migrating: ${table}`);

  try {
    const mapping = SCHEMA_MAPPINGS[table];
    const sourceColumns = mapping?.sourceColumns;
    const rows = await fetchFromSupabase(table, supabaseUrl, serviceKey, sourceColumns);
    stats.sourceCount = rows.length;
    console.log(`   Source: ${stats.sourceCount} rows`);

    if (rows.length === 0) {
      console.log('   Skipping (no data)');
      return stats;
    }

    // Check existing count
    const countResult = await client.query(`SELECT COUNT(*) as count FROM ${table}`);
    const existingCount = parseInt(countResult.rows[0]?.count || '0', 10);
    if (existingCount > 0) console.log(`   Target already has ${existingCount} rows`);

    // Transform and insert
    const transformedRows = mapping?.transform ? rows.map(mapping.transform) : rows;
    const targetColumns = mapping?.targetColumns || Object.keys(rows[0] || {});

    for (const row of transformedRows) {
      const values = targetColumns.map(col => formatValue(row[col]));
      const query = `INSERT INTO ${table} (${targetColumns.join(', ')}) VALUES (${values.join(', ')}) ON CONFLICT (id) DO NOTHING`;
      try {
        await client.query(query);
        stats.migrated++;
      } catch (err) {
        const msg = (err as Error).message;
        if (!msg.includes('duplicate') && !msg.includes('already exists')) {
          stats.errors.push(msg.substring(0, 80));
        }
      }
    }

    // Final count
    const finalResult = await client.query(`SELECT COUNT(*) as count FROM ${table}`);
    stats.targetCount = parseInt(finalResult.rows[0]?.count || '0', 10);
    console.log(`   Migrated: ${stats.migrated}, Target: ${stats.targetCount}`);

  } catch (error) {
    stats.errors.push((error as Error).message);
    console.error(`   Error: ${(error as Error).message}`);
  }

  return stats;
}

async function main(): Promise<void> {
  console.log('🚀 Supabase → Neon Data Migration (using pg)');
  console.log('='.repeat(50));
  console.log(`Date: ${new Date().toISOString()}`);

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const DATABASE_URL = process.env.DATABASE_URL;

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error('❌ Missing: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
  }
  if (!DATABASE_URL) {
    console.error('❌ Missing: DATABASE_URL');
    process.exit(1);
  }

  console.log(`\nSource: ${SUPABASE_URL}`);
  console.log(`Target: Neon`);

  const client = new Client({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  console.log('✅ Connected to Neon');

  const results: TableStats[] = [];
  for (const table of MIGRATION_ORDER) {
    const stats = await migrateTable(table, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, client);
    results.push(stats);
  }

  await client.end();

  // Summary
  console.log('\n' + '='.repeat(50));
  console.log('📊 Migration Summary');
  console.log('='.repeat(50));
  console.log('\nTable                          Source    Target');
  console.log('-'.repeat(50));

  let totalSource = 0, totalTarget = 0;
  for (const s of results) {
    console.log(`${s.table.padEnd(30)} ${String(s.sourceCount).padStart(6)} ${String(s.targetCount).padStart(9)}`);
    if (s.errors.length > 0) s.errors.forEach(e => console.log(`  ⚠️ ${e}`));
    totalSource += s.sourceCount;
    totalTarget += s.targetCount;
  }

  console.log('-'.repeat(50));
  console.log(`${'TOTAL'.padEnd(30)} ${String(totalSource).padStart(6)} ${String(totalTarget).padStart(9)}`);
  console.log('\n✅ Migration complete!');
}

main().catch(error => {
  console.error('Migration failed:', error);
  process.exit(1);
});
