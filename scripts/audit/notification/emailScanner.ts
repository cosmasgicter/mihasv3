/**
 * Email Dispatch Scanner
 * 
 * Scans the codebase for Resend API calls and email dispatch points,
 * checking for retry and deduplication logic.
 * 
 * Validates: Requirements 6.4
 * 
 * @module scripts/audit/notification/emailScanner
 */

import { readdir, readFile, stat } from 'node:fs/promises';
import { join, relative, extname } from 'node:path';
import type { EmailDispatchPoint } from '../types';

/** Directories to scan for email dispatch points */
const SCAN_DIRECTORIES = ['api-src', 'src', 'lib', 'scripts', 'supabase/functions'];

/** File extensions to scan */
const SCAN_EXTENSIONS = ['.ts', '.tsx', '.js'];

/** Directories to skip during scanning */
const SKIP_DIRECTORIES = [
  'node_modules',
  '.git',
  'dist',
  'build',
  '.test-fixtures',
  'tests',
  '__tests__',
  '__mocks__',
];

/** Files to skip (test files, type definitions, audit scripts) */
const SKIP_FILE_PATTERNS = [
  /\.test\.(ts|tsx|js)$/,
  /\.spec\.(ts|tsx|js)$/,
  /\.d\.ts$/,
  /emailScanner\.ts$/,  // Skip self
  /triggerScanner\.ts$/,  // Skip related audit scripts
];

/**
 * Regex patterns for detecting email dispatch points
 */
const PATTERNS = {
  // Resend SDK usage: resend.emails.send(...)
  resendSdkSend: /resend\.emails\.send\s*\(/g,
  
  // Direct Resend API fetch calls
  resendApiFetch: /fetch\s*\(\s*['"`]https:\/\/api\.resend\.com\/emails['"`]/g,
  
  // Alternative Resend API patterns (variable-based URLs)
  resendApiVariable: /fetch\s*\(\s*(?:resendUrl|emailApiUrl|RESEND_API_URL)/g,
  
  // Generic email send functions that might wrap Resend
  sendEmailFunction: /(?:sendEmail|sendMail|dispatchEmail|emailSend)\s*\(/g,
  
  // Email service method calls
  emailServiceSend: /emailService\.(?:send|dispatch|deliver)\s*\(/g,
  
  // Retry logic patterns
  retryPatterns: [
    /retry/i,
    /retries/i,
    /maxRetries/i,
    /retryCount/i,
    /retryDelay/i,
    /retryAttempt/i,
    /attempt\s*[<>=]+\s*\d/i,
    /for\s*\(\s*let\s+(?:i|attempt|retry)\s*=/i,
    /while\s*\(\s*(?:attempt|retry|tries)/i,
  ],
  
  // Deduplication/idempotency patterns
  deduplicationPatterns: [
    /idempotency[_-]?key/i,
    /idempotent/i,
    /dedup(?:lication)?[_-]?(?:key|id)/i,
    /unique[_-]?(?:key|id|token)/i,
    /message[_-]?id/i,
    /email[_-]?id/i,
    /already[_-]?sent/i,
    /sent[_-]?emails/i,
    /email[_-]?cache/i,
    /prevent[_-]?duplicate/i,
  ],
  
  // Template extraction patterns
  templatePatterns: [
    /template\s*[=:]\s*['"`]([^'"`]+)['"`]/i,
    /subject\s*[=:]\s*['"`]([^'"`]+)['"`]/i,
    /emailTemplate\s*[=:]\s*['"`]([^'"`]+)['"`]/i,
    /type\s*[=:]\s*['"`]([^'"`]+)['"`]/i,
  ],
};

/**
 * Result of scanning for email dispatch points
 */
export interface EmailDispatchScanResult {
  dispatchPoints: EmailDispatchPoint[];
  totalDispatchPoints: number;
  withRetry: number;
  withoutRetry: number;
  withDeduplication: number;
  withoutDeduplication: number;
  byTemplate: Map<string, EmailDispatchPoint[]>;
  errors: { filePath: string; error: string }[];
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
 * Check if retry logic exists in the surrounding context
 */
function hasRetryLogic(content: string, lineNumber: number): boolean {
  const lines = content.split('\n');
  // Check a wider context for retry logic (function scope)
  const startLine = Math.max(0, lineNumber - 30);
  const endLine = Math.min(lines.length, lineNumber + 30);
  const context = lines.slice(startLine, endLine).join('\n');

  return PATTERNS.retryPatterns.some(pattern => pattern.test(context));
}

/**
 * Check if deduplication logic exists in the surrounding context
 */
function hasDeduplicationLogic(content: string, lineNumber: number): boolean {
  const lines = content.split('\n');
  // Check a wider context for deduplication logic
  const startLine = Math.max(0, lineNumber - 30);
  const endLine = Math.min(lines.length, lineNumber + 30);
  const context = lines.slice(startLine, endLine).join('\n');

  return PATTERNS.deduplicationPatterns.some(pattern => pattern.test(context));
}

/**
 * Extract template name from the surrounding context
 */
function extractTemplateName(content: string, lineNumber: number): string {
  const lines = content.split('\n');
  const startLine = Math.max(0, lineNumber - 15);
  const endLine = Math.min(lines.length, lineNumber + 15);
  const context = lines.slice(startLine, endLine).join('\n');

  // Try to extract subject first (most reliable indicator)
  const subjectMatch = /subject\s*[=:]\s*['"`]([^'"`$]+)['"`]/i.exec(context);
  if (subjectMatch && subjectMatch[1]) {
    const subject = subjectMatch[1].trim();
    if (subject.length > 2 && subject.length < 100 && !/[\n\r]/.test(subject)) {
      return subject;
    }
  }

  // Try to extract from variable subject (e.g., subject: title)
  const varSubjectMatch = /subject\s*[=:]\s*(\w+)/i.exec(context);
  if (varSubjectMatch && varSubjectMatch[1]) {
    const varName = varSubjectMatch[1].trim();
    // Skip common non-descriptive variable names
    if (varName.length > 2 && !['to', 'cc', 'bcc', 'from'].includes(varName.toLowerCase())) {
      return `[dynamic: ${varName}]`;
    }
  }

  // Try template/type patterns
  const templateMatch = /(?:template|emailTemplate|type)\s*[=:]\s*['"`]([^'"`]+)['"`]/i.exec(context);
  if (templateMatch && templateMatch[1]) {
    const template = templateMatch[1].trim();
    if (template.length > 2 && template.length < 100 && !/[\n\r]/.test(template)) {
      return template;
    }
  }

  // Try to infer from function name or variable
  const functionMatch = /(?:send|dispatch|deliver)(\w+)(?:Email|Mail|Notification)/i.exec(context);
  if (functionMatch && functionMatch[1]) {
    return functionMatch[1].toLowerCase();
  }

  // Try to extract from HTML content hints (h2 headers often contain email title)
  const htmlHintMatch = /<h2[^>]*>([^<$]+)<\/h2>/i.exec(context);
  if (htmlHintMatch && htmlHintMatch[1]) {
    const hint = htmlHintMatch[1].trim();
    // Skip template literals and short strings
    if (hint.length > 3 && hint.length < 50 && !hint.includes('${')) {
      return hint;
    }
  }

  // Try to find email type from function context
  const emailTypeMatch = /(?:notification|email|mail)(?:Type|Kind|Category)\s*[=:]\s*['"`]([^'"`]+)['"`]/i.exec(context);
  if (emailTypeMatch && emailTypeMatch[1]) {
    return emailTypeMatch[1].trim();
  }

  return 'unknown';
}

/**
 * Determine the dispatch type based on the pattern matched
 */
function getDispatchType(patternType: string): string {
  switch (patternType) {
    case 'resend_sdk':
      return 'Resend SDK';
    case 'resend_api':
      return 'Resend API (fetch)';
    case 'resend_api_var':
      return 'Resend API (variable)';
    case 'send_email_fn':
      return 'sendEmail function';
    case 'email_service':
      return 'Email service';
    default:
      return 'Unknown';
  }
}

/**
 * Parse a single file for email dispatch points
 */
async function parseFile(
  filePath: string,
  projectRoot: string
): Promise<EmailDispatchPoint[]> {
  const content = await readFile(filePath, 'utf-8');
  const relativePath = relative(projectRoot, filePath);
  const dispatchPoints: EmailDispatchPoint[] = [];

  // Define pattern checks with their types
  const patternChecks: Array<{ pattern: RegExp; type: string }> = [
    { pattern: PATTERNS.resendSdkSend, type: 'resend_sdk' },
    { pattern: PATTERNS.resendApiFetch, type: 'resend_api' },
    { pattern: PATTERNS.resendApiVariable, type: 'resend_api_var' },
    { pattern: PATTERNS.sendEmailFunction, type: 'send_email_fn' },
    { pattern: PATTERNS.emailServiceSend, type: 'email_service' },
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

      const dispatchPoint: EmailDispatchPoint = {
        filePath: relativePath,
        lineNumber,
        template: extractTemplateName(content, lineNumber),
        hasRetry: hasRetryLogic(content, lineNumber),
        hasDeduplication: hasDeduplicationLogic(content, lineNumber),
      };

      // Avoid duplicates at the same location
      const isDuplicate = dispatchPoints.some(
        dp => dp.filePath === dispatchPoint.filePath && dp.lineNumber === dispatchPoint.lineNumber
      );

      if (!isDuplicate) {
        dispatchPoints.push(dispatchPoint);
      }

      // Prevent infinite loop for zero-width matches
      if (match.index === regex.lastIndex) {
        regex.lastIndex++;
      }
    }
  }

  return dispatchPoints;
}

/**
 * Check if file should be skipped
 */
function shouldSkipFile(fileName: string): boolean {
  return SKIP_FILE_PATTERNS.some(pattern => pattern.test(fileName));
}

/**
 * Recursively scan a directory for email dispatch points
 */
async function scanDirectory(
  dirPath: string,
  projectRoot: string
): Promise<{ dispatchPoints: EmailDispatchPoint[]; errors: { filePath: string; error: string }[] }> {
  const dispatchPoints: EmailDispatchPoint[] = [];
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
        dispatchPoints.push(...subResult.dispatchPoints);
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
          const fileDispatchPoints = await parseFile(fullPath, projectRoot);
          dispatchPoints.push(...fileDispatchPoints);
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

  return { dispatchPoints, errors };
}

/**
 * Scan all configured directories for email dispatch points
 *
 * @param projectRoot - Root directory of the project
 * @returns Scan result with all dispatch points found
 */
export async function scanEmailDispatches(
  projectRoot: string = process.cwd()
): Promise<EmailDispatchScanResult> {
  const allDispatchPoints: EmailDispatchPoint[] = [];
  const allErrors: { filePath: string; error: string }[] = [];

  for (const directory of SCAN_DIRECTORIES) {
    const dirPath = join(projectRoot, directory);

    try {
      await stat(dirPath);
      const result = await scanDirectory(dirPath, projectRoot);
      allDispatchPoints.push(...result.dispatchPoints);
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
  allDispatchPoints.sort((a, b) => {
    const pathCompare = a.filePath.localeCompare(b.filePath);
    if (pathCompare !== 0) return pathCompare;
    return a.lineNumber - b.lineNumber;
  });

  // Group by template
  const byTemplate = new Map<string, EmailDispatchPoint[]>();
  for (const dp of allDispatchPoints) {
    const existing = byTemplate.get(dp.template) || [];
    existing.push(dp);
    byTemplate.set(dp.template, existing);
  }

  return {
    dispatchPoints: allDispatchPoints,
    totalDispatchPoints: allDispatchPoints.length,
    withRetry: allDispatchPoints.filter(dp => dp.hasRetry).length,
    withoutRetry: allDispatchPoints.filter(dp => !dp.hasRetry).length,
    withDeduplication: allDispatchPoints.filter(dp => dp.hasDeduplication).length,
    withoutDeduplication: allDispatchPoints.filter(dp => !dp.hasDeduplication).length,
    byTemplate,
    errors: allErrors,
  };
}

/**
 * Get summary statistics for scanned email dispatch points
 */
export function getEmailDispatchSummary(result: EmailDispatchScanResult): {
  totalDispatchPoints: number;
  retryStats: { with: number; without: number; percentage: number };
  deduplicationStats: { with: number; without: number; percentage: number };
  uniqueTemplates: string[];
  fileCount: number;
  riskLevel: 'low' | 'medium' | 'high';
} {
  const uniqueTemplates = [...result.byTemplate.keys()].sort();
  const uniqueFiles = [...new Set(result.dispatchPoints.map(dp => dp.filePath))];

  const total = result.totalDispatchPoints;
  const withRetry = result.withRetry;
  const withDedup = result.withDeduplication;

  // Calculate risk level based on missing retry and deduplication
  const missingBoth = result.dispatchPoints.filter(
    dp => !dp.hasRetry && !dp.hasDeduplication
  ).length;
  
  let riskLevel: 'low' | 'medium' | 'high';
  if (total === 0) {
    riskLevel = 'low';
  } else if (missingBoth === 0) {
    riskLevel = 'low';
  } else if (missingBoth / total < 0.5) {
    riskLevel = 'medium';
  } else {
    riskLevel = 'high';
  }

  return {
    totalDispatchPoints: total,
    retryStats: {
      with: withRetry,
      without: result.withoutRetry,
      percentage: total > 0 ? Math.round((withRetry / total) * 100) : 0,
    },
    deduplicationStats: {
      with: withDedup,
      without: result.withoutDeduplication,
      percentage: total > 0 ? Math.round((withDedup / total) * 100) : 0,
    },
    uniqueTemplates,
    fileCount: uniqueFiles.length,
    riskLevel,
  };
}

/**
 * Identify dispatch points missing retry logic
 */
export function identifyMissingRetry(
  dispatchPoints: EmailDispatchPoint[]
): EmailDispatchPoint[] {
  return dispatchPoints.filter(dp => !dp.hasRetry);
}

/**
 * Identify dispatch points missing deduplication logic
 */
export function identifyMissingDeduplication(
  dispatchPoints: EmailDispatchPoint[]
): EmailDispatchPoint[] {
  return dispatchPoints.filter(dp => !dp.hasDeduplication);
}

/**
 * Identify high-risk dispatch points (missing both retry and deduplication)
 */
export function identifyHighRiskDispatches(
  dispatchPoints: EmailDispatchPoint[]
): EmailDispatchPoint[] {
  return dispatchPoints.filter(dp => !dp.hasRetry && !dp.hasDeduplication);
}

// CLI entry point
if (import.meta.main) {
  const projectRoot = process.cwd();

  console.log('📧 Scanning for email dispatch points...\n');

  scanEmailDispatches(projectRoot)
    .then(result => {
      const summary = getEmailDispatchSummary(result);

      console.log('📊 Summary:');
      console.log(`   Total dispatch points found: ${summary.totalDispatchPoints}`);
      console.log(`   Files with email dispatches: ${summary.fileCount}`);
      console.log(`   Unique templates: ${summary.uniqueTemplates.length}`);
      console.log(`   Risk level: ${summary.riskLevel.toUpperCase()}`);

      console.log('\n🔄 Retry Logic Status:');
      console.log(`   With retry: ${summary.retryStats.with} (${summary.retryStats.percentage}%)`);
      console.log(`   Without retry: ${summary.retryStats.without}`);

      console.log('\n🔐 Deduplication Status:');
      console.log(`   With deduplication: ${summary.deduplicationStats.with} (${summary.deduplicationStats.percentage}%)`);
      console.log(`   Without deduplication: ${summary.deduplicationStats.without}`);

      if (summary.uniqueTemplates.length > 0) {
        console.log('\n📋 Templates Found:');
        for (const template of summary.uniqueTemplates) {
          const count = result.byTemplate.get(template)?.length || 0;
          console.log(`   • ${template} (${count} dispatch${count !== 1 ? 'es' : ''})`);
        }
      }

      // Show high-risk dispatches
      const highRisk = identifyHighRiskDispatches(result.dispatchPoints);
      if (highRisk.length > 0) {
        console.log('\n⚠️  High-Risk Dispatches (missing retry AND deduplication):');
        for (const dp of highRisk) {
          console.log(`   ${dp.filePath}:${dp.lineNumber}`);
          console.log(`      Template: ${dp.template}`);
        }
      }

      // Show all dispatch points
      if (result.dispatchPoints.length > 0) {
        console.log('\n📧 All Email Dispatch Points:');
        for (const dp of result.dispatchPoints) {
          console.log(`   ${dp.filePath}:${dp.lineNumber}`);
          console.log(`      Template: ${dp.template}`);
          console.log(`      Retry: ${dp.hasRetry ? '✓' : '✗'}`);
          console.log(`      Deduplication: ${dp.hasDeduplication ? '✓' : '✗'}`);
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
      console.error('Error scanning for email dispatch points:', error);
      process.exit(1);
    });
}
