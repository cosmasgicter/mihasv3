import fs from 'fs';
import { glob } from 'glob';

const patterns = [
  // Backgrounds
  { from: /bg-white\s+dark:bg-gray-800/g, to: 'bg-card' },
  { from: /bg-gray-50\s+dark:bg-gray-900/g, to: 'bg-muted' },
  { from: /bg-gray-100\s+dark:bg-gray-800/g, to: 'bg-muted' },
  { from: /bg-blue-50\s+dark:bg-blue-950/g, to: 'bg-primary/5' },
  { from: /bg-green-50\s+dark:bg-green-950/g, to: 'bg-accent/10' },
  { from: /bg-red-50\s+dark:bg-red-950/g, to: 'bg-destructive/5' },
  { from: /bg-yellow-50\s+dark:bg-yellow-950/g, to: 'bg-accent/5' },
  { from: /bg-purple-50\s+dark:bg-purple-950/g, to: 'bg-secondary/5' },
  
  // Text colors
  { from: /text-gray-900\s+dark:text-white/g, to: 'text-foreground' },
  { from: /text-gray-900\s+dark:text-gray-100/g, to: 'text-foreground' },
  { from: /text-gray-800\s+dark:text-white/g, to: 'text-foreground' },
  { from: /text-gray-800\s+dark:text-gray-100/g, to: 'text-foreground' },
  { from: /text-gray-700\s+dark:text-gray-200/g, to: 'text-foreground' },
  { from: /text-gray-600\s+dark:text-gray-300/g, to: 'text-muted-foreground' },
  { from: /text-gray-600\s+dark:text-gray-400/g, to: 'text-muted-foreground' },
  { from: /text-gray-500\s+dark:text-gray-400/g, to: 'text-muted-foreground' },
  
  // Borders
  { from: /border-gray-200\s+dark:border-gray-700/g, to: 'border-border' },
  { from: /border-gray-200\s+dark:border-gray-800/g, to: 'border-border' },
  { from: /border-gray-300\s+dark:border-gray-600/g, to: 'border-border' },
  { from: /border-gray-300\s+dark:border-gray-700/g, to: 'border-border' },
  { from: /border-blue-200\s+dark:border-blue-800/g, to: 'border-primary/30' },
  { from: /border-green-200\s+dark:border-green-800/g, to: 'border-accent/30' },
  { from: /border-red-200\s+dark:border-red-800/g, to: 'border-destructive/30' },
  
  // Status backgrounds
  { from: /bg-green-100\s+dark:bg-green-900\/30/g, to: 'bg-accent/10' },
  { from: /bg-blue-100\s+dark:bg-blue-900\/30/g, to: 'bg-primary/10' },
  { from: /bg-red-100\s+dark:bg-red-900\/30/g, to: 'bg-destructive/10' },
  { from: /bg-yellow-100\s+dark:bg-yellow-900\/30/g, to: 'bg-accent/10' },
  { from: /bg-purple-100\s+dark:bg-purple-900\/30/g, to: 'bg-secondary/10' },
  { from: /bg-indigo-100\s+dark:bg-indigo-900\/30/g, to: 'bg-primary/10' },
  
  // Status text
  { from: /text-green-800\s+dark:text-green-200/g, to: 'text-accent-foreground' },
  { from: /text-blue-800\s+dark:text-blue-200/g, to: 'text-primary-foreground' },
  { from: /text-red-800\s+dark:text-red-200/g, to: 'text-destructive-foreground' },
  { from: /text-yellow-800\s+dark:text-yellow-200/g, to: 'text-accent-foreground' },
  { from: /text-purple-800\s+dark:text-purple-200/g, to: 'text-secondary-foreground' },
  
  // Hover states
  { from: /hover:bg-gray-100\s+dark:hover:bg-gray-800/g, to: 'hover:bg-muted' },
  { from: /hover:bg-gray-50\s+dark:hover:bg-gray-900/g, to: 'hover:bg-muted/50' },
  { from: /hover:bg-blue-50\s+dark:hover:bg-blue-950/g, to: 'hover:bg-primary/5' },
  
  // Focus states
  { from: /focus:border-blue-500\s+dark:focus:border-blue-400/g, to: 'focus:border-primary' },
  { from: /focus:ring-blue-500\s+dark:focus:ring-blue-400/g, to: 'focus:ring-ring' },
  
  // Standalone dark: classes (remove orphaned ones)
  { from: /\s+dark:text-white(?!\w)/g, to: '' },
  { from: /\s+dark:text-gray-100(?!\w)/g, to: '' },
  { from: /\s+dark:text-gray-200(?!\w)/g, to: '' },
  { from: /\s+dark:text-gray-300(?!\w)/g, to: '' },
  { from: /\s+dark:text-gray-400(?!\w)/g, to: '' },
  { from: /\s+dark:bg-gray-800(?!\w)/g, to: '' },
  { from: /\s+dark:bg-gray-900(?!\w)/g, to: '' },
  { from: /\s+dark:border-gray-700(?!\w)/g, to: '' },
  { from: /\s+dark:border-gray-800(?!\w)/g, to: '' },
  { from: /\s+dark:hover:bg-gray-700(?!\w)/g, to: '' },
  { from: /\s+dark:hover:bg-gray-800(?!\w)/g, to: '' },
];

const files = await glob('src/**/*.{tsx,ts}', {
  ignore: ['**/node_modules/**', '**/dist/**', '**/build/**']
});

let totalFiles = 0;
let totalReplacements = 0;

console.log('🚀 Starting complete dark mode migration...\n');

files.forEach(file => {
  let content = fs.readFileSync(file, 'utf8');
  let modified = false;
  let fileReplacements = 0;
  
  patterns.forEach(({ from, to }) => {
    const matches = content.match(from);
    if (matches) {
      content = content.replace(from, to);
      modified = true;
      fileReplacements += matches.length;
      totalReplacements += matches.length;
    }
  });
  
  if (modified) {
    fs.writeFileSync(file, content);
    totalFiles++;
    console.log(`✅ ${file} (${fileReplacements} replacements)`);
  }
});

console.log(`\n✨ Migration complete!`);
console.log(`📊 Files modified: ${totalFiles}`);
console.log(`🔄 Total replacements: ${totalReplacements}`);
