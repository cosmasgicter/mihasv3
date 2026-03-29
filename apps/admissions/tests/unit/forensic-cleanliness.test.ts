import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';

function readProjectFile(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), relativePath), 'utf-8');
}

describe('forensic cleanup hardening', () => {
  it('runtime files do not hardcode a Cloudflare account hostname', () => {
    const files = [
      'src/utils/api-cache.ts',
      'src/lib/securityEnhancements.ts',
      'lib/storage.ts'
    ];

    for (const file of files) {
      if (!existsSync(resolve(process.cwd(), file))) {
        continue;
      }
      const content = readProjectFile(file);
      expect(content).not.toContain('a3ba1959935abd8777e64caee46d1de1.r2.cloudflarestorage.com');
    }
  });

  it('tracked environment files do not commit concrete production secrets', () => {
    const files = ['.env.production', '.env.development'];

    const bannedValues = [
      'ajkey_000000000000000000000000000000000000000000',
      'postgresql://neondb_owner:npg_v2UT3kAKhJXY@ep-dawn-unit-ahj08a5x-pooler.c-3.us-east-1.aws.neon.tech/neondb?sslmode=require',
      're_cT8PNR7g_HT72NPZNFRpYmvPnZLYa5n1e',
      'Skyl3r@L0m1s',
      '0db02574d3d07c5369ff4b9360cca39ec28924d0a52f00caa6e13e56e9863bd9',
      'a0b9e38a2c50a5bd0513a9333f47d52b'
    ];

    for (const file of files) {
      if (!existsSync(resolve(process.cwd(), file))) {
        continue;
      }
      const content = readProjectFile(file);
      for (const banned of bannedValues) {
        expect(content).not.toContain(banned);
      }
    }
  });
});
