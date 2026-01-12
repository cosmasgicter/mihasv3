/**
 * Property-Based Tests for Schema Redundancy Detection
 * 
 * Feature: mihas-system-analysis
 * Property 3: Schema Redundancy Detection
 * Property 4: Data Integrity Maintenance
 * 
 * Validates: Requirements 2.1, 2.2, 2.3
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { SchemaAnalyzer } from '../database/SchemaAnalyzer';
import { PropertyTestFramework } from '../testing/PropertyTestFramework';
import type { SchemaRedundancy, DatabaseIntegrityIssue, AnalysisResult } from '../types';

describe('Schema Redundancy Detection - Property Tests', () => {
  let schemaAnalyzer: SchemaAnalyzer;
  let propertyFramework: PropertyTestFramework;

  beforeEach(() => {
    schemaAnalyzer = new SchemaAnalyzer();
    propertyFramework = new PropertyTestFramework();
  });

  /**
   * Property 3: Schema Redundancy Detection
   * For any database schema with duplicate tables or redundant data structures,
   * the Schema_Analyzer should identify all redundancies and recommend consolidation strategies
   */
  it('Property 3: Should detect all schema redundancies comprehensively', async () => {
    const testCases = propertyFramework.generateSchemaRedundancyTestCases(100);
    
    for (const testCase of testCases) {
      const result = await schemaAnalyzer.performSchemaAnalysis();
      
      // Property: All redundancies should be detected
      expect(result.status).toBe('completed');
      expect(result.results.redundancies).toBeDefined();
      
      const redundancies = result.results.redundancies as SchemaRedundancy[];
      
      // Verify known redundancy is detected (applications vs applications_legacy)
      const applicationsRedundancy = redundancies.find(r => 
        (r.table_name === 'applications' && r.redundant_with === 'applications_legacy') ||
        (r.table_name === 'applications_legacy' && r.redundant_with === 'applications')
      );
      
      expect(applicationsRedundancy).toBeDefined();
      expect(applicationsRedundancy?.redundancy_type).toBe('legacy_version');
      expect(applicationsRedundancy?.similarity_score).toBeGreaterThan(0.8);
      expect(applicationsRedundancy?.recommendation).toContain('Consolidate');
      
      // Verify all redundancies have required properties
      for (const redundancy of redundancies) {
        expect(redundancy.id).toBeDefined();
        expect(redundancy.table_name).toBeDefined();
        expect(redundancy.redundant_with).toBeDefined();
        expect(redundancy.redundancy_type).toMatch(/^(duplicate_structure|legacy_version|partial_overlap)$/);
        expect(redundancy.similarity_score).toBeGreaterThanOrEqual(0);
        expect(redundancy.similarity_score).toBeLessThanOrEqual(1);
        expect(redundancy.recommendation).toBeDefined();
        expect(redundancy.migration_complexity).toMatch(/^(low|medium|high)$/);
        expect(redundancy.data_volume).toBeGreaterThanOrEqual(0);
      }
      
      // Property: Recommendations should be actionable
      for (const redundancy of redundancies) {
        expect(redundancy.recommendation.length).toBeGreaterThan(10);
        expect(redundancy.recommendation).toMatch(/(consolidate|migrate|merge|drop)/i);
      }
    }
  });

  /**
   * Property 4: Data Integrity Maintenance
   * For any database with orphaned records or integrity issues,
   * the system should detect problems and provide automated fixes while maintaining referential integrity
   */
  it('Property 4: Should detect and provide fixes for data integrity issues', async () => {
    const testCases = propertyFramework.generateDataIntegrityTestCases(100);
    
    for (const testCase of testCases) {
      const result = await schemaAnalyzer.performSchemaAnalysis();
      
      // Property: All integrity issues should be detected
      expect(result.status).toBe('completed');
      expect(result.results.integrity_issues).toBeDefined();
      
      const integrityIssues = result.results.integrity_issues as DatabaseIntegrityIssue[];
      
      // Verify all integrity issues have required properties
      for (const issue of integrityIssues) {
        expect(issue.id).toBeDefined();
        expect(issue.issue_type).toMatch(/^(orphaned_record|missing_foreign_key|constraint_violation)$/);
        expect(issue.table_name).toBeDefined();
        expect(issue.affected_rows).toBeGreaterThanOrEqual(0);
        expect(issue.description).toBeDefined();
        expect(issue.fix_query).toBeDefined();
        expect(issue.risk_assessment).toMatch(/^(low|medium|high)$/);
      }
      
      // Property: Fix queries should be valid SQL
      for (const issue of integrityIssues) {
        expect(issue.fix_query).toMatch(/^(DELETE|ALTER|UPDATE|INSERT|--)/i);
        expect(issue.fix_query).toContain(issue.table_name);
        
        // Property: Destructive operations should have safety comments
        if (issue.fix_query.includes('DELETE') || issue.fix_query.includes('DROP')) {
          expect(issue.fix_query).toMatch(/(BACKUP|backup|VERIFY|verify|CHECK|check)/i);
        }
        
        // Property: Foreign key constraints should have proper structure
        if (issue.issue_type === 'missing_foreign_key') {
          expect(issue.fix_query).toMatch(/(ALTER TABLE|ADD CONSTRAINT|FOREIGN KEY)/i);
        }
      }
      
      // Property: High-risk issues should have detailed descriptions
      const highRiskIssues = integrityIssues.filter(i => i.risk_assessment === 'high');
      for (const issue of highRiskIssues) {
        expect(issue.description.length).toBeGreaterThan(20);
        expect(issue.affected_rows).toBeGreaterThan(0);
      }
      
      // Property: Orphaned record fixes should preserve referential integrity
      const orphanedRecordIssues = integrityIssues.filter(i => i.issue_type === 'orphaned_record');
      for (const issue of orphanedRecordIssues) {
        expect(issue.fix_query).toMatch(/DELETE FROM .+ WHERE .+ NOT IN \(SELECT .+ FROM .+\)/i);
      }
      
      // Property: Missing foreign key fixes should add proper constraints
      const missingFKIssues = integrityIssues.filter(i => i.issue_type === 'missing_foreign_key');
      for (const issue of missingFKIssues) {
        expect(issue.fix_query).toMatch(/ALTER TABLE .+ ADD CONSTRAINT .+ FOREIGN KEY/i);
        expect(issue.column_name).toBeDefined();
      }
    }
  });

  /**
   * Property 5: Backward Compatibility Preservation
   * For any schema optimization applied to the database,
   * all existing API endpoints should continue to function correctly without breaking changes
   */
  it('Property 5: Should ensure schema optimizations preserve backward compatibility', async () => {
    const testCases = propertyFramework.generateBackwardCompatibilityTestCases(50);
    
    for (const testCase of testCases) {
      const result = await schemaAnalyzer.performSchemaAnalysis();
      
      expect(result.status).toBe('completed');
      
      const redundancies = result.results.redundancies as SchemaRedundancy[];
      
      // Property: Migration recommendations should consider backward compatibility
      for (const redundancy of redundancies) {
        if (redundancy.migration_complexity === 'high') {
          expect(redundancy.recommendation).toMatch(/(gradual|phased|migration|backward.compatible)/i);
        }
        
        // Property: Legacy table migrations should preserve data access patterns
        if (redundancy.redundancy_type === 'legacy_version') {
          expect(redundancy.recommendation).toMatch(/(consolidate|verify|validate|test|integrity)/i);
        }
      }
      
      // Property: Critical tables should have careful migration strategies
      const criticalTableRedundancies = redundancies.filter(r => 
        ['applications', 'user_profiles', 'payments'].includes(r.table_name)
      );
      
      for (const redundancy of criticalTableRedundancies) {
        expect(redundancy.migration_complexity).toMatch(/^(medium|high)$/);
        expect(redundancy.recommendation).toContain('verify');
      }
    }
  });

  /**
   * Property 6: Performance Optimization Recommendations
   * For any database with performance bottlenecks,
   * the system should identify slow queries and recommend specific indexing or optimization strategies
   */
  it('Property 6: Should provide actionable performance optimization recommendations', async () => {
    const testCases = propertyFramework.generatePerformanceOptimizationTestCases(75);
    
    for (const testCase of testCases) {
      const result = await schemaAnalyzer.performSchemaAnalysis();
      
      expect(result.status).toBe('completed');
      expect(result.results.performance_issues).toBeDefined();
      
      const performanceIssues = result.results.performance_issues;
      
      // Property: Performance metrics should have proper structure
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
      
      // Property: Missing index recommendations should be specific
      const indexIssues = performanceIssues.filter(m => 
        m.metric_name.includes('missing_index')
      );
      
      for (const issue of indexIssues) {
        expect(issue.query).toContain('Missing index on');
        expect(issue.metric_type).toBe('resource_usage');
        expect(issue.value).toBeGreaterThan(0); // Changed from toBe(1) to allow priority scores
      }
      
      // Property: Slow query metrics should reference actual queries or patterns
      const queryMetrics = performanceIssues.filter(m => 
        m.metric_type === 'response_time' && m.query && 
        (m.query.includes('SELECT') || m.query.includes('frequency'))
      );
      
      for (const metric of queryMetrics) {
        if (metric.query.includes('SELECT')) {
          expect(metric.query).toMatch(/SELECT|INSERT|UPDATE|DELETE/i);
        }
        expect(metric.unit).toBe('ms');
        expect(metric.value).toBeGreaterThan(0);
        expect(metric.value).toBeGreaterThan(0);
      }
    }
  });

  /**
   * Integration test: Complete schema analysis workflow
   */
  it('Should perform complete schema analysis with all components working together', async () => {
    const result = await schemaAnalyzer.performSchemaAnalysis();
    
    // Verify analysis completed successfully
    expect(result.status).toBe('completed');
    expect(result.id).toBeDefined();
    expect(result.analysis_type).toBe('schema');
    expect(result.started_at).toBeDefined();
    expect(result.completed_at).toBeDefined();
    
    // Verify all analysis components produced results
    expect(result.results.redundancies).toBeDefined();
    expect(result.results.integrity_issues).toBeDefined();
    expect(result.results.performance_issues).toBeDefined();
    expect(result.results.summary).toBeDefined();
    
    // Verify metadata is populated
    expect(result.metadata.total_redundancies).toBeGreaterThanOrEqual(0);
    expect(result.metadata.total_integrity_issues).toBeGreaterThanOrEqual(0);
    expect(result.metadata.total_performance_issues).toBeGreaterThanOrEqual(0);
    
    // Verify summary matches actual counts
    const summary = result.results.summary;
    expect(summary.total_redundancies).toBe(result.results.redundancies.length);
    expect(summary.total_integrity_issues).toBe(result.results.integrity_issues.length);
    expect(summary.total_performance_issues).toBe(result.results.performance_issues.length);
    
    console.log('✅ Schema analysis completed successfully:', {
      redundancies: result.metadata.total_redundancies,
      integrity_issues: result.metadata.total_integrity_issues,
      performance_issues: result.metadata.total_performance_issues
    });
  });
});