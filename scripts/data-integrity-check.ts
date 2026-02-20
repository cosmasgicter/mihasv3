/**
 * Data Integrity Check Script
 *
 * Detects FK violations, null/invalid status values, orphaned documents,
 * and missing emails in the live Neon database.
 *
 * Run with: bun run scripts/data-integrity-check.ts
 *
 * Prerequisites:
 * - DATABASE_URL environment variable set to Neon connection string
 *
 * Exit codes:
 * - 0: No violations found
 * - 1: Violations found (or connection error)
 */

import { neon, type NeonQueryFunction } from '@neondatabase/serverless';

type SqlClient = NeonQueryFunction<false, false>;

interface IntegrityViolation {
  table: string;
  rowId: string;
  violationType: 'broken_fk' | 'null_status' | 'invalid_status' | 'orphaned' | 'missing_email';
  details: string;
}

const VALID_APPLICATION_STATUSES = [
  'draft',
  'submitted',
  'under_review',
  'approved',
  'rejected',
  'withdrawn',
  'waitlisted',
  'pending_review',
  'pending_documents',
];

/**
 * Check applications referencing non-existent programs (by code)
 */
async function checkBrokenProgramRefs(sql: SqlClient): Promise<IntegrityViolation[]> {
  const rows = await sql`
    SELECT a.id, a.program
    FROM applications a
    LEFT JOIN programs p ON a.program = p.code
    WHERE a.program IS NOT NULL
      AND a.program != ''
      AND p.id IS NULL
  `;
  return (rows as Array<{ id: string; program: string }>).map(r => ({
    table: 'applications',
    rowId: r.id,
    violationType: 'broken_fk' as const,
    details: `program code "${r.program}" does not match any programs.code`,
  }));
}

/**
 * Check applications referencing non-existent intakes (by name)
 */
async function checkBrokenIntakeRefs(sql: SqlClient): Promise<IntegrityViolation[]> {
  const rows = await sql`
    SELECT a.id, a.intake
    FROM applications a
    LEFT JOIN intakes i ON a.intake = i.name
    WHERE a.intake IS NOT NULL
      AND a.intake != ''
      AND i.id IS NULL
  `;
  return (rows as Array<{ id: string; intake: string }>).map(r => ({
    table: 'applications',
    rowId: r.id,
    violationType: 'broken_fk' as const,
    details: `intake name "${r.intake}" does not match any intakes.name`,
  }));
}

/**
 * Check applications referencing non-existent institutions (by code)
 */
async function checkBrokenInstitutionRefs(sql: SqlClient): Promise<IntegrityViolation[]> {
  const rows = await sql`
    SELECT a.id, a.institution
    FROM applications a
    LEFT JOIN institutions inst ON a.institution = inst.code
    WHERE a.institution IS NOT NULL
      AND a.institution != ''
      AND inst.id IS NULL
  `;
  return (rows as Array<{ id: string; institution: string }>).map(r => ({
    table: 'applications',
    rowId: r.id,
    violationType: 'broken_fk' as const,
    details: `institution code "${r.institution}" does not match any institutions.code`,
  }));
}

/**
 * Check applications with null or invalid status values
 */
async function checkInvalidStatuses(sql: SqlClient): Promise<IntegrityViolation[]> {
  const rows = await sql`
    SELECT id, status
    FROM applications
  `;
  const violations: IntegrityViolation[] = [];
  for (const row of rows as Array<{ id: string; status: string | null }>) {
    if (row.status === null || row.status === '') {
      violations.push({
        table: 'applications',
        rowId: row.id,
        violationType: 'null_status',
        details: 'status is null or empty',
      });
    } else if (!VALID_APPLICATION_STATUSES.includes(row.status)) {
      violations.push({
        table: 'applications',
        rowId: row.id,
        violationType: 'invalid_status',
        details: `status "${row.status}" is not a valid application status`,
      });
    }
  }
  return violations;
}

/**
 * Check orphaned application_documents (referencing non-existent applications)
 */
async function checkOrphanedDocuments(sql: SqlClient): Promise<IntegrityViolation[]> {
  const rows = await sql`
    SELECT d.id, d.application_id
    FROM application_documents d
    LEFT JOIN applications a ON d.application_id = a.id
    WHERE a.id IS NULL
  `;
  return (rows as Array<{ id: string; application_id: string }>).map(r => ({
    table: 'application_documents',
    rowId: r.id,
    violationType: 'orphaned' as const,
    details: `references non-existent application ${r.application_id}`,
  }));
}

/**
 * Check profiles with missing or empty email fields
 */
async function checkMissingEmails(sql: SqlClient): Promise<IntegrityViolation[]> {
  const rows = await sql`
    SELECT id, email
    FROM profiles
    WHERE email IS NULL OR TRIM(email) = ''
  `;
  return (rows as Array<{ id: string; email: string | null }>).map(r => ({
    table: 'profiles',
    rowId: r.id,
    violationType: 'missing_email' as const,
    details: r.email === null ? 'email is null' : 'email is empty',
  }));
}

/**
 * Run all integrity checks and return combined violations
 */
async function checkDataIntegrity(sql: SqlClient): Promise<IntegrityViolation[]> {
  const violations: IntegrityViolation[] = [];

  console.log('  Checking program references...');
  violations.push(...await checkBrokenProgramRefs(sql));

  console.log('  Checking intake references...');
  violations.push(...await checkBrokenIntakeRefs(sql));

  console.log('  Checking institution references...');
  violations.push(...await checkBrokenInstitutionRefs(sql));

  console.log('  Checking application statuses...');
  violations.push(...await checkInvalidStatuses(sql));

  console.log('  Checking orphaned documents...');
  violations.push(...await checkOrphanedDocuments(sql));

  console.log('  Checking missing emails...');
  violations.push(...await checkMissingEmails(sql));

  return violations;
}

/**
 * Print a structured report of all violations
 */
function printReport(violations: IntegrityViolation[]): void {
  console.log('\n' + '━'.repeat(60));
  console.log('📋 Data Integrity Report');
  console.log('━'.repeat(60));

  if (violations.length === 0) {
    console.log('\n✅ No integrity violations found.');
    console.log('━'.repeat(60));
    return;
  }

  console.log(`\n⚠️  Found ${violations.length} violation(s):\n`);

  // Group by violation type for readability
  const grouped = new Map<string, IntegrityViolation[]>();
  for (const v of violations) {
    const key = v.violationType;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(v);
  }

  const labels: Record<string, string> = {
    broken_fk: '🔗 Broken Foreign Key References',
    null_status: '⛔ Null Status Values',
    invalid_status: '❌ Invalid Status Values',
    orphaned: '👻 Orphaned Records',
    missing_email: '📧 Missing Emails',
  };

  for (const [type, items] of grouped) {
    console.log(`${labels[type] ?? type} (${items.length}):`);
    for (const item of items) {
      console.log(`  - [${item.table}] id=${item.rowId}: ${item.details}`);
    }
    console.log('');
  }

  console.log('━'.repeat(60));
  console.log(`Total: ${violations.length} violation(s)`);
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

  console.log('🔍 Running data integrity checks...\n');

  const violations = await checkDataIntegrity(sql);
  printReport(violations);

  process.exit(violations.length > 0 ? 1 : 0);
}

main().catch(error => {
  console.error('❌ Data integrity check failed:', error);
  process.exit(1);
});

// Export for testing
export {
  checkDataIntegrity,
  checkBrokenProgramRefs,
  checkBrokenIntakeRefs,
  checkBrokenInstitutionRefs,
  checkInvalidStatuses,
  checkOrphanedDocuments,
  checkMissingEmails,
  VALID_APPLICATION_STATUSES,
  type IntegrityViolation,
};
