/**
 * R2 Storage Adapter
 *
 * Uses an S3-compatible API for uploads, downloads, and signed URLs.
 *
 * Environment Variables Required:
 * - R2_ACCOUNT_ID: storage account ID
 * - R2_ACCESS_KEY_ID: storage access key ID
 * - R2_SECRET_ACCESS_KEY: storage secret access key
 * - R2_BUCKET_NAME: storage bucket name (default: ***REMOVED***)
 * - R2_PUBLIC_URL: public URL for the bucket (optional)
 */

import { createHmac, createHash } from 'crypto';

// R2 Configuration
const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID || '';
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID || '';
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY || '';
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME || '***REMOVED***';
const R2_ENDPOINT = process.env.R2_ENDPOINT || '';
const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL || '';

/**
 * Storage operation result
 */
export interface StorageResult {
  success: boolean;
  path?: string;
  url?: string;
  error?: string;
  size?: number;
  contentType?: string;
}

/**
 * File metadata
 */
export interface FileMetadata {
  path: string;
  size: number;
  contentType: string;
  lastModified: Date;
  etag?: string;
}

/**
 * AWS Signature V4 signing for R2 (S3-compatible)
 */
class AwsV4Signer {
  private accessKeyId: string;
  private secretAccessKey: string;
  private region: string;
  private service: string;

  constructor(accessKeyId: string, secretAccessKey: string, region = 'auto', service = 's3') {
    this.accessKeyId = accessKeyId;
    this.secretAccessKey = secretAccessKey;
    this.region = region;
    this.service = service;
  }

  /**
   * Sign a request using AWS Signature V4
   */
  sign(
    method: string,
    url: string,
    headers: Record<string, string>,
    body?: Buffer | string
  ): Record<string, string> {
    const parsedUrl = new URL(url);
    const datetime = new Date().toISOString().replace(/[:-]|\.\d{3}/g, '');
    const date = datetime.substring(0, 8);

    // Add required headers
    headers['x-amz-date'] = datetime;
    headers['x-amz-content-sha256'] = body 
      ? createHash('sha256').update(body).digest('hex')
      : 'UNSIGNED-PAYLOAD';
    headers['host'] = parsedUrl.host;

    // Create canonical request
    const signedHeaders = Object.keys(headers)
      .map(k => k.toLowerCase())
      .sort()
      .join(';');

    const canonicalHeaders = Object.keys(headers)
      .map(k => `${k.toLowerCase()}:${headers[k].trim()}`)
      .sort()
      .join('\n');

    const canonicalRequest = [
      method,
      parsedUrl.pathname,
      parsedUrl.search.substring(1),
      canonicalHeaders + '\n',
      signedHeaders,
      headers['x-amz-content-sha256'],
    ].join('\n');

    // Create string to sign
    const credentialScope = `${date}/${this.region}/${this.service}/aws4_request`;
    const stringToSign = [
      'AWS4-HMAC-SHA256',
      datetime,
      credentialScope,
      createHash('sha256').update(canonicalRequest).digest('hex'),
    ].join('\n');

    // Calculate signature
    const kDate = createHmac('sha256', `AWS4${this.secretAccessKey}`).update(date).digest();
    const kRegion = createHmac('sha256', kDate).update(this.region).digest();
    const kService = createHmac('sha256', kRegion).update(this.service).digest();
    const kSigning = createHmac('sha256', kService).update('aws4_request').digest();
    const signature = createHmac('sha256', kSigning).update(stringToSign).digest('hex');

    // Add authorization header
    headers['Authorization'] = [
      `AWS4-HMAC-SHA256 Credential=${this.accessKeyId}/${credentialScope}`,
      `SignedHeaders=${signedHeaders}`,
      `Signature=${signature}`,
    ].join(', ');

    return headers;
  }

  /**
   * Generate a pre-signed URL for temporary access
   */
  getSignedUrl(
    method: string,
    url: string,
    expiresIn: number = 3600
  ): string {
    const parsedUrl = new URL(url);
    const datetime = new Date().toISOString().replace(/[:-]|\.\d{3}/g, '');
    const date = datetime.substring(0, 8);
    const credentialScope = `${date}/${this.region}/${this.service}/aws4_request`;

    // Add query parameters for pre-signed URL
    const params = new URLSearchParams(parsedUrl.search);
    params.set('X-Amz-Algorithm', 'AWS4-HMAC-SHA256');
    params.set('X-Amz-Credential', `${this.accessKeyId}/${credentialScope}`);
    params.set('X-Amz-Date', datetime);
    params.set('X-Amz-Expires', String(expiresIn));
    params.set('X-Amz-SignedHeaders', 'host');

    // Sort parameters
    const sortedParams = new URLSearchParams([...params.entries()].sort());
    parsedUrl.search = sortedParams.toString();

    // Create canonical request for pre-signed URL
    const canonicalRequest = [
      method,
      parsedUrl.pathname,
      sortedParams.toString(),
      `host:${parsedUrl.host}\n`,
      'host',
      'UNSIGNED-PAYLOAD',
    ].join('\n');

    // Create string to sign
    const stringToSign = [
      'AWS4-HMAC-SHA256',
      datetime,
      credentialScope,
      createHash('sha256').update(canonicalRequest).digest('hex'),
    ].join('\n');

    // Calculate signature
    const kDate = createHmac('sha256', `AWS4${this.secretAccessKey}`).update(date).digest();
    const kRegion = createHmac('sha256', kDate).update(this.region).digest();
    const kService = createHmac('sha256', kRegion).update(this.service).digest();
    const kSigning = createHmac('sha256', kService).update('aws4_request').digest();
    const signature = createHmac('sha256', kSigning).update(stringToSign).digest('hex');

    // Add signature to URL
    sortedParams.set('X-Amz-Signature', signature);
    parsedUrl.search = sortedParams.toString();

    return parsedUrl.toString();
  }
}

/**
 * R2 Storage Adapter
 * 
 * Provides methods for uploading, downloading, and managing files in Cloudflare R2.
 */
export class R2StorageAdapter {
  private signer: AwsV4Signer;
  private bucketName: string;
  private endpoint: string;
  private publicUrl: string;

  constructor() {
    if (!R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY) {
      console.warn('[R2Storage] Missing R2 credentials - storage operations will fail');
    }

    this.signer = new AwsV4Signer(R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY);
    this.bucketName = R2_BUCKET_NAME;
    this.endpoint = R2_ENDPOINT;
    this.publicUrl = R2_PUBLIC_URL;
  }

  /**
   * Check if R2 is configured
   */
  isConfigured(): boolean {
    return !!(R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY && R2_ACCOUNT_ID);
  }

  /**
   * Upload a file to R2
   * 
   * @param path - Storage path (e.g., "user-id/app-id/document.pdf")
   * @param data - File data as Buffer
   * @param contentType - MIME type of the file
   * @returns Storage result with path and URL
   */
  async upload(
    path: string,
    data: Buffer,
    contentType: string = 'application/octet-stream'
  ): Promise<StorageResult> {
    if (!this.isConfigured()) {
      return { success: false, error: 'R2 storage not configured' };
    }

    const url = `${this.endpoint}/${this.bucketName}/${path}`;
    const headers: Record<string, string> = {
      'Content-Type': contentType,
      'Content-Length': String(data.length),
    };

    try {
      const signedHeaders = this.signer.sign('PUT', url, headers, data);

      const response = await fetch(url, {
        method: 'PUT',
        headers: signedHeaders,
        body: data,
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[R2Storage] Upload failed:', response.status, errorText);
        return { success: false, error: `Upload failed: ${response.status}` };
      }

      console.log('[R2Storage] File uploaded:', path);
      return {
        success: true,
        path,
        url: `${this.publicUrl}/${path}`,
        size: data.length,
        contentType,
      };
    } catch (error) {
      console.error('[R2Storage] Upload error:', error);
      return { success: false, error: (error as Error).message };
    }
  }

  /**
   * Download a file from R2
   * 
   * @param path - Storage path
   * @returns File data as Buffer or null if not found
   */
  async download(path: string): Promise<Buffer | null> {
    if (!this.isConfigured()) {
      console.error('[R2Storage] R2 storage not configured');
      return null;
    }

    const url = `${this.endpoint}/${this.bucketName}/${path}`;
    const headers: Record<string, string> = {};

    try {
      const signedHeaders = this.signer.sign('GET', url, headers);

      const response = await fetch(url, {
        method: 'GET',
        headers: signedHeaders,
      });

      if (!response.ok) {
        if (response.status === 404) {
          return null;
        }
        console.error('[R2Storage] Download failed:', response.status);
        return null;
      }

      const arrayBuffer = await response.arrayBuffer();
      return Buffer.from(arrayBuffer);
    } catch (error) {
      console.error('[R2Storage] Download error:', error);
      return null;
    }
  }

  /**
   * Delete a file from R2
   * 
   * @param path - Storage path
   * @returns True if deleted successfully
   */
  async delete(path: string): Promise<boolean> {
    if (!this.isConfigured()) {
      console.error('[R2Storage] R2 storage not configured');
      return false;
    }

    const url = `${this.endpoint}/${this.bucketName}/${path}`;
    const headers: Record<string, string> = {};

    try {
      const signedHeaders = this.signer.sign('DELETE', url, headers);

      const response = await fetch(url, {
        method: 'DELETE',
        headers: signedHeaders,
      });

      if (!response.ok && response.status !== 204) {
        console.error('[R2Storage] Delete failed:', response.status);
        return false;
      }

      console.log('[R2Storage] File deleted:', path);
      return true;
    } catch (error) {
      console.error('[R2Storage] Delete error:', error);
      return false;
    }
  }

  /**
   * Generate a signed URL for temporary access
   * 
   * @param path - Storage path
   * @param expiresIn - Expiration time in seconds (default: 1 hour)
   * @returns Signed URL
   */
  getSignedUrl(path: string, expiresIn: number = 3600): string {
    const url = `${this.endpoint}/${this.bucketName}/${path}`;
    return this.signer.getSignedUrl('GET', url, expiresIn);
  }

  /**
   * Get public URL for a file
   * 
   * @param path - Storage path
   * @returns Public URL
   */
  getPublicUrl(path: string): string {
    return `${this.publicUrl}/${path}`;
  }

  /**
   * Check if a file exists
   * 
   * @param path - Storage path
   * @returns True if file exists
   */
  async exists(path: string): Promise<boolean> {
    if (!this.isConfigured()) {
      return false;
    }

    const url = `${this.endpoint}/${this.bucketName}/${path}`;
    const headers: Record<string, string> = {};

    try {
      const signedHeaders = this.signer.sign('HEAD', url, headers);

      const response = await fetch(url, {
        method: 'HEAD',
        headers: signedHeaders,
      });

      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Get file metadata
   * 
   * @param path - Storage path
   * @returns File metadata or null if not found
   */
  async getMetadata(path: string): Promise<FileMetadata | null> {
    if (!this.isConfigured()) {
      return null;
    }

    const url = `${this.endpoint}/${this.bucketName}/${path}`;
    const headers: Record<string, string> = {};

    try {
      const signedHeaders = this.signer.sign('HEAD', url, headers);

      const response = await fetch(url, {
        method: 'HEAD',
        headers: signedHeaders,
      });

      if (!response.ok) {
        return null;
      }

      return {
        path,
        size: parseInt(response.headers.get('content-length') || '0', 10),
        contentType: response.headers.get('content-type') || 'application/octet-stream',
        lastModified: new Date(response.headers.get('last-modified') || Date.now()),
        etag: response.headers.get('etag') || undefined,
      };
    } catch {
      return null;
    }
  }

  /**
   * List files in a directory
   * 
   * @param prefix - Directory prefix
   * @param maxKeys - Maximum number of files to return
   * @returns Array of file paths
   */
  async list(prefix: string = '', maxKeys: number = 1000): Promise<string[]> {
    if (!this.isConfigured()) {
      return [];
    }

    const url = new URL(`${this.endpoint}/${this.bucketName}`);
    if (prefix) {
      url.searchParams.set('prefix', prefix);
    }
    url.searchParams.set('max-keys', String(maxKeys));

    const headers: Record<string, string> = {};

    try {
      const signedHeaders = this.signer.sign('GET', url.toString(), headers);

      const response = await fetch(url.toString(), {
        method: 'GET',
        headers: signedHeaders,
      });

      if (!response.ok) {
        console.error('[R2Storage] List failed:', response.status);
        return [];
      }

      const xml = await response.text();
      
      // Parse XML response to extract keys
      const keys: string[] = [];
      const keyMatches = xml.matchAll(/<Key>([^<]+)<\/Key>/g);
      for (const match of keyMatches) {
        keys.push(match[1]);
      }

      return keys;
    } catch (error) {
      console.error('[R2Storage] List error:', error);
      return [];
    }
  }
}

// Singleton instance
let r2Instance: R2StorageAdapter | null = null;

/**
 * Get R2 Storage adapter instance
 */
export function getR2Storage(): R2StorageAdapter {
  if (!r2Instance) {
    r2Instance = new R2StorageAdapter();
  }
  return r2Instance;
}

/**
 * Check if R2 storage is available
 */
export function isR2Available(): boolean {
  return getR2Storage().isConfigured();
}
