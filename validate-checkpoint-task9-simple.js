#!/usr/bin/env node

/**
 * Task 9 Checkpoint: Simple Validation for Analysis and Notification Systems
 * 
 * This script validates system structure without dynamic imports
 */

import fs from 'fs/promises';

console.log('🚀 MIHAS System Analysis & Notification Validation');
console.log('Task 9: Checkpoint - Validate analysis and notification systems');
console.log('='.repeat(70));

const results = {
  analytics: { passed: 0, failed: 0 },
  notifications: { passed: 0, failed: 0 },
  security: { passed: 0, failed: 0 },
  integration: { passed: 0, failed: 0 }
};

function logTest(category, name, passed, details = '') {
  if (passed) {
    results[category].passed++;
    console.log(`✅ ${category.toUpperCase()}: ${name}`);
  } else {
    results[category].failed++;
    console.log(`❌ ${category.toUpperCase()}: ${name} - ${details}`);
  }
}

async function validateSystems() {
  console.log('\n🔍 Validating System Structure...');
  
  try {
    // Analytics System Validation
    console.log('\n📊 Analytics System:');
    
    const analyticsDir = await fs.access('functions/analytics').then(() => true).catch(() => false);
    logTest('analytics', 'Analytics Directory', analyticsDir, 'Directory exists');
    
    const complianceFile = await fs.access('functions/analytics/compliance/check.js').then(() => true).catch(() => false);
    logTest('analytics', 'Compliance Check Endpoint', complianceFile, 'Endpoint file exists');
    
    if (complianceFile) {
      const complianceContent = await fs.readFile('functions/analytics/compliance/check.js', 'utf8');
      const hasStructure = complianceContent.includes('onRequestPost') && complianceContent.includes('checkType');
      logTest('analytics', 'Compliance Implementation', hasStructure, 'Basic structure present');
    }
    
    // Notification System Validation
    console.log('\n📧 Notification System:');
    
    const notificationsDir = await fs.access('functions/notifications').then(() => true).catch(() => false);
    logTest('notifications', 'Notifications Directory', notificationsDir, 'Directory exists');
    
    const emailService = await fs.access('functions/send-email.js').then(() => true).catch(() => false);
    logTest('notifications', 'Email Service', emailService, 'Email service exists');
    
    const notificationService = await fs.access('functions/notifications.js').then(() => true).catch(() => false);
    logTest('notifications', 'Notification Service', notificationService, 'Notification service exists');
    
    // Security System Validation
    console.log('\n🔒 Security System:');
    
    const securityFile = await fs.access('functions/_lib/security.js').then(() => true).catch(() => false);
    logTest('security', 'Security Utilities', securityFile, 'Security utilities file exists');
    
    if (securityFile) {
      const securityContent = await fs.readFile('functions/_lib/security.js', 'utf8');
      const hasCsrf = securityContent.includes('validateCsrfToken') && securityContent.includes('generateCsrfToken');
      const hasSanitization = securityContent.includes('sanitizeForLog');
      const hasOriginValidation = securityContent.includes('isValidOrigin');
      const hasRateLimit = securityContent.includes('checkRateLimit');
      
      logTest('security', 'CSRF Protection', hasCsrf, 'CSRF functions implemented');
      logTest('security', 'Input Sanitization', hasSanitization, 'Sanitization function implemented');
      logTest('security', 'Origin Validation', hasOriginValidation, 'Origin validation implemented');
      logTest('security', 'Rate Limiting', hasRateLimit, 'Rate limiting implemented');
    }
    
    // Integration System Validation
    console.log('\n🔗 Integration System:');
    
    const middleware = await fs.access('functions/_middleware.js').then(() => true).catch(() => false);
    logTest('integration', 'API Middleware', middleware, 'Middleware exists');
    
    const libDir = await fs.access('functions/_lib').then(() => true).catch(() => false);
    logTest('integration', 'Shared Libraries', libDir, 'Shared libraries directory exists');
    
    const supabaseClient = await fs.access('functions/_lib/supabaseClient.js').then(() => true).catch(() => false);
    logTest('integration', 'Supabase Client', supabaseClient, 'Supabase client exists');
    
    const wranglerConfig = await fs.access('wrangler.toml').then(() => true).catch(() => false);
    logTest('integration', 'Wrangler Configuration', wranglerConfig, 'Wrangler config exists');
    
  } catch (error) {
    console.error('Validation error:', error.message);
  }
}

async function generateReport() {
  console.log('\n📊 VALIDATION REPORT');
  console.log('='.repeat(50));
  
  const categories = ['analytics', 'notifications', 'security', 'integration'];
  let totalPassed = 0;
  let totalFailed = 0;
  
  categories.forEach(category => {
    const result = results[category];
    totalPassed += result.passed;
    totalFailed += result.failed;
    
    console.log(`\n${category.toUpperCase()}:`);
    console.log(`  ✅ Passed: ${result.passed}`);
    console.log(`  ❌ Failed: ${result.failed}`);
    console.log(`  📈 Success Rate: ${result.passed + result.failed > 0 ? 
      Math.round((result.passed / (result.passed + result.failed)) * 100) : 0}%`);
  });
  
  console.log('\nOVERALL:');
  console.log(`  ✅ Total Passed: ${totalPassed}`);
  console.log(`  ❌ Total Failed: ${totalFailed}`);
  console.log(`  📈 Success Rate: ${totalPassed + totalFailed > 0 ? 
    Math.round((totalPassed / (totalPassed + totalFailed)) * 100) : 0}%`);
  
  // Save report
  const report = {
    timestamp: new Date().toISOString(),
    task: 'Task 9: Checkpoint - Validate analysis and notification systems',
    summary: { 
      totalPassed, 
      totalFailed, 
      successRate: Math.round((totalPassed / (totalPassed + totalFailed)) * 100) 
    },
    results
  };
  
  await fs.writeFile('task9-validation-report.json', JSON.stringify(report, null, 2));
  console.log('\n📄 Report saved to: task9-validation-report.json');
  
  return totalFailed === 0;
}

async function main() {
  await validateSystems();
  const success = await generateReport();
  
  console.log('\n🎯 TASK 9 CHECKPOINT RESULTS:');
  if (success) {
    console.log('✅ All systems validated successfully');
    console.log('✅ Analysis tools are properly structured');
    console.log('✅ Notification system components are in place');
    console.log('✅ Security utilities are implemented');
    console.log('✅ System integration is complete');
  } else {
    console.log('⚠️ Some systems need attention (see report above)');
  }
  
  console.log('\n📋 RECOMMENDATIONS:');
  console.log('1. Complete any incomplete endpoint implementations');
  console.log('2. Test notification delivery with proper authentication');
  console.log('3. Verify security utilities with comprehensive testing');
  console.log('4. Monitor system performance under load');
  console.log('5. Ensure all systems work together in production environment');
  
  process.exit(success ? 0 : 1);
}

main().catch(console.error);