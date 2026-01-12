/**
 * Property-Based Tests for Performance Optimization
 * 
 * Feature: mihas-system-analysis
 * Property 6: Performance Optimization Recommendations
 * 
 * Validates: Requirements 2.5
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { SchemaAnalyzer } from '../database/SchemaAnalyzer';
import { PropertyTestFramework } from '../testing/PropertyTestFramework';
import type { PerformanceMetric, AnalysisResult } from '../types';

describe('Performance Optimization - Property Tests', () => {
  let schemaAnalyzer: SchemaAnalyzer;
  let propertyFramework: PropertyTestFramework;

  beforeEach(() => {
    schemaAnalyzer = new SchemaAnalyzer();
    propertyFramework = new PropertyTestFramework();
  });

  /**
   * Property 6: Performance Optimization Recommendations
   * For any database with performance bottlenecks,
   * the system should identify slow queries and recommend specific indexing or optimization strategies
   */
  it('Property 6: Should provide actionable performance optimization recommendations', async () => {
    const testCases = propertyFramework.generatePerformanceOptimizationTestCases(100);
    
    for (const testCase of testCases) {
      const result = await schemaAnalyzer.performSchemaAnalysis();
      
      // Property: Analysis should complete successfully
      expect(result.status).toBe('completed');
      expect(result.results.performance_issues).toBeDefined();
      
      const performanceIssues = result.results.performance_issues as PerformanceMetric[];
      
      // Property: All performance metrics should have proper structure
      for (const metric of performanceIssues) {
        expect(metric.id).toBeDefined();
        expect(metric.metric_name).toBeDefined();
        expect(metric.metric_type).toMatch(/^(response_time|error_rate|throughput|resource_usage)$/);
        expect(metric.value).toBeGreaterThanOrEqual(0);
        expect(metric.unit).toBeDefined();
        expect(metric.timestamp).toBeDefined();
      }
      
      // Property: Critical performance issues should have thresholds
      const criticalIssues = performanceIssues.filter(m => 
        m.threshold_critical && m.value > m.threshold_critical
      );
      
      for (const issue of criticalIssues) {
        expect(issue.threshold_warning).toBeDefined();
        expect(issue.threshold_critical).toBeDefined();
        expect(issue.threshold_warning).toBeLessThan(issue.threshold_critical);
      }
      
      // Property: Missing index recommendations should be specific and actionable
      const indexIssues = performanceIssues.filter(m => 
        m.metric_name.includes('missing_index')
      );
      
      for (const issue of indexIssues) {
        expect(issue.query).toContain('Missing index on');
        expect(issue.metric_type).toBe('resource_usage');
        expect(issue.value).toBeGreaterThan(0);
        
        // Should specify table and column
        expect(issue.query).toMatch(/\w+\.\w+/);
      }
      
      // Property: Slow query metrics should reference actual queries
      const slowQueryMetrics = performanceIssues.filter(m => 
        m.metric_type === 'response_time' && m.query && m.query.includes('SELECT')
      );
      
      for (const metric of slowQueryMetrics) {
        expect(metric.query).toMatch(/SELECT|INSERT|UPDATE|DELETE/i);
        expect(metric.unit).toBe('ms');
        expect(metric.value).toBeGreaterThan(0);
        
        // Slow queries should have reasonable thresholds
        if (metric.threshold_warning) {
          expect(metric.threshold_warning).toBeGreaterThan(50);
          expect(metric.threshold_warning).toBeLessThan(1000);
        }
      }
    }
  });

  /**
   * Property: High-frequency operations should have stricter performance thresholds
   */
  it('Should apply stricter thresholds to high-frequency operations', async () => {
    const result = await schemaAnalyzer.performSchemaAnalysis();
    const performanceIssues = result.results.performance_issues as PerformanceMetric[];
    
    // Property: High-frequency patterns should have lower thresholds
    const highFrequencyPatterns = performanceIssues.filter(m => 
      m.query && m.query.includes('high frequency')
    );
    
    for (const metric of highFrequencyPatterns) {
      if (metric.threshold_warning) {
        expect(metric.threshold_warning).toBeLessThanOrEqual(150);
      }
      if (metric.threshold_critical) {
        expect(metric.threshold_critical).toBeLessThanOrEqual(300);
      }
    }
    
    // Property: Dashboard and authentication queries should be fast
    const criticalPatterns = performanceIssues.filter(m => 
      m.query && (
        m.query.includes('dashboard') || 
        m.query.includes('authentication') ||
        m.query.includes('login')
      )
    );
    
    for (const metric of criticalPatterns) {
      if (metric.metric_type === 'response_time') {
        expect(metric.value).toBeLessThan(200); // Should be under 200ms
      }
    }
  });

  /**
   * Property: Index recommendations should consider composite indexes for complex queries
   */
  it('Should recommend composite indexes for complex query patterns', async () => {
    const result = await schemaAnalyzer.performSchemaAnalysis();
    const performanceIssues = result.results.performance_issues as PerformanceMetric[];
    
    // Property: Complex queries should suggest composite indexes
    const complexQueryIssues = performanceIssues.filter(m => 
      m.query && (
        m.query.includes('ORDER BY') ||
        m.query.includes('WHERE') && m.query.includes('AND') ||
        m.query.includes('JOIN')
      )
    );
    
    for (const issue of complexQueryIssues) {
      if (issue.metric_name.includes('missing_index')) {
        // Should suggest specific optimization
        expect(issue.query).toMatch(/(composite|multiple|join)/i);
      }
    }
    
    // Property: Status and date filtering should have composite index recommendations
    const statusDateQueries = performanceIssues.filter(m => 
      m.query && m.query.includes('status') && m.query.includes('created_at')
    );
    
    for (const query of statusDateQueries) {
      // Should recommend composite index
      expect(query.query).toMatch(/(composite|status.*created_at|created_at.*status)/i);
    }
  });

  /**
   * Property: Table maintenance recommendations should be based on table size and activity
   */
  it('Should provide table maintenance recommendations based on usage patterns', async () => {
    const result = await schemaAnalyzer.performSchemaAnalysis();
    const performanceIssues = result.results.performance_issues as PerformanceMetric[];
    
    // Property: Large tables should have maintenance recommendations
    const maintenanceIssues = performanceIssues.filter(m => 
      m.metric_name.includes('maintenance') || m.metric_name.includes('bloat')
    );
    
    for (const issue of maintenanceIssues) {
      expect(issue.metric_type).toBe('resource_usage');
      
      if (issue.metric_name.includes('bloat')) {
        expect(issue.value).toBeGreaterThan(1.0); // Bloat factor > 1
        expect(issue.unit).toBe('bloat_factor');
      }
      
      if (issue.metric_name.includes('maintenance')) {
        expect(issue.value).toBeGreaterThan(1000); // Row count threshold
        expect(issue.unit).toBe('rows');
      }
    }
    
    // Property: High-activity tables should have specific maintenance needs
    const highActivityTables = ['applications', 'audit_logs', 'notifications'];
    const highActivityIssues = maintenanceIssues.filter(m => 
      highActivityTables.some(table => m.metric_name.includes(table))
    );
    
    for (const issue of highActivityIssues) {
      expect(issue.query).toMatch(/(VACUUM|ANALYZE|maintenance)/i);
    }
  });

  /**
   * Property: Query pattern analysis should identify optimization opportunities
   */
  it('Should identify and prioritize query pattern optimization opportunities', async () => {
    const result = await schemaAnalyzer.performSchemaAnalysis();
    const performanceIssues = result.results.performance_issues as PerformanceMetric[];
    
    // Property: Query patterns should be categorized by frequency and performance
    const queryPatterns = performanceIssues.filter(m => 
      m.metric_name.includes('query_pattern')
    );
    
    for (const pattern of queryPatterns) {
      expect(pattern.metric_type).toBe('response_time');
      expect(pattern.query).toMatch(/(high|medium|low) frequency/i);
      
      // High frequency patterns should have stricter thresholds
      if (pattern.query.includes('high frequency')) {
        expect(pattern.threshold_warning).toBeLessThanOrEqual(150);
      }
    }
    
    // Property: Optimization flags should be raised for slow patterns
    const optimizationFlags = performanceIssues.filter(m => 
      m.metric_name.includes('optimization_needed')
    );
    
    for (const flag of optimizationFlags) {
      expect(flag.metric_type).toBe('resource_usage');
      expect(flag.value).toBe(1);
      expect(flag.unit).toMatch(/(flag|recommendation)/);
      expect(flag.query).toMatch(/optimization needed/i);
    }
  });

  /**
   * Property: System-wide performance metrics should provide holistic view
   */
  it('Should provide comprehensive system-wide performance metrics', async () => {
    const result = await schemaAnalyzer.performSchemaAnalysis();
    const performanceIssues = result.results.performance_issues as PerformanceMetric[];
    
    // Property: Should include overall system metrics
    const systemMetrics = performanceIssues.filter(m => 
      m.metric_name.includes('overall') || 
      m.metric_name.includes('system') ||
      m.metric_name.includes('connection_pool')
    );
    
    expect(systemMetrics.length).toBeGreaterThan(0);
    
    for (const metric of systemMetrics) {
      expect(metric.threshold_warning).toBeDefined();
      expect(metric.threshold_critical).toBeDefined();
      
      if (metric.unit === 'percent') {
        expect(metric.value).toBeGreaterThanOrEqual(0);
        expect(metric.value).toBeLessThanOrEqual(100);
      }
    }
    
    // Property: Connection pool metrics should be monitored
    const connectionPoolMetrics = performanceIssues.filter(m => 
      m.metric_name.includes('connection_pool')
    );
    
    for (const metric of connectionPoolMetrics) {
      expect(metric.unit).toBe('percent');
      expect(metric.threshold_warning).toBeLessThan(metric.threshold_critical);
      expect(metric.threshold_critical).toBeLessThanOrEqual(100);
    }
  });

  /**
   * Property: Performance recommendations should be prioritized by impact
   */
  it('Should prioritize performance recommendations by business impact', async () => {
    const result = await schemaAnalyzer.performSchemaAnalysis();
    const performanceIssues = result.results.performance_issues as PerformanceMetric[];
    
    // Property: Critical business operations should be prioritized
    const criticalOperations = performanceIssues.filter(m => 
      m.query && (
        m.query.includes('applications') ||
        m.query.includes('user_profiles') ||
        m.query.includes('authentication') ||
        m.query.includes('dashboard')
      )
    );
    
    for (const operation of criticalOperations) {
      if (operation.metric_name.includes('missing_index')) {
        // Critical operations should have high priority scores
        expect(operation.value).toBeGreaterThanOrEqual(2);
      }
    }
    
    // Property: User-facing operations should have strict performance requirements
    const userFacingOperations = performanceIssues.filter(m => 
      m.query && (
        m.query.includes('dashboard') ||
        m.query.includes('application_history') ||
        m.query.includes('notification')
      )
    );
    
    for (const operation of userFacingOperations) {
      if (operation.metric_type === 'response_time') {
        expect(operation.threshold_critical).toBeLessThanOrEqual(500);
      }
    }
  });

  /**
   * Integration test: Complete performance analysis workflow
   */
  it('Should perform complete performance analysis with comprehensive recommendations', async () => {
    const result = await schemaAnalyzer.performSchemaAnalysis();
    
    // Verify analysis completed successfully
    expect(result.status).toBe('completed');
    expect(result.results.performance_issues).toBeDefined();
    
    const performanceIssues = result.results.performance_issues as PerformanceMetric[];
    
    // Property: Should detect various types of performance issues
    const metricTypes = [...new Set(performanceIssues.map(m => m.metric_type))];
    expect(metricTypes.length).toBeGreaterThan(1);
    expect(metricTypes).toContain('response_time');
    expect(metricTypes).toContain('resource_usage');
    
    // Property: Should provide specific recommendations for each issue
    const recommendationMetrics = performanceIssues.filter(m => 
      m.metric_name.includes('missing_index') || 
      m.metric_name.includes('optimization') ||
      m.metric_name.includes('maintenance')
    );
    
    expect(recommendationMetrics.length).toBeGreaterThan(0);
    
    for (const recommendation of recommendationMetrics) {
      expect(recommendation.query).toBeDefined();
      expect(recommendation.query.length).toBeGreaterThan(10);
    }
    
    // Property: Should categorize issues by severity
    const criticalIssues = performanceIssues.filter(m => 
      m.threshold_critical && m.value > m.threshold_critical
    );
    
    const warningIssues = performanceIssues.filter(m => 
      m.threshold_warning && m.value > m.threshold_warning && 
      (!m.threshold_critical || m.value <= m.threshold_critical)
    );
    
    console.log('✅ Performance analysis completed successfully:', {
      total_metrics: performanceIssues.length,
      critical_issues: criticalIssues.length,
      warning_issues: warningIssues.length,
      missing_indexes: performanceIssues.filter(m => m.metric_name.includes('missing_index')).length,
      slow_queries: performanceIssues.filter(m => m.metric_type === 'response_time').length,
      maintenance_needs: performanceIssues.filter(m => m.metric_name.includes('maintenance')).length
    });
  });
});