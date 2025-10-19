import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const srcDir = path.join(__dirname, '..', 'src');
let filesModified = 0;
let logsRemoved = 0;

function removeConsoleLogs(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');
  const newLines = [];
  let removed = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    
    // Skip lines with console statements (except console.error in catch blocks)
    if (trimmed.startsWith('console.log(') || 
        trimmed.startsWith('console.info(') || 
        trimmed.startsWith('console.debug(') ||
        trimmed.startsWith('console.warn(')) {
      removed++;
      continue;
    }
    
    newLines.push(line);
  }

  if (removed > 0) {
    fs.writeFileSync(filePath, newLines.join('\n'));
    filesModified++;
    logsRemoved += removed;
    console.log(`✓ ${path.relative(srcDir, filePath)}: ${removed} logs removed`);
  }
}

function processDirectory(dir) {
  const files = fs.readdirSync(dir);
  
  for (const file of files) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    
    if (stat.isDirectory()) {
      processDirectory(filePath);
    } else if (/\.(ts|tsx)$/.test(file)) {
      removeConsoleLogs(filePath);
    }
  }
}

console.log('🧹 Removing console logs from source files...\n');
processDirectory(srcDir);
console.log(`\n✅ Modified ${filesModified} files`);
console.log(`🗑️  Removed ${logsRemoved} console statements`);
