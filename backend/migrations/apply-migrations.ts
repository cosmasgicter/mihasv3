/**
 * Migration Runner for Neon Database
 * 
 * This script applies SQL migrations to the Neon database.
 * Run with: bun run migrations/apply-migrations.ts
 * 
 * Prerequisites:
 * - DATABASE_URL environment variable set to Neon connection string
 * - @neondatabase/serverless package installed
 */

import { neon, NeonQueryFunction } from '@neondatabase/serverless';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

const MIGRATIONS_DIR = './migrations';
const SCRIPTS_DIR = '../scripts';
const REQUIRED_MIGRATIONS = [
  '001_extensions.sql',
  '002_core_schema.sql',
  '003_supporting_tables.sql',
  '004_functions.sql',
  '005_triggers.sql',
  '006_data_migration.sql',
  '007_password_reset_tokens.sql',
  '008_notification_delivery.sql',
  '009_document_migration_log.sql',
  '010_user_permission_overrides.sql',
  '011_payment_review_indexes.sql',
  'add_csrf_tokens_table.sql',
  'add_audit_retention_category.sql',
  'add_password_reset_tokens_table.sql',
  'add_login_attempts_table.sql',
] as const;

interface MigrationFile {
  name: string;
  path: string;
  order: number;
}

const MIGRATION_HISTORY_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS migration_history (
    id BIGSERIAL PRIMARY KEY,
    migration_name VARCHAR(255) NOT NULL UNIQUE,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
`;

async function getMigrationFiles(): Promise<MigrationFile[]> {
  const files: MigrationFile[] = [];

  // Scan primary migrations directory
  const migrationFiles = readdirSync(MIGRATIONS_DIR)
    .filter(f => f.endsWith('.sql'))
    .map(name => {
      const match = name.match(/^(\d+)_/);
      return {
        name,
        path: join(MIGRATIONS_DIR, name),
        order: match ? parseInt(match[1], 10) : 999,
      };
    });
  files.push(...migrationFiles);

  // Scan scripts directory for additional SQL files
  try {
    const scriptFiles = readdirSync(SCRIPTS_DIR)
      .filter(f => f.endsWith('.sql'))
      .map(name => {
        const match = name.match(/^(\d+)_/);
        return {
          name,
          path: join(SCRIPTS_DIR, name),
          order: match ? parseInt(match[1], 10) : 1000,
        };
      })
      // Avoid duplicates if a file exists in both directories
      .filter(sf => !files.some(f => f.name === sf.name));
    files.push(...scriptFiles);
  } catch {
    // scripts directory may not exist in all environments
  }

  return files.sort((a, b) => a.order - b.order);
}

function assertMigrationChainComplete(files: MigrationFile[]): void {
  const localSet = new Set(files.map(file => file.name));
  const missing = REQUIRED_MIGRATIONS.filter(name => !localSet.has(name));

  if (missing.length === 0) {
    return;
  }

  console.error('❌ Migration chain is incomplete. Missing local files:');
  missing.forEach(name => console.error(`   - ${name}`));
  console.error('\nRestore missing files before applying migrations to avoid schema drift.');
  process.exit(2);
}

/**
 * Execute a raw SQL statement using Neon
 * Uses the sql.unsafe() pattern for dynamic SQL
 */
async function executeRawSql(sql: NeonQueryFunction<false, false>, statement: string): Promise<unknown[]> {
  // Create a proper tagged template array
  const strings = [statement] as unknown as TemplateStringsArray;
  Object.defineProperty(strings, 'raw', { value: [statement] });
  return sql(strings);
}

async function ensureMigrationHistory(sql: NeonQueryFunction<false, false>): Promise<void> {
  await executeRawSql(sql, MIGRATION_HISTORY_TABLE_SQL);
}

async function getAppliedMigrations(sql: NeonQueryFunction<false, false>): Promise<Set<string>> {
  const rows = await executeRawSql(
    sql,
    'SELECT migration_name FROM migration_history ORDER BY applied_at ASC;'
  );

  return new Set(
    (rows as Array<{ migration_name: string }>).map((row) => row.migration_name)
  );
}

async function recordMigration(sql: NeonQueryFunction<false, false>, fileName: string): Promise<void> {
  await executeRawSql(
    sql,
    `INSERT INTO migration_history (migration_name)
     VALUES ('${fileName.replace(/'/g, "''")}')
     ON CONFLICT (migration_name) DO NOTHING;`
  );
}

async function runMigration(sql: NeonQueryFunction<false, false>, file: MigrationFile): Promise<void> {
  console.log(`\n📄 Running migration: ${file.name}`);
  
  const content = readFileSync(file.path, 'utf-8');
  
  // Split by semicolons but handle function definitions with $$ delimiters
  const statements = splitSqlStatements(content);
  
  let successCount = 0;
  let skipCount = 0;
  
  for (const statement of statements) {
    const trimmed = statement.trim();
    if (!trimmed) continue;
    
    try {
      await executeRawSql(sql, trimmed);
      successCount++;
      // Log progress
      if (successCount % 10 === 0) {
        console.log(`  ✓ Executed ${successCount} statements...`);
      }
    } catch (error) {
      const err = error as Error;
      // Ignore "already exists" errors for idempotent migrations
      if (err.message?.includes('already exists')) {
        skipCount++;
      } else {
        console.error(`  ✗ Error: ${err.message}`);
        console.error(`  Statement preview: ${trimmed.substring(0, 100)}...`);
        throw error;
      }
    }
  }
  
  console.log(`✅ Completed: ${file.name} (${successCount} executed, ${skipCount} skipped)`);
}

function splitSqlStatements(sql: string): string[] {
  const statements: string[] = [];
  let current = '';
  let dollarQuoteDepth = 0;
  
  const lines = sql.split('\n');
  
  for (const line of lines) {
    const trimmedLine = line.trim();
    
    // Skip pure comment lines but keep them if we're building a statement
    if (trimmedLine.startsWith('--') && current === '') {
      continue;
    }
    
    // Count $$ occurrences to track dollar quoting
    const dollarMatches = line.match(/\$\$/g);
    if (dollarMatches) {
      dollarQuoteDepth += dollarMatches.length;
    }
    
    current += line + '\n';
    
    // If we're not in a dollar quote (even count) and line ends with semicolon
    const inDollarQuote = dollarQuoteDepth % 2 !== 0;
    if (!inDollarQuote && trimmedLine.endsWith(';')) {
      const statement = current.trim();
      // Only add non-empty statements
      if (statement) {
        statements.push(statement);
      }
      current = '';
    }
  }
  
  // Add any remaining content
  if (current.trim()) {
    statements.push(current.trim());
  }
  
  return statements;
}

async function main() {
  const migrations = await getMigrationFiles();
  assertMigrationChainComplete(migrations);

  const connectionString = process.env.DATABASE_URL;
  
  if (!connectionString) {
    console.error('❌ DATABASE_URL environment variable is not set');
    console.log('\nSet it to your Neon connection string:');
    console.log('export DATABASE_URL="postgresql://user:pass@host.neon.tech/neondb?sslmode=require"');
    process.exit(1);
  }
  
  console.log('🚀 Starting Neon Database Migration');
  console.log('━'.repeat(50));
  
  const sql = neon(connectionString);
  
  // Test connection
  try {
    await sql`SELECT 1 as test`;
    console.log('✅ Connected to Neon database');
  } catch (error) {
    console.error('❌ Failed to connect to database:', (error as Error).message);
    process.exit(1);
  }

  await ensureMigrationHistory(sql);
  const appliedMigrations = await getAppliedMigrations(sql);
  
  console.log(`\n📋 Found ${migrations.length} migration files:`);
  migrations.forEach(m => console.log(`   - ${m.name}`));
  
  // Run migrations in order
  for (const migration of migrations) {
    if (appliedMigrations.has(migration.name)) {
      console.log(`\n⏭️  Skipping already applied migration: ${migration.name}`);
      continue;
    }

    await runMigration(sql, migration);
    await recordMigration(sql, migration.name);
  }
  
  console.log('\n' + '━'.repeat(50));
  console.log('🎉 All migrations completed successfully!');
  
  // Verify tables created
  console.log('\n📊 Verifying tables...');
  const tables = await sql`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_type = 'BASE TABLE'
    ORDER BY table_name
  `;
  
  console.log(`\n✅ Created ${(tables as unknown[]).length} tables:`);
  (tables as Array<{ table_name: string }>).forEach(t => console.log(`   - ${t.table_name}`));
}

main().catch(error => {
  console.error('❌ Migration failed:', error);
  process.exit(1);
});
