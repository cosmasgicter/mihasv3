import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const replacements = [
  // Backgrounds
  { from: /bg-white dark:bg-gray-800 dark:bg-gray-200/g, to: 'bg-card' },
  { from: /bg-white dark:bg-gray-800/g, to: 'bg-card' },
  { from: /bg-gray-50 dark:bg-gray-900/g, to: 'bg-muted' },
  { from: /bg-gray-100 dark:bg-gray-800/g, to: 'bg-accent' },
  
  // Text colors
  { from: /text-gray-900 dark:text-gray-100 dark:text-white/g, to: 'text-foreground' },
  { from: /text-gray-900 dark:text-gray-100/g, to: 'text-foreground' },
  { from: /text-gray-700 dark:text-gray-300/g, to: 'text-foreground' },
  { from: /text-gray-600 dark:text-gray-400/g, to: 'text-muted-foreground' },
  { from: /text-gray-500 dark:text-gray-400/g, to: 'text-muted-foreground' },
  { from: /text-gray-400 dark:text-gray-500/g, to: 'text-muted-foreground' },
  
  // Borders
  { from: /border-gray-200 dark:border-gray-700/g, to: 'border-border' },
  { from: /border-gray-300 dark:border-gray-600/g, to: 'border-input' },
  
  // Hover states
  { from: /hover:bg-gray-100 dark:hover:bg-gray-700/g, to: 'hover:bg-accent' },
  { from: /hover:bg-gray-50 dark:hover:bg-gray-800/g, to: 'hover:bg-accent' },
  
  // Primary colors
  { from: /bg-blue-600 dark:bg-blue-500/g, to: 'bg-primary' },
  { from: /text-blue-600 dark:text-blue-400/g, to: 'text-primary' },
  { from: /border-blue-600 dark:border-blue-400/g, to: 'border-primary' },
  
  // Destructive
  { from: /bg-red-600 dark:bg-red-500/g, to: 'bg-destructive' },
  { from: /text-red-600 dark:text-red-400/g, to: 'text-destructive' },
  
  // Ring focus
  { from: /focus:ring-blue-500 dark:focus:ring-blue-400/g, to: 'focus:ring-ring' },
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
    } else if (/\.(tsx|ts|jsx|js)$/.test(file)) {
      if (migrateFile(filePath)) {
        console.log(`✓ ${path.relative(process.cwd(), filePath)}`);
        filesChanged++;
      }
    }
  }
  
  return filesChanged;
}

const srcDir = path.join(__dirname, '..', 'src');
console.log('🚀 Starting dark mode migration...\n');
const total = processDirectory(srcDir);
console.log(`\n✅ Migrated ${total} files`);
