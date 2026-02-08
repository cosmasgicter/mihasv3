/**
 * Unit tests for the Feature Flag Scanner
 * 
 * Tests the detection of feature flag definitions, conditional usages,
 * and identification of dead (unused) feature flags.
 * 
 * @requirements 9.5 - WHEN the Audit_System scans the codebase THEN it SHALL identify dead feature flags
 */

import { describe, it, expect } from 'vitest';
import {
  extractFeatureFlagDefinitions,
  extractFeatureFlagUsages,
  detectConditionalType,
  scanFeatureFlags,
} from '../../scripts/audit/deadcode/featureFlagScanner';

// =============================================================================
// extractFeatureFlagDefinitions
// =============================================================================

describe('extractFeatureFlagDefinitions', () => {
  it('detects FEATURE_* constant definitions', () => {
    const content = `
const FEATURE_NEW_DASHBOARD = true;
export const FEATURE_DARK_MODE = false;
let FEATURE_BETA_UI = process.env.BETA;
    `;
    const defs = extractFeatureFlagDefinitions('src/config.ts', content);
    expect(defs).toHaveLength(3);
    expect(defs.map(d => d.name)).toEqual([
      'FEATURE_NEW_DASHBOARD',
      'FEATURE_DARK_MODE',
      'FEATURE_BETA_UI',
    ]);
    expect(defs[0].source).toBe('constant');
    expect(defs[0].lineNumber).toBe(2);
  });

  it('detects FLAG_* constant definitions', () => {
    const content = `const FLAG_MAINTENANCE = true;`;
    const defs = extractFeatureFlagDefinitions('src/flags.ts', content);
    expect(defs).toHaveLength(1);
    expect(defs[0].name).toBe('FLAG_MAINTENANCE');
    expect(defs[0].source).toBe('constant');
  });

  it('detects ENABLE_* constant definitions', () => {
    const content = `export const ENABLE_NOTIFICATIONS = true;`;
    const defs = extractFeatureFlagDefinitions('src/config.ts', content);
    expect(defs).toHaveLength(1);
    expect(defs[0].name).toBe('ENABLE_NOTIFICATIONS');
  });

  it('detects IS_*_ENABLED constant definitions', () => {
    const content = `const IS_OCR_ENABLED = true;`;
    const defs = extractFeatureFlagDefinitions('src/config.ts', content);
    expect(defs).toHaveLength(1);
    expect(defs[0].name).toBe('IS_OCR_ENABLED');
  });

  it('detects USE_*_FEATURE constant definitions', () => {
    const content = `const USE_NEW_FEATURE = false;`;
    const defs = extractFeatureFlagDefinitions('src/config.ts', content);
    expect(defs).toHaveLength(1);
    expect(defs[0].name).toBe('USE_NEW_FEATURE');
  });

  it('detects environment variable feature flags in assignments', () => {
    const content = `
const enableDarkMode = process.env.FEATURE_DARK_MODE;
const enableBeta = import.meta.env.VITE_FEATURE_BETA;
const enableNotif = process.env.VITE_ENABLE_NOTIFICATIONS;
    `;
    const defs = extractFeatureFlagDefinitions('src/config.ts', content);
    expect(defs).toHaveLength(3);
    expect(defs.map(d => d.name)).toContain('FEATURE_DARK_MODE');
    expect(defs.map(d => d.name)).toContain('VITE_FEATURE_BETA');
    expect(defs.map(d => d.name)).toContain('VITE_ENABLE_NOTIFICATIONS');
    expect(defs.every(d => d.source === 'env_variable')).toBe(true);
  });

  it('detects object property feature flags', () => {
    const content = `
const config = {
  featureFlags.darkMode: true,
};
    `;
    // Object property detection requires assignment pattern
    const content2 = `featureFlags.darkMode = true;`;
    const defs = extractFeatureFlagDefinitions('src/config.ts', content2);
    expect(defs).toHaveLength(1);
    expect(defs[0].name).toBe('featureFlags.darkMode');
    expect(defs[0].source).toBe('object_property');
  });

  it('skips comment lines', () => {
    const content = `
// const FEATURE_COMMENTED_OUT = true;
/* const FEATURE_BLOCK_COMMENT = false; */
* const FEATURE_JSDOC = true;
const FEATURE_REAL = true;
    `;
    const defs = extractFeatureFlagDefinitions('src/config.ts', content);
    expect(defs).toHaveLength(1);
    expect(defs[0].name).toBe('FEATURE_REAL');
  });

  it('does not duplicate flags defined on the same name', () => {
    const content = `
const FEATURE_X = true;
const FEATURE_X = false;
    `;
    const defs = extractFeatureFlagDefinitions('src/config.ts', content);
    expect(defs).toHaveLength(1);
  });

  it('returns empty array for files with no feature flags', () => {
    const content = `
const name = 'hello';
function doSomething() { return 42; }
    `;
    const defs = extractFeatureFlagDefinitions('src/utils.ts', content);
    expect(defs).toHaveLength(0);
  });

  it('returns empty array for empty content', () => {
    const defs = extractFeatureFlagDefinitions('src/empty.ts', '');
    expect(defs).toHaveLength(0);
  });
});

// =============================================================================
// detectConditionalType
// =============================================================================

describe('detectConditionalType', () => {
  it('detects if statements', () => {
    expect(detectConditionalType('if (FEATURE_X) {', 'FEATURE_X')).toBe('if');
    expect(detectConditionalType('  if (FEATURE_X === true) {', 'FEATURE_X')).toBe('if');
    expect(detectConditionalType('} else if (FEATURE_X) {', 'FEATURE_X')).toBe('if');
  });

  it('detects ternary operators', () => {
    expect(detectConditionalType('const x = FEATURE_X ? "a" : "b";', 'FEATURE_X')).toBe('ternary');
    expect(detectConditionalType('return FEATURE_X ? <New /> : <Old />;', 'FEATURE_X')).toBe('ternary');
  });

  it('detects logical AND', () => {
    expect(detectConditionalType('FEATURE_X && <Component />', 'FEATURE_X')).toBe('logical_and');
    expect(detectConditionalType('{FEATURE_X && <NewFeature />}', 'FEATURE_X')).toBe('logical_and');
  });

  it('detects logical OR', () => {
    expect(detectConditionalType('const val = FEATURE_X || fallback;', 'FEATURE_X')).toBe('logical_or');
  });

  it('detects switch statements', () => {
    expect(detectConditionalType('switch (FEATURE_X) {', 'FEATURE_X')).toBe('switch');
  });

  it('returns null for simple assignments', () => {
    expect(detectConditionalType('const FEATURE_X = true;', 'FEATURE_X')).toBeNull();
    expect(detectConditionalType('export const FEATURE_X = false;', 'FEATURE_X')).toBeNull();
    expect(detectConditionalType('let FEATURE_X = process.env.X;', 'FEATURE_X')).toBeNull();
  });

  it('returns null for non-conditional usage', () => {
    expect(detectConditionalType('console.log(FEATURE_X);', 'FEATURE_X')).toBeNull();
    expect(detectConditionalType('doSomething(FEATURE_X);', 'FEATURE_X')).toBeNull();
  });
});

// =============================================================================
// extractFeatureFlagUsages
// =============================================================================

describe('extractFeatureFlagUsages', () => {
  it('finds flag usages in if statements', () => {
    const content = `
if (FEATURE_DARK_MODE) {
  enableDarkMode();
}
    `;
    const usages = extractFeatureFlagUsages('src/app.ts', content, ['FEATURE_DARK_MODE']);
    expect(usages).toHaveLength(1);
    expect(usages[0].conditionalType).toBe('if');
    expect(usages[0].flagName).toBe('FEATURE_DARK_MODE');
    expect(usages[0].lineNumber).toBe(2);
  });

  it('finds flag usages in ternary expressions', () => {
    const content = `const theme = FEATURE_DARK_MODE ? 'dark' : 'light';`;
    const usages = extractFeatureFlagUsages('src/app.ts', content, ['FEATURE_DARK_MODE']);
    expect(usages).toHaveLength(1);
    expect(usages[0].conditionalType).toBe('ternary');
  });

  it('finds flag usages in JSX logical AND', () => {
    const content = `return <div>{FEATURE_BETA && <BetaBanner />}</div>;`;
    const usages = extractFeatureFlagUsages('src/app.tsx', content, ['FEATURE_BETA']);
    expect(usages).toHaveLength(1);
    expect(usages[0].conditionalType).toBe('logical_and');
  });

  it('finds env variable flag usages in conditionals', () => {
    const content = `
if (process.env.FEATURE_MAINTENANCE) {
  showMaintenancePage();
}
    `;
    const usages = extractFeatureFlagUsages('src/app.ts', content, ['FEATURE_MAINTENANCE']);
    expect(usages).toHaveLength(1);
    expect(usages[0].conditionalType).toBe('if');
  });

  it('skips comment lines', () => {
    const content = `
// if (FEATURE_X) { doSomething(); }
const active = true;
    `;
    const usages = extractFeatureFlagUsages('src/app.ts', content, ['FEATURE_X']);
    expect(usages).toHaveLength(0);
  });

  it('returns empty for flags not present in content', () => {
    const content = `const x = 42;`;
    const usages = extractFeatureFlagUsages('src/app.ts', content, ['FEATURE_MISSING']);
    expect(usages).toHaveLength(0);
  });

  it('handles multiple flags in the same file', () => {
    const content = `
if (FEATURE_A) { doA(); }
if (FEATURE_B) { doB(); }
    `;
    const usages = extractFeatureFlagUsages('src/app.ts', content, ['FEATURE_A', 'FEATURE_B']);
    expect(usages).toHaveLength(2);
    expect(usages.map(u => u.flagName)).toContain('FEATURE_A');
    expect(usages.map(u => u.flagName)).toContain('FEATURE_B');
  });
});

// =============================================================================
// scanFeatureFlags (integration with filesystem)
// =============================================================================

describe('scanFeatureFlags', () => {
  it('returns an array of DeadCodeItem', () => {
    // Running against the actual codebase - should return an array
    const result = scanFeatureFlags();
    expect(Array.isArray(result)).toBe(true);
    // Each item should have the correct type
    for (const item of result) {
      expect(item.type).toBe('FEATURE_FLAG');
      expect(item.filePath).toBeDefined();
      expect(item.name).toBeDefined();
      expect(item.evidence).toBeDefined();
      expect(typeof item.safeToRemove).toBe('boolean');
    }
  });
});
