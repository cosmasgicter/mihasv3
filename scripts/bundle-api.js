#!/usr/bin/env node
/**
 * Bundle API functions with their dependencies
 * 
 * This script uses esbuild to bundle each API function with its
 * dependencies from lib/ into a single file. This ensures Vercel
 * can deploy the functions without module resolution issues.
 * 
 * Usage: node scripts/bundle-api.js
 */

const { build } = require('esbuild');
const fs = require('fs');
const path = require('path');

const API_DIR = path.join(__dirname, '..', 'api');
const OUTPUT_DIR = path.join(__dirname, '..', '.vercel', 'output', 'functions');

// Get all TypeScript files in api/ that should be functions
const apiFiles = fs.readdirSync(API_DIR)
  .filter(file => file.endsWith('.ts') && !file.startsWith('_') && !file.startsWith('.'))
  .filter(file => file !== 'tsconfig.json');

console.log('Bundling API functions:', apiFiles);

async function bundleAll() {
  for (const file of apiFiles) {
    const entryPoint = path.join(API_DIR, file);
    const functionName = file.replace('.ts', '');
    const outputDir = path.join(OUTPUT_DIR, `api/${functionName}.func`);
    
    // Create output directory
    fs.mkdirSync(outputDir, { recursive: true });
    
    try {
      await build({
        entryPoints: [entryPoint],
        bundle: true,
        platform: 'node',
        target: 'node20',
        format: 'esm',
        outfile: path.join(outputDir, 'index.js'),
        external: [
          // Don't bundle node built-ins
          'node:*',
          // Don't bundle Vercel runtime
          '@vercel/node',
        ],
        // Resolve lib/ imports
        alias: {
          '../lib': path.join(__dirname, '..', 'lib'),
        },
      });
      
      // Create .vc-config.json for the function
      fs.writeFileSync(
        path.join(outputDir, '.vc-config.json'),
        JSON.stringify({
          runtime: 'nodejs20.x',
          handler: 'index.default',
          launcherType: 'Nodejs',
        }, null, 2)
      );
      
      console.log(`✓ Bundled ${functionName}`);
    } catch (error) {
      console.error(`✗ Failed to bundle ${functionName}:`, error.message);
      process.exit(1);
    }
  }
}

bundleAll().then(() => {
  console.log('All API functions bundled successfully');
}).catch(error => {
  console.error('Bundle failed:', error);
  process.exit(1);
});
