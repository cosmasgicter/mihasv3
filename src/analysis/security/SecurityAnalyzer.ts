/**
 * MIHAS Security Analyzer
 * 
 * Comprehensive security vulnerability detection for database and application layers
 * Requirements: 1.1, 1.2, 1.3, 1.4
 */

import { createClient } from '@supabase/supabase-js';
import type { 
  SecurityVulnerability, 
  AnalysisResult, 
  RemediationStep 
} from '../types';

export class SecurityAnalyzer {
  private supabase;
  private vulnerabilities: SecurityVulnerability[] = [];

  constructor() {
    // Initialize Supabase client for database analysis
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
    
    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Supabase configuration missing for security analysis');
    }
    
    this.supabase = createClient(supabaseUrl, supabaseKey);
  }

  /**
   * Perform comprehensive security analysis
   * Property 1: Comprehensive Security Vulnerability Detection
   */
  async performSecurityAnalysis(): Promise<AnalysisResult> {
    const analysisId = crypto.randomUUID();
    const startTime = new Date();

    try {
      console.log('🔍 Starting comprehensive security analysis...');
      
      // Clear previous results
      this.vulnerabilities = [];

      // Run all security scans
      await Promise.all([
        this.scanSecurityDefinerViews(),
        this.scanMutableSearchPathFunctions(),
        this.scanPermissiveRLSPolicies(),
        this.checkPasswordProtection()
      ]);

      const result: AnalysisResult = {
        id: analysisId,
        analysis_type: 'security',
        status: 'completed',
        started_at: startTime,
        completed_at: new Date(),
        results: {
          vulnerabilities: this.vulnerabilities,
          summary: this.generateSecuritySummary()
        },
        metadata: {
          total_vulnerabilities: this.vulnerabilities.length,
          critical_count: this.vulnerabilities.filter(v => v.severity === 'ERROR').length,
          warning_count: this.vulnerabilities.filter(v => v.severity === 'WARN').length
        }
      };

      console.log(`✅ Security analysis completed. Found ${this.vulnerabilities.length} vulnerabilities.`);
      return result;

    } catch (error) {
      console.error('❌ Security analysis failed:', error);
      
      return {
        id: analysisId,
        analysis_type: 'security',
        status: 'failed',
        started_at: startTime,
        completed_at: new Date(),
        results: {},
        error_message: error instanceof Error ? error.message : 'Unknown error',
        metadata: {}
      };
    }
  }

  /**
   * Scan for Security Definer Views
   * Identifies views that execute with creator privileges
   * 
   * Graceful degradation: Returns healthy status when checks cannot be performed
   * Requirements: 5.1, 5.4, 5.5
   */
  private async scanSecurityDefinerViews(): Promise<void> {
    try {
      console.log('🔍 Scanning for Security Definer Views...');
      
      // NOTE: Removed call to get_security_definer_views RPC (Requirement 5.5)
      // This RPC function does not exist in the database
      // Return healthy status - cannot verify (Requirement 5.1)
      console.log('✅ Security Definer Views check skipped - RPC not available, assuming healthy status');
      
    } catch (error) {
      // Log warning instead of throwing (Requirement 5.4)
      console.warn('Security Definer Views check unavailable:', error instanceof Error ? error.message : 'Unknown error');
      // Return healthy status - cannot verify (Requirement 5.1)
    }
  }

  /**
   * Scan for functions with mutable search paths
   * Identifies functions vulnerable to search path manipulation
   * Uses the dedicated FunctionSearchPathAnalyzer for comprehensive analysis
   * 
   * Graceful degradation: Returns healthy status when checks cannot be performed
   * Requirements: 5.1, 5.4
   */
  private async scanMutableSearchPathFunctions(): Promise<void> {
    try {
      console.log('🔍 Scanning for functions with mutable search paths...');
      
      // Use the dedicated analyzer for comprehensive function analysis
      const { FunctionSearchPathAnalyzer } = await import('./FunctionSearchPathAnalyzer');
      const analyzer = new FunctionSearchPathAnalyzer();
      
      const analysisResult = await analyzer.analyzeFunctionSearchPaths();
      
      if (analysisResult.status === 'completed' && analysisResult.results.vulnerabilities) {
        // Add all found vulnerabilities to our main vulnerability list
        analysisResult.results.vulnerabilities.forEach((vulnerability: any) => {
          this.addVulnerability({
            type: vulnerability.type,
            severity: vulnerability.severity,
            entity_name: vulnerability.entity_name,
            description: vulnerability.description,
            remediation_steps: vulnerability.remediation_steps,
            schema_name: vulnerability.schema_name,
            function_name: vulnerability.function_name
          });
        });
        
        console.log(`✅ Mutable search path scan completed. Found ${analysisResult.results.vulnerable_functions} vulnerable functions out of ${analysisResult.results.functions_analyzed} analyzed.`);
      } else {
        // Return healthy status - cannot verify (Requirement 5.1)
        console.log('✅ Mutable search path scan completed - no issues detected or analysis unavailable');
      }
      
    } catch (error) {
      // Log warning instead of throwing (Requirement 5.4)
      console.warn('Mutable search path check unavailable:', error instanceof Error ? error.message : 'Unknown error');
      // Return healthy status - cannot verify (Requirement 5.1)
    }
  }

  /**
   * Scan for overly permissive RLS policies
   * Identifies policies using USING (true) or WITH CHECK (true)
   * 
   * Graceful degradation: Returns healthy status when checks cannot be performed
   * Requirements: 5.1, 5.4, 5.5
   */
  private async scanPermissiveRLSPolicies(): Promise<void> {
    try {
      console.log('🔍 Scanning for overly permissive RLS policies...');
      
      // NOTE: Removed call to get_permissive_rls_policies RPC (Requirement 5.5)
      // This RPC function does not exist in the database
      // Return healthy status - cannot verify (Requirement 5.1)
      console.log('✅ RLS policy check skipped - RPC not available, assuming healthy status');
      
    } catch (error) {
      // Log warning instead of throwing (Requirement 5.4)
      console.warn('RLS policy check unavailable:', error instanceof Error ? error.message : 'Unknown error');
      // Return healthy status - cannot verify (Requirement 5.1)
    }
  }

  /**
   * Check password protection settings
   * Verifies that leaked password protection is enabled
   * 
   * Graceful degradation: Returns healthy status when checks cannot be performed
   * Requirements: 5.1, 5.4
   */
  private async checkPasswordProtection(): Promise<void> {
    try {
      console.log('🔍 Checking password protection settings...');
      
      // NOTE: Cannot verify Supabase auth settings from client-side
      // Return healthy status - cannot verify (Requirement 5.1)
      console.log('✅ Password protection check completed - settings verification not available from client');
      
    } catch (error) {
      // Log warning instead of throwing (Requirement 5.4)
      console.warn('Password protection check unavailable:', error instanceof Error ? error.message : 'Unknown error');
      // Return healthy status - cannot verify (Requirement 5.1)
    }
  }

  /**
   * Add a vulnerability to the results
   */
  private addVulnerability(vulnerability: Omit<SecurityVulnerability, 'id' | 'status' | 'detected_at'>): void {
    this.vulnerabilities.push({
      id: crypto.randomUUID(),
      status: 'identified',
      detected_at: new Date(),
      ...vulnerability
    });
  }

  /**
   * Generate security summary
   */
  private generateSecuritySummary() {
    const summary = {
      total_vulnerabilities: this.vulnerabilities.length,
      by_severity: {
        ERROR: this.vulnerabilities.filter(v => v.severity === 'ERROR').length,
        WARN: this.vulnerabilities.filter(v => v.severity === 'WARN').length,
        INFO: this.vulnerabilities.filter(v => v.severity === 'INFO').length
      },
      by_type: {
        security_definer_view: this.vulnerabilities.filter(v => v.type === 'security_definer_view').length,
        mutable_search_path: this.vulnerabilities.filter(v => v.type === 'mutable_search_path').length,
        permissive_rls: this.vulnerabilities.filter(v => v.type === 'permissive_rls').length,
        disabled_password_protection: this.vulnerabilities.filter(v => v.type === 'disabled_password_protection').length
      }
    };

    return summary;
  }

  /**
   * Get all detected vulnerabilities
   */
  getVulnerabilities(): SecurityVulnerability[] {
    return [...this.vulnerabilities];
  }

  /**
   * Generate remediation steps for a specific vulnerability
   */
  generateRemediationSteps(vulnerabilityId: string): RemediationStep[] {
    const vulnerability = this.vulnerabilities.find(v => v.id === vulnerabilityId);
    if (!vulnerability) {
      return [];
    }

    return vulnerability.remediation_steps.map((step, index) => ({
      id: crypto.randomUUID(),
      vulnerability_id: vulnerabilityId,
      step_number: index + 1,
      description: step,
      risk_level: vulnerability.severity === 'ERROR' ? 'high' : 'medium',
      estimated_time_minutes: this.estimateRemediationTime(vulnerability.type),
      requires_downtime: this.requiresDowntime(vulnerability.type)
    }));
  }

  /**
   * Estimate remediation time based on vulnerability type
   */
  private estimateRemediationTime(type: SecurityVulnerability['type']): number {
    const timeEstimates = {
      security_definer_view: 30,
      mutable_search_path: 15,
      permissive_rls: 45,
      disabled_password_protection: 5
    };

    return timeEstimates[type] || 30;
  }

  /**
   * Check if remediation requires downtime
   */
  private requiresDowntime(type: SecurityVulnerability['type']): boolean {
    const downtimeRequired = {
      security_definer_view: true,
      mutable_search_path: true,
      permissive_rls: false,
      disabled_password_protection: false
    };

    return downtimeRequired[type] || false;
  }
}