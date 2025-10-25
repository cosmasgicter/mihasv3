#!/usr/bin/env node

/**
 * Frontend-Backend Integration Verification Script
 * Systematically checks each frontend service function against backend endpoints
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Map frontend services to backend functions
const integrationMap = {
  // Auth Service (src/services/auth.ts)
  'auth.register': 'functions/auth/register.js',
  'auth.login': 'functions/auth/login.js',
  'auth.signin': 'functions/auth/signin.js',
  
  // Application Service (src/services/applications.ts)
  'applications.list': 'functions/applications.js',
  'applications.getById': 'functions/applications/[id].js',
  'applications.create': 'functions/applications.js',
  'applications.update': 'functions/applications/[id].js',
  'applications.delete': 'functions/applications/[id].js',
  'applications.updateStatus': 'functions/applications/[id].js',
  'applications.updatePaymentStatus': 'functions/applications/[id].js',
  'applications.verifyDocument': 'functions/applications/[id].js',
  'applications.sendNotification': 'functions/applications/[id].js',
  'applications.generateAcceptanceLetter': 'functions/applications/[id].js',
  'applications.generateFinanceReceipt': 'functions/applications/[id].js',
  'applications.scheduleInterview': 'functions/applications/[id].js',
  'applications.rescheduleInterview': 'functions/applications/[id].js',
  'applications.cancelInterview': 'functions/applications/[id].js',
  
  // Catalog Service (src/services/catalog.ts)
  'catalog.getPrograms': 'functions/catalog/programs.js',
  'catalog.getIntakes': 'functions/catalog/intakes.js',
  'catalog.getSubjects': 'functions/catalog/subjects.js',
  'program.list': 'functions/catalog/programs.js',
  'program.create': 'functions/catalog/programs.js',
  'program.update': 'functions/catalog/programs.js',
  'program.delete': 'functions/catalog/programs.js',
  'intake.list': 'functions/catalog/intakes.js',
  'intake.create': 'functions/catalog/intakes.js',
  'intake.update': 'functions/catalog/intakes.js',
  'intake.delete': 'functions/catalog/intakes.js',
  
  // Document Service (src/services/documents.ts)
  'documents.upload': 'functions/documents/upload.js',
  'documents.generateAcceptanceLetter': 'functions/documents/acceptance-letter.js',
  'documents.generateFinanceReceipt': 'functions/documents/finance-receipt.js',
  
  // Notification Service (src/services/notifications.ts)
  'notifications.send': 'functions/notifications/send.js',
  'notifications.applicationSubmitted': 'functions/notifications/application/submitted.js',
  'notifications.dispatchChannel': 'functions/notifications/dispatch/channel.js',
  'notifications.getPreferences': 'functions/notifications/preferences.js',
  'notifications.updateConsent': 'functions/notifications/update-consent.js',
  
  // Interview Service (src/services/interviews.ts)
  'interviews.schedule': 'functions/interview/schedule.js',
  'interviews.list': 'functions/interview/schedule.js',
  'interviews.sendReminders': 'functions/interview/reminders.js',
  
  // Analytics Service (src/services/analytics.ts)
  'analytics.getMetrics': 'functions/analytics/metrics.js',
  'analytics.getTelemetrySummary': 'functions/analytics/telemetry.js',
  
  // Admin User Service (src/services/admin/users.ts)
  'admin.users.list': 'functions/admin/users.js',
  'admin.users.getById': 'functions/admin/users/[id].js',
  'admin.users.getRole': 'functions/admin/users/id/role.js',
  'admin.users.getPermissions': 'functions/admin/users/id/permissions.js',
  'admin.users.create': 'functions/admin/users.js',
  'admin.users.update': 'functions/admin/users/[id].js',
  'admin.users.updatePermissions': 'functions/admin/users/id/permissions.js',
  'admin.users.remove': 'functions/admin/users/[id].js',
  
  // Admin Dashboard Service (src/services/admin/dashboard.ts)
  'admin.dashboard.getMetrics': 'functions/admin/dashboard.js',
  'admin.dashboard.getOverview': 'functions/admin/dashboard.js',
  
  // Admin Audit Service (src/services/admin/audit.ts)
  'admin.audit.list': 'functions/admin/audit/log.js',
};

function checkFileExists(filePath) {
  const fullPath = path.join(__dirname, '..', filePath);
  return fs.existsSync(fullPath);
}

function verifyIntegration() {
  console.log('🔍 Frontend-Backend Integration Verification\n');
  console.log('=' .repeat(80));
  
  let verified = 0;
  let missing = 0;
  const missingFiles = [];
  
  Object.entries(integrationMap).forEach(([frontend, backend]) => {
    const exists = checkFileExists(backend);
    const status = exists ? '✅' : '❌';
    
    if (exists) {
      verified++;
    } else {
      missing++;
      missingFiles.push({ frontend, backend });
    }
    
    console.log(`${status} ${frontend.padEnd(40)} → ${backend}`);
  });
  
  console.log('=' .repeat(80));
  console.log(`\n📊 Summary:`);
  console.log(`   Total Functions: ${Object.keys(integrationMap).length}`);
  console.log(`   ✅ Verified: ${verified}`);
  console.log(`   ❌ Missing: ${missing}`);
  console.log(`   📈 Success Rate: ${((verified / Object.keys(integrationMap).length) * 100).toFixed(1)}%`);
  
  if (missingFiles.length > 0) {
    console.log(`\n⚠️  Missing Backend Files:`);
    missingFiles.forEach(({ frontend, backend }) => {
      console.log(`   - ${frontend} → ${backend}`);
    });
  }
  
  return { verified, missing, total: Object.keys(integrationMap).length };
}

// Run verification
const result = verifyIntegration();
process.exit(result.missing > 0 ? 1 : 0);
