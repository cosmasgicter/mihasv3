/**
 * Storage Migration Script: Supabase Storage → Cloudflare R2
 * 
 * Migrates all files from Supabase Storage to Cloudflare R2.
 * Updates file URLs in the database after migration.
 * 
 * Usage:
 *   bun run scripts/migrate-storage-to-r2.ts
 * 
 * Environment Variables Required:
 *   - SUPABASE_URL
 *   - SUPABASE_SERVICE_ROLE_KEY
 *   - R2_ACCOUNT_ID
 *   - R2_ACCESS_KEY_ID
 *   - R2_SECRET_ACCESS_KEY
 *   - R2_BUCKET_NAME (default: mihasapplication)
 *   - DATABASE_URL (Neon connection string)
 */

import { createHmac, createHash } from 'crypto';

// Configuration
const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID || '';
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID || '';
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY || '';
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME || 'mihasapplication';
const R2_ENDPOINT = `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;
const DATABASE_URL = process.env.DATABASE_URL || '';

// Supabase storage buckets to migrate
const STORAGE_BUCKETS = ['documents', 'avatars', 'attachments'];

interface MigrationResult {
  bucket: string;
  totalFiles: number;
  migratedFiles: number;
  failedFiles: number;
  errors: string[];
}

interface FileInfo {
  name: string;
  id: string;
  bucket_id: string;
  created_at: string;
  updated_at: string;
  metadata: Record<string, unknown>;
}

/**
 * AWS V4 Signer for R2
 */
class AwsV4Signer {
  constructor(
    private accessKeyId: string,
    private secretAccessKey: string,
    private region = 'auto',
    private service = 's3'
  ) {}

  sign(method: string, url: string, headers: Record<string, string>, body?: Buffer): Record<string, string> {
    const parsedUrl = new URL(url);
    const datetime = new Date().toISOString().replace(/[:-]|\.\d{3}/g, '');
    const date = datetime.substring(0, 8);

    headers['x-amz-date'] = datetime;
    headers['x-amz-content-sha256'] = body 
      ? createHash('sha256').update(body).digest('hex')
      : 'UNSIGNED-PAYLOAD';
    headers['host'] = parsedUrl.host;

    const signedHeaders = Object.keys(headers).map(k => k.toLowerCase()).sort().join(';');
    const canonicalHeaders = Object.keys(headers).map(k => `${k.toLowerCase()}:${headers[k].trim()}`).sort().join('\n');

    const canonicalRequest = [
      method,
      parsedUrl.pathname,
      parsedUrl.search.substring(1),
      canonicalHeaders + '\n',
      signedHeaders,
      headers['x-amz-content-sha256'],
    ].join('\n');

    const credentialScope = `${date}/${this.region}/${this.service}/aws4_request`;
    const stringToSign = [
      'AWS4-HMAC-SHA256',
      datetime,
      credentialScope,
      createHash('sha256').update(canonicalRequest).digest('hex'),
    ].join('\n');

    const kDate = createHmac('sha256', `AWS4${this.secretAccessKey}`).update(date).digest();
    const kRegion = createHmac('sha256', kDate).update(this.region).digest();
    const kService = createHmac('sha256', kRegion).update(this.service).digest();
    const kSigning = createHmac('sha256', kService).update('aws4_request').digest();
    const signature = createHmac('sha256', kSigning).update(stringToSign).digest('hex');

    headers['Authorization'] = [
      `AWS4-HMAC-SHA256 Credential=${this.accessKeyId}/${credentialScope}`,
      `SignedHeaders=${signedHeaders}`,
      `Signature=${signature}`,
    ].join(', ');

    return headers;
  }
}

/**
 * List files in a Supabase storage bucket
 */
async function listSupabaseFiles(bucket: string, path = ''): Promise<FileInfo[]> {
  const url = `${SUPABASE_URL}/storage/v1/object/list/${bucket}`;
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      prefix: path,
      limit: 1000,
      offset: 0,
    }),
  });

  if (!response.ok) {
    console.error(`Failed to list files in ${bucket}:`, await response.text());
    return [];
  }

  const files = await response.json() as FileInfo[];
  return files.filter(f => f.name && !f.name.endsWith('/'));
}

/**
 * Download file from Supabase storage
 */
async function downloadFromSupabase(bucket: string, path: string): Promise<Buffer | null> {
  const url = `${SUPABASE_URL}/storage/v1/object/${bucket}/${path}`;
  
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    },
  });

  if (!response.ok) {
    console.error(`Failed to download ${bucket}/${path}:`, response.status);
    return null;
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

/**
 * Upload file to R2
 */
async function uploadToR2(
  signer: AwsV4Signer,
  path: string,
  data: Buffer,
  contentType: string
): Promise<boolean> {
  const url = `${R2_ENDPOINT}/${R2_BUCKET_NAME}/${path}`;
  const headers: Record<string, string> = {
    'Content-Type': contentType,
    'Content-Length': String(data.length),
  };

  const signedHeaders = signer.sign('PUT', url, headers, data);

  const response = await fetch(url, {
    method: 'PUT',
    headers: signedHeaders,
    body: data,
  });

  return response.ok;
}

/**
 * Get content type from file extension
 */
function getContentType(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase();
  const types: Record<string, string> = {
    'pdf': 'application/pdf',
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'png': 'image/png',
    'gif': 'image/gif',
    'doc': 'application/msword',
    'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'xls': 'application/vnd.ms-excel',
    'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'txt': 'text/plain',
    'csv': 'text/csv',
  };
  return types[ext || ''] || 'application/octet-stream';
}

/**
 * Migrate a single bucket
 */
async function migrateBucket(bucket: string, signer: AwsV4Signer): Promise<MigrationResult> {
  const result: MigrationResult = {
    bucket,
    totalFiles: 0,
    migratedFiles: 0,
    failedFiles: 0,
    errors: [],
  };

  console.log(`\n📁 Migrating bucket: ${bucket}`);
  
  const files = await listSupabaseFiles(bucket);
  result.totalFiles = files.length;
  
  if (files.length === 0) {
    console.log(`   No files found in ${bucket}`);
    return result;
  }

  console.log(`   Found ${files.length} files`);

  for (const file of files) {
    const sourcePath = file.name;
    const destPath = `${bucket}/${sourcePath}`;
    
    process.stdout.write(`   Migrating: ${sourcePath}... `);

    try {
      // Download from Supabase
      const data = await downloadFromSupabase(bucket, sourcePath);
      if (!data) {
        result.failedFiles++;
        result.errors.push(`Failed to download: ${sourcePath}`);
        console.log('❌ (download failed)');
        continue;
      }

      // Upload to R2
      const contentType = getContentType(sourcePath);
      const success = await uploadToR2(signer, destPath, data, contentType);
      
      if (success) {
        result.migratedFiles++;
        console.log('✅');
      } else {
        result.failedFiles++;
        result.errors.push(`Failed to upload: ${sourcePath}`);
        console.log('❌ (upload failed)');
      }
    } catch (error) {
      result.failedFiles++;
      result.errors.push(`Error: ${sourcePath} - ${(error as Error).message}`);
      console.log(`❌ (${(error as Error).message})`);
    }

    // Small delay to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  return result;
}

/**
 * Update file URLs in database
 */
async function updateDatabaseUrls(): Promise<void> {
  if (!DATABASE_URL) {
    console.log('\n⚠️  DATABASE_URL not set - skipping database URL updates');
    return;
  }

  console.log('\n📝 Updating file URLs in database...');
  
  const { neon } = await import('@neondatabase/serverless');
  const sql = neon(DATABASE_URL);

  const R2_PUBLIC_URL = `https://a3ba1959935abd8777e64caee46d1de1.r2.cloudflarestorage.com/${R2_BUCKET_NAME}`;
  const SUPABASE_STORAGE_URL = `${SUPABASE_URL}/storage/v1/object/public`;

  // Update application_documents table
  try {
    const result = await sql`
      UPDATE application_documents 
      SET file_url = REPLACE(file_url, ${SUPABASE_STORAGE_URL}, ${R2_PUBLIC_URL})
      WHERE file_url LIKE ${SUPABASE_STORAGE_URL + '%'}
    `;
    console.log(`   Updated application_documents: ${result.length || 0} rows`);
  } catch (error) {
    console.error('   Failed to update application_documents:', (error as Error).message);
  }

  // Update documents table
  try {
    const result = await sql`
      UPDATE documents 
      SET file_url = REPLACE(file_url, ${SUPABASE_STORAGE_URL}, ${R2_PUBLIC_URL})
      WHERE file_url LIKE ${SUPABASE_STORAGE_URL + '%'}
    `;
    console.log(`   Updated documents: ${result.length || 0} rows`);
  } catch (error) {
    console.error('   Failed to update documents:', (error as Error).message);
  }

  // Update profiles avatars
  try {
    const result = await sql`
      UPDATE profiles 
      SET avatar_url = REPLACE(avatar_url, ${SUPABASE_STORAGE_URL}, ${R2_PUBLIC_URL})
      WHERE avatar_url LIKE ${SUPABASE_STORAGE_URL + '%'}
    `;
    console.log(`   Updated profiles avatars: ${result.length || 0} rows`);
  } catch (error) {
    console.error('   Failed to update profiles:', (error as Error).message);
  }

  console.log('   Database URL updates complete');
}

/**
 * Main migration function
 */
async function main(): Promise<void> {
  console.log('🚀 Supabase Storage → Cloudflare R2 Migration');
  console.log('='.repeat(50));

  // Validate configuration
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error('❌ Missing Supabase credentials');
    console.error('   Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
  }

  if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY) {
    console.error('❌ Missing R2 credentials');
    console.error('   Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, and R2_SECRET_ACCESS_KEY');
    process.exit(1);
  }

  console.log(`\nSource: ${SUPABASE_URL}`);
  console.log(`Target: ${R2_ENDPOINT}/${R2_BUCKET_NAME}`);
  console.log(`Buckets: ${STORAGE_BUCKETS.join(', ')}`);

  const signer = new AwsV4Signer(R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY);
  const results: MigrationResult[] = [];

  // Migrate each bucket
  for (const bucket of STORAGE_BUCKETS) {
    const result = await migrateBucket(bucket, signer);
    results.push(result);
  }

  // Update database URLs
  await updateDatabaseUrls();

  // Print summary
  console.log('\n' + '='.repeat(50));
  console.log('📊 Migration Summary');
  console.log('='.repeat(50));

  let totalFiles = 0;
  let totalMigrated = 0;
  let totalFailed = 0;

  for (const result of results) {
    console.log(`\n${result.bucket}:`);
    console.log(`   Total: ${result.totalFiles}`);
    console.log(`   Migrated: ${result.migratedFiles}`);
    console.log(`   Failed: ${result.failedFiles}`);
    
    if (result.errors.length > 0) {
      console.log('   Errors:');
      result.errors.forEach(e => console.log(`     - ${e}`));
    }

    totalFiles += result.totalFiles;
    totalMigrated += result.migratedFiles;
    totalFailed += result.failedFiles;
  }

  console.log('\n' + '-'.repeat(50));
  console.log(`Total Files: ${totalFiles}`);
  console.log(`Successfully Migrated: ${totalMigrated}`);
  console.log(`Failed: ${totalFailed}`);
  console.log(`Success Rate: ${totalFiles > 0 ? ((totalMigrated / totalFiles) * 100).toFixed(1) : 0}%`);

  if (totalFailed > 0) {
    console.log('\n⚠️  Some files failed to migrate. Review errors above.');
    process.exit(1);
  } else {
    console.log('\n✅ Migration completed successfully!');
  }
}

// Run migration
main().catch(error => {
  console.error('Migration failed:', error);
  process.exit(1);
});
