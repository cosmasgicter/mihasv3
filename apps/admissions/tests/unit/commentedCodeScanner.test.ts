/**
 * Unit tests for the Commented Code Scanner
 * 
 * Tests the core logic of detecting commented-out code blocks,
 * distinguishing them from documentation comments, and producing
 * correct DeadCodeItem results.
 */

import { describe, it, expect } from 'vitest';
import {
  isSingleLineComment,
  getBlockCommentState,
  isDocumentationComment,
  isSectionDivider,
  countCodeIndicators,
  countProseIndicators,
  extractCommentedBlocks,
  scanCommentedCode,
} from '../../scripts/audit/deadcode/commentedCodeScanner';

// =============================================================================
// isSingleLineComment
// =============================================================================

describe('isSingleLineComment', () => {
  it('detects // comments', () => {
    expect(isSingleLineComment('// this is a comment')).toBe(true);
    expect(isSingleLineComment('  // indented comment')).toBe(true);
    expect(isSingleLineComment('    //no space after slashes')).toBe(true);
  });

  it('rejects non-comment lines', () => {
    expect(isSingleLineComment('const x = 1;')).toBe(false);
    expect(isSingleLineComment('  const x = "// not a comment";')).toBe(false);
    expect(isSingleLineComment('')).toBe(false);
    expect(isSingleLineComment('   ')).toBe(false);
  });
});

// =============================================================================
// getBlockCommentState
// =============================================================================

describe('getBlockCommentState', () => {
  it('detects start of block comment', () => {
    const result = getBlockCommentState('/* start of block', false);
    expect(result.isComment).toBe(true);
    expect(result.newState).toBe(true);
  });

  it('detects single-line block comment', () => {
    const result = getBlockCommentState('/* single line */', false);
    expect(result.isComment).toBe(true);
    expect(result.newState).toBe(false);
  });

  it('detects middle of block comment', () => {
    const result = getBlockCommentState(' * middle line', true);
    expect(result.isComment).toBe(true);
    expect(result.newState).toBe(true);
  });

  it('detects end of block comment', () => {
    const result = getBlockCommentState(' */', true);
    expect(result.isComment).toBe(true);
    expect(result.newState).toBe(false);
  });

  it('returns false for non-comment lines', () => {
    const result = getBlockCommentState('const x = 1;', false);
    expect(result.isComment).toBe(false);
    expect(result.newState).toBe(false);
  });
});

// =============================================================================
// isSectionDivider
// =============================================================================

describe('isSectionDivider', () => {
  it('detects separator-title-separator pattern', () => {
    expect(isSectionDivider([
      '============================================',
      'CLI Execution',
      '============================================',
    ])).toBe(true);
  });

  it('detects blocks that are mostly separators', () => {
    expect(isSectionDivider([
      '--------------------------------------------',
      '============================================',
    ])).toBe(true);
  });

  it('detects dash separators', () => {
    expect(isSectionDivider([
      '---',
      'Section',
      '---',
    ])).toBe(true);
  });

  it('rejects non-divider blocks', () => {
    expect(isSectionDivider([
      'const x = 1;',
      'const y = 2;',
      'const z = 3;',
    ])).toBe(false);
  });

  it('handles empty input', () => {
    expect(isSectionDivider([])).toBe(false);
  });
});

// =============================================================================
// isDocumentationComment
// =============================================================================

describe('isDocumentationComment', () => {
  it('identifies JSDoc comments', () => {
    expect(isDocumentationComment([
      '/** This is a JSDoc comment',
      ' * @param name - The name',
      ' * @returns The result',
      ' */',
    ])).toBe(true);
  });

  it('identifies JSDoc tags in single-line comments', () => {
    expect(isDocumentationComment([
      '// @param name - The name',
      '// @returns The result',
      '// @throws Error if invalid',
    ])).toBe(true);
  });

  it('identifies section dividers as documentation', () => {
    expect(isDocumentationComment([
      '// ============================================',
      '// HERO SECTION COMPONENT',
      '// ============================================',
    ])).toBe(true);
  });

  it('identifies TODO/FIXME markers as documentation', () => {
    expect(isDocumentationComment([
      '// TODO: Refactor this function',
      '// It needs to handle edge cases',
      '// See issue #123',
    ])).toBe(true);
  });

  it('identifies prose comments as documentation', () => {
    expect(isDocumentationComment([
      '// This function handles the authentication flow',
      '// It checks the user credentials against the database',
      '// and returns a JWT token if successful',
    ])).toBe(true);
  });

  it('rejects commented-out code', () => {
    expect(isDocumentationComment([
      '// import { something } from "./module";',
      '// const result = await fetchData();',
      '// return result.data;',
    ])).toBe(false);
  });

  it('rejects commented-out variable declarations', () => {
    expect(isDocumentationComment([
      '// const orchestrator = new AnalysisOrchestrator();',
      '// const integrator = new SystemIntegrator();',
      '// const result = orchestrator.run();',
    ])).toBe(false);
  });

  it('handles empty input', () => {
    expect(isDocumentationComment([])).toBe(false);
  });
});

// =============================================================================
// countCodeIndicators / countProseIndicators
// =============================================================================

describe('countCodeIndicators', () => {
  it('counts code patterns', () => {
    const lines = [
      'const x = 1;',
      'function doSomething() {',
      'return result;',
    ];
    expect(countCodeIndicators(lines)).toBeGreaterThan(0);
  });

  it('returns 0 for prose', () => {
    const lines = [
      'This is a description of the module',
      'It handles user authentication',
      'See the documentation for more details',
    ];
    expect(countCodeIndicators(lines)).toBe(0);
  });

  it('detects method calls', () => {
    const lines = ['object.method(arg)'];
    expect(countCodeIndicators(lines)).toBeGreaterThan(0);
  });

  it('detects arrow functions', () => {
    const lines = ['const fn = () => value'];
    expect(countCodeIndicators(lines)).toBeGreaterThan(0);
  });
});

describe('countProseIndicators', () => {
  it('counts prose patterns', () => {
    const lines = [
      'This is a description of the module.',
      'The system should handle all edge cases.',
      'Users will be able to access their data.',
    ];
    expect(countProseIndicators(lines)).toBeGreaterThan(0);
  });

  it('returns 0 for code', () => {
    const lines = [
      'const x = 1;',
      'if (x > 0) {',
      'return x;',
    ];
    expect(countProseIndicators(lines)).toBe(0);
  });
});

// =============================================================================
// extractCommentedBlocks
// =============================================================================

describe('extractCommentedBlocks', () => {
  it('extracts consecutive single-line comment blocks', () => {
    const content = [
      'const a = 1;',
      '// commented line 1',
      '// commented line 2',
      '// commented line 3',
      'const b = 2;',
    ].join('\n');

    const blocks = extractCommentedBlocks('test.ts', content);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].startLine).toBe(2);
    expect(blocks[0].endLine).toBe(4);
    expect(blocks[0].lineCount).toBe(3);
  });

  it('ignores blocks smaller than 3 lines', () => {
    const content = [
      'const a = 1;',
      '// short comment',
      '// only two lines',
      'const b = 2;',
    ].join('\n');

    const blocks = extractCommentedBlocks('test.ts', content);
    expect(blocks).toHaveLength(0);
  });

  it('extracts multiple separate blocks', () => {
    const content = [
      '// block 1 line 1',
      '// block 1 line 2',
      '// block 1 line 3',
      'const a = 1;',
      '// block 2 line 1',
      '// block 2 line 2',
      '// block 2 line 3',
    ].join('\n');

    const blocks = extractCommentedBlocks('test.ts', content);
    expect(blocks).toHaveLength(2);
    expect(blocks[0].startLine).toBe(1);
    expect(blocks[0].endLine).toBe(3);
    expect(blocks[1].startLine).toBe(5);
    expect(blocks[1].endLine).toBe(7);
  });

  it('extracts block comments', () => {
    const content = [
      'const a = 1;',
      '/*',
      ' * line 1',
      ' * line 2',
      ' */',
      'const b = 2;',
    ].join('\n');

    const blocks = extractCommentedBlocks('test.ts', content);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].startLine).toBe(2);
    expect(blocks[0].endLine).toBe(5);
    expect(blocks[0].lineCount).toBe(4);
  });

  it('marks JSDoc blocks as documentation', () => {
    const content = [
      '/**',
      ' * This is a JSDoc comment',
      ' * @param x - The value',
      ' */',
      'function foo(x: number) {}',
    ].join('\n');

    const blocks = extractCommentedBlocks('test.ts', content);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].isDocComment).toBe(true);
  });

  it('marks commented-out code as non-documentation', () => {
    const content = [
      'const a = 1;',
      '// import { foo } from "./bar";',
      '// const result = foo();',
      '// return result.data;',
      'const b = 2;',
    ].join('\n');

    const blocks = extractCommentedBlocks('test.ts', content);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].isDocComment).toBe(false);
  });

  it('handles block at end of file', () => {
    const content = [
      'const a = 1;',
      '// end block line 1',
      '// end block line 2',
      '// end block line 3',
    ].join('\n');

    const blocks = extractCommentedBlocks('test.ts', content);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].endLine).toBe(4);
  });

  it('handles empty content', () => {
    const blocks = extractCommentedBlocks('test.ts', '');
    expect(blocks).toHaveLength(0);
  });

  it('handles file with no comments', () => {
    const content = [
      'const a = 1;',
      'const b = 2;',
      'export { a, b };',
    ].join('\n');

    const blocks = extractCommentedBlocks('test.ts', content);
    expect(blocks).toHaveLength(0);
  });
});

// =============================================================================
// scanCommentedCode (integration-level)
// =============================================================================

describe('scanCommentedCode', () => {
  it('returns DeadCodeItem[] with correct type', () => {
    const items = scanCommentedCode();
    for (const item of items) {
      expect(item.type).toBe('COMMENTED_CODE');
      expect(item.filePath).toBeDefined();
      expect(item.name).toMatch(/Commented block at lines \d+-\d+/);
      expect(item.evidence).toBeDefined();
      expect(typeof item.safeToRemove).toBe('boolean');
    }
  });

  it('returns items with valid file paths', () => {
    const items = scanCommentedCode();
    for (const item of items) {
      expect(item.filePath).not.toContain('node_modules');
      expect(item.filePath).not.toContain('.git');
    }
  });
});
