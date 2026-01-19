const assert = require('assert');

console.log('Running Smoke Test...');

try {
  // Basic Logic Check
  assert.strictEqual(1 + 1, 2, 'Math should still work');
  console.log('✓ Basic math check passed');

  // Verify Environment Variables
  // Note: Standard env vars might not be loaded if we don't use dotenv,
  // but let's check if NODE_VERSION is available (often set in CI/CD) or just assume process.env exists.
  assert.ok(process.env, 'Environment variables should exist');
  console.log('✓ Environment check passed');

  // Check if critical files exist
  const fs = require('fs');
  const path = require('path');
  const rootDir = path.resolve(__dirname, '..');

  const requiredFiles = [
    'package.json',
    'vite.config.local.ts',
    'src/main.tsx', // Assuming this is the entry point
    'index.html'
  ];

  requiredFiles.forEach(file => {
    const filePath = path.join(rootDir, file);
    assert.ok(fs.existsSync(filePath), `File ${file} should exist`);
    console.log(`✓ File check: ${file} exists`);
  });

  console.log('Smoke Test Completed Successfully');
} catch (error) {
  console.error('Smoke Test Failed:', error.message);
  process.exit(1);
}
