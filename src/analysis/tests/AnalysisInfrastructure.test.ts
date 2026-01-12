/**
 * Analysis Infrastructure Integration Tests
 * 
 * Tests the complete analysis infrastructure setup
 * Requirements: 1.1, 1.2, 1.3, 2.1, 8.1
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AnalysisOrchestrator } from '../AnalysisOrchestrator';
import { SecurityAnalyzer } from '../security/SecurityAnalyzer';
import { SchemaAnalyzer } from '../database/SchemaAnalyzer';
import { PerformanceMonitor } from '../performance/PerformanceMonitor';
import { PropertyTestFramework } from '../testing/PropertyTestFramework';

// Mock Supabase
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    rpc: vi.fn().mockResolvedValue({ data: [], error: null }),
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          neq: vi.fn(() => ({
            neq: vi.fn(() => ({ data: [], error: null }))
          }))
        })),
        ilike: vi.fn(() => ({ data: [], error: null }))
      }))
    }))
  }))
}));

describe('Analysis Infrastructure Setup', () => {
  let orchestrator: AnalysisOrchestrator;

  beforeEach(() => {
    orchestrator = new AnalysisOrchestrator({
      security_scan_enabled: true,
      schema_analysis_enabled: true,
      performance_monitoring_enabled: true,
      api_analysis_enabled: true,
      scan_interval_hours: 1,
      alert_thresholds: {
        critical_vulnerabilities: 1,
        performance_degradation_percent: 20,
        error_rate_percent: 5
      }
    });
  });

  it('should initialize analysis orchestrator with correct configuration', () => {
    const config = orchestrator.getConfig();
    
    expect(config.security_scan_enabled).toBe(true);
    expect(config.schema_analysis_enabled).toBe(true);
    expect(config.performance_monitoring_enabled).toBe(true);
    expect(config.api_analysis_enabled).toBe(true);
    expect(config.scan_interval_hours).toBe(1);
    expect(config.alert_thresholds.critical_vulnerabilities).toBe(1);
  });

  it('should have all required analysis components', () => {
    const securityAnalyzer = orchestrator.getSecurityAnalyzer();
    const schemaAnalyzer = orchestrator.getSchemaAnalyzer();
    const performanceMonitor = orchestrator.getPerformanceMonitor();
    const testFramework = orchestrator.getTestFramework();

    expect(securityAnalyzer).toBeInstanceOf(SecurityAnalyzer);
    expect(schemaAnalyzer).toBeInstanceOf(SchemaAnalyzer);
    expect(performanceMonitor).toBeInstanceOf(PerformanceMonitor);
    expect(testFramework).toBeInstanceOf(PropertyTestFramework);
  });

  it('should run security analysis successfully', async () => {
    const { securityResults, report } = await orchestrator.runSecurityAnalysis();

    expect(securityResults).toBeDefined();
    expect(securityResults.analysis_type).toBe('security');
    expect(securityResults.status).toBe('completed');
    expect(report).toBeDefined();
    expect(report.report_type).toBe('security');
  });

  it('should run performance analysis successfully', async () => {
    const { performanceResults, report } = await orchestrator.runPerformanceAnalysis();

    expect(performanceResults).toBeDefined();
    expect(performanceResults.analysis_type).toBe('performance');
    expect(performanceResults.status).toBe('completed');
    expect(report).toBeDefined();
    expect(report.report_type).toBe('performance');
  });

  it('should run comprehensive analysis successfully', async () => {
    const results = await orchestrator.runComprehensiveAnalysis();

    expect(results.securityResults).toBeDefined();
    expect(results.schemaResults).toBeDefined();
    expect(results.performanceResults).toBeDefined();
    expect(results.report).toBeDefined();
    expect(results.report.report_type).toBe('comprehensive');
  });

  it('should provide dashboard data', async () => {
    const dashboardData = await orchestrator.getDashboardData();

    expect(dashboardData).toBeDefined();
    expect(dashboardData.security_summary).toBeDefined();
    expect(dashboardData.schema_summary).toBeDefined();
    expect(dashboardData.performance_summary).toBeDefined();
    expect(dashboardData.system_health).toMatch(/healthy|warning|critical/);
  });

  it('should export results in different formats', () => {
    const jsonExport = orchestrator.exportResults('json');
    const markdownExport = orchestrator.exportResults('markdown');

    expect(typeof jsonExport).toBe('string');
    expect(typeof markdownExport).toBe('string');
    
    // JSON export should be valid JSON or empty object
    if (jsonExport !== '{}') {
      expect(() => JSON.parse(jsonExport)).not.toThrow();
    }
    
    // Markdown export should contain markdown headers or be empty
    if (markdownExport !== '# No analysis results available') {
      expect(markdownExport).toContain('#');
    }
  });

  it('should handle monitoring lifecycle', () => {
    const performanceMonitor = orchestrator.getPerformanceMonitor();
    
    // Initially not monitoring
    expect(performanceMonitor.isMonitoringActive()).toBe(false);
    
    // Start monitoring
    orchestrator.startContinuousMonitoring();
    expect(performanceMonitor.isMonitoringActive()).toBe(true);
    
    // Stop monitoring
    orchestrator.stopContinuousMonitoring();
    expect(performanceMonitor.isMonitoringActive()).toBe(false);
  });
});

describe('Individual Analysis Components', () => {
  it('should create SecurityAnalyzer instance', () => {
    const analyzer = new SecurityAnalyzer();
    expect(analyzer).toBeInstanceOf(SecurityAnalyzer);
  });

  it('should create SchemaAnalyzer instance', () => {
    const analyzer = new SchemaAnalyzer();
    expect(analyzer).toBeInstanceOf(SchemaAnalyzer);
  });

  it('should create PerformanceMonitor instance', () => {
    const monitor = new PerformanceMonitor();
    expect(monitor).toBeInstanceOf(PerformanceMonitor);
    expect(monitor.isMonitoringActive()).toBe(false);
  });

  it('should create PropertyTestFramework instance', () => {
    const framework = new PropertyTestFramework();
    expect(framework).toBeInstanceOf(PropertyTestFramework);
    
    const summary = framework.getSummary();
    expect(summary.total_tests).toBe(0);
    expect(summary.passed_tests).toBe(0);
    expect(summary.failed_tests).toBe(0);
  });
});

describe('Property Test Framework', () => {
  let framework: PropertyTestFramework;

  beforeEach(() => {
    framework = new PropertyTestFramework({ iterations: 10 }); // Reduced for faster testing
  });

  it('should generate random test data', () => {
    const vulnerabilities = framework.generateRandomSecurityVulnerabilities(5);
    const redundancies = framework.generateRandomSchemaRedundancies(3);
    const metrics = framework.generateRandomPerformanceMetrics(10);

    expect(vulnerabilities).toHaveLength(5);
    expect(redundancies).toHaveLength(3);
    expect(metrics).toHaveLength(10);

    // Validate structure
    vulnerabilities.forEach(v => {
      expect(v.id).toBeDefined();
      expect(v.type).toBeDefined();
      expect(v.severity).toBeDefined();
      expect(v.entity_name).toBeDefined();
      expect(v.description).toBeDefined();
      expect(Array.isArray(v.remediation_steps)).toBe(true);
    });
  });

  it('should validate property test patterns', () => {
    const validVulnerabilities = framework.generateRandomSecurityVulnerabilities(5);
    const validRedundancies = framework.generateRandomSchemaRedundancies(3);
    const validMetrics = framework.generateRandomPerformanceMetrics(10);

    // Test property patterns
    expect(PropertyTestFramework.vulnerabilitiesHaveRequiredFields(validVulnerabilities)).toBe(true);
    expect(PropertyTestFramework.criticalVulnerabilitiesHaveRemediation(validVulnerabilities)).toBe(true);
    expect(PropertyTestFramework.redundanciesHaveValidSimilarity(validRedundancies)).toBe(true);
    expect(PropertyTestFramework.metricsHaveValidTimestamps(validMetrics)).toBe(true);
    expect(PropertyTestFramework.metricsHavePositiveValues(validMetrics)).toBe(true);
  });
});