import React, { useCallback, useMemo, useState } from 'react'
import { sanitizeHtml } from '@/lib/sanitizer'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { Eye, FileText, CreditCard, Clock, CheckCircle, XCircle, AlertTriangle, User, Calendar, Phone, Mail, GraduationCap, Building } from 'lucide-react'
import { ApplicationApprovalActions } from './ApplicationApprovalActions'

// Institution code to name mapping
const INSTITUTION_NAMES: Record<string, string> = {
 'KATC': 'Kalulushi Training Centre',
 'katc': 'Kalulushi Training Centre',
 'MIHAS': 'Mukuba Institute of Health and Allied Sciences',
 'mihas': 'Mukuba Institute of Health and Allied Sciences'
}

const getInstitutionName = (code?: string) => {
 if (!code) return 'Not specified'
 return INSTITUTION_NAMES[code] || code
}

interface ApplicationSummary {
 id: string
 application_number: string
 full_name: string
 email: string
 phone: string
 program: string
 intake: string
 institution: string
 status: string
 payment_status: string
 payment_verified_at: string | null
 payment_verified_by: string | null
 payment_verified_by_name: string | null
 payment_verified_by_email: string | null
 last_payment_audit_id: number | null
 last_payment_audit_at: string | null
 last_payment_audit_by_name: string | null
 last_payment_audit_by_email: string | null
 last_payment_audit_notes: string | null
 last_payment_reference: string | null
 application_fee: number
 paid_amount: number
 submitted_at: string
 created_at: string
 result_slip_url: string
 extra_kyc_url: string
 pop_url: string
 grades_summary: string
 total_subjects: number
 points: number
 days_since_submission: number
}

interface ApplicationsTableProps {
 applications: ApplicationSummary[]
 totalCount: number
 loadedCount: number
 hasMore: boolean
 isLoadingMore: boolean
 onLoadMore: () => void | Promise<void>
 onStatusUpdate: (id: string, status: string) => void | Promise<void>
 onPaymentStatusUpdate: (id: string, status: string) => void | Promise<void>
 onViewDetails: (id: string) => void
 selectedIds?: string[]
 onSelectionChange?: (ids: string[]) => void
}



export function ApplicationsTable({
 applications,
 totalCount,
 loadedCount,
 hasMore,
 isLoadingMore,
 onLoadMore,
 onStatusUpdate,
 onPaymentStatusUpdate,
 onViewDetails,
 selectedIds = [],
 onSelectionChange
}: ApplicationsTableProps) {
 const [updatingStatus, setUpdatingStatus] = useState<string | null>(null)
 const [updatingPayment, setUpdatingPayment] = useState<string | null>(null)

 const handleSelect = (id: string, selected: boolean) => {
 if (!onSelectionChange) return
 
 const newSelection = selected
 ? [...selectedIds, id]
 : selectedIds.filter(selectedId => selectedId !== id)
 
 onSelectionChange(newSelection)
 }

 const handleSelectAll = () => {
 if (!onSelectionChange) return
 
 const allSelected = selectedIds.length === applications.length
 onSelectionChange(allSelected ? [] : applications.map(app => app.id))
 }

 const getStatusBadge = useCallback((status: string) => {
 const statusConfig = {
 draft: { color: 'bg-accent dark:bg-gray-200 text-foreground', icon: Clock },
 submitted: { color: 'bg-primary/10 text-primary-foreground', icon: AlertTriangle },
 under_review: { color: 'bg-accent/10 text-accent-foreground', icon: Eye },
 approved: { color: 'bg-accent/10 text-accent-foreground', icon: CheckCircle },
 rejected: { color: 'bg-destructive/10 text-destructive-foreground', icon: XCircle }
 }

 const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.draft
 const Icon = config.icon

 return (
 <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${config.color}`}>
 <Icon className="h-3 w-3" />
 {status.replace('_', ' ').toUpperCase()}
 </span>
 )
 }, [])

 const getPaymentBadge = useCallback((paymentStatus: string) => {
 const paymentConfig = {
 pending_review: { color: 'bg-accent/10 text-accent-foreground', icon: Clock },
 verified: { color: 'bg-accent/10 text-accent-foreground', icon: CheckCircle },
 rejected: { color: 'bg-destructive/10 text-destructive-foreground', icon: XCircle }
 }

 const config = paymentConfig[paymentStatus as keyof typeof paymentConfig] || paymentConfig.pending_review
 const Icon = config.icon

 return (
 <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${config.color}`}>
 <Icon className="h-3 w-3" />
 {paymentStatus.replace('_', ' ').toUpperCase()}
 </span>
 )
 }, [])

 const handleStatusUpdate = useCallback(async (id: string, status: string) => {
 try {
 setUpdatingStatus(id)
 await onStatusUpdate(id, status)
 } catch (error) {
 console.error('Failed to update status:', error)
 // Show user-friendly error message
 alert(`Failed to update application status: ${error instanceof Error ? error.message : 'Unknown error'}`)
 } finally {
 setUpdatingStatus(null)
 }
 }, [onStatusUpdate])

 const handlePaymentUpdate = useCallback(async (id: string, status: string) => {
 try {
 setUpdatingPayment(id)
 await onPaymentStatusUpdate(id, status)
 } catch (error) {
 console.error('Failed to update payment status:', error)
 // Show user-friendly error message
 alert(`Failed to update payment status: ${error instanceof Error ? error.message : 'Unknown error'}`)
 } finally {
 setUpdatingPayment(null)
 }
 }, [onPaymentStatusUpdate])

 return (
 <div className="space-y-6">
 {applications.length > 0 ? (
 <>
 {/* Select All Header */}
 {onSelectionChange && (
 <div className="bg-card rounded-xl border border-border p-4 mb-4">
 <div className="flex items-center justify-between">
 <div className="flex items-center gap-3">
 <input
 type="checkbox"
 checked={selectedIds.length === applications.length && applications.length > 0}
 onChange={handleSelectAll}
 className="h-4 w-4 text-primary focus:ring-blue-500 border-input rounded"
 />
 <span className="text-sm font-medium text-foreground">
 {selectedIds.length > 0 ? `${selectedIds.length} selected` : 'Select all'}
 </span>
 </div>
 {selectedIds.length > 0 && (
 <button
 onClick={() => onSelectionChange([])}
 className="text-sm text-muted-foreground hover:text-foreground"
 >
 Clear selection
 </button>
 )}
 </div>
 </div>
 )}
 
 <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
 {applications.map((app) => (
 <ApplicationCard
 key={app.id}
 application={app}
 getStatusBadge={getStatusBadge}
 getPaymentBadge={getPaymentBadge}
 onStatusUpdate={handleStatusUpdate}
 onPaymentStatusUpdate={handlePaymentUpdate}
 onViewDetails={onViewDetails}
 updatingStatus={updatingStatus === app.id}
 updatingPayment={updatingPayment === app.id}
 isSelected={selectedIds.includes(app.id)}
 onSelect={onSelectionChange ? handleSelect : undefined}
 />
 ))}
 </div>
 
 <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between bg-card rounded-xl p-6 border border-border shadow-sm">
 <div className="flex items-center gap-4">
 <div className="text-sm text-muted-foreground">
 Showing <span className="font-semibold text-foreground">{loadedCount}</span>
 {totalCount > 0 && (
 <>
 {' '}of{' '}
 <span className="font-semibold text-foreground">{totalCount}</span>
 </>
 )}{' '}
 applications
 </div>
 {totalCount > 0 && (
 <div className="h-4 w-px bg-muted" />
 )}
 <div className="text-xs text-muted-foreground">
 {Math.round((loadedCount / Math.max(totalCount, 1)) * 100)}% loaded
 </div>
 </div>

 {hasMore ? (
 <button
 type="button"
 onClick={onLoadMore}
 disabled={isLoadingMore}
 className="inline-flex items-center justify-center rounded-lg bg-gradient-to-r from-blue-600 to-blue-700 px-6 py-3 text-sm font-semibold text-white shadow-sm transition-all hover:from-blue-700 hover:to-blue-800 hover:shadow-md disabled:opacity-60 disabled:cursor-not-allowed"
 >
 {isLoadingMore && <LoadingSpinner size="sm" className="mr-2" />}
 {isLoadingMore ? 'Loading more...' : 'Load more applications'}
 </button>
 ) : (
 totalCount > 0 && (
 <div className="flex items-center gap-2 text-sm text-muted-foreground">
 <CheckCircle className="h-4 w-4 text-green-500" />
 All applications loaded
 </div>
 )
 )}
 </div>
 </>
 ) : (
 <div className="text-center py-16 bg-card rounded-xl border border-border">
 <div className="mx-auto w-16 h-16 bg-accent dark:bg-gray-200 rounded-full flex items-center justify-center mb-4">
 <FileText className="h-8 w-8 text-muted-foreground" />
 </div>
 <h3 className="text-lg font-medium text-foreground mb-2">No applications found</h3>
 <p className="text-sm text-muted-foreground">Try adjusting your filters to see more results.</p>
 </div>
 )}
 </div>
 )
}

interface ApplicationCardProps {
 application: ApplicationSummary
 getStatusBadge: (status: string) => JSX.Element
 getPaymentBadge: (status: string) => JSX.Element
 onStatusUpdate: (id: string, status: string) => void | Promise<void>
 onPaymentStatusUpdate: (id: string, status: string) => void | Promise<void>
 onViewDetails: (id: string) => void
 updatingStatus: boolean
 updatingPayment: boolean
 isSelected?: boolean
 onSelect?: (id: string, selected: boolean) => void
}

const ApplicationCard: React.FC<ApplicationCardProps> = ({
 application: app,
 getStatusBadge,
 getPaymentBadge,
 onStatusUpdate,
 onPaymentStatusUpdate,
 onViewDetails,
 updatingStatus,
 updatingPayment,
 isSelected = false,
 onSelect
}) => {
 const sanitizedGradesSummary = useMemo(
 () => sanitizeHtml(app.grades_summary ?? ''),
 [app.grades_summary]
 )

 const formatDate = (dateString: string) => {
 return new Date(dateString).toLocaleDateString('en-US', {
 month: 'short',
 day: 'numeric',
 year: 'numeric'
 })
 }

 const getPointsColor = (points: number) => {
 if (points <= 15) return 'text-green-600' // Lower is better
 if (points <= 25) return 'text-yellow-600'
 return 'text-red-600'
 }

 const documentsCount = [app.result_slip_url, app.extra_kyc_url, app.pop_url].filter(Boolean).length

 return (
 <div className={`relative bg-card rounded-xl border p-6 hover:shadow-lg transition-all duration-200 group ${
 isSelected ? 'border-blue-500 bg-blue-50' : 'border-border hover:border-input'
 }`}>
 {/* Selection Checkbox */}
 {onSelect && (
 <div className="absolute top-4 right-4">
 <input
 type="checkbox"
 checked={isSelected}
 onChange={(e) => onSelect(app.id, e.target.checked)}
 className="h-4 w-4 text-primary focus:ring-blue-500 border-input rounded"
 />
 </div>
 )}
 {/* Header */}
 <div className="flex items-start justify-between mb-4">
 <div className="flex-1 min-w-0">
 <div className="flex items-center gap-2 mb-1">
 <User className="h-4 w-4 text-muted-foreground flex-shrink-0" />
 <h3 className="font-semibold text-foreground truncate">{app.full_name}</h3>
 </div>
 <div className="flex items-center gap-2 text-sm text-muted-foreground">
 <span className="font-mono">#{app.application_number}</span>
 <span className="text-foreground">•</span>
 <Calendar className="h-3 w-3" />
 <span>{formatDate(app.submitted_at || app.created_at)}</span>
 </div>
 </div>
 {getStatusBadge(app.status)}
 </div>

 {/* Contact Info */}
 <div className="space-y-2 mb-4">
 <div className="flex items-center gap-2 text-sm text-muted-foreground">
 <Mail className="h-3 w-3 text-muted-foreground" />
 <span className="truncate">{app.email}</span>
 </div>
 {app.phone && (
 <div className="flex items-center gap-2 text-sm text-muted-foreground">
 <Phone className="h-3 w-3 text-muted-foreground" />
 <span>{app.phone}</span>
 </div>
 )}
 </div>

 {/* Program Info */}
 <div className="bg-muted rounded-lg p-3 mb-4">
 <div className="flex items-center gap-2 mb-1">
 <GraduationCap className="h-4 w-4 text-primary" />
 <span className="font-medium text-foreground text-sm">{app.program}</span>
 </div>
 <div className="flex items-center gap-2 text-sm text-muted-foreground">
 <Building className="h-3 w-3 text-muted-foreground" />
 <span>{getInstitutionName(app.institution)}</span>
 <span className="text-foreground">•</span>
 <span>{app.intake}</span>
 </div>
 </div>

 {/* Payment & Grades */}
 <div className="grid grid-cols-2 gap-4 mb-4">
 <div>
 <div className="text-xs text-muted-foreground mb-1">Payment Status</div>
 {getPaymentBadge(app.payment_status)}
 <div className="text-sm font-medium text-foreground mt-1">
 K{app.paid_amount || 0} / K{app.application_fee}
 </div>
 </div>
 
 {app.total_subjects > 0 && (
 <div>
 <div className="text-xs text-muted-foreground mb-1">Academic</div>
 <div className="text-sm">
 <span className="text-foreground">{app.total_subjects} subjects</span>
 {app.points > 0 && (
 <div className={`font-medium ${getPointsColor(app.points)}`}>
 Points: {app.points}
 </div>
 )}
 </div>
 </div>
 )}
 </div>

 {app.grades_summary && (
 <div className="mb-4 rounded-lg border border-border bg-muted p-3">
 <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-2">
 Grades Summary
 </div>
 <div
 className="prose prose-sm max-w-none text-foreground [&_p]:mb-2"
 dangerouslySetInnerHTML={{ __html: sanitizedGradesSummary }}
 />
 </div>
 )}

 {/* Documents */}
 {documentsCount > 0 && (
 <div className="flex items-center gap-2 mb-4 p-2 bg-primary/5/30 rounded-lg">
 <FileText className="h-4 w-4 text-primary" />
 <span className="text-sm text-primary">{documentsCount} document{documentsCount > 1 ? 's' : ''} uploaded</span>
 </div>
 )}

 {/* Status Controls */}
 <ApplicationApprovalActions
 applicationId={app.id}
 currentStatus={app.status}
 currentPaymentStatus={app.payment_status}
 onStatusUpdate={onStatusUpdate}
 onPaymentStatusUpdate={onPaymentStatusUpdate}
 disabled={updatingStatus || updatingPayment}
 />

 {/* Actions */}
 <div className="flex gap-2 mt-4 pt-4 border-t border-gray-100">
 <button
 onClick={() => onViewDetails(app.id)}
 className="flex-1 bg-gradient-to-r from-blue-600 to-blue-700 text-white text-sm py-2.5 px-4 rounded-lg hover:from-blue-700 hover:to-blue-800 transition-all duration-200 font-medium flex items-center justify-center gap-2 group-hover:shadow-md"
 >
 <Eye className="h-4 w-4" />
 View Details
 </button>
 
 {documentsCount > 0 && (
 <div className="flex gap-1">
 {app.result_slip_url && (
 <a
 href={app.result_slip_url}
 target="_blank"
 rel="noopener noreferrer"
 className="bg-accent dark:bg-gray-200 hover:bg-gray-200 dark:bg-gray-700 text-foreground p-2.5 rounded-lg transition-colors"
 title="Result Slip"
 >
 <FileText className="h-4 w-4" />
 </a>
 )}
 {app.pop_url && (
 <a
 href={app.pop_url}
 target="_blank"
 rel="noopener noreferrer"
 className="bg-accent dark:bg-gray-200 hover:bg-gray-200 dark:bg-gray-700 text-foreground p-2.5 rounded-lg transition-colors"
 title="Proof of Payment"
 >
 <CreditCard className="h-4 w-4" />
 </a>
 )}
 </div>
 )}
 </div>

 {/* Loading Overlays */}
 {(updatingStatus || updatingPayment) && (
 <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-card/80">
 <div className="flex items-center gap-2 text-sm text-muted-foreground">
 <LoadingSpinner size="sm" />
 <span>Updating...</span>
 </div>
 </div>
 )}
 </div>
 )
}
