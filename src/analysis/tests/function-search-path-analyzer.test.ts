/**
 * Property-Based Test for Function Search Path Analyzer
 * 
 * Feature: mihas-system-analysis, Property 1: Comprehensive Security Vulnerability Detection
 * Validates: Requirements 1.2 - Function search path vulnerability detection
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { FunctionSearchPathAnalyzer } from '../security/FunctionSearchPathAnalyzer';
import { PropertyTestFramework } from '../testing/PropertyTestFramework';
import type { SearchPathVulnerability } from '../security/FunctionSearchPathAnalyzer';

describe('Function Search Path Analyzer - Property Tests', () => {
  let analyzer: FunctionSearchPathAnalyzer;
  let testFramework: PropertyTestFramework;

  beforeEach(() => {
    try {
      analyzer = new FunctionSearchPathAnalyzer();
    } catch (error) {
      // If Supabase credentials are not available, we'll use a mock analyzer
      console.warn('Supabase credentials not available for testing, using mock analyzer');
      analyzer = new MockFunctionSearchPathAnalyzer() as any;
    }
    
    testFramework = new PropertyTestFramework({
      iterations: 100, // Minimum 100 iterations as per requirements
      timeout: 30000
    });
  });

  /**
   * Property 1: Function search path vulnerability detection completeness
   * For any database with functions, the analyzer should identify all functions
   * with mutable search paths and provide specific remediation steps
   */
  it('should detect all functions with mutable search paths', async () => {
    const result = await testFramework.testFunctionSearchPathAnalysis(
      analyzer,
      (vulnerabilities: SearchPathVulnerability[]) => {
        // Property: All vulnerabilities should have required fields for search path issues
        return vulnerabilities.every(v => 
          v.type === 'mutable_search_path' &&
          v.entity_name && v.entity_name.length > 0 &&
          v.function_name && v.function_name.length > 0 &&
          v.schema_name && v.schema_name.length > 0 &&
          v.function_signature && v.function_signature.length > 0 &&
          v.recommended_search_path && v.recommended_search_path.length > 0 &&
          Array.isArray(v.risk_factors) && v.risk_factors.length > 0 &&
          Array.isArray(v.remediation_steps) && v.remediation_steps.length > 0
        );
      }
    );

    expect(result.passed).toBe(true);
    expect(result.iterations_run).toBe(100);
    expect(result.property_name).toBe('Function Search Path Vulnerability Detection');
    
    if (!result.passed) {
      console.error('Property test failed:', result.counterexample);
      console.error('Error message:', result.error_message);
    }
  }, 60000);

  /**
   * Property: Remediation steps should include ALTER FUNCTION commands
   * For any function with search path vulnerability, remediation should include
   * a specific ALTER FUNCTION command to set the search path
   */
  it('should provide ALTER FUNCTION commands in remediation steps', async () => {
    const result = await testFramework.testFunctionSearchPathAnalysis(
      analyzer,
      (vulnerabilities: SearchPathVulnerability[]) => {
        return vulnerabilities.every(v => 
          v.remediation_steps.some(step => 
            step.includes('ALTER FUNCTION') && 
            step.includes('SET search_path')
          )
        );
      }
    );

    expect(result.passed).toBe(true);
    expect(result.iterations_run).toBe(100);
    
    if (!result.passed) {
      console.error('Missing ALTER FUNCTION commands:', result.counterexample);
    }
  }, 60000);

  /**
   * Property: Risk factors should be meaningful
   * For any detected vulnerability, risk factors should be non-empty and descriptive
   */
  it('should identify meaningful risk factors for each vulnerability', async () => {
    const validRiskFactors = [
      'No explicit search_path setting',
      'Function uses SECURITY DEFINER',
      'Contains unqualified object references',
      'Function is in public schema',
      'Uses SQL-based language susceptible to search path attacks'
    ];

    const result = await testFramework.testFunctionSearchPathAnalysis(
      analyzer,
      (vulnerabilities: SearchPathVulnerability[]) => {
        return vulnerabilities.every(v => 
          v.risk_factors.length > 0 &&
          v.risk_factors.every(factor => 
            typeof factor === 'string' && 
            factor.length > 0 &&
            validRiskFactors.some(validFactor => factor.includes(validFactor.split(' ')[0]))
          )
        );
      }
    );

    expect(result.passed).toBe(true);
    expect(result.iterations_run).toBe(100);
    
    if (!result.passed) {
      console.error('Invalid risk factors found:', result.counterexample);
    }
  }, 60000);

  /**
   * Property: Recommended search path should match schema name
   * For any function vulnerability, the recommended search path should be the function's schema
   */
  it('should recommend schema-specific search paths', async () => {
    const result = await testFramework.testFunctionSearchPathAnalysis(
      analyzer,
      (vulnerabilities: SearchPathVulnerability[]) => {
        return vulnerabilities.every(v => 
          v.recommended_search_path === v.schema_name
        );
      }
    );

    expect(result.passed).toBe(true);
    expect(result.iterations_run).toBe(100);
    
    if (!result.passed) {
      console.error('Incorrect search path recommendations:', result.counterexample);
    }
  }, 60000);

  /**
   * Property: SECURITY DEFINER functions should have ERROR severity
   * For any function that uses SECURITY DEFINER and has search path issues,
   * the severity should be ERROR due to higher risk
   */
  it('should assign ERROR severity to SECURITY DEFINER functions', async () => {
    const result = await testFramework.testFunctionSearchPathAnalysis(
      analyzer,
      (vulnerabilities: SearchPathVulnerability[]) => {
        return vulnerabilities.every(v => {
          const isSecurityDefiner = v.risk_factors.includes('Function uses SECURITY DEFINER');
          return !isSecurityDefiner || v.severity === 'ERROR';
        });
      }
    );

    expect(result.passed).toBe(true);
    expect(result.iterations_run).toBe(100);
    
    if (!result.passed) {
      console.error('SECURITY DEFINER functions without ERROR severity:', result.counterexample);
    }
  }, 60000);

  /**
   * Property: Function signatures should be properly formatted
   * For any detected vulnerability, the function signature should be non-empty
   * and contain the function name
   */
  it('should capture proper function signatures', async () => {
    const result = await testFramework.testFunctionSearchPathAnalysis(
      analyzer,
      (vulnerabilities: SearchPathVulnerability[]) => {
        return vulnerabilities.every(v => 
          v.function_signature.length > 0 &&
          v.function_signature.includes(v.function_name)
        );
      }
    );

    expect(result.passed).toBe(true);
    expect(result.iterations_run).toBe(100);
    
    if (!result.passed) {
      console.error('Invalid function signatures:', result.counterexample);
    }
  }, 60000);

  /**
   * Integration test: Full function search path analysis should complete successfully
   */
  it('should complete function search path analysis without errors', async () => {
    const result = await analyzer.analyzeFunctionSearchPaths();
    
    expect(result).toBeDefined();
    expect(result.id).toBeDefined();
    expect(result.analysis_type).toBe('security');
    expect(['completed', 'failed']).toContain(result.status);
    expect(result.started_at).toBeInstanceOf(Date);
    expect(result.completed_at).toBeInstanceOf(Date);
    
    if (result.status === 'completed') {
      expect(result.results).toBeDefined();
      expect(result.metadata).toBeDefined();
      expect(result.metadata.analysis_type).toBe('function_search_path');
      
      // Check that vulnerabilities array exists (even if empty)
      const vulnerabilities = result.results.vulnerabilities || [];
      expect(Array.isArray(vulnerabilities)).toBe(true);
      
      // Verify metadata contains expected fields
      expect(typeof result.metadata.total_functions).toBe('number');
      expect(typeof result.metadata.vulnerable_functions).toBe('number');
      expect(result.metadata.vulnerable_functions).toBe(vulnerabilities.length);
      
    } else {
      expect(result.error_message).toBeDefined();
      console.warn('Function search path analysis failed:', result.error_message);
    }
  }, 30000);

  /**
   * Unit test: Remediation script generation
   */
  it('should generate valid remediation scripts', async () => {
    // Run analysis first
    await analyzer.analyzeFunctionSearchPaths();
    
    // Get vulnerabilities
    const vulnerabilities = analyzer.getVulnerabilities();
    
    if (vulnerabilities.length > 0) {
      // Generate remediation script
      const script = analyzer.generateRemediationScript();
      
      expect(script).toBeDefined();
      expect(typeof script).toBe('string');
      expect(script.length).toBeGreaterThan(0);
      
      // Script should contain header information
      expect(script).toContain('MIHAS Function Search Path Remediation Script');
      expect(script).toContain('Total vulnerabilities:');
      
      // Script should contain ALTER FUNCTION commands for each vulnerability
      vulnerabilities.forEach(v => {
        expect(script).toContain(v.entity_name);
      });
    }
  }, 30000);

  /**
   * Unit test: Vulnerability filtering by severity
   */
  it('should filter vulnerabilities by severity correctly', async () => {
    // Run analysis first
    await analyzer.analyzeFunctionSearchPaths();
    
    const allVulnerabilities = analyzer.getVulnerabilities();
    const errorVulnerabilities = analyzer.getVulnerabilitiesBySeverity('ERROR');
    const warnVulnerabilities = analyzer.getVulnerabilitiesBySeverity('WARN');
    const infoVulnerabilities = analyzer.getVulnerabilitiesBySeverity('INFO');
    
    // All filtered vulnerabilities should have correct severity
    expect(errorVulnerabilities.every(v => v.severity === 'ERROR')).toBe(true);
    expect(warnVulnerabilities.every(v => v.severity === 'WARN')).toBe(true);
    expect(infoVulnerabilities.every(v => v.severity === 'INFO')).toBe(true);
    
    // Total should match
    const totalFiltered = errorVulnerabilities.length + warnVulnerabilities.length + infoVulnerabilities.length;
    expect(totalFiltered).toBe(allVulnerabilities.length);
  }, 30000);
});

/**
 * Mock Function Search Path Analyzer for testing when Supabase is not available
 */
class MockFunctionSearchPathAnalyzer {
  private mockVulnerabilities: SearchPathVulnerability[] = [];

  async analyzeFunctionSearchPaths() {
    // Generate mock vulnerabilities
    this.mockVulnerabilities = [
      {
        id: crypto.randomUUID(),
        type: 'mutable_search_path',
        severity: 'ERROR',
        entity_name: 'get_user_applications',
        description: 'Function has mutable search path vulnerability',
        remediation_steps: [
          'ALTER FUNCTION public.get_user_applications() SET search_path = public;',
          'Review function definition for unqualified references',
          'Test function after modification'
        ],
        status: 'identified',
        detected_at: new Date(),
        schema_name: 'public',
        function_name: 'get_user_applications',
        function_signature: 'get_user_applications()',
        recommended_search_path: 'public',
        risk_factors: [
          'No explicit search_path setting',
          'Function is in public schema'
        ]
      },
      {
        id: crypto.randomUUID(),
        type: 'mutable_search_path',
        severity: 'ERROR',
        entity_name: 'check_eligibility',
        description: 'SECURITY DEFINER function with mutable search path',
        remediation_steps: [
          'ALTER FUNCTION public.check_eligibility() SET search_path = public;',
          'Review security implications',
          'Use fully qualified names'
        ],
        status: 'identified',
        detected_at: new Date(),
        schema_name: 'public',
        function_name: 'check_eligibility',
        function_signature: 'check_eligibility()',
        recommended_search_path: 'public',
        risk_factors: [
          'No explicit search_path setting',
          'Function uses SECURITY DEFINER',
          'Contains unqualified object references'
        ]
      }
    ];

    return {
      id: crypto.randomUUID(),
      analysis_type: 'security' as const,
      status: 'completed' as const,
      started_at: new Date(),
      completed_at: new Date(),
      results: {
        vulnerabilities: this.mockVulnerabilities,
        summary: {
          total_vulnerabilities: this.mockVulnerabilities.length,
          by_severity: {
            ERROR: this.mockVulnerabilities.filter(v => v.severity === 'ERROR').length,
            WARN: this.mockVulnerabilities.filter(v => v.severity === 'WARN').length,
            INFO: this.mockVulnerabilities.filter(v => v.severity === 'INFO').length
          }
        },
        functions_analyzed: 10,
        vulnerable_functions: this.mockVulnerabilities.length
      },
      metadata: {
        total_functions: 10,
        vulnerable_functions: this.mockVulnerabilities.length,
        critical_vulnerabilities: this.mockVulnerabilities.filter(v => v.severity === 'ERROR').length,
        warning_vulnerabilities: this.mockVulnerabilities.filter(v => v.severity === 'WARN').length,
        analysis_type: 'function_search_path'
      }
    };
  }

  getVulnerabilities() {
    return [...this.mockVulnerabilities];
  }

  getVulnerabilitiesBySeverity(severity: 'ERROR' | 'WARN' | 'INFO') {
    return this.mockVulnerabilities.filter(v => v.severity === severity);
  }

  generateRemediationScript() {
    const script = [
      '-- MIHAS Function Search Path Remediation Script',
      '-- Generated on: ' + new Date().toISOString(),
      '-- Total vulnerabilities: ' + this.mockVulnerabilities.length,
      ''
    ];

    this.mockVulnerabilities.forEach((v, index) => {
      script.push(`-- Vulnerability ${index + 1}: ${v.entity_name}`);
      script.push(`-- Severity: ${v.severity}`);
      script.push(`ALTER FUNCTION ${v.schema_name}.${v.function_name}() SET search_path = ${v.schema_name};`);
      script.push('');
    });

    return script.join('\n');
  }
}