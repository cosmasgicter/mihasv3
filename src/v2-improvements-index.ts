// @ts-nocheck
// Export all components, hooks, and utilities for easy importing

// UI Components
export { EnhancedLoadingSpinner, FullScreenLoader, SkeletonCard, SkeletonTable, SkeletonForm, LoadingButton } from './components/ui/EnhancedLoadingSpinner'
export { ProgressIndicator, ProgressBar } from './components/ui/ProgressIndicator'
export { EnhancedFileUpload, ImagePreview } from './components/ui/EnhancedFileUpload'
// EnhancedMobileNavigation removed - use AuthenticatedNavigation instead
export { 
  EnhancedToast, 
  formatErrorMessage, 
  FormError, 
  FormSuccess, 
  EnhancedErrorBoundary 
} from './components/ui/EnhancedErrorHandling'
export {
  EnhancedInput,
  EnhancedTextarea,
  PasswordInput,
  EnhancedSelect,
  FormField,
  FormSection,
  useRealTimeValidation
} from './components/ui/EnhancedFormComponents'
export {
  DraftWarningBanner,
  AutoSaveIndicator,
  SessionTimeoutWarning,
  FormRecoveryBanner
} from './components/ui/DraftComponents'

// Admin Components
export { EnhancedApplicationsTable } from './components/admin/EnhancedApplicationsTable'
export { BulkOperations, QuickFilters } from './components/admin/BulkOperations'

// Hooks
export {
  useNetworkStatus,
  useNetworkRetry,
  useNetworkQualityMonitor,
  useAdaptiveNetworkBehavior
} from './hooks/useNetworkStatus'
export {
  useAutoSave,
  useDraftManager,
  useSessionTimeout
} from './hooks/useAutoSave'

// Utilities
export {
  compressImage,
  validateFile,
  formatFileSize,
  generateUniqueFilename,
  createImagePreview,
  extractTextFromImage,
  getFileCategory,
  validateFileForSecurity,
  fileToBase64,
  processFilesInBatch
} from './utils/file-helpers'

export {
  apiCache,
  fetchWithCache,
  getWithCache,
  postWithoutCache,
  putWithoutCache,
  deleteWithoutCache,
  batchRequests,
  invalidateCache,
  prefetchData,
  getNetworkAwareCacheTTL,
  PersistentCache,
  persistentCache
} from './utils/api-cache'

export {
  OCRService,
  DocumentParser,
  AutoFillService,
  GradeCalculator,
  autoFillService
} from './utils/smart-features'

export {
  DuplicateDetectionService,
  duplicateDetectionService
} from './utils/duplicate-detection'

export {
  SmartMatchingService,
  smartMatchingService
} from './utils/smart-matching'

// database-optimization utilities removed — Supabase-dependent stubs deleted

// Types
export type {
  AutoSaveData,
  AutoSaveOptions
} from './hooks/useAutoSave'

export type {
  FileValidationResult
} from './utils/file-helpers'

export type {
  FetchWithCacheOptions
} from './utils/api-cache'

export type {
  ExtractedData
} from './utils/smart-features'

export type {
  ApplicationData,
  DuplicateMatch,
  DuplicateCheckResult
} from './utils/duplicate-detection'

export type {
  StudentProfile,
  ProgramMatch
} from './utils/smart-matching'

export type {
  Application
} from './components/admin/EnhancedApplicationsTable'