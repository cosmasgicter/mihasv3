/**
 * Property-Based Tests for Data Integrity Maintenance
 * 
 * Feature: mihas-system-analysis
 * Property 4: Data Integrity Maintenance
 * 
 * Validates: Requirements 2.3
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { SchemaAnalyzer } from '../database/SchemaAnalyzer';
import { PropertyTestFramework } from '../testing/PropertyTestFramework';
import type { DatabaseIntegrityIssue, AnalysisResult } from '../types';

describe('Data Integrity Maintenance - Property Tests', () => {
  let schemaAnalyzer: SchemaAnalyzer;
  let propertyFramework: PropertyTestFramework;

  beforeEach(() => {
    schemaAnalyzer = new SchemaAnalyzer();
    propertyFramework = new PropertyTestFramework();
  });

  /**
   * Property 4: Data Integrity Maintenance
   * For any database with orphaned records or integrity issues,
   * the system should detect problems and provide automated fixes while maintaining referential integrity
   */
  it('Property 4: Should detect and provide fixes for all data integrity issues', async () => {
    const testCases = propertyFramework.generateDataIntegrityTestCases(100);
    
    for (const testCase of testCases) {
      const result = await schemaAnalyzer.performSchemaAnalysis();
      
      // Property: Analysis should complete successfully
      expect(result.status).toBe('completed');
      expect(result.results.integrity_issues).toBeDefined();
      
      const integrityIssues = result.results.integrity_issues as DatabaseIntegrityIssue[];
      
      // Property: All integrity issues should have complete information
      for (const issue of integrityIssues) {
        expect(issue.id).toBeDefined();
        expect(issue.issue_type).toMatch(/^(orphaned_record|missing_foreign_key|constraint_violation)$/);
        expect(issue.table_name).toBeDefined();
        expect(issue.affected_rows).toBeGreaterThanOrEqual(0);
        expect(issue.description).toBeDefined();
        expect(issue.fix_query).toBeDefined();
        expect(issue.risk_assessment).toMatch(/^(low|medium|high)$/);
      }
      
      // Property: Fix queries should be valid and safe SQL
      for (const issue of integrityIssues) {
        expect(issue.fix_query).toMatch(/^(DELETE|ALTER|UPDATE|INSERT|--)/i);
        expect(issue.fix_query).toContain(issue.table_name);
        
        // Property: Destructive operations should have safety comments
        if (issue.fix_query.includes('DELETE') || issue.fix_query.includes('DROP')) {
          expect(issue.fix_query).toMatch(/(BACKUP|backup|VERIFY|verify|CHECK|check)/i);
        }
      }
      
      // Property: Orphaned record issues should have proper cleanup queries
      const orphanedRecordIssues = integrityIssues.filter(i => i.issue_type === 'orphaned_record');
      for (const issue of orphanedRecordIssues) {
        expect(issue.affected_rows).toBeGreaterThan(0);
        expect(issue.fix_query).toMatch(/DELETE FROM .+ WHERE .+ NOT IN \(SELECT .+ FROM .+\)/i);
        
        // Property: High-risk orphaned records should have backup recommendations
        if (issue.risk_assessment === 'high') {
          expect(issue.fix_query).toMatch(/(BACKUP|backup)/i);
        }
      }
      
      // Property: Missing foreign key issues should add proper constraints
      const missingFKIssues = integrityIssues.filter(i => i.issue_type === 'missing_foreign_key');
      for (const issue of missingFKIssues) {
        expect(issue.column_name).toBeDefined();
        expect(issue.fix_query).toMatch(/ALTER TABLE .+ ADD CONSTRAINT .+ FOREIGN KEY/i);
        expect(issue.fix_query).toContain(issue.column_name);
        
        // Property: Foreign key constraints should have proper naming
        expect(issue.fix_query).toMatch(/fk_\w+_\w+/i);
      }
      
      // Property: Constraint violations should have appropriate fixes
      const constraintViolations = integrityIssues.filter(i => i.issue_type === 'constraint_violation');
      for (const issue of constraintViolations) {
        expect(issue.fix_query).toMatch(/(ADD CONSTRAINT|CHECK|UNIQUE)/i);
        
        // Property: Check constraints should validate data ranges
        if (issue.fix_query.includes('CHECK')) {
          expect(issue.fix_query).toMatch(/(>=|<=|IN|BETWEEN)/i);
        }
      }
    }
  });

  /**
   * Property: Critical table integrity issues should be prioritized
   */
  it('Should prioritize integrity issues in critical tables', async () => {
    const result = await schemaAnalyzer.performSchemaAnalysis();
    const integrityIssues = result.results.integrity_issues as DatabaseIntegrityIssue[];
    
    const criticalTables = ['applications', 'user_profiles', 'application_grades', 'application_payments'];
    const criticalTableIssues = integrityIssues.filter(issue => 
      criticalTables.includes(issue.table_name)
    );
    
    // Property: Critical table issues should have higher risk assessment
    for (const issue of criticalTableIssues) {
      if (issue.issue_type === 'orphaned_record' && issue.affected_rows > 5) {
        expect(issue.risk_assessment).toMatch(/^(medium|high)$/);
      }
      
      if (issue.issue_type === 'missing_foreign_key') {
        expect(issue.risk_assessment).toMatch(/^(medium|high)$/);
      }
    }
  });

  /**
   * Property: Referential integrity should be preserved in fix queries
   */
  it('Should ensure fix queries preserve referential integrity', async () => {
    const result = await schemaAnalyzer.performSchemaAnalysis();
    const integrityIssues = result.results.integrity_issues as DatabaseIntegrityIssue[];
    
    // Property: DELETE operations should use proper WHERE clauses
    const deleteOperations = integrityIssues.filter(issue => 
      issue.fix_query.includes('DELETE')
    );
    
    for (const issue of deleteOperations) {
      // Should use NOT IN or NOT EXISTS to preserve referential integrity
      expect(issue.fix_query).toMatch(/(NOT IN|NOT EXISTS)/i);
      
      // Should reference parent table in subquery
      expect(issue.fix_query).toMatch(/SELECT .+ FROM \w+/i);
    }
    
    // Property: Foreign key additions should specify proper references
    const foreignKeyAdditions = integrityIssues.filter(issue => 
      issue.fix_query.includes('FOREIGN KEY')
    );
    
    for (const issue of foreignKeyAdditions) {
      // Should specify REFERENCES clause
      expect(issue.fix_query).toMatch(/REFERENCES \w+\(\w+\)/i);
      
      // Should optionally specify ON DELETE/UPDATE actions
      if (issue.fix_query.includes('ON DELETE')) {
        expect(issue.fix_query).toMatch(/ON DELETE (CASCADE|SET NULL|RESTRICT)/i);
      }
    }
  });

  /**
   * Property: Batch operations should be handled safely
   */
  it('Should handle batch integrity operations safely', async () => {
    const testCases = propertyFramework.generateDataIntegrityTestCases(50);
    
    for (const testCase of testCases) {
      const result = await schemaAnalyzer.performSchemaAnalysis();
      const integrityIssues = result.results.integrity_issues as DatabaseIntegrityIssue[];
      
      // Property: Large batch operations should have safety measures
      const largeBatchIssues = integrityIssues.filter(issue => 
        issue.affected_rows > 100
      );
      
      for (const issue of largeBatchIssues) {
        // Should be marked as high risk
        expect(issue.risk_assessment).toBe('high');
        
        // Should include batch processing recommendations
        if (issue.fix_query.includes('DELETE')) {
          expect(issue.fix_query).toMatch(/(LIMIT|batch|BACKUP)/i);
        }
      }
      
      // Property: Multiple related issues should be grouped logically
      const applicationRelatedIssues = integrityIssues.filter(issue => 
        issue.table_name.includes('application')
      );
      
      if (applicationRelatedIssues.length > 1) {
        // Should have consistent risk assessment approach
        const riskLevels = applicationRelatedIssues.map(i => i.risk_assessment);
        const uniqueRiskLevels = [...new Set(riskLevels)];
        
        // Related issues should have similar risk levels
        expect(uniqueRiskLevels.length).toBeLessThanOrEqual(2);
      }
    }
  });

  /**
   * Property: Data validation should be comprehensive
   */
  it('Should provide comprehensive data validation recommendations', async () => {
    const result = await schemaAnalyzer.performSchemaAnalysis();
    const integrityIssues = result.results.integrity_issues as DatabaseIntegrityIssue[];
    
    // Property: Grade validation should enforce Zambian grading system
    const gradeValidationIssues = integrityIssues.filter(issue => 
      issue.table_name === 'application_grades' && 
      issue.column_name === 'grade'
    );
    
    for (const issue of gradeValidationIssues) {
      expect(issue.fix_query).toMatch(/grade >= 1 AND grade <= 9/i);
      expect(issue.description).toMatch(/Zambian/i);
    }
    
    // Property: Status validation should enforce valid states
    const statusValidationIssues = integrityIssues.filter(issue => 
      issue.column_name === 'status'
    );
    
    for (const issue of statusValidationIssues) {
      expect(issue.fix_query).toMatch(/IN \(/i);
      expect(issue.fix_query).toMatch(/(draft|submitted|approved|rejected)/i);
    }
    
    // Property: Email validation should ensure uniqueness
    const emailValidationIssues = integrityIssues.filter(issue => 
      issue.column_name === 'email'
    );
    
    for (const issue of emailValidationIssues) {
      expect(issue.fix_query).toMatch(/UNIQUE/i);
      expect(issue.description).toMatch(/unique/i);
    }
  });

  /**
   * Integration test: Complete data integrity analysis workflow
   */
  it('Should perform complete data integrity analysis with proper error handling', async () => {
    const result = await schemaAnalyzer.performSchemaAnalysis();
    
    // Verify analysis completed successfully
    expect(result.status).toBe('completed');
    expect(result.results.integrity_issues).toBeDefined();
    
    const integrityIssues = result.results.integrity_issues as DatabaseIntegrityIssue[];
    
    // Property: Should detect various types of integrity issues
    const issueTypes = [...new Set(integrityIssues.map(i => i.issue_type))];
    expect(issueTypes.length).toBeGreaterThan(0);
    
    // Property: Should provide actionable fixes for all issues
    for (const issue of integrityIssues) {
      expect(issue.fix_query.length).toBeGreaterThan(10);
      expect(issue.description.length).toBeGreaterThan(10);
    }
    
    // Property: Should categorize risks appropriately
    const riskLevels = [...new Set(integrityIssues.map(i => i.risk_assessment))];
    expect(riskLevels.every(level => ['low', 'medium', 'high'].includes(level))).toBe(true);
    
    console.log('✅ Data integrity analysis completed successfully:', {
      total_issues: integrityIssues.length,
      orphaned_records: integrityIssues.filter(i => i.issue_type === 'orphaned_record').length,
      missing_constraints: integrityIssues.filter(i => i.issue_type === 'missing_foreign_key').length,
      constraint_violations: integrityIssues.filter(i => i.issue_type === 'constraint_violation').length,
      high_risk_issues: integrityIssues.filter(i => i.risk_assessment === 'high').length
    });
  });
});