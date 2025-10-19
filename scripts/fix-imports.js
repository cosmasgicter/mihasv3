#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const functionsDir = path.join(__dirname, '..', 'functions');

function getRelativePath(filePath) {
  const rel = path.relative(functionsDir, filePath);
  const depth = rel.split(path.sep).length - 1;
  return '../'.repeat(depth) + '_lib/supabaseClient.js';
}

function fixImports(dir) {
  const files = fs.readdirSync(dir);
  
  files.forEach(file => {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    
    if (stat.isDirectory() && !file.startsWith('_')) {
      fixImports(fullPath);
    } else if (file.endsWith('.js')) {
      let content = fs.readFileSync(fullPath, 'utf8');
      const correctPath = getRelativePath(fullPath);
      
      // Replace any _lib import with correct path
      const updated = content.replace(
        /from ['"]\.+\/_lib\/supabaseClient\.js['"]/g,
        `from '${correctPath}'`
      );
      
      if (updated !== content) {
        fs.writeFileSync(fullPath, updated);
        console.log(`✓ ${path.relative(functionsDir, fullPath)} -> ${correctPath}`);
      }
    }
  });
}

fixImports(functionsDir);
console.log('\n✅ Import paths fixed');
