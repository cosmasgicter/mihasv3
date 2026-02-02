#!/usr/bin/env node
/**
 * API Bundler for Vercel Deployment
 * 
 * Bundles each API endpoint with its dependencies into a single file.
 * This solves the issue where Vercel's NFT can't trace imports from
 * outside the api/ directory at runtime.
 * 
 * Usage: bun run scripts/bundle-api.mjs
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.join(__dirname, '..');
const API_DIR = path.join(ROOT_DIR, 'api');

// Vercel Hobby plan limit
const MAX_FUNCTIONS = 12;

// External packages that Vercel will install (don't bundle these)
// These are npm packages that must be installed at runtime
const EXTERNALS = [
  '@vercel/node',           // Vercel runtime types
  '@neondatabase/serverless', // Database driver (dynamically imported)
  '@arcjet/node',           // Security service
  'arcjet',                 // Security core package
  'jose',                   // JWT library
  'bcryptjs',               // Password hashing (pure JS)
  'web-push',               // Push notifications
  'resend',                 // Email service
];

console.log('═══════════════════════════════════════════════════════════');
console.log('🔧 API Bundler for Vercel Deployment');
console.log('═══════════════════════════════════════════════════════════\n');

// Get all .ts files in api/ directory (excluding subdirectories and underscore files)
const allFiles = fs.readdirSync(API_DIR);
const apiFiles = allFiles
  .filter(f => f.endsWith('.ts') && !f.startsWith('_'))
  .filter(f => {
    const fullPath = path.join(API_DIR, f);
    return fs.statSync(fullPath).isFile();
  });

const skippedFiles = allFiles.filter(f => f.startsWith('_') && f.endsWith('.ts'));

console.log(`📁 API Directory: ${API_DIR}`);
console.log(`📦 Found ${apiFiles.length} endpoints to bundle`);
if (skippedFiles.length > 0) {
  console.log(`⏭️  Skipping ${skippedFiles.length} underscore files: ${skippedFiles.join(', ')}`);
}
console.log(`📚 External packages: ${EXTERNALS.length}`);
console.log('');

// Validate function count before bundling
if (apiFiles.length > MAX_FUNCTIONS) {
  console.error(`❌ ERROR: Found ${apiFiles.length} API files, but Vercel Hobby plan allows max ${MAX_FUNCTIONS}`);
  console.error('   Consider consolidating endpoints or upgrading to Pro plan.');
  process.exit(1);
}

console.log('───────────────────────────────────────────────────────────');
console.log('Bundling endpoints...\n');

const results = [];
let success = 0;
let failed = 0;

for (const file of apiFiles) {
  const inputPath = path.join(API_DIR, file);
  const outputPath = path.join(API_DIR, file.replace('.ts', '.bundle.js'));
  const finalPath = path.join(API_DIR, file.replace('.ts', '.js'));
  
  try {
    // Build external args for bun build command
    const externalsArgs = EXTERNALS.map(e => `--external "${e}"`).join(' ');
    
    // Bundle the file with Bun
    execSync(
      `bun build "${inputPath}" --outfile "${outputPath}" --target node --format esm ${externalsArgs}`,
      { stdio: 'pipe', cwd: ROOT_DIR }
    );
    
    // Verify the bundle was created
    if (!fs.existsSync(outputPath)) {
      throw new Error('Bundle file was not created');
    }
    
    // Read the bundled file and check size
    const stats = fs.statSync(outputPath);
    const sizeKB = (stats.size / 1024).toFixed(1);
    
    // Verify no ../lib/ imports remain in the bundle
    const bundleContent = fs.readFileSync(outputPath, 'utf-8');
    if (bundleContent.includes("from '../lib/") || bundleContent.includes('from "../lib/')) {
      console.warn(`   ⚠️  Warning: ${file} still contains ../lib/ imports after bundling`);
    }
    
    // Rename bundle to final .js file
    fs.renameSync(outputPath, finalPath);
    
    console.log(`✅ ${file.padEnd(20)} → ${file.replace('.ts', '.js').padEnd(20)} (${sizeKB.padStart(6)}KB)`);
    results.push({ file, outputPath: finalPath, sizeKB: parseFloat(sizeKB), success: true });
    success++;
  } catch (error) {
    const errorMsg = error.message || 'Unknown error';
    console.error(`❌ ${file.padEnd(20)} : ${errorMsg}`);
    results.push({ file, success: false, error: errorMsg });
    failed++;
    
    // Clean up partial bundle if it exists
    if (fs.existsSync(outputPath)) {
      fs.unlinkSync(outputPath);
    }
  }
}

// After bundling, delete .ts files so Vercel only sees .js files
console.log('\n───────────────────────────────────────────────────────────');
console.log('Removing TypeScript source files for Vercel deployment...\n');

for (const file of apiFiles) {
  const tsPath = path.join(API_DIR, file);
  
  if (fs.existsSync(tsPath)) {
    fs.unlinkSync(tsPath);
    console.log(`🗑️  Deleted ${file}`);
  }
}

console.log('\n───────────────────────────────────────────────────────────');
console.log('Summary\n');

// Calculate total bundle size
const totalSizeKB = results
  .filter(r => r.success)
  .reduce((sum, r) => sum + r.sizeKB, 0);

console.log(`📊 Results: ${success} bundled, ${failed} failed`);
console.log(`📦 Total bundle size: ${totalSizeKB.toFixed(1)}KB`);
console.log(`🔢 Function count: ${success}/${MAX_FUNCTIONS} (Vercel Hobby limit)`);

if (failed > 0) {
  console.log('\n❌ Build failed - some endpoints could not be bundled');
  console.log('   Failed files:');
  results.filter(r => !r.success).forEach(r => {
    console.log(`   - ${r.file}: ${r.error}`);
  });
  process.exit(1);
}

console.log('\n✅ All endpoints bundled successfully!');
console.log('═══════════════════════════════════════════════════════════\n');
