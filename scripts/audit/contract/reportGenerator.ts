/**
 * Contract Mismatch Report Generator
 * 
 * Generates a comprehensive Markdown report of all contract mismatches
 * between frontend API calls and backend endpoints.
 * 
 * Validates: Requirements 1.8
 * 
 * @module scripts/audit/contract/reportGenerator
 */

import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { existsSync } from 'node:fs';
import type { 
  ContractMismatch, 
  ContractMismatchType, 
  APICallInfo, 
  EndpointInfo 
} from '../types';
import { scanFrontendAPICalls, getAPIScanSummary } from './frontendScanner';
import { scanBackendEndpoints, getBackendScanSummary } from './backendScanner';
import { compareContracts, groupMismatchesByType, getComparisonSummary } from './comparator';
import { findSchemaMismatches, toContractMismatches } from './schemaComparator';

/**
 * Default output path for the contract mismatch report
 */
const DEFAULT_OUTPUT_PATH = 'forensic_reports/contract-mismatch-report.md';

/**
 * Report metadata
 */
interface ReportMetadata {
  timestamp: string;
  version: string;
  projectRoot: string;
}

/**
 * Generates the current timestamp in ISO format
 */
function getTimestamp(): string {
  return new Date().toISOString();
}

/**
 * Gets severity level for a mismatch type
 */
function getMismatchSeverity(type: ContractMismatchType): 'critical' | 'high' | 'medium' | 'low' {
  switch (type) {
    case 'MISSING_ENDPOINT':
      return 'critical';
    case 'AUTH_MISMATCH':
      return 'high';
    case 'METHOD_MISMATCH':
      return 'high';
    case 'SCHEMA_MISMATCH':
      return 'medium';
    case 'UNUSED_ENDPOINT':
      return 'low';
    default:
      return 'medium';
  }
}

/**
 * Gets emoji for severity level
 */
function getSeverityEmoji(severity: 'critical' | 'high' | 'medium' | 'low'): string {
  switch (severity) {
    case 'critical':
      return '🔴';
    case 'high':
      return '🟠';
    case 'medium':
      return '🟡';
    case 'low':
      return '🟢';
    default:
      return '⚪';
  }
}

/**
 * Gets description for a mismatch type
 */
function getMismatchDescription(type: ContractMismatchType): string {
  switch (type) {
    case 'MISSING_ENDPOINT':
      return 'Frontend calls an endpoint that does not exist in the backend';
    case 'UNUSED_ENDPOINT':
      return 'Backend endpoint is defined but never called by frontend';
    case 'METHOD_MISMATCH':
      return 'Frontend uses an HTTP method not supported by the backend';
    case 'SCHEMA_MISMATCH':
      return 'Request or response schema differs between frontend and backend';
    case 'AUTH_MISMATCH':
      return 'Authentication requirements differ between frontend and backend';
    default:
      return 'Unknown mismatch type';
  }
}

/**
 * Gets recommendation for fixing a mismatch type
 */
function getMismatchRecommendation(type: ContractMismatchType): string {
  switch (type) {
    case 'MISSING_ENDPOINT':
      return 'Either implement the missing backend endpoint or remove the frontend call';
    case 'UNUSED_ENDPOINT':
      return 'Either add frontend calls to use this endpoint or remove it from the backend';
    case 'METHOD_MISMATCH':
      return 'Update either frontend or backend to use consistent HTTP methods';
    case 'SCHEMA_MISMATCH':
      return 'Align request/response schemas between frontend and backend';
    case 'AUTH_MISMATCH':
      return 'Ensure frontend sends appropriate authentication for protected endpoints';
    default:
      return 'Review and fix the mismatch';
  }
}

/**
 * Formats a frontend API call for the report
 */
function formatAPICall(call: APICallInfo): string {
  const lines: string[] = [];
  lines.push(`- **File**: \`${call.filePath}\``);
  lines.push(`- **Line**: ${call.lineNumber}`);
  lines.push(`- **Endpoint**: \`${call.endpoint}\``);
  lines.push(`- **Method**: \`${call.method}\``);
  lines.push(`- **Auth**: ${call.authMechanism}`);
  if (call.queryParams && Object.keys(call.queryParams).length > 0) {
    lines.push(`- **Query Params**: ${JSON.stringify(call.queryParams)}`);
  }
  return lines.join('\n');
}

/**
 * Formats a backend endpoint for the report
 */
function formatEndpoint(endpoint: EndpointInfo): string {
  const lines: string[] = [];
  lines.push(`- **File**: \`${endpoint.filePath}\``);
  lines.push(`- **Endpoint**: \`${endpoint.endpoint}\``);
  lines.push(`- **Methods**: \`${endpoint.method}\``);
  lines.push(`- **Actions**: ${endpoint.actions.length > 0 ? endpoint.actions.join(', ') : '(none)'}`);
  lines.push(`- **Auth Required**: ${endpoint.requiresAuth ? 'Yes' : 'No'}`);
  if (endpoint.roles && endpoint.roles.length > 0) {
    lines.push(`- **Roles**: ${endpoint.roles.join(', ')}`);
  }
  return lines.join('\n');
}

/**
 * Generates the executive summary section
 */
function generateExecutiveSummary(
  frontendCalls: APICallInfo[],
  backendEndpoints: EndpointInfo[],
  mismatches: ContractMismatch[],
  grouped: Record<ContractMismatchType, ContractMismatch[]>
): string {
  const criticalCount = grouped.MISSING_ENDPOINT.length;
  const highCount = grouped.AUTH_MISMATCH.length + grouped.METHOD_MISMATCH.length;
  const mediumCount = grouped.SCHEMA_MISMATCH.length;
  const lowCount = grouped.UNUSED_ENDPOINT.length;
  
  const healthStatus = criticalCount > 0 
    ? '🔴 **CRITICAL** - Immediate action required'
    : highCount > 0 
      ? '🟠 **WARNING** - Issues need attention'
      : mediumCount > 0
        ? '🟡 **CAUTION** - Minor issues detected'
        : '🟢 **HEALTHY** - No significant issues';

  return `## Executive Summary

**Report Generated**: ${getTimestamp()}

### Contract Health Status

${healthStatus}

### Overview

| Metric | Count |
|--------|-------|
| Frontend API Calls | ${frontendCalls.length} |
| Backend Endpoints | ${backendEndpoints.length} |
| Total Mismatches | ${mismatches.length} |

### Mismatches by Severity

| Severity | Type | Count |
|----------|------|-------|
| ${getSeverityEmoji('critical')} Critical | MISSING_ENDPOINT | ${grouped.MISSING_ENDPOINT.length} |
| ${getSeverityEmoji('high')} High | AUTH_MISMATCH | ${grouped.AUTH_MISMATCH.length} |
| ${getSeverityEmoji('high')} High | METHOD_MISMATCH | ${grouped.METHOD_MISMATCH.length} |
| ${getSeverityEmoji('medium')} Medium | SCHEMA_MISMATCH | ${grouped.SCHEMA_MISMATCH.length} |
| ${getSeverityEmoji('low')} Low | UNUSED_ENDPOINT | ${grouped.UNUSED_ENDPOINT.length} |

### Quick Stats

- **Matched Endpoints**: ${backendEndpoints.length - grouped.UNUSED_ENDPOINT.length} / ${backendEndpoints.length}
- **Unmatched Frontend Calls**: ${grouped.MISSING_ENDPOINT.length}
- **Auth Issues**: ${grouped.AUTH_MISMATCH.length}
`;
}

/**
 * Generates a section for a specific mismatch type
 */
function generateMismatchSection(
  type: ContractMismatchType,
  mismatches: ContractMismatch[]
): string {
  if (mismatches.length === 0) {
    return '';
  }

  const severity = getMismatchSeverity(type);
  const emoji = getSeverityEmoji(severity);
  const description = getMismatchDescription(type);
  const recommendation = getMismatchRecommendation(type);

  const lines: string[] = [];
  lines.push(`### ${emoji} ${type} (${mismatches.length})`);
  lines.push('');
  lines.push(`**Description**: ${description}`);
  lines.push('');
  lines.push(`**Recommendation**: ${recommendation}`);
  lines.push('');
  lines.push('---');
  lines.push('');

  for (let i = 0; i < mismatches.length; i++) {
    const mismatch = mismatches[i];
    lines.push(`#### ${i + 1}. ${type}`);
    lines.push('');
    lines.push(`**Evidence**: ${mismatch.evidence}`);
    lines.push('');

    if (mismatch.frontendCall) {
      lines.push('**Frontend Call**:');
      lines.push(formatAPICall(mismatch.frontendCall));
      lines.push('');
    }

    if (mismatch.backendEndpoint) {
      lines.push('**Backend Endpoint**:');
      lines.push(formatEndpoint(mismatch.backendEndpoint));
      lines.push('');
    }

    lines.push('---');
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Generates the recommendations section
 */
function generateRecommendations(
  grouped: Record<ContractMismatchType, ContractMismatch[]>
): string {
  const lines: string[] = [];
  lines.push('## Recommendations');
  lines.push('');
  lines.push('### Priority Actions');
  lines.push('');

  let priority = 1;

  // Critical: Missing endpoints
  if (grouped.MISSING_ENDPOINT.length > 0) {
    lines.push(`**${priority}. Fix Missing Endpoints (Critical)**`);
    lines.push('');
    lines.push('The following frontend calls have no matching backend endpoint:');
    lines.push('');
    for (const m of grouped.MISSING_ENDPOINT) {
      if (m.frontendCall) {
        lines.push(`- \`${m.frontendCall.method} ${m.frontendCall.endpoint}\` at \`${m.frontendCall.filePath}:${m.frontendCall.lineNumber}\``);
      }
    }
    lines.push('');
    priority++;
  }

  // High: Auth mismatches
  if (grouped.AUTH_MISMATCH.length > 0) {
    lines.push(`**${priority}. Fix Authentication Mismatches (High)**`);
    lines.push('');
    lines.push('The following calls have authentication configuration issues:');
    lines.push('');
    for (const m of grouped.AUTH_MISMATCH) {
      if (m.frontendCall) {
        lines.push(`- \`${m.frontendCall.endpoint}\` at \`${m.frontendCall.filePath}:${m.frontendCall.lineNumber}\``);
      }
    }
    lines.push('');
    priority++;
  }

  // High: Method mismatches
  if (grouped.METHOD_MISMATCH.length > 0) {
    lines.push(`**${priority}. Fix HTTP Method Mismatches (High)**`);
    lines.push('');
    lines.push('The following calls use incorrect HTTP methods:');
    lines.push('');
    for (const m of grouped.METHOD_MISMATCH) {
      if (m.frontendCall && m.backendEndpoint) {
        lines.push(`- \`${m.frontendCall.endpoint}\`: Frontend uses \`${m.frontendCall.method}\`, backend supports \`${m.backendEndpoint.method}\``);
      }
    }
    lines.push('');
    priority++;
  }

  // Medium: Schema mismatches
  if (grouped.SCHEMA_MISMATCH.length > 0) {
    lines.push(`**${priority}. Review Schema Mismatches (Medium)**`);
    lines.push('');
    lines.push('The following endpoints have schema differences that may cause runtime errors:');
    lines.push('');
    for (const m of grouped.SCHEMA_MISMATCH) {
      lines.push(`- ${m.evidence}`);
    }
    lines.push('');
    priority++;
  }

  // Low: Unused endpoints
  if (grouped.UNUSED_ENDPOINT.length > 0) {
    lines.push(`**${priority}. Review Unused Endpoints (Low)**`);
    lines.push('');
    lines.push('The following backend endpoints are never called by frontend code:');
    lines.push('');
    for (const m of grouped.UNUSED_ENDPOINT) {
      if (m.backendEndpoint) {
        lines.push(`- \`${m.backendEndpoint.endpoint}\` in \`${m.backendEndpoint.filePath}\``);
      }
    }
    lines.push('');
    lines.push('Consider removing these if they are truly unused, or document why they exist.');
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Generates the full contract mismatch report
 */
function generateReport(
  frontendCalls: APICallInfo[],
  backendEndpoints: EndpointInfo[],
  mismatches: ContractMismatch[],
  metadata: ReportMetadata
): string {
  const grouped = groupMismatchesByType(mismatches);
  
  const sections: string[] = [];

  // Header
  sections.push('# Contract Mismatch Report');
  sections.push('');
  sections.push('> Forensic audit of frontend-backend API contract alignment');
  sections.push('');
  sections.push(`**Generated**: ${metadata.timestamp}`);
  sections.push(`**Project Root**: ${metadata.projectRoot}`);
  sections.push(`**Audit Version**: ${metadata.version}`);
  sections.push('');

  // Executive Summary
  sections.push(generateExecutiveSummary(frontendCalls, backendEndpoints, mismatches, grouped));

  // Table of Contents
  sections.push('## Table of Contents');
  sections.push('');
  sections.push('1. [Executive Summary](#executive-summary)');
  sections.push('2. [Mismatches by Type](#mismatches-by-type)');
  if (grouped.MISSING_ENDPOINT.length > 0) {
    sections.push('   - [MISSING_ENDPOINT](#-missing_endpoint-' + grouped.MISSING_ENDPOINT.length + ')');
  }
  if (grouped.AUTH_MISMATCH.length > 0) {
    sections.push('   - [AUTH_MISMATCH](#-auth_mismatch-' + grouped.AUTH_MISMATCH.length + ')');
  }
  if (grouped.METHOD_MISMATCH.length > 0) {
    sections.push('   - [METHOD_MISMATCH](#-method_mismatch-' + grouped.METHOD_MISMATCH.length + ')');
  }
  if (grouped.SCHEMA_MISMATCH.length > 0) {
    sections.push('   - [SCHEMA_MISMATCH](#-schema_mismatch-' + grouped.SCHEMA_MISMATCH.length + ')');
  }
  if (grouped.UNUSED_ENDPOINT.length > 0) {
    sections.push('   - [UNUSED_ENDPOINT](#-unused_endpoint-' + grouped.UNUSED_ENDPOINT.length + ')');
  }
  sections.push('3. [Recommendations](#recommendations)');
  sections.push('4. [Appendix: All Frontend Calls](#appendix-all-frontend-calls)');
  sections.push('5. [Appendix: All Backend Endpoints](#appendix-all-backend-endpoints)');
  sections.push('');

  // Mismatches by Type
  sections.push('## Mismatches by Type');
  sections.push('');

  if (mismatches.length === 0) {
    sections.push('✅ **No contract mismatches detected!**');
    sections.push('');
    sections.push('All frontend API calls have matching backend endpoints with correct methods and authentication.');
    sections.push('');
  } else {
    // Generate sections in order of severity
    sections.push(generateMismatchSection('MISSING_ENDPOINT', grouped.MISSING_ENDPOINT));
    sections.push(generateMismatchSection('AUTH_MISMATCH', grouped.AUTH_MISMATCH));
    sections.push(generateMismatchSection('METHOD_MISMATCH', grouped.METHOD_MISMATCH));
    sections.push(generateMismatchSection('SCHEMA_MISMATCH', grouped.SCHEMA_MISMATCH));
    sections.push(generateMismatchSection('UNUSED_ENDPOINT', grouped.UNUSED_ENDPOINT));
  }

  // Recommendations
  sections.push(generateRecommendations(grouped));

  // Appendix: All Frontend Calls
  sections.push('## Appendix: All Frontend Calls');
  sections.push('');
  sections.push(`Total: ${frontendCalls.length} API calls`);
  sections.push('');
  sections.push('| File | Line | Method | Endpoint | Auth |');
  sections.push('|------|------|--------|----------|------|');
  for (const call of frontendCalls) {
    sections.push(`| \`${call.filePath}\` | ${call.lineNumber} | ${call.method} | \`${call.endpoint}\` | ${call.authMechanism} |`);
  }
  sections.push('');

  // Appendix: All Backend Endpoints
  sections.push('## Appendix: All Backend Endpoints');
  sections.push('');
  sections.push(`Total: ${backendEndpoints.length} endpoints`);
  sections.push('');
  sections.push('| File | Endpoint | Methods | Actions | Auth |');
  sections.push('|------|----------|---------|---------|------|');
  for (const endpoint of backendEndpoints) {
    const actionsStr = endpoint.actions.length > 0 ? endpoint.actions.slice(0, 5).join(', ') + (endpoint.actions.length > 5 ? '...' : '') : '-';
    const authStr = endpoint.requiresAuth ? (endpoint.roles ? `Yes (${endpoint.roles.join(', ')})` : 'Yes') : 'No';
    sections.push(`| \`${endpoint.filePath}\` | \`${endpoint.endpoint}\` | ${endpoint.method} | ${actionsStr} | ${authStr} |`);
  }
  sections.push('');

  // Footer
  sections.push('---');
  sections.push('');
  sections.push('*This report was generated by the MIHAS Frontend-Backend Forensic Audit System.*');
  sections.push('');
  sections.push('**Validates**: Requirement 1.8 - CONTRACT_MISMATCH_REPORT generation');

  return sections.join('\n');
}

/**
 * Runs the contract audit and generates the report
 * 
 * @param projectRoot - Root directory of the project
 * @param outputPath - Path to write the report (relative to project root)
 * @returns The generated report content
 */
export async function generateContractMismatchReport(
  projectRoot: string = process.cwd(),
  outputPath: string = DEFAULT_OUTPUT_PATH
): Promise<string> {
  console.log('🔍 Running contract audit...\n');

  // Scan frontend and backend
  const [frontendCalls, backendEndpoints] = await Promise.all([
    scanFrontendAPICalls(projectRoot),
    scanBackendEndpoints(projectRoot),
  ]);

  console.log(`   Found ${frontendCalls.length} frontend API calls`);
  console.log(`   Found ${backendEndpoints.length} backend endpoints`);

  // Compare contracts
  const mismatches = compareContracts(frontendCalls, backendEndpoints);
  console.log(`   Detected ${mismatches.length} mismatches`);

  // Generate report
  const metadata: ReportMetadata = {
    timestamp: getTimestamp(),
    version: '1.0.0',
    projectRoot,
  };

  const report = generateReport(frontendCalls, backendEndpoints, mismatches, metadata);

  // Ensure output directory exists
  const fullOutputPath = join(projectRoot, outputPath);
  const outputDir = dirname(fullOutputPath);
  
  if (!existsSync(outputDir)) {
    await mkdir(outputDir, { recursive: true });
  }

  // Write report
  await writeFile(fullOutputPath, report, 'utf-8');
  console.log(`\n✅ Report written to: ${outputPath}`);

  return report;
}

/**
 * Gets a summary of the contract audit without generating a full report
 */
export async function getContractAuditSummary(projectRoot: string = process.cwd()): Promise<{
  frontendCalls: number;
  backendEndpoints: number;
  totalMismatches: number;
  mismatchesByType: Record<ContractMismatchType, number>;
  healthStatus: 'healthy' | 'warning' | 'critical';
}> {
  const [frontendCalls, backendEndpoints] = await Promise.all([
    scanFrontendAPICalls(projectRoot),
    scanBackendEndpoints(projectRoot),
  ]);

  const mismatches = compareContracts(frontendCalls, backendEndpoints);
  const grouped = groupMismatchesByType(mismatches);

  const criticalCount = grouped.MISSING_ENDPOINT.length;
  const highCount = grouped.AUTH_MISMATCH.length + grouped.METHOD_MISMATCH.length;

  let healthStatus: 'healthy' | 'warning' | 'critical' = 'healthy';
  if (criticalCount > 0) {
    healthStatus = 'critical';
  } else if (highCount > 0) {
    healthStatus = 'warning';
  }

  return {
    frontendCalls: frontendCalls.length,
    backendEndpoints: backendEndpoints.length,
    totalMismatches: mismatches.length,
    mismatchesByType: {
      MISSING_ENDPOINT: grouped.MISSING_ENDPOINT.length,
      UNUSED_ENDPOINT: grouped.UNUSED_ENDPOINT.length,
      METHOD_MISMATCH: grouped.METHOD_MISMATCH.length,
      SCHEMA_MISMATCH: grouped.SCHEMA_MISMATCH.length,
      AUTH_MISMATCH: grouped.AUTH_MISMATCH.length,
    },
    healthStatus,
  };
}

// CLI entry point
if (import.meta.main) {
  const args = process.argv.slice(2);
  const outputPath = args[0] || DEFAULT_OUTPUT_PATH;
  const projectRoot = process.cwd();

  console.log('📋 Contract Mismatch Report Generator');
  console.log('=====================================\n');

  generateContractMismatchReport(projectRoot, outputPath)
    .then(report => {
      // Print summary to console
      const lines = report.split('\n');
      const summaryStart = lines.findIndex(l => l.includes('## Executive Summary'));
      const summaryEnd = lines.findIndex((l, i) => i > summaryStart && l.startsWith('## ') && !l.includes('Executive Summary'));
      
      if (summaryStart !== -1) {
        const summaryLines = lines.slice(summaryStart, summaryEnd !== -1 ? summaryEnd : summaryStart + 30);
        console.log('\n' + summaryLines.join('\n'));
      }
    })
    .catch(error => {
      console.error('❌ Error generating report:', error);
      process.exit(1);
    });
}
