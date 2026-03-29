// @vitest-environment node
/**
 * Audit Remediation — Code Structure Verification Tests
 * Verifies dead code removal, hardcoded bypasses, and SQL safety patterns.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

function readSource(relativePath: string): string {
  return readFileSync(resolve(__dirname, '../../', relativePath), 'utf-8');
}

describe('R1/R6: lib/db.ts dead code removal', () => {
  const src = readSource('lib/db.ts');

  it('does not contain interpolateParams function', () => {
    expect(src).not.toMatch(/function\s+interpolateParams/);
  });

  it('does not export userQueries', () => {
    expect(src).not.toMatch(/export\s+(const|let|var)\s+userQueries/);
  });

  it('does not export sessionQueries', () => {
    expect(src).not.toMatch(/export\s+(const|let|var)\s+sessionQueries/);
  });

  it('does not export auditQueries', () => {
    expect(src).not.toMatch(/export\s+(const|let|var)\s+auditQueries/);
  });

  it('does not contain manual BEGIN/COMMIT/ROLLBACK in transaction logic', () => {
    // Allow mentions in comments but not in actual query calls
    const nonCommentLines = src.split('\n').filter(l => !l.trim().startsWith('*') && !l.trim().startsWith('//'));
    const joined = nonCommentLines.join('\n');
    expect(joined).not.toMatch(/query\s*\(\s*['"`]BEGIN['"`]/);
    expect(joined).not.toMatch(/query\s*\(\s*['"`]COMMIT['"`]/);
    expect(joined).not.toMatch(/query\s*\(\s*['"`]ROLLBACK['"`]/);
  });

  it('exports transaction function', () => {
    expect(src).toMatch(/export\s+async\s+function\s+transaction/);
  });

  it('exports query function', () => {
    expect(src).toMatch(/export\s+async\s+function\s+query/);
  });

  it('uses getNeonInstance cached factory', () => {
    expect(src).toMatch(/function\s+getNeonInstance/);
    expect(src).toMatch(/cachedSql/);
  });
});

describe('R2: AdminRoute has no hardcoded email bypass', () => {
  const src = readSource('src/components/AdminRoute.tsx');

  it('does not contain hardcoded email strings', () => {
    expect(src).not.toMatch(/cosmas@beanola\.com/);
    expect(src).not.toMatch(/user\.email\s*===\s*['"]/);
  });

  it('uses isAdmin from useAuth for access control', () => {
    expect(src).toMatch(/isAdmin/);
    expect(src).toMatch(/useAuth/);
  });
});

describe('R3: auth.ts has no SQL template literal interpolation', () => {
  const src = readSource('api-src/auth.ts');

  it('does not use ${...} inside SQL INTERVAL strings', () => {
    // Match template literals inside SQL-like strings containing INTERVAL
    const sqlBlocks = src.match(/`[^`]*INTERVAL[^`]*`/g) || [];
    for (const block of sqlBlocks) {
      expect(block).not.toMatch(/\$\{[^}]+\}/);
    }
  });

  it('uses parameterized $N placeholders for interval values', () => {
    // Should find INTERVAL '1 minute' * $N pattern
    expect(src).toMatch(/INTERVAL\s+'1 minute'\s*\*\s*\$\d/);
  });
});

describe('R4: health.ts requires auth for protected actions', () => {
  const src = readSource('api-src/health.ts');

  it('imports requireRole from auth middleware', () => {
    expect(src).toMatch(/requireRole/);
    expect(src).toMatch(/auth\/middleware/);
  });

  it('gates db/env/errors actions behind auth', () => {
    expect(src).toMatch(/protectedActions/);
    expect(src).toMatch(/requireRole\s*\(\s*req/);
  });
});

describe('R5: Arcjet fail-closed in production', () => {
  const src = readSource('lib/arcjet.ts');

  it('checks NODE_ENV for production fail-closed behavior', () => {
    expect(src).toMatch(/NODE_ENV.*production|production.*NODE_ENV/);
  });

  it('returns 503 when ARCJET_KEY missing in production', () => {
    expect(src).toMatch(/503/);
    expect(src).toMatch(/SECURITY_SERVICE_ERROR/);
  });

  it('has documents route type', () => {
    expect(src).toMatch(/documents.*window.*max|documents:\s*\{/);
  });
});

describe('R12: documents.ts uses documents rate limit', () => {
  const src = readSource('api-src/documents.ts');

  it('uses withArcjetProtection with documents type', () => {
    expect(src).toMatch(/withArcjetProtection\s*\(\s*handler\s*,\s*['"]documents['"]\s*\)/);
  });
});
