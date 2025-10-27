#!/usr/bin/env node

/**
 * Application Wizard Validation Script
 * Checks that all critical components are properly configured
 */

const fs = require('fs');
const path = require('path');

const checks = [];
let passed = 0;
let failed = 0;

function check(name, condition, message) {
  checks.push({ name, condition, message });
  if (condition) {
    console.log(`✅ ${name}`);
    passed++;
  } else {
    console.log(`❌ ${name}: ${message}`);
    failed++;
  }
}

console.log('🔍 Validating Application Wizard...\n');

// Check 1: useWizardController exists
const controllerPath = path.join(__dirname, '../src/pages/student/applicationWizard/hooks/useWizardController.ts');
check(
  'useWizardController exists',
  fs.existsSync(controllerPath),
  'File not found'
);

// Check 2: No wrapper objects in mutations
if (fs.existsSync(controllerPath)) {
  const content = fs.readFileSync(controllerPath, 'utf8');
  check(
    'Mutations used directly (no wrappers)',
    !content.includes('// Safe mutation wrappers'),
    'Found wrapper code'
  );
  
  check(
    'createApplication mutation exists',
    content.includes('const createApplication = applicationsData.useCreate()'),
    'createApplication not found'
  );
  
  check(
    'updateApplication mutation exists',
    content.includes('const updateApplication = applicationsData.useUpdate()'),
    'updateApplication not found'
  );
  
  check(
    'syncGrades mutation exists',
    content.includes('const syncGrades = applicationsData.useSyncGrades()'),
    'syncGrades not found'
  );
}

// Check 3: applications.ts data layer
const dataPath = path.join(__dirname, '../src/data/applications.ts');
check(
  'applications.ts exists',
  fs.existsSync(dataPath),
  'File not found'
);

if (fs.existsSync(dataPath)) {
  const content = fs.readFileSync(dataPath, 'utf8');
  check(
    'useCreate hook defined',
    content.includes('useCreate:'),
    'useCreate not found'
  );
  
  check(
    'useUpdate hook defined',
    content.includes('useUpdate:'),
    'useUpdate not found'
  );
  
  check(
    'useSyncGrades hook defined',
    content.includes('useSyncGrades:'),
    'useSyncGrades not found'
  );
}

// Check 4: Smart features utility
const smartFeaturesPath = path.join(__dirname, '../src/utils/smart-features.ts');
check(
  'smart-features.ts exists',
  fs.existsSync(smartFeaturesPath),
  'File not found'
);

if (fs.existsSync(smartFeaturesPath)) {
  const content = fs.readFileSync(smartFeaturesPath, 'utf8');
  check(
    'AutoFillService class exists',
    content.includes('export class AutoFillService'),
    'AutoFillService not found'
  );
  
  check(
    'extractDataFromFile method exists',
    content.includes('extractDataFromFile'),
    'extractDataFromFile not found'
  );
}

// Check 5: AI integration
const aiClientPath = path.join(__dirname, '../src/lib/cloudflareAI.ts');
check(
  'cloudflareAI.ts exists',
  fs.existsSync(aiClientPath),
  'File not found'
);

const aiEndpointPath = path.join(__dirname, '../functions/api/ai/analyze-document.js');
check(
  'AI endpoint exists',
  fs.existsSync(aiEndpointPath),
  'File not found'
);

// Check 6: Wrangler config
const wranglerPath = path.join(__dirname, '../wrangler.toml');
if (fs.existsSync(wranglerPath)) {
  const content = fs.readFileSync(wranglerPath, 'utf8');
  check(
    'AI binding configured',
    content.includes('[ai]') && content.includes('binding = "AI"'),
    'AI binding not found in wrangler.toml'
  );
}

// Check 7: Application wizard index
const wizardPath = path.join(__dirname, '../src/pages/student/applicationWizard/index.tsx');
check(
  'Application wizard index exists',
  fs.existsSync(wizardPath),
  'File not found'
);

// Summary
console.log('\n' + '='.repeat(50));
console.log(`✅ Passed: ${passed}`);
console.log(`❌ Failed: ${failed}`);
console.log('='.repeat(50));

if (failed === 0) {
  console.log('\n🎉 All checks passed! Application wizard is ready.');
  process.exit(0);
} else {
  console.log('\n⚠️  Some checks failed. Please review the issues above.');
  process.exit(1);
}
