#!/usr/bin/env node
/**
 * Basic security audit script
 * Checks for common security issues
 */

import fs from 'fs';
import path from 'path';

const issues = [];
const warnings = [];

function checkFile(filePath, content) {
  // Check for hardcoded credentials
  if (content.match(/password\s*=\s*['"][^'"]+['"]/i)) {
    issues.push(`${filePath}: Hardcoded password found`);
  }
  if (content.match(/api[_-]?key\s*=\s*['"][^'"]+['"]/i) && !filePath.includes('.env')) {
    issues.push(`${filePath}: Hardcoded API key found`);
  }
  if (content.match(/secret\s*=\s*['"][^'"]+['"]/i)) {
    issues.push(`${filePath}: Hardcoded secret found`);
  }

  // Check for SQL injection risks
  if (content.match(/\$\{.*\}.*FROM|FROM.*\$\{.*\}/)) {
    warnings.push(`${filePath}: Potential SQL injection risk (template literals in query)`);
  }

  // Check for eval usage
  if (content.match(/\beval\s*\(/)) {
    issues.push(`${filePath}: eval() usage detected`);
  }

  // Check for dangerouslySetInnerHTML
  if (content.match(/dangerouslySetInnerHTML/)) {
    warnings.push(`${filePath}: dangerouslySetInnerHTML usage (XSS risk)`);
  }

  // Check for console.log in production code
  if (content.match(/console\.(log|debug|info)\(/) && !filePath.includes('test')) {
    warnings.push(`${filePath}: console.log in production code`);
  }
}

function scanDirectory(dir, extensions = ['.ts', '.tsx', '.js', '.jsx']) {
  const files = fs.readdirSync(dir);
  
  for (const file of files) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    
    if (stat.isDirectory()) {
      if (!['node_modules', 'dist', 'build', '.git'].includes(file)) {
        scanDirectory(filePath, extensions);
      }
    } else if (extensions.some(ext => file.endsWith(ext))) {
      const content = fs.readFileSync(filePath, 'utf8');
      checkFile(filePath, content);
    }
  }
}

console.log('🔒 MIHAS V3 Security Audit\n');

// Check environment files
console.log('1. Checking environment configuration...');
const envFiles = ['.env', '.env.local', '.env.production'];
let envSecure = true;
for (const envFile of envFiles) {
  if (fs.existsSync(envFile)) {
    const content = fs.readFileSync(envFile, 'utf8');
    if (content.includes('localhost') && envFile.includes('production')) {
      warnings.push(`${envFile}: Contains localhost in production config`);
      envSecure = false;
    }
  }
}
console.log(envSecure ? '   ✅ Environment files secure' : '   ⚠️  Environment issues found');

// Check source code
console.log('\n2. Scanning source code...');
scanDirectory('src');
console.log(`   Scanned src/ directory`);

// Check functions
console.log('\n3. Scanning API functions...');
if (fs.existsSync('functions')) {
  scanDirectory('functions');
  console.log(`   Scanned functions/ directory`);
}

// Check dependencies
console.log('\n4. Checking dependencies...');
const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };
console.log(`   ✅ ${Object.keys(deps).length} dependencies found`);
console.log('   ℹ️  Run "npm audit" for vulnerability check');

// Report results
console.log('\n📊 Audit Results:');
console.log(`Critical Issues: ${issues.length}`);
console.log(`Warnings: ${warnings.length}`);

if (issues.length > 0) {
  console.log('\n❌ Critical Issues:');
  issues.forEach(issue => console.log(`  - ${issue}`));
}

if (warnings.length > 0) {
  console.log('\n⚠️  Warnings:');
  warnings.slice(0, 10).forEach(warning => console.log(`  - ${warning}`));
  if (warnings.length > 10) {
    console.log(`  ... and ${warnings.length - 10} more`);
  }
}

if (issues.length === 0 && warnings.length === 0) {
  console.log('\n✅ No security issues found');
}

console.log('\n📋 Recommendations:');
console.log('1. Run "npm audit fix" to update vulnerable dependencies');
console.log('2. Enable HTTPS in production');
console.log('3. Set up rate limiting on API endpoints');
console.log('4. Enable CORS restrictions');
console.log('5. Review RLS policies in Supabase');
console.log('6. Set up monitoring and alerts');

process.exit(issues.length > 0 ? 1 : 0);
