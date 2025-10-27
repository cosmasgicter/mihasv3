// Types only - no heavy dependencies
export type ReportFormat = 'json' | 'pdf' | 'excel'

export interface ProgramBreakdownStats {
  total: number
  approved: number
  rejected: number
  pending: number
}

export interface ReportExportData {
  period?: string
  generatedAt?: string
  statistics?: Record<string, number | string>
  approvalRate?: string | number
  programBreakdown?: Record<string, ProgramBreakdownStats>
  metadata?: Record<string, any>
  [key: string]: any
}
