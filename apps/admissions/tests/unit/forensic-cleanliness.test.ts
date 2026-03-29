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
      '***REMOVED***',
      '***REMOVED***',
      '***REMOVED***',
      '***REMOVED***',
      '***REMOVED***',
      '***REMOVED***'
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
