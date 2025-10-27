#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

const controllerPath = path.join(__dirname, '../src/pages/student/applicationWizard/hooks/useWizardController.ts');
check('useWizardController exists', fs.existsSync(controllerPath), 'File not found');

if (fs.existsSync(controllerPath)) {
  const content = fs.readFileSync(controllerPath, 'utf8');
  check('Mutations used directly', !content.includes('// Safe mutation wrappers'), 'Found wrapper code');
  check('createApplication mutation', content.includes('const createApplication = applicationsData.useCreate()'), 'Not found');
  check('updateApplication mutation', content.includes('const updateApplication = applicationsData.useUpdate()'), 'Not found');
  check('syncGrades mutation', content.includes('const syncGrades = applicationsData.useSyncGrades()'), 'Not found');
}

const dataPath = path.join(__dirname, '../src/data/applications.ts');
check('applications.ts exists', fs.existsSync(dataPath), 'File not found');

if (fs.existsSync(dataPath)) {
  const content = fs.readFileSync(dataPath, 'utf8');
  check('useCreate hook', content.includes('useCreate:'), 'Not found');
  check('useUpdate hook', content.includes('useUpdate:'), 'Not found');
  check('useSyncGrades hook', content.includes('useSyncGrades:'), 'Not found');
}

const smartFeaturesPath = path.join(__dirname, '../src/utils/smart-features.ts');
check('smart-features.ts exists', fs.existsSync(smartFeaturesPath), 'File not found');

const aiClientPath = path.join(__dirname, '../src/lib/cloudflareAI.ts');
check('cloudflareAI.ts exists', fs.existsSync(aiClientPath), 'File not found');

const aiEndpointPath = path.join(__dirname, '../functions/api/ai/analyze-document.js');
check('AI endpoint exists', fs.existsSync(aiEndpointPath), 'File not found');

const wranglerPath = path.join(__dirname, '../wrangler.toml');
if (fs.existsSync(wranglerPath)) {
  const content = fs.readFileSync(wranglerPath, 'utf8');
  check('AI binding configured', content.includes('[ai]') && content.includes('binding = "AI"'), 'Not found');
}

const wizardPath = path.join(__dirname, '../src/pages/student/applicationWizard/index.tsx');
check('Wizard index exists', fs.existsSync(wizardPath), 'File not found');

console.log('\n' + '='.repeat(50));
console.log(`✅ Passed: ${passed}`);
console.log(`❌ Failed: ${failed}`);
console.log('='.repeat(50));

if (failed === 0) {
  console.log('\n🎉 All checks passed! Application wizard is ready.');
  process.exit(0);
} else {
  console.log('\n⚠️  Some checks failed. Review issues above.');
  process.exit(1);
}
