const fs = require('fs');
const path = require('path');

// Files to move
const moves = [
  // Performance docs
  { from: 'PERFORMANCE_CRITICAL_FIXES.md', to: 'docs/performance/PERFORMANCE_CRITICAL_FIXES.md' },
  { from: 'PERFORMANCE_FIX_FINAL.md', to: 'docs/performance/PERFORMANCE_FIX_FINAL.md' },
  { from: 'PERFORMANCE_OPTIMIZATION_COMPLETE.md', to: 'docs/performance/PERFORMANCE_OPTIMIZATION_COMPLETE.md' },
  { from: 'PERFORMANCE_QUICK_WINS.md', to: 'docs/performance/PERFORMANCE_QUICK_WINS.md' },
  { from: 'DEEP_OPTIMIZATION_COMPLETE.md', to: 'docs/performance/DEEP_OPTIMIZATION_COMPLETE.md' },
  { from: 'INSTANT_LOAD_COMPLETE.md', to: 'docs/performance/INSTANT_LOAD_COMPLETE.md' },
  { from: 'INSTANT_LOAD_STRATEGY.md', to: 'docs/performance/INSTANT_LOAD_STRATEGY.md' },
  { from: 'FINAL_PERFORMANCE_STATUS.md', to: 'docs/performance/FINAL_PERFORMANCE_STATUS.md' },
  { from: 'PATH_TO_100_ANALYSIS.md', to: 'docs/performance/PATH_TO_100_ANALYSIS.md' },
  
  // Deployment docs
  { from: 'DEPLOYMENT_CHECKLIST.md', to: 'docs/deployment/DEPLOYMENT_CHECKLIST.md' },
  { from: 'DEPLOYMENT_CHECKLIST_REALTIME_FIX.md', to: 'docs/deployment/DEPLOYMENT_CHECKLIST_REALTIME_FIX.md' },
  { from: 'DEPLOYMENT_INSTRUCTIONS.md', to: 'docs/deployment/DEPLOYMENT_INSTRUCTIONS.md' },
  { from: 'DEPLOY_REALTIME_FIX.bat', to: 'docs/deployment/DEPLOY_REALTIME_FIX.bat' },
  
  // Testing docs
  { from: 'task9-final-validation-report.md', to: 'docs/testing/task9-final-validation-report.md' },
  { from: 'task9-structure-validation.json', to: 'docs/testing/task9-structure-validation.json' },
  { from: 'task9-validation-report.json', to: 'docs/testing/task9-validation-report.json' },
];

// Files to delete
const deletes = [
  'node-installer.msi',
  'package.json.patch',
  'tailwind.config.optimized.js',
  'vite.config.production.optimized.ts',
];

console.log('🧹 Cleaning up root directory...\n');

// Move files
let moved = 0;
let failed = 0;

moves.forEach(({ from, to }) => {
  try {
    if (fs.existsSync(from)) {
      const dir = path.dirname(to);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.renameSync(from, to);
      console.log(`✓ Moved: ${from} → ${to}`);
      moved++;
    }
  } catch (error) {
    console.log(`✗ Failed: ${from} - ${error.message}`);
    failed++;
  }
});

// Delete files
let deleted = 0;

deletes.forEach(file => {
  try {
    if (fs.existsSync(file)) {
      fs.unlinkSync(file);
      console.log(`✓ Deleted: ${file}`);
      deleted++;
    }
  } catch (error) {
    console.log(`✗ Failed to delete: ${file} - ${error.message}`);
  }
});

console.log(`\n📊 Summary:`);
console.log(`   Moved: ${moved} files`);
console.log(`   Deleted: ${deleted} files`);
console.log(`   Failed: ${failed} operations`);
console.log(`\n✅ Root directory cleanup complete!`);
