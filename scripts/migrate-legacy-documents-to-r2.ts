/**
 * Idempotent Legacy Document → R2 Migration Script
 *
 * Migrates documents with legacy Supabase URLs in `application_documents`
 * to Cloudflare R2 storage. Safe to re-run — already-migrated documents
 * are skipped via the `document_migration_log` table.
 *
 * For each legacy document:
 *   1. Check migration log — skip if already migrated
 *   2. Fetch original file from legacy URL
 *   3. Compute SHA-256 checksum
 *   4. Upload to R2 with deterministic path
 *   5. Verify uploaded file checksum matches
 *   6. In a transaction: update file_url + insert migration log record
 *
 * After all migrations, verifies a random sample by downloading and
 * comparing checksums.
 *
 * Run with: bun run scripts/migrate-legacy-documents-to-r2.ts
 *
 * Prerequisites:
 * - DATABASE_URL environment variable set to Neon connection string
 * - R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY env vars set
 *
 * Exit codes:
 * - 0: Migration completed successfully (or nothing to migrate)
 * - 1: Migration encountered errors
 */

import { neon, type NeonQueryFunction } from '@neondatabase/serverless';
import { createHash } from 'crypto';
import { R2StorageAdapter } from '../lib/storage';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type SqlClient = NeonQueryFunction<false, false>;

interface LegacyDocument {
  id: string;
  application_id: string;
  file_url: string;
  document_type: string;
  mime_type: string | null;
}

interface MigrationRecord {
  documentId: string;
  oldUrl: string;
  newR2Path: string;
  newR2Url: string;
  checksum: string;
  status: 'pending' | 'migrated' | 'failed' | 'skipped';
  error?: string;
}

interface MigrationResult {
  total: number;
  migrated: number;
  skipped: number;
  failed: number;
  records: MigrationRecord[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const LEGACY_URL_PATTERN = '%supabase%';
const MAX_FETCH_RETRIES = 3;
const RETRY_BACKOFF_MS = 1000;
const SAMPLE_VERIFICATION_COUNT = 3;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Compute SHA-256 hex digest of a Buffer */
function sha256(data: Buffer): string {
  return createHash('sha256').update(data).digest('hex');
}

/** Build a deterministic R2 path from the document ID and original URL */
function buildR2Path(documentId: string, originalUrl: string): string {
  // Extract file extension from the original URL
  const urlPath = new URL(originalUrl).pathname;
  const ext = urlPath.includes('.') ? urlPath.substring(urlPath.lastIndexOf('.')) : '';
  return `migrated-documents/${documentId}${ext}`;
}

/** Fetch a file with retries and exponential backoff */
async function fetchWithRetry(url: string, retries = MAX_FETCH_RETRIES): Promise<Buffer> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      const arrayBuffer = await response.arrayBuffer();
      return Buffer.from(arrayBuffer);
    } catch (err) {
      lastError = err as Error;
      if (attempt < retries) {
        const delay = RETRY_BACKOFF_MS * Math.pow(2, attempt - 1);
        console.log(`    ⏳ Retry ${attempt}/${retries} in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  throw new Error(`Failed to fetch after ${retries} attempts: ${lastError?.message}`);
}

// ---------------------------------------------------------------------------
// Core migration logic
// ---------------------------------------------------------------------------

/**
 * Query legacy documents that have Supabase URLs in file_url
 */
async function findLegacyDocuments(sql: SqlClient): Promise<LegacyDocument[]> {
  const rows = await sql`
    SELECT id, application_id, file_url, document_type, mime_type
    FROM application_documents
    WHERE file_url LIKE ${LEGACY_URL_PATTERN}
    ORDER BY created_at ASC
  `;
  return rows as unknown as LegacyDocument[];
}

/**
 * Check if a document has already been migrated (idempotency check)
 */
async function isAlreadyMigrated(sql: SqlClient, documentId: string): Promise<boolean> {
  const rows = await sql`
    SELECT id FROM document_migration_log
    WHERE document_id = ${documentId}::uuid
      AND status = 'migrated'
    LIMIT 1
  `;
  return (rows as unknown[]).length > 0;
}

/**
 * Migrate a single document: fetch → checksum → upload → verify → update DB
 */
async function migrateSingleDocument(
  sql: SqlClient,
  r2: R2StorageAdapter,
  doc: LegacyDocument,
): Promise<MigrationRecord> {
  const record: MigrationRecord = {
    documentId: doc.id,
    oldUrl: doc.file_url,
    newR2Path: '',
    newR2Url: '',
    checksum: '',
    status: 'pending',
  };

  try {
    // 1. Idempotency: skip if already migrated
    if (await isAlreadyMigrated(sql, doc.id)) {
      record.status = 'skipped';
      console.log(`  ⏭️  [${doc.id}] Already migrated — skipping`);
      return record;
    }

    // 2. Fetch original file
    console.log(`  📥 [${doc.id}] Fetching from legacy URL...`);
    const fileData = await fetchWithRetry(doc.file_url);

    // 3. Compute checksum of original
    const originalChecksum = sha256(fileData);
    record.checksum = originalChecksum;

    // 4. Upload to R2 with deterministic path
    const r2Path = buildR2Path(doc.id, doc.file_url);
    record.newR2Path = r2Path;

    const contentType = doc.mime_type || 'application/octet-stream';
    console.log(`  📤 [${doc.id}] Uploading to R2: ${r2Path}`);
    const uploadResult = await r2.upload(r2Path, fileData, contentType);

    if (!uploadResult.success) {
      throw new Error(`R2 upload failed: ${uploadResult.error}`);
    }

    record.newR2Url = uploadResult.url || r2.getPublicUrl(r2Path);

    // 5. Verify uploaded file checksum
    console.log(`  🔍 [${doc.id}] Verifying upload checksum...`);
    const downloadedData = await r2.download(r2Path);
    if (!downloadedData) {
      throw new Error('Verification download returned null — file may not have been stored');
    }

    const uploadedChecksum = sha256(downloadedData);
    if (uploadedChecksum !== originalChecksum) {
      // Checksum mismatch — delete the bad upload
      await r2.delete(r2Path);
      throw new Error(
        `Checksum mismatch: original=${originalChecksum}, uploaded=${uploadedChecksum}`,
      );
    }

    // 6. Transaction: update application_documents + insert migration log
    console.log(`  💾 [${doc.id}] Updating database in transaction...`);
    await sql`BEGIN`;
    try {
      await sql`
        UPDATE application_documents
        SET file_url = ${record.newR2Url}, updated_at = NOW()
        WHERE id = ${doc.id}::uuid
      `;
      await sql`
        INSERT INTO document_migration_log
          (document_id, old_url, new_r2_path, new_r2_url, checksum, status, migrated_at)
        VALUES
          (${doc.id}::uuid, ${doc.file_url}, ${r2Path}, ${record.newR2Url}, ${originalChecksum}, 'migrated', NOW())
      `;
      await sql`COMMIT`;
    } catch (txErr) {
      await sql`ROLLBACK`;
      throw new Error(`Transaction failed: ${(txErr as Error).message}`);
    }

    record.status = 'migrated';
    console.log(`  ✅ [${doc.id}] Migrated successfully`);
  } catch (err) {
    record.status = 'failed';
    record.error = (err as Error).message;
    console.error(`  ❌ [${doc.id}] Failed: ${record.error}`);

    // Log the failure in migration_log for visibility
    try {
      await sql`
        INSERT INTO document_migration_log
          (document_id, old_url, new_r2_path, new_r2_url, checksum, status, error, migrated_at)
        VALUES
          (${doc.id}::uuid, ${doc.file_url}, ${record.newR2Path || ''}, ${record.newR2Url || ''}, ${record.checksum || ''}, 'failed', ${record.error}, NOW())
      `;
    } catch {
      // Best-effort logging — don't mask the original error
    }
  }

  return record;
}

/**
 * Verify a random sample of migrated documents by downloading and comparing checksums
 */
async function verifySample(
  sql: SqlClient,
  r2: R2StorageAdapter,
  records: MigrationRecord[],
): Promise<{ verified: number; failures: string[] }> {
  const migrated = records.filter(r => r.status === 'migrated');
  if (migrated.length === 0) {
    return { verified: 0, failures: [] };
  }

  const sampleSize = Math.min(SAMPLE_VERIFICATION_COUNT, migrated.length);
  // Shuffle and take a sample
  const shuffled = [...migrated].sort(() => Math.random() - 0.5);
  const sample = shuffled.slice(0, sampleSize);

  console.log(`\n🔬 Verifying random sample of ${sampleSize} migrated document(s)...`);

  const failures: string[] = [];
  let verified = 0;

  for (const rec of sample) {
    try {
      const data = await r2.download(rec.newR2Path);
      if (!data) {
        failures.push(`[${rec.documentId}] Download returned null`);
        continue;
      }
      const checksum = sha256(data);
      if (checksum !== rec.checksum) {
        failures.push(
          `[${rec.documentId}] Checksum mismatch: expected=${rec.checksum}, got=${checksum}`,
        );
      } else {
        verified++;
        console.log(`  ✅ [${rec.documentId}] Sample verification passed`);
      }
    } catch (err) {
      failures.push(`[${rec.documentId}] ${(err as Error).message}`);
    }
  }

  return { verified, failures };
}

// ---------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------

function printReport(result: MigrationResult, sampleResult: { verified: number; failures: string[] }): void {
  console.log('\n' + '━'.repeat(60));
  console.log('📋 R2 Migration Report');
  console.log('━'.repeat(60));

  console.log(`\n  Total legacy documents found: ${result.total}`);
  console.log(`  Migrated:  ${result.migrated}`);
  console.log(`  Skipped:   ${result.skipped} (already migrated)`);
  console.log(`  Failed:    ${result.failed}`);

  if (result.failed > 0) {
    console.log('\n  ❌ Failed documents:');
    for (const rec of result.records.filter(r => r.status === 'failed')) {
      console.log(`    - [${rec.documentId}] ${rec.error}`);
    }
  }

  console.log(`\n  Sample verification: ${sampleResult.verified} passed`);
  if (sampleResult.failures.length > 0) {
    console.log('  ⚠️  Sample verification failures:');
    for (const f of sampleResult.failures) {
      console.log(`    - ${f}`);
    }
  }

  console.log('\n' + '━'.repeat(60));
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('❌ DATABASE_URL environment variable is not set');
    process.exit(1);
  }

  const sql = neon(connectionString);

  // Test DB connection
  try {
    await sql`SELECT 1 AS test`;
  } catch (error) {
    console.error('❌ Failed to connect to Neon:', (error as Error).message);
    process.exit(1);
  }

  // Initialise R2 adapter
  const r2 = new R2StorageAdapter();
  if (!r2.isConfigured()) {
    console.error('❌ R2 storage is not configured. Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY.');
    process.exit(1);
  }

  console.log('🔄 Starting legacy document → R2 migration...\n');

  // 1. Find legacy documents
  const legacyDocs = await findLegacyDocuments(sql);
  console.log(`Found ${legacyDocs.length} document(s) with legacy Supabase URLs.\n`);

  if (legacyDocs.length === 0) {
    console.log('✅ Nothing to migrate — all documents already use R2 URLs.');
    process.exit(0);
  }

  // 2. Migrate each document
  const records: MigrationRecord[] = [];
  for (const doc of legacyDocs) {
    const record = await migrateSingleDocument(sql, r2, doc);
    records.push(record);
  }

  const result: MigrationResult = {
    total: legacyDocs.length,
    migrated: records.filter(r => r.status === 'migrated').length,
    skipped: records.filter(r => r.status === 'skipped').length,
    failed: records.filter(r => r.status === 'failed').length,
    records,
  };

  // 3. Verify random sample
  const sampleResult = await verifySample(sql, r2, records);

  // 4. Print report
  printReport(result, sampleResult);

  // Exit with error code if any failures
  process.exit(result.failed > 0 || sampleResult.failures.length > 0 ? 1 : 0);
}

main().catch(error => {
  console.error('❌ Migration script failed:', error);
  process.exit(1);
});

// Export for testing
export {
  sha256,
  buildR2Path,
  fetchWithRetry,
  findLegacyDocuments,
  isAlreadyMigrated,
  migrateSingleDocument,
  verifySample,
  LEGACY_URL_PATTERN,
  type LegacyDocument,
  type MigrationRecord,
  type MigrationResult,
};
