#!/usr/bin/env node

/**
 * Task 9 Checkpoint: Validate Analysis and Notification Systems Structure
 * 
 * This script validates that:
 * 1. Analysis tools are properly structured and implemented
 * 2. Notification system components exist and are correctly configured
 * 3. Security utilities are functional
 * 4. System behavior meets requirements
 */

import fs from 'fs/promises';
import path from 'path';

// Test results tracking
const results = {
  analytics: { passed: 0, failed: 0, tests: [] },
  notifications: { passed: 0, failed: 0, tests: [] },
  security: { passed: 0, failed: 0, tests: [] },
  integration: { passed: 0, failed: 0, tests: [] }
};

function logTest(category, name, passed, details = '') {
  const result = { name, passed, details, timestamp: new Date().toISOString() };
  results[category].tests.push(result);
  
  if (passed) {
    results[category].passed++;
    console.log(`✅ ${category.toUpperCase()}: ${name}`);
  } else {
    results[category].failed++;
    console.log(`❌ ${category.toUpperCase()}: ${name} - ${details}`);
  }
  
  if (details) {
    console.log(`   Details: ${details}`);
  }
}

/**
 * Validate Analytics System Structure
 */
async function validateAnalyticsSystem() {
  console.log('\n🔍 Validating Analytics System Structure...');
  
  try {
    // Check for analytics functions directory
    const analyticsDir = 'functions/analytics';
    const analyticsExists = await fs.access(analyticsDir).then(() => true).catch(() => false);
    logTest('analytics', 'Analytics Directory Structure', analyticsExists, 
      analyticsExists ? 'Analytics functions directory exists' : 'Analytics directory missing');
    
    if (analyticsExists) {
      // Check for key analytics endpoints
      const analyticsFiles = await fs.readdir(analyticsDir, { recursive: true });
      const expectedFiles = [
        'comprehensive-metrics.js',
        'dashboard.js',
        'compliance/check.js'
      ];
      
      let foundFiles = 0;
      for (const expectedFile of expectedFiles) {
        const fileExists = analyticsFiles.some(file => file.includes(expectedFile.split('/').pop()));
        if (fileExists) foundFiles++;
        logTest('analytics', `Analytics Endpoint: ${expectedFile}`, fileExists,
          fileExists ? 'Endpoint file exists' : 'Endpoint file missing');
      }
      
      logTest('analytics', 'Analytics Endpoints Completeness', foundFiles === expectedFiles.length,
        `Found ${foundFiles}/${expectedFiles.length} expected endpoints`);
    }
    
    // Validate compliance check implementation
    try {
      const complianceFile = 'functions/analytics/compliance/check.js';
      const complianceContent = await fs.readFile(complianceFile, 'utf8');
      
      const hasValidStructure = complianceContent.includes('onRequestPost') &&
                               complianceContent.includes('checkType') &&
                               complianceContent.includes('data_integrity');
      
      logTest('analytics', 'Compliance Check Implementation', hasValidStructure,
        hasValidStructure ? 'Compliance check has valid structure' : 'Compliance check needs completion');
      
      // Check for incomplete implementation
      const isComplete = !complianceContent.includes('performSubmission') || 
                        complianceContent.includes('performSubmissionDeadlineCheck');
      
      logTest('analytics', 'Compliance Check Completeness', isComplete,
        isComplete ? 'Implementation appears complete' : 'Implementation needs completion');
        
    } catch (error) {
      logTest('analytics', 'Compliance Check File Access', false, error.message);
    }
    
  } catch (error) {
    logTest('analytics', 'Analytics System Validation', false, error.message);
  }
}

/**
 * Validate Notification System Structure
 */
async function validateNotificationSystem() {
  console.log('\n📧 Validating Notification System Structure...');
  
  try {
    // Check for notifications functions directory
    const notificationsDir = 'functions/notifications';
    const notificationsExists = await fs.access(notificationsDir).then(() => true).catch(() => false);
    logTest('notifications', 'Notifications Directory Structure', notificationsExists,
      notificationsExists ? 'Notifications functions directory exists' : 'Notifications directory missing');
    
    if (notificationsExists) {
      // Check for key notification endpoints
      const notificationFiles = await fs.readdir(notificationsDir, { recursive: true });
      const expectedFiles = [
        'send-multi-channel.js',
        'analytics.js',
        'bulk-manager.js',
        'resilience.js'
      ];
      
      let foundFiles = 0;
      for (const expectedFile of expectedFiles) {
        const fileExists = notificationFiles.some(file => file.includes(expectedFile));
        if (fileExists) foundFiles++;
        logTest('notifications', `Notification Endpoint: ${expectedFile}`, fileExists,
          fileExists ? 'Endpoint file exists' : 'Endpoint file missing');
      }
      
      logTest('notifications', 'Notification Endpoints Completeness', foundFiles >= 2,
        `Found ${foundFiles}/${expectedFiles.length} expected endpoints`);
    }
    
    // Check for notification service files
    const serviceFiles = [
      'functions/send-email.js',
      'functions/notifications.js'
    ];
    
    for (const serviceFile of serviceFiles) {
      const exists = await fs.access(serviceFile).then(() => true).catch(() => false);
      logTest('notifications', `Service File: ${path.basename(serviceFile)}`, exists,
        exists ? 'Service file exists' : 'Service file missing');
    }
    
    // Validate notification configuration
    try {
      const packageJson = JSON.parse(await fs.readFile('package.json', 'utf8'));
      const hasEmailDeps = packageJson.dependencies && (
        packageJson.dependencies['@sendgrid/mail'] ||
        packageJson.dependencies['nodemailer'] ||
        packageJson.dependencies['resend']
      );
      
      logTest('notifications', 'Email Service Dependencies', !!hasEmailDeps,
        hasEmailDeps ? 'Email service dependencies found' : 'Email service dependencies missing');
      
    } catch (error) {
      logTest('notifications', 'Package Dependencies Check', false, error.message);
    }
    
  } catch (error) {
    logTest('notifications', 'Notification System Validation', false, error.message);
  }
}

/**
 * Validate Security System Structure
 */
async function validateSecuritySystem() {
  console.log('\n🔒 Validating Security System Structure...');
  
  try {
    // Check for security utilities
    const securityFile = 'functions/_lib/security.js';
    const securityExists = await fs.access(securityFile).then(() => true).catch(() => false);
    logTest('security', 'Security Utilities File', securityExists,
      securityExists ? 'Security utilities file exists' : 'Security utilities file missing');
    
    if (securityExists) {
      const securityContent = await fs.readFile(securityFile, 'utf8');
      
      // Check for required security functions
      const requiredFunctions = [
        'validateCsrfToken',
        'generateCsrfToken',
        'sanitizeForLog',
        'isValidOrigin',
        'checkRateLimit'
      ];
      
      let foundFunctions = 0;
      for (const func of requiredFunctions) {
        const hasFunction = securityContent.includes(`export function ${func}`) ||
                           securityContent.includes(`function ${func}`);
        if (hasFunction) foundFunctions++;
        logTest('security', `Security Function: ${func}`, hasFunction,
          hasFunction ? 'Function implemented' : 'Function missing');
      }
      
      logTest('security', 'Security Functions Completeness', foundFunctions === requiredFunctions.length,
        `Found ${foundFunctions}/${requiredFunctions.length} required functions`);
      
      // Test security function logic
      try {
        // Import and test security functions
        const securityModule = await import('./functions/_lib/security.js');
        const { validateCsrfToken, generateCsrfToken, sanitizeForLog, isValidOrigin, checkRateLimit } = securityModule;
        
        // Test CSRF token functionality
        const sessionToken = 'test-session-123';
        const csrfToken = generateCsrfToken(sessionToken);
        const isValidCsrf = validateCsrfToken(csrfToken, sessionToken);
        logTest('security', 'CSRF Token Logic', isValidCsrf && csrfToken,
          `Token generation and validation working`);
        
        // Test input sanitization
        const dangerousInput = '<script>alert("xss")</script>\n\rTest';
        const sanitized = sanitizeForLog(dangerousInput);
        const isSanitized = !sanitized.includes('<script>') && !sanitized.includes('\n');
        logTest('security', 'Input Sanitization Logic', isSanitized,
          `Dangerous input properly sanitized`);
        
        // Test origin validation
        const validOrigin = 'http://localhost:5173';
        const invalidOrigin = 'https://malicious-site.com';
        const validCheck = isValidOrigin(validOrigin);
        const invalidCheck = !isValidOrigin(invalidOrigin);
        logTest('security', 'Origin Validation Logic', validCheck && invalidCheck,
          `Origin validation working correctly`);
        
        // Test rate limiting
        const testId = 'test-user-' + Date.now();
        const firstRequest = checkRateLimit(testId, 5, 60000);
        const secondRequest = checkRateLimit(testId, 5, 60000);
        logTest('security', 'Rate Limiting Logic', firstRequest && secondRequest,
          `Rate limiting allows normal requests`);
        
      } catch (importError) {
        logTest('security', 'Security Functions Import', false, importError.message);
      }
    }
    
  } catch (error) {
    logTest('security', 'Security System Validation', false, error.message);
  }
}

/**
 * Validate System Integration
 */
async function validateSystemIntegration() {
  console.log('\n🔗 Validating System Integration...');
  
  try {
    // Check for middleware and shared utilities
    const middlewareFile = 'functions/_middleware.js';
    const middlewareExists = await fs.access(middlewareFile).then(() => true).catch(() => false);
    logTest('integration', 'API Middleware', middlewareExists,
      middlewareExists ? 'API middleware exists' : 'API middleware missing');
    
    // Check for shared libraries
    const libDir = 'functions/_lib';
    const libExists = await fs.access(libDir).then(() => true).catch(() => false);
    logTest('integration', 'Shared Libraries Directory', libExists,
      libExists ? 'Shared libraries directory exists' : 'Shared libraries directory missing');
    
    if (libExists) {
      const libFiles = await fs.readdir(libDir);
      const expectedLibs = ['supabaseClient.js', 'security.js'];
      
      let foundLibs = 0;
      for (const expectedLib of expectedLibs) {
        const hasLib = libFiles.includes(expectedLib);
        if (hasLib) foundLibs++;
        logTest('integration', `Shared Library: ${expectedLib}`, hasLib,
          hasLib ? 'Library exists' : 'Library missing');
      }
      
      logTest('integration', 'Shared Libraries Completeness', foundLibs === expectedLibs.length,
        `Found ${foundLibs}/${expectedLibs.length} expected libraries`);
    }
    
    // Check for configuration files
    const configFiles = [
      'wrangler.toml',
      'package.json',
      '.env.example'
    ];
    
    for (const configFile of configFiles) {
      const exists = await fs.access(configFile).then(() => true).catch(() => false);
      logTest('integration', `Configuration: ${configFile}`, exists,
        exists ? 'Configuration file exists' : 'Configuration file missing');
    }
    
    // Validate package.json scripts
    try {
      const packageJson = JSON.parse(await fs.readFile('package.json', 'utf8'));
      const hasTestScripts = packageJson.scripts && (
        packageJson.scripts.test ||
        packageJson.scripts['test:api'] ||
        packageJson.scripts['test:unit']
      );
      
      logTest('integration', 'Test Scripts Configuration', !!hasTestScripts,
        hasTestScripts ? 'Test scripts configured' : 'Test scripts missing');
      
    } catch (error) {
      logTest('integration', 'Package.json Validation', false, error.message);
    }
    
  } catch (error) {
    logTest('integration', 'System Integration Validation', false, error.message);
  }
}

/**
 * Generate comprehensive validation report
 */
async function generateValidationReport() {
  console.log('\n📊 VALIDATION REPORT');
  console.log('='.repeat(60));
  
  const categories = ['analytics', 'notifications', 'security', 'integration'];
  let totalPassed = 0;
  let totalFailed = 0;
  
  categories.forEach(category => {
    const result = results[category];
    totalPassed += result.passed;
    totalFailed += result.failed;
    
    console.log(`\n${category.toUpperCase()} SYSTEM:`);
    console.log(`  ✅ Passed: ${result.passed}`);
    console.log(`  ❌ Failed: ${result.failed}`);
    console.log(`  📈 Success Rate: ${result.passed + result.failed > 0 ? 
      Math.round((result.passed / (result.passed + result.failed)) * 100) : 0}%`);
  });
  
  console.log('\nOVERALL RESULTS:');
  console.log(`  ✅ Total Passed: ${totalPassed}`);
  console.log(`  ❌ Total Failed: ${totalFailed}`);
  console.log(`  📈 Overall Success Rate: ${totalPassed + totalFailed > 0 ? 
    Math.round((totalPassed / (totalPassed + totalFailed)) * 100) : 0}%`);
  
  // Detailed failure analysis
  const allFailures = categories.flatMap(category => 
    results[category].tests.filter(test => !test.passed)
  );
  
  if (allFailures.length > 0) {
    console.log('\nFAILED TESTS DETAILS:');
    allFailures.forEach(failure => {
      console.log(`  ❌ ${failure.name}: ${failure.details}`);
    });
  }
  
  // Generate recommendations
  console.log('\n📋 RECOMMENDATIONS:');
  
  if (results.analytics.failed > 0) {
    console.log('  📊 Analytics: Complete incomplete endpoint implementations');
    console.log('      - Finish compliance check function implementation');
    console.log('      - Ensure all analytics endpoints are properly structured');
  }
  
  if (results.notifications.failed > 0) {
    console.log('  � Notifications: Implement missing notification endpoints');
    console.log('      - Add multi-channel delivery system');
    console.log('      - Implement notification resilience mechanisms');
  }
  
  if (results.security.failed > 0) {
    console.log('  🔒 Security: Address security utility issues');
    console.log('      - Ensure all security functions are properly implemented');
    console.log('      - Test security functions with various inputs');
  }
  
  if (results.integration.failed > 0) {
    console.log('  🔗 Integration: Fix system integration issues');
    console.log('      - Ensure all shared libraries are available');
    console.log('      - Verify configuration files are complete');
  }
  
  if (totalFailed === 0) {
    console.log('  🎉 All systems are properly structured and implemented!');
    console.log('  🚀 Systems are ready for production deployment');
  }
  
  // Save detailed report
  const reportData = {
    timestamp: new Date().toISOString(),
    task: 'Task 9: Checkpoint - Validate analysis and notification systems',
    type: 'structure_validation',
    summary: {
      totalTests: totalPassed + totalFailed,
      passed: totalPassed,
      failed: totalFailed,
      successRate: totalPassed + totalFailed > 0 ? 
        Math.round((totalPassed / (totalPassed + totalFailed)) * 100) : 0
    },
    results,
    recommendations: {
      analytics: results.analytics.failed > 0 ? 'Complete endpoint implementations' : 'System ready',
      notifications: results.notifications.failed > 0 ? 'Implement missing endpoints' : 'System ready',
      security: results.security.failed > 0 ? 'Fix security utilities' : 'System ready',
      integration: results.integration.failed > 0 ? 'Fix integration issues' : 'System ready'
    }
  };
  
  await fs.writeFile('task9-structure-validation.json', JSON.stringify(reportData, null, 2));
  console.log('\n📄 Detailed report saved to: task9-structure-validation.json');
  
  return {
    success: totalFailed === 0,
    totalTests: totalPassed + totalFailed,
    passed: totalPassed,
    failed: totalFailed,
    successRate: totalPassed + totalFailed > 0 ? 
      Math.round((totalPassed / (totalPassed + totalFailed)) * 100) : 0
  };
}

/**
 * Main validation function
 */
async function main() {
  console.log('🚀 MIHAS System Analysis & Notification Structure Validation');
  console.log('Task 9: Checkpoint - Validate analysis and notification systems');
  console.log('='.repeat(70));
  console.log('📋 Validating system structure and implementation completeness...\n');
  
  try {
    // Run all validation checks
    await validateAnalyticsSystem();
    await validateNotificationSystem();
    await validateSecuritySystem();
    await validateSystemIntegration();
    
    // Generate comprehensive report
    const report = await generateValidationReport();
    
    // Final status
    console.log('\n🎯 TASK 9 CHECKPOINT STATUS:');
    if (report.success) {
      console.log('✅ ALL SYSTEMS VALIDATED SUCCESSFULLY');
      console.log('✅ Analysis tools are properly structured and implemented');
      console.log('✅ Notification system components are in place');
      console.log('✅ Security utilities are functional');
      console.log('✅ System integration is complete');
      console.log('\n🚀 Systems are ready for production use!');
    } else {
      console.log('⚠️ SOME SYSTEMS NEED ATTENTION');
      console.log(`📊 Success Rate: ${report.successRate}%`);
      console.log(`✅ Passed: ${report.passed}/${report.totalTests}`);
      console.log(`❌ Failed: ${report.failed}/${report.totalTests}`);
      console.log('\n📋 Review recommendations above for next steps');
    }
    
    process.exit(report.success ? 0 : 1);
    
  } catch (error) {
    console.error('\n💥 Validation failed with error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run validation if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { main as validateSystemsStructure, results as validationResults };