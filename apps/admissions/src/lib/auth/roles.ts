// Current backend ROLE_CHOICES: student, admin, reviewer, super_admin
export const ADMIN_ROLES = ['admin', 'super_admin'] as const

// Future roles (not yet in backend ROLE_CHOICES — add to backend first):
// 'admissions_officer', 'registrar', 'finance_officer', 'academic_head'
// Also update REPORT_MANAGER_ROLES when these are added to the backend.

export type AdminRole = (typeof ADMIN_ROLES)[number]

export function isAdminRole(role?: string | null): role is AdminRole {
  if (!role) return false
  return ADMIN_ROLES.includes(role as AdminRole)
}

export const REPORT_MANAGER_ROLES = ['admin', 'super_admin'] as const

// Future report manager roles (not yet in backend ROLE_CHOICES):
// 'admissions_officer', 'registrar', 'finance_officer'

export type ReportManagerRole = (typeof REPORT_MANAGER_ROLES)[number]

export function isReportManagerRole(role?: string | null): role is ReportManagerRole {
  if (!role) return false
  return REPORT_MANAGER_ROLES.includes(role as ReportManagerRole)
}
