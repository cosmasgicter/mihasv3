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

// External packages that Vercel will install (don't bundle these)
const EXTERNALS = [
  '@vercel/node',
  '@neondatabase/serverless',
  '@arcjet/node',
  'jose',
  'bcrypt',
  'web-push',
  '@supabase/supabase-js',
  'resend',
];

// Get all .ts files in api/ directory (excluding subdirectories)
const apiFiles = fs.readdirSync(API_DIR)
  .filter(f => f.endsWith('.ts') && !f.startsWith('_'))
  .filter(f => {
    const fullPath = path.join(API_DIR, f);
    return fs.statSync(fullPath).isFile();
  });

console.log('🔧 Bundling API endpoints for Vercel...');
console.log(`   Found ${apiFiles.length} endpoints\n`);

let success = 0;
let failed = 0;

for (const file of apiFiles) {
  const inputPath = path.join(API_DIR, file);
  const outputPath = path.join(API_DIR, file.replace('.ts', '.bundle.js'));
  
  try {
    const externalsArgs = EXTERNALS.map(e => `--external "${e}"`).join(' ');
    
    execSync(
      `bun build "${inputPath}" --outfile "${outputPath}" --target node --format esm ${externalsArgs}`,
      { stdio: 'pipe', cwd: ROOT_DIR }
    );
    
    // Read the bundled file and check size
    const stats = fs.statSync(outputPath);
    const sizeKB = (stats.size / 1024).toFixed(1);
    
    // Replace original .ts with bundled .js
    const finalPath = path.join(API_DIR, file.replace('.ts', '.js'));
    fs.renameSync(outputPath, finalPath);
    
    // Remove original .ts file
    fs.unlinkSync(inputPath);
    
    console.log(`✅ ${file} → ${file.replace('.ts', '.js')} (${sizeKB}KB)`);
    success++;
  } catch (error) {
    console.error(`❌ ${file}: ${error.message}`);
    failed++;
  }
}

console.log(`\n📦 Done: ${success} bundled, ${failed} failed`);

if (failed > 0) {
  process.exit(1);
}
