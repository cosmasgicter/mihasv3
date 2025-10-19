import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const replacements = [
  // Fix remaining gray text (light on light)
  { from: /text-gray-300/g, to: 'text-foreground' },
  { from: /text-gray-400/g, to: 'text-muted-foreground' },
  { from: /text-gray-500/g, to: 'text-muted-foreground' },
  { from: /text-gray-600/g, to: 'text-muted-foreground' },
  
  // Fix placeholder text
  { from: /placeholder:text-gray-400/g, to: 'placeholder:text-muted-foreground' },
  { from: /placeholder:text-gray-500/g, to: 'placeholder:text-muted-foreground' },
  
  // Fix remaining dark mode only patterns
  { from: /dark:text-gray-500/g, to: '' },
  { from: /dark:text-gray-400/g, to: '' },
  { from: /dark:text-gray-300/g, to: '' },
];

function migrateFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  let changed = false;
  
  replacements.forEach(({ from, to }) => {
    if (from.test(content)) {
      content = content.replace(from, to);
      changed = true;
    }
  });
  
  // Clean up double spaces
  content = content.replace(/  +/g, ' ');
  
  if (changed) {
    fs.writeFileSync(filePath, content);
    return true;
  }
  return false;
}

function processDirectory(dir) {
  let filesChanged = 0;
  const files = fs.readdirSync(dir);
  
  for (const file of files) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    
    if (stat.isDirectory() && !file.startsWith('.') && file !== 'node_modules') {
      filesChanged += processDirectory(filePath);
    } else if (/\.(tsx|ts)$/.test(file)) {
      if (migrateFile(filePath)) {
        console.log(`✓ ${path.relative(process.cwd(), filePath)}`);
        filesChanged++;
      }
    }
  }
  
  return filesChanged;
}

const srcDir = path.join(__dirname, '..', 'src');
console.log('🔍 Fixing all legibility issues...\n');
const total = processDirectory(srcDir);
console.log(`\n✅ Fixed ${total} files`);
