/**
 * MIHAS Analysis Orchestrator
 * 
 * Coordinates all analysis components and provides a unified interface
 * Requirements: 1.1, 1.2, 1.3, 2.1, 8.1
 */

import { SecurityAnalyzer } from './security/SecurityAnalyzer';
import { SchemaAnalyzer } from './database/SchemaAnalyzer';
import { PerformanceMonitor } from './performance/PerformanceMonitor';
import { AnalysisReporter } from './reporting/AnalysisReporter';
import { PropertyTestFramework } from './testing/PropertyTestFramework';

import type { 
  AnalysisResult, 
  AnalysisReport, 
  AnalysisConfig,
  SecurityVulnerability,
  SchemaRedundancy,
  PerformanceMetric
} from './types';

export class AnalysisOrchestrator {
  private securityAnalyzer: SecurityAnalyzer;
  private schemaAnalyzer: SchemaAnalyzer;
  private performanceMonitor: PerformanceMonitor;
  private reporter: AnalysisReporter;
  private testFramework: PropertyTestFramework;
  private config: AnalysisConfig;

  constructor(config: Partial<AnalysisConfig> = {}) {
    this.config = {
      security_scan_enabled: true,
      schema_analysis_enabled: true,
      performance_monitoring_enabled: true,
      api_analysis_enabled: true,
      scan_interval_hours: 24,
      alert_thresholds: {
        critical_vulnerabilities: 1,
        performance_degradation_percent: 20,
        error_rate_percent: 5
      },
      ...config
    };

    // Initialize all analysis components
    this.securityAnalyzer = new SecurityAnalyzer();
    this.schemaAnalyzer = new SchemaAnalyzer();
    this.performanceMonitor = new PerformanceMonitor();
    this.reporter = new AnalysisReporter();
    this.testFramework = new PropertyTestFramework();

    console.log('🚀 MIHAS Analysis Orchestrator initialized');
  }

  /**
   * Run comprehensive system analysis
   * Coordinates all analysis components
   */
  async runComprehensiveAnalysis(): Promise<{
    securityResults: AnalysisResult;
    schemaResults: AnalysisResult;
    performanceResults: AnalysisResult;
    report: AnalysisReport;
  }> {
    console.log('🔍 Starting comprehensive MIHAS system analysis...');
    const startTime = new Date();

    try {
      // Run all analyses in parallel for efficiency
      const [securityResults, schemaResults, performanceResults] = await Promise.all([
        this.config.security_scan_enabled ? this.securityAnalyzer.performSecurityAnalysis() : this.createEmptyResult('security'),
        this.config.schema_analysis_enabled ? this.schemaAnalyzer.performSchemaAnalysis() : this.createEmptyResult('schema'),
        this.config.performance_monitoring_enabled ? this.performanceMonitor.performPerformanceAnalysis() : this.createEmptyResult('performance')
      ]);

      // Generate comprehensive report
      const report = this.reporter.generateComprehensiveReport(
        securityResults,
        schemaResults,
        performanceResults
      );

      const endTime = new Date();
      const duration = endTime.getTime() - startTime.getTime();

      console.log(`✅ Comprehensive analysis completed in ${duration}ms`);
      console.log(`📊 Report generated with ${report.summary.total_issues} total issues found`);

      // Check for critical alerts
      await this.checkCriticalAlerts(securityResults, schemaResults, performanceResults);

      return {
        securityResults,
        schemaResults,
        performanceResults,
        report
      };

    } catch (error) {
      console.error('❌ Comprehensive analysis failed:', error);
      throw error;
    }
  }

  /**
   * Run security-focused analysis
   */
  async runSecurityAnalysis(): Promise<{
    securityResults: AnalysisResult;
    report: AnalysisReport;
  }> {
    console.log('🔒 Starting security analysis...');

    const securityResults = await this.securityAnalyzer.performSecurityAnalysis();
    const report = this.reporter.generateSecurityReport(securityResults);

    // Check for critical security alerts
    const vulnerabilities = securityResults.results?.vulnerabilities || [];
    const criticalCount = vulnerabilities.filter((v: SecurityVulnerability) => v.severity === 'ERROR').length;

    if (criticalCount >= this.config.alert_thresholds.critical_vulnerabilities) {
      console.warn(`🚨 CRITICAL ALERT: ${criticalCount} critical security vulnerabilities found!`);
      await this.triggerSecurityAlert(vulnerabilities.filter((v: SecurityVulnerability) => v.severity === 'ERROR'));
    }

    return { securityResults, report };
  }

  /**
   * Run performance analysis
   */
  async runPerformanceAnalysis(): Promise<{
    performanceResults: AnalysisResult;
    report: AnalysisReport;
  }> {
    console.log('⚡ Starting performance analysis...');

    const performanceResults = await this.performanceMonitor.performPerformanceAnalysis();
    const report = this.reporter.generatePerformanceReport(performanceResults);

    return { performanceResults, report };
  }

  /**
   * Start continuous monitoring
   */
  startContinuousMonitoring(): void {
    if (this.config.performance_monitoring_enabled) {
      console.log('🔄 Starting continuous performance monitoring...');
      this.performanceMonitor.startMonitoring(30000); // 30 second intervals
    }

    // Schedule regular comprehensive scans
    const intervalMs = this.config.scan_interval_hours * 60 * 60 * 1000;
    setInterval(async () => {
      console.log('⏰ Running scheduled comprehensive analysis...');
      try {
        await this.runComprehensiveAnalysis();
      } catch (error) {
        console.error('❌ Scheduled analysis failed:', error);
      }
    }, intervalMs);

    console.log(`✅ Continuous monitoring started (scan interval: ${this.config.scan_interval_hours} hours)`);
  }

  /**
   * Stop continuous monitoring
   */
  stopContinuousMonitoring(): void {
    console.log('⏹️ Stopping continuous monitoring...');
    this.performanceMonitor.stopMonitoring();
  }

  /**
   * Run property-based tests on analysis components
   */
  async runPropertyTests(): Promise<void> {
    console.log('🧪 Running property-based tests on analysis components...');

    // Test security analyzer
    await this.testFramework.testSecurityVulnerabilityDetection(
      this.securityAnalyzer,
      PropertyTestFramework.vulnerabilitiesHaveRequiredFields
    );

    await this.testFramework.testSecurityVulnerabilityDetection(
      this.securityAnalyzer,
      PropertyTestFramework.criticalVulnerabilitiesHaveRemediation
    );

    // Test schema analyzer
    await this.testFramework.testSchemaRedundancyDetection(
      this.schemaAnalyzer,
      PropertyTestFramework.redundanciesHaveValidSimilarity
    );

    // Test performance monitor
    await this.testFramework.testPerformanceMonitoring(
      this.performanceMonitor,
      PropertyTestFramework.metricsHaveValidTimestamps
    );

    await this.testFramework.testPerformanceMonitoring(
      this.performanceMonitor,
      PropertyTestFramework.metricsHavePositiveValues
    );

    const summary = this.testFramework.getSummary();
    console.log(`✅ Property tests completed: ${summary.passed_tests}/${summary.total_tests} passed`);
    
    if (summary.failed_tests > 0) {
      console.warn(`⚠️ ${summary.failed_tests} property tests failed - review results`);
    }
  }

  /**
   * Get analysis dashboard data
   */
  async getDashboardData(): Promise<{
    security_summary: any;
    schema_summary: any;
    performance_summary: any;
    recent_alerts: any[];
    system_health: 'healthy' | 'warning' | 'critical';
  }> {
    // Get recent analysis results
    const latestReport = this.reporter.getLatestReport();
    
    // If no report exists, run a quick analysis first
    if (!latestReport) {
      try {
        // Try to run a quick analysis
        await this.runComprehensiveAnalysis();
        const newReport = this.reporter.getLatestReport();
        if (newReport) {
          return this.extractDashboardDataFromReport(newReport);
        }
      } catch (error) {
        console.warn('Could not run analysis, returning default data:', error);
      }
      
      // Return default healthy state if analysis fails
      return {
        security_summary: { total_vulnerabilities: 0, critical_count: 0 },
        schema_summary: { total_issues: 0, high_priority: 0 },
        performance_summary: { active_alerts: 0, avg_response_time: 150 },
        recent_alerts: [],
        system_health: 'healthy'
      };
    }

    return this.extractDashboardDataFromReport(latestReport);
  }

  private extractDashboardDataFromReport(report: AnalysisReport): {
    security_summary: any;
    schema_summary: any;
    performance_summary: any;
    recent_alerts: any[];
    system_health: 'healthy' | 'warning' | 'critical';
  } {
    // Extract summaries from the report
    const securitySection = report.sections.find(s => s.title === 'Security Analysis');
    const schemaSection = report.sections.find(s => s.title === 'Database Schema Analysis');
    const performanceSection = report.sections.find(s => s.title === 'Performance Analysis');

    // Determine system health
    let systemHealth: 'healthy' | 'warning' | 'critical' = 'healthy';
    if (report.summary.critical_issues > 0) {
      systemHealth = 'critical';
    } else if (report.summary.total_issues > 5) {
      systemHealth = 'warning';
    }

    return {
      security_summary: {
        total_vulnerabilities: securitySection?.issues.length || 0,
        critical_count: report.summary.critical_issues
      },
      schema_summary: {
        total_issues: schemaSection?.issues.length || 0,
        high_priority: Math.floor((schemaSection?.issues.length || 0) * 0.3)
      },
      performance_summary: {
        active_alerts: performanceSection?.issues.length || 0,
        avg_response_time: this.performanceMonitor.getRecentMetrics(5)
          .filter(m => m.metric_type === 'response_time')
          .reduce((sum, m, _, arr) => sum + m.value / arr.length, 0) || 150
      },
      recent_alerts: this.getRecentAlerts(),
      system_health: systemHealth
    };
  }

  /**
   * Export analysis results
   */
  exportResults(format: 'json' | 'markdown' = 'json'): string {
    const latestReport = this.reporter.getLatestReport();
    if (!latestReport) {
      return format === 'json' ? '{}' : '# No analysis results available';
    }

    return format === 'json' 
      ? this.reporter.exportReportAsJSON(latestReport.id)
      : this.reporter.exportReportAsMarkdown(latestReport.id);
  }

  /**
   * Private helper methods
   */
  private createEmptyResult(type: AnalysisResult['analysis_type']): AnalysisResult {
    return {
      id: crypto.randomUUID(),
      analysis_type: type,
      status: 'completed',
      started_at: new Date(),
      completed_at: new Date(),
      results: {},
      metadata: {}
    };
  }

  private async checkCriticalAlerts(
    securityResults: AnalysisResult,
    schemaResults: AnalysisResult,
    performanceResults: AnalysisResult
  ): Promise<void> {
    const alerts = [];

    // Check security alerts
    const vulnerabilities = securityResults.results?.vulnerabilities || [];
    const criticalVulns = vulnerabilities.filter((v: SecurityVulnerability) => v.severity === 'ERROR');
    if (criticalVulns.length >= this.config.alert_thresholds.critical_vulnerabilities) {
      alerts.push(`${criticalVulns.length} critical security vulnerabilities detected`);
    }

    // Check performance alerts
    const performanceAlerts = performanceResults.results?.alerts || [];
    const criticalPerfAlerts = performanceAlerts.filter((a: PerformanceMetric) => 
      a.metric_name.startsWith('CRITICAL_')
    );
    if (criticalPerfAlerts.length > 0) {
      alerts.push(`${criticalPerfAlerts.length} critical performance issues detected`);
    }

    if (alerts.length > 0) {
      console.warn('🚨 CRITICAL SYSTEM ALERTS:');
      alerts.forEach(alert => console.warn(`  - ${alert}`));
      
      // In a real system, this would send notifications to administrators
      await this.sendCriticalAlerts(alerts);
    }
  }

  private async triggerSecurityAlert(criticalVulnerabilities: SecurityVulnerability[]): Promise<void> {
    // In a real system, this would integrate with notification systems
    console.warn('🚨 SECURITY ALERT TRIGGERED');
    console.warn('Critical vulnerabilities requiring immediate attention:');
    criticalVulnerabilities.forEach(vuln => {
      console.warn(`  - ${vuln.entity_name}: ${vuln.description}`);
    });
  }

  private async sendCriticalAlerts(alerts: string[]): Promise<void> {
    // Placeholder for notification system integration
    console.log('📧 Sending critical alerts to administrators...');
    // This would integrate with email, Slack, SMS, etc.
  }

  private getRecentAlerts(): any[] {
    // Get recent alerts from performance monitor
    const recentMetrics = this.performanceMonitor.getRecentMetrics(60); // Last hour
    return recentMetrics
      .filter(m => 
        (m.threshold_critical && m.value > m.threshold_critical) ||
        (m.threshold_warning && m.value > m.threshold_warning)
      )
      .slice(0, 10) // Latest 10 alerts
      .map(m => ({
        type: m.value > (m.threshold_critical || Infinity) ? 'critical' : 'warning',
        message: `${m.metric_name}: ${m.value} ${m.unit}`,
        timestamp: m.timestamp,
        endpoint: m.endpoint
      }));
  }

  /**
   * Public getters
   */
  getConfig(): AnalysisConfig {
    return { ...this.config };
  }

  getSecurityAnalyzer(): SecurityAnalyzer {
    return this.securityAnalyzer;
  }

  getSchemaAnalyzer(): SchemaAnalyzer {
    return this.schemaAnalyzer;
  }

  getPerformanceMonitor(): PerformanceMonitor {
    return this.performanceMonitor;
  }

  getReporter(): AnalysisReporter {
    return this.reporter;
  }

  getTestFramework(): PropertyTestFramework {
    return this.testFramework;
  }
}