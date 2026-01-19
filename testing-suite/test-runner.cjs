const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

// Configuration
const TEST_DIR = __dirname;
// Updated regex to catch .cjs files as well
const TEST_FILES_PATTERN = /.*\.test\.(js|cjs)$/;

async function runTests() {
  console.log('🚀 Starting Test Runner...');

  const files = fs.readdirSync(TEST_DIR);
  const testFiles = files.filter(file => TEST_FILES_PATTERN.test(file));

  if (testFiles.length === 0) {
    console.log('No test files found in', TEST_DIR);
    return;
  }

  console.log(`Found ${testFiles.length} test file(s).`);

  let passed = 0;
  let failed = 0;

  for (const file of testFiles) {
    console.log(`\nRunning ${file}...`);
    const filePath = path.join(TEST_DIR, file);

    try {
      await runScript(filePath);
      console.log(`✅ ${file} passed`);
      passed++;
    } catch (error) {
      console.error(`❌ ${file} failed`);
      console.error(error);
      failed++;
    }
  }

  console.log('\n==========================================');
  console.log(`Test Summary:`);
  console.log(`Total:  ${testFiles.length}`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  console.log('==========================================');

  if (failed > 0) {
    process.exit(1);
  }
}

function runScript(scriptPath) {
  return new Promise((resolve, reject) => {
    const child = spawn('node', [scriptPath], { stdio: 'inherit' });

    child.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Script exited with code ${code}`));
      }
    });

    child.on('error', (err) => {
      reject(err);
    });
  });
}

runTests().catch(err => {
  console.error('Test Runner Error:', err);
  process.exit(1);
});
