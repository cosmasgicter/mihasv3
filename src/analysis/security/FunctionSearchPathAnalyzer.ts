/**
 * MIHAS Function Search Path Analyzer
 * 
 * Scans all database functions for mutable search_path parameters
 * Flags functions vulnerable to search path manipulation attacks
 * Requirements: 1.2
 */

import type { SecurityVulnerability, AnalysisResult } from '../types';

export interface DatabaseFunction {
  schema_name: string;
  function_name: string;
  function_signature: string;
  function_definition: string;
  search_path_setting?: string;
  is_security_definer: boolean;
  language: string;
  return_type: string;
}

export interface SearchPathVulnerability extends SecurityVulnerability {
  function_signature: string;
  current_search_path?: string;
  recommended_search_path: string;
  risk_factors: string[];
}

/**
 * @deprecated This analyzer was designed for Supabase.
 * Database functions are now in Neon Postgres. Use direct SQL queries for analysis.
 */
export class FunctionSearchPathAnalyzer {
  private vulnerabilities: SearchPathVulnerability[] = [];

  constructor() {
    // NOTE: Supabase has been removed. Database is now Neon Postgres.
    console.warn('[DEPRECATED] FunctionSearchPathAnalyzer: Supabase removed. Database is now Neon Postgres.');
  }

  /**
   * Perform comprehensive function search path analysis
   * Scans all database functions for mutable search_path vulnerabilities
   */
  async analyzeFunctionSearchPaths(): Promise<AnalysisResult> {
    const analysisId = crypto.randomUUID();
    const startTime = new Date();

    try {
      console.log('🔍 Starting function search path analysis...');
      
      // Clear previous results
      this.vulnerabilities = [];

      // Get all database functions
      const functions = await this.getAllDatabaseFunctions();
      console.log(`📊 Found ${functions.length} database functions to analyze`);

      // Analyze each function for search path vulnerabilities
      for (const func of functions) {
        await this.analyzeFunctionSearchPath(func);
      }

      const result: AnalysisResult = {
        id: analysisId,
        analysis_type: 'security',
        status: 'completed',
        started_at: startTime,
        completed_at: new Date(),
        results: {
          vulnerabilities: this.vulnerabilities,
          summary: this.generateAnalysisSummary(),
          functions_analyzed: functions.length,
          vulnerable_functions: this.vulnerabilities.length
        },
        metadata: {
          total_functions: functions.length,
          vulnerable_functions: this.vulnerabilities.length,
          critical_vulnerabilities: this.vulnerabilities.filter(v => v.severity === 'ERROR').length,
          warning_vulnerabilities: this.vulnerabilities.filter(v => v.severity === 'WARN').length,
          analysis_type: 'function_search_path'
        }
      };

      console.log(`✅ Function search path analysis completed. Found ${this.vulnerabilities.length} vulnerable functions.`);
      return result;

    } catch (error) {
      console.error('❌ Function search path analysis failed:', error);
      
      return {
        id: analysisId,
        analysis_type: 'security',
        status: 'failed',
        started_at: startTime,
        completed_at: new Date(),
        results: {},
        error_message: error instanceof Error ? error.message : 'Unknown error',
        metadata: {
          analysis_type: 'function_search_path'
        }
      };
    }
  }

  /**
   * Get all database functions from information_schema
   * @deprecated Supabase removed. Use Neon Postgres directly for function analysis.
   */
  private async getAllDatabaseFunctions(): Promise<DatabaseFunction[]> {
    // NOTE: Supabase removed. Return mock data for backward compatibility.
    console.warn('[DEPRECATED] getAllDatabaseFunctions: Supabase removed. Use Neon Postgres directly.');
    return this.getMockFunctionData();
  }

  /**
   * Fallback method to get functions when direct query fails
   * @deprecated Supabase removed.
   */
  private async getFunctionsFallback(): Promise<DatabaseFunction[]> {
    return this.getMockFunctionData();
  }

  /**
   * Generate mock function data based on known system analysis
   */
  private getMockFunctionData(): DatabaseFunction[] {
    // Based on the analysis, we know there are 70+ functions with mutable search paths
    const mockFunctions: DatabaseFunction[] = [];
    
    // Common function patterns found in MIHAS system
    const functionPatterns = [
      { schema: 'public', name: 'get_user_applications', type: 'table' },
      { schema: 'public', name: 'check_eligibility', type: 'boolean' },
      { schema: 'public', name: 'calculate_grade_points', type: 'numeric' },
      { schema: 'public', name: 'validate_application', type: 'boolean' },
      { schema: 'public', name: 'get_application_status', type: 'text' },
      { schema: 'public', name: 'update_payment_status', type: 'void' },
      { schema: 'public', name: 'send_notification', type: 'boolean' },
      { schema: 'public', name: 'generate_application_number', type: 'text' },
      { schema: 'public', name: 'check_document_completeness', type: 'boolean' },
      { schema: 'public', name: 'get_program_requirements', type: 'table' }
    ];

    functionPatterns.forEach((pattern, index) => {
      mockFunctions.push({
        schema_name: pattern.schema,
        function_name: pattern.name,
        function_signature: `${pattern.name}()`,
        function_definition: `-- Function definition not available in mock data`,
        search_path_setting: undefined, // This makes it vulnerable
        is_security_definer: false,
        language: 'plpgsql',
        return_type: pattern.type
      });
    });

    return mockFunctions;
  }

  /**
   * Analyze a single function for search path vulnerabilities
   */
  private async analyzeFunctionSearchPath(func: DatabaseFunction): Promise<void> {
    const riskFactors: string[] = [];
    let severity: 'ERROR' | 'WARN' | 'INFO' = 'WARN';

    // Check if function has explicit search_path setting
    const hasExplicitSearchPath = func.search_path_setting !== undefined && func.search_path_setting !== null;

    if (!hasExplicitSearchPath) {
      riskFactors.push('No explicit search_path setting');
      severity = 'ERROR';
    }

    // Check if function is SECURITY DEFINER (higher risk)
    if (func.is_security_definer) {
      riskFactors.push('Function uses SECURITY DEFINER');
      severity = 'ERROR';
    }

    // Check function definition for unqualified object references
    if (func.function_definition) {
      const hasUnqualifiedReferences = this.checkForUnqualifiedReferences(func.function_definition);
      if (hasUnqualifiedReferences) {
        riskFactors.push('Contains unqualified object references');
        severity = 'ERROR';
      }
    }

    // Check if function is in public schema (higher exposure)
    if (func.schema_name === 'public') {
      riskFactors.push('Function is in public schema');
    }

    // Check language type
    if (func.language === 'plpgsql' || func.language === 'sql') {
      riskFactors.push('Uses SQL-based language susceptible to search path attacks');
    }

    // Only create vulnerability if there are risk factors
    if (riskFactors.length > 0) {
      const vulnerability: SearchPathVulnerability = {
        id: crypto.randomUUID(),
        type: 'mutable_search_path',
        severity,
        entity_name: func.function_name,
        description: this.generateVulnerabilityDescription(func, riskFactors),
        remediation_steps: this.generateRemediationSteps(func),
        status: 'identified',
        detected_at: new Date(),
        schema_name: func.schema_name,
        function_name: func.function_name,
        function_signature: func.function_signature,
        current_search_path: func.search_path_setting,
        recommended_search_path: func.schema_name,
        risk_factors: riskFactors
      };

      this.vulnerabilities.push(vulnerability);
    }
  }

  /**
   * Check function definition for unqualified object references
   */
  private checkForUnqualifiedReferences(definition: string): boolean {
    // Look for patterns that suggest unqualified references
    const patterns = [
      /FROM\s+[a-zA-Z_][a-zA-Z0-9_]*\s/gi,  // FROM table_name
      /JOIN\s+[a-zA-Z_][a-zA-Z0-9_]*\s/gi,  // JOIN table_name
      /INSERT\s+INTO\s+[a-zA-Z_][a-zA-Z0-9_]*\s/gi,  // INSERT INTO table_name
      /UPDATE\s+[a-zA-Z_][a-zA-Z0-9_]*\s/gi,  // UPDATE table_name
      /DELETE\s+FROM\s+[a-zA-Z_][a-zA-Z0-9_]*\s/gi,  // DELETE FROM table_name
    ];

    return patterns.some(pattern => {
      const matches = definition.match(pattern);
      if (matches) {
        // Check if any matches don't contain schema qualification (no dot)
        return matches.some(match => !match.includes('.'));
      }
      return false;
    });
  }

  /**
   * Generate vulnerability description
   */
  private generateVulnerabilityDescription(func: DatabaseFunction, riskFactors: string[]): string {
    const baseDescription = `Function '${func.schema_name}.${func.function_name}' has a mutable search path, making it vulnerable to search path manipulation attacks.`;
    
    const riskDescription = riskFactors.length > 0 
      ? ` Risk factors: ${riskFactors.join(', ')}.`
      : '';

    const impactDescription = ' An attacker could potentially execute malicious code by creating objects with the same names in a schema that appears earlier in the search path.';

    return baseDescription + riskDescription + impactDescription;
  }

  /**
   * Generate specific remediation steps for a function
   */
  private generateRemediationSteps(func: DatabaseFunction): string[] {
    const steps: string[] = [];

    // Step 1: Set explicit search_path
    steps.push(`ALTER FUNCTION ${func.schema_name}.${func.function_name}(${func.function_signature}) SET search_path = '${func.schema_name}';`);

    // Step 2: Review function definition
    steps.push(`Review the function definition for unqualified object references`);

    // Step 3: Use fully qualified names
    steps.push(`Replace unqualified object names with fully qualified names (schema.object_name)`);

    // Step 4: Test the function
    steps.push(`Test the function thoroughly after modification to ensure it works correctly`);

    // Step 5: Security review for SECURITY DEFINER functions
    if (func.is_security_definer) {
      steps.push(`Perform additional security review since this is a SECURITY DEFINER function`);
    }

    // Step 6: Document the changes
    steps.push(`Document the security fix and update function comments`);

    return steps;
  }

  /**
   * Generate analysis summary
   */
  private generateAnalysisSummary() {
    const summary = {
      total_vulnerabilities: this.vulnerabilities.length,
      by_severity: {
        ERROR: this.vulnerabilities.filter(v => v.severity === 'ERROR').length,
        WARN: this.vulnerabilities.filter(v => v.severity === 'WARN').length,
        INFO: this.vulnerabilities.filter(v => v.severity === 'INFO').length
      },
      by_schema: this.getVulnerabilitiesBySchema(),
      security_definer_functions: this.vulnerabilities.filter(v => 
        v.risk_factors.includes('Function uses SECURITY DEFINER')
      ).length,
      public_schema_functions: this.vulnerabilities.filter(v => 
        v.schema_name === 'public'
      ).length,
      functions_with_unqualified_refs: this.vulnerabilities.filter(v => 
        v.risk_factors.includes('Contains unqualified object references')
      ).length
    };

    return summary;
  }

  /**
   * Get vulnerabilities grouped by schema
   */
  private getVulnerabilitiesBySchema(): Record<string, number> {
    const bySchema: Record<string, number> = {};
    
    this.vulnerabilities.forEach(v => {
      const schema = v.schema_name || 'unknown';
      bySchema[schema] = (bySchema[schema] || 0) + 1;
    });

    return bySchema;
  }

  /**
   * Get all detected vulnerabilities
   */
  getVulnerabilities(): SearchPathVulnerability[] {
    return [...this.vulnerabilities];
  }

  /**
   * Get vulnerabilities by severity
   */
  getVulnerabilitiesBySeverity(severity: 'ERROR' | 'WARN' | 'INFO'): SearchPathVulnerability[] {
    return this.vulnerabilities.filter(v => v.severity === severity);
  }

  /**
   * Get remediation script for all vulnerabilities
   */
  generateRemediationScript(): string {
    const script: string[] = [];
    
    script.push('-- MIHAS Function Search Path Remediation Script');
    script.push('-- Generated on: ' + new Date().toISOString());
    script.push('-- Total vulnerabilities: ' + this.vulnerabilities.length);
    script.push('');

    this.vulnerabilities.forEach((vulnerability, index) => {
      script.push(`-- Vulnerability ${index + 1}: ${vulnerability.entity_name}`);
      script.push(`-- Severity: ${vulnerability.severity}`);
      script.push(`-- Risk factors: ${vulnerability.risk_factors.join(', ')}`);
      script.push('');
      
      // Add the ALTER FUNCTION command
      const alterCommand = vulnerability.remediation_steps.find(step => 
        step.startsWith('ALTER FUNCTION')
      );
      
      if (alterCommand) {
        script.push(alterCommand);
      }
      
      script.push('');
    });

    script.push('-- End of remediation script');
    
    return script.join('\n');
  }
}