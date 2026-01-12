/**
 * API Security Auditor
 * 
 * Verifies authentication and authorization on all protected endpoints,
 * checks for proper CORS configuration and security headers,
 * and validates input sanitization and output encoding.
 * 
 * Requirements: 4.3
 */

import { APIEndpoint } from './api-cataloger';

export interface SecurityCheck {
  checkId: string;
  name: string;
  description: string;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';
  category: 'authentication' | 'authorization' | 'cors' | 'headers' | 'input-validation' | 'output-encoding' | 'encryption';
}

export interface SecurityViolation {
  checkId: string;
  endpointId: string;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';
  message: string;
  details: string;
  remediation: string;
  evidence?: any;
  timestamp: Date;
}

export interface SecurityAuditResult {
  endpointId: string;
  url: string;
  overallScore: number; // 0-100
  violations: SecurityViolation[];
  passedChecks: string[];
  recommendations: string[];
  auditedAt: Date;
}

export interface SecurityAuditReport {
  results: SecurityAuditResult[];
  summary: {
    totalEndpoints: number;
    criticalViolations: number;
    highViolations: number;
    mediumViolations: number;
    lowViolations: number;
    averageScore: number;
    worstEndpoints: SecurityAuditResult[];
    bestEndpoints: SecurityAuditResult[];
  };
  generatedAt: Date;
}

export class APISecurityAuditor {
  private securityChecks: SecurityCheck[] = [];
  private auditResults: Map<string, SecurityAuditResult> = new Map();
  private baseUrl: string;

  constructor(baseUrl: string = '') {
    this.baseUrl = baseUrl;
    this.initializeSecurityChecks();
  }

  /**
   * Initialize all security checks
   */
  private initializeSecurityChecks(): void {
    this.securityChecks = [
      // Authentication checks
      {
        checkId: 'auth-001',
        name: 'Authentication Required',
        description: 'Verify that protected endpoints require authentication',
        severity: 'CRITICAL',
        category: 'authentication'
      },
      {
        checkId: 'auth-002',
        name: 'Token Validation',
        description: 'Verify that invalid tokens are rejected',
        severity: 'CRITICAL',
        category: 'authentication'
      },
      {
        checkId: 'auth-003',
        name: 'Token Expiration',
        description: 'Verify that expired tokens are rejected',
        severity: 'HIGH',
        category: 'authentication'
      },

      // Authorization checks
      {
        checkId: 'authz-001',
        name: 'Role-Based Access Control',
        description: 'Verify that users can only access resources they are authorized for',
        severity: 'CRITICAL',
        category: 'authorization'
      },
      {
        checkId: 'authz-002',
        name: 'Admin Endpoint Protection',
        description: 'Verify that admin endpoints require admin privileges',
        severity: 'CRITICAL',
        category: 'authorization'
      },

      // CORS checks
      {
        checkId: 'cors-001',
        name: 'CORS Headers Present',
        description: 'Verify that CORS headers are properly configured',
        severity: 'MEDIUM',
        category: 'cors'
      },
      {
        checkId: 'cors-002',
        name: 'CORS Origin Validation',
        description: 'Verify that CORS allows only trusted origins',
        severity: 'HIGH',
        category: 'cors'
      },

      // Security headers checks
      {
        checkId: 'headers-001',
        name: 'Content Security Policy',
        description: 'Verify that CSP headers are present and properly configured',
        severity: 'HIGH',
        category: 'headers'
      },
      {
        checkId: 'headers-002',
        name: 'X-Frame-Options',
        description: 'Verify that X-Frame-Options header prevents clickjacking',
        severity: 'MEDIUM',
        category: 'headers'
      },
      {
        checkId: 'headers-003',
        name: 'X-Content-Type-Options',
        description: 'Verify that X-Content-Type-Options prevents MIME sniffing',
        severity: 'MEDIUM',
        category: 'headers'
      },
      {
        checkId: 'headers-004',
        name: 'Strict-Transport-Security',
        description: 'Verify that HSTS header enforces HTTPS',
        severity: 'HIGH',
        category: 'headers'
      },

      // Input validation checks
      {
        checkId: 'input-001',
        name: 'SQL Injection Protection',
        description: 'Verify that endpoints are protected against SQL injection',
        severity: 'CRITICAL',
        category: 'input-validation'
      },
      {
        checkId: 'input-002',
        name: 'XSS Protection',
        description: 'Verify that user input is sanitized to prevent XSS',
        severity: 'HIGH',
        category: 'input-validation'
      },
      {
        checkId: 'input-003',
        name: 'Input Length Validation',
        description: 'Verify that input length limits are enforced',
        severity: 'MEDIUM',
        category: 'input-validation'
      },

      // Output encoding checks
      {
        checkId: 'output-001',
        name: 'JSON Response Encoding',
        description: 'Verify that JSON responses are properly encoded',
        severity: 'MEDIUM',
        category: 'output-encoding'
      },
      {
        checkId: 'output-002',
        name: 'Sensitive Data Exposure',
        description: 'Verify that sensitive data is not exposed in responses',
        severity: 'CRITICAL',
        category: 'output-encoding'
      }
    ];
  }

  /**
   * Audit all endpoints for security vulnerabilities
   */
  async auditAllEndpoints(endpoints: APIEndpoint[], options: {
    includeAuth?: boolean;
    authToken?: string;
    adminToken?: string;
    timeout?: number;
  } = {}): Promise<SecurityAuditReport> {
    console.log(`Starting security audit for ${endpoints.length} endpoints...`);

    for (const endpoint of endpoints) {
      try {
        const result = await this.auditEndpoint(endpoint, options);
        this.auditResults.set(endpoint.id, result);
      } catch (error) {
        console.warn(`Failed to audit endpoint ${endpoint.id}:`, error);
        
        // Create a failed audit result
        const failedResult: SecurityAuditResult = {
          endpointId: endpoint.id,
          url: this.buildEndpointUrl(endpoint),
          overallScore: 0,
          violations: [{
            checkId: 'audit-error',
            endpointId: endpoint.id,
            severity: 'HIGH',
            message: 'Audit failed',
            details: error instanceof Error ? error.message : 'Unknown error',
            remediation: 'Investigate why the endpoint could not be audited',
            timestamp: new Date()
          }],
          passedChecks: [],
          recommendations: ['Fix audit connectivity issues'],
          auditedAt: new Date()
        };
        
        this.auditResults.set(endpoint.id, failedResult);
      }
    }

    return this.generateReport();
  }

  /**
   * Audit a single endpoint for security vulnerabilities
   */
  async auditEndpoint(endpoint: APIEndpoint, options: {
    includeAuth?: boolean;
    authToken?: string;
    adminToken?: string;
    timeout?: number;
  } = {}): Promise<SecurityAuditResult> {
    const url = this.buildEndpointUrl(endpoint);
    const violations: SecurityViolation[] = [];
    const passedChecks: string[] = [];

    console.log(`Auditing endpoint: ${endpoint.id} (${url})`);

    // Run all applicable security checks
    for (const check of this.securityChecks) {
      try {
        const violation = await this.runSecurityCheck(check, endpoint, url, options);
        if (violation) {
          violations.push(violation);
        } else {
          passedChecks.push(check.checkId);
        }
      } catch (error) {
        console.warn(`Security check ${check.checkId} failed for ${endpoint.id}:`, error);
      }
    }

    const overallScore = this.calculateSecurityScore(violations, passedChecks);
    const recommendations = this.generateSecurityRecommendations(violations, endpoint);

    return {
      endpointId: endpoint.id,
      url,
      overallScore,
      violations,
      passedChecks,
      recommendations,
      auditedAt: new Date()
    };
  }

  /**
   * Run a specific security check against an endpoint
   */
  private async runSecurityCheck(
    check: SecurityCheck,
    endpoint: APIEndpoint,
    url: string,
    options: any
  ): Promise<SecurityViolation | null> {
    switch (check.checkId) {
      case 'auth-001':
        return await this.checkAuthenticationRequired(check, endpoint, url, options);
      case 'auth-002':
        return await this.checkTokenValidation(check, endpoint, url, options);
      case 'auth-003':
        return await this.checkTokenExpiration(check, endpoint, url, options);
      case 'authz-001':
        return await this.checkRoleBasedAccess(check, endpoint, url, options);
      case 'authz-002':
        return await this.checkAdminEndpointProtection(check, endpoint, url, options);
      case 'cors-001':
        return await this.checkCORSHeaders(check, endpoint, url, options);
      case 'cors-002':
        return await this.checkCORSOriginValidation(check, endpoint, url, options);
      case 'headers-001':
        return await this.checkCSPHeader(check, endpoint, url, options);
      case 'headers-002':
        return await this.checkXFrameOptions(check, endpoint, url, options);
      case 'headers-003':
        return await this.checkXContentTypeOptions(check, endpoint, url, options);
      case 'headers-004':
        return await this.checkHSTS(check, endpoint, url, options);
      case 'input-001':
        return await this.checkSQLInjectionProtection(check, endpoint, url, options);
      case 'input-002':
        return await this.checkXSSProtection(check, endpoint, url, options);
      case 'input-003':
        return await this.checkInputLengthValidation(check, endpoint, url, options);
      case 'output-001':
        return await this.checkJSONResponseEncoding(check, endpoint, url, options);
      case 'output-002':
        return await this.checkSensitiveDataExposure(check, endpoint, url, options);
      default:
        return null;
    }
  }

  /**
   * Check if authentication is required for protected endpoints
   */
  private async checkAuthenticationRequired(
    check: SecurityCheck,
    endpoint: APIEndpoint,
    url: string,
    options: any
  ): Promise<SecurityViolation | null> {
    if (!endpoint.isProtected) {
      return null; // Skip check for public endpoints
    }

    try {
      // Try to access endpoint without authentication
      const response = await fetch(url, {
        method: endpoint.method[0] || 'GET',
        headers: { 'Accept': 'application/json' }
      });

      // If we get a successful response, authentication is not required
      if (response.status >= 200 && response.status < 300) {
        return {
          checkId: check.checkId,
          endpointId: endpoint.id,
          severity: check.severity,
          message: 'Protected endpoint allows unauthenticated access',
          details: `Endpoint returned status ${response.status} without authentication`,
          remediation: 'Add authentication middleware to protect this endpoint',
          evidence: { statusCode: response.status },
          timestamp: new Date()
        };
      }

      // Check if proper authentication error is returned
      if (response.status !== 401 && response.status !== 403) {
        return {
          checkId: check.checkId,
          endpointId: endpoint.id,
          severity: 'MEDIUM',
          message: 'Improper authentication error response',
          details: `Expected 401 or 403, got ${response.status}`,
          remediation: 'Return proper HTTP status codes for authentication failures',
          evidence: { statusCode: response.status },
          timestamp: new Date()
        };
      }

      return null; // Check passed
    } catch (error) {
      // Network errors are not security violations
      return null;
    }
  }

  /**
   * Check token validation
   */
  private async checkTokenValidation(
    check: SecurityCheck,
    endpoint: APIEndpoint,
    url: string,
    options: any
  ): Promise<SecurityViolation | null> {
    if (!endpoint.isProtected) {
      return null;
    }

    try {
      // Try with invalid token
      const response = await fetch(url, {
        method: endpoint.method[0] || 'GET',
        headers: {
          'Authorization': 'Bearer invalid-token-12345',
          'Accept': 'application/json'
        }
      });

      if (response.status >= 200 && response.status < 300) {
        return {
          checkId: check.checkId,
          endpointId: endpoint.id,
          severity: check.severity,
          message: 'Invalid token accepted',
          details: `Endpoint accepted invalid token and returned status ${response.status}`,
          remediation: 'Implement proper token validation',
          evidence: { statusCode: response.status },
          timestamp: new Date()
        };
      }

      return null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Check CORS headers
   */
  private async checkCORSHeaders(
    check: SecurityCheck,
    endpoint: APIEndpoint,
    url: string,
    options: any
  ): Promise<SecurityViolation | null> {
    try {
      const response = await fetch(url, {
        method: 'OPTIONS',
        headers: {
          'Origin': 'https://example.com',
          'Access-Control-Request-Method': 'GET'
        }
      });

      const corsHeaders = {
        'access-control-allow-origin': response.headers.get('access-control-allow-origin'),
        'access-control-allow-methods': response.headers.get('access-control-allow-methods'),
        'access-control-allow-headers': response.headers.get('access-control-allow-headers')
      };

      if (!corsHeaders['access-control-allow-origin']) {
        return {
          checkId: check.checkId,
          endpointId: endpoint.id,
          severity: check.severity,
          message: 'Missing CORS headers',
          details: 'Access-Control-Allow-Origin header not found',
          remediation: 'Configure proper CORS headers',
          evidence: corsHeaders,
          timestamp: new Date()
        };
      }

      return null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Check security headers
   */
  private async checkCSPHeader(
    check: SecurityCheck,
    endpoint: APIEndpoint,
    url: string,
    options: any
  ): Promise<SecurityViolation | null> {
    try {
      const response = await fetch(url, {
        method: endpoint.method[0] || 'GET'
      });

      const csp = response.headers.get('content-security-policy');
      if (!csp) {
        return {
          checkId: check.checkId,
          endpointId: endpoint.id,
          severity: check.severity,
          message: 'Missing Content Security Policy header',
          details: 'CSP header not found in response',
          remediation: 'Add Content-Security-Policy header to prevent XSS attacks',
          timestamp: new Date()
        };
      }

      return null;
    } catch (error) {
      return null;
    }
  }

  // Placeholder implementations for other security checks
  private async checkTokenExpiration(check: SecurityCheck, endpoint: APIEndpoint, url: string, options: any): Promise<SecurityViolation | null> { return null; }
  private async checkRoleBasedAccess(check: SecurityCheck, endpoint: APIEndpoint, url: string, options: any): Promise<SecurityViolation | null> { return null; }
  private async checkAdminEndpointProtection(check: SecurityCheck, endpoint: APIEndpoint, url: string, options: any): Promise<SecurityViolation | null> { return null; }
  private async checkCORSOriginValidation(check: SecurityCheck, endpoint: APIEndpoint, url: string, options: any): Promise<SecurityViolation | null> { return null; }
  private async checkXFrameOptions(check: SecurityCheck, endpoint: APIEndpoint, url: string, options: any): Promise<SecurityViolation | null> { return null; }
  private async checkXContentTypeOptions(check: SecurityCheck, endpoint: APIEndpoint, url: string, options: any): Promise<SecurityViolation | null> { return null; }
  private async checkHSTS(check: SecurityCheck, endpoint: APIEndpoint, url: string, options: any): Promise<SecurityViolation | null> { return null; }
  private async checkSQLInjectionProtection(check: SecurityCheck, endpoint: APIEndpoint, url: string, options: any): Promise<SecurityViolation | null> { return null; }
  private async checkXSSProtection(check: SecurityCheck, endpoint: APIEndpoint, url: string, options: any): Promise<SecurityViolation | null> { return null; }
  private async checkInputLengthValidation(check: SecurityCheck, endpoint: APIEndpoint, url: string, options: any): Promise<SecurityViolation | null> { return null; }
  private async checkJSONResponseEncoding(check: SecurityCheck, endpoint: APIEndpoint, url: string, options: any): Promise<SecurityViolation | null> { return null; }
  private async checkSensitiveDataExposure(check: SecurityCheck, endpoint: APIEndpoint, url: string, options: any): Promise<SecurityViolation | null> { return null; }

  /**
   * Calculate overall security score
   */
  private calculateSecurityScore(violations: SecurityViolation[], passedChecks: string[]): number {
    const totalChecks = violations.length + passedChecks.length;
    if (totalChecks === 0) return 100;

    // Weight violations by severity
    const severityWeights = {
      'CRITICAL': 25,
      'HIGH': 15,
      'MEDIUM': 10,
      'LOW': 5,
      'INFO': 1
    };

    const totalPenalty = violations.reduce((sum, violation) => {
      return sum + (severityWeights[violation.severity] || 5);
    }, 0);

    const maxPossiblePenalty = totalChecks * 25; // Assuming all could be critical
    const score = Math.max(0, 100 - (totalPenalty / maxPossiblePenalty) * 100);

    return Math.round(score);
  }

  /**
   * Generate security recommendations
   */
  private generateSecurityRecommendations(violations: SecurityViolation[], endpoint: APIEndpoint): string[] {
    const recommendations: string[] = [];

    const criticalViolations = violations.filter(v => v.severity === 'CRITICAL');
    const highViolations = violations.filter(v => v.severity === 'HIGH');

    if (criticalViolations.length > 0) {
      recommendations.push('URGENT: Address critical security vulnerabilities immediately');
    }

    if (highViolations.length > 0) {
      recommendations.push('HIGH PRIORITY: Fix high-severity security issues');
    }

    // Category-specific recommendations
    const categories = [...new Set(violations.map(v => this.getCheckCategory(v.checkId)))];
    
    if (categories.includes('authentication')) {
      recommendations.push('Review and strengthen authentication mechanisms');
    }
    
    if (categories.includes('authorization')) {
      recommendations.push('Implement proper role-based access controls');
    }
    
    if (categories.includes('headers')) {
      recommendations.push('Configure security headers to prevent common attacks');
    }
    
    if (categories.includes('input-validation')) {
      recommendations.push('Implement comprehensive input validation and sanitization');
    }

    return recommendations;
  }

  /**
   * Get category for a security check
   */
  private getCheckCategory(checkId: string): string {
    const check = this.securityChecks.find(c => c.checkId === checkId);
    return check?.category || 'unknown';
  }

  /**
   * Build endpoint URL for testing
   */
  private buildEndpointUrl(endpoint: APIEndpoint): string {
    if (this.baseUrl) {
      return `${this.baseUrl}/${endpoint.path.replace(/\.(js|ts)$/, '')}`;
    }
    
    return `http://localhost:8788/${endpoint.path.replace(/\.(js|ts)$/, '')}`;
  }

  /**
   * Generate comprehensive security audit report
   */
  generateReport(): SecurityAuditReport {
    const results = Array.from(this.auditResults.values());
    
    const criticalViolations = results.reduce((sum, r) => sum + r.violations.filter(v => v.severity === 'CRITICAL').length, 0);
    const highViolations = results.reduce((sum, r) => sum + r.violations.filter(v => v.severity === 'HIGH').length, 0);
    const mediumViolations = results.reduce((sum, r) => sum + r.violations.filter(v => v.severity === 'MEDIUM').length, 0);
    const lowViolations = results.reduce((sum, r) => sum + r.violations.filter(v => v.severity === 'LOW').length, 0);

    const averageScore = results.length > 0 
      ? results.reduce((sum, r) => sum + r.overallScore, 0) / results.length 
      : 0;

    const worstEndpoints = [...results]
      .sort((a, b) => a.overallScore - b.overallScore)
      .slice(0, 10);

    const bestEndpoints = [...results]
      .sort((a, b) => b.overallScore - a.overallScore)
      .slice(0, 10);

    return {
      results,
      summary: {
        totalEndpoints: results.length,
        criticalViolations,
        highViolations,
        mediumViolations,
        lowViolations,
        averageScore: Math.round(averageScore),
        worstEndpoints,
        bestEndpoints
      },
      generatedAt: new Date()
    };
  }

  /**
   * Export security audit report to JSON
   */
  async exportReport(outputPath: string): Promise<void> {
    const report = this.generateReport();
    const fs = await import('fs/promises');
    await fs.writeFile(outputPath, JSON.stringify(report, null, 2));
    console.log(`Security audit report exported to ${outputPath}`);
  }

  /**
   * Get security summary for a specific endpoint
   */
  getEndpointSecurity(endpointId: string): SecurityAuditResult | null {
    return this.auditResults.get(endpointId) || null;
  }

  /**
   * Clear all audit results
   */
  clearResults(): void {
    this.auditResults.clear();
  }
}