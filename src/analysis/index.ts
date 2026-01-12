/**
 * MIHAS System Analysis Infrastructure
 * 
 * This module provides comprehensive analysis capabilities for the MIHAS system,
 * including security vulnerability detection, database schema optimization,
 * and performance monitoring.
 * 
 * Requirements: 1.1, 1.2, 1.3, 2.1, 8.1
 */

export { AnalysisOrchestrator } from './AnalysisOrchestrator';
export { SecurityAnalyzer } from './security/SecurityAnalyzer';
export { SchemaAnalyzer } from './database/SchemaAnalyzer';
export { PerformanceMonitor } from './performance/PerformanceMonitor';
export { AnalysisReporter } from './reporting/AnalysisReporter';
export { PropertyTestFramework } from './testing/PropertyTestFramework';

export type {
  SecurityVulnerability,
  AnalysisResult,
  RemediationStep,
  PerformanceMetric,
  SchemaRedundancy,
  DatabaseIntegrityIssue,
  APIEndpointInfo,
  AnalysisConfig,
  AnalysisReport,
  AnalysisReportSection,
  ChartData
} from './types';