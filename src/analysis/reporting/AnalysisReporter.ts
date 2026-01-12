/**
 * MIHAS Analysis Reporter
 * 
 * Generates comprehensive reports from analysis results
 * Requirements: 5.1, 5.2, 8.1, 8.2
 */

import type { 
  AnalysisResult,
  AnalysisReport,
  AnalysisReportSection,
  SecurityVulnerability,
  PerformanceMetric,
  SchemaRedundancy,
  ChartData
} from '../types';

export class AnalysisReporter {
  private reports: AnalysisReport[] = [];

  /**
   * Generate comprehensive analysis report
   * Property 18: Real-time Dashboard Generation
   */
  generateComprehensiveReport(
    securityResults: AnalysisResult,
    schemaResults: AnalysisResult,
    performanceResults: AnalysisResult
  ): AnalysisReport {
    const reportId = crypto.randomUUID();
    const generatedAt = new Date();

    console.log('📊 Generating comprehensive analysis report...');

    const sections: AnalysisReportSection[] = [
      this.generateExecutiveSummary(securityResults, schemaResults, performanceResults),
      this.generateSecuritySection(securityResults),
      this.generateSchemaSection(schemaResults),
      this.generatePerformanceSection(performanceResults),
      this.generateRecommendationsSection(securityResults, schemaResults, performanceResults)
    ];

    const totalIssues = this.calculateTotalIssues(securityResults, schemaResults, performanceResults);
    const criticalIssues = this.calculateCriticalIssues(securityResults, schemaResults, performanceResults);

    const report: AnalysisReport = {
      id: reportId,
      report_type: 'comprehensive',
      generated_at: generatedAt,
      summary: {
        total_issues: totalIssues,
        critical_issues: criticalIssues,
        resolved_issues: 0, // Would be tracked over time
        pending_issues: totalIssues
      },
      sections,
      recommendations: this.generateTopRecommendations(securityResults, schemaResults, performanceResults),
      next_scan_scheduled: new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours from now
    };

    this.reports.push(report);
    console.log(`✅ Comprehensive report generated with ${sections.length} sections and ${totalIssues} total issues.`);
    
    return report;
  }

  /**
   * Generate security-focused report
   */
  generateSecurityReport(securityResults: AnalysisResult): AnalysisReport {
    const reportId = crypto.randomUUID();
    const generatedAt = new Date();

    console.log('🔒 Generating security analysis report...');

    const sections: AnalysisReportSection[] = [
      this.generateSecuritySection(securityResults),
      this.generateSecurityRemediationSection(securityResults)
    ];

    const vulnerabilities = securityResults.results?.vulnerabilities || [];
    const criticalCount = vulnerabilities.filter((v: SecurityVulnerability) => v.severity === 'ERROR').length;

    const report: AnalysisReport = {
      id: reportId,
      report_type: 'security',
      generated_at: generatedAt,
      summary: {
        total_issues: vulnerabilities.length,
        critical_issues: criticalCount,
        resolved_issues: 0,
        pending_issues: vulnerabilities.length
      },
      sections,
      recommendations: this.generateSecurityRecommendations(securityResults),
      next_scan_scheduled: new Date(Date.now() + 12 * 60 * 60 * 1000) // 12 hours for security
    };

    this.reports.push(report);
    console.log(`✅ Security report generated with ${vulnerabilities.length} vulnerabilities found.`);
    
    return report;
  }

  /**
   * Generate performance-focused report
   */
  generatePerformanceReport(performanceResults: AnalysisResult): AnalysisReport {
    const reportId = crypto.randomUUID();
    const generatedAt = new Date();

    console.log('⚡ Generating performance analysis report...');

    const sections: AnalysisReportSection[] = [
      this.generatePerformanceSection(performanceResults),
      this.generatePerformanceOptimizationSection(performanceResults)
    ];

    const metrics = performanceResults.results?.metrics || [];
    const alerts = performanceResults.results?.alerts || [];

    const report: AnalysisReport = {
      id: reportId,
      report_type: 'performance',
      generated_at: generatedAt,
      summary: {
        total_issues: alerts.length,
        critical_issues: alerts.filter((a: PerformanceMetric) => a.metric_name.startsWith('CRITICAL_')).length,
        resolved_issues: 0,
        pending_issues: alerts.length
      },
      sections,
      recommendations: this.generatePerformanceRecommendations(performanceResults),
      next_scan_scheduled: new Date(Date.now() + 6 * 60 * 60 * 1000) // 6 hours for performance
    };

    this.reports.push(report);
    console.log(`✅ Performance report generated with ${metrics.length} metrics and ${alerts.length} alerts.`);
    
    return report;
  }

  /**
   * Generate executive summary section
   */
  private generateExecutiveSummary(
    securityResults: AnalysisResult,
    schemaResults: AnalysisResult,
    performanceResults: AnalysisResult
  ): AnalysisReportSection {
    const vulnerabilities = securityResults.results?.vulnerabilities || [];
    const schemaIssues = (schemaResults.results?.redundancies || []).length + 
                        (schemaResults.results?.integrity_issues || []).length;
    const performanceAlerts = performanceResults.results?.alerts || [];

    const content = `
# Executive Summary

## System Health Overview
The MIHAS Application System analysis has been completed, revealing several areas requiring immediate attention.

### Key Findings:
- **Security**: ${vulnerabilities.length} vulnerabilities identified, ${vulnerabilities.filter((v: SecurityVulnerability) => v.severity === 'ERROR').length} critical
- **Database**: ${schemaIssues} schema optimization opportunities identified
- **Performance**: ${performanceAlerts.length} performance alerts triggered

### Priority Actions Required:
1. **Immediate**: Address critical security vulnerabilities (Security Definer Views, RLS policies)
2. **Short-term**: Optimize database schema and resolve data integrity issues
3. **Ongoing**: Implement performance monitoring and alerting system

### Business Impact:
- Security vulnerabilities pose significant data breach risks
- Schema redundancies impact system performance and maintenance costs
- Performance issues affect user experience and system scalability
    `;

    return {
      title: 'Executive Summary',
      content: content.trim(),
      issues: [],
      charts: [
        this.generateIssueDistributionChart(securityResults, schemaResults, performanceResults)
      ]
    };
  }

  /**
   * Generate security section
   */
  private generateSecuritySection(securityResults: AnalysisResult): AnalysisReportSection {
    const vulnerabilities = securityResults.results?.vulnerabilities || [];
    const summary = securityResults.results?.summary || {};

    const content = `
# Security Analysis Results

## Overview
Security analysis identified ${vulnerabilities.length} vulnerabilities across the database and application layers.

### Vulnerability Breakdown:
- **Security Definer Views**: ${summary.by_type?.security_definer_view || 0} views executing with elevated privileges
- **Mutable Search Paths**: ${summary.by_type?.mutable_search_path || 0} functions vulnerable to path manipulation
- **Permissive RLS Policies**: ${summary.by_type?.permissive_rls || 0} policies with overly broad access
- **Password Protection**: ${summary.by_type?.disabled_password_protection || 0} configuration issues

### Severity Distribution:
- **Critical (ERROR)**: ${summary.by_severity?.ERROR || 0} issues requiring immediate attention
- **Warning (WARN)**: ${summary.by_severity?.WARN || 0} issues requiring review
- **Info (INFO)**: ${summary.by_severity?.INFO || 0} informational items

## Detailed Findings:
${vulnerabilities.map((v: SecurityVulnerability, index: number) => `
### ${index + 1}. ${v.entity_name} (${v.severity})
**Type**: ${v.type}
**Description**: ${v.description}
**Remediation Steps**:
${v.remediation_steps.map(step => `- ${step}`).join('\n')}
`).join('\n')}
    `;

    return {
      title: 'Security Analysis',
      content: content.trim(),
      issues: vulnerabilities,
      charts: [
        this.generateSecurityVulnerabilityChart(vulnerabilities)
      ]
    };
  }

  /**
   * Generate schema section
   */
  private generateSchemaSection(schemaResults: AnalysisResult): AnalysisReportSection {
    const redundancies = schemaResults.results?.redundancies || [];
    const integrityIssues = schemaResults.results?.integrity_issues || [];
    const performanceIssues = schemaResults.results?.performance_issues || [];

    const content = `
# Database Schema Analysis

## Overview
Database analysis identified optimization opportunities across schema design, data integrity, and performance.

### Schema Redundancies: ${redundancies.length}
${redundancies.map((r: SchemaRedundancy, index: number) => `
#### ${index + 1}. ${r.table_name} ↔ ${r.redundant_with}
- **Type**: ${r.redundancy_type}
- **Similarity**: ${(r.similarity_score * 100).toFixed(1)}%
- **Migration Complexity**: ${r.migration_complexity}
- **Recommendation**: ${r.recommendation}
`).join('\n')}

### Data Integrity Issues: ${integrityIssues.length}
${integrityIssues.map((issue: any, index: number) => `
#### ${index + 1}. ${issue.table_name} - ${issue.issue_type}
- **Affected Rows**: ${issue.affected_rows}
- **Description**: ${issue.description}
- **Risk**: ${issue.risk_assessment}
`).join('\n')}

### Performance Optimization Opportunities: ${performanceIssues.length}
${performanceIssues.map((perf: PerformanceMetric, index: number) => `
#### ${index + 1}. ${perf.metric_name}
- **Current Value**: ${perf.value} ${perf.unit}
- **Threshold**: ${perf.threshold_warning} ${perf.unit} (warning), ${perf.threshold_critical} ${perf.unit} (critical)
${perf.query ? `- **Query**: ${perf.query}` : ''}
`).join('\n')}
    `;

    return {
      title: 'Database Schema Analysis',
      content: content.trim(),
      issues: [...redundancies, ...integrityIssues, ...performanceIssues],
      charts: [
        this.generateSchemaIssuesChart(redundancies, integrityIssues, performanceIssues)
      ]
    };
  }

  /**
   * Generate performance section
   */
  private generatePerformanceSection(performanceResults: AnalysisResult): AnalysisReportSection {
    const metrics = performanceResults.results?.metrics || [];
    const alerts = performanceResults.results?.alerts || [];
    const summary = performanceResults.results?.summary || {};

    const content = `
# Performance Analysis Results

## System Performance Overview
- **Total Metrics Collected**: ${metrics.length}
- **Active Alerts**: ${alerts.length}
- **Average Response Time**: ${summary.average_response_time?.toFixed(2) || 'N/A'} ms
- **Memory Usage**: ${summary.memory_usage?.toFixed(1) || 'N/A'}%
- **Error Count**: ${summary.error_count || 0}

## Performance Alerts
${alerts.length > 0 ? alerts.map((alert: PerformanceMetric, index: number) => `
### ${index + 1}. ${alert.metric_name}
- **Value**: ${alert.value} ${alert.unit}
- **Threshold**: ${alert.threshold_critical} ${alert.unit} (critical)
${alert.endpoint ? `- **Endpoint**: ${alert.endpoint}` : ''}
- **Timestamp**: ${alert.timestamp.toISOString()}
`).join('\n') : 'No active performance alerts.'}

## Key Performance Metrics
### Response Times
${metrics.filter(m => m.metric_type === 'response_time').slice(0, 10).map((metric: PerformanceMetric, index: number) => `
- **${metric.metric_name}**: ${metric.value.toFixed(2)} ${metric.unit}${metric.endpoint ? ` (${metric.endpoint})` : ''}
`).join('\n')}

### Resource Usage
${metrics.filter(m => m.metric_type === 'resource_usage').slice(0, 5).map((metric: PerformanceMetric, index: number) => `
- **${metric.metric_name}**: ${metric.value.toFixed(2)} ${metric.unit}
`).join('\n')}
    `;

    return {
      title: 'Performance Analysis',
      content: content.trim(),
      issues: alerts,
      charts: [
        this.generatePerformanceChart(metrics)
      ]
    };
  }

  /**
   * Generate recommendations section
   */
  private generateRecommendationsSection(
    securityResults: AnalysisResult,
    schemaResults: AnalysisResult,
    performanceResults: AnalysisResult
  ): AnalysisReportSection {
    const recommendations = this.generateTopRecommendations(securityResults, schemaResults, performanceResults);

    const content = `
# Recommendations & Next Steps

## Priority Recommendations
${recommendations.map((rec, index) => `
### ${index + 1}. ${rec}
`).join('\n')}

## Implementation Roadmap

### Phase 1: Critical Security Fixes (Week 1)
- Address all Security Definer Views
- Fix mutable search path functions
- Review and tighten RLS policies
- Enable password protection

### Phase 2: Database Optimization (Week 2-3)
- Consolidate redundant tables
- Fix data integrity issues
- Implement missing indexes
- Optimize slow queries

### Phase 3: Performance Monitoring (Week 4)
- Deploy performance monitoring system
- Set up automated alerting
- Implement performance dashboards
- Establish performance baselines

### Phase 4: Ongoing Maintenance
- Regular security scans
- Performance monitoring
- Schema optimization reviews
- Automated testing implementation
    `;

    return {
      title: 'Recommendations & Next Steps',
      content: content.trim(),
      issues: [],
      charts: []
    };
  }

  /**
   * Generate security remediation section
   */
  private generateSecurityRemediationSection(securityResults: AnalysisResult): AnalysisReportSection {
    const vulnerabilities = securityResults.results?.vulnerabilities || [];

    const content = `
# Security Remediation Guide

## Immediate Actions Required

### Critical Vulnerabilities (ERROR Level)
${vulnerabilities.filter((v: SecurityVulnerability) => v.severity === 'ERROR').map((v: SecurityVulnerability, index: number) => `
#### ${index + 1}. ${v.entity_name}
**SQL Commands**:
\`\`\`sql
${v.remediation_steps.filter(step => step.includes('ALTER') || step.includes('DROP') || step.includes('CREATE')).join(';\n')}
\`\`\`

**Verification**:
${v.remediation_steps.filter(step => step.includes('Review') || step.includes('Test') || step.includes('Ensure')).map(step => `- ${step}`).join('\n')}
`).join('\n')}

### Warning Level Issues
${vulnerabilities.filter((v: SecurityVulnerability) => v.severity === 'WARN').map((v: SecurityVulnerability, index: number) => `
#### ${index + 1}. ${v.entity_name}
${v.remediation_steps.map(step => `- ${step}`).join('\n')}
`).join('\n')}
    `;

    return {
      title: 'Security Remediation Guide',
      content: content.trim(),
      issues: vulnerabilities,
      charts: []
    };
  }

  /**
   * Generate performance optimization section
   */
  private generatePerformanceOptimizationSection(performanceResults: AnalysisResult): AnalysisReportSection {
    const alerts = performanceResults.results?.alerts || [];
    const metrics = performanceResults.results?.metrics || [];

    const content = `
# Performance Optimization Guide

## Critical Performance Issues
${alerts.filter((a: PerformanceMetric) => a.metric_name.startsWith('CRITICAL_')).map((alert: PerformanceMetric, index: number) => `
### ${index + 1}. ${alert.metric_name.replace('CRITICAL_', '')}
- **Current Value**: ${alert.value} ${alert.unit}
- **Critical Threshold**: ${alert.threshold_critical} ${alert.unit}
${alert.endpoint ? `- **Affected Endpoint**: ${alert.endpoint}` : ''}
${alert.query ? `- **Query**: ${alert.query}` : ''}

**Recommended Actions**:
${this.getPerformanceRecommendations(alert).map(rec => `- ${rec}`).join('\n')}
`).join('\n')}

## Performance Monitoring Setup
1. **Enable Real-time Monitoring**: Implement continuous performance tracking
2. **Set Up Alerts**: Configure automated alerts for performance degradation
3. **Establish Baselines**: Document current performance metrics as baselines
4. **Regular Reviews**: Schedule weekly performance reviews

## Optimization Opportunities
${this.identifyOptimizationOpportunities(metrics).map((opp, index) => `
### ${index + 1}. ${opp.title}
${opp.description}
**Expected Impact**: ${opp.impact}
`).join('\n')}
    `;

    return {
      title: 'Performance Optimization Guide',
      content: content.trim(),
      issues: alerts,
      charts: []
    };
  }

  /**
   * Helper methods for calculations and chart generation
   */
  private calculateTotalIssues(securityResults: AnalysisResult, schemaResults: AnalysisResult, performanceResults: AnalysisResult): number {
    const securityCount = securityResults.results?.vulnerabilities?.length || 0;
    const schemaCount = (schemaResults.results?.redundancies?.length || 0) + 
                       (schemaResults.results?.integrity_issues?.length || 0);
    const performanceCount = performanceResults.results?.alerts?.length || 0;
    
    return securityCount + schemaCount + performanceCount;
  }

  private calculateCriticalIssues(securityResults: AnalysisResult, schemaResults: AnalysisResult, performanceResults: AnalysisResult): number {
    const criticalSecurity = securityResults.results?.vulnerabilities?.filter((v: SecurityVulnerability) => v.severity === 'ERROR').length || 0;
    const criticalPerformance = performanceResults.results?.alerts?.filter((a: PerformanceMetric) => a.metric_name.startsWith('CRITICAL_')).length || 0;
    
    return criticalSecurity + criticalPerformance;
  }

  private generateTopRecommendations(securityResults: AnalysisResult, schemaResults: AnalysisResult, performanceResults: AnalysisResult): string[] {
    const recommendations: string[] = [];

    // Security recommendations
    const vulnerabilities = securityResults.results?.vulnerabilities || [];
    if (vulnerabilities.length > 0) {
      recommendations.push('Immediately address critical security vulnerabilities, starting with Security Definer Views');
      recommendations.push('Implement comprehensive RLS policy review and tightening');
      recommendations.push('Enable leaked password protection in Supabase Auth settings');
    }

    // Schema recommendations
    const redundancies = schemaResults.results?.redundancies || [];
    if (redundancies.length > 0) {
      recommendations.push('Consolidate applications and applications_legacy tables to reduce maintenance overhead');
      recommendations.push('Implement missing foreign key constraints to ensure data integrity');
    }

    // Performance recommendations
    const alerts = performanceResults.results?.alerts || [];
    if (alerts.length > 0) {
      recommendations.push('Set up automated performance monitoring and alerting system');
      recommendations.push('Optimize slow API endpoints identified in performance analysis');
    }

    // General recommendations
    recommendations.push('Establish regular security and performance review cycles');
    recommendations.push('Implement automated testing for all critical system components');

    return recommendations;
  }

  private generateSecurityRecommendations(securityResults: AnalysisResult): string[] {
    const vulnerabilities = securityResults.results?.vulnerabilities || [];
    const recommendations: string[] = [];

    if (vulnerabilities.some((v: SecurityVulnerability) => v.type === 'security_definer_view')) {
      recommendations.push('Replace Security Definer Views with Security Invoker where possible');
    }

    if (vulnerabilities.some((v: SecurityVulnerability) => v.type === 'mutable_search_path')) {
      recommendations.push('Set explicit search_path for all database functions');
    }

    if (vulnerabilities.some((v: SecurityVulnerability) => v.type === 'permissive_rls')) {
      recommendations.push('Review and tighten all RLS policies using specific user conditions');
    }

    recommendations.push('Implement regular security scanning and vulnerability assessment');
    recommendations.push('Establish security review process for all database changes');

    return recommendations;
  }

  private generatePerformanceRecommendations(performanceResults: AnalysisResult): string[] {
    return [
      'Implement real-time performance monitoring dashboard',
      'Set up automated alerts for performance degradation',
      'Optimize database queries and add missing indexes',
      'Implement caching strategy for frequently accessed data',
      'Monitor and optimize API response times',
      'Establish performance baselines and SLA targets'
    ];
  }

  private getPerformanceRecommendations(alert: PerformanceMetric): string[] {
    const recommendations: string[] = [];

    if (alert.metric_type === 'response_time') {
      recommendations.push('Optimize database queries and add appropriate indexes');
      recommendations.push('Implement caching for frequently accessed data');
      recommendations.push('Review and optimize API endpoint logic');
    }

    if (alert.metric_type === 'resource_usage') {
      recommendations.push('Monitor memory usage patterns and optimize data structures');
      recommendations.push('Implement garbage collection optimization');
      recommendations.push('Review and optimize resource-intensive operations');
    }

    if (alert.metric_type === 'error_rate') {
      recommendations.push('Investigate and fix underlying causes of errors');
      recommendations.push('Implement better error handling and recovery mechanisms');
      recommendations.push('Add comprehensive logging for error tracking');
    }

    return recommendations;
  }

  private identifyOptimizationOpportunities(metrics: PerformanceMetric[]): Array<{title: string, description: string, impact: string}> {
    const opportunities = [];

    const slowQueries = metrics.filter(m => m.metric_type === 'response_time' && m.value > 1000);
    if (slowQueries.length > 0) {
      opportunities.push({
        title: 'Database Query Optimization',
        description: `${slowQueries.length} slow queries identified that could benefit from indexing or query optimization.`,
        impact: 'High - Could improve response times by 50-80%'
      });
    }

    const highMemoryUsage = metrics.filter(m => m.metric_name.includes('memory') && m.value > 80);
    if (highMemoryUsage.length > 0) {
      opportunities.push({
        title: 'Memory Usage Optimization',
        description: 'High memory usage detected that could benefit from optimization.',
        impact: 'Medium - Could reduce memory usage by 20-40%'
      });
    }

    return opportunities;
  }

  /**
   * Chart generation methods
   */
  private generateIssueDistributionChart(securityResults: AnalysisResult, schemaResults: AnalysisResult, performanceResults: AnalysisResult): ChartData {
    return {
      type: 'pie',
      title: 'Issue Distribution by Category',
      data: [
        securityResults.results?.vulnerabilities?.length || 0,
        (schemaResults.results?.redundancies?.length || 0) + (schemaResults.results?.integrity_issues?.length || 0),
        performanceResults.results?.alerts?.length || 0
      ],
      labels: ['Security', 'Database', 'Performance']
    };
  }

  private generateSecurityVulnerabilityChart(vulnerabilities: SecurityVulnerability[]): ChartData {
    const severityCounts = vulnerabilities.reduce((counts, v) => {
      counts[v.severity] = (counts[v.severity] || 0) + 1;
      return counts;
    }, {} as Record<string, number>);

    return {
      type: 'bar',
      title: 'Security Vulnerabilities by Severity',
      data: Object.values(severityCounts),
      labels: Object.keys(severityCounts)
    };
  }

  private generateSchemaIssuesChart(redundancies: SchemaRedundancy[], integrityIssues: any[], performanceIssues: PerformanceMetric[]): ChartData {
    return {
      type: 'bar',
      title: 'Database Issues by Type',
      data: [redundancies.length, integrityIssues.length, performanceIssues.length],
      labels: ['Redundancies', 'Integrity Issues', 'Performance Issues']
    };
  }

  private generatePerformanceChart(metrics: PerformanceMetric[]): ChartData {
    const responseTimeMetrics = metrics
      .filter(m => m.metric_type === 'response_time')
      .slice(-10) // Last 10 measurements
      .map(m => m.value);

    return {
      type: 'line',
      title: 'Response Time Trend',
      data: responseTimeMetrics,
      labels: responseTimeMetrics.map((_, index) => `T-${responseTimeMetrics.length - index - 1}`)
    };
  }

  /**
   * Public methods
   */
  getReports(): AnalysisReport[] {
    return [...this.reports];
  }

  getLatestReport(): AnalysisReport | null {
    return this.reports.length > 0 ? this.reports[this.reports.length - 1] : null;
  }

  exportReportAsJSON(reportId: string): string {
    const report = this.reports.find(r => r.id === reportId);
    return report ? JSON.stringify(report, null, 2) : '';
  }

  exportReportAsMarkdown(reportId: string): string {
    const report = this.reports.find(r => r.id === reportId);
    if (!report) return '';

    let markdown = `# MIHAS System Analysis Report\n\n`;
    markdown += `**Generated**: ${report.generated_at.toISOString()}\n`;
    markdown += `**Report Type**: ${report.report_type}\n`;
    markdown += `**Total Issues**: ${report.summary.total_issues}\n`;
    markdown += `**Critical Issues**: ${report.summary.critical_issues}\n\n`;

    for (const section of report.sections) {
      markdown += `${section.content}\n\n`;
    }

    return markdown;
  }
}