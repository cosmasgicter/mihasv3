/**
 * Notification Trigger Scanner
 * 
 * Scans api-src/ and src/ directories for notification dispatch calls,
 * extracting event types and delivery mechanisms.
 * 
 * Validates: Requirements 6.1, 6.2
 * 
 * @module scripts/audit/notification/triggerScanner
 */

import { readdir, readFile, stat } from 'node:fs/promises';
import { join, relative, extname } from 'node:path';
import type { NotificationTrigger, DeliveryMechanism } from '../types';

/** Directories to scan for notification triggers */
const SCAN_DIRECTORIES = ['api-src', 'src', 'lib'];

/** File extensions to scan */
const SCAN_EXTENSIONS = ['.ts', '.tsx'];

/** Directories to skip during scanning */
const SKIP_DIRECTORIES = [
  'node_modules', 
  '.git', 
  'dist', 
  'build', 
  '.test-fixtures',
  'tests',
  '__tests__',
  '__mocks__'
];

/** Files to skip (test files, type definitions) */
const SKIP_FILE_PATTERNS = [
  /\.test\.(ts|tsx)$/,
  /\.spec\.(ts|tsx)$/,
  /\.d\.ts$/,
];

/**
 * Regex patterns for detecting notification triggers
 */
const PATTERNS = {
  // Resend API calls - email delivery
  resendEmailSend: /resend\.emails\.send\s*\(/g,
  resendApiFetch: /fetch\s*\(\s*['"`]https:\/\/api\.resend\.com\/emails['"`]/g,
  
  // notificationService calls
  notificationServiceSend: /notificationService\.send\s*\(/g,
  notificationServiceDispatch: /notificationService\.(?:dispatchChannel|applicationSubmitted)\s*\(/g,
  
  // Push notification dispatch
  pushSubscriptionsDispatch: /pushSubscriptionsService\.dispatch\s*\(/g,
  webpushSend: /webpush\.sendNotification\s*\(/g,
  
  // Multi-channel notification service
  multiChannelSend: /multiChannelNotifications\.sendNotification\s*\(/g,
  sendNotificationMethod: /this\.sendNotification\s*\(/g,
  
  // Toast notifications (realtime UI)
  toastAdd: /(?:addToast|toast\.addToast|useToastStore\.getState\(\)\.addToast)\s*\(/g,
  showToast: /showToast\s*\(/g,
  
  // In-app notification inserts
  inAppNotificationInsert: /\.from\s*\(\s*['"`](?:notifications|in_app_notifications)['"`]\s*\)\s*\.insert/g,
  notificationTableInsert: /INSERT\s+INTO\s+(?:notifications|in_app_notifications)/gi,
  
  // SSE broadcast functions (realtime)
  broadcastNotification: /broadcast(?:ToUser|ToAll|Notification|ApplicationUpdate|PaymentUpdate|InterviewScheduled|DocumentProcessed)\s*\(/g,
  sendSSEEvent: /sendSSEEvent\s*\(/g,
  
  // Custom event dispatches (frontend realtime)
  customEventDispatch: /window\.dispatchEvent\s*\(\s*new\s+CustomEvent\s*\(\s*['"`]([^'"`]+)['"`]/g,
  
  // Idempotency key patterns
  idempotencyKey: /idempotency[_-]?key|dedup(?:lication)?[_-]?(?:key|id)|unique[_-]?(?:key|id)/i,
  
  // Event type extraction from notification calls
  notificationTypeParam: /type\s*:\s*['"`]([^'"`]+)['"`]/g,
  eventTypeParam: /event\s*:\s*['"`]([^'"`]+)['"`]/g,
  actionParam: /action\s*:\s*['"`]([^'"`]+)['"`]/g,
};

/**
 * Result of scanning for notification triggers
 */
export interface NotificationTriggerScanResult {
  triggers: NotificationTrigger[];
  totalTriggers: number;
  byDeliveryMechanism: {
    realtime: NotificationTrigger[];
    email: NotificationTrigger[];
    both: NotificationTrigger[];
  };
  withIdempotency: number;
  withoutIdempotency: number;
  errors: { filePath: string; error: string }[];
}

/**
 * Determine delivery mechanism based on the trigger pattern
 */
function determineDeliveryMechanism(
  content: string,
  lineContent: string,
  triggerType: string
): DeliveryMechanism {
  // Email-only patterns
  if (
    triggerType === 'resend_email' ||
    triggerType === 'resend_api_fetch'
  ) {
    return 'email';
  }
  
  // Realtime-only patterns
  if (
    triggerType === 'toast' ||
    triggerType === 'custom_event' ||
    triggerType === 'sse_broadcast' ||
    triggerType === 'sse_event'
  ) {
    return 'realtime';
  }
  
  // Multi-channel or combined patterns
  if (
    triggerType === 'multi_channel' ||
    triggerType === 'notification_service_send'
  ) {
    // Check if the surrounding context mentions both email and realtime
    const contextStart = Math.max(0, content.indexOf(lineContent) - 500);
    const contextEnd = Math.min(content.length, content.indexOf(lineContent) + lineContent.length + 500);
    const context = content.substring(contextStart, contextEnd);
    
    const hasEmailRef = /email|resend|smtp/i.test(context);
    const hasRealtimeRef = /toast|sse|broadcast|push|in_app/i.test(context);
    
    if (hasEmailRef && hasRealtimeRef) {
      return 'both';
    }
    if (hasEmailRef) {
      return 'email';
    }
    return 'realtime';
  }
  
  // Push notifications
  if (triggerType === 'push_dispatch' || triggerType === 'webpush') {
    return 'realtime';
  }
  
  // In-app notifications
  if (triggerType === 'in_app_insert' || triggerType === 'notification_insert') {
    // Check if there's also email sending nearby
    const contextStart = Math.max(0, content.indexOf(lineContent) - 1000);
    const contextEnd = Math.min(content.length, content.indexOf(lineContent) + lineContent.length + 1000);
    const context = content.substring(contextStart, contextEnd);
    
    if (/resend|email.*send|sendEmail/i.test(context)) {
      return 'both';
    }
    return 'realtime';
  }
  
  // Default to realtime for unknown patterns
  return 'realtime';
}

/**
 * Validate that an extracted event type is a valid identifier
 */
function isValidEventType(eventType: string): boolean {
  // Event types should be simple identifiers or snake_case/camelCase strings
  // They should not contain newlines, excessive length, or code-like patterns
  if (!eventType || eventType.length > 50) {
    return false;
  }
  if (/[\n\r]/.test(eventType)) {
    return false;
  }
  // Should match typical event naming patterns
  return /^[a-zA-Z][a-zA-Z0-9_:-]*$/.test(eventType);
}

/**
 * Extract event type from the trigger context
 */
function extractEventType(content: string, lineNumber: number, triggerType: string): string {
  const lines = content.split('\n');
  const startLine = Math.max(0, lineNumber - 5);
  const endLine = Math.min(lines.length, lineNumber + 10);
  const context = lines.slice(startLine, endLine).join('\n');
  
  // Try to extract type from various patterns
  const typeRegex = new RegExp(PATTERNS.notificationTypeParam.source, 'g');
  let match = typeRegex.exec(context);
  if (match && isValidEventType(match[1])) {
    return match[1];
  }
  
  const eventRegex = new RegExp(PATTERNS.eventTypeParam.source, 'g');
  match = eventRegex.exec(context);
  if (match && isValidEventType(match[1])) {
    return match[1];
  }
  
  const actionRegex = new RegExp(PATTERNS.actionParam.source, 'g');
  match = actionRegex.exec(context);
  if (match && isValidEventType(match[1])) {
    return match[1];
  }
  
  // For custom events, extract from the pattern
  const customEventRegex = new RegExp(PATTERNS.customEventDispatch.source, 'g');
  match = customEventRegex.exec(context);
  if (match && isValidEventType(match[1])) {
    return match[1];
  }
  
  // Infer from trigger type
  const typeMap: Record<string, string> = {
    'resend_email': 'email_notification',
    'resend_api_fetch': 'email_notification',
    'notification_service_send': 'notification_send',
    'notification_service_dispatch': 'channel_dispatch',
    'push_dispatch': 'push_notification',
    'webpush': 'push_notification',
    'multi_channel': 'multi_channel_notification',
    'toast': 'ui_toast',
    'in_app_insert': 'in_app_notification',
    'notification_insert': 'db_notification',
    'sse_broadcast': 'sse_broadcast',
    'sse_event': 'sse_event',
    'custom_event': 'custom_event',
  };
  
  return typeMap[triggerType] || 'unknown';
}

/**
 * Check if idempotency key is present in the context
 */
function hasIdempotencyKey(content: string, lineNumber: number): boolean {
  const lines = content.split('\n');
  const startLine = Math.max(0, lineNumber - 10);
  const endLine = Math.min(lines.length, lineNumber + 10);
  const context = lines.slice(startLine, endLine).join('\n');
  
  return PATTERNS.idempotencyKey.test(context);
}

/**
 * Find line number for a character index in content
 */
function findLineNumber(content: string, charIndex: number): number {
  const lines = content.split('\n');
  let charCount = 0;
  
  for (let i = 0; i < lines.length; i++) {
    const lineEnd = charCount + lines[i].length + 1; // +1 for newline
    if (charIndex >= charCount && charIndex < lineEnd) {
      return i + 1;
    }
    charCount = lineEnd;
  }
  
  return 1;
}

/**
 * Parse a single file for notification triggers
 */
async function parseFile(
  filePath: string,
  projectRoot: string
): Promise<NotificationTrigger[]> {
  const content = await readFile(filePath, 'utf-8');
  const relativePath = relative(projectRoot, filePath);
  const triggers: NotificationTrigger[] = [];
  
  // Define pattern checks with their trigger types
  const patternChecks: Array<{ pattern: RegExp; type: string }> = [
    { pattern: PATTERNS.resendEmailSend, type: 'resend_email' },
    { pattern: PATTERNS.resendApiFetch, type: 'resend_api_fetch' },
    { pattern: PATTERNS.notificationServiceSend, type: 'notification_service_send' },
    { pattern: PATTERNS.notificationServiceDispatch, type: 'notification_service_dispatch' },
    { pattern: PATTERNS.pushSubscriptionsDispatch, type: 'push_dispatch' },
    { pattern: PATTERNS.webpushSend, type: 'webpush' },
    { pattern: PATTERNS.multiChannelSend, type: 'multi_channel' },
    { pattern: PATTERNS.sendNotificationMethod, type: 'multi_channel' },
    { pattern: PATTERNS.toastAdd, type: 'toast' },
    { pattern: PATTERNS.showToast, type: 'toast' },
    { pattern: PATTERNS.inAppNotificationInsert, type: 'in_app_insert' },
    { pattern: PATTERNS.notificationTableInsert, type: 'notification_insert' },
    { pattern: PATTERNS.broadcastNotification, type: 'sse_broadcast' },
    { pattern: PATTERNS.sendSSEEvent, type: 'sse_event' },
    { pattern: PATTERNS.customEventDispatch, type: 'custom_event' },
  ];
  
  for (const { pattern, type } of patternChecks) {
    // Create a new regex instance to avoid lastIndex issues
    const regex = new RegExp(pattern.source, pattern.flags);
    
    let match: RegExpExecArray | null;
    let iterations = 0;
    const maxIterations = 1000; // Safety limit
    
    while ((match = regex.exec(content)) !== null && iterations < maxIterations) {
      iterations++;
      const lineNumber = findLineNumber(content, match.index);
      const lines = content.split('\n');
      const lineContent = lines[lineNumber - 1] || '';
      
      const trigger: NotificationTrigger = {
        event: extractEventType(content, lineNumber, type),
        filePath: relativePath,
        lineNumber,
        deliveryMechanism: determineDeliveryMechanism(content, lineContent, type),
        hasIdempotencyKey: hasIdempotencyKey(content, lineNumber),
      };
      
      // Avoid duplicates at the same location
      const isDuplicate = triggers.some(
        t => t.filePath === trigger.filePath && t.lineNumber === trigger.lineNumber
      );
      
      if (!isDuplicate) {
        triggers.push(trigger);
      }
      
      // Prevent infinite loop for zero-width matches
      if (match.index === regex.lastIndex) {
        regex.lastIndex++;
      }
    }
  }
  
  return triggers;
}

/**
 * Check if file should be skipped
 */
function shouldSkipFile(fileName: string): boolean {
  return SKIP_FILE_PATTERNS.some(pattern => pattern.test(fileName));
}

/**
 * Recursively scan a directory for notification triggers
 */
async function scanDirectory(
  dirPath: string,
  projectRoot: string
): Promise<{ triggers: NotificationTrigger[]; errors: { filePath: string; error: string }[] }> {
  const triggers: NotificationTrigger[] = [];
  const errors: { filePath: string; error: string }[] = [];
  
  try {
    const entries = await readdir(dirPath, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = join(dirPath, entry.name);
      
      if (entry.isDirectory()) {
        // Skip excluded directories
        if (SKIP_DIRECTORIES.includes(entry.name)) {
          continue;
        }
        
        // Recursively scan subdirectories
        const subResult = await scanDirectory(fullPath, projectRoot);
        triggers.push(...subResult.triggers);
        errors.push(...subResult.errors);
      } else if (entry.isFile()) {
        // Check file extension
        const ext = extname(entry.name);
        if (!SCAN_EXTENSIONS.includes(ext)) {
          continue;
        }
        
        // Skip test files
        if (shouldSkipFile(entry.name)) {
          continue;
        }
        
        try {
          const fileTriggers = await parseFile(fullPath, projectRoot);
          triggers.push(...fileTriggers);
        } catch (error) {
          errors.push({
            filePath: relative(projectRoot, fullPath),
            error: String(error),
          });
        }
      }
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      errors.push({
        filePath: relative(projectRoot, dirPath),
        error: String(error),
      });
    }
  }
  
  return { triggers, errors };
}

/**
 * Scan all configured directories for notification triggers
 * 
 * @param projectRoot - Root directory of the project
 * @returns Scan result with all triggers found
 */
export async function scanNotificationTriggers(
  projectRoot: string = process.cwd()
): Promise<NotificationTriggerScanResult> {
  const allTriggers: NotificationTrigger[] = [];
  const allErrors: { filePath: string; error: string }[] = [];
  
  for (const directory of SCAN_DIRECTORIES) {
    const dirPath = join(projectRoot, directory);
    
    try {
      await stat(dirPath);
      const result = await scanDirectory(dirPath, projectRoot);
      allTriggers.push(...result.triggers);
      allErrors.push(...result.errors);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        allErrors.push({
          filePath: directory,
          error: String(error),
        });
      }
    }
  }
  
  // Sort by file path and line number
  allTriggers.sort((a, b) => {
    const pathCompare = a.filePath.localeCompare(b.filePath);
    if (pathCompare !== 0) return pathCompare;
    return a.lineNumber - b.lineNumber;
  });
  
  // Categorize by delivery mechanism
  const byDeliveryMechanism = {
    realtime: allTriggers.filter(t => t.deliveryMechanism === 'realtime'),
    email: allTriggers.filter(t => t.deliveryMechanism === 'email'),
    both: allTriggers.filter(t => t.deliveryMechanism === 'both'),
  };
  
  return {
    triggers: allTriggers,
    totalTriggers: allTriggers.length,
    byDeliveryMechanism,
    withIdempotency: allTriggers.filter(t => t.hasIdempotencyKey).length,
    withoutIdempotency: allTriggers.filter(t => !t.hasIdempotencyKey).length,
    errors: allErrors,
  };
}

/**
 * Get summary statistics for scanned notification triggers
 */
export function getNotificationTriggerSummary(result: NotificationTriggerScanResult): {
  totalTriggers: number;
  byMechanism: { realtime: number; email: number; both: number };
  idempotencyStats: { with: number; without: number; percentage: number };
  uniqueEvents: string[];
  fileCount: number;
} {
  const uniqueEvents = [...new Set(result.triggers.map(t => t.event))].sort();
  const uniqueFiles = [...new Set(result.triggers.map(t => t.filePath))];
  
  const withIdempotency = result.withIdempotency;
  const total = result.totalTriggers;
  
  return {
    totalTriggers: result.totalTriggers,
    byMechanism: {
      realtime: result.byDeliveryMechanism.realtime.length,
      email: result.byDeliveryMechanism.email.length,
      both: result.byDeliveryMechanism.both.length,
    },
    idempotencyStats: {
      with: withIdempotency,
      without: result.withoutIdempotency,
      percentage: total > 0 ? Math.round((withIdempotency / total) * 100) : 0,
    },
    uniqueEvents,
    fileCount: uniqueFiles.length,
  };
}

/**
 * Identify triggers with duplicate send risk
 * (triggers without idempotency that could be called multiple times)
 */
export function identifyDuplicateRisks(
  triggers: NotificationTrigger[]
): NotificationTrigger[] {
  return triggers.filter(trigger => {
    // Email triggers without idempotency are high risk
    if (
      (trigger.deliveryMechanism === 'email' || trigger.deliveryMechanism === 'both') &&
      !trigger.hasIdempotencyKey
    ) {
      return true;
    }
    return false;
  });
}

/**
 * Identify triggers missing idempotency keys
 */
export function identifyMissingIdempotency(
  triggers: NotificationTrigger[]
): NotificationTrigger[] {
  return triggers.filter(trigger => !trigger.hasIdempotencyKey);
}

// CLI entry point
if (import.meta.main) {
  const projectRoot = process.cwd();
  
  console.log('🔔 Scanning for notification triggers...\n');
  
  scanNotificationTriggers(projectRoot)
    .then(result => {
      const summary = getNotificationTriggerSummary(result);
      
      console.log('📊 Summary:');
      console.log(`   Total triggers found: ${summary.totalTriggers}`);
      console.log(`   Files with triggers: ${summary.fileCount}`);
      console.log(`   Unique event types: ${summary.uniqueEvents.length}`);
      
      console.log('\n📬 By Delivery Mechanism:');
      console.log(`   Realtime only: ${summary.byMechanism.realtime}`);
      console.log(`   Email only: ${summary.byMechanism.email}`);
      console.log(`   Both: ${summary.byMechanism.both}`);
      
      console.log('\n🔐 Idempotency Status:');
      console.log(`   With idempotency: ${summary.idempotencyStats.with} (${summary.idempotencyStats.percentage}%)`);
      console.log(`   Without idempotency: ${summary.idempotencyStats.without}`);
      
      if (summary.uniqueEvents.length > 0) {
        console.log('\n📋 Event Types Found:');
        for (const event of summary.uniqueEvents) {
          console.log(`   • ${event}`);
        }
      }
      
      // Show duplicate risks
      const duplicateRisks = identifyDuplicateRisks(result.triggers);
      if (duplicateRisks.length > 0) {
        console.log('\n⚠️  Duplicate Send Risks (email without idempotency):');
        for (const trigger of duplicateRisks) {
          console.log(`   ${trigger.filePath}:${trigger.lineNumber}`);
          console.log(`      Event: ${trigger.event}`);
          console.log(`      Mechanism: ${trigger.deliveryMechanism}`);
        }
      }
      
      // Show detailed results by mechanism
      if (result.byDeliveryMechanism.email.length > 0) {
        console.log('\n📧 Email Triggers:');
        for (const trigger of result.byDeliveryMechanism.email) {
          console.log(`   ${trigger.filePath}:${trigger.lineNumber}`);
          console.log(`      Event: ${trigger.event}`);
          console.log(`      Idempotency: ${trigger.hasIdempotencyKey ? '✓' : '✗'}`);
        }
      }
      
      if (result.byDeliveryMechanism.realtime.length > 0) {
        console.log('\n⚡ Realtime Triggers:');
        for (const trigger of result.byDeliveryMechanism.realtime.slice(0, 10)) {
          console.log(`   ${trigger.filePath}:${trigger.lineNumber}`);
          console.log(`      Event: ${trigger.event}`);
        }
        if (result.byDeliveryMechanism.realtime.length > 10) {
          console.log(`   ... and ${result.byDeliveryMechanism.realtime.length - 10} more`);
        }
      }
      
      if (result.byDeliveryMechanism.both.length > 0) {
        console.log('\n📬 Multi-Channel Triggers (Email + Realtime):');
        for (const trigger of result.byDeliveryMechanism.both) {
          console.log(`   ${trigger.filePath}:${trigger.lineNumber}`);
          console.log(`      Event: ${trigger.event}`);
          console.log(`      Idempotency: ${trigger.hasIdempotencyKey ? '✓' : '✗'}`);
        }
      }
      
      if (result.errors.length > 0) {
        console.log('\n❌ Errors:');
        for (const error of result.errors) {
          console.log(`   ${error.filePath}: ${error.error}`);
        }
      }
      
      console.log('\n✅ Scan complete!');
    })
    .catch(error => {
      console.error('Error scanning for notification triggers:', error);
      process.exit(1);
    });
}
