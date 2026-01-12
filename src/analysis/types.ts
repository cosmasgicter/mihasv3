/**
 * MIHAS System Analysis Types
 * 
 * Core type definitions for the analysis infrastructure
 */

export interface SecurityVulnerability {
  id: string;
  type: 'security_definer_view' | 'mutable_search_path' | 'permissive_rls' | 'disabled_password_protection';
  severity: 'ERROR' | 'WARN' | 'INFO';
  entity_name: string;
  description: string;
  remediation_steps: string[];
  status: 'identified' | 'in_progress' | 'resolved';
  detected_at: Date;
  schema_name?: string;
  function_name?: string;
  policy_name?: string;
}

export interface AnalysisResult {
  id: string;
  analysis_type: 'security' | 'schema' | 'performance' | 'api' | 'flow';
  status: 'running' | 'completed' | 'failed';
  started_at: Date;
  completed_at?: Date;
  results: any;
  error_message?: string;
  metadata: Record<string, any>;
}

export interface RemediationStep {
  id: string;
  vulnerability_id: string;
  step_number: number;
  description: string;
  sql_command?: string;
  verification_query?: string;
  risk_level: 'low' | 'medium' | 'high';
  estimated_time_minutes: number;
  requires_downtime: boolean;
}

export interface PerformanceMetric {
  id: string;
  metric_name: string;
  metric_type: 'response_time' | 'error_rate' | 'throughput' | 'resource_usage';
  value: number;
  unit: string;
  timestamp: Date;
  endpoint?: string;
  query?: string;
  threshold_warning?: number;
  threshold_critical?: number;
}

export interface SchemaRedundancy {
  id: string;
  table_name: string;
  redundant_with: string;
  redundancy_type: 'duplicate_structure' | 'legacy_version' | 'partial_overlap';
  similarity_score: number;
  recommendation: string;
  migration_complexity: 'low' | 'medium' | 'high';
  data_volume: number;
}

export interface DatabaseIntegrityIssue {
  id: string;
  issue_type: 'orphaned_record' | 'missing_foreign_key' | 'constraint_violation';
  table_name: string;
  column_name?: string;
  affected_rows: number;
  description: string;
  fix_query: string;
  risk_assessment: 'low' | 'medium' | 'high';
}

export interface APIEndpointInfo {
  id: string;
  function_name: string;
  endpoint_path: string;
  http_method: string;
  category: 'admin' | 'applications' | 'auth' | 'notifications' | 'reports' | 'other';
  authentication_required: boolean;
  average_response_time: number;
  error_rate: number;
  last_analyzed: Date;
  dependencies: string[];
}

export interface AnalysisConfig {
  security_scan_enabled: boolean;
  schema_analysis_enabled: boolean;
  performance_monitoring_enabled: boolean;
  api_analysis_enabled: boolean;
  scan_interval_hours: number;
  alert_thresholds: {
    critical_vulnerabilities: number;
    performance_degradation_percent: number;
    error_rate_percent: number;
  };
}

export interface AnalysisReport {
  id: string;
  report_type: 'security' | 'performance' | 'comprehensive';
  generated_at: Date;
  summary: {
    total_issues: number;
    critical_issues: number;
    resolved_issues: number;
    pending_issues: number;
  };
  sections: AnalysisReportSection[];
  recommendations: string[];
  next_scan_scheduled: Date;
}

export interface AnalysisReportSection {
  title: string;
  content: string;
  issues: SecurityVulnerability[] | PerformanceMetric[] | SchemaRedundancy[];
  charts?: ChartData[];
}

export interface ChartData {
  type: 'line' | 'bar' | 'pie';
  title: string;
  data: any[];
  labels: string[];
}