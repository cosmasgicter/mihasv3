/**
 * Tests for API Architecture Assessment Tools
 * 
 * Tests the API cataloger, performance profiler, and security auditor
 * to ensure they work correctly with the MIHAS system.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { APIEndpointCataloguer } from '../api-cataloger';
import { APIPerformanceProfiler } from '../api-performance-profiler';
import { APISecurityAuditor } from '../api-security-auditor';
import { APIArchitectureAssessor } from '../api-architecture-assessor';

describe('API Architecture Assessment Tools', () => {
  describe('APIEndpointCataloguer', () => {
    let cataloguer: APIEndpointCataloguer;

    beforeEach(() => {
      cataloguer = new APIEndpointCataloguer('functions');
    });

    it('should initialize with correct functions directory', () => {
      expect(cataloguer).toBeDefined();
    });

    it('should categorize endpoints correctly', () => {
      // Test the categorization logic with mock paths
      const testCases = [
        { path: 'admin/users.js', expected: 'admin' },
        { path: 'auth/login.js', expected: 'authentication' },
        { path: 'applications/review.js', expected: 'applications' },
        { path: 'notifications/send.js', expected: 'notifications' },
        { path: 'ai/analyze.ts', expected: 'ai-services' },
        { path: 'test-health.js', expected: 'testing' },
        { path: 'random/file.js', expected: 'general' }
      ];

      testCases.forEach(({ path, expected }) => {
        // Access private method through type assertion for testing
        const category = (cataloguer as any).categorizeEndpoint(path);
        expect(category).toBe(expected);
      });
    });

    it('should extract HTTP methods from content', () => {
      const testContent = `
        if (request.method === 'GET') {
          return handleGet();
        } else if (request.method === 'POST') {
          return handlePost();
        }
      `;

      const methods = (cataloguer as any).extractHTTPMethods(testContent);
      expect(methods).toContain('GET');
      expect(methods).toContain('POST');
    });

    it('should detect protected endpoints', () => {
      const protectedContent = `
        const authToken = request.headers.authorization;
        if (!authToken) {
          return new Response('Unauthorized', { status: 401 });
        }
      `;

      const publicContent = `
        return new Response('Hello World');
      `;

      expect((cataloguer as any).checkIfProtected(protectedContent)).toBe(true);
      expect((cataloguer as any).checkIfProtected(publicContent)).toBe(false);
    });
  });

  describe('APIPerformanceProfiler', () => {
    let profiler: APIPerformanceProfiler;

    beforeEach(() => {
      profiler = new APIPerformanceProfiler('http://localhost:8788');
    });

    it('should initialize with correct base URL', () => {
      expect(profiler).toBeDefined();
    });

    it('should calculate performance metrics correctly', () => {
      const mockMetrics = [
        { responseTime: 100, statusCode: 200, contentLength: 1024 },
        { responseTime: 200, statusCode: 200, contentLength: 2048 },
        { responseTime: 150, statusCode: 500, contentLength: 512 },
        { responseTime: 300, statusCode: 200, contentLength: 1536 }
      ].map((m, i) => ({
        ...m,
        endpointId: 'test-endpoint',
        url: 'http://test.com',
        method: 'GET',
        timestamp: new Date()
      }));

      const profile = (profiler as any).calculateProfile('test-endpoint', mockMetrics);
      
      expect(profile.averageResponseTime).toBe(187.5); // (100+200+150+300)/4
      expect(profile.totalRequests).toBe(4);
      expect(profile.errorRate).toBe(25); // 1 error out of 4 requests
      expect(profile.recommendations).toBeDefined();
      expect(Array.isArray(profile.recommendations)).toBe(true);
    });

    it('should generate appropriate recommendations', () => {
      const slowProfile = {
        averageResponseTime: 3000,
        p95ResponseTime: 6000,
        errorRate: 15,
        averageContentLength: 2 * 1024 * 1024 // 2MB
      };

      const recommendations = (profiler as any).generateRecommendations(slowProfile);
      
      expect(recommendations.some((r: string) => r.includes('CRITICAL'))).toBe(true);
      expect(recommendations.some((r: string) => r.includes('response time'))).toBe(true);
      expect(recommendations.some((r: string) => r.includes('Error rate'))).toBe(true);
      expect(recommendations.some((r: string) => r.includes('response size'))).toBe(true);
    });
  });

  describe('APISecurityAuditor', () => {
    let auditor: APISecurityAuditor;

    beforeEach(() => {
      auditor = new APISecurityAuditor('http://localhost:8788');
    });

    it('should initialize with security checks', () => {
      expect(auditor).toBeDefined();
      const checks = (auditor as any).securityChecks;
      expect(Array.isArray(checks)).toBe(true);
      expect(checks.length).toBeGreaterThan(0);
    });

    it('should calculate security scores correctly', () => {
      const violations = [
        { severity: 'CRITICAL' as const },
        { severity: 'HIGH' as const },
        { severity: 'MEDIUM' as const }
      ];
      const passedChecks = ['check1', 'check2', 'check3', 'check4', 'check5'];

      const score = (auditor as any).calculateSecurityScore(violations, passedChecks);
      
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);
      expect(typeof score).toBe('number');
    });

    it('should generate security recommendations', () => {
      const mockViolations = [
        {
          checkId: 'auth-001',
          severity: 'CRITICAL' as const,
          message: 'Test violation'
        },
        {
          checkId: 'headers-001',
          severity: 'HIGH' as const,
          message: 'Test violation'
        }
      ];

      const mockEndpoint = {
        id: 'test-endpoint',
        category: 'admin'
      };

      const recommendations = (auditor as any).generateSecurityRecommendations(mockViolations, mockEndpoint);
      
      expect(Array.isArray(recommendations)).toBe(true);
      expect(recommendations.some((r: string) => r.includes('URGENT'))).toBe(true);
      expect(recommendations.some((r: string) => r.includes('authentication'))).toBe(true);
    });
  });

  describe('APIArchitectureAssessor', () => {
    let assessor: APIArchitectureAssessor;

    beforeEach(() => {
      assessor = new APIArchitectureAssessor({
        baseUrl: 'http://localhost:8788',
        functionsDirectory: 'functions'
      });
    });

    it('should initialize with all components', () => {
      expect(assessor).toBeDefined();
      expect((assessor as any).cataloguer).toBeDefined();
      expect((assessor as any).profiler).toBeDefined();
      expect((assessor as any).auditor).toBeDefined();
    });

    it('should calculate performance score correctly', () => {
      const mockPerformanceReport = {
        overallStats: {
          averageResponseTime: 800,
          overallErrorRate: 1.5
        }
      };

      const score = (assessor as any).calculatePerformanceScore(mockPerformanceReport);
      
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);
      expect(typeof score).toBe('number');
    });

    it('should generate executive summary', () => {
      const mockAssessment = {
        assessmentDate: new Date('2025-01-12'),
        catalog: {
          categories: {
            'admin': 5,
            'auth': 3,
            'applications': 8
          }
        },
        performance: {
          overallStats: {
            averageResponseTime: 750,
            overallErrorRate: 2.1
          },
          slowestEndpoints: [
            { endpointId: 'slow-endpoint', averageResponseTime: 2000 }
          ],
          fastestEndpoints: [
            { endpointId: 'fast-endpoint', averageResponseTime: 100 }
          ]
        },
        security: {
          summary: {
            criticalViolations: 1,
            highViolations: 2,
            mediumViolations: 3,
            lowViolations: 1
          }
        },
        overallAssessment: {
          totalEndpoints: 16,
          categoriesCount: 3,
          averageSecurityScore: 75,
          averagePerformanceScore: 80,
          criticalIssues: 1,
          recommendations: ['Fix critical issues', 'Optimize performance']
        }
      };

      const summary = (assessor as any).generateExecutiveSummary(mockAssessment);
      
      expect(typeof summary).toBe('string');
      expect(summary).toContain('# API Architecture Assessment');
      expect(summary).toContain('2025-01-12');
      expect(summary).toContain('16');
      expect(summary).toContain('admin');
      expect(summary).toContain('Fix critical issues');
    });

    it('should compare assessments correctly', () => {
      const previousAssessment = {
        overallAssessment: {
          totalEndpoints: 10,
          averagePerformanceScore: 70,
          averageSecurityScore: 60,
          criticalIssues: 3
        },
        assessmentDate: new Date('2025-01-01')
      };

      const currentAssessment = {
        overallAssessment: {
          totalEndpoints: 15,
          averagePerformanceScore: 80,
          averageSecurityScore: 75,
          criticalIssues: 1
        },
        assessmentDate: new Date('2025-01-12')
      };

      const comparison = assessor.compareAssessments(currentAssessment as any, previousAssessment as any);
      
      expect(comparison.endpointChange).toBe(5);
      expect(comparison.performanceChange).toBe(10);
      expect(comparison.securityChange).toBe(15);
      expect(comparison.criticalIssuesChange).toBe(-2);
      expect(comparison.timespan.from).toEqual(new Date('2025-01-01'));
      expect(comparison.timespan.to).toEqual(new Date('2025-01-12'));
    });
  });
});