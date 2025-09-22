export const ADMIN_ROLES = [
  'admin',
  'super_admin',
  'admissions_officer',
  'registrar',
  'finance_officer',
  'academic_head'
] as const

export type AdminRole = (typeof ADMIN_ROLES)[number]

export function isAdminRole(role?: string | null): role is AdminRole {
  if (!role) return false
  return ADMIN_ROLES.includes(role as AdminRole)
}

export const REPORT_MANAGER_ROLES = [
  'admissions_officer',
  'registrar',
  'finance_officer',
  'admin',
  'super_admin'
] as const

export type ReportManagerRole = (typeof REPORT_MANAGER_ROLES)[number]

export function isReportManagerRole(role?: string | null): role is ReportManagerRole {
  if (!role) return false
  return REPORT_MANAGER_ROLES.includes(role as ReportManagerRole)
}
