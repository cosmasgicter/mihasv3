#!/usr/bin/env node

/**
 * MIHAS V3 - Navigation Fixes Verification Script
 * Verifies that all navigation components have proper test IDs and visibility fixes
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('🔍 Verifying Navigation Fixes...\n');

const componentsToCheck = [
  {
    file: 'src/components/student/NotificationBell.tsx',
    testIds: ['notification-bell', 'notifications-panel', 'unread-count'],
    fixes: ['z-50', 'visibility: visible', 'display: flex']
  },
  {
    file: 'src/components/ui/UserMenu.tsx', 
    testIds: ['user-menu-trigger', 'user-menu-dropdown'],
    fixes: ['z-50', 'visibility: visible', 'display: flex']
  },
  {
    file: 'src/components/ui/EnhancedMobileNavigation.tsx',
    testIds: ['mobile-nav-toggle', 'mobile-nav'],
    fixes: ['z-[9999]', 'visibility: visible', 'display: flex']
  },
  {
    file: 'src/components/ui/AuthenticatedNavigation.tsx',
    testIds: ['auth-nav-mobile-toggle', 'auth-nav-mobile-menu'],
    fixes: ['z-[10000]', 'visibility: visible', 'display: flex']
  }
];

let allPassed = true;

componentsToCheck.forEach(component => {
  console.log(`📁 Checking ${component.file}...`);
  
  const filePath = path.join(__dirname, component.file);
  
  if (!fs.existsSync(filePath)) {
    console.log(`❌ File not found: ${component.file}`);
    allPassed = false;
    return;
  }
  
  const content = fs.readFileSync(filePath, 'utf8');
  
  // Check for test IDs
  component.testIds.forEach(testId => {
    if (content.includes(`data-testid="${testId}"`)) {
      console.log(`✅ Test ID found: ${testId}`);
    } else {
      console.log(`❌ Missing test ID: ${testId}`);
      allPassed = false;
    }
  });
  
  // Check for visibility fixes
  component.fixes.forEach(fix => {
    if (content.includes(fix)) {
      console.log(`✅ Fix applied: ${fix}`);
    } else {
      console.log(`⚠️  Fix may be missing: ${fix}`);
    }
  });
  
  console.log('');
});

// Check CSS fixes
console.log('📁 Checking CSS fixes...');
const cssPath = path.join(__dirname, 'src/styles/mobile-enhancements.css');

if (fs.existsSync(cssPath)) {
  const cssContent = fs.readFileSync(cssPath, 'utf8');
  
  const criticalFixes = [
    'z-index: 9999',
    'visibility: visible',
    'data-testid*="nav"',
    'data-testid*="menu"',
    'data-testid*="notification"'
  ];
  
  criticalFixes.forEach(fix => {
    if (cssContent.includes(fix)) {
      console.log(`✅ CSS fix found: ${fix}`);
    } else {
      console.log(`⚠️  CSS fix may be missing: ${fix}`);
    }
  });
} else {
  console.log('❌ CSS file not found: src/styles/mobile-enhancements.css');
  allPassed = false;
}

console.log('\n' + '='.repeat(50));

if (allPassed) {
  console.log('✅ All navigation fixes verified successfully!');
  console.log('🚀 Ready for deployment.');
  process.exit(0);
} else {
  console.log('❌ Some fixes may be missing or incomplete.');
  console.log('🔧 Please review the issues above before deploying.');
  process.exit(1);
}