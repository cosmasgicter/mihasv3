/**
 * Unit Tests for URL Validator — SSRF Prevention
 *
 * Tests isAllowedUrl() and isPrivateIP() from lib/urlValidator.ts
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { isAllowedUrl, isPrivateIP } from '../../lib/urlValidator';

let envBackup: Record<string, string | undefined>;

beforeEach(() => {
  envBackup = {
    R2_PUBLIC_URL: process.env.R2_PUBLIC_URL,
    R2_PUBLIC_DOMAIN: process.env.R2_PUBLIC_DOMAIN,
  };
});

afterEach(() => {
  for (const [key, val] of Object.entries(envBackup)) {
    if (val === undefined) delete process.env[key];
    else process.env[key] = val;
  }
});

describe('isPrivateIP', () => {
  it('rejects 127.0.0.0/8 loopback', () => {
    expect(isPrivateIP('127.0.0.1')).toBe(true);
    expect(isPrivateIP('127.255.255.255')).toBe(true);
  });

  it('rejects 10.0.0.0/8 private range', () => {
    expect(isPrivateIP('10.0.0.1')).toBe(true);
    expect(isPrivateIP('10.255.255.255')).toBe(true);
  });

  it('rejects 172.16.0.0/12 private range', () => {
    expect(isPrivateIP('172.16.0.1')).toBe(true);
    expect(isPrivateIP('172.31.255.255')).toBe(true);
  });

  it('rejects 192.168.0.0/16 private range', () => {
    expect(isPrivateIP('192.168.0.1')).toBe(true);
    expect(isPrivateIP('192.168.255.255')).toBe(true);
  });

  it('rejects 169.254.0.0/16 link-local', () => {
    expect(isPrivateIP('169.254.0.1')).toBe(true);
    expect(isPrivateIP('169.254.169.254')).toBe(true);
  });

  it('rejects IPv6 loopback ::1', () => {
    expect(isPrivateIP('::1')).toBe(true);
    expect(isPrivateIP('[::1]')).toBe(true);
  });

  it('rejects IPv6 ULA fc00::/7', () => {
    expect(isPrivateIP('fc00::1')).toBe(true);
    expect(isPrivateIP('fd12::1')).toBe(true);
  });

  it('rejects IPv6 link-local fe80::', () => {
    expect(isPrivateIP('fe80::1')).toBe(true);
  });

  it('rejects 0.0.0.0/8', () => {
    expect(isPrivateIP('0.0.0.0')).toBe(true);
  });

  it('accepts public IPs', () => {
    expect(isPrivateIP('8.8.8.8')).toBe(false);
    expect(isPrivateIP('1.1.1.1')).toBe(false);
    expect(isPrivateIP('203.0.113.1')).toBe(false);
  });

  it('accepts regular hostnames', () => {
    expect(isPrivateIP('apply.mihas.edu.zm')).toBe(false);
    expect(isPrivateIP('example.com')).toBe(false);
  });

  it('does not match 172.15.x.x (outside /12 range)', () => {
    expect(isPrivateIP('172.15.255.255')).toBe(false);
  });

  it('does not match 172.32.x.x (outside /12 range)', () => {
    expect(isPrivateIP('172.32.0.1')).toBe(false);
  });
});

describe('isAllowedUrl', () => {
  it('accepts HTTPS URLs on the application domain', () => {
    expect(isAllowedUrl('***REMOVED***/documents/test.pdf')).toBe(true);
  });

  it('rejects HTTP URLs', () => {
    expect(isAllowedUrl('http://apply.mihas.edu.zm/documents/test.pdf')).toBe(false);
  });

  it('rejects FTP URLs', () => {
    expect(isAllowedUrl('ftp://apply.mihas.edu.zm/file.pdf')).toBe(false);
  });

  it('rejects non-allowlisted domains', () => {
    expect(isAllowedUrl('https://evil.com/malicious.pdf')).toBe(false);
    expect(isAllowedUrl('https://google.com/doc.pdf')).toBe(false);
  });

  it('rejects private IP URLs', () => {
    expect(isAllowedUrl('https://127.0.0.1/secret')).toBe(false);
    expect(isAllowedUrl('https://10.0.0.1/internal')).toBe(false);
    expect(isAllowedUrl('https://192.168.1.1/admin')).toBe(false);
  });

  it('rejects invalid URLs', () => {
    expect(isAllowedUrl('not-a-url')).toBe(false);
    expect(isAllowedUrl('')).toBe(false);
    expect(isAllowedUrl('javascript:alert(1)')).toBe(false);
  });

  it('accepts R2 storage domain from R2_PUBLIC_URL env', () => {
    process.env.R2_PUBLIC_URL = 'https://storage.example.com';
    expect(isAllowedUrl('https://storage.example.com/docs/file.pdf')).toBe(true);
  });

  it('accepts R2 storage domain from R2_PUBLIC_DOMAIN env', () => {
    process.env.R2_PUBLIC_DOMAIN = 'cdn.mihas.edu.zm';
    expect(isAllowedUrl('https://cdn.mihas.edu.zm/uploads/doc.pdf')).toBe(true);
  });

  it('rejects data: URIs', () => {
    expect(isAllowedUrl('data:text/html,<script>alert(1)</script>')).toBe(false);
  });

  it('rejects file: URIs', () => {
    expect(isAllowedUrl('file:///etc/passwd')).toBe(false);
  });
});
