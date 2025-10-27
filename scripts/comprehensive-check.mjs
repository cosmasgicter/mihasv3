#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let passed = 0;
let failed = 0;

function check(name, condition, message) {
  if (condition) {
    console.log(`✅ ${name}`);
    passed++;
  } else {
    console.log(`❌ ${name}: ${message}`);
    failed++;
  }
}

console.log('🔍 Comprehensive Application Wizard Check...\n');

// 1. Core files exist
const coreFiles = [
  'src/pages/student/applicationWizard/index.tsx',
  'src/pages/student/applicationWizard/hooks/useWizardController.ts',
  'src/pages/student/applicationWizard/hooks/useApplicationFileUploads.ts',
  'src/pages/student/applicationWizard/steps/BasicKycStep.tsx',
  'src/pages/student/applicationWizard/steps/EducationStep.tsx',
  'src/pages/student/applicationWizard/steps/PaymentStep.tsx',
  'src/pages/student/applicationWizard/steps/SubmitStep.tsx',
  'src/data/applications.ts',
  'src/utils/smart-features.ts',
  'src/lib/cloudflareAI.ts'
];

coreFiles.forEach(file => {
  const fullPath = path.join(__dirname, '..', file);
  check(`File exists: ${file}`, fs.existsSync(fullPath), 'Not found');
});

// 2. Check mutations are correct
const controllerPath = path.join(__dirname, '../src/pages/student/applicationWizard/hooks/useWizardController.ts');
if (fs.existsSync(controllerPath)) {
  const content = fs.readFileSync(controllerPath, 'utf8');
  
  check('No mutation wrappers', !content.includes('// Safe mutation wrappers'), 'Found wrappers');
  check('createApplication direct', content.includes('const createApplication = applicationsData.useCreate()'), 'Not direct');
  check('updateApplication direct', content.includes('const updateApplication = applicationsData.useUpdate()'), 'Not direct');
  check('syncGrades direct', content.includes('const syncGrades = applicationsData.useSyncGrades()'), 'Not direct');
  check('Auto-extract callback', content.includes('baseHandleResultSlipUpload(event, async (file, url)'), 'Missing callback');
}

// 3. Check EducationStep has notification
const educationPath = path.join(__dirname, '../src/pages/student/applicationWizard/steps/EducationStep.tsx');
if (fs.existsSync(educationPath)) {
  const content = fs.readFileSync(educationPath, 'utf8');
  check('Auto-fill notification', content.includes('Auto-fill enabled'), 'Missing notification');
  check('Upload progress indicator', content.includes('uploadProgress'), 'Missing progress');
}

// 4. Check file upload types
const uploadsPath = path.join(__dirname, '../src/pages/student/applicationWizard/hooks/useApplicationFileUploads.ts');
if (fs.existsSync(uploadsPath)) {
  const content = fs.readFileSync(uploadsPath, 'utf8');
  check('Upload callback type', content.includes('onUploadComplete?: (file: File, url: string) => void'), 'Wrong type');
  check('Auto-upload logic', content.includes('if (file && applicationId)'), 'Missing auto-upload');
}

// 5. Check no TODOs or FIXMEs
const wizardDir = path.join(__dirname, '../src/pages/student/applicationWizard');
let hasTodos = false;
function checkTodos(dir) {
  const files = fs.readdirSync(dir);
  files.forEach(file => {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory() && !file.startsWith('.')) {
      checkTodos(fullPath);
    } else if (file.endsWith('.ts') || file.endsWith('.tsx')) {
      const content = fs.readFileSync(fullPath, 'utf8');
      if (content.match(/TODO|FIXME|HACK|XXX/)) {
        hasTodos = true;
      }
    }
  });
}
checkTodos(wizardDir);
check('No TODO/FIXME comments', !hasTodos, 'Found TODO/FIXME');

// 6. Check all steps are imported
const indexPath = path.join(__dirname, '../src/pages/student/applicationWizard/index.tsx');
if (fs.existsSync(indexPath)) {
  const content = fs.readFileSync(indexPath, 'utf8');
  check('BasicKycStep imported', content.includes('BasicKycStep'), 'Not imported');
  check('EducationStep imported', content.includes('EducationStep'), 'Not imported');
  check('PaymentStep imported', content.includes('PaymentStep'), 'Not imported');
  check('SubmitStep imported', content.includes('SubmitStep'), 'Not imported');
}

// 7. Check error handling
if (fs.existsSync(controllerPath)) {
  const content = fs.readFileSync(controllerPath, 'utf8');
  check('Try-catch blocks', content.includes('try {') && content.includes('catch'), 'Missing error handling');
  check('Error logging', content.includes('console.error'), 'No error logging');
}

// 8. Check validation
check('Validation script exists', fs.existsSync(path.join(__dirname, 'validate-wizard.mjs')), 'Not found');

console.log('\n' + '='.repeat(50));
console.log(`✅ Passed: ${passed}`);
console.log(`❌ Failed: ${failed}`);
console.log('='.repeat(50));

if (failed === 0) {
  console.log('\n🎉 All comprehensive checks passed!');
  process.exit(0);
} else {
  console.log('\n⚠️  Some checks failed.');
  process.exit(1);
}
