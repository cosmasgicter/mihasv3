#!/usr/bin/env node

// Simple test runner for RLS Policy Analysis
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const vitestPath = join(__dirname, 'node_modules', 'vitest', 'vitest.mjs');
const testFile = 'src/analysis/tests/RLSPolicyAnalysis.test.ts';

console.log('🧪 Running RLS Policy Analysis test...');

const child = spawn('node', [vitestPath, 'run', testFile], {
  stdio: 'inherit',
  cwd: __dirname
});

child.on('close', (code) => {
  console.log(`\n✅ Test completed with exit code: ${code}`);
  process.exit(code);
});

child.on('error', (error) => {
  console.error('❌ Error running test:', error);
  process.exit(1);
});