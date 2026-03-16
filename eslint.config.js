import tseslint from 'typescript-eslint';
import pluginReactHooks from 'eslint-plugin-react-hooks';
import pluginReactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';

const migratedModuleFiles = [
  'src/pages/student/applicationWizard/**/*.{ts,tsx}',
  'src/pages/student/ApplicationWizard.tsx',
  'src/pages/student/ApplicationStatus.tsx',
  'src/pages/student/Dashboard.tsx',
  'src/hooks/queries/**/*.{ts,tsx}',
  'src/services/**/*.{ts,tsx}',
  'src/components/student/NotificationPreferences.tsx',
  'src/pages/admin/Dashboard.tsx',
  'src/pages/admin/Applications.tsx',
  'src/pages/admin/ApplicationsAdmin.tsx',
  'src/pages/admin/SystemHealthDashboard.tsx',
  'src/pages/admin/EnhancedDashboard.tsx',
];

export default [
  {
    ignores: ['dist/**', 'node_modules/**', 'coverage/**'],
  },
  {
    files: ['**/*.{ts,tsx,js,jsx}'],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        ecmaVersion: 2020,
        sourceType: 'module',
      },
      globals: {
        ...globals.browser,
        ...globals.es2021,
        ...globals.node,
      },
    },
    plugins: {
      '@typescript-eslint': tseslint.plugin,
      'react-hooks': pluginReactHooks,
      'react-refresh': pluginReactRefresh,
    },
    rules: {
      '@typescript-eslint/no-dynamic-delete': 'off',
      'react-hooks/rules-of-hooks': 'error',
      'react-refresh/only-export-components': 'off',
      'react-hooks/exhaustive-deps': 'off',
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '@/components/ui/Card',
                '@/components/ui/Badge',
                '@/components/ui/Tooltip',
                '@/components/ui/Skeleton',
              ],
              message: 'Use canonical ui primitive imports from @/components/ui barrel exports.',
            },
            {
              group: [
                '@/components/ui/LightweightButton',
                '@/components/ui/MobileOptimizedButton',
                '@/components/ui/TouchButton',
                '@/components/ui/TouchOptimizedButton',
                '@/components/ui/LoadingSpinner',
                '@/components/ui/Spinner',
                '@/components/ui/Radio',
              ],
              message: 'Deprecated UI module import blocked. Use canonical primitives from @/components/ui (Button, UnifiedLoader, CanonicalSelect, radio-group).',
            },
            // Consolidation: deprecated utility paths
            {
              group: ['@/utils/logger'],
              message: 'Use @/lib/logger instead.',
            },
            {
              group: ['@/utils/errorMessages'],
              message: 'Use @/lib/errorMessages instead.',
            },
            {
              group: ['@/lib/sanitizer', '@/lib/securityEnhancements'],
              message: 'Use @/lib/sanitize instead.',
            },
            {
              group: ['@/utils/keyboardNavigation', '@/utils/contrastChecker'],
              message: 'Use @/lib/accessibility-utils instead.',
            },
            {
              group: ['@/lib/draftCleanup'],
              message: 'Use @/lib/draftManager instead.',
            },
            {
              group: ['@/lib/networkChecker', '@/lib/networkDiagnostics'],
              message: 'Use @/hooks/useNetworkStatus instead.',
            },
            {
              group: ['@/stores/toastStore'],
              message: 'Use @/hooks/useToast instead.',
            },
            {
              group: ['@/lib/notificationService', '@/lib/adminNotifications'],
              message: 'Use @/services/notifications instead.',
            },
            {
              group: ['@/lib/securityPatches', '@/lib/securityHeaders', '@/lib/securityUtils'],
              message: 'Use @/lib/securityConfig or @/lib/sanitize instead.',
            },
            {
              group: ['@/hooks/useErrorHandling'],
              message: 'Use @/hooks/useErrorHandler or @/hooks/useAsyncOperation instead.',
            },
            {
              group: ['@/hooks/useNotificationPreferences'],
              message: 'Use @/hooks/queries/useNotificationQueries instead.',
            },
            {
              group: ['@/components/ErrorBoundary'],
              message: 'Use @/components/ui/ErrorBoundary instead.',
            },
          ],
        },
      ],
    },
  },
  {
    files: migratedModuleFiles,
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@supabase/supabase-js', '@/lib/supabase*', '**/supabase*'],
              message: 'Use API services/apiClient; direct Supabase runtime usage is blocked in migrated modules.',
            },
            {
              group: ['@/lib/eligibilityEngine', '@/lib/notificationService', '@/lib/duplicateApplicationCheck'],
              message: 'Use API-backed services instead of legacy Supabase runtime modules.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['tests/**/*.{ts,tsx,js}'],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
        ...globals.mocha,
        vi: 'readonly',
      },
    },
  },
];
