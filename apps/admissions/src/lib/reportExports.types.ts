// Types only - no heavy dependencies
export type ReportFormat = 'json' | 'pdf' | 'excel' | 'csv'

export interface ProgramBreakdownStats {
  total: number
  approved: number
  rejected: number
  pending: number
}

export interface ReportMetadata {
  reportTitle?: string
  reportType?: string
  exportFormat?: ReportFormat
  totalRows?: number
  includePrograms?: boolean
  includeEngagement?: boolean
  includeEligibility?: boolean
  appliedFilters?: Record<string, string>
  institutionBreakdown?: Record<string, number>
  paymentBreakdown?: Record<string, number>
  [key: string]: any
}

export interface ReportExportData {
  period?: string
  generatedAt?: string
  statistics?: Record<string, number | string>
  approvalRate?: string | number
  programBreakdown?: Record<string, ProgramBreakdownStats>
  metadata?: ReportMetadata
  [key: string]: any
}
