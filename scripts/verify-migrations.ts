/**
 * Migration State Discovery Script
 *
 * Queries Neon for applied migrations, lists local migration files,
 * and computes the pending set (local minus applied).
 *
 * Run with: bun run scripts/verify-migrations.ts
 *
 * Prerequisites:
 * - DATABASE_URL environment variable set to Neon connection string
 */

import { neon, type NeonQueryFunction } from '@neondatabase/serverless';
import { readdirSync } from 'fs';

const MIGRATIONS_DIR = './migrations';
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

// Use the concrete return type from neon() to avoid generic type mismatch
type SqlClient = NeonQueryFunction<false, false>;

interface MigrationState {
  appliedMigrations: string[];
  localMigrations: string[];
  pendingMigrations: string[];
  schemaVersion: string | null;
  missingLocalMigrations: string[];
}

/**
 * List local .sql migration files sorted by numerical order
 */
function getLocalMigrations(): string[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter(f => f.endsWith('.sql'))
    .sort((a, b) => {
      const aNum = parseInt(a.match(/^(\d+)_/)?.[1] ?? '999', 10);
      const bNum = parseInt(b.match(/^(\d+)_/)?.[1] ?? '999', 10);
      return aNum - bNum;
    });
}

function getMissingLocalMigrations(localMigrations: string[]): string[] {
  const localSet = new Set(localMigrations);
  return REQUIRED_MIGRATIONS.filter(name => !localSet.has(name));
}

/**
 * Check if a migration_history table exists in the database
 */
async function hasMigrationHistoryTable(sql: SqlClient): Promise<boolean> {
  const rows = await sql`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'migration_history'
    ) AS exists
  `;
  return (rows as Array<{ exists: boolean }>)[0]?.exists === true;
}

/**
 * Query applied migrations from the migration_history table
 */
async function getAppliedFromHistory(sql: SqlClient): Promise<string[]> {
  const rows = await sql`
    SELECT migration_name FROM migration_history ORDER BY applied_at ASC
  `;
  return (rows as Array<{ migration_name: string }>).map(r => r.migration_name);
}

/**
 * Discover the current migration state by comparing Neon vs local files
 */
async function discoverMigrationState(): Promise<MigrationState> {
  // 1. List local migration files first so drift can be detected without DB access
  const localMigrations = getLocalMigrations();
  const missingLocalMigrations = getMissingLocalMigrations(localMigrations);

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    return {
      appliedMigrations: [],
      localMigrations,
      pendingMigrations: [],
      schemaVersion: null,
      missingLocalMigrations,
    };
  }

  const sql = neon(connectionString);

  // Test connection
  try {
    await sql`SELECT 1 AS test`;
  } catch (error) {
    console.error('❌ Failed to connect to Neon:', (error as Error).message);
    process.exit(1);
  }

  // 2. Check if migration_history table exists
  let appliedMigrations: string[] = [];
  let schemaVersion: string | null = null;

  const hasHistory = await hasMigrationHistoryTable(sql);

  if (hasHistory) {
    appliedMigrations = await getAppliedFromHistory(sql);
    schemaVersion = appliedMigrations.length > 0
      ? appliedMigrations[appliedMigrations.length - 1]
      : null;
  }

  // 3. Compute pending set (local minus applied)
  const appliedSet = new Set(appliedMigrations);
  const pendingMigrations = localMigrations.filter(m => !appliedSet.has(m));

  return {
    appliedMigrations,
    localMigrations,
    pendingMigrations,
    schemaVersion,
    missingLocalMigrations,
  };
}

/**
 * Pretty-print the migration state to console
 */
function printMigrationState(state: MigrationState): void {
  console.log('🔍 Migration State Discovery');
  console.log('━'.repeat(50));

  console.log(`\n📂 Local migrations (${state.localMigrations.length}):`);
  if (state.localMigrations.length === 0) {
    console.log('   (none)');
  } else {
    state.localMigrations.forEach(m => console.log(`   - ${m}`));
  }

  console.log(`\n✅ Applied migrations (${state.appliedMigrations.length}):`);
  if (state.appliedMigrations.length === 0) {
    console.log('   (none — no migration_history table or no records)');
  } else {
    state.appliedMigrations.forEach(m => console.log(`   - ${m}`));
  }

  console.log(`\n⏳ Pending migrations (${state.pendingMigrations.length}):`);
  if (state.pendingMigrations.length === 0) {
    console.log('   (none — all migrations applied)');
  } else {
    state.pendingMigrations.forEach(m => console.log(`   - ${m}`));
  }

  console.log(`\n🧩 Missing local migration files (${state.missingLocalMigrations.length}):`);
  if (state.missingLocalMigrations.length === 0) {
    console.log('   (none)');
  } else {
    state.missingLocalMigrations.forEach(m => console.log(`   - ${m}`));
  }

  if (state.schemaVersion) {
    console.log(`\n📌 Current schema version: ${state.schemaVersion}`);
  } else {
    console.log('\n📌 Current schema version: unknown (no migration_history)');
  }

  console.log('\n' + '━'.repeat(50));
  if (state.missingLocalMigrations.length > 0) {
    console.log(`❌ Local migration chain is incomplete (${state.missingLocalMigrations.length} missing)`);
    process.exitCode = 2;
  } else if (state.pendingMigrations.length > 0) {
    console.log(`⚠️  ${state.pendingMigrations.length} migration(s) need to be applied`);
  } else {
    console.log('✅ Database is up to date');
  }
}

// Main execution
async function main() {
  const state = await discoverMigrationState();
  printMigrationState(state);
}

main().catch(error => {
  console.error('❌ Migration discovery failed:', error);
  process.exit(1);
});

// Export for testing
export { discoverMigrationState, getLocalMigrations, type MigrationState };
