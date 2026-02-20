/**
 * Index Verification and Creation Script
 *
 * Checks for required performance-critical indexes on hot paths
 * and generates CREATE INDEX IF NOT EXISTS statements for missing ones.
 *
 * Run with: bun run scripts/verify-indexes.ts
 *
 * Prerequisites:
 * - DATABASE_URL environment variable set to Neon connection string
 *
 * Exit codes:
 * - 0: All required indexes present (or successfully created)
 * - 1: Missing indexes detected or connection error
 */

import { neon, type NeonQueryFunction } from '@neondatabase/serverless';

type SqlClient = NeonQueryFunction<false, false>;

interface RequiredIndex {
  table: string;
  columns: string[];
  indexName: string;
}

interface ExistingIndex {
  tablename: string;
  indexname: string;
  indexdef: string;
}

interface IndexReport {
  existing: Array<{ indexName: string; table: string; columns: string[]; definition: string }>;
  missing: Array<{ indexName: string; table: string; columns: string[]; createSql: string; reason?: string }>;
  matched: Array<{ required: RequiredIndex; matchedBy: string; definition: string }>;
}

const REQUIRED_INDEXES: RequiredIndex[] = [
  { table: 'applications', columns: ['status'], indexName: 'idx_applications_status' },
  { table: 'applications', columns: ['created_at'], indexName: 'idx_applications_created_at' },
  { table: 'applications', columns: ['user_id'], indexName: 'idx_applications_user_id' },
  { table: 'profiles', columns: ['email'], indexName: 'idx_profiles_email' },
  { table: 'profiles', columns: ['role'], indexName: 'idx_profiles_role' },
  { table: 'notifications', columns: ['user_id'], indexName: 'idx_notifications_user_id' },
  { table: 'notifications', columns: ['created_at'], indexName: 'idx_notifications_created_at' },
  { table: 'notifications', columns: ['idempotency_key'], indexName: 'idx_notifications_idempotency' },
  { table: 'audit_logs', columns: ['created_at'], indexName: 'idx_audit_logs_created_at' },
  { table: 'audit_logs', columns: ['entity_type'], indexName: 'idx_audit_logs_entity_type' },
  { table: 'application_documents', columns: ['application_id'], indexName: 'idx_application_documents_app_id' },
];

/**
 * Generate a CREATE INDEX IF NOT EXISTS statement for a required index
 */
function generateCreateIndexSql(index: RequiredIndex): string {
  const columnList = index.columns.join(', ');
  return `CREATE INDEX IF NOT EXISTS ${index.indexName} ON ${index.table}(${columnList});`;
}

/**
 * Check if an existing index covers the required columns for a table.
 * An index "covers" a requirement if it indexes the same column(s),
 * even if the index name differs or it uses DESC ordering.
 */
function indexCoversRequirement(
  existingIndexes: ExistingIndex[],
  required: RequiredIndex
): ExistingIndex | null {
  // First: exact name match
  const exactMatch = existingIndexes.find(
    (ei) => ei.indexname === required.indexName && ei.tablename === required.table
  );
  if (exactMatch) return exactMatch;

  // Second: check if any index on the same table covers the required columns
  const tableIndexes = existingIndexes.filter((ei) => ei.tablename === required.table);
  for (const ei of tableIndexes) {
    // Parse the column(s) from the index definition
    // Typical format: CREATE INDEX idx_name ON public.table USING btree (col1, col2)
    const match = ei.indexdef.match(/USING\s+\w+\s+\(([^)]+)\)/i);
    if (!match) continue;

    const indexedColumns = match[1]
      .split(',')
      .map((c) => c.trim().replace(/\s+(ASC|DESC|NULLS\s+(FIRST|LAST))$/i, '').trim());

    // Check if all required columns are covered (as a prefix or exact match)
    const allCovered = required.columns.every((reqCol) =>
      indexedColumns.some((idxCol) => idxCol === reqCol)
    );

    if (allCovered) return ei;
  }

  return null;
}

/**
 * Check if a column exists on a table
 */
async function columnExists(
  sql: SqlClient,
  table: string,
  column: string
): Promise<boolean> {
  const rows = await sql`
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = ${table}
      AND column_name = ${column}
    LIMIT 1
  `;
  return (rows as Array<Record<string, unknown>>).length > 0;
}

/**
 * Query all existing indexes on the relevant tables
 */
async function getExistingIndexes(sql: SqlClient): Promise<ExistingIndex[]> {
  const tables = [...new Set(REQUIRED_INDEXES.map((r) => r.table))];
  const rows = await sql`
    SELECT tablename, indexname, indexdef
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = ANY(${tables})
    ORDER BY tablename, indexname
  `;
  return rows as ExistingIndex[];
}

/**
 * Verify required indexes and produce a report
 */
async function verifyIndexes(sql: SqlClient): Promise<IndexReport> {
  const existingIndexes = await getExistingIndexes(sql);
  const report: IndexReport = { existing: [], missing: [], matched: [] };

  // Populate existing index list
  for (const ei of existingIndexes) {
    const match = ei.indexdef.match(/USING\s+\w+\s+\(([^)]+)\)/i);
    const columns = match
      ? match[1].split(',').map((c) => c.trim().replace(/\s+(ASC|DESC|NULLS\s+(FIRST|LAST))$/i, '').trim())
      : [];
    report.existing.push({
      indexName: ei.indexname,
      table: ei.tablename,
      columns,
      definition: ei.indexdef,
    });
  }

  // Check each required index
  for (const required of REQUIRED_INDEXES) {
    // First check if the column(s) exist on the table
    let columnsExist = true;
    for (const col of required.columns) {
      if (!(await columnExists(sql, required.table, col))) {
        columnsExist = false;
        report.missing.push({
          indexName: required.indexName,
          table: required.table,
          columns: required.columns,
          createSql: generateCreateIndexSql(required),
          reason: `Column "${col}" does not exist on table "${required.table}" — index cannot be created until column is added`,
        });
        break;
      }
    }
    if (!columnsExist) continue;

    const match = indexCoversRequirement(existingIndexes, required);
    if (match) {
      report.matched.push({
        required,
        matchedBy: match.indexname,
        definition: match.indexdef,
      });
    } else {
      report.missing.push({
        indexName: required.indexName,
        table: required.table,
        columns: required.columns,
        createSql: generateCreateIndexSql(required),
      });
    }
  }

  return report;
}

/**
 * Print the verification report
 */
function printReport(report: IndexReport): void {
  console.log('\n' + '━'.repeat(60));
  console.log('📊 Index Verification Report');
  console.log('━'.repeat(60));

  console.log(`\n📋 Total existing indexes on target tables: ${report.existing.length}`);
  console.log(`✅ Required indexes matched: ${report.matched.length}`);
  console.log(`❌ Required indexes missing: ${report.missing.length}`);

  if (report.matched.length > 0) {
    console.log('\n✅ Matched Required Indexes:');
    for (const m of report.matched) {
      const nameNote = m.required.indexName !== m.matchedBy
        ? ` (matched by "${m.matchedBy}")`
        : '';
      console.log(`  - ${m.required.indexName} on ${m.required.table}(${m.required.columns.join(', ')})${nameNote}`);
    }
  }

  if (report.missing.length > 0) {
    console.log('\n❌ Missing Required Indexes:');
    for (const m of report.missing) {
      console.log(`  - ${m.indexName} on ${m.table}(${m.columns.join(', ')})`);
      if (m.reason) {
        console.log(`    ⚠️  ${m.reason}`);
      } else {
        console.log(`    SQL: ${m.createSql}`);
      }
    }
  }

  console.log('\n' + '━'.repeat(60));
}

// Main execution
async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('❌ DATABASE_URL environment variable is not set');
    process.exit(1);
  }

  const sql = neon(connectionString);

  // Test connection
  try {
    await sql`SELECT 1 AS test`;
  } catch (error) {
    console.error('❌ Failed to connect to Neon:', (error as Error).message);
    process.exit(1);
  }

  console.log('🔍 Verifying database indexes...\n');

  const report = await verifyIndexes(sql);
  printReport(report);

  // Generate SQL for creatable missing indexes (those without column issues)
  const creatableIndexes = report.missing.filter((m) => !m.reason);
  if (creatableIndexes.length > 0) {
    console.log('\n📝 SQL to create missing indexes:\n');
    for (const m of creatableIndexes) {
      console.log(m.createSql);
    }
    console.log('');
  }

  const hasRealMissing = creatableIndexes.length > 0;
  const hasColumnMissing = report.missing.some((m) => !!m.reason);

  if (hasRealMissing) {
    console.log(`⚠️  ${creatableIndexes.length} index(es) can be created now.`);
  }
  if (hasColumnMissing) {
    console.log('ℹ️  Some indexes require columns that do not yet exist — they will be skipped.');
  }
  if (!hasRealMissing && !hasColumnMissing) {
    console.log('✅ All required indexes are present.');
  }

  process.exit(report.missing.length > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error('❌ Index verification failed:', error);
  process.exit(1);
});

// Export for testing
export {
  verifyIndexes,
  generateCreateIndexSql,
  indexCoversRequirement,
  REQUIRED_INDEXES,
  type RequiredIndex,
  type ExistingIndex,
  type IndexReport,
};
