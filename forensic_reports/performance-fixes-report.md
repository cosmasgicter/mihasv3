# Performance Fixes Report

> Forensic audit of performance issues, animation usage, bundle size, and mobile optimization

**Generated**: 2026-02-07T09:23:23.782Z
**Project Root**: C:\Users\Administrator\Documents\mihasv3
**Audit Version**: 1.0.0

## Executive Summary

**Report Generated**: 2026-02-07T09:23:23.782Z

### Performance Health Status

🔴 **CRITICAL** — Performance issues require immediate attention

### Overview

| Metric | Value |
|--------|-------|
| Total Performance Issues | 587 |
| High Impact Issues | 544 |
| Medium Impact Issues | 43 |
| Low Impact Issues | 0 |
| Total Animations Found | 750 |
| Heavy Animations | 577 |
| Total JS Bundle Size | 4.18 MB |
| Bundle Threshold | 500.00 KB |
| Bundle Status | ❌ Exceeds threshold |

### Issue Breakdown by Type

| Issue Type | Count | Highest Impact |
|------------|-------|----------------|
| Heavy Animation | 577 | 🔴 |
| Large Bundle | 10 | 🔴 |
| Memory Leak | 0 | — |
| Excessive Rerender | 0 | — |
| Unoptimized Image | 0 | — |
| Blocking Script | 0 | — |

### Quick Stats

- **framer-motion Files**: 98
- **Animation Libraries**: framer-motion (540), CSS (210), Custom (0)
- **Oversized Chunks**: 10
- **Mobile Optimizations Recommended**: 9

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Animation Issues](#animation-issues)
3. [Bundle Size Analysis](#bundle-size-analysis)
4. [All Performance Issues](#all-performance-issues)
5. [Mobile Optimization Recommendations](#mobile-optimization-recommendations)
6. [Logo Animation Audit](#logo-animation-audit)
7. [Requirements Validation](#requirements-validation)

## Animation Issues

### Summary

- **Total Animations Found**: 750
- **Heavy Animations**: 577
- **Lightweight Animations**: 173

### Library Breakdown

| Library | Count | Status |
|---------|-------|--------|
| framer-motion | 540 | 🔴 Should be removed |
| CSS Animations | 210 | 🟡 Some heavy |
| Custom/Other | 0 | ✅ None |

### 🔴 framer-motion Usage (High Priority for Removal)

framer-motion adds significant bundle weight (~30KB+) and causes performance issues on low-end devices.
Per project requirements, framer-motion is being phased out for performance.

| File | Action Required |
|------|----------------|
| `src\components\8starlabs\partition-bar.tsx` | Replace with CSS transitions/Tailwind animate-* |
| `src\components\8starlabs\status-indicator.tsx` | Replace with CSS transitions/Tailwind animate-* |
| `src\components\8starlabs\timeline.tsx` | Replace with CSS transitions/Tailwind animate-* |
| `src\components\admin\AdminHeader.tsx` | Replace with CSS transitions/Tailwind animate-* |
| `src\components\admin\AdminMobileNav.tsx` | Replace with CSS transitions/Tailwind animate-* |
| `src\components\admin\AdminSearchBar.tsx` | Replace with CSS transitions/Tailwind animate-* |
| `src\components\admin\AdminSidebar.tsx` | Replace with CSS transitions/Tailwind animate-* |
| `src\components\admin\AnalyticsCharts.tsx` | Replace with CSS transitions/Tailwind animate-* |
| `src\components\admin\applications\ApplicationsCards.tsx` | Replace with CSS transitions/Tailwind animate-* |
| `src\components\admin\applications\ApplicationsFilters.tsx` | Replace with CSS transitions/Tailwind animate-* |
| `src\components\admin\applications\ApplicationsMetrics.tsx` | Replace with CSS transitions/Tailwind animate-* |
| `src\components\admin\EnhancedApplicationsManager.tsx` | Replace with CSS transitions/Tailwind animate-* |
| `src\components\admin\EnhancedDashboard.tsx` | Replace with CSS transitions/Tailwind animate-* |
| `src\components\admin\EnhancedDataTable.tsx` | Replace with CSS transitions/Tailwind animate-* |
| `src\components\admin\FixedAdminDashboard.tsx` | Replace with CSS transitions/Tailwind animate-* |
| `src\components\admin\OfflineAdminDashboard.tsx` | Replace with CSS transitions/Tailwind animate-* |
| `src\components\admin\QuickActionsPanel.tsx` | Replace with CSS transitions/Tailwind animate-* |
| `src\components\admin\RealtimeMetricsDisplay.tsx` | Replace with CSS transitions/Tailwind animate-* |
| `src\components\admin\RealTimeNotifications.tsx` | Replace with CSS transitions/Tailwind animate-* |
| `src\components\admin\SystemMonitoring.tsx` | Replace with CSS transitions/Tailwind animate-* |
| `src\components\application\EligibilityNotification.tsx` | Replace with CSS transitions/Tailwind animate-* |
| `src\components\application\SimpleFileUpload.tsx` | Replace with CSS transitions/Tailwind animate-* |
| `src\components\application\wizard\StepOne.tsx` | Replace with CSS transitions/Tailwind animate-* |
| `src\components\auth\AuthLayout.tsx` | Replace with CSS transitions/Tailwind animate-* |
| `src\components\blocks\cta-section.tsx` | Replace with CSS transitions/Tailwind animate-* |
| `src\components\blocks\feature-grid.tsx` | Replace with CSS transitions/Tailwind animate-* |
| `src\components\blocks\hero-section.tsx` | Replace with CSS transitions/Tailwind animate-* |
| `src\components\DashboardRedirect.tsx` | Replace with CSS transitions/Tailwind animate-* |
| `src\components\eligibility\DetailedScoreBreakdown.tsx` | Replace with CSS transitions/Tailwind animate-* |
| `src\components\navigation\BaseNavigation.tsx` | Replace with CSS transitions/Tailwind animate-* |
| `src\components\navigation\DesktopSidebar.tsx` | Replace with CSS transitions/Tailwind animate-* |
| `src\components\notifications\NotificationAnalytics.tsx` | Replace with CSS transitions/Tailwind animate-* |
| `src\components\notifications\PushNotificationSettings.tsx` | Replace with CSS transitions/Tailwind animate-* |
| `src\components\pwa\OfflineIndicator.tsx` | Replace with CSS transitions/Tailwind animate-* |
| `src\components\smoothui\animated-file-upload.tsx` | Replace with CSS transitions/Tailwind animate-* |
| `src\components\smoothui\animated-input.tsx` | Replace with CSS transitions/Tailwind animate-* |
| `src\components\smoothui\animated-select.tsx` | Replace with CSS transitions/Tailwind animate-* |
| `src\components\smoothui\page-transition.tsx` | Replace with CSS transitions/Tailwind animate-* |
| `src\components\smoothui\scroll-reveal.tsx` | Replace with CSS transitions/Tailwind animate-* |
| `src\components\student\ApplicationSlipActions.tsx` | Replace with CSS transitions/Tailwind animate-* |
| `src\components\student\ApplicationTimeline.tsx` | Replace with CSS transitions/Tailwind animate-* |
| `src\components\student\DashboardStatusOverview.tsx` | Replace with CSS transitions/Tailwind animate-* |
| `src\components\student\NotificationBell.tsx` | Replace with CSS transitions/Tailwind animate-* |
| `src\components\student\QuickActions.tsx` | Replace with CSS transitions/Tailwind animate-* |
| `src\components\ui\AdminNavigation.tsx` | Replace with CSS transitions/Tailwind animate-* |
| `src\components\ui\AnimatedCard.tsx` | Replace with CSS transitions/Tailwind animate-* |
| `src\components\ui\AnimatedSection.tsx` | Replace with CSS transitions/Tailwind animate-* |
| `src\components\ui\Card.tsx` | Replace with CSS transitions/Tailwind animate-* |
| `src\components\ui\ConfirmDialog.tsx` | Replace with CSS transitions/Tailwind animate-* |
| `src\components\ui\FancyPreloader.tsx` | Replace with CSS transitions/Tailwind animate-* |
| `src\components\ui\FloatingElements.tsx` | Replace with CSS transitions/Tailwind animate-* |
| `src\components\ui\FloatingOrbs.tsx` | Replace with CSS transitions/Tailwind animate-* |
| `src\components\ui\FormFeedback.tsx` | Replace with CSS transitions/Tailwind animate-* |
| `src\components\ui\Input.tsx` | Replace with CSS transitions/Tailwind animate-* |
| `src\components\ui\OfflineIndicator.tsx` | Replace with CSS transitions/Tailwind animate-* |
| `src\components\ui\PageHeader.tsx` | Replace with CSS transitions/Tailwind animate-* |
| `src\components\ui\PasswordInput.tsx` | Replace with CSS transitions/Tailwind animate-* |
| `src\components\ui\ProfileAutoPopulationIndicator.tsx` | Replace with CSS transitions/Tailwind animate-* |
| `src\components\ui\ProgressIndicator.tsx` | Replace with CSS transitions/Tailwind animate-* |
| `src\components\ui\SaveStatusIndicator.tsx` | Replace with CSS transitions/Tailwind animate-* |
| `src\components\ui\SkeletonLoader.tsx` | Replace with CSS transitions/Tailwind animate-* |
| `src\components\ui\StatusIcon.tsx` | Replace with CSS transitions/Tailwind animate-* |
| `src\components\ui\TouchButton.tsx` | Replace with CSS transitions/Tailwind animate-* |
| `src\components\ui\TypewriterText.tsx` | Replace with CSS transitions/Tailwind animate-* |
| `src\pages\admin\Applications.tsx` | Replace with CSS transitions/Tailwind animate-* |
| `src\pages\admin\Dashboard.tsx` | Replace with CSS transitions/Tailwind animate-* |
| `src\pages\admin\EnhancedDashboard.tsx` | Replace with CSS transitions/Tailwind animate-* |
| `src\pages\admin\WorkflowAutomation.tsx` | Replace with CSS transitions/Tailwind animate-* |
| `src\pages\auth\ForgotPasswordPage.tsx` | Replace with CSS transitions/Tailwind animate-* |
| `src\pages\auth\ResetPasswordPage.tsx` | Replace with CSS transitions/Tailwind animate-* |
| `src\pages\auth\SignInPage.tsx` | Replace with CSS transitions/Tailwind animate-* |
| `src\pages\auth\SignUpPage.tsx` | Replace with CSS transitions/Tailwind animate-* |
| `src\pages\public\tracker\components\ApplicationInfoGrid.tsx` | Replace with CSS transitions/Tailwind animate-* |
| `src\pages\public\tracker\components\ApplicationStatusDetails.tsx` | Replace with CSS transitions/Tailwind animate-* |
| `src\pages\public\tracker\components\ApplicationStatusHeader.tsx` | Replace with CSS transitions/Tailwind animate-* |
| `src\pages\public\tracker\components\HelpSection.tsx` | Replace with CSS transitions/Tailwind animate-* |
| `src\pages\public\tracker\components\NoResultsView.tsx` | Replace with CSS transitions/Tailwind animate-* |
| `src\pages\public\tracker\components\TrackerSearchSection.tsx` | Replace with CSS transitions/Tailwind animate-* |
| `src\pages\public\tracker\index.tsx` | Replace with CSS transitions/Tailwind animate-* |
| `src\pages\student\ApplicationDetail.tsx` | Replace with CSS transitions/Tailwind animate-* |
| `src\pages\student\ApplicationStatus.tsx` | Replace with CSS transitions/Tailwind animate-* |
| `src\pages\student\applicationWizard\components\AnalyticsDashboard.tsx` | Replace with CSS transitions/Tailwind animate-* |
| `src\pages\student\applicationWizard\components\ApplicationPreview.tsx` | Replace with CSS transitions/Tailwind animate-* |
| `src\pages\student\applicationWizard\components\DraftManager.tsx` | Replace with CSS transitions/Tailwind animate-* |
| `src\pages\student\applicationWizard\components\EnhancedProgressIndicator.tsx` | Replace with CSS transitions/Tailwind animate-* |
| `src\pages\student\applicationWizard\components\KeyboardShortcutsHelp.tsx` | Replace with CSS transitions/Tailwind animate-* |
| `src\pages\student\applicationWizard\components\ReminderSettings.tsx` | Replace with CSS transitions/Tailwind animate-* |
| `src\pages\student\applicationWizard\components\StepChecklist.tsx` | Replace with CSS transitions/Tailwind animate-* |
| `src\pages\student\applicationWizard\components\StepTransition.tsx` | Replace with CSS transitions/Tailwind animate-* |
| `src\pages\student\applicationWizard\components\SubmissionSuccess.tsx` | Replace with CSS transitions/Tailwind animate-* |
| `src\pages\student\applicationWizard\index.tsx` | Replace with CSS transitions/Tailwind animate-* |
| `src\pages\student\applicationWizard\steps\BasicKycStep.tsx` | Replace with CSS transitions/Tailwind animate-* |
| `src\pages\student\applicationWizard\steps\EducationStep.tsx` | Replace with CSS transitions/Tailwind animate-* |
| `src\pages\student\applicationWizard\steps\PaymentStep.tsx` | Replace with CSS transitions/Tailwind animate-* |
| `src\pages\student\applicationWizard\steps\SubmitStep.tsx` | Replace with CSS transitions/Tailwind animate-* |
| `src\pages\student\Dashboard.tsx` | Replace with CSS transitions/Tailwind animate-* |
| `src\pages\student\NotificationSettings.tsx` | Replace with CSS transitions/Tailwind animate-* |
| `src\pages\student\Settings.tsx` | Replace with CSS transitions/Tailwind animate-* |

### Heavy Animation Details

| File | Line | Library | Type | Recommendation |
|------|------|---------|------|----------------|
| `src\components\8starlabs\partition-bar.tsx` | 8 | framer-motion | framer-motion-import | Remove framer-motion dependency. Use CSS transitions or Tailwind animate-* classes instead. |
| `src\components\8starlabs\partition-bar.tsx` | 74 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\components\8starlabs\partition-bar.tsx` | 147 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\components\8starlabs\status-indicator.tsx` | 8 | framer-motion | framer-motion-import | Remove framer-motion dependency. Use CSS transitions or Tailwind animate-* classes instead. |
| `src\components\8starlabs\status-indicator.tsx` | 104 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\components\8starlabs\timeline.tsx` | 8 | framer-motion | framer-motion-import | Remove framer-motion dependency. Use CSS transitions or Tailwind animate-* classes instead. |
| `src\components\8starlabs\timeline.tsx` | 93 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\components\8starlabs\timeline.tsx` | 164 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\components\admin\AdminHeader.tsx` | 9 | framer-motion | framer-motion-import | Remove framer-motion dependency. Use CSS transitions or Tailwind animate-* classes instead. |
| `src\components\admin\AdminHeader.tsx` | 122 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\components\admin\AdminMobileNav.tsx` | 11 | framer-motion | framer-motion-import | Remove framer-motion dependency. Use CSS transitions or Tailwind animate-* classes instead. |
| `src\components\admin\AdminMobileNav.tsx` | 75 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\components\admin\AdminMobileNav.tsx` | 85 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\components\admin\AdminSearchBar.tsx` | 2 | framer-motion | framer-motion-import | Remove framer-motion dependency. Use CSS transitions or Tailwind animate-* classes instead. |
| `src\components\admin\AdminSearchBar.tsx` | 137 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\components\admin\AdminSearchBar.tsx` | 145 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\components\admin\AdminSearchBar.tsx` | 135 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\components\admin\AdminSidebar.tsx` | 11 | framer-motion | framer-motion-import | Remove framer-motion dependency. Use CSS transitions or Tailwind animate-* classes instead. |
| `src\components\admin\AdminSidebar.tsx` | 160 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\components\admin\AdminSidebar.tsx` | 209 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\components\admin\AdminSidebar.tsx` | 219 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\components\admin\AdminSidebar.tsx` | 268 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\components\admin\AdminSidebar.tsx` | 280 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\components\admin\AdminSidebar.tsx` | 337 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\components\admin\AdminSidebar.tsx` | 357 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\components\admin\AdminSidebar.tsx` | 158 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\components\admin\AdminSidebar.tsx` | 207 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\components\admin\AdminSidebar.tsx` | 278 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\components\admin\AdminSidebar.tsx` | 355 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\components\admin\AnalyticsCharts.tsx` | 1 | framer-motion | framer-motion-import | Remove framer-motion dependency. Use CSS transitions or Tailwind animate-* classes instead. |
| `src\components\admin\AnalyticsCharts.tsx` | 72 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\components\admin\AnalyticsCharts.tsx` | 96 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\components\admin\AnalyticsCharts.tsx` | 121 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\components\admin\AnalyticsCharts.tsx` | 140 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\components\admin\AnalyticsCharts.tsx` | 161 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\components\admin\AnalyticsCharts.tsx` | 179 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\components\admin\AnalyticsCharts.tsx` | 192 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\components\admin\AnalyticsCharts.tsx` | 250 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\components\admin\AnalyticsCharts.tsx` | 288 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\components\admin\applications\ApplicationsCards.tsx` | 2 | framer-motion | framer-motion-import | Remove framer-motion dependency. Use CSS transitions or Tailwind animate-* classes instead. |
| `src\components\admin\applications\ApplicationsCards.tsx` | 69 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\components\admin\applications\ApplicationsCards.tsx` | 67 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\components\admin\applications\ApplicationsFilters.tsx` | 2 | framer-motion | framer-motion-import | Remove framer-motion dependency. Use CSS transitions or Tailwind animate-* classes instead. |
| `src\components\admin\applications\ApplicationsFilters.tsx` | 79 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\components\admin\applications\ApplicationsFilters.tsx` | 192 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\components\admin\applications\ApplicationsFilters.tsx` | 190 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\components\admin\applications\ApplicationsMetrics.tsx` | 2 | framer-motion | framer-motion-import | Remove framer-motion dependency. Use CSS transitions or Tailwind animate-* classes instead. |
| `src\components\admin\applications\ApplicationsMetrics.tsx` | 24 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\components\admin\EnhancedApplicationsManager.tsx` | 2 | framer-motion | framer-motion-import | Remove framer-motion dependency. Use CSS transitions or Tailwind animate-* classes instead. |
| `src\components\admin\EnhancedApplicationsManager.tsx` | 143 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\components\admin\EnhancedApplicationsManager.tsx` | 152 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\components\admin\EnhancedApplicationsManager.tsx` | 162 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\components\admin\EnhancedApplicationsManager.tsx` | 172 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\components\admin\EnhancedApplicationsManager.tsx` | 182 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\components\admin\EnhancedApplicationsManager.tsx` | 194 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\components\admin\EnhancedApplicationsManager.tsx` | 281 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\components\admin\EnhancedApplicationsManager.tsx` | 335 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\components\admin\EnhancedApplicationsManager.tsx` | 347 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\components\admin\EnhancedApplicationsManager.tsx` | 439 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\components\admin\EnhancedApplicationsManager.tsx` | 475 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\components\admin\EnhancedDashboard.tsx` | 2 | framer-motion | framer-motion-import | Remove framer-motion dependency. Use CSS transitions or Tailwind animate-* classes instead. |
| `src\components\admin\EnhancedDashboard.tsx` | 64 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\components\admin\EnhancedDashboard.tsx` | 84 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\components\admin\EnhancedDashboard.tsx` | 108 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\components\admin\EnhancedDashboard.tsx` | 133 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\components\admin\EnhancedDashboard.tsx` | 162 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\components\admin\EnhancedDashboard.tsx` | 182 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\components\admin\EnhancedDashboard.tsx` | 209 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\components\admin\EnhancedDataTable.tsx` | 17 | framer-motion | framer-motion-import | Remove framer-motion dependency. Use CSS transitions or Tailwind animate-* classes instead. |
| `src\components\admin\EnhancedDataTable.tsx` | 153 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\components\admin\EnhancedDataTable.tsx` | 169 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\components\admin\EnhancedDataTable.tsx` | 192 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\components\admin\EnhancedDataTable.tsx` | 210 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\components\admin\EnhancedDataTable.tsx` | 226 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\components\admin\EnhancedDataTable.tsx` | 523 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\components\admin\EnhancedDataTable.tsx` | 520 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\components\admin\FixedAdminDashboard.tsx` | 2 | framer-motion | framer-motion-import | Remove framer-motion dependency. Use CSS transitions or Tailwind animate-* classes instead. |
| `src\components\admin\FixedAdminDashboard.tsx` | 181 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\components\admin\FixedAdminDashboard.tsx` | 179 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\components\admin\OfflineAdminDashboard.tsx` | 16 | framer-motion | framer-motion-import | Remove framer-motion dependency. Use CSS transitions or Tailwind animate-* classes instead. |
| `src\components\admin\OfflineAdminDashboard.tsx` | 44 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\components\admin\OfflineAdminDashboard.tsx` | 67 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\components\admin\OfflineAdminDashboard.tsx` | 104 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\components\admin\OfflineAdminDashboard.tsx` | 111 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\components\admin\OfflineAdminDashboard.tsx` | 128 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\components\admin\OfflineAdminDashboard.tsx` | 148 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\components\admin\OfflineAdminDashboard.tsx` | 165 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\components\admin\OfflineAdminDashboard.tsx` | 183 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\components\admin\OfflineAdminDashboard.tsx` | 233 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\components\admin\QuickActionsPanel.tsx` | 2 | framer-motion | framer-motion-import | Remove framer-motion dependency. Use CSS transitions or Tailwind animate-* classes instead. |
| `src\components\admin\QuickActionsPanel.tsx` | 93 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\components\admin\QuickActionsPanel.tsx` | 109 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\components\admin\QuickActionsPanel.tsx` | 142 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\components\admin\QuickActionsPanel.tsx` | 157 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\components\admin\QuickActionsPanel.tsx` | 180 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\components\admin\QuickActionsPanel.tsx` | 205 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\components\admin\RealtimeMetricsDisplay.tsx` | 16 | framer-motion | framer-motion-import | Remove framer-motion dependency. Use CSS transitions or Tailwind animate-* classes instead. |
| `src\components\admin\RealtimeMetricsDisplay.tsx` | 127 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\components\admin\RealtimeMetricsDisplay.tsx` | 158 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\components\admin\RealtimeMetricsDisplay.tsx` | 182 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\components\admin\RealtimeMetricsDisplay.tsx` | 240 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\components\admin\RealtimeMetricsDisplay.tsx` | 449 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\components\admin\RealtimeMetricsDisplay.tsx` | 487 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\components\admin\RealtimeMetricsDisplay.tsx` | 518 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\components\admin\RealtimeMetricsDisplay.tsx` | 554 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\components\admin\RealtimeMetricsDisplay.tsx` | 126 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\components\admin\RealtimeMetricsDisplay.tsx` | 447 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\components\admin\RealtimeMetricsDisplay.tsx` | 485 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\components\admin\RealTimeNotifications.tsx` | 2 | framer-motion | framer-motion-import | Remove framer-motion dependency. Use CSS transitions or Tailwind animate-* classes instead. |
| `src\components\admin\RealTimeNotifications.tsx` | 94 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\components\admin\RealTimeNotifications.tsx` | 122 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\components\admin\RealTimeNotifications.tsx` | 92 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\components\admin\SystemMonitoring.tsx` | 2 | framer-motion | framer-motion-import | Remove framer-motion dependency. Use CSS transitions or Tailwind animate-* classes instead. |
| `src\components\admin\SystemMonitoring.tsx` | 129 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\components\admin\SystemMonitoring.tsx` | 150 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\components\admin\SystemMonitoring.tsx` | 172 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\components\admin\SystemMonitoring.tsx` | 194 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\components\admin\SystemMonitoring.tsx` | 218 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\components\admin\SystemMonitoring.tsx` | 249 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\components\admin\SystemMonitoring.tsx` | 267 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\components\admin\SystemMonitoring.tsx` | 285 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\components\admin\SystemMonitoring.tsx` | 303 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\components\admin\SystemMonitoring.tsx` | 316 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\components\admin\SystemMonitoring.tsx` | 362 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\components\application\EligibilityNotification.tsx` | 2 | framer-motion | framer-motion-import | Remove framer-motion dependency. Use CSS transitions or Tailwind animate-* classes instead. |
| `src\components\application\EligibilityNotification.tsx` | 16 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\components\application\SimpleFileUpload.tsx` | 6 | framer-motion | framer-motion-import | Remove framer-motion dependency. Use CSS transitions or Tailwind animate-* classes instead. |
| `src\components\application\SimpleFileUpload.tsx` | 346 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\components\application\SimpleFileUpload.tsx` | 364 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\components\application\SimpleFileUpload.tsx` | 451 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\components\application\SimpleFileUpload.tsx` | 449 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\components\application\wizard\StepOne.tsx` | 5 | framer-motion | framer-motion-import | Remove framer-motion dependency. Use CSS transitions or Tailwind animate-* classes instead. |
| `src\components\application\wizard\StepOne.tsx` | 31 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\components\application\wizard\StepOne.tsx` | 178 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\components\auth\AuthLayout.tsx` | 11 | framer-motion | framer-motion-import | Remove framer-motion dependency. Use CSS transitions or Tailwind animate-* classes instead. |
| `src\components\auth\AuthLayout.tsx` | 89 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\components\auth\AuthLayout.tsx` | 96 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\components\auth\AuthLayout.tsx` | 104 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\components\auth\AuthLayout.tsx` | 112 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\components\auth\AuthLayout.tsx` | 121 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\components\auth\AuthLayout.tsx` | 126 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\components\auth\AuthLayout.tsx` | 144 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\components\auth\AuthLayout.tsx` | 200 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\components\blocks\cta-section.tsx` | 8 | framer-motion | framer-motion-import | Remove framer-motion dependency. Use CSS transitions or Tailwind animate-* classes instead. |
| `src\components\blocks\cta-section.tsx` | 80 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\components\blocks\cta-section.tsx` | 118 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\components\blocks\feature-grid.tsx` | 8 | framer-motion | framer-motion-import | Remove framer-motion dependency. Use CSS transitions or Tailwind animate-* classes instead. |
| `src\components\blocks\feature-grid.tsx` | 106 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\components\blocks\hero-section.tsx` | 8 | framer-motion | framer-motion-import | Remove framer-motion dependency. Use CSS transitions or Tailwind animate-* classes instead. |
| `src\components\blocks\hero-section.tsx` | 111 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\components\blocks\hero-section.tsx` | 119 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\components\blocks\hero-section.tsx` | 127 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\components\blocks\hero-section.tsx` | 139 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\components\blocks\hero-section.tsx` | 149 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\components\blocks\hero-section.tsx` | 182 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\components\blocks\hero-section.tsx` | 204 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\components\blocks\hero-section.tsx` | 213 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\components\DashboardRedirect.tsx` | 3 | framer-motion | framer-motion-import | Remove framer-motion dependency. Use CSS transitions or Tailwind animate-* classes instead. |
| `src\components\eligibility\DetailedScoreBreakdown.tsx` | 9 | framer-motion | framer-motion-import | Remove framer-motion dependency. Use CSS transitions or Tailwind animate-* classes instead. |
| `src\components\eligibility\DetailedScoreBreakdown.tsx` | 237 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\components\eligibility\DetailedScoreBreakdown.tsx` | 320 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\components\eligibility\DetailedScoreBreakdown.tsx` | 391 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\components\eligibility\DetailedScoreBreakdown.tsx` | 235 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\components\eligibility\DetailedScoreBreakdown.tsx` | 318 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\components\eligibility\DetailedScoreBreakdown.tsx` | 389 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\components\navigation\BaseNavigation.tsx` | 2 | framer-motion | framer-motion-import | Remove framer-motion dependency. Use CSS transitions or Tailwind animate-* classes instead. |
| `src\components\navigation\BaseNavigation.tsx` | 113 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\components\navigation\BaseNavigation.tsx` | 122 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\components\navigation\BaseNavigation.tsx` | 132 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\components\navigation\BaseNavigation.tsx` | 152 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\components\navigation\BaseNavigation.tsx` | 162 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\components\navigation\BaseNavigation.tsx` | 174 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\components\navigation\BaseNavigation.tsx` | 192 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\components\navigation\BaseNavigation.tsx` | 120 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\components\navigation\BaseNavigation.tsx` | 148 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\components\navigation\DesktopSidebar.tsx` | 4 | framer-motion | framer-motion-import | Remove framer-motion dependency. Use CSS transitions or Tailwind animate-* classes instead. |
| `src\components\navigation\DesktopSidebar.tsx` | 128 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\components\navigation\DesktopSidebar.tsx` | 193 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\components\navigation\DesktopSidebar.tsx` | 203 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\components\navigation\DesktopSidebar.tsx` | 252 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\components\navigation\DesktopSidebar.tsx` | 264 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\components\navigation\DesktopSidebar.tsx` | 321 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\components\navigation\DesktopSidebar.tsx` | 342 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\components\navigation\DesktopSidebar.tsx` | 126 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\components\navigation\DesktopSidebar.tsx` | 191 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\components\navigation\DesktopSidebar.tsx` | 262 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\components\navigation\DesktopSidebar.tsx` | 340 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\components\notifications\NotificationAnalytics.tsx` | 3 | framer-motion | framer-motion-import | Remove framer-motion dependency. Use CSS transitions or Tailwind animate-* classes instead. |
| `src\components\notifications\PushNotificationSettings.tsx` | 3 | framer-motion | framer-motion-import | Remove framer-motion dependency. Use CSS transitions or Tailwind animate-* classes instead. |
| `src\components\notifications\PushNotificationSettings.tsx` | 294 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\components\notifications\PushNotificationSettings.tsx` | 368 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\components\pwa\OfflineIndicator.tsx` | 2 | framer-motion | framer-motion-import | Remove framer-motion dependency. Use CSS transitions or Tailwind animate-* classes instead. |
| `src\components\pwa\OfflineIndicator.tsx` | 53 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\components\pwa\OfflineIndicator.tsx` | 92 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\components\pwa\OfflineIndicator.tsx` | 52 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\components\pwa\OfflineIndicator.tsx` | 90 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\components\smoothui\animated-file-upload.tsx` | 9 | framer-motion | framer-motion-import | Remove framer-motion dependency. Use CSS transitions or Tailwind animate-* classes instead. |
| `src\components\smoothui\animated-file-upload.tsx` | 87 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\components\smoothui\animated-file-upload.tsx` | 119 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\components\smoothui\animated-file-upload.tsx` | 126 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\components\smoothui\animated-file-upload.tsx` | 142 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\components\smoothui\animated-file-upload.tsx` | 155 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\components\smoothui\animated-file-upload.tsx` | 162 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\components\smoothui\animated-file-upload.tsx` | 184 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\components\smoothui\animated-file-upload.tsx` | 200 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\components\smoothui\animated-file-upload.tsx` | 207 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\components\smoothui\animated-file-upload.tsx` | 230 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\components\smoothui\animated-file-upload.tsx` | 117 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\components\smoothui\animated-file-upload.tsx` | 228 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\components\smoothui\animated-input.tsx` | 9 | framer-motion | framer-motion-import | Remove framer-motion dependency. Use CSS transitions or Tailwind animate-* classes instead. |
| `src\components\smoothui\animated-input.tsx` | 61 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\components\smoothui\animated-input.tsx` | 80 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\components\smoothui\animated-input.tsx` | 112 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\components\smoothui\animated-input.tsx` | 131 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\components\smoothui\animated-select.tsx` | 9 | framer-motion | framer-motion-import | Remove framer-motion dependency. Use CSS transitions or Tailwind animate-* classes instead. |
| `src\components\smoothui\animated-select.tsx` | 70 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\components\smoothui\animated-select.tsx` | 89 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\components\smoothui\animated-select.tsx` | 135 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\components\smoothui\animated-select.tsx` | 147 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\components\smoothui\animated-select.tsx` | 166 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\components\smoothui\page-transition.tsx` | 10 | framer-motion | framer-motion-import | Remove framer-motion dependency. Use CSS transitions or Tailwind animate-* classes instead. |
| `src\components\smoothui\page-transition.tsx` | 45 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\components\smoothui\page-transition.tsx` | 190 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\components\smoothui\page-transition.tsx` | 222 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\components\smoothui\page-transition.tsx` | 261 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\components\smoothui\page-transition.tsx` | 161 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\components\smoothui\page-transition.tsx` | 189 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\components\smoothui\page-transition.tsx` | 260 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\components\smoothui\scroll-reveal.tsx` | 8 | framer-motion | framer-motion-import | Remove framer-motion dependency. Use CSS transitions or Tailwind animate-* classes instead. |
| `src\components\smoothui\scroll-reveal.tsx` | 55 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\components\smoothui\scroll-reveal.tsx` | 105 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\components\smoothui\scroll-reveal.tsx` | 138 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\components\student\ApplicationSlipActions.tsx` | 4 | framer-motion | framer-motion-import | Remove framer-motion dependency. Use CSS transitions or Tailwind animate-* classes instead. |
| `src\components\student\ApplicationSlipActions.tsx` | 126 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\components\student\ApplicationTimeline.tsx` | 9 | framer-motion | framer-motion-import | Remove framer-motion dependency. Use CSS transitions or Tailwind animate-* classes instead. |
| `src\components\student\ApplicationTimeline.tsx` | 115 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\components\student\DashboardStatusOverview.tsx` | 9 | framer-motion | framer-motion-import | Remove framer-motion dependency. Use CSS transitions or Tailwind animate-* classes instead. |
| `src\components\student\DashboardStatusOverview.tsx` | 130 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\components\student\DashboardStatusOverview.tsx` | 236 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\components\student\DashboardStatusOverview.tsx` | 243 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\components\student\DashboardStatusOverview.tsx` | 251 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\components\student\DashboardStatusOverview.tsx` | 294 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\components\student\NotificationBell.tsx` | 2 | framer-motion | framer-motion-import | Remove framer-motion dependency. Use CSS transitions or Tailwind animate-* classes instead. |
| `src\components\student\NotificationBell.tsx` | 80 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\components\student\NotificationBell.tsx` | 101 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\components\student\NotificationBell.tsx` | 157 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\components\student\NotificationBell.tsx` | 92 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\components\student\QuickActions.tsx` | 10 | framer-motion | framer-motion-import | Remove framer-motion dependency. Use CSS transitions or Tailwind animate-* classes instead. |
| `src\components\student\QuickActions.tsx` | 99 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\components\student\QuickActions.tsx` | 168 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\components\student\QuickActions.tsx` | 175 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\components\student\QuickActions.tsx` | 197 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\components\student\QuickActions.tsx` | 210 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\components\student\QuickActions.tsx` | 222 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\components\student\QuickActions.tsx` | 234 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\components\ui\AdminNavigation.tsx` | 3 | framer-motion | framer-motion-import | Remove framer-motion dependency. Use CSS transitions or Tailwind animate-* classes instead. |
| `src\components\ui\AdminNavigation.tsx` | 77 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\components\ui\AnimatedCard.tsx` | 2 | framer-motion | framer-motion-import | Remove framer-motion dependency. Use CSS transitions or Tailwind animate-* classes instead. |
| `src\components\ui\AnimatedCard.tsx` | 118 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\components\ui\AnimatedSection.tsx` | 2 | framer-motion | framer-motion-import | Remove framer-motion dependency. Use CSS transitions or Tailwind animate-* classes instead. |
| `src\components\ui\AnimatedSection.tsx` | 20 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\components\ui\Card.tsx` | 2 | framer-motion | framer-motion-import | Remove framer-motion dependency. Use CSS transitions or Tailwind animate-* classes instead. |
| `src\components\ui\Card.tsx` | 31 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\components\ui\Card.tsx` | 46 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\components\ui\ConfirmDialog.tsx` | 2 | framer-motion | framer-motion-import | Remove framer-motion dependency. Use CSS transitions or Tailwind animate-* classes instead. |
| `src\components\ui\ConfirmDialog.tsx` | 37 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\components\ui\ConfirmDialog.tsx` | 47 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\components\ui\ConfirmDialog.tsx` | 33 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\components\ui\EnhancedLoadingSpinner.tsx` | 67 | css | css-animation-property | Ensure animation uses GPU-accelerated properties (transform, opacity) only. |
| `src\components\ui\FancyPreloader.tsx` | 2 | framer-motion | framer-motion-import | Remove framer-motion dependency. Use CSS transitions or Tailwind animate-* classes instead. |
| `src\components\ui\FancyPreloader.tsx` | 7 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\components\ui\FancyPreloader.tsx` | 15 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\components\ui\FancyPreloader.tsx` | 27 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\components\ui\FancyPreloader.tsx` | 42 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\components\ui\FancyPreloader.tsx` | 52 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\components\ui\FancyPreloader.tsx` | 64 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\components\ui\FloatingElements.tsx` | 2 | framer-motion | framer-motion-import | Remove framer-motion dependency. Use CSS transitions or Tailwind animate-* classes instead. |
| `src\components\ui\FloatingElements.tsx` | 30 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\components\ui\FloatingElements.tsx` | 87 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\components\ui\FloatingElements.tsx` | 99 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\components\ui\FloatingElements.tsx` | 111 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\components\ui\FloatingElements.tsx` | 124 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\components\ui\FloatingOrbs.tsx` | 2 | framer-motion | framer-motion-import | Remove framer-motion dependency. Use CSS transitions or Tailwind animate-* classes instead. |
| `src\components\ui\FloatingOrbs.tsx` | 23 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\components\ui\FloatingOrbs.tsx` | 33 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\components\ui\FloatingOrbs.tsx` | 43 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\components\ui\FormFeedback.tsx` | 8 | framer-motion | framer-motion-import | Remove framer-motion dependency. Use CSS transitions or Tailwind animate-* classes instead. |
| `src\components\ui\FormFeedback.tsx` | 131 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\components\ui\FormFeedback.tsx` | 189 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\components\ui\FormFeedback.tsx` | 130 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\components\ui\Input.tsx` | 2 | framer-motion | framer-motion-import | Remove framer-motion dependency. Use CSS transitions or Tailwind animate-* classes instead. |
| `src\components\ui\Input.tsx` | 52 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\components\ui\Input.tsx` | 62 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\components\ui\OfflineIndicator.tsx` | 21 | framer-motion | framer-motion-import | Remove framer-motion dependency. Use CSS transitions or Tailwind animate-* classes instead. |
| `src\components\ui\OfflineIndicator.tsx` | 70 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\components\ui\OfflineIndicator.tsx` | 80 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\components\ui\OfflineIndicator.tsx` | 92 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\components\ui\OfflineIndicator.tsx` | 90 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\components\ui\PageHeader.tsx` | 2 | framer-motion | framer-motion-import | Remove framer-motion dependency. Use CSS transitions or Tailwind animate-* classes instead. |
| `src\components\ui\PageHeader.tsx` | 144 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\components\ui\PasswordInput.tsx` | 4 | framer-motion | framer-motion-import | Remove framer-motion dependency. Use CSS transitions or Tailwind animate-* classes instead. |
| `src\components\ui\PasswordInput.tsx` | 61 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\components\ui\PasswordInput.tsx` | 70 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\components\ui\ProfileAutoPopulationIndicator.tsx` | 2 | framer-motion | framer-motion-import | Remove framer-motion dependency. Use CSS transitions or Tailwind animate-* classes instead. |
| `src\components\ui\ProfileAutoPopulationIndicator.tsx` | 14 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\components\ui\ProfileAutoPopulationIndicator.tsx` | 37 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\components\ui\ProgressIndicator.tsx` | 8 | framer-motion | framer-motion-import | Remove framer-motion dependency. Use CSS transitions or Tailwind animate-* classes instead. |
| `src\components\ui\ProgressIndicator.tsx` | 61 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\components\ui\ProgressIndicator.tsx` | 154 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\components\ui\ProgressIndicator.tsx` | 209 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\components\ui\SaveStatusIndicator.tsx` | 2 | framer-motion | framer-motion-import | Remove framer-motion dependency. Use CSS transitions or Tailwind animate-* classes instead. |
| `src\components\ui\SaveStatusIndicator.tsx` | 114 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\components\ui\SaveStatusIndicator.tsx` | 194 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\components\ui\SaveStatusIndicator.tsx` | 236 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\components\ui\SaveStatusIndicator.tsx` | 113 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\components\ui\SaveStatusIndicator.tsx` | 235 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\components\ui\SkeletonLoader.tsx` | 2 | framer-motion | framer-motion-import | Remove framer-motion dependency. Use CSS transitions or Tailwind animate-* classes instead. |
| `src\components\ui\SkeletonLoader.tsx` | 55 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\components\ui\StatusIcon.tsx` | 2 | framer-motion | framer-motion-import | Remove framer-motion dependency. Use CSS transitions or Tailwind animate-* classes instead. |
| `src\components\ui\StatusIcon.tsx` | 44 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\components\ui\TouchButton.tsx` | 3 | framer-motion | framer-motion-import | Remove framer-motion dependency. Use CSS transitions or Tailwind animate-* classes instead. |
| `src\components\ui\TouchButton.tsx` | 35 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\components\ui\TypewriterText.tsx` | 2 | framer-motion | framer-motion-import | Remove framer-motion dependency. Use CSS transitions or Tailwind animate-* classes instead. |
| `src\components\ui\TypewriterText.tsx` | 57 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\index.css` | 268 | css | css-animation-property | Ensure animation uses GPU-accelerated properties (transform, opacity) only. |
| `src\pages\admin\Applications.tsx` | 2 | framer-motion | framer-motion-import | Remove framer-motion dependency. Use CSS transitions or Tailwind animate-* classes instead. |
| `src\pages\admin\Dashboard.tsx` | 37 | framer-motion | framer-motion-import | Remove framer-motion dependency. Use CSS transitions or Tailwind animate-* classes instead. |
| `src\pages\admin\Dashboard.tsx` | 290 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\pages\admin\Dashboard.tsx` | 348 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\pages\admin\Dashboard.tsx` | 384 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\pages\admin\Dashboard.tsx` | 433 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\pages\admin\Dashboard.tsx` | 346 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\pages\admin\EnhancedDashboard.tsx` | 3 | framer-motion | framer-motion-import | Remove framer-motion dependency. Use CSS transitions or Tailwind animate-* classes instead. |
| `src\pages\admin\EnhancedDashboard.tsx` | 73 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\pages\admin\EnhancedDashboard.tsx` | 108 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\pages\admin\EnhancedDashboard.tsx` | 170 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\pages\admin\EnhancedDashboard.tsx` | 201 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\pages\admin\EnhancedDashboard.tsx` | 244 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\pages\admin\EnhancedDashboard.tsx` | 270 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\pages\admin\EnhancedDashboard.tsx` | 281 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\pages\admin\EnhancedDashboard.tsx` | 299 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\pages\admin\EnhancedDashboard.tsx` | 199 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\pages\admin\EnhancedDashboard.tsx` | 242 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\pages\admin\WorkflowAutomation.tsx` | 2 | framer-motion | framer-motion-import | Remove framer-motion dependency. Use CSS transitions or Tailwind animate-* classes instead. |
| `src\pages\admin\WorkflowAutomation.tsx` | 163 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\pages\admin\WorkflowAutomation.tsx` | 181 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\pages\admin\WorkflowAutomation.tsx` | 199 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\pages\admin\WorkflowAutomation.tsx` | 217 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\pages\admin\WorkflowAutomation.tsx` | 247 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\pages\auth\ForgotPasswordPage.tsx` | 13 | framer-motion | framer-motion-import | Remove framer-motion dependency. Use CSS transitions or Tailwind animate-* classes instead. |
| `src\pages\auth\ForgotPasswordPage.tsx` | 142 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\pages\auth\ForgotPasswordPage.tsx` | 149 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\pages\auth\ForgotPasswordPage.tsx` | 205 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\pages\auth\ForgotPasswordPage.tsx` | 225 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\pages\auth\ForgotPasswordPage.tsx` | 223 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\pages\auth\ResetPasswordPage.tsx` | 12 | framer-motion | framer-motion-import | Remove framer-motion dependency. Use CSS transitions or Tailwind animate-* classes instead. |
| `src\pages\auth\ResetPasswordPage.tsx` | 206 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\pages\auth\ResetPasswordPage.tsx` | 212 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\pages\auth\ResetPasswordPage.tsx` | 233 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\pages\auth\ResetPasswordPage.tsx` | 240 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\pages\auth\ResetPasswordPage.tsx` | 282 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\pages\auth\ResetPasswordPage.tsx` | 289 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\pages\auth\ResetPasswordPage.tsx` | 338 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\pages\auth\ResetPasswordPage.tsx` | 374 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\pages\auth\ResetPasswordPage.tsx` | 372 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\pages\auth\SignInPage.tsx` | 14 | framer-motion | framer-motion-import | Remove framer-motion dependency. Use CSS transitions or Tailwind animate-* classes instead. |
| `src\pages\auth\SignInPage.tsx` | 166 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\pages\auth\SignInPage.tsx` | 183 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\pages\auth\SignInPage.tsx` | 202 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\pages\auth\SignInPage.tsx` | 218 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\pages\auth\SignInPage.tsx` | 200 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\pages\auth\SignUpPage.tsx` | 14 | framer-motion | framer-motion-import | Remove framer-motion dependency. Use CSS transitions or Tailwind animate-* classes instead. |
| `src\pages\auth\SignUpPage.tsx` | 224 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\pages\auth\SignUpPage.tsx` | 230 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\pages\auth\SignUpPage.tsx` | 276 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\pages\auth\SignUpPage.tsx` | 308 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\pages\auth\SignUpPage.tsx` | 321 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\pages\auth\SignUpPage.tsx` | 334 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\pages\auth\SignUpPage.tsx` | 356 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\pages\auth\SignUpPage.tsx` | 384 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\pages\auth\SignUpPage.tsx` | 409 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\pages\auth\SignUpPage.tsx` | 452 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\pages\auth\SignUpPage.tsx` | 487 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\pages\auth\SignUpPage.tsx` | 513 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\pages\auth\SignUpPage.tsx` | 530 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\pages\auth\SignUpPage.tsx` | 549 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\pages\auth\SignUpPage.tsx` | 306 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\pages\auth\SignUpPage.tsx` | 511 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\pages\public\tracker\components\ApplicationInfoGrid.tsx` | 2 | framer-motion | framer-motion-import | Remove framer-motion dependency. Use CSS transitions or Tailwind animate-* classes instead. |
| `src\pages\public\tracker\components\ApplicationInfoGrid.tsx` | 24 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\pages\public\tracker\components\ApplicationInfoGrid.tsx` | 46 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\pages\public\tracker\components\ApplicationStatusDetails.tsx` | 2 | framer-motion | framer-motion-import | Remove framer-motion dependency. Use CSS transitions or Tailwind animate-* classes instead. |
| `src\pages\public\tracker\components\ApplicationStatusDetails.tsx` | 39 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\pages\public\tracker\components\ApplicationStatusDetails.tsx` | 69 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\pages\public\tracker\components\ApplicationStatusDetails.tsx` | 67 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\pages\public\tracker\components\ApplicationStatusHeader.tsx` | 2 | framer-motion | framer-motion-import | Remove framer-motion dependency. Use CSS transitions or Tailwind animate-* classes instead. |
| `src\pages\public\tracker\components\ApplicationStatusHeader.tsx` | 57 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\pages\public\tracker\components\ApplicationStatusHeader.tsx` | 68 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\pages\public\tracker\components\ApplicationStatusHeader.tsx` | 86 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\pages\public\tracker\components\HelpSection.tsx` | 2 | framer-motion | framer-motion-import | Remove framer-motion dependency. Use CSS transitions or Tailwind animate-* classes instead. |
| `src\pages\public\tracker\components\HelpSection.tsx` | 11 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\pages\public\tracker\components\NoResultsView.tsx` | 3 | framer-motion | framer-motion-import | Remove framer-motion dependency. Use CSS transitions or Tailwind animate-* classes instead. |
| `src\pages\public\tracker\components\NoResultsView.tsx` | 18 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\pages\public\tracker\components\TrackerSearchSection.tsx` | 2 | framer-motion | framer-motion-import | Remove framer-motion dependency. Use CSS transitions or Tailwind animate-* classes instead. |
| `src\pages\public\tracker\components\TrackerSearchSection.tsx` | 66 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\pages\public\tracker\components\TrackerSearchSection.tsx` | 64 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\pages\public\tracker\index.tsx` | 4 | framer-motion | framer-motion-import | Remove framer-motion dependency. Use CSS transitions or Tailwind animate-* classes instead. |
| `src\pages\public\tracker\index.tsx` | 279 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\pages\public\tracker\index.tsx` | 313 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\pages\public\tracker\index.tsx` | 277 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\pages\public\tracker\index.tsx` | 311 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\pages\student\ApplicationDetail.tsx` | 4 | framer-motion | framer-motion-import | Remove framer-motion dependency. Use CSS transitions or Tailwind animate-* classes instead. |
| `src\pages\student\ApplicationDetail.tsx` | 136 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\pages\student\ApplicationDetail.tsx` | 163 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\pages\student\ApplicationDetail.tsx` | 174 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\pages\student\ApplicationDetail.tsx` | 195 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\pages\student\ApplicationDetail.tsx` | 235 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\pages\student\ApplicationDetail.tsx` | 270 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\pages\student\ApplicationDetail.tsx` | 321 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\pages\student\ApplicationStatus.tsx` | 10 | framer-motion | framer-motion-import | Remove framer-motion dependency. Use CSS transitions or Tailwind animate-* classes instead. |
| `src\pages\student\ApplicationStatus.tsx` | 274 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\pages\student\ApplicationStatus.tsx` | 386 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\pages\student\ApplicationStatus.tsx` | 413 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\pages\student\ApplicationStatus.tsx` | 441 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\pages\student\applicationWizard\components\AnalyticsDashboard.tsx` | 2 | framer-motion | framer-motion-import | Remove framer-motion dependency. Use CSS transitions or Tailwind animate-* classes instead. |
| `src\pages\student\applicationWizard\components\AnalyticsDashboard.tsx` | 69 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\pages\student\applicationWizard\components\ApplicationPreview.tsx` | 1 | framer-motion | framer-motion-import | Remove framer-motion dependency. Use CSS transitions or Tailwind animate-* classes instead. |
| `src\pages\student\applicationWizard\components\ApplicationPreview.tsx` | 16 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\pages\student\applicationWizard\components\DraftManager.tsx` | 2 | framer-motion | framer-motion-import | Remove framer-motion dependency. Use CSS transitions or Tailwind animate-* classes instead. |
| `src\pages\student\applicationWizard\components\DraftManager.tsx` | 83 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\pages\student\applicationWizard\components\DraftManager.tsx` | 90 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\pages\student\applicationWizard\components\DraftManager.tsx` | 142 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\pages\student\applicationWizard\components\DraftManager.tsx` | 80 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\pages\student\applicationWizard\components\EnhancedProgressIndicator.tsx` | 8 | framer-motion | framer-motion-import | Remove framer-motion dependency. Use CSS transitions or Tailwind animate-* classes instead. |
| `src\pages\student\applicationWizard\components\EnhancedProgressIndicator.tsx` | 88 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\pages\student\applicationWizard\components\EnhancedProgressIndicator.tsx` | 106 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\pages\student\applicationWizard\components\EnhancedProgressIndicator.tsx` | 122 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\pages\student\applicationWizard\components\EnhancedProgressIndicator.tsx` | 137 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\pages\student\applicationWizard\components\EnhancedProgressIndicator.tsx` | 155 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\pages\student\applicationWizard\components\EnhancedProgressIndicator.tsx` | 172 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\pages\student\applicationWizard\components\EnhancedProgressIndicator.tsx` | 188 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\pages\student\applicationWizard\components\EnhancedProgressIndicator.tsx` | 205 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\pages\student\applicationWizard\components\EnhancedProgressIndicator.tsx` | 280 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\pages\student\applicationWizard\components\EnhancedProgressIndicator.tsx` | 300 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\pages\student\applicationWizard\components\EnhancedProgressIndicator.tsx` | 315 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\pages\student\applicationWizard\components\EnhancedProgressIndicator.tsx` | 324 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\pages\student\applicationWizard\components\EnhancedProgressIndicator.tsx` | 351 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\pages\student\applicationWizard\components\EnhancedProgressIndicator.tsx` | 366 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\pages\student\applicationWizard\components\EnhancedProgressIndicator.tsx` | 408 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\pages\student\applicationWizard\components\EnhancedProgressIndicator.tsx` | 478 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\pages\student\applicationWizard\components\EnhancedProgressIndicator.tsx` | 120 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\pages\student\applicationWizard\components\EnhancedProgressIndicator.tsx` | 313 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\pages\student\applicationWizard\components\KeyboardShortcutsHelp.tsx` | 2 | framer-motion | framer-motion-import | Remove framer-motion dependency. Use CSS transitions or Tailwind animate-* classes instead. |
| `src\pages\student\applicationWizard\components\KeyboardShortcutsHelp.tsx` | 31 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\pages\student\applicationWizard\components\KeyboardShortcutsHelp.tsx` | 38 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\pages\student\applicationWizard\components\KeyboardShortcutsHelp.tsx` | 28 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\pages\student\applicationWizard\components\ReminderSettings.tsx` | 2 | framer-motion | framer-motion-import | Remove framer-motion dependency. Use CSS transitions or Tailwind animate-* classes instead. |
| `src\pages\student\applicationWizard\components\ReminderSettings.tsx` | 56 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\pages\student\applicationWizard\components\StepChecklist.tsx` | 2 | framer-motion | framer-motion-import | Remove framer-motion dependency. Use CSS transitions or Tailwind animate-* classes instead. |
| `src\pages\student\applicationWizard\components\StepChecklist.tsx` | 19 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\pages\student\applicationWizard\components\StepChecklist.tsx` | 32 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\pages\student\applicationWizard\components\StepTransition.tsx` | 9 | framer-motion | framer-motion-import | Remove framer-motion dependency. Use CSS transitions or Tailwind animate-* classes instead. |
| `src\pages\student\applicationWizard\components\StepTransition.tsx` | 104 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\pages\student\applicationWizard\components\StepTransition.tsx` | 127 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\pages\student\applicationWizard\components\StepTransition.tsx` | 137 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\pages\student\applicationWizard\components\StepTransition.tsx` | 169 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\pages\student\applicationWizard\components\StepTransition.tsx` | 191 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\pages\student\applicationWizard\components\StepTransition.tsx` | 198 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\pages\student\applicationWizard\components\StepTransition.tsx` | 103 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\pages\student\applicationWizard\components\SubmissionSuccess.tsx` | 1 | framer-motion | framer-motion-import | Remove framer-motion dependency. Use CSS transitions or Tailwind animate-* classes instead. |
| `src\pages\student\applicationWizard\components\SubmissionSuccess.tsx` | 73 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\pages\student\applicationWizard\components\SubmissionSuccess.tsx` | 79 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\pages\student\applicationWizard\components\SubmissionSuccess.tsx` | 86 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\pages\student\applicationWizard\index.tsx` | 1 | framer-motion | framer-motion-import | Remove framer-motion dependency. Use CSS transitions or Tailwind animate-* classes instead. |
| `src\pages\student\applicationWizard\index.tsx` | 250 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\pages\student\applicationWizard\index.tsx` | 277 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\pages\student\applicationWizard\index.tsx` | 381 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\pages\student\applicationWizard\index.tsx` | 404 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\pages\student\applicationWizard\index.tsx` | 495 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\pages\student\applicationWizard\index.tsx` | 498 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\pages\student\applicationWizard\index.tsx` | 509 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\pages\student\applicationWizard\index.tsx` | 515 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\pages\student\applicationWizard\index.tsx` | 544 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\pages\student\applicationWizard\index.tsx` | 427 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\pages\student\applicationWizard\steps\BasicKycStep.tsx` | 3 | framer-motion | framer-motion-import | Remove framer-motion dependency. Use CSS transitions or Tailwind animate-* classes instead. |
| `src\pages\student\applicationWizard\steps\BasicKycStep.tsx` | 90 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\pages\student\applicationWizard\steps\BasicKycStep.tsx` | 107 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\pages\student\applicationWizard\steps\BasicKycStep.tsx` | 122 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\pages\student\applicationWizard\steps\BasicKycStep.tsx` | 128 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\pages\student\applicationWizard\steps\BasicKycStep.tsx` | 136 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\pages\student\applicationWizard\steps\BasicKycStep.tsx` | 153 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\pages\student\applicationWizard\steps\BasicKycStep.tsx` | 162 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\pages\student\applicationWizard\steps\BasicKycStep.tsx` | 171 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\pages\student\applicationWizard\steps\BasicKycStep.tsx` | 186 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\pages\student\applicationWizard\steps\BasicKycStep.tsx` | 202 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\pages\student\applicationWizard\steps\BasicKycStep.tsx` | 211 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\pages\student\applicationWizard\steps\BasicKycStep.tsx` | 219 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\pages\student\applicationWizard\steps\BasicKycStep.tsx` | 228 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\pages\student\applicationWizard\steps\BasicKycStep.tsx` | 236 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\pages\student\applicationWizard\steps\BasicKycStep.tsx` | 244 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\pages\student\applicationWizard\steps\BasicKycStep.tsx` | 260 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\pages\student\applicationWizard\steps\BasicKycStep.tsx` | 281 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\pages\student\applicationWizard\steps\EducationStep.tsx` | 3 | framer-motion | framer-motion-import | Remove framer-motion dependency. Use CSS transitions or Tailwind animate-* classes instead. |
| `src\pages\student\applicationWizard\steps\EducationStep.tsx` | 106 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\pages\student\applicationWizard\steps\EducationStep.tsx` | 117 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\pages\student\applicationWizard\steps\EducationStep.tsx` | 123 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\pages\student\applicationWizard\steps\EducationStep.tsx` | 149 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\pages\student\applicationWizard\steps\EducationStep.tsx` | 177 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\pages\student\applicationWizard\steps\EducationStep.tsx` | 248 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\pages\student\applicationWizard\steps\EducationStep.tsx` | 253 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\pages\student\applicationWizard\steps\PaymentStep.tsx` | 4 | framer-motion | framer-motion-import | Remove framer-motion dependency. Use CSS transitions or Tailwind animate-* classes instead. |
| `src\pages\student\applicationWizard\steps\PaymentStep.tsx` | 81 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\pages\student\applicationWizard\steps\PaymentStep.tsx` | 93 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\pages\student\applicationWizard\steps\PaymentStep.tsx` | 143 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\pages\student\applicationWizard\steps\PaymentStep.tsx` | 149 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\pages\student\applicationWizard\steps\PaymentStep.tsx` | 160 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\pages\student\applicationWizard\steps\PaymentStep.tsx` | 169 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\pages\student\applicationWizard\steps\PaymentStep.tsx` | 178 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\pages\student\applicationWizard\steps\PaymentStep.tsx` | 189 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\pages\student\applicationWizard\steps\PaymentStep.tsx` | 198 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\pages\student\applicationWizard\steps\PaymentStep.tsx` | 209 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\pages\student\applicationWizard\steps\SubmitStep.tsx` | 1 | framer-motion | framer-motion-import | Remove framer-motion dependency. Use CSS transitions or Tailwind animate-* classes instead. |
| `src\pages\student\applicationWizard\steps\SubmitStep.tsx` | 54 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\pages\student\Dashboard.tsx` | 4 | framer-motion | framer-motion-import | Remove framer-motion dependency. Use CSS transitions or Tailwind animate-* classes instead. |
| `src\pages\student\Dashboard.tsx` | 426 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\pages\student\Dashboard.tsx` | 484 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\pages\student\Dashboard.tsx` | 650 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\pages\student\Dashboard.tsx` | 764 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\pages\student\NotificationSettings.tsx` | 4 | framer-motion | framer-motion-import | Remove framer-motion dependency. Use CSS transitions or Tailwind animate-* classes instead. |
| `src\pages\student\NotificationSettings.tsx` | 193 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\pages\student\NotificationSettings.tsx` | 286 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\pages\student\NotificationSettings.tsx` | 299 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\pages\student\NotificationSettings.tsx` | 312 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\pages\student\Settings.tsx` | 13 | framer-motion | framer-motion-import | Remove framer-motion dependency. Use CSS transitions or Tailwind animate-* classes instead. |
| `src\pages\student\Settings.tsx` | 101 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\pages\student\Settings.tsx` | 116 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\pages\student\Settings.tsx` | 129 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\pages\student\Settings.tsx` | 143 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\pages\student\Settings.tsx` | 225 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\pages\student\Settings.tsx` | 262 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\pages\student\Settings.tsx` | 299 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\pages\student\Settings.tsx` | 318 | framer-motion | framer-motion-component | Replace motion.* components with standard HTML elements and CSS transitions. |
| `src\styles\accreditation.css` | 121 | css | css-animation-property | Ensure animation uses GPU-accelerated properties (transform, opacity) only. |
| `src\styles\accreditation.css` | 32 | css | css-transition-complex | Simplify transition. Avoid transitioning multiple properties simultaneously. |
| `src\styles\accreditation.css` | 56 | css | css-transition-complex | Simplify transition. Avoid transitioning multiple properties simultaneously. |
| `src\styles\animations.css` | 104 | css | css-animation-property | Ensure animation uses GPU-accelerated properties (transform, opacity) only. |
| `src\styles\animations.css` | 120 | css | css-animation-property | Ensure animation uses GPU-accelerated properties (transform, opacity) only. |
| `src\styles\animations.css` | 180 | css | css-animation-property | Ensure animation uses GPU-accelerated properties (transform, opacity) only. |
| `src\styles\animations.css` | 196 | css | css-animation-property | Ensure animation uses GPU-accelerated properties (transform, opacity) only. |
| `src\styles\animations.css` | 126 | css | css-transition-complex | Simplify transition. Avoid transitioning multiple properties simultaneously. |
| `src\styles\animations.css` | 136 | css | css-transition-complex | Simplify transition. Avoid transitioning multiple properties simultaneously. |
| `src\styles\animations.css` | 142 | css | css-transition-complex | Simplify transition. Avoid transitioning multiple properties simultaneously. |
| `src\styles\animations.css` | 156 | css | css-transition-complex | Simplify transition. Avoid transitioning multiple properties simultaneously. |
| `src\styles\mobile-enhancements.css` | 80 | css | css-animation-property | Ensure animation uses GPU-accelerated properties (transform, opacity) only. |
| `src\styles\mobile-enhancements.css` | 121 | css | css-animation-property | Ensure animation uses GPU-accelerated properties (transform, opacity) only. |
| `src\styles\mobile-enhancements.css` | 555 | css | css-animation-property | Ensure animation uses GPU-accelerated properties (transform, opacity) only. |
| `src\styles\mobile-enhancements.css` | 133 | css | css-transition-complex | Simplify transition. Avoid transitioning multiple properties simultaneously. |
| `src\styles\mobile-enhancements.css` | 159 | css | css-transition-complex | Simplify transition. Avoid transitioning multiple properties simultaneously. |
| `src\styles\mobile-enhancements.css` | 188 | css | css-transition-complex | Simplify transition. Avoid transitioning multiple properties simultaneously. |
| `src\styles\mobile-enhancements.css` | 372 | css | css-transition-complex | Simplify transition. Avoid transitioning multiple properties simultaneously. |
| `src\styles\mobile-enhancements.css` | 510 | css | css-transition-complex | Simplify transition. Avoid transitioning multiple properties simultaneously. |
| `src\styles\mobile-enhancements.css` | 521 | css | css-transition-complex | Simplify transition. Avoid transitioning multiple properties simultaneously. |
| `src\styles\pwa.css` | 145 | css | css-animation-property | Ensure animation uses GPU-accelerated properties (transform, opacity) only. |
| `src\styles\pwa.css` | 252 | css | css-animation-property | Ensure animation uses GPU-accelerated properties (transform, opacity) only. |
| `src\styles\smooth-animations.css` | 44 | css | css-keyframes | Review keyframe animation complexity. Consider simplifying or using transform-only animations. |
| `src\styles\smooth-animations.css` | 174 | css | css-animation-property | Ensure animation uses GPU-accelerated properties (transform, opacity) only. |
| `src\styles\smooth-animations.css` | 178 | css | css-animation-property | Ensure animation uses GPU-accelerated properties (transform, opacity) only. |
| `src\styles\smooth-animations.css` | 182 | css | css-animation-property | Ensure animation uses GPU-accelerated properties (transform, opacity) only. |
| `src\styles\smooth-animations.css` | 283 | css | css-animation-property | Ensure animation uses GPU-accelerated properties (transform, opacity) only. |
| `src\styles\smooth-animations.css` | 293 | css | css-animation-property | Ensure animation uses GPU-accelerated properties (transform, opacity) only. |
| `src\styles\smooth-animations.css` | 297 | css | css-animation-property | Ensure animation uses GPU-accelerated properties (transform, opacity) only. |
| `src\styles\smooth-animations.css` | 301 | css | css-animation-property | Ensure animation uses GPU-accelerated properties (transform, opacity) only. |
| `src\styles\smooth-animations.css` | 211 | css | css-transition-complex | Simplify transition. Avoid transitioning multiple properties simultaneously. |
| `src\styles\smooth-animations.css` | 217 | css | css-transition-complex | Simplify transition. Avoid transitioning multiple properties simultaneously. |
| `src\styles\smooth-animations.css` | 223 | css | css-transition-complex | Simplify transition. Avoid transitioning multiple properties simultaneously. |
| `src\styles\smooth-animations.css` | 244 | css | css-transition-complex | Simplify transition. Avoid transitioning multiple properties simultaneously. |
| `src\styles\smooth-animations.css` | 261 | css | css-transition-complex | Simplify transition. Avoid transitioning multiple properties simultaneously. |

### Lightweight Animations (No Action Required)

173 lightweight animation(s) detected. These are acceptable for performance.

| File | Line | Library | Type |
|------|------|---------|------|
| `src\components\8starlabs\timeline.tsx` | 122 | css | css-animation-property |
| `src\components\8starlabs\timeline.tsx` | 193 | css | css-animation-property |
| `src\components\8starlabs\timeline.tsx` | 257 | css | css-animation-property |
| `src\components\admin\AdminSidebar.tsx` | 215 | css | css-animation-property |
| `src\components\admin\AdminSidebar.tsx` | 225 | css | css-animation-property |
| `src\components\admin\AnalyticsCharts.tsx` | 269 | css | css-animation-property |
| `src\components\admin\applications\ApplicationDetailModal.tsx` | 666 | css | css-animation-property |
| `src\components\admin\applications\ApplicationDetailModal.tsx` | 668 | css | css-animation-property |
| `src\components\admin\applications\ApplicationDetailModal.tsx` | 669 | css | css-animation-property |
| `src\components\admin\applications\ApplicationDetailModal.tsx` | 672 | css | css-animation-property |
| `src\components\admin\applications\ApplicationDetailModal.tsx` | 679 | css | css-animation-property |
| `src\components\admin\applications\ApplicationDetailModal.tsx` | 680 | css | css-animation-property |
| `src\components\admin\applications\ApplicationDetailModal.tsx` | 681 | css | css-animation-property |
| `src\components\admin\applications\ApplicationDetailModal.tsx` | 688 | css | css-animation-property |
| `src\components\admin\applications\ApplicationDetailModal.tsx` | 689 | css | css-animation-property |
| `src\components\admin\BulkNotificationManager.tsx` | 513 | css | css-animation-property |
| `src\components\admin\CacheMonitor.tsx` | 212 | css | css-animation-property |
| `src\components\admin\CommunicationModal.tsx` | 347 | css | css-animation-property |
| `src\components\admin\EnhancedApplicationsManager.tsx` | 332 | css | css-animation-property |
| `src\components\admin\EnhancedApplicationsTable.tsx` | 242 | css | css-animation-property |
| ... | ... | ... | ... |
| *(153 more)* | | | |

## Bundle Size Analysis

### Overall Status: ❌ EXCEEDS THRESHOLD

- **Total JS Size**: 4.18 MB (target: <500.00 KB)
- **Total CSS Size**: 150.75 KB
- **Estimated Gzip**: ~1.46 MB

### Chunk Summary

| Chunk Type | Count |
|------------|-------|
| Entry | 6 |
| Vendor | 3 |
| Lazy-loaded | 95 |
| CSS | 2 |
| **Total** | **121** |

### Top 10 Largest Chunks

| # | Chunk | Size | Type | Status |
|---|-------|------|------|--------|
| 1 | `vendor-excel-CACNO4NF.js` | 1.29 MB | vendor | ⚠️ Oversized |
| 2 | `vendor-pdf-C9V55MG-.js` | 917.21 KB | vendor | ⚠️ Oversized |
| 3 | `index-_ZXfiSGn.js` | 470.17 KB | entry | ⚠️ Oversized |
| 4 | `html2canvas.esm-CyxsxQj2.js` | 194.76 KB | lazy | ⚠️ Oversized |
| 5 | `index.es-BfpRQIwM.js` | 152.76 KB | entry | ✅ OK |
| 6 | `index-CsUIVMSX.js` | 117.90 KB | entry | ✅ OK |
| 7 | `Analytics-iU94B-pp.js` | 112.23 KB | lazy | ⚠️ Oversized |
| 8 | `schemas-CPix9jjG.js` | 89.23 KB | shared | ⚠️ Oversized |
| 9 | `useApplicationsData-6oQkkQc-.js` | 69.06 KB | shared | ⚠️ Oversized |
| 10 | `Users-Bzp5TXIG.js` | 66.17 KB | shared | ⚠️ Oversized |

### ⚠️ Oversized Chunks

These chunks exceed their type-specific thresholds:

| Chunk | Size | Type | Threshold | Over By |
|-------|------|------|-----------|---------|
| `Analytics-iU94B-pp.js` | 112.23 KB | lazy | 50.00 KB | +62.23 KB |
| `Applications-Bu_1evs_.js` | 51.04 KB | lazy | 50.00 KB | +1.04 KB |
| `html2canvas.esm-CyxsxQj2.js` | 194.76 KB | lazy | 50.00 KB | +144.76 KB |
| `index-_ZXfiSGn.js` | 470.17 KB | entry | 200.00 KB | +270.17 KB |
| `schemas-CPix9jjG.js` | 89.23 KB | shared | 50.00 KB | +39.23 KB |
| `useApplicationsData-6oQkkQc-.js` | 69.06 KB | shared | 50.00 KB | +19.06 KB |
| `Users-Bzp5TXIG.js` | 66.17 KB | shared | 50.00 KB | +16.17 KB |
| `vendor-excel-CACNO4NF.js` | 1.29 MB | vendor | 150.00 KB | +1.14 MB |
| `vendor-pdf-C9V55MG-.js` | 917.21 KB | vendor | 150.00 KB | +767.21 KB |
| `index-BbQsdQu8.css` | 148.89 KB | css | 100.00 KB | +48.89 KB |

### Bundle Recommendations

- Total bundle exceeds target by 3.70 MB. Priority: reduce bundle size.
- Entry chunks are large. Consider lazy-loading non-critical routes and components.
- 2 vendor chunk(s) exceed threshold. Review dependencies for lighter alternatives.
- Multiple chunks have similar sizes. Check for duplicate code that could be extracted to shared chunks.
- Total CSS is 150.75 KB. Consider purging unused Tailwind classes.

## All Performance Issues

### 🔴 High Impact Issues

These issues have the greatest impact on performance and should be addressed first.

#### HEAVY_ANIMATION — `src\components\8starlabs\partition-bar.tsx`:8

> framer-motion-import: import { motion, useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/utils';...

**Recommendation**: Remove framer-motion dependency. Use CSS transitions or Tailwind animate-* classes instead.

#### HEAVY_ANIMATION — `src\components\8starlabs\partition-bar.tsx`:74

> framer-motion-component: {partitionsWithPercent.map((partition, index) => (
          <motion.div
            key={index}...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\components\8starlabs\partition-bar.tsx`:147

> framer-motion-component: >
        <motion.div
          className={cn('h-full rounded-full', color)}...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\components\8starlabs\status-indicator.tsx`:8

> framer-motion-import: import { motion, useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/utils';...

**Recommendation**: Remove framer-motion dependency. Use CSS transitions or Tailwind animate-* classes instead.

#### HEAVY_ANIMATION — `src\components\8starlabs\status-indicator.tsx`:104

> framer-motion-component: {shouldPulse && !prefersReducedMotion && (
          <motion.span
            className={cn(...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\components\8starlabs\timeline.tsx`:8

> framer-motion-import: import { motion, useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/utils';...

**Recommendation**: Remove framer-motion dependency. Use CSS transitions or Tailwind animate-* classes instead.

#### HEAVY_ANIMATION — `src\components\8starlabs\timeline.tsx`:93

> framer-motion-component: return (
          <motion.div
            key={event.id}...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\components\8starlabs\timeline.tsx`:164

> framer-motion-component: return (
          <motion.div
            key={event.id}...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\components\admin\AdminHeader.tsx`:9

> framer-motion-import: import { Link } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
i...

**Recommendation**: Remove framer-motion dependency. Use CSS transitions or Tailwind animate-* classes instead.

#### HEAVY_ANIMATION — `src\components\admin\AdminHeader.tsx`:122

> framer-motion-component: {/* Notifications */}
          <motion.button
            whileHover={prefersReducedMotion ? {} : {...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\components\admin\AdminMobileNav.tsx`:11

> framer-motion-import: import { Link, useLocation } from 'react-router-dom';
import { motion, useReducedMotion } from 'fram...

**Recommendation**: Remove framer-motion dependency. Use CSS transitions or Tailwind animate-* classes instead.

#### HEAVY_ANIMATION — `src\components\admin\AdminMobileNav.tsx`:75

> framer-motion-component: {isActive && (
                <motion.div
                  layoutId="mobileActiveIndicator"...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\components\admin\AdminMobileNav.tsx`:85

> framer-motion-component: {/* Icon */}
              <motion.div
                whileTap={prefersReducedMotion ? {} : { scale...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\components\admin\AdminSearchBar.tsx`:2

> framer-motion-import: import React, { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from '...

**Recommendation**: Remove framer-motion dependency. Use CSS transitions or Tailwind animate-* classes instead.

#### HEAVY_ANIMATION — `src\components\admin\AdminSearchBar.tsx`:137

> framer-motion-component: {isOpen && results.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\components\admin\AdminSearchBar.tsx`:145

> framer-motion-component: {results.map((result, index) => (
                <motion.div
                  key={result.id}...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\components\admin\AdminSearchBar.tsx`:135

> framer-motion-component: <AnimatePresence>
        {isOpen && results.length > 0 && (...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\components\admin\AdminSidebar.tsx`:11

> framer-motion-import: import { Link, useLocation } from 'react-router-dom';
import { motion, AnimatePresence, useReducedMo...

**Recommendation**: Remove framer-motion dependency. Use CSS transitions or Tailwind animate-* classes instead.

#### HEAVY_ANIMATION — `src\components\admin\AdminSidebar.tsx`:160

> framer-motion-component: {!collapsed && (
              <motion.span
                initial={prefersReducedMotion ? {} : { o...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\components\admin\AdminSidebar.tsx`:209

> framer-motion-component: {!collapsed ? (
            <motion.div
              initial={prefersReducedMotion ? {} : { opacity...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\components\admin\AdminSidebar.tsx`:219

> framer-motion-component: ) : (
            <motion.div
              initial={prefersReducedMotion ? {} : { opacity: 0 }}...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\components\admin\AdminSidebar.tsx`:268

> framer-motion-component: <span>{section.title}</span>
          <motion.div
            animate={{ rotate: expanded ? 0 : -90...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\components\admin\AdminSidebar.tsx`:280

> framer-motion-component: {(collapsed || expanded) && (
          <motion.div
            initial={prefersReducedMotion ? {} :...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\components\admin\AdminSidebar.tsx`:337

> framer-motion-component: {isActive && (
        <motion.div
          layoutId="activeIndicator"...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\components\admin\AdminSidebar.tsx`:357

> framer-motion-component: {!collapsed && (
          <motion.span
            initial={prefersReducedMotion ? {} : { opacity: ...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\components\admin\AdminSidebar.tsx`:158

> framer-motion-component: {/* Text - only when expanded */}
          <AnimatePresence mode="wait">
            {!collapsed &&...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\components\admin\AdminSidebar.tsx`:207

> framer-motion-component: <div className="p-4 border-t border-border">
        <AnimatePresence mode="wait">
          {!colla...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\components\admin\AdminSidebar.tsx`:278

> framer-motion-component: {/* Section items */}
      <AnimatePresence initial={false}>
        {(collapsed || expanded) && (...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\components\admin\AdminSidebar.tsx`:355

> framer-motion-component: {/* Label - hidden when collapsed */}
      <AnimatePresence mode="wait">
        {!collapsed && (...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\components\admin\AnalyticsCharts.tsx`:1

> framer-motion-import: import { motion } from 'framer-motion'
import {...

**Recommendation**: Remove framer-motion dependency. Use CSS transitions or Tailwind animate-* classes instead.

#### HEAVY_ANIMATION — `src\components\admin\AnalyticsCharts.tsx`:72

> framer-motion-component: <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
 <motion.div 
 initial={{ opa...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\components\admin\AnalyticsCharts.tsx`:96

> framer-motion-component: <motion.div 
 initial={{ opacity: 0, y: 20 }}...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\components\admin\AnalyticsCharts.tsx`:121

> framer-motion-component: <motion.div 
 initial={{ opacity: 0, y: 20 }}...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\components\admin\AnalyticsCharts.tsx`:140

> framer-motion-component: <motion.div
 initial={{ opacity: 0, y: 20 }}...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\components\admin\AnalyticsCharts.tsx`:161

> framer-motion-component: {/* Application Status Distribution */}
 <motion.div 
 initial={{ opacity: 0, y: 20 }}...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\components\admin\AnalyticsCharts.tsx`:179

> framer-motion-component: {chartData.map((item, index) => (
 <motion.div 
 key={item.label}...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\components\admin\AnalyticsCharts.tsx`:192

> framer-motion-component: <div className="w-32 bg-skeleton rounded-full h-2">
 <motion.div 
 className={`h-2 rounded-full ${it...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\components\admin\AnalyticsCharts.tsx`:250

> framer-motion-component: {/* Weekly Trend */}
 <motion.div 
 initial={{ opacity: 0, y: 20 }}...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\components\admin\AnalyticsCharts.tsx`:288

> framer-motion-component: <div className="text-xs text-gray-900 mb-2">{day.label}</div>
 <motion.div
 className="bg-gradient-t...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\components\admin\applications\ApplicationsCards.tsx`:2

> framer-motion-import: import React from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } ...

**Recommendation**: Remove framer-motion dependency. Use CSS transitions or Tailwind animate-* classes instead.

#### HEAVY_ANIMATION — `src\components\admin\applications\ApplicationsCards.tsx`:69

> framer-motion-component: {applications.map((application, index) => (
          <motion.div
            key={application.id}...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\components\admin\applications\ApplicationsCards.tsx`:67

> framer-motion-component: <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-6">
      <AnimatePresen...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\components\admin\applications\ApplicationsFilters.tsx`:2

> framer-motion-import: import React from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } ...

**Recommendation**: Remove framer-motion dependency. Use CSS transitions or Tailwind animate-* classes instead.

#### HEAVY_ANIMATION — `src\components\admin\applications\ApplicationsFilters.tsx`:79

> framer-motion-component: {selectedCount > 0 && (
            <motion.div 
              initial={{ opacity: 0, scale: 0.8 }}...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\components\admin\applications\ApplicationsFilters.tsx`:192

> framer-motion-component: {showAdvancedFilters && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\components\admin\applications\ApplicationsFilters.tsx`:190

> framer-motion-component: {/* Advanced Filters */}
      <AnimatePresence>
        {showAdvancedFilters && (...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\components\admin\applications\ApplicationsMetrics.tsx`:2

> framer-motion-import: import React from 'react'
import { motion } from 'framer-motion'
import { AnimatedCard } from '@/com...

**Recommendation**: Remove framer-motion dependency. Use CSS transitions or Tailwind animate-* classes instead.

#### HEAVY_ANIMATION — `src\components\admin\applications\ApplicationsMetrics.tsx`:24

> framer-motion-component: return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\components\admin\EnhancedApplicationsManager.tsx`:2

> framer-motion-import: import React, { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
impo...

**Recommendation**: Remove framer-motion dependency. Use CSS transitions or Tailwind animate-* classes instead.

#### HEAVY_ANIMATION — `src\components\admin\EnhancedApplicationsManager.tsx`:143

> framer-motion-component: <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
        <motion.div 
          initial={{ op...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\components\admin\EnhancedApplicationsManager.tsx`:152

> framer-motion-component: <motion.div 
          initial={{ opacity: 0, y: 20 }}...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\components\admin\EnhancedApplicationsManager.tsx`:162

> framer-motion-component: <motion.div 
          initial={{ opacity: 0, y: 20 }}...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\components\admin\EnhancedApplicationsManager.tsx`:172

> framer-motion-component: <motion.div 
          initial={{ opacity: 0, y: 20 }}...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\components\admin\EnhancedApplicationsManager.tsx`:182

> framer-motion-component: <motion.div 
          initial={{ opacity: 0, y: 20 }}...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\components\admin\EnhancedApplicationsManager.tsx`:194

> framer-motion-component: {/* Enhanced Controls */}
      <motion.div 
        initial={{ opacity: 0, y: 20 }}...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\components\admin\EnhancedApplicationsManager.tsx`:281

> framer-motion-component: {selectedApplications.length > 0 && (
            <motion.div
              initial={{ opacity: 0, h...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\components\admin\EnhancedApplicationsManager.tsx`:335

> framer-motion-component: ) : filteredApplications.length === 0 ? (
        <motion.div 
          initial={{ opacity: 0, scal...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\components\admin\EnhancedApplicationsManager.tsx`:347

> framer-motion-component: {filteredApplications.map((application, index) => (
            <motion.div
              key={appli...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\components\admin\EnhancedApplicationsManager.tsx`:439

> framer-motion-component: ) : (
        <motion.div 
          initial={{ opacity: 0, y: 20 }}...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\components\admin\EnhancedApplicationsManager.tsx`:475

> framer-motion-component: {filteredApplications.map((application, index) => (
                  <motion.tr 
                  ...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\components\admin\EnhancedDashboard.tsx`:2

> framer-motion-import: import React from 'react'
import { motion } from 'framer-motion'
import {...

**Recommendation**: Remove framer-motion dependency. Use CSS transitions or Tailwind animate-* classes instead.

#### HEAVY_ANIMATION — `src\components\admin\EnhancedDashboard.tsx`:64

> framer-motion-component: <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <motion.div 
        ...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\components\admin\EnhancedDashboard.tsx`:84

> framer-motion-component: <motion.div 
          initial={{ opacity: 0, y: 20 }}...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\components\admin\EnhancedDashboard.tsx`:108

> framer-motion-component: <motion.div 
          initial={{ opacity: 0, y: 20 }}...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\components\admin\EnhancedDashboard.tsx`:133

> framer-motion-component: <motion.div 
          initial={{ opacity: 0, y: 20 }}...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\components\admin\EnhancedDashboard.tsx`:162

> framer-motion-component: {/* Recent Activity */}
        <motion.div 
          initial={{ opacity: 0, x: -20 }}...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\components\admin\EnhancedDashboard.tsx`:182

> framer-motion-component: {recentActivity.length > 0 ? recentActivity.map((activity, index) => (
              <motion.div 
  ...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\components\admin\EnhancedDashboard.tsx`:209

> framer-motion-component: {/* System Health */}
        <motion.div 
          initial={{ opacity: 0, x: 20 }}...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\components\admin\EnhancedDataTable.tsx`:17

> framer-motion-import: import React, { useState, useMemo, useCallback } from 'react';
import { motion, AnimatePresence, use...

**Recommendation**: Remove framer-motion dependency. Use CSS transitions or Tailwind animate-* classes instead.

#### HEAVY_ANIMATION — `src\components\admin\EnhancedDataTable.tsx`:153

> framer-motion-component: <div className="flex items-center gap-1">
        <motion.button
          whileHover={!prefersReduc...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\components\admin\EnhancedDataTable.tsx`:169

> framer-motion-component: <motion.button
          whileHover={!prefersReducedMotion ? { scale: 1.05 } : undefined}...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\components\admin\EnhancedDataTable.tsx`:192

> framer-motion-component: ) : (
              <motion.button
                key={page}...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\components\admin\EnhancedDataTable.tsx`:210

> framer-motion-component: <motion.button
          whileHover={!prefersReducedMotion ? { scale: 1.05 } : undefined}...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\components\admin\EnhancedDataTable.tsx`:226

> framer-motion-component: <motion.button
          whileHover={!prefersReducedMotion ? { scale: 1.05 } : undefined}...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\components\admin\EnhancedDataTable.tsx`:523

> framer-motion-component: paginatedData.map((row, index) => (
                  <motion.tr
                    key={String(row...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\components\admin\EnhancedDataTable.tsx`:520

> framer-motion-component: <tbody>
            <AnimatePresence mode="popLayout">
              {paginatedData.length > 0 ? (...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\components\admin\FixedAdminDashboard.tsx`:2

> framer-motion-import: import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { AnimatePresence, m...

**Recommendation**: Remove framer-motion dependency. Use CSS transitions or Tailwind animate-* classes instead.

#### HEAVY_ANIMATION — `src\components\admin\FixedAdminDashboard.tsx`:181

> framer-motion-component: {error && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\components\admin\FixedAdminDashboard.tsx`:179

> framer-motion-component: <div className="space-y-6">
      <AnimatePresence>
        {error && (...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\components\admin\OfflineAdminDashboard.tsx`:16

> framer-motion-import: } from 'lucide-react'
import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'...

**Recommendation**: Remove framer-motion dependency. Use CSS transitions or Tailwind animate-* classes instead.

#### HEAVY_ANIMATION — `src\components\admin\OfflineAdminDashboard.tsx`:44

> framer-motion-component: {/* Network Status Banner */}
        <motion.div 
          initial={{ opacity: 0, y: -20 }}...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\components\admin\OfflineAdminDashboard.tsx`:67

> framer-motion-component: {/* Welcome Section */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\components\admin\OfflineAdminDashboard.tsx`:104

> framer-motion-component: {/* Stats Grid */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\components\admin\OfflineAdminDashboard.tsx`:111

> framer-motion-component: {/* Today's Applications */}
          <motion.div 
            whileHover={{ y: -5, scale: 1.02 }}...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\components\admin\OfflineAdminDashboard.tsx`:128

> framer-motion-component: {/* Pending Reviews */}
          <motion.div 
            whileHover={{ y: -5, scale: 1.02 }}...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\components\admin\OfflineAdminDashboard.tsx`:148

> framer-motion-component: {/* Approved Applications */}
          <motion.div 
            whileHover={{ y: -5, scale: 1.02 }}...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\components\admin\OfflineAdminDashboard.tsx`:165

> framer-motion-component: {/* Processing Time */}
          <motion.div 
            whileHover={{ y: -5, scale: 1.02 }}...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\components\admin\OfflineAdminDashboard.tsx`:183

> framer-motion-component: {/* Quick Actions */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\components\admin\OfflineAdminDashboard.tsx`:233

> framer-motion-component: {/* System Status */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\components\admin\QuickActionsPanel.tsx`:2

> framer-motion-import: import React from 'react'
import { motion } from 'framer-motion'
import { Link } from 'react-router-...

**Recommendation**: Remove framer-motion dependency. Use CSS transitions or Tailwind animate-* classes instead.

#### HEAVY_ANIMATION — `src\components\admin\QuickActionsPanel.tsx`:93

> framer-motion-component: {/* Primary Actions */}
      <motion.div 
        initial={{ opacity: 0, y: 20 }}...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\components\admin\QuickActionsPanel.tsx`:109

> framer-motion-component: <Link key={action.title} to={action.href}>
                  <motion.div
                    initial...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\components\admin\QuickActionsPanel.tsx`:142

> framer-motion-component: {/* System Tools */}
      <motion.div 
        initial={{ opacity: 0, y: 20 }}...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\components\admin\QuickActionsPanel.tsx`:157

> framer-motion-component: <Link key={action.title} to={action.href}>
                <motion.div
                  initial={{ ...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\components\admin\QuickActionsPanel.tsx`:180

> framer-motion-component: {/* Quick Export */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\components\admin\QuickActionsPanel.tsx`:205

> framer-motion-component: {/* Quick Stats */}
      <motion.div 
        initial={{ opacity: 0, y: 20 }}...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\components\admin\RealtimeMetricsDisplay.tsx`:16

> framer-motion-import: import { useCallback, useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence, ...

**Recommendation**: Remove framer-motion dependency. Use CSS transitions or Tailwind animate-* classes instead.

#### HEAVY_ANIMATION — `src\components\admin\RealtimeMetricsDisplay.tsx`:127

> framer-motion-component: <AnimatePresence>
      <motion.div
        initial={showAnimation && !prefersReducedMotion ? { opac...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\components\admin\RealtimeMetricsDisplay.tsx`:158

> framer-motion-component: return (
    <motion.div
      animate={show ? {...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\components\admin\RealtimeMetricsDisplay.tsx`:182

> framer-motion-component: {isConnected && !prefersReducedMotion && (
          <motion.span
            className="absolute in...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\components\admin\RealtimeMetricsDisplay.tsx`:240

> framer-motion-component: <DataUpdateFlash show={showFlash}>
      <motion.div
        initial={!prefersReducedMotion ? { opac...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\components\admin\RealtimeMetricsDisplay.tsx`:449

> framer-motion-component: {recentUpdates.length > 0 && (
              <motion.div
                initial={{ opacity: 0, scal...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\components\admin\RealtimeMetricsDisplay.tsx`:487

> framer-motion-component: {!isConnected && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\components\admin\RealtimeMetricsDisplay.tsx`:518

> framer-motion-component: {/* Summary stats row */}
      <motion.div
        initial={!prefersReducedMotion ? { opacity: 0, y...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\components\admin\RealtimeMetricsDisplay.tsx`:554

> framer-motion-component: {showSystemHealth && systemHealth && (
        <motion.div
          initial={!prefersReducedMotion ...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\components\admin\RealtimeMetricsDisplay.tsx`:126

> framer-motion-component: return (
    <AnimatePresence>
      <motion.div...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\components\admin\RealtimeMetricsDisplay.tsx`:447

> framer-motion-component: {/* Recent update indicator */}
          <AnimatePresence>
            {recentUpdates.length > 0 &&...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\components\admin\RealtimeMetricsDisplay.tsx`:485

> framer-motion-component: {/* Connection status banner */}
      <AnimatePresence>
        {!isConnected && (...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\components\admin\RealTimeNotifications.tsx`:2

> framer-motion-import: import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-m...

**Recommendation**: Remove framer-motion dependency. Use CSS transitions or Tailwind animate-* classes instead.

#### HEAVY_ANIMATION — `src\components\admin\RealTimeNotifications.tsx`:94

> framer-motion-component: {showPanel && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.95 }}...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\components\admin\RealTimeNotifications.tsx`:122

> framer-motion-component: {notifications.map((notification, index) => (
                    <motion.div
                      ...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\components\admin\RealTimeNotifications.tsx`:92

> framer-motion-component: {/* Notifications Panel */}
      <AnimatePresence>
        {showPanel && (...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\components\admin\SystemMonitoring.tsx`:2

> framer-motion-import: import React, { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import {...

**Recommendation**: Remove framer-motion dependency. Use CSS transitions or Tailwind animate-* classes instead.

#### HEAVY_ANIMATION — `src\components\admin\SystemMonitoring.tsx`:129

> framer-motion-component: <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <motion.div 
        ...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\components\admin\SystemMonitoring.tsx`:150

> framer-motion-component: <motion.div 
          initial={{ opacity: 0, y: 20 }}...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\components\admin\SystemMonitoring.tsx`:172

> framer-motion-component: <motion.div 
          initial={{ opacity: 0, y: 20 }}...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\components\admin\SystemMonitoring.tsx`:194

> framer-motion-component: <motion.div 
          initial={{ opacity: 0, y: 20 }}...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\components\admin\SystemMonitoring.tsx`:218

> framer-motion-component: {/* Performance Metrics */}
      <motion.div 
        initial={{ opacity: 0, y: 20 }}...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\components\admin\SystemMonitoring.tsx`:249

> framer-motion-component: <div className="w-full bg-skeleton rounded-full h-2">
                <motion.div 
                 ...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\components\admin\SystemMonitoring.tsx`:267

> framer-motion-component: <div className="w-full bg-skeleton rounded-full h-2">
                <motion.div 
                 ...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\components\admin\SystemMonitoring.tsx`:285

> framer-motion-component: <div className="w-full bg-skeleton rounded-full h-2">
                <motion.div 
                 ...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\components\admin\SystemMonitoring.tsx`:303

> framer-motion-component: <div className="w-full bg-skeleton rounded-full h-2">
                <motion.div 
                 ...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\components\admin\SystemMonitoring.tsx`:316

> framer-motion-component: {/* System Health Alerts */}
      <motion.div 
        initial={{ opacity: 0, y: 20 }}...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\components\admin\SystemMonitoring.tsx`:362

> framer-motion-component: {/* Real-time Activity */}
      <motion.div 
        initial={{ opacity: 0, y: 20 }}...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\components\application\EligibilityNotification.tsx`:2

> framer-motion-import: import { AlertTriangle, CheckCircle, Info } from 'lucide-react'
import { motion } from 'framer-motio...

**Recommendation**: Remove framer-motion dependency. Use CSS transitions or Tailwind animate-* classes instead.

#### HEAVY_ANIMATION — `src\components\application\EligibilityNotification.tsx`:16

> framer-motion-component: return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\components\application\SimpleFileUpload.tsx`:6

> framer-motion-import: import { Upload, X, FileText, CheckCircle, AlertCircle, ImageIcon, Zap } from 'lucide-react'
import ...

**Recommendation**: Remove framer-motion dependency. Use CSS transitions or Tailwind animate-* classes instead.

#### HEAVY_ANIMATION — `src\components\application\SimpleFileUpload.tsx`:346

> framer-motion-component: {displayError && (
          <motion.div 
            className="mt-4 p-4 bg-destructive/5 border bo...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\components\application\SimpleFileUpload.tsx`:364

> framer-motion-component: {showCompressionStats && compressionResults.length > 0 && (
          <motion.div 
            class...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\components\application\SimpleFileUpload.tsx`:451

> framer-motion-component: {uploadedFiles.map((file) => (
              <motion.div 
                key={file.id}...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\components\application\SimpleFileUpload.tsx`:449

> framer-motion-component: </h3>
          <AnimatePresence>
            {uploadedFiles.map((file) => (...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\components\application\wizard\StepOne.tsx`:5

> framer-motion-import: import { FormSelect } from '@/components/ui/form-select'
import { motion } from 'framer-motion'...

**Recommendation**: Remove framer-motion dependency. Use CSS transitions or Tailwind animate-* classes instead.

#### HEAVY_ANIMATION — `src\components\application\wizard\StepOne.tsx`:31

> framer-motion-component: return (
    <motion.div 
      initial={{ opacity: 0, x: 50 }}...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\components\application\wizard\StepOne.tsx`:178

> framer-motion-component: {selectedProgram && (
        <motion.div 
          className="mt-4 p-4 bg-primary/5 rounded-lg"...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\components\auth\AuthLayout.tsx`:11

> framer-motion-import: import { Link } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
i...

**Recommendation**: Remove framer-motion dependency. Use CSS transitions or Tailwind animate-* classes instead.

#### HEAVY_ANIMATION — `src\components\auth\AuthLayout.tsx`:89

> framer-motion-component: {/* Content */}
      <motion.div
        className="relative z-10 max-w-lg"...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\components\auth\AuthLayout.tsx`:96

> framer-motion-component: {/* Logo and badge */}
        <motion.div variants={itemVariants} className="mb-8">
          <span...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\components\auth\AuthLayout.tsx`:104

> framer-motion-component: {/* Main heading */}
        <motion.h1
          variants={itemVariants}...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\components\auth\AuthLayout.tsx`:112

> framer-motion-component: {/* Description */}
        <motion.p
          variants={itemVariants}...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\components\auth\AuthLayout.tsx`:121

> framer-motion-component: {/* Feature cards */}
        <motion.div
          variants={itemVariants}...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\components\auth\AuthLayout.tsx`:126

> framer-motion-component: {brandingFeatures.map((feature, index) => (
            <motion.div
              key={feature.title...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\components\auth\AuthLayout.tsx`:144

> framer-motion-component: {/* Stats */}
        <motion.div
          variants={itemVariants}...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\components\auth\AuthLayout.tsx`:200

> framer-motion-component: <div className="flex flex-col justify-center px-4 py-12 sm:px-6 lg:px-12 xl:px-16">
      <motion.di...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\components\blocks\cta-section.tsx`:8

> framer-motion-import: import { motion, useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/utils';...

**Recommendation**: Remove framer-motion dependency. Use CSS transitions or Tailwind animate-* classes instead.

#### HEAVY_ANIMATION — `src\components\blocks\cta-section.tsx`:80

> framer-motion-component: {showIcon && (
                <motion.div
                  className="mb-6"...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\components\blocks\cta-section.tsx`:118

> framer-motion-component: >
                <motion.div
                  whileHover={prefersReducedMotion ? {} : { scale: 1.0...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\components\blocks\feature-grid.tsx`:8

> framer-motion-import: import { motion, useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/utils';...

**Recommendation**: Remove framer-motion dependency. Use CSS transitions or Tailwind animate-* classes instead.

#### HEAVY_ANIMATION — `src\components\blocks\feature-grid.tsx`:106

> framer-motion-component: const content = (
    <motion.div
      className={cn(cardClasses[variant], 'h-full')}...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\components\blocks\hero-section.tsx`:8

> framer-motion-import: import { motion, useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/utils';...

**Recommendation**: Remove framer-motion dependency. Use CSS transitions or Tailwind animate-* classes instead.

#### HEAVY_ANIMATION — `src\components\blocks\hero-section.tsx`:111

> framer-motion-component: <div className="container relative z-10 mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
         ...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\components\blocks\hero-section.tsx`:119

> framer-motion-component: {subtitle && (
            <motion.div variants={itemVariants}>
              <span className="inlin...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\components\blocks\hero-section.tsx`:127

> framer-motion-component: {/* Title */}
          <motion.h1
            variants={itemVariants}...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\components\blocks\hero-section.tsx`:139

> framer-motion-component: {description && (
            <motion.p
              variants={itemVariants}...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\components\blocks\hero-section.tsx`:149

> framer-motion-component: {(primaryCTA || secondaryCTA) && (
            <motion.div
              variants={itemVariants}...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\components\blocks\hero-section.tsx`:182

> framer-motion-component: {stats && stats.length > 0 && (
            <motion.div
              variants={itemVariants}...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\components\blocks\hero-section.tsx`:204

> framer-motion-component: {children && (
            <motion.div variants={itemVariants} className="mt-8">
              {chil...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\components\blocks\hero-section.tsx`:213

> framer-motion-component: {showScrollIndicator && (
        <motion.div
          className="absolute bottom-8 left-1/2 -trans...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\components\DashboardRedirect.tsx`:3

> framer-motion-import: import { Navigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useAuth ...

**Recommendation**: Remove framer-motion dependency. Use CSS transitions or Tailwind animate-* classes instead.

#### HEAVY_ANIMATION — `src\components\eligibility\DetailedScoreBreakdown.tsx`:9

> framer-motion-import: import React, { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
impo...

**Recommendation**: Remove framer-motion dependency. Use CSS transitions or Tailwind animate-* classes instead.

#### HEAVY_ANIMATION — `src\components\eligibility\DetailedScoreBreakdown.tsx`:237

> framer-motion-component: {expandedSections.has('breakdown') && (
            <motion.div
              initial={{ height: 0, ...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\components\eligibility\DetailedScoreBreakdown.tsx`:320

> framer-motion-component: {expandedSections.has('recommendations') && (
              <motion.div
                initial={{ h...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\components\eligibility\DetailedScoreBreakdown.tsx`:391

> framer-motion-component: {expandedSections.has('pathways') && (
              <motion.div
                initial={{ height: ...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\components\eligibility\DetailedScoreBreakdown.tsx`:235

> framer-motion-component: <AnimatePresence>
          {expandedSections.has('breakdown') && (...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\components\eligibility\DetailedScoreBreakdown.tsx`:318

> framer-motion-component: <AnimatePresence>
            {expandedSections.has('recommendations') && (...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\components\eligibility\DetailedScoreBreakdown.tsx`:389

> framer-motion-component: <AnimatePresence>
            {expandedSections.has('pathways') && (...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\components\navigation\BaseNavigation.tsx`:2

> framer-motion-import: import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-m...

**Recommendation**: Remove framer-motion dependency. Use CSS transitions or Tailwind animate-* classes instead.

#### HEAVY_ANIMATION — `src\components\navigation\BaseNavigation.tsx`:113

> framer-motion-component: {/* Mobile Menu Button */}
          <motion.button
            className="lg:hidden p-3 rounded-xl ...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\components\navigation\BaseNavigation.tsx`:122

> framer-motion-component: {isOpen ? (
                <motion.div
                  key="close"...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\components\navigation\BaseNavigation.tsx`:132

> framer-motion-component: ) : (
                <motion.div
                  key="menu"...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\components\navigation\BaseNavigation.tsx`:152

> framer-motion-component: {/* Backdrop */}
            <motion.div
              className="fixed inset-0 bg-black/70 backdrop...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\components\navigation\BaseNavigation.tsx`:162

> framer-motion-component: {/* Mobile Menu */}
            <motion.div
              className="fixed top-0 right-0 h-full w-80...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\components\navigation\BaseNavigation.tsx`:174

> framer-motion-component: {mobileHeader}
                  <motion.button
                    className="p-2 rounded-lg hover:...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\components\navigation\BaseNavigation.tsx`:192

> framer-motion-component: return (
                        <motion.div
                          key={item.href}...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\components\navigation\BaseNavigation.tsx`:120

> framer-motion-component: >
            <AnimatePresence mode="wait">
              {isOpen ? (...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\components\navigation\BaseNavigation.tsx`:148

> framer-motion-component: {/* Mobile Menu Overlay */}
      <AnimatePresence>
        {isOpen && (...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\components\navigation\DesktopSidebar.tsx`:4

> framer-motion-import: import { Link, useLocation } from 'react-router-dom'
import { motion, AnimatePresence, useReducedMot...

**Recommendation**: Remove framer-motion dependency. Use CSS transitions or Tailwind animate-* classes instead.

#### HEAVY_ANIMATION — `src\components\navigation\DesktopSidebar.tsx`:128

> framer-motion-component: {!collapsed && (
              <motion.span
                initial={prefersReducedMotion ? {} : { o...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\components\navigation\DesktopSidebar.tsx`:193

> framer-motion-component: {!collapsed ? (
            <motion.div
              initial={prefersReducedMotion ? {} : { opacity...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\components\navigation\DesktopSidebar.tsx`:203

> framer-motion-component: ) : (
            <motion.div
              initial={prefersReducedMotion ? {} : { opacity: 0 }}...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\components\navigation\DesktopSidebar.tsx`:252

> framer-motion-component: <span>{section.title}</span>
          <motion.div
            animate={{ rotate: expanded ? 0 : -90...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\components\navigation\DesktopSidebar.tsx`:264

> framer-motion-component: {(collapsed || expanded) && (
          <motion.div
            initial={prefersReducedMotion ? {} :...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\components\navigation\DesktopSidebar.tsx`:321

> framer-motion-component: {isActive && (
        <motion.div
          layoutId="sidebarActiveIndicator"...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\components\navigation\DesktopSidebar.tsx`:342

> framer-motion-component: {!collapsed && (
          <motion.span
            initial={prefersReducedMotion ? {} : { opacity: ...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\components\navigation\DesktopSidebar.tsx`:126

> framer-motion-component: {/* Text - only when expanded */}
          <AnimatePresence mode="wait">
            {!collapsed &&...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\components\navigation\DesktopSidebar.tsx`:191

> framer-motion-component: <div className="p-4 border-t border-border">
        <AnimatePresence mode="wait">
          {!colla...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\components\navigation\DesktopSidebar.tsx`:262

> framer-motion-component: {/* Section items */}
      <AnimatePresence initial={false}>
        {(collapsed || expanded) && (...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\components\navigation\DesktopSidebar.tsx`:340

> framer-motion-component: {/* Label - hidden when collapsed */}
      <AnimatePresence mode="wait">
        {!collapsed && (...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\components\notifications\NotificationAnalytics.tsx`:3

> framer-motion-import: import React, { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import {...

**Recommendation**: Remove framer-motion dependency. Use CSS transitions or Tailwind animate-* classes instead.

#### HEAVY_ANIMATION — `src\components\notifications\PushNotificationSettings.tsx`:3

> framer-motion-import: import React, { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import {...

**Recommendation**: Remove framer-motion dependency. Use CSS transitions or Tailwind animate-* classes instead.

#### HEAVY_ANIMATION — `src\components\notifications\PushNotificationSettings.tsx`:294

> framer-motion-component: {isEnabled && permission === 'granted' && (
          <motion.div
            initial={{ opacity: 0,...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\components\notifications\PushNotificationSettings.tsx`:368

> framer-motion-component: {preferences.quietHours && (
                <motion.div
                  initial={{ opacity: 0, he...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\components\pwa\OfflineIndicator.tsx`:2

> framer-motion-import: import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-m...

**Recommendation**: Remove framer-motion dependency. Use CSS transitions or Tailwind animate-* classes instead.

#### HEAVY_ANIMATION — `src\components\pwa\OfflineIndicator.tsx`:53

> framer-motion-component: <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -20 }}...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\components\pwa\OfflineIndicator.tsx`:92

> framer-motion-component: {showDetails && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\components\pwa\OfflineIndicator.tsx`:52

> framer-motion-component: return (
    <AnimatePresence>
      <motion.div...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\components\pwa\OfflineIndicator.tsx`:90

> framer-motion-component: {/* Details Panel */}
          <AnimatePresence>
            {showDetails && (...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\components\smoothui\animated-file-upload.tsx`:9

> framer-motion-import: import { forwardRef, useState, useCallback } from 'react';
import { motion, AnimatePresence, useRedu...

**Recommendation**: Remove framer-motion dependency. Use CSS transitions or Tailwind animate-* classes instead.

#### HEAVY_ANIMATION — `src\components\smoothui\animated-file-upload.tsx`:87

> framer-motion-component: <motion.div
          className={cn(...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\components\smoothui\animated-file-upload.tsx`:119

> framer-motion-component: {isUploading ? (
              <motion.div
                key="uploading"...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\components\smoothui\animated-file-upload.tsx`:126

> framer-motion-component: >
                <motion.div
                  className="w-12 h-12 mx-auto mb-3 rounded-full borde...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\components\smoothui\animated-file-upload.tsx`:142

> framer-motion-component: <div className="h-2 bg-border rounded-full overflow-hidden">
                    <motion.div
       ...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\components\smoothui\animated-file-upload.tsx`:155

> framer-motion-component: ) : showSuccess ? (
              <motion.div
                key="success"...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\components\smoothui\animated-file-upload.tsx`:162

> framer-motion-component: >
                <motion.div
                  initial={{ scale: 0 }}...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\components\smoothui\animated-file-upload.tsx`:184

> framer-motion-component: ) : file ? (
              <motion.div
                key="file-selected"...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\components\smoothui\animated-file-upload.tsx`:200

> framer-motion-component: ) : (
              <motion.div
                key="empty"...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\components\smoothui\animated-file-upload.tsx`:207

> framer-motion-component: >
                <motion.div
                  animate={isDragging ? { y: -5 } : { y: 0 }}...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\components\smoothui\animated-file-upload.tsx`:230

> framer-motion-component: {error && (
            <motion.div
              initial={{ opacity: 0, height: 0, y: -10 }}...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\components\smoothui\animated-file-upload.tsx`:117

> framer-motion-component: <AnimatePresence mode="wait">
            {isUploading ? (...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\components\smoothui\animated-file-upload.tsx`:228

> framer-motion-component: {/* Error message with animation */}
        <AnimatePresence>
          {error && (...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\components\smoothui\animated-input.tsx`:9

> framer-motion-import: import { forwardRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motio...

**Recommendation**: Remove framer-motion dependency. Use CSS transitions or Tailwind animate-* classes instead.

#### HEAVY_ANIMATION — `src\components\smoothui\animated-input.tsx`:61

> framer-motion-component: {label && (
          <motion.label
            htmlFor={inputId}...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\components\smoothui\animated-input.tsx`:80

> framer-motion-component: <motion.div
          className="relative"...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\components\smoothui\animated-input.tsx`:112

> framer-motion-component: {/* Focus indicator line */}
          <motion.div
            className={cn(...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\components\smoothui\animated-input.tsx`:131

> framer-motion-component: {/* Error message with animation */}
        <motion.div
          initial={{ opacity: 0, height: 0 ...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\components\smoothui\animated-select.tsx`:9

> framer-motion-import: import { forwardRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motio...

**Recommendation**: Remove framer-motion dependency. Use CSS transitions or Tailwind animate-* classes instead.

#### HEAVY_ANIMATION — `src\components\smoothui\animated-select.tsx`:70

> framer-motion-component: {label && (
          <motion.label
            htmlFor={selectId}...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\components\smoothui\animated-select.tsx`:89

> framer-motion-component: <motion.div
          className="relative"...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\components\smoothui\animated-select.tsx`:135

> framer-motion-component: {/* Custom dropdown arrow */}
          <motion.div
            className="absolute right-3 top-1/2 ...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\components\smoothui\animated-select.tsx`:147

> framer-motion-component: {/* Focus indicator line */}
          <motion.div
            className={cn(...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\components\smoothui\animated-select.tsx`:166

> framer-motion-component: {/* Error message with animation */}
        <motion.div
          initial={{ opacity: 0, height: 0 ...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\components\smoothui\page-transition.tsx`:10

> framer-motion-import: import React from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'...

**Recommendation**: Remove framer-motion dependency. Use CSS transitions or Tailwind animate-* classes instead.

#### HEAVY_ANIMATION — `src\components\smoothui\page-transition.tsx`:45

> framer-motion-component: return (
    <motion.div
      initial="initial"...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\components\smoothui\page-transition.tsx`:190

> framer-motion-component: <AnimatePresence mode="wait">
      <motion.div 
        key={locationKey}...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\components\smoothui\page-transition.tsx`:222

> framer-motion-component: return (
    <motion.div
      layoutId={layoutId}...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\components\smoothui\page-transition.tsx`:261

> framer-motion-component: <AnimatePresence mode="wait">
      <motion.div
        key={contentKey}...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\components\smoothui\page-transition.tsx`:161

> framer-motion-component: return (
    <AnimatePresence mode="wait" initial={false}>
      <PageTransition...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\components\smoothui\page-transition.tsx`:189

> framer-motion-component: return (
    <AnimatePresence mode="wait">
      <motion.div...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\components\smoothui\page-transition.tsx`:260

> framer-motion-component: return (
    <AnimatePresence mode="wait">
      <motion.div...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\components\smoothui\scroll-reveal.tsx`:8

> framer-motion-import: import { motion } from 'framer-motion';
import { useInView } from 'react-intersection-observer';...

**Recommendation**: Remove framer-motion dependency. Use CSS transitions or Tailwind animate-* classes instead.

#### HEAVY_ANIMATION — `src\components\smoothui\scroll-reveal.tsx`:55

> framer-motion-component: return (
    <motion.div
      ref={ref}...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\components\smoothui\scroll-reveal.tsx`:105

> framer-motion-component: return (
    <motion.div
      ref={ref}...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\components\smoothui\scroll-reveal.tsx`:138

> framer-motion-component: return (
    <motion.div variants={itemVariants} className={className}>
      {children}...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\components\student\ApplicationSlipActions.tsx`:4

> framer-motion-import: import { Download, Mail, Loader2 } from 'lucide-react'
import { motion } from 'framer-motion'
import...

**Recommendation**: Remove framer-motion dependency. Use CSS transitions or Tailwind animate-* classes instead.

#### HEAVY_ANIMATION — `src\components\student\ApplicationSlipActions.tsx`:126

> framer-motion-component: {emailSent && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\components\student\ApplicationTimeline.tsx`:9

> framer-motion-import: import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Timeli...

**Recommendation**: Remove framer-motion dependency. Use CSS transitions or Tailwind animate-* classes instead.

#### HEAVY_ANIMATION — `src\components\student\ApplicationTimeline.tsx`:115

> framer-motion-component: return (
    <motion.div
      initial={prefersReducedMotion ? undefined : { opacity: 0, y: 20 }}...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\components\student\DashboardStatusOverview.tsx`:9

> framer-motion-import: import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Link }...

**Recommendation**: Remove framer-motion dependency. Use CSS transitions or Tailwind animate-* classes instead.

#### HEAVY_ANIMATION — `src\components\student\DashboardStatusOverview.tsx`:130

> framer-motion-component: {prefersReducedMotion ? content : (
          <motion.div
            whileHover={{ y: -2 }}...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\components\student\DashboardStatusOverview.tsx`:236

> framer-motion-component: {/* Metrics Grid */}
      <motion.div
        className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-co...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\components\student\DashboardStatusOverview.tsx`:243

> framer-motion-component: {metrics.map((metric, index) => (
          <motion.div key={metric.title} variants={itemVariants}>
...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\components\student\DashboardStatusOverview.tsx`:251

> framer-motion-component: {latestApplication && (
        <motion.div
          initial={prefersReducedMotion ? undefined : { ...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\components\student\DashboardStatusOverview.tsx`:294

> framer-motion-component: {pendingPaymentCount > 0 && (
        <motion.div
          initial={prefersReducedMotion ? undefine...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\components\student\NotificationBell.tsx`:2

> framer-motion-import: import React, { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
impo...

**Recommendation**: Remove framer-motion dependency. Use CSS transitions or Tailwind animate-* classes instead.

#### HEAVY_ANIMATION — `src\components\student\NotificationBell.tsx`:80

> framer-motion-component: {unreadCount > 0 && (
          <motion.span
            initial={{ scale: 0 }}...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\components\student\NotificationBell.tsx`:101

> framer-motion-component: <motion.div
              initial={{ opacity: 0, y: 10, scale: 0.95 }}...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\components\student\NotificationBell.tsx`:157

> framer-motion-component: {notifications.map((notification, index) => (
                      <motion.div
                    ...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\components\student\NotificationBell.tsx`:92

> framer-motion-component: {/* Notifications Panel */}
      <AnimatePresence>
        {showPanel && (...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\components\student\QuickActions.tsx`:10

> framer-motion-import: import { Link } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
i...

**Recommendation**: Remove framer-motion dependency. Use CSS transitions or Tailwind animate-* classes instead.

#### HEAVY_ANIMATION — `src\components\student\QuickActions.tsx`:99

> framer-motion-component: const wrappedContent = prefersReducedMotion ? content : (
    <motion.div
      whileHover={disabled...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\components\student\QuickActions.tsx`:168

> framer-motion-component: <CardContent>
        <motion.div
          className="space-y-2"...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\components\student\QuickActions.tsx`:175

> framer-motion-component: {/* Primary action - Continue draft or Start new */}
          <motion.div variants={itemVariants}>
...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\components\student\QuickActions.tsx`:197

> framer-motion-component: {hasPendingPayment && (
            <motion.div variants={itemVariants}>
              <ActionCard...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\components\student\QuickActions.tsx`:210

> framer-motion-component: {hasScheduledInterview && (
            <motion.div variants={itemVariants}>
              <ActionCa...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\components\student\QuickActions.tsx`:222

> framer-motion-component: {/* Profile settings */}
          <motion.div variants={itemVariants}>
            <ActionCard...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\components\student\QuickActions.tsx`:234

> framer-motion-component: {hasDrafts && onClearAllDrafts && (
            <motion.div variants={itemVariants}>
              <...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\components\ui\AdminNavigation.tsx`:3

> framer-motion-import: import { Link, useNavigate, useLocation } from 'react-router-dom'
import { motion } from 'framer-mot...

**Recommendation**: Remove framer-motion dependency. Use CSS transitions or Tailwind animate-* classes instead.

#### HEAVY_ANIMATION — `src\components\ui\AdminNavigation.tsx`:77

> framer-motion-component: const brand = (
    <motion.div 
      className="flex items-center space-x-2 sm:space-x-3"...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\components\ui\AnimatedCard.tsx`:2

> framer-motion-import: import React from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { useInVie...

**Recommendation**: Remove framer-motion dependency. Use CSS transitions or Tailwind animate-* classes instead.

#### HEAVY_ANIMATION — `src\components\ui\AnimatedCard.tsx`:118

> framer-motion-component: return (
    <motion.div
      ref={ref}...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\components\ui\AnimatedSection.tsx`:2

> framer-motion-import: import React from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { useInVie...

**Recommendation**: Remove framer-motion dependency. Use CSS transitions or Tailwind animate-* classes instead.

#### HEAVY_ANIMATION — `src\components\ui\AnimatedSection.tsx`:20

> framer-motion-component: return (
    <motion.div
      ref={ref}...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\components\ui\Card.tsx`:2

> framer-motion-import: import React from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { cn } fro...

**Recommendation**: Remove framer-motion dependency. Use CSS transitions or Tailwind animate-* classes instead.

#### HEAVY_ANIMATION — `src\components\ui\Card.tsx`:31

> framer-motion-component: return (
      <motion.div
        className={baseClasses}...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\components\ui\Card.tsx`:46

> framer-motion-component: return (
    <motion.div
      className={baseClasses}...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\components\ui\ConfirmDialog.tsx`:2

> framer-motion-import: import React from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { AlertTria...

**Recommendation**: Remove framer-motion dependency. Use CSS transitions or Tailwind animate-* classes instead.

#### HEAVY_ANIMATION — `src\components\ui\ConfirmDialog.tsx`:37

> framer-motion-component: {/* Backdrop */}
 <motion.div
 initial={{ opacity: 0 }}...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\components\ui\ConfirmDialog.tsx`:47

> framer-motion-component: <div className="fixed inset-0 flex items-center justify-center z-[201] p-4">
 <motion.div
 initial={...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\components\ui\ConfirmDialog.tsx`:33

> framer-motion-component: return (
 <AnimatePresence>
 {isOpen && (...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\components\ui\FancyPreloader.tsx`:2

> framer-motion-import: import React from 'react'
import { motion } from 'framer-motion'
import { GraduationCap } from 'luci...

**Recommendation**: Remove framer-motion dependency. Use CSS transitions or Tailwind animate-* classes instead.

#### HEAVY_ANIMATION — `src\components\ui\FancyPreloader.tsx`:7

> framer-motion-component: return (
    <motion.div
      className="fixed inset-0 bg-gradient-to-br from-blue-600 via-purple-6...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\components\ui\FancyPreloader.tsx`:15

> framer-motion-component: {/* Animated background glow */}
        <motion.div
          className="absolute inset-0 blur-3xl ...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\components\ui\FancyPreloader.tsx`:27

> framer-motion-component: {/* Icon */}
        <motion.div
          className="mb-6 relative z-10"...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\components\ui\FancyPreloader.tsx`:42

> framer-motion-component: {/* Title */}
        <motion.h1
          className="text-3xl font-bold text-gray-900 mb-2 relative...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\components\ui\FancyPreloader.tsx`:52

> framer-motion-component: {/* Subtitle */}
        <motion.p
          className="text-foreground/90 mb-8 text-lg relative z-1...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\components\ui\FancyPreloader.tsx`:64

> framer-motion-component: {[0, 1, 2].map((i) => (
            <motion.div
              key={i}...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\components\ui\FloatingElements.tsx`:2

> framer-motion-import: import React, { useMemo } from 'react'
import { motion, useReducedMotion } from 'framer-motion'...

**Recommendation**: Remove framer-motion dependency. Use CSS transitions or Tailwind animate-* classes instead.

#### HEAVY_ANIMATION — `src\components\ui\FloatingElements.tsx`:30

> framer-motion-component: enableAnimation ? (
          <motion.div
            key={element.id}...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\components\ui\FloatingElements.tsx`:87

> framer-motion-component: <>
          <motion.div
            className="absolute top-10 right-10 w-32 h-32 border-2 border-p...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\components\ui\FloatingElements.tsx`:99

> framer-motion-component: <motion.div
            className="absolute bottom-20 left-10 w-24 h-24 bg-gradient-to-r from-second...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\components\ui\FloatingElements.tsx`:111

> framer-motion-component: <motion.div
            className="absolute top-1/2 left-1/4 w-16 h-16 border-2 border-accent transf...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\components\ui\FloatingElements.tsx`:124

> framer-motion-component: <motion.div
            className="absolute top-1/4 right-1/3 w-20 h-20 bg-gradient-radial from-blue...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\components\ui\FloatingOrbs.tsx`:2

> framer-motion-import: import React from 'react'
import { motion } from 'framer-motion'
import { useOptimizedAnimation } fr...

**Recommendation**: Remove framer-motion dependency. Use CSS transitions or Tailwind animate-* classes instead.

#### HEAVY_ANIMATION — `src\components\ui\FloatingOrbs.tsx`:23

> framer-motion-component: <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
      <motion.div
        cl...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\components\ui\FloatingOrbs.tsx`:33

> framer-motion-component: />
      <motion.div
        className="absolute w-80 h-80 rounded-full bg-gradient-to-br from-secon...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\components\ui\FloatingOrbs.tsx`:43

> framer-motion-component: />
      <motion.div
        className="absolute w-72 h-72 rounded-full bg-gradient-to-br from-prima...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\components\ui\FormFeedback.tsx`:8

> framer-motion-import: import React from 'react'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
...

**Recommendation**: Remove framer-motion dependency. Use CSS transitions or Tailwind animate-* classes instead.

#### HEAVY_ANIMATION — `src\components\ui\FormFeedback.tsx`:131

> framer-motion-component: <AnimatePresence mode="wait">
      <motion.div
        initial={{ opacity: 0, y: -10 }}...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\components\ui\FormFeedback.tsx`:189

> framer-motion-component: return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\components\ui\FormFeedback.tsx`:130

> framer-motion-component: return (
    <AnimatePresence mode="wait">
      <motion.div...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\components\ui\Input.tsx`:2

> framer-motion-import: import React from 'react'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'...

**Recommendation**: Remove framer-motion dependency. Use CSS transitions or Tailwind animate-* classes instead.

#### HEAVY_ANIMATION — `src\components\ui\Input.tsx`:52

> framer-motion-component: {isFocused && (
            <motion.div
              className="absolute inset-0 rounded-lg border-...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\components\ui\Input.tsx`:62

> framer-motion-component: {error && (
          <motion.p
            id={`${props.id}-error`}...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\components\ui\OfflineIndicator.tsx`:21

> framer-motion-import: import React from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Wifi, Wif...

**Recommendation**: Remove framer-motion dependency. Use CSS transitions or Tailwind animate-* classes instead.

#### HEAVY_ANIMATION — `src\components\ui\OfflineIndicator.tsx`:70

> framer-motion-component: <div className={cn('flex items-center space-x-2', className)}>
      <motion.div
        className={...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\components\ui\OfflineIndicator.tsx`:80

> framer-motion-component: >
        <motion.div
          animate={isSyncing ? { rotate: 360 } : { rotate: 0 }}...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\components\ui\OfflineIndicator.tsx`:92

> framer-motion-component: {(syncStatus.pending > 0 || syncStatus.errors > 0) && (
            <motion.div
              initia...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\components\ui\OfflineIndicator.tsx`:90

> framer-motion-component: {showDetails && (
        <AnimatePresence>
          {(syncStatus.pending > 0 || syncStatus.errors ...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\components\ui\PageHeader.tsx`:2

> framer-motion-import: import React from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { cn } fro...

**Recommendation**: Remove framer-motion dependency. Use CSS transitions or Tailwind animate-* classes instead.

#### HEAVY_ANIMATION — `src\components\ui\PageHeader.tsx`:144

> framer-motion-component: return prefersReducedMotion ? headerContent : (
		 <motion.div initial={{ opacity: 0, y: 8 }} animat...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\components\ui\PasswordInput.tsx`:4

> framer-motion-import: import { cn } from '@/lib/utils'
import { motion } from 'framer-motion'...

**Recommendation**: Remove framer-motion dependency. Use CSS transitions or Tailwind animate-* classes instead.

#### HEAVY_ANIMATION — `src\components\ui\PasswordInput.tsx`:61

> framer-motion-component: {isFocused && (
            <motion.div
              className="absolute inset-0 rounded-lg border-...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\components\ui\PasswordInput.tsx`:70

> framer-motion-component: {error && (
          <motion.p
            id={`${props.id}-error`}...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\components\ui\ProfileAutoPopulationIndicator.tsx`:2

> framer-motion-import: import React from 'react'
import { motion } from 'framer-motion'
import { CheckCircle, User } from '...

**Recommendation**: Remove framer-motion dependency. Use CSS transitions or Tailwind animate-* classes instead.

#### HEAVY_ANIMATION — `src\components\ui\ProfileAutoPopulationIndicator.tsx`:14

> framer-motion-component: return (
    <motion.div
      initial={{ opacity: 0, scale: 0.8 }}...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\components\ui\ProfileAutoPopulationIndicator.tsx`:37

> framer-motion-component: return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\components\ui\ProgressIndicator.tsx`:8

> framer-motion-import: import React from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { cn } fro...

**Recommendation**: Remove framer-motion dependency. Use CSS transitions or Tailwind animate-* classes instead.

#### HEAVY_ANIMATION — `src\components\ui\ProgressIndicator.tsx`:61

> framer-motion-component: ) : (
          <motion.div
            className={cn(...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\components\ui\ProgressIndicator.tsx`:154

> framer-motion-component: ) : (
          <motion.circle
            cx={size / 2}...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\components\ui\ProgressIndicator.tsx`:209

> framer-motion-component: ) : (
          <motion.div
            className="h-full w-1/3 bg-blue-600 rounded-full"...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\components\ui\SaveStatusIndicator.tsx`:2

> framer-motion-import: import React from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {...

**Recommendation**: Remove framer-motion dependency. Use CSS transitions or Tailwind animate-* classes instead.

#### HEAVY_ANIMATION — `src\components\ui\SaveStatusIndicator.tsx`:114

> framer-motion-component: <AnimatePresence mode="wait">
        <motion.div
          key={status}...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\components\ui\SaveStatusIndicator.tsx`:194

> framer-motion-component: {saveError && status === 'error' && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\components\ui\SaveStatusIndicator.tsx`:236

> framer-motion-component: <AnimatePresence mode="wait">
        <motion.div
          key={status}...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\components\ui\SaveStatusIndicator.tsx`:113

> framer-motion-component: <div className={`flex items-center gap-2 ${className}`}>
      <AnimatePresence mode="wait">
       ...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\components\ui\SaveStatusIndicator.tsx`:235

> framer-motion-component: <div className={`flex items-center gap-1 ${className}`}>
      <AnimatePresence mode="wait">
       ...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\components\ui\SkeletonLoader.tsx`:2

> framer-motion-import: import React from 'react'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'...

**Recommendation**: Remove framer-motion dependency. Use CSS transitions or Tailwind animate-* classes instead.

#### HEAVY_ANIMATION — `src\components\ui\SkeletonLoader.tsx`:55

> framer-motion-component: {animation === 'wave' && (
            <motion.div
              className="absolute inset-0 bg-grad...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\components\ui\StatusIcon.tsx`:2

> framer-motion-import: import React from 'react'
import { motion } from 'framer-motion'
import {...

**Recommendation**: Remove framer-motion dependency. Use CSS transitions or Tailwind animate-* classes instead.

#### HEAVY_ANIMATION — `src\components\ui\StatusIcon.tsx`:44

> framer-motion-component: return (
      <motion.div
        animate={{ rotate: [0, 10, -10, 0] }}...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\components\ui\TouchButton.tsx`:3

> framer-motion-import: import React from 'react'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'...

**Recommendation**: Remove framer-motion dependency. Use CSS transitions or Tailwind animate-* classes instead.

#### HEAVY_ANIMATION — `src\components\ui\TouchButton.tsx`:35

> framer-motion-component: return (
    <motion.button
      className={cn(...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\components\ui\TypewriterText.tsx`:2

> framer-motion-import: import React, { useState, useEffect } from 'react'
import { motion } from 'framer-motion'...

**Recommendation**: Remove framer-motion dependency. Use CSS transitions or Tailwind animate-* classes instead.

#### HEAVY_ANIMATION — `src\components\ui\TypewriterText.tsx`:57

> framer-motion-component: {showCursor && (
        <motion.span
          animate={{ opacity: [1, 0, 1] }}...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\pages\admin\Applications.tsx`:2

> framer-motion-import: import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { motion, us...

**Recommendation**: Remove framer-motion dependency. Use CSS transitions or Tailwind animate-* classes instead.

#### HEAVY_ANIMATION — `src\pages\admin\Dashboard.tsx`:37

> framer-motion-import: } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { Link } from '...

**Recommendation**: Remove framer-motion dependency. Use CSS transitions or Tailwind animate-* classes instead.

#### HEAVY_ANIMATION — `src\pages\admin\Dashboard.tsx`:290

> framer-motion-component: {/* Enhanced Welcome Section */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\pages\admin\Dashboard.tsx`:348

> framer-motion-component: {error && (
            <motion.div 
              initial={{ opacity: 0, y: -20 }}...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\pages\admin\Dashboard.tsx`:384

> framer-motion-component: {/* Requirements: 6.2, 6.4 - Real-time metrics display with animated counters and visual indicators ...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\pages\admin\Dashboard.tsx`:433

> framer-motion-component: {/* Weekly Overview */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\pages\admin\Dashboard.tsx`:346

> framer-motion-component: {/* Error Display */}
        <AnimatePresence>
          {error && (...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\pages\admin\EnhancedDashboard.tsx`:3

> framer-motion-import: import React, { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
impo...

**Recommendation**: Remove framer-motion dependency. Use CSS transitions or Tailwind animate-* classes instead.

#### HEAVY_ANIMATION — `src\pages\admin\EnhancedDashboard.tsx`:73

> framer-motion-component: <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-whi...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\pages\admin\EnhancedDashboard.tsx`:108

> framer-motion-component: {/* Enhanced Header */}
        <motion.div 
          initial={{ opacity: 0, y: -20 }}...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\pages\admin\EnhancedDashboard.tsx`:170

> framer-motion-component: {/* Navigation Tabs */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\pages\admin\EnhancedDashboard.tsx`:201

> framer-motion-component: {showNotifications && stats.pendingApplications > 0 && (
            <motion.div
              initi...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\pages\admin\EnhancedDashboard.tsx`:244

> framer-motion-component: {activeTab === 'overview' && (
            <motion.div
              key="overview"...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\pages\admin\EnhancedDashboard.tsx`:270

> framer-motion-component: {activeTab === 'monitoring' && (
            <motion.div
              key="monitoring"...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\pages\admin\EnhancedDashboard.tsx`:281

> framer-motion-component: {activeTab === 'analytics' && (
            <motion.div
              key="analytics"...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\pages\admin\EnhancedDashboard.tsx`:299

> framer-motion-component: {/* Quick Stats Footer */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\pages\admin\EnhancedDashboard.tsx`:199

> framer-motion-component: {/* Notifications Bar */}
        <AnimatePresence>
          {showNotifications && stats.pendingApp...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\pages\admin\EnhancedDashboard.tsx`:242

> framer-motion-component: {/* Tab Content */}
        <AnimatePresence mode="wait">
          {activeTab === 'overview' && (...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\pages\admin\WorkflowAutomation.tsx`:2

> framer-motion-import: import React, { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Z...

**Recommendation**: Remove framer-motion dependency. Use CSS transitions or Tailwind animate-* classes instead.

#### HEAVY_ANIMATION — `src\pages\admin\WorkflowAutomation.tsx`:163

> framer-motion-component: <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <motion.div
            initi...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\pages\admin\WorkflowAutomation.tsx`:181

> framer-motion-component: <motion.div
            initial={{ opacity: 0, y: 20 }}...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\pages\admin\WorkflowAutomation.tsx`:199

> framer-motion-component: <motion.div
            initial={{ opacity: 0, y: 20 }}...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\pages\admin\WorkflowAutomation.tsx`:217

> framer-motion-component: <motion.div
            initial={{ opacity: 0, y: 20 }}...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\pages\admin\WorkflowAutomation.tsx`:247

> framer-motion-component: {rules.map((rule, index) => (
              <motion.div
                key={rule.id}...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\pages\auth\ForgotPasswordPage.tsx`:13

> framer-motion-import: import { zodResolver } from '@hookform/resolvers/zod';
import { motion, useReducedMotion, AnimatePre...

**Recommendation**: Remove framer-motion dependency. Use CSS transitions or Tailwind animate-* classes instead.

#### HEAVY_ANIMATION — `src\pages\auth\ForgotPasswordPage.tsx`:142

> framer-motion-component: >
        <motion.div
          className="space-y-6"...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\pages\auth\ForgotPasswordPage.tsx`:149

> framer-motion-component: {/* Success icon */}
          <motion.div
            className="mx-auto flex h-16 w-16 items-cente...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\pages\auth\ForgotPasswordPage.tsx`:205

> framer-motion-component: >
      <motion.form
        className="space-y-6"...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\pages\auth\ForgotPasswordPage.tsx`:225

> framer-motion-component: {error && (
            <motion.div
              key="error"...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\pages\auth\ForgotPasswordPage.tsx`:223

> framer-motion-component: {/* Error message */}
        <AnimatePresence mode="wait">
          {error && (...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\pages\auth\ResetPasswordPage.tsx`:12

> framer-motion-import: import { zodResolver } from '@hookform/resolvers/zod';
import { motion, useReducedMotion, AnimatePre...

**Recommendation**: Remove framer-motion dependency. Use CSS transitions or Tailwind animate-* classes instead.

#### HEAVY_ANIMATION — `src\pages\auth\ResetPasswordPage.tsx`:206

> framer-motion-component: >
        <motion.div
          className="flex flex-col items-center justify-center py-8 space-y-4"...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\pages\auth\ResetPasswordPage.tsx`:212

> framer-motion-component: >
          <motion.div
            animate={prefersReducedMotion ? {} : { rotate: 360 }}...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\pages\auth\ResetPasswordPage.tsx`:233

> framer-motion-component: >
        <motion.div
          className="space-y-6"...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\pages\auth\ResetPasswordPage.tsx`:240

> framer-motion-component: {/* Success icon */}
          <motion.div
            className="mx-auto flex h-16 w-16 items-cente...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\pages\auth\ResetPasswordPage.tsx`:282

> framer-motion-component: >
        <motion.div
          className="space-y-6"...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\pages\auth\ResetPasswordPage.tsx`:289

> framer-motion-component: {/* Error icon */}
          <motion.div
            className="mx-auto flex h-16 w-16 items-center ...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\pages\auth\ResetPasswordPage.tsx`:338

> framer-motion-component: >
      <motion.form
        className="space-y-6"...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\pages\auth\ResetPasswordPage.tsx`:374

> framer-motion-component: {error && (
            <motion.div
              key="error"...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\pages\auth\ResetPasswordPage.tsx`:372

> framer-motion-component: {/* Error message */}
        <AnimatePresence mode="wait">
          {error && (...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\pages\auth\SignInPage.tsx`:14

> framer-motion-import: import { z } from 'zod';
import { motion, useReducedMotion, AnimatePresence } from 'framer-motion';
...

**Recommendation**: Remove framer-motion dependency. Use CSS transitions or Tailwind animate-* classes instead.

#### HEAVY_ANIMATION — `src\pages\auth\SignInPage.tsx`:166

> framer-motion-component: <form className="space-y-6" onSubmit={handleSubmit(onSubmit)}>
          <motion.div
            cus...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\pages\auth\SignInPage.tsx`:183

> framer-motion-component: <motion.div
            custom={1}...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\pages\auth\SignInPage.tsx`:202

> framer-motion-component: {error && (
              <motion.div
                key="error"...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\pages\auth\SignInPage.tsx`:218

> framer-motion-component: <motion.div
            custom={2}...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\pages\auth\SignInPage.tsx`:200

> framer-motion-component: {/* Error message with animation */}
          <AnimatePresence mode="wait">
            {error && (...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\pages\auth\SignUpPage.tsx`:14

> framer-motion-import: import { z } from 'zod';
import { motion, useReducedMotion, AnimatePresence } from 'framer-motion';
...

**Recommendation**: Remove framer-motion dependency. Use CSS transitions or Tailwind animate-* classes instead.

#### HEAVY_ANIMATION — `src\pages\auth\SignUpPage.tsx`:224

> framer-motion-component: >
          <motion.div 
            className="space-y-6 text-center"...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\pages\auth\SignUpPage.tsx`:230

> framer-motion-component: >
            <motion.div 
              className="mx-auto flex h-16 w-16 items-center justify-cent...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\pages\auth\SignUpPage.tsx`:276

> framer-motion-component: {/* Personal Information Section */}
          <motion.div
            custom={0}...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\pages\auth\SignUpPage.tsx`:308

> framer-motion-component: {emailChecking && (
                    <motion.div
                      key="checking"...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\pages\auth\SignUpPage.tsx`:321

> framer-motion-component: {!emailChecking && emailAvailable === true && (
                    <motion.div
                    ...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\pages\auth\SignUpPage.tsx`:334

> framer-motion-component: {!emailChecking && emailAvailable === false && (
                    <motion.div
                   ...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\pages\auth\SignUpPage.tsx`:356

> framer-motion-component: {/* Password Section */}
          <motion.div
            custom={1}...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\pages\auth\SignUpPage.tsx`:384

> framer-motion-component: {/* Contact Information */}
          <motion.div
            custom={2}...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\pages\auth\SignUpPage.tsx`:409

> framer-motion-component: {/* Demographics */}
          <motion.div
            custom={3}...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\pages\auth\SignUpPage.tsx`:452

> framer-motion-component: {/* Next of Kin Section */}
          <motion.div
            custom={4}...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\pages\auth\SignUpPage.tsx`:487

> framer-motion-component: {import.meta.env.VITE_TURNSTILE_SITE_KEY && (
            <motion.div
              custom={5}...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\pages\auth\SignUpPage.tsx`:513

> framer-motion-component: {error && (
              <motion.div
                key="error"...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\pages\auth\SignUpPage.tsx`:530

> framer-motion-component: {/* Submit Button */}
          <motion.div
            custom={6}...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\pages\auth\SignUpPage.tsx`:549

> framer-motion-component: {/* Terms */}
          <motion.p
            custom={7}...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\pages\auth\SignUpPage.tsx`:306

> framer-motion-component: {/* Email Status Indicator */}
                <AnimatePresence mode="wait">
                  {emai...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\pages\auth\SignUpPage.tsx`:511

> framer-motion-component: {/* Error Message */}
          <AnimatePresence mode="wait">
            {error && (...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\pages\public\tracker\components\ApplicationInfoGrid.tsx`:2

> framer-motion-import: import React from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { FileText...

**Recommendation**: Remove framer-motion dependency. Use CSS transitions or Tailwind animate-* classes instead.

#### HEAVY_ANIMATION — `src\pages\public\tracker\components\ApplicationInfoGrid.tsx`:24

> framer-motion-component: return (
    <motion.div
      initial={maybeMotion({ opacity: 0, y: 10 })}...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\pages\public\tracker\components\ApplicationInfoGrid.tsx`:46

> framer-motion-component: return (
    <motion.div
      initial={maybeMotion({ opacity: 0, x: 20 })}...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\pages\public\tracker\components\ApplicationStatusDetails.tsx`:2

> framer-motion-import: import React from 'react'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
...

**Recommendation**: Remove framer-motion dependency. Use CSS transitions or Tailwind animate-* classes instead.

#### HEAVY_ANIMATION — `src\pages\public\tracker\components\ApplicationStatusDetails.tsx`:39

> framer-motion-component: {/* Current Status Card */}
      <motion.div
        initial={maybeMotion({ opacity: 0, y: 20 })}...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\pages\public\tracker\components\ApplicationStatusDetails.tsx`:69

> framer-motion-component: {application.admin_feedback && (
          <motion.div
            initial={maybeMotion({ opacity: 0...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\pages\public\tracker\components\ApplicationStatusDetails.tsx`:67

> framer-motion-component: {/* Admin Feedback */}
      <AnimatePresence initial={!shouldReduceMotion}>
        {application.ad...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\pages\public\tracker\components\ApplicationStatusHeader.tsx`:2

> framer-motion-import: import React from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { Graduati...

**Recommendation**: Remove framer-motion dependency. Use CSS transitions or Tailwind animate-* classes instead.

#### HEAVY_ANIMATION — `src\pages\public\tracker\components\ApplicationStatusHeader.tsx`:57

> framer-motion-component: <div className="space-y-4 flex-1">
          <motion.div
            initial={maybeMotion({ opacity:...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\pages\public\tracker\components\ApplicationStatusHeader.tsx`:68

> framer-motion-component: <motion.div
            initial={maybeMotion({ opacity: 0, x: -20 })}...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\pages\public\tracker\components\ApplicationStatusHeader.tsx`:86

> framer-motion-component: {/* Right Side - Status & Actions */}
        <motion.div
          initial={maybeMotion({ opacity: ...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\pages\public\tracker\components\HelpSection.tsx`:2

> framer-motion-import: import React from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { Phone, M...

**Recommendation**: Remove framer-motion dependency. Use CSS transitions or Tailwind animate-* classes instead.

#### HEAVY_ANIMATION — `src\pages\public\tracker\components\HelpSection.tsx`:11

> framer-motion-component: return (
    <motion.div
      initial={maybeMotion({ opacity: 0, y: 20 })}...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\pages\public\tracker\components\NoResultsView.tsx`:3

> framer-motion-import: import { Link } from 'react-router-dom'
import { motion, useReducedMotion } from 'framer-motion'
imp...

**Recommendation**: Remove framer-motion dependency. Use CSS transitions or Tailwind animate-* classes instead.

#### HEAVY_ANIMATION — `src\pages\public\tracker\components\NoResultsView.tsx`:18

> framer-motion-component: <SectionCard className="text-center">
      <motion.div
        initial={maybeMotion({ opacity: 0, y...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\pages\public\tracker\components\TrackerSearchSection.tsx`:2

> framer-motion-import: import React from 'react'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
...

**Recommendation**: Remove framer-motion dependency. Use CSS transitions or Tailwind animate-* classes instead.

#### HEAVY_ANIMATION — `src\pages\public\tracker\components\TrackerSearchSection.tsx`:66

> framer-motion-component: {error && (
              <motion.div
                initial={maybeMotion({ opacity: 0, y: 10 })}...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\pages\public\tracker\components\TrackerSearchSection.tsx`:64

> framer-motion-component: {/* Error Message */}
          <AnimatePresence initial={!shouldReduceMotion}>
            {error &...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\pages\public\tracker\index.tsx`:4

> framer-motion-import: import { Link } from 'react-router-dom'
import { motion, useReducedMotion, AnimatePresence } from 'f...

**Recommendation**: Remove framer-motion dependency. Use CSS transitions or Tailwind animate-* classes instead.

#### HEAVY_ANIMATION — `src\pages\public\tracker\index.tsx`:279

> framer-motion-component: {application && (
              <motion.div
                initial={maybeMotion({ opacity: 0, y: 20...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\pages\public\tracker\index.tsx`:313

> framer-motion-component: {searched && !application && !loading && (
              <motion.div
                initial={maybeM...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\pages\public\tracker\index.tsx`:277

> framer-motion-component: {/* Application Results */}
          <AnimatePresence initial={!shouldReduceMotion}>
            {a...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\pages\public\tracker\index.tsx`:311

> framer-motion-component: {/* No Results */}
          <AnimatePresence initial={!shouldReduceMotion}>
            {searched &...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\pages\student\ApplicationDetail.tsx`:4

> framer-motion-import: import { useParams, Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { A...

**Recommendation**: Remove framer-motion dependency. Use CSS transitions or Tailwind animate-* classes instead.

#### HEAVY_ANIMATION — `src\pages\student\ApplicationDetail.tsx`:136

> framer-motion-component: {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\pages\student\ApplicationDetail.tsx`:163

> framer-motion-component: {interview && interview.status !== 'cancelled' && (
          <motion.div
            initial={{ opa...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\pages\student\ApplicationDetail.tsx`:174

> framer-motion-component: {/* Documents */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\pages\student\ApplicationDetail.tsx`:195

> framer-motion-component: {/* Personal Information */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\pages\student\ApplicationDetail.tsx`:235

> framer-motion-component: {/* Program Information */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\pages\student\ApplicationDetail.tsx`:270

> framer-motion-component: {/* Application Timeline */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\pages\student\ApplicationDetail.tsx`:321

> framer-motion-component: {/* Payment Information */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\pages\student\ApplicationStatus.tsx`:10

> framer-motion-import: import { formatDate } from '@/lib/utils'
import { motion } from 'framer-motion'
import { application...

**Recommendation**: Remove framer-motion dependency. Use CSS transitions or Tailwind animate-* classes instead.

#### HEAVY_ANIMATION — `src\pages\student\ApplicationStatus.tsx`:274

> framer-motion-component: {timeline.map((step, index) => (
                    <motion.div
                      key={`${step....

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\pages\student\ApplicationStatus.tsx`:386

> framer-motion-component: {application.result_slip_url && (
                    <motion.div
                      initial={{ o...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\pages\student\ApplicationStatus.tsx`:413

> framer-motion-component: {application.extra_kyc_url && (
                    <motion.div
                      initial={{ opa...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\pages\student\ApplicationStatus.tsx`:441

> framer-motion-component: {application.pop_url && (
                    <motion.div
                      initial={{ opacity: ...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\pages\student\applicationWizard\components\AnalyticsDashboard.tsx`:2

> framer-motion-import: import { useEffect, useState, useCallback } from 'react'
import { motion } from 'framer-motion'
impo...

**Recommendation**: Remove framer-motion dependency. Use CSS transitions or Tailwind animate-* classes instead.

#### HEAVY_ANIMATION — `src\pages\student\applicationWizard\components\AnalyticsDashboard.tsx`:69

> framer-motion-component: return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\pages\student\applicationWizard\components\ApplicationPreview.tsx`:1

> framer-motion-import: import { motion } from 'framer-motion'
import { FileText, User, GraduationCap, CreditCard } from 'lu...

**Recommendation**: Remove framer-motion dependency. Use CSS transitions or Tailwind animate-* classes instead.

#### HEAVY_ANIMATION — `src\pages\student\applicationWizard\components\ApplicationPreview.tsx`:16

> framer-motion-component: return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\pages\student\applicationWizard\components\DraftManager.tsx`:2

> framer-motion-import: import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Fi...

**Recommendation**: Remove framer-motion dependency. Use CSS transitions or Tailwind animate-* classes instead.

#### HEAVY_ANIMATION — `src\pages\student\applicationWizard\components\DraftManager.tsx`:83

> framer-motion-component: <>
            <motion.div
              initial={{ opacity: 0 }}...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\pages\student\applicationWizard\components\DraftManager.tsx`:90

> framer-motion-component: />
            <motion.div
              initial={{ opacity: 0, x: 300 }}...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\pages\student\applicationWizard\components\DraftManager.tsx`:142

> framer-motion-component: {drafts.map((draft) => (
                      <motion.div
                        key={draft.id}...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\pages\student\applicationWizard\components\DraftManager.tsx`:80

> framer-motion-component: <AnimatePresence>
        {isOpen && (...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\pages\student\applicationWizard\components\EnhancedProgressIndicator.tsx`:8

> framer-motion-import: import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle, Circle } from 'lucide...

**Recommendation**: Remove framer-motion dependency. Use CSS transitions or Tailwind animate-* classes instead.

#### HEAVY_ANIMATION — `src\pages\student\applicationWizard\components\EnhancedProgressIndicator.tsx`:88

> framer-motion-component: return (
    <motion.button
      type="button"...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\pages\student\applicationWizard\components\EnhancedProgressIndicator.tsx`:106

> framer-motion-component: {/* Step circle with icon */}
      <motion.div
        className={cn(...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\pages\student\applicationWizard\components\EnhancedProgressIndicator.tsx`:122

> framer-motion-component: {isCompleted ? (
            <motion.div
              key="check"...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\pages\student\applicationWizard\components\EnhancedProgressIndicator.tsx`:137

> framer-motion-component: ) : (
            <motion.div
              key="icon"...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\pages\student\applicationWizard\components\EnhancedProgressIndicator.tsx`:155

> framer-motion-component: {isCurrent && shouldAnimate && (
          <motion.div
            className="absolute inset-0 round...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\pages\student\applicationWizard\components\EnhancedProgressIndicator.tsx`:172

> framer-motion-component: {/* Step label */}
      <motion.div 
        className={cn(...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\pages\student\applicationWizard\components\EnhancedProgressIndicator.tsx`:188

> framer-motion-component: {/* Step number badge */}
      <motion.div
        className={cn(...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\pages\student\applicationWizard\components\EnhancedProgressIndicator.tsx`:205

> framer-motion-component: {isClickable && (
        <motion.div 
          className="absolute -bottom-6 left-1/2 -translate-x...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\pages\student\applicationWizard\components\EnhancedProgressIndicator.tsx`:280

> framer-motion-component: return (
    <motion.button
      type="button"...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\pages\student\applicationWizard\components\EnhancedProgressIndicator.tsx`:300

> framer-motion-component: {/* Step circle */}
      <motion.div
        className={cn(...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\pages\student\applicationWizard\components\EnhancedProgressIndicator.tsx`:315

> framer-motion-component: {isCompleted ? (
            <motion.div
              key="check"...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\pages\student\applicationWizard\components\EnhancedProgressIndicator.tsx`:324

> framer-motion-component: ) : (
            <motion.div
              key="icon"...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\pages\student\applicationWizard\components\EnhancedProgressIndicator.tsx`:351

> framer-motion-component: {isCompleted && (
        <motion.div
          initial={{ scale: 0 }}...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\pages\student\applicationWizard\components\EnhancedProgressIndicator.tsx`:366

> framer-motion-component: {isCurrent && !isCompleted && (
        <motion.div
          className="w-2 h-2 rounded-full bg-pri...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\pages\student\applicationWizard\components\EnhancedProgressIndicator.tsx`:408

> framer-motion-component: {/* Animated progress line */}
        <motion.div
          className="absolute top-[22px] left-0 h...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\pages\student\applicationWizard\components\EnhancedProgressIndicator.tsx`:478

> framer-motion-component: <div className="h-2 bg-border rounded-full overflow-hidden">
          <motion.div
            class...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\pages\student\applicationWizard\components\EnhancedProgressIndicator.tsx`:120

> framer-motion-component: >
        <AnimatePresence mode="wait">
          {isCompleted ? (...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\pages\student\applicationWizard\components\EnhancedProgressIndicator.tsx`:313

> framer-motion-component: >
        <AnimatePresence mode="wait">
          {isCompleted ? (...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\pages\student\applicationWizard\components\KeyboardShortcutsHelp.tsx`:2

> framer-motion-import: import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Ke...

**Recommendation**: Remove framer-motion dependency. Use CSS transitions or Tailwind animate-* classes instead.

#### HEAVY_ANIMATION — `src\pages\student\applicationWizard\components\KeyboardShortcutsHelp.tsx`:31

> framer-motion-component: <>
            <motion.div
              initial={{ opacity: 0 }}...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\pages\student\applicationWizard\components\KeyboardShortcutsHelp.tsx`:38

> framer-motion-component: />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\pages\student\applicationWizard\components\KeyboardShortcutsHelp.tsx`:28

> framer-motion-component: <AnimatePresence>
        {isOpen && (...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\pages\student\applicationWizard\components\ReminderSettings.tsx`:2

> framer-motion-import: import { useState } from 'react'
import { motion } from 'framer-motion'
import { Bell, Check } from ...

**Recommendation**: Remove framer-motion dependency. Use CSS transitions or Tailwind animate-* classes instead.

#### HEAVY_ANIMATION — `src\pages\student\applicationWizard\components\ReminderSettings.tsx`:56

> framer-motion-component: return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\pages\student\applicationWizard\components\StepChecklist.tsx`:2

> framer-motion-import: import { CheckCircle, Circle } from 'lucide-react'
import { motion } from 'framer-motion'...

**Recommendation**: Remove framer-motion dependency. Use CSS transitions or Tailwind animate-* classes instead.

#### HEAVY_ANIMATION — `src\pages\student\applicationWizard\components\StepChecklist.tsx`:19

> framer-motion-component: return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\pages\student\applicationWizard\components\StepChecklist.tsx`:32

> framer-motion-component: {items.map((item, index) => (
          <motion.div
            key={index}...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\pages\student\applicationWizard\components\StepTransition.tsx`:9

> framer-motion-import: import { ReactNode } from 'react';
import { motion, AnimatePresence, useReducedMotion, Variants } fr...

**Recommendation**: Remove framer-motion dependency. Use CSS transitions or Tailwind animate-* classes instead.

#### HEAVY_ANIMATION — `src\pages\student\applicationWizard\components\StepTransition.tsx`:104

> framer-motion-component: <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={stepKey}...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\pages\student\applicationWizard\components\StepTransition.tsx`:127

> framer-motion-component: return (
    <motion.div
      className={cn(...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\pages\student\applicationWizard\components\StepTransition.tsx`:137

> framer-motion-component: {(title || description) && (
        <motion.div 
          className="mb-6"...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\pages\student\applicationWizard\components\StepTransition.tsx`:169

> framer-motion-component: return (
    <motion.div
      className={className}...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\pages\student\applicationWizard\components\StepTransition.tsx`:191

> framer-motion-component: return (
    <motion.div
      className={cn('space-y-4', className)}...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\pages\student\applicationWizard\components\StepTransition.tsx`:198

> framer-motion-component: {title && (
        <motion.h3 
          className="text-sm font-medium text-muted-foreground upper...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\pages\student\applicationWizard\components\StepTransition.tsx`:103

> framer-motion-component: return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\pages\student\applicationWizard\components\SubmissionSuccess.tsx`:1

> framer-motion-import: import { motion } from 'framer-motion'
import { CheckCircle, Download, Mail, Send } from 'lucide-rea...

**Recommendation**: Remove framer-motion dependency. Use CSS transitions or Tailwind animate-* classes instead.

#### HEAVY_ANIMATION — `src\pages\student\applicationWizard\components\SubmissionSuccess.tsx`:73

> framer-motion-component: <div className="max-w-lg w-full">
      <motion.div
        className="bg-card rounded-lg shadow-lg ...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\pages\student\applicationWizard\components\SubmissionSuccess.tsx`:79

> framer-motion-component: >
        <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.2, type: ...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\pages\student\applicationWizard\components\SubmissionSuccess.tsx`:86

> framer-motion-component: <motion.div
          className="bg-accent/10 border border-accent/30 rounded-lg p-4 mb-6"...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\pages\student\applicationWizard\index.tsx`:1

> framer-motion-import: import { AnimatePresence, motion } from 'framer-motion'
import { ArrowLeft, ArrowRight, CheckCircle,...

**Recommendation**: Remove framer-motion dependency. Use CSS transitions or Tailwind animate-* classes instead.

#### HEAVY_ANIMATION — `src\pages\student\applicationWizard\index.tsx`:250

> framer-motion-component: ) : (
              <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} tran...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\pages\student\applicationWizard\index.tsx`:277

> framer-motion-component: <div className="flex-1 bg-border rounded-full h-2 overflow-hidden">
                    <motion.div
...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\pages\student\applicationWizard\index.tsx`:381

> framer-motion-component: {error && (
          <motion.div className="rounded-md bg-destructive/10 border border-destructive/...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\pages\student\applicationWizard\index.tsx`:404

> framer-motion-component: {!stepValidation.isValid && !isLastStep && stepValidation.completedFields > 0 && (
          <motion...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\pages\student\applicationWizard\index.tsx`:495

> framer-motion-component: <motion.div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\pages\student\applicationWizard\index.tsx`:498

> framer-motion-component: {currentStepIndex > 0 && (
                <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scal...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\pages\student\applicationWizard\index.tsx`:509

> framer-motion-component: {!isLastStep ? (
                <motion.div whileHover={{ scale: loading || uploading ? 1 : 1.05 }}...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\pages\student\applicationWizard\index.tsx`:515

> framer-motion-component: ) : (
                <motion.div whileHover={{ scale: loading ? 1 : 1.05 }} whileTap={{ scale: load...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\pages\student\applicationWizard\index.tsx`:544

> framer-motion-component: <motion.div
                initial={{ opacity: 0, y: 10 }}...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\pages\student\applicationWizard\index.tsx`:427

> framer-motion-component: <form onSubmit={form.handleSubmit(handleSubmitApplication)} className="space-y-6 lg:space-y-8">
    ...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\pages\student\applicationWizard\steps\BasicKycStep.tsx`:3

> framer-motion-import: import { motion } from 'framer-motion'
import { CheckCircle } from 'lucide-react'...

**Recommendation**: Remove framer-motion dependency. Use CSS transitions or Tailwind animate-* classes instead.

#### HEAVY_ANIMATION — `src\pages\student\applicationWizard\steps\BasicKycStep.tsx`:90

> framer-motion-component: return (
    <motion.div
      key="step1"...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\pages\student\applicationWizard\steps\BasicKycStep.tsx`:107

> framer-motion-component: {hasAutoPopulatedData && (
        <motion.div
          initial={shouldAnimate ? { opacity: 0, y: -...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\pages\student\applicationWizard\steps\BasicKycStep.tsx`:122

> framer-motion-component: <motion.div 
        className="grid grid-cols-1 lg:grid-cols-2 gap-6"...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\pages\student\applicationWizard\steps\BasicKycStep.tsx`:128

> framer-motion-component: >
        <motion.div className="lg:col-span-2" variants={itemVariants}>
          <AnimatedInput...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\pages\student\applicationWizard\steps\BasicKycStep.tsx`:136

> framer-motion-component: <motion.div variants={itemVariants}>
          <div className="flex items-center gap-2 mb-1">...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\pages\student\applicationWizard\steps\BasicKycStep.tsx`:153

> framer-motion-component: <motion.div variants={itemVariants}>
          <AnimatedInput...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\pages\student\applicationWizard\steps\BasicKycStep.tsx`:162

> framer-motion-component: <motion.div variants={itemVariants}>
          <AnimatedInput...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\pages\student\applicationWizard\steps\BasicKycStep.tsx`:171

> framer-motion-component: <motion.div variants={itemVariants}>
          <FormSelect...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\pages\student\applicationWizard\steps\BasicKycStep.tsx`:186

> framer-motion-component: <motion.div variants={itemVariants}>
          <div className="flex items-center gap-2 mb-1">...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\pages\student\applicationWizard\steps\BasicKycStep.tsx`:202

> framer-motion-component: <motion.div variants={itemVariants}>
          <AnimatedInput...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\pages\student\applicationWizard\steps\BasicKycStep.tsx`:211

> framer-motion-component: <motion.div variants={itemVariants}>
          <AnimatedInput...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\pages\student\applicationWizard\steps\BasicKycStep.tsx`:219

> framer-motion-component: <motion.div variants={itemVariants}>
          <AnimatedInput...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\pages\student\applicationWizard\steps\BasicKycStep.tsx`:228

> framer-motion-component: <motion.div variants={itemVariants}>
          <AnimatedInput...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\pages\student\applicationWizard\steps\BasicKycStep.tsx`:236

> framer-motion-component: <motion.div variants={itemVariants}>
          <AnimatedInput...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\pages\student\applicationWizard\steps\BasicKycStep.tsx`:244

> framer-motion-component: <motion.div variants={itemVariants}>
          <FormSelect...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\pages\student\applicationWizard\steps\BasicKycStep.tsx`:260

> framer-motion-component: <motion.div variants={itemVariants}>
          <FormSelect...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\pages\student\applicationWizard\steps\BasicKycStep.tsx`:281

> framer-motion-component: {selectedProgramDetails && (
        <motion.div
          className="mt-4 p-4 bg-primary/10 rounded...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\pages\student\applicationWizard\steps\EducationStep.tsx`:3

> framer-motion-import: import { motion, useReducedMotion } from 'framer-motion'
import { X } from 'lucide-react'...

**Recommendation**: Remove framer-motion dependency. Use CSS transitions or Tailwind animate-* classes instead.

#### HEAVY_ANIMATION — `src\pages\student\applicationWizard\steps\EducationStep.tsx`:106

> framer-motion-component: return (
    <motion.div
      key="step2"...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\pages\student\applicationWizard\steps\EducationStep.tsx`:117

> framer-motion-component: <motion.div 
        className="space-y-6"...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\pages\student\applicationWizard\steps\EducationStep.tsx`:123

> framer-motion-component: >
        <motion.div variants={itemVariants}>
          <div className="flex flex-col sm:flex-row s...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\pages\student\applicationWizard\steps\EducationStep.tsx`:149

> framer-motion-component: {selectedProgram && recommendedSubjects.length > 0 && (
            <motion.div
              classN...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\pages\student\applicationWizard\steps\EducationStep.tsx`:177

> framer-motion-component: {selectedGrades.map((grade, index) => (
              <motion.div
                key={index}...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\pages\student\applicationWizard\steps\EducationStep.tsx`:248

> framer-motion-component: {/* Document Uploads */}
        <motion.div 
          className="grid grid-cols-1 lg:grid-cols-2 g...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\pages\student\applicationWizard\steps\EducationStep.tsx`:253

> framer-motion-component: <div>
            <motion.div 
              className="mb-3 p-3 bg-blue-50 border border-blue-200 r...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\pages\student\applicationWizard\steps\PaymentStep.tsx`:4

> framer-motion-import: import { motion, useReducedMotion } from 'framer-motion'
import { CreditCard } from 'lucide-react'...

**Recommendation**: Remove framer-motion dependency. Use CSS transitions or Tailwind animate-* classes instead.

#### HEAVY_ANIMATION — `src\pages\student\applicationWizard\steps\PaymentStep.tsx`:81

> framer-motion-component: return (
    <motion.div
      key="step3"...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\pages\student\applicationWizard\steps\PaymentStep.tsx`:93

> framer-motion-component: <div className="space-y-6">
        <motion.div
          className="bg-gradient-to-r from-blue-50 t...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\pages\student\applicationWizard\steps\PaymentStep.tsx`:143

> framer-motion-component: <motion.div 
          className="grid grid-cols-1 lg:grid-cols-2 gap-6"...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\pages\student\applicationWizard\steps\PaymentStep.tsx`:149

> framer-motion-component: >
          <motion.div variants={itemVariants}>
            <FormSelect...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\pages\student\applicationWizard\steps\PaymentStep.tsx`:160

> framer-motion-component: <motion.div variants={itemVariants}>
            <AnimatedInput...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\pages\student\applicationWizard\steps\PaymentStep.tsx`:169

> framer-motion-component: <motion.div variants={itemVariants}>
            <AnimatedInput...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\pages\student\applicationWizard\steps\PaymentStep.tsx`:178

> framer-motion-component: <motion.div variants={itemVariants}>
            <AnimatedInput...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\pages\student\applicationWizard\steps\PaymentStep.tsx`:189

> framer-motion-component: <motion.div variants={itemVariants}>
            <AnimatedInput...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\pages\student\applicationWizard\steps\PaymentStep.tsx`:198

> framer-motion-component: <motion.div variants={itemVariants}>
            <AnimatedInput...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\pages\student\applicationWizard\steps\PaymentStep.tsx`:209

> framer-motion-component: <motion.div 
          variants={itemVariants}...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\pages\student\applicationWizard\steps\SubmitStep.tsx`:1

> framer-motion-import: import { motion } from 'framer-motion'
import type { UseFormReturn } from 'react-hook-form'...

**Recommendation**: Remove framer-motion dependency. Use CSS transitions or Tailwind animate-* classes instead.

#### HEAVY_ANIMATION — `src\pages\student\applicationWizard\steps\SubmitStep.tsx`:54

> framer-motion-component: return (
    <motion.div
      key="step4"...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\pages\student\Dashboard.tsx`:4

> framer-motion-import: import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useAuth } fr...

**Recommendation**: Remove framer-motion dependency. Use CSS transitions or Tailwind animate-* classes instead.

#### HEAVY_ANIMATION — `src\pages\student\Dashboard.tsx`:426

> framer-motion-component: {error && (
              <motion.div
                initial={{ opacity: 0, y: -20 }}...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\pages\student\Dashboard.tsx`:484

> framer-motion-component: {draftApplications.map((application, index) => (
                      <motion.div
                 ...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\pages\student\Dashboard.tsx`:650

> framer-motion-component: {submittedApplications.map((application, index) => (
                      <motion.div
             ...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\pages\student\Dashboard.tsx`:764

> framer-motion-component: {intakes.slice(0, 3).map((intake, index) => (
                      <motion.div
                    ...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\pages\student\NotificationSettings.tsx`:4

> framer-motion-import: import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { format } fro...

**Recommendation**: Remove framer-motion dependency. Use CSS transitions or Tailwind animate-* classes instead.

#### HEAVY_ANIMATION — `src\pages\student\NotificationSettings.tsx`:193

> framer-motion-component: return (
      <motion.div
        key={channel}...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\pages\student\NotificationSettings.tsx`:286

> framer-motion-component: <motion.div
            initial={{ opacity: 0, y: 20 }}...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\pages\student\NotificationSettings.tsx`:299

> framer-motion-component: {error && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\pages\student\NotificationSettings.tsx`:312

> framer-motion-component: {success && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\pages\student\Settings.tsx`:13

> framer-motion-import: import { ActiveSessions } from '@/components/ui/ActiveSessions'
import { motion } from 'framer-motio...

**Recommendation**: Remove framer-motion dependency. Use CSS transitions or Tailwind animate-* classes instead.

#### HEAVY_ANIMATION — `src\pages\student\Settings.tsx`:101

> framer-motion-component: </Link>
          <motion.div 
            initial={{ opacity: 0, y: 20 }}...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\pages\student\Settings.tsx`:116

> framer-motion-component: {error && (
          <motion.div 
            initial={{ opacity: 0, y: -20 }}...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\pages\student\Settings.tsx`:129

> framer-motion-component: {success && (
          <motion.div 
            initial={{ opacity: 0, y: -20 }}...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\pages\student\Settings.tsx`:143

> framer-motion-component: {/* Basic Information */}
          <motion.div 
            initial={{ opacity: 0, y: 20 }}...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\pages\student\Settings.tsx`:225

> framer-motion-component: {/* Address Information */}
          <motion.div 
            initial={{ opacity: 0, y: 20 }}...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\pages\student\Settings.tsx`:262

> framer-motion-component: {/* Next of Kin */}
          <motion.div 
            initial={{ opacity: 0, y: 20 }}...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\pages\student\Settings.tsx`:299

> framer-motion-component: {/* Security & Sessions */}
          <motion.div 
            initial={{ opacity: 0, y: 20 }}...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### HEAVY_ANIMATION — `src\pages\student\Settings.tsx`:318

> framer-motion-component: {/* Action Buttons */}
          <motion.div 
            initial={{ opacity: 0, y: 20 }}...

**Recommendation**: Replace motion.* components with standard HTML elements and CSS transitions.

#### LARGE_BUNDLE — `dist/assets/js/`

> Total JS bundle size is 4.18 MB, exceeding the 500 KB threshold

**Recommendation**: Review and optimize bundle. Consider code splitting, tree shaking, and removing unused dependencies.

#### LARGE_BUNDLE — `assets\js\index-_ZXfiSGn.js`

> Chunk "index-_ZXfiSGn.js" is 470.17 KB, exceeding the 200 KB threshold for entry chunks

**Recommendation**: Consider code splitting to reduce entry chunk size. Move non-critical code to lazy-loaded chunks.

#### LARGE_BUNDLE — `assets\js\vendor-excel-CACNO4NF.js`

> Chunk "vendor-excel-CACNO4NF.js" is 1.29 MB, exceeding the 150 KB threshold for vendor chunks

**Recommendation**: Review vendor dependencies. Consider tree-shaking or replacing heavy libraries.

#### LARGE_BUNDLE — `assets\js\vendor-pdf-C9V55MG-.js`

> Chunk "vendor-pdf-C9V55MG-.js" is 917.21 KB, exceeding the 150 KB threshold for vendor chunks

**Recommendation**: Review vendor dependencies. Consider tree-shaking or replacing heavy libraries.

### 🟡 Medium Impact Issues

| File | Line | Type | Evidence | Recommendation |
|------|------|------|----------|----------------|
| `src\components\ui\EnhancedLoadingSpinner.tsx` | 67 | HEAVY_ANIMATION | css-animation-property: style={{
                  animat... | Ensure animation uses GPU-accelerated properties (transfo... |
| `src\index.css` | 268 | HEAVY_ANIMATION | css-animation-property: background-size: 1000px 100%;
   ... | Ensure animation uses GPU-accelerated properties (transfo... |
| `src\styles\accreditation.css` | 121 | HEAVY_ANIMATION | css-animation-property: background-size: 200% 100%;
  ani... | Ensure animation uses GPU-accelerated properties (transfo... |
| `src\styles\accreditation.css` | 32 | HEAVY_ANIMATION | css-transition-complex: justify-content: space-between;
 ... | Simplify transition. Avoid transitioning multiple propert... |
| `src\styles\accreditation.css` | 56 | HEAVY_ANIMATION | css-transition-complex: object-fit: contain;
  transition... | Simplify transition. Avoid transitioning multiple propert... |
| `src\styles\animations.css` | 104 | HEAVY_ANIMATION | css-animation-property: .animate-shimmer {
  animation: s... | Ensure animation uses GPU-accelerated properties (transfo... |
| `src\styles\animations.css` | 120 | HEAVY_ANIMATION | css-animation-property: background: linear-gradient(90deg... | Ensure animation uses GPU-accelerated properties (transfo... |
| `src\styles\animations.css` | 180 | HEAVY_ANIMATION | css-animation-property: .loading-pulse {
  animation: pul... | Ensure animation uses GPU-accelerated properties (transfo... |
| `src\styles\animations.css` | 196 | HEAVY_ANIMATION | css-animation-property: background-size: 200% 100%;
  ani... | Ensure animation uses GPU-accelerated properties (transfo... |
| `src\styles\animations.css` | 126 | HEAVY_ANIMATION | css-transition-complex: /* Only transition transform and ... | Simplify transition. Avoid transitioning multiple propert... |
| `src\styles\animations.css` | 136 | HEAVY_ANIMATION | css-transition-complex: /* Fast transitions for immediate... | Simplify transition. Avoid transitioning multiple propert... |
| `src\styles\animations.css` | 142 | HEAVY_ANIMATION | css-transition-complex: /* Use transform instead of box-s... | Simplify transition. Avoid transitioning multiple propert... |
| `src\styles\animations.css` | 156 | HEAVY_ANIMATION | css-transition-complex: .hover-scale {
  transition: tran... | Simplify transition. Avoid transitioning multiple propert... |
| `src\styles\mobile-enhancements.css` | 80 | HEAVY_ANIMATION | css-animation-property: background-size: 200% 100%;
  ani... | Ensure animation uses GPU-accelerated properties (transfo... |
| `src\styles\mobile-enhancements.css` | 121 | HEAVY_ANIMATION | css-animation-property: .mobile-pulse {
  animation: smoo... | Ensure animation uses GPU-accelerated properties (transfo... |
| `src\styles\mobile-enhancements.css` | 555 | HEAVY_ANIMATION | css-animation-property: );
  animation: upload-progress 2... | Ensure animation uses GPU-accelerated properties (transfo... |
| `src\styles\mobile-enhancements.css` | 133 | HEAVY_ANIMATION | css-transition-complex: border-radius: 8px;
  transition:... | Simplify transition. Avoid transitioning multiple propert... |
| `src\styles\mobile-enhancements.css` | 159 | HEAVY_ANIMATION | css-transition-complex: border-radius: 12px !important;
 ... | Simplify transition. Avoid transitioning multiple propert... |
| `src\styles\mobile-enhancements.css` | 188 | HEAVY_ANIMATION | css-transition-complex: opacity: 0;
  transition: opacity... | Simplify transition. Avoid transitioning multiple propert... |
| `src\styles\mobile-enhancements.css` | 372 | HEAVY_ANIMATION | css-transition-complex: font-size: 16px !important;
    t... | Simplify transition. Avoid transitioning multiple propert... |
| `src\styles\mobile-enhancements.css` | 510 | HEAVY_ANIMATION | css-transition-complex: opacity: 1;
    transition: trans... | Simplify transition. Avoid transitioning multiple propert... |
| `src\styles\mobile-enhancements.css` | 521 | HEAVY_ANIMATION | css-transition-complex: opacity: 0;
    transition: trans... | Simplify transition. Avoid transitioning multiple propert... |
| `src\styles\pwa.css` | 145 | HEAVY_ANIMATION | css-animation-property: border-radius: 50%;
  animation: ... | Ensure animation uses GPU-accelerated properties (transfo... |
| `src\styles\pwa.css` | 252 | HEAVY_ANIMATION | css-animation-property: margin-bottom: 2rem;
  animation:... | Ensure animation uses GPU-accelerated properties (transfo... |
| `src\styles\smooth-animations.css` | 44 | HEAVY_ANIMATION | css-keyframes: }
}

@keyframes smoothBounce {
  0%, 20%, ... | Review keyframe animation complexity. Consider simplifyin... |
| `src\styles\smooth-animations.css` | 174 | HEAVY_ANIMATION | css-animation-property: .smooth-spin {
  animation: smoot... | Ensure animation uses GPU-accelerated properties (transfo... |
| `src\styles\smooth-animations.css` | 178 | HEAVY_ANIMATION | css-animation-property: .smooth-pulse {
  animation: smoo... | Ensure animation uses GPU-accelerated properties (transfo... |
| `src\styles\smooth-animations.css` | 182 | HEAVY_ANIMATION | css-animation-property: .smooth-bounce {
  animation: smo... | Ensure animation uses GPU-accelerated properties (transfo... |
| `src\styles\smooth-animations.css` | 283 | HEAVY_ANIMATION | css-animation-property: background-size: 200% 100%;
  ani... | Ensure animation uses GPU-accelerated properties (transfo... |
| `src\styles\smooth-animations.css` | 293 | HEAVY_ANIMATION | css-animation-property: .floating-orb-1 {
  animation: sm... | Ensure animation uses GPU-accelerated properties (transfo... |
| `src\styles\smooth-animations.css` | 297 | HEAVY_ANIMATION | css-animation-property: .floating-orb-2 {
  animation: sm... | Ensure animation uses GPU-accelerated properties (transfo... |
| `src\styles\smooth-animations.css` | 301 | HEAVY_ANIMATION | css-animation-property: .floating-orb-3 {
  animation: sm... | Ensure animation uses GPU-accelerated properties (transfo... |
| `src\styles\smooth-animations.css` | 211 | HEAVY_ANIMATION | css-transition-complex: .smooth-transition {
  transition... | Simplify transition. Avoid transitioning multiple propert... |
| `src\styles\smooth-animations.css` | 217 | HEAVY_ANIMATION | css-transition-complex: .smooth-transition-fast {
  trans... | Simplify transition. Avoid transitioning multiple propert... |
| `src\styles\smooth-animations.css` | 223 | HEAVY_ANIMATION | css-transition-complex: .smooth-transition-slow {
  trans... | Simplify transition. Avoid transitioning multiple propert... |
| `src\styles\smooth-animations.css` | 244 | HEAVY_ANIMATION | css-transition-complex: .smooth-button {
  transition: al... | Simplify transition. Avoid transitioning multiple propert... |
| `src\styles\smooth-animations.css` | 261 | HEAVY_ANIMATION | css-transition-complex: .smooth-nav-item {
  transition: ... | Simplify transition. Avoid transitioning multiple propert... |
| `assets\js\Analytics-iU94B-pp.js` | — | LARGE_BUNDLE | Chunk "Analytics-iU94B-pp.js" is 112.23 KB, exceeding the... | Lazy chunk is larger than expected. Consider further spli... |
| `assets\js\Applications-Bu_1evs_.js` | — | LARGE_BUNDLE | Chunk "Applications-Bu_1evs_.js" is 51.04 KB, exceeding t... | Lazy chunk is larger than expected. Consider further spli... |
| `assets\js\html2canvas.esm-CyxsxQj2.js` | — | LARGE_BUNDLE | Chunk "html2canvas.esm-CyxsxQj2.js" is 194.76 KB, exceedi... | Lazy chunk is larger than expected. Consider further spli... |
| `assets\js\schemas-CPix9jjG.js` | — | LARGE_BUNDLE | Chunk "schemas-CPix9jjG.js" is 89.23 KB, exceeding the 50... | Shared chunk is large. Review for unused exports or consi... |
| `assets\js\useApplicationsData-6oQkkQc-.js` | — | LARGE_BUNDLE | Chunk "useApplicationsData-6oQkkQc-.js" is 69.06 KB, exce... | Shared chunk is large. Review for unused exports or consi... |
| `assets\js\Users-Bzp5TXIG.js` | — | LARGE_BUNDLE | Chunk "Users-Bzp5TXIG.js" is 66.17 KB, exceeding the 50 K... | Shared chunk is large. Review for unused exports or consi... |

## Mobile Optimization Recommendations

These recommendations target low-end Android phones on slow (3G) networks,
which is the primary use case for MIHAS students in Zambia.

### Priority Actions

1. Remove framer-motion from 98 file(s) — adds ~30KB+ to bundle and causes jank on low-end devices.
2. Replace heavy animations with CSS transitions using transform and opacity only (GPU-accelerated).
3. Reduce total JS bundle by 3.70 MB to meet the <500.00 KB target.
4. Review 2 oversized vendor chunk(s) for lighter alternatives or tree-shaking opportunities.
5. Ensure all page components use React.lazy() for code splitting — critical for 3G load times.
6. Use loading="lazy" on all below-the-fold images to reduce initial payload.
7. Prefer CSS transitions over JS animations — lower CPU and battery usage on cheap Android phones.
8. Debounce search inputs (300ms minimum) to reduce CPU usage on low-end devices.
9. Ensure prefers-reduced-motion is respected in all animation components for accessibility.

### Performance Targets

| Metric | Target | Notes |
|--------|--------|-------|
| First Contentful Paint | <1.5s | Critical for user perception |
| Largest Contentful Paint | <2.5s | Main content visible |
| Main Bundle Size | <500KB | Total JS payload |
| Lighthouse Score | >90 | Overall performance |
| First Load (3G) | <2.5s | Zambian network conditions |
| Wizard Navigation | <100ms | Perceived responsiveness |

## Logo Animation Audit

The logo animation component (`src/components/ui/LogoAnimation.tsx`) is audited
against Requirements 8.1-8.4.

| Requirement | Description | Expected |
|-------------|-------------|----------|
| 8.1 | Lightweight character-shuffle effect | CSS/JS-only, no heavy libraries |
| 8.2 | Non-blocking to page rendering | Async or deferred execution |
| 8.3 | Respects prefers-reduced-motion | Media query or matchMedia check |
| 8.4 | Does not affect performance metrics | No layout shifts, no blocking |

> **Note**: The LogoAnimation component was implemented as part of task 13.5.
> Verify these properties are maintained when modifying the component.

## Requirements Validation

This section maps the audit findings to the specification requirements.

| Requirement | Description | Status | Evidence |
|-------------|-------------|--------|----------|
| 7.1 | Test layout responsiveness | ✅ | Covered by page auditor (mobileChecker) |
| 7.2 | Flag heavy animations for removal | ✅ | 577 heavy animation(s) flagged |
| 7.3 | Low memory usage on mobile | ❌ | 98 framer-motion file(s) increase memory |
| 7.4 | Low CPU usage on mobile | ❌ | 577 heavy animation(s) increase CPU |
| 7.5 | Minimize JS bundle impact | ❌ | Total: 4.18 MB (target: <500.00 KB) |
| 7.6 | Optimized for cheap Android phones | ✅ | 9 optimization(s) recommended |
| 7.7 | Optimized for slow networks (3G) | ❌ | Bundle size is above threshold |
| 8.1 | Logo uses lightweight character-shuffle | ✅ | LogoAnimation component implemented |
| 8.2 | Logo is non-blocking | ✅ | No render-blocking detected |
| 8.3 | Reduced-motion preference respected | ✅ | Covered by property test (Property 22) |
| 8.4 | Logo does not affect performance | ✅ | No performance impact detected |

### Overall Compliance: 64%

7 of 11 requirements fully satisfied.

---

*This report was generated by the MIHAS Frontend-Backend Forensic Audit System.*

**Validates**: Requirements 7.1-7.7, 8.1-8.4 — Mobile performance and logo animation