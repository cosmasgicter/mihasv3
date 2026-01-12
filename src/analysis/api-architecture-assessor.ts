/**
 * API Architecture Assessor
 * 
 * Integrates API endpoint cataloging, performance profiling, and security auditing
 * to provide comprehensive API architecture assessment.
 * 
 * Requirements: 4.1, 4.2, 4.3
 */

import { APIEndpointCataloguer, APICatalog } from './api-cataloger';
import { APIPerformanceProfiler, PerformanceReport } from './api-performance-profiler';
import { APISecurityAuditor, SecurityAuditReport } from './api-security-auditor';

export interface APIArchitectureAssessment {
  catalog: APICatalog;
  performance: PerformanceReport;
  security: SecurityAuditReport;
  overallAssessment: {
    totalEndpoints: number;
    categoriesCount: number;
    averagePerformanceScore: number;
    averageSecurityScore: number;
    criticalIssues: number;
    recommendations: string[];
  };
  assessmentDate: Date;
}

export interface AssessmentOptions {
  baseUrl?: string;
  includeAuth?: boolean;
  authToken?: string;
  adminToken?: string;
  performanceRequestsPerEndpoint?: number;
  timeout?: number;
  functionsDirectory?: string;
}

export class APIArchitectureAssessor {
  private cataloguer: APIEndpointCataloguer;
  private profiler: APIPerformanceProfiler;
  private auditor: APISecurityAuditor;

  constructor(options: AssessmentOptions = {}) {
    const {
      baseUrl = '',
      functionsDirectory = 'functions'
    } = options;

    this.cataloguer = new APIEndpointCataloguer(functionsDirectory);
    this.profiler = new APIPerformanceProfiler(baseUrl);
    this.auditor = new APISecurityAuditor(baseUrl);
  }

  /**
   * Perform comprehensive API architecture assessment
   */
  async performFullAssessment(options: AssessmentOptions = {}): Promise<APIArchitectureAssessment> {
    console.log('Starting comprehensive API architecture assessment...');

    // Step 1: Catalog all API endpoints
    console.log('Step 1: Cataloging API endpoints...');
    const catalog = await this.cataloguer.scanAllEndpoints();
    console.log(`Found ${catalog.totalEndpoints} endpoints across ${Object.keys(catalog.categories).length} categories`);

    // Step 2: Performance profiling
    console.log('Step 2: Profiling API performance...');
    const performance = await this.profiler.profileAllEndpoints(catalog.endpoints, {
      requestsPerEndpoint: options.performanceRequestsPerEndpoint || 3,
      timeout: options.timeout || 15000,
      includeAuth: options.includeAuth || false,
      authToken: options.authToken
    });
    console.log(`Performance profiling complete. Average response time: ${performance.overallStats.averageResponseTime.toFixed(2)}ms`);

    // Step 3: Security auditing
    console.log('Step 3: Auditing API security...');
    const security = await this.auditor.auditAllEndpoints(catalog.endpoints, {
      includeAuth: options.includeAuth || false,
      authToken: options.authToken,
      adminToken: options.adminToken,
      timeout: options.timeout || 15000
    });
    console.log(`Security audit complete. Average security score: ${security.summary.averageScore}/100`);

    // Step 4: Generate overall assessment
    const overallAssessment = this.generateOverallAssessment(catalog, performance, security);

    const assessment: APIArchitectureAssessment = {
      catalog,
      performance,
      security,
      overallAssessment,
      assessmentDate: new Date()
    };

    console.log('API architecture assessment complete!');
    return assessment;
  }

  /**
   * Generate overall assessment summary and recommendations
   */
  private generateOverallAssessment(
    catalog: APICatalog,
    performance: PerformanceReport,
    security: SecurityAuditReport
  ) {
    const criticalIssues = 
      performance.slowestEndpoints.filter(e => e.averageResponseTime > 5000).length +
      security.summary.criticalViolations;

    const recommendations: string[] = [];

    // Performance recommendations
    if (performance.overallStats.averageResponseTime > 2000) {
      recommendations.push('CRITICAL: Overall API performance is poor. Investigate slow endpoints and optimize database queries.');
    }

    const slowEndpoints = performance.slowestEndpoints.filter(e => e.averageResponseTime > 1000);
    if (slowEndpoints.length > 0) {
      recommendations.push(`WARNING: ${slowEndpoints.length} endpoints have response times > 1 second. Consider caching and optimization.`);
    }

    // Security recommendations
    if (security.summary.criticalViolations > 0) {
      recommendations.push(`URGENT: ${security.summary.criticalViolations} critical security vulnerabilities found. Address immediately.`);
    }

    if (security.summary.averageScore < 70) {
      recommendations.push('WARNING: Overall security score is below acceptable threshold. Review security practices.');
    }

    // Architecture recommendations
    const largeCategories = Object.entries(catalog.categories)
      .filter(([, count]) => count > 10)
      .map(([category]) => category);

    if (largeCategories.length > 0) {
      recommendations.push(`INFO: Large endpoint categories detected (${largeCategories.join(', ')}). Consider breaking into smaller, focused services.`);
    }

    // Dependency recommendations
    const highDependencyEndpoints = catalog.endpoints.filter(e => e.dependencies.length > 5);
    if (highDependencyEndpoints.length > 0) {
      recommendations.push(`INFO: ${highDependencyEndpoints.length} endpoints have high dependency counts. Review for potential coupling issues.`);
    }

    return {
      totalEndpoints: catalog.totalEndpoints,
      categoriesCount: Object.keys(catalog.categories).length,
      averagePerformanceScore: this.calculatePerformanceScore(performance),
      averageSecurityScore: security.summary.averageScore,
      criticalIssues,
      recommendations
    };
  }

  /**
   * Calculate overall performance score (0-100)
   */
  private calculatePerformanceScore(performance: PerformanceReport): number {
    const avgResponseTime = performance.overallStats.averageResponseTime;
    const errorRate = performance.overallStats.overallErrorRate;

    // Score based on response time (0-50 points)
    let responseTimeScore = 50;
    if (avgResponseTime > 5000) responseTimeScore = 0;
    else if (avgResponseTime > 2000) responseTimeScore = 20;
    else if (avgResponseTime > 1000) responseTimeScore = 35;
    else if (avgResponseTime > 500) responseTimeScore = 45;

    // Score based on error rate (0-50 points)
    let errorRateScore = 50;
    if (errorRate > 10) errorRateScore = 0;
    else if (errorRate > 5) errorRateScore = 20;
    else if (errorRate > 2) errorRateScore = 35;
    else if (errorRate > 0.5) errorRateScore = 45;

    return Math.round(responseTimeScore + errorRateScore);
  }

  /**
   * Export comprehensive assessment report
   */
  async exportAssessment(assessment: APIArchitectureAssessment, outputDir: string = './reports'): Promise<void> {
    const fs = await import('fs/promises');
    
    // Ensure output directory exists
    try {
      await fs.mkdir(outputDir, { recursive: true });
    } catch (error) {
      // Directory might already exist
    }

    const timestamp = assessment.assessmentDate.toISOString().split('T')[0];
    
    // Export individual reports
    await this.cataloguer.exportCatalog(`${outputDir}/api-catalog-${timestamp}.json`);
    await this.profiler.exportReport(`${outputDir}/performance-report-${timestamp}.json`);
    await this.auditor.exportReport(`${outputDir}/security-report-${timestamp}.json`);

    // Export comprehensive assessment
    await fs.writeFile(
      `${outputDir}/api-architecture-assessment-${timestamp}.json`,
      JSON.stringify(assessment, null, 2)
    );

    // Export executive summary
    const executiveSummary = this.generateExecutiveSummary(assessment);
    await fs.writeFile(
      `${outputDir}/executive-summary-${timestamp}.md`,
      executiveSummary
    );

    console.log(`Assessment reports exported to ${outputDir}/`);
  }

  /**
   * Generate executive summary in markdown format
   */
  private generateExecutiveSummary(assessment: APIArchitectureAssessment): string {
    const { catalog, performance, security, overallAssessment } = assessment;

    return `# API Architecture Assessment - Executive Summary

**Assessment Date:** ${assessment.assessmentDate.toISOString().split('T')[0]}

## Overview

This assessment analyzed ${overallAssessment.totalEndpoints} API endpoints across ${overallAssessment.categoriesCount} categories to evaluate the current API architecture's performance, security, and maintainability.

## Key Metrics

- **Total Endpoints:** ${overallAssessment.totalEndpoints}
- **Categories:** ${overallAssessment.categoriesCount}
- **Average Response Time:** ${performance.overallStats.averageResponseTime.toFixed(2)}ms
- **Overall Error Rate:** ${performance.overallStats.overallErrorRate.toFixed(2)}%
- **Security Score:** ${overallAssessment.averageSecurityScore}/100
- **Performance Score:** ${overallAssessment.averagePerformanceScore}/100

## Critical Issues

${overallAssessment.criticalIssues > 0 
  ? `⚠️ **${overallAssessment.criticalIssues} critical issues** require immediate attention.`
  : '✅ No critical issues identified.'
}

## Category Breakdown

${Object.entries(catalog.categories)
  .sort(([,a], [,b]) => b - a)
  .map(([category, count]) => `- **${category}:** ${count} endpoints`)
  .join('\n')
}

## Performance Highlights

### Slowest Endpoints
${performance.slowestEndpoints.slice(0, 5).map((endpoint, index) => 
  `${index + 1}. ${endpoint.endpointId}: ${endpoint.averageResponseTime.toFixed(2)}ms`
).join('\n')}

### Fastest Endpoints
${performance.fastestEndpoints.slice(0, 3).map((endpoint, index) => 
  `${index + 1}. ${endpoint.endpointId}: ${endpoint.averageResponseTime.toFixed(2)}ms`
).join('\n')}

## Security Summary

- **Critical Vulnerabilities:** ${security.summary.criticalViolations}
- **High Severity Issues:** ${security.summary.highViolations}
- **Medium Severity Issues:** ${security.summary.mediumViolations}
- **Low Severity Issues:** ${security.summary.lowViolations}

## Recommendations

${overallAssessment.recommendations.map(rec => `- ${rec}`).join('\n')}

## Next Steps

1. **Immediate Actions:** Address critical security vulnerabilities and performance bottlenecks
2. **Short-term:** Implement recommended optimizations and security improvements
3. **Long-term:** Consider architectural improvements for scalability and maintainability

---

*This assessment was generated automatically by the MIHAS API Architecture Assessor.*
`;
  }

  /**
   * Get assessment summary for quick overview
   */
  getAssessmentSummary(assessment: APIArchitectureAssessment): object {
    return {
      totalEndpoints: assessment.overallAssessment.totalEndpoints,
      categories: Object.keys(assessment.catalog.categories).length,
      performanceScore: assessment.overallAssessment.averagePerformanceScore,
      securityScore: assessment.overallAssessment.averageSecurityScore,
      criticalIssues: assessment.overallAssessment.criticalIssues,
      topRecommendations: assessment.overallAssessment.recommendations.slice(0, 3),
      assessmentDate: assessment.assessmentDate
    };
  }

  /**
   * Compare two assessments to show improvement/degradation
   */
  compareAssessments(current: APIArchitectureAssessment, previous: APIArchitectureAssessment): object {
    return {
      endpointChange: current.overallAssessment.totalEndpoints - previous.overallAssessment.totalEndpoints,
      performanceChange: current.overallAssessment.averagePerformanceScore - previous.overallAssessment.averagePerformanceScore,
      securityChange: current.overallAssessment.averageSecurityScore - previous.overallAssessment.averageSecurityScore,
      criticalIssuesChange: current.overallAssessment.criticalIssues - previous.overallAssessment.criticalIssues,
      timespan: {
        from: previous.assessmentDate,
        to: current.assessmentDate
      }
    };
  }
}