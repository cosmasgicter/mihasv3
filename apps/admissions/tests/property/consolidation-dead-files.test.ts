/**
 * Property 4: Deprecated and Dead Files Deleted
 * Feature: duplicate-deprecated-consolidation, Property 4: Deprecated and Dead Files Deleted
 *
 * For any file path in the deletion list, the file should not exist on disk.
 *
 * Validates: Requirements 1.4, 3.5, 6.1, 6.2, 6.3, 9.2, 11.4, 12.4, 18.1-18.25
 */
// @vitest-environment node
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '../..');

const DELETED_FILES = [
  // Deprecated sources (Phase 1)
  'src/utils/keyboardNavigation.ts',
  'src/utils/contrastChecker.ts',
  'src/lib/sanitizer.ts',
  'src/lib/securityEnhancements.ts',
  'src/utils/logger.ts',
  'src/utils/errorMessages.ts',
  'src/lib/draftCleanup.ts',
  'src/lib/securityPatches.ts',
  'src/lib/securityHeaders.ts',
  'src/lib/securityUtils.ts',
  // Deprecated hooks/services (Phase 2)
  'src/hooks/useErrorHandling.ts',
  'src/hooks/useNotificationPreferences.ts',
  'src/hooks/useDraftManager.ts',
  'src/hooks/queries/useNotificationQueries.ts',
  'src/stores/toastStore.ts',
  'src/lib/notificationService.ts',
  'src/lib/adminNotifications.ts',
  'src/lib/networkChecker.ts',
  'src/lib/networkDiagnostics.ts',
  // Deprecated UI (Phase 3)
  'src/components/ErrorBoundary.tsx',
  'src/components/ui/ResponsiveContainer.tsx',
  'src/components/student/DashboardSkeleton.tsx',
  'src/components/admin/DashboardSkeleton.tsx',
  'src/components/student/StudentDashboardSkeleton.tsx',
  'src/components/student/StudentNextActionCard.tsx',
  'src/pages/auth/AuthLayout.tsx',
  'src/components/student/NotificationPreferences.tsx',
  // Dead code (Phase 4)
  'src/utils/uploadTest.ts',
  'src/utils/extension-conflict-prevention.ts',
  'src/utils/duplicate-detection.ts',
  'src/utils/testNotifications.ts',
  'src/lib/secureDisplay.ts',
  'src/lib/secureMessaging.ts',
  'src/lib/secureExecution.ts',
  'src/lib/emailTemplates.ts',
  'src/lib/historyTracker.ts',
  'src/lib/devMode.ts',
  'src/lib/maintenance.ts',
  'src/lib/schemas/ai.ts',
  'src/types/analytics.ts',
  'src/types/compliance.ts',
  'src/types/plugins.ts',
  'src/components/ui/FeedbackWidget.tsx',
  'src/components/ui/ConflictResolution.tsx',
  'src/components/ui/DraftDeletionTest.tsx',
  'src/components/ui/SimpleErrorBoundary.tsx',
  'src/components/application/FileUploadTest.tsx',
  'src/components/application/UploadDebugger.tsx',
  'src/components/dev/NotificationTester.tsx',
  'src/pages/admin/featureRegistry.ts',
  'src/hooks/useCacheMonitor.ts',
];

const deletedFileArb = fc.constantFrom(...DELETED_FILES);

describe('Property 4: Deprecated and Dead Files Deleted', () => {
  it('each file in the deletion list does not exist on disk', () => {
    fc.assert(
      fc.property(deletedFileArb, (filePath) => {
        const fullPath = path.resolve(ROOT, filePath);
        expect(
          fs.existsSync(fullPath),
          `File ${filePath} should have been deleted but still exists`
        ).toBe(false);
      }),
      { numRuns: 100 },
    );
  });
});
