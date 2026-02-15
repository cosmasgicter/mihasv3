/**
 * Shared TypeScript types for the MIHAS Frontend-Backend Forensic Audit System
 * 
 * These types are used across all audit scripts to ensure consistent
 * data structures for findings, evidence, and reports.
 */

// =============================================================================
// Evidence Types
// =============================================================================

/**
 * Evidence format for all audit findings.
 * All flagged items must include evidence in this format.
 */
export interface Evidence {
  /** Relative path to the file from project root */
  filePath: string;
  /** Specific line numbers where the issue was found */
  lineNumbers?: number[];
  /** Relevant code snippet (max 10 lines) */
  codeSnippet?: string;
  /** Explanation of why this is flagged */
  reason: string;
  /** Confidence level of the finding */
  confidence: 'certain' | 'likely' | 'possible';
}

// =============================================================================
// Page Scanner Types
// =============================================================================

/**
 * Information about a page component discovered during scanning.
 * Validates: Requirements 2.1
 */
export interface PageInfo {
  /** Relative path to the page file from project root */
  filePath: string;
  /** Name of the React component */
  componentName: string;
  /** Whether this is a default export */
  isDefaultExport: boolean;
  /** Named exports found in the file (if any) */
  namedExports: string[];
}

/**
 * Result of scanning the pages directory.
 */
export interface PageScanResult {
  /** All page components found */
  pages: PageInfo[];
  /** Total number of pages scanned */
  totalPages: number;
  /** Any errors encountered during scanning */
  errors: { filePath: string; error: string }[];
}

// =============================================================================
// Contract Auditor Types
// =============================================================================

/** HTTP methods supported by the API */
export type HTTPMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';

/** Authentication mechanisms used in API calls */
export type AuthMechanism = 'cookie' | 'bearer' | 'none';

/**
 * Information about a frontend API call extracted from source code.
 * Validates: Requirements 1.1
 */
export interface APICallInfo {
  /** Path to the file containing the API call */
  filePath: string;
  /** Line number where the call is made */
  lineNumber: number;
  /** The API endpoint being called (e.g., '/api/auth') */
  endpoint: string;
  /** HTTP method used */
  method: HTTPMethod;
  /** Headers included in the request */
  headers: Record<string, string>;
  /** Authentication mechanism used */
  authMechanism: AuthMechanism;
  /** Request payload schema (if determinable) */
  requestSchema?: object;
  /** Expected response schema (if determinable) */
  responseSchema?: object;
  /** Query parameters or action parameter */
  queryParams?: Record<string, string>;
}

/**
 * Information about a backend endpoint definition.
 * Validates: Requirements 1.2
 */
export interface EndpointInfo {
  /** Path to the file containing the endpoint */
  filePath: string;
  /** The endpoint path (e.g., '/api/auth') */
  endpoint: string;
  /** HTTP method(s) supported */
  method: string;
  /** Query param actions supported (from switch statements) */
  actions: string[];
  /** Whether authentication is required */
  requiresAuth: boolean;
  /** Roles required to access (if any) */
  roles?: string[];
  /** Action-level auth metadata when endpoint dispatches by action/type */
  actionAuth?: Record<string, {
    requiresAuth: boolean;
    roles?: string[];
    authOptional?: boolean;
  }>;
}

/** Types of contract mismatches that can be detected */
export type ContractMismatchType =
  | 'MISSING_ENDPOINT'
  | 'UNUSED_ENDPOINT'
  | 'METHOD_MISMATCH'
  | 'SCHEMA_MISMATCH'
  | 'AUTH_MISMATCH';

/**
 * A mismatch between frontend expectations and backend implementation.
 * Validates: Requirements 1.5, 1.6, 1.7
 */
export interface ContractMismatch {
  /** Type of mismatch detected */
  type: ContractMismatchType;
  /** The frontend API call (if applicable) */
  frontendCall?: APICallInfo;
  /** The backend endpoint (if applicable) */
  backendEndpoint?: EndpointInfo;
  /** Evidence explaining the mismatch */
  evidence: string;
}

// =============================================================================
// Page Auditor Types
// =============================================================================

/**
 * A step in the data loading path for a page.
 * Validates: Requirements 2.1
 */
export interface DataLoadStep {
  /** The hook or function used to load data */
  hook: string;
  /** The API endpoint called */
  endpoint: string;
  /** Dependencies that trigger refetch */
  dependencies: string[];
  /** Caching strategy used (e.g., 'staleWhileRevalidate') */
  cacheStrategy: string;
}

/** Page auth mechanism types for page authentication */
export type PageAuthMechanism = 'useAuth' | 'requireAuth' | 'ProtectedRoute' | 'none';

/** Result of checking auth implementation on a page */
export interface AuthCheckResult {
  /** Whether auth check is present */
  hasAuthCheck: boolean;
  /** Type of auth mechanism used */
  authMechanism: PageAuthMechanism;
  /** Whether role check is present (for admin pages) */
  hasRoleCheck: boolean;
  /** Roles checked for */
  roles: string[];
  /** Issues found during auth verification */
  issues: string[];
}

/** Result of checking error handling on a page */
export interface ErrorHandlingResult {
  /** Whether error handling exists */
  hasErrorHandling: boolean;
  /** Types of error handling found */
  errorHandlingTypes: ('try-catch' | 'catch-method' | 'onError' | 'error-boundary')[];
  /** API calls without error handling */
  unhandledCalls: string[];
}

/** Risk of race condition in concurrent data fetches */
export interface RaceConditionRisk {
  /** Description of the potential race condition */
  description: string;
  /** Hooks involved */
  hooks: string[];
  /** Severity of the risk */
  severity: 'high' | 'medium' | 'low';
  /** Evidence supporting the finding */
  evidence: Evidence;
}

/** Item flagged as duplicate logic */
export interface DuplicateItem {
  /** Description of the duplicate */
  description: string;
  /** Locations where duplicates exist */
  locations: { filePath: string; lineNumber: number }[];
  /** Evidence supporting the finding */
  evidence: Evidence;
}

/** Item flagged as over-fetching data */
export interface OverFetchItem {
  /** The hook or call that over-fetches */
  hook: string;
  /** Fields fetched but not used */
  unusedFields: string[];
  /** Evidence supporting the finding */
  evidence: Evidence;
}

/**
 * Complete audit result for a single page.
 * Validates: Requirements 2.1-2.12
 */
export interface PageAuditResult {
  /** Path to the page file */
  pagePath: string;
  /** Name of the page component */
  componentName: string;
  /** Data loading path traced */
  dataLoadPath: DataLoadStep[];
  /** Auth check verification result */
  authCheck: AuthCheckResult;
  /** Error handling verification result */
  errorHandling: ErrorHandlingResult;
  /** Whether empty states are handled */
  emptyStates: boolean;
  /** Whether loading states are handled */
  loadingStates: boolean;
  /** Potential race conditions detected */
  raceConditions: RaceConditionRisk[];
  /** Whether page is mobile responsive */
  mobileResponsive: boolean;
  /** Whether network recovery is handled */
  networkRecovery: boolean;
  /** Dead code found on the page */
  deadCode: DeadCodeItem[];
  /** Duplicate logic found */
  duplicateLogic: DuplicateItem[];
  /** Unused hooks found */
  unusedHooks: string[];
  /** Over-fetching detected */
  overFetching: OverFetchItem[];
}

// =============================================================================
// Loader Auditor Types
// =============================================================================

/** Types of loader components */
export type LoaderType = 'spinner' | 'skeleton' | 'progress' | 'overlay' | 'inline';

/**
 * A loader/spinner/skeleton instance found in the codebase.
 * Validates: Requirements 3.1
 */
export interface LoaderInstance {
  /** Path to the file containing the loader */
  filePath: string;
  /** Line number where the loader is defined/used */
  lineNumber: number;
  /** Name of the loader component */
  componentName: string;
  /** Type of loader */
  type: LoaderType;
  /** Whether this is a global loader */
  isGlobal: boolean;
}

// =============================================================================
// Auth Auditor Types
// =============================================================================

/**
 * A step in an authentication workflow.
 * Validates: Requirements 4.1, 4.2
 */
export interface AuthFlowStep {
  /** Action being performed */
  action: string;
  /** Component handling this step */
  component: string;
  /** Path to the component file */
  filePath: string;
  /** Next step in the workflow */
  nextStep?: string;
  /** Roles required for this step */
  roleRequired?: string[];
  /** Where to redirect on failure */
  redirectOnFail?: string;
}

/** Types of security issues that can be detected */
export type SecurityIssueType =
  | 'CROSS_ROLE_LEAKAGE'
  | 'MISSING_AUTH_CHECK'
  | 'STALE_TOKEN'
  | 'PERMISSION_BYPASS';

/** Severity levels for security issues */
export type SecuritySeverity = 'critical' | 'high' | 'medium' | 'low';

/**
 * A security issue found during auth audit.
 * Validates: Requirements 4.7
 */
export interface SecurityIssue {
  /** Type of security issue */
  type: SecurityIssueType;
  /** Path to the file with the issue */
  filePath: string;
  /** Line number of the issue */
  lineNumber: number;
  /** Evidence explaining the issue */
  evidence: string;
  /** Severity of the issue */
  severity: SecuritySeverity;
}

/** A broken workflow transition */
export interface BrokenTransition {
  /** From step */
  fromStep: string;
  /** To step (expected) */
  toStep: string;
  /** Reason it's broken */
  reason: string;
  /** Evidence supporting the finding */
  evidence: Evidence;
}

/**
 * Complete auth audit result.
 * Validates: Requirements 4.1-4.10
 */
export interface AuthAuditResult {
  /** Student workflow steps */
  studentWorkflow: AuthFlowStep[];
  /** Admin workflow steps */
  adminWorkflow: AuthFlowStep[];
  /** State management analysis */
  stateManagement: {
    /** Zustand stores used for auth */
    stores: string[];
    /** React contexts used for auth */
    contexts: string[];
    /** Whether auth state is fragmented */
    isFragmented: boolean;
  };
  /** Security issues found */
  securityIssues: SecurityIssue[];
  /** Broken workflow transitions */
  brokenTransitions: BrokenTransition[];
  /** Stale session risks identified */
  staleSessionRisks: string[];
}

// =============================================================================
// SSE Auditor Types
// =============================================================================

/**
 * An SSE endpoint defined in the backend.
 * Validates: Requirements 5.1
 */
export interface SSEEndpoint {
  /** Path to the SSE endpoint */
  path: string;
  /** File where the endpoint is defined */
  filePath: string;
  /** Event types emitted */
  events: string[];
  /** Whether authentication is required */
  requiresAuth: boolean;
}

/**
 * An SSE listener in the frontend.
 * Validates: Requirements 5.2
 */
export interface SSEListener {
  /** File containing the listener */
  filePath: string;
  /** Line number of the listener */
  lineNumber: number;
  /** Endpoint being listened to */
  endpoint: string;
  /** Events being listened for */
  events: string[];
  /** Whether reconnection logic exists */
  hasReconnect: boolean;
  /** Whether exponential backoff is implemented */
  hasBackoff: boolean;
}

/**
 * Complete SSE audit result.
 * Validates: Requirements 5.1-5.10
 */
export interface SSEAuditResult {
  /** Backend SSE endpoints found */
  backendEndpoints: SSEEndpoint[];
  /** Frontend SSE listeners found */
  frontendListeners: SSEListener[];
  /** Listeners missing reconnection logic */
  missingReconnect: SSEListener[];
  /** Listeners missing backoff logic */
  missingBackoff: SSEListener[];
  /** Features that should use SSE but don't */
  unwiredFeatures: string[];
}

// =============================================================================
// Notification Auditor Types
// =============================================================================

/** Delivery mechanisms for notifications */
export type DeliveryMechanism = 'realtime' | 'email' | 'both';

/**
 * A notification trigger point in the codebase.
 * Validates: Requirements 6.1, 6.2
 */
export interface NotificationTrigger {
  /** Event that triggers the notification */
  event: string;
  /** File containing the trigger */
  filePath: string;
  /** Line number of the trigger */
  lineNumber: number;
  /** How the notification is delivered */
  deliveryMechanism: DeliveryMechanism;
  /** Whether an idempotency key is used */
  hasIdempotencyKey: boolean;
}

/**
 * An email dispatch point in the codebase.
 * Validates: Requirements 6.4
 */
export interface EmailDispatchPoint {
  /** File containing the dispatch */
  filePath: string;
  /** Line number of the dispatch */
  lineNumber: number;
  /** Email template used */
  template: string;
  /** Whether retry logic exists */
  hasRetry: boolean;
  /** Whether deduplication is implemented */
  hasDeduplication: boolean;
}

/**
 * Complete notification audit result.
 * Validates: Requirements 6.1-6.8
 */
export interface NotificationAuditResult {
  /** All notification triggers found */
  triggers: NotificationTrigger[];
  /** Triggers with duplicate send risk */
  duplicateRisks: NotificationTrigger[];
  /** Triggers missing idempotency */
  missingIdempotency: NotificationTrigger[];
  /** Email dispatch points found */
  emailDispatchPoints: EmailDispatchPoint[];
}

// =============================================================================
// Performance Auditor Types
// =============================================================================

/** Types of performance issues */
export type PerformanceIssueType =
  | 'HEAVY_ANIMATION'
  | 'LARGE_BUNDLE'
  | 'MEMORY_LEAK'
  | 'EXCESSIVE_RERENDER'
  | 'UNOPTIMIZED_IMAGE'
  | 'BLOCKING_SCRIPT';

/** Impact levels for performance issues */
export type PerformanceImpact = 'high' | 'medium' | 'low';

/**
 * A performance issue found during audit.
 * Validates: Requirements 7.2, 7.5
 */
export interface PerformanceIssue {
  /** Type of performance issue */
  type: PerformanceIssueType;
  /** File containing the issue */
  filePath: string;
  /** Line number (if applicable) */
  lineNumber?: number;
  /** Evidence explaining the issue */
  evidence: string;
  /** Impact on performance */
  impact: PerformanceImpact;
  /** Recommendation for fixing */
  recommendation: string;
}

/** Animation library types */
export type AnimationLibrary = 'framer-motion' | 'css' | 'custom';

/**
 * Animation usage found in the codebase.
 * Validates: Requirements 7.2
 */
export interface AnimationUsage {
  /** File containing the animation */
  filePath: string;
  /** Library used for animation */
  library: AnimationLibrary;
  /** Whether the animation is heavy/expensive */
  isHeavy: boolean;
  /** Recommendation for optimization */
  recommendation: string;
}

/**
 * Complete performance audit result.
 * Validates: Requirements 7.1-7.7, 8.1-8.4
 */
export interface PerformanceAuditResult {
  /** Performance issues found */
  issues: PerformanceIssue[];
  /** Bundle size analysis */
  bundleAnalysis: {
    /** Total bundle size in bytes */
    totalSize: number;
    /** Largest chunks */
    largestChunks: { name: string; size: number }[];
  };
  /** Animation usage found */
  animationUsage: AnimationUsage[];
  /** Mobile optimization recommendations */
  mobileOptimizations: string[];
}

// =============================================================================
// Dead Code Auditor Types
// =============================================================================

/** Types of dead code */
export type DeadCodeType =
  | 'COMPONENT'
  | 'HOOK'
  | 'SERVICE'
  | 'UTIL'
  | 'LEGACY_INTEGRATION'
  | 'COMMENTED_CODE'
  | 'FEATURE_FLAG';

/**
 * A dead code item found during audit.
 * Validates: Requirements 9.1-9.5
 */
export interface DeadCodeItem {
  /** Type of dead code */
  type: DeadCodeType;
  /** File containing the dead code */
  filePath: string;
  /** Name of the dead code item */
  name: string;
  /** Evidence explaining why it's dead */
  evidence: string;
  /** Whether it's safe to remove */
  safeToRemove: boolean;
  /** Other files that might break if removed */
  dependencies?: string[];
}

/**
 * Complete dead code audit result.
 * Validates: Requirements 9.1-9.6
 */
export interface DeadCodeAuditResult {
  /** Unused components found */
  unusedComponents: DeadCodeItem[];
  /** Unused hooks found */
  unusedHooks: DeadCodeItem[];
  /** Unused services found */
  unusedServices: DeadCodeItem[];
  /** Legacy integration references found */
  legacyIntegrations: DeadCodeItem[];
  /** Commented code blocks found */
  commentedCode: DeadCodeItem[];
  /** Dead feature flags found */
  deadFeatureFlags: DeadCodeItem[];
  /** Total lines that can be removed */
  totalLinesRemovable: number;
}

// =============================================================================
// Master Report Types
// =============================================================================

/**
 * Master forensic audit report combining all sub-reports.
 */
export interface ForensicAuditReport {
  /** When the audit was run */
  timestamp: string;
  /** Version of the audit system */
  version: string;
  /** Summary statistics */
  summary: {
    /** Total issues found */
    totalIssues: number;
    /** Critical issues requiring immediate attention */
    criticalIssues: number;
    /** Number of files analyzed */
    filesAnalyzed: number;
    /** Lines of code analyzed */
    linesOfCodeAnalyzed: number;
  };
  /** Contract audit results */
  contractAudit: {
    /** Number of frontend API calls found */
    frontendCalls: number;
    /** Number of backend endpoints found */
    backendEndpoints: number;
    /** Mismatches detected */
    mismatches: ContractMismatch[];
  };
  /** Page audit results */
  pageAudit: {
    /** Number of pages analyzed */
    pagesAnalyzed: number;
    /** Number of pages with issues */
    pagesWithIssues: number;
    /** Individual page results */
    results: PageAuditResult[];
  };
  /** Loader audit results */
  loaderAudit: {
    /** Total loaders found */
    totalLoaders: number;
    /** Redundant loaders found */
    redundantLoaders: number;
    /** All loader instances */
    loaders: LoaderInstance[];
  };
  /** Auth audit results */
  authAudit: AuthAuditResult;
  /** SSE audit results */
  sseAudit: SSEAuditResult;
  /** Notification audit results */
  notificationAudit: NotificationAuditResult;
  /** Performance audit results */
  performanceAudit: PerformanceAuditResult;
  /** Dead code audit results */
  deadCodeAudit: DeadCodeAuditResult;
}

// =============================================================================
// Utility Types
// =============================================================================

/** Status for items that couldn't be fully analyzed */
export type AuditStatus = 'COMPLETE' | 'PARTIAL' | 'INSUFFICIENT_EVIDENCE' | 'UNPARSEABLE';

/** Result wrapper for audit operations */
export interface AuditResult<T> {
  /** Status of the audit operation */
  status: AuditStatus;
  /** The audit data (if successful) */
  data?: T;
  /** Error message (if failed) */
  error?: string;
  /** Warnings encountered during audit */
  warnings: string[];
}
