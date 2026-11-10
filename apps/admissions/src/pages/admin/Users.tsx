/**
 * The admin user directory (Admissions V2, task 9.3).
 *
 * Spec: `.kiro/specs/admissions-v2-canonical-rebuild/` task 9.3.
 * Requirements: R6.1, R6.2, R6.4, R6.5 · Findings: ADM-03, ADM-04, AUTH-04.
 *
 * Every number on this page is the server's. Before 9.3 this component fetched
 * one bare server page and then filtered, sorted, sliced, and measured the array
 * it had, publishing those array lengths as facts about the whole directory. The
 * export shipped the same array. Now: one scoped query, whole-set aggregates, SQL
 * facets, server page arithmetic, and a page-independent audited export.
 */
import { useCallback, useEffect, useMemo, useReducer } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from '@/lib/zod'
import { useDebounce } from '@/hooks/useDebounce'
import { Link } from 'react-router-dom'
import type { UserProfile } from '@/types/database'
import { Button } from '@/components/ui/Button'
import { SkeletonTable as TableSkeleton, SkeletonCard as CardSkeleton } from '@/components/ui'
import { Input } from '@/components/ui/input'
import { SectionCard } from '@/components/ui/SectionCard'
import { PageShell } from '@/components/ui/PageShell'
import { Seo } from '@/components/seo/Seo'
import { UserStats } from '@/components/admin/UserStats'
import { BulkUserOperations } from '@/components/admin/BulkUserOperations'
import { UserActivityLog } from '@/components/admin/UserActivityLog'
import { UserImport } from '@/components/admin/UserImport'
import { UserEffectiveCapabilities } from '@/components/admin/UserEffectiveCapabilities'
import { usersData as userQueries } from '@/data/users'
import {
  useUserDirectory,
  useUserDirectoryExport,
} from '@/hooks/admin/useUserDirectory'
import type { UserDirectoryRow } from '@/services/admin/userDirectory'
import {
  ArrowLeft,
  BarChart3,
  CheckSquare,
  Download,
  Filter,
  Search,
  Upload,
  User,
  UserPlus,
  Users as UsersIcon,
} from 'lucide-react'
import { useToastStore } from '@/hooks/useToast'
import { sanitizeForLog } from '@/lib/security'
import { logger } from '@/lib/logger'
import {
  usersReducer,
  initialUsersState,
  ROLE_VALUES,
  AVAILABLE_ROLES,
  getRoleLabel,
  getSessionSummary,
  toDirectoryQuery,
  PAGE_SIZE,
} from './lib/usersReducer'
import { CreateUserDialog, EditUserDialog, DeleteUserDialog, UsersTableSection } from '@/components/admin/users'

// Re-export helpers for test compatibility
export { ROLE_VALUES, AVAILABLE_ROLES, getRoleLabel, getSessionSummary, PAGE_SIZE }
export { getRoleDescription } from './lib/usersReducer'

const createUserSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  full_name: z.string().min(2, 'Full name is required'),
  phone: z.string(),
  role: z.enum(ROLE_VALUES, { error: 'Role is required' }),
})

const editUserSchema = z.object({
  full_name: z.string().min(2, 'Full name is required'),
  email: z.string().email('Please enter a valid email address'),
  phone: z.string(),
  role: z.enum(ROLE_VALUES, { error: 'Role is required' }),
})

type CreateUserForm = z.infer<typeof createUserSchema>
type EditUserForm = z.infer<typeof editUserSchema>

/**
 * The server row, in the shape the existing dialogs and row cards read.
 *
 * A projection, not a second model: the server owns `full_name` (computed in
 * SQL), so nothing here recomputes a display name.
 */
function asProfile(row: UserDirectoryRow): UserProfile {
  return {
    ...(row as unknown as UserProfile),
    id: row.id,
    user_id: row.id,
    full_name: row.full_name,
    email: row.email,
    phone: row.phone,
    role: row.role,
    is_active: row.is_active,
    created_at: row.created_at ?? undefined,
    updated_at: row.updated_at ?? undefined,
  } as UserProfile
}

/** Split a display name the same way the server does, for the write payload. */
function splitFullName(fullName: string): { first_name: string; last_name: string } {
  const normalized = fullName.trim().replace(/\s+/g, ' ')
  if (!normalized) return { first_name: '', last_name: '' }
  const [first, ...rest] = normalized.split(' ')
  return { first_name: first ?? '', last_name: rest.join(' ') || (first ?? '') }
}

export default function AdminUsers() {
  const [state, dispatch] = useReducer(usersReducer, initialUsersState)
  const { dialogs, filters, selection } = state
  const { success: showSuccess, info: showInfo, error: showError } = useToastStore()

  const debouncedSearchTerm = useDebounce(filters.searchTerm, 300)
  const query = useMemo(
    () => toDirectoryQuery(filters, debouncedSearchTerm),
    [filters, debouncedSearchTerm],
  )

  const {
    data: report,
    isLoading: loading,
    error: queryError,
    refetch,
  } = useUserDirectory(query)

  const createUserMutation = userQueries.useCreate()
  const updateUserMutation = userQueries.useUpdate()
  const deleteUserMutation = userQueries.useRemove()
  const exportMutation = useUserDirectoryExport()

  // Rows, totals, facets, and page arithmetic all come from the server. There is
  // deliberately no client-side filtered list, no client-side ordering, and no
  // windowing on this page: each was a browser answer to a question only the
  // database can answer.
  const rows = report?.results ?? []
  const users = useMemo(() => rows.map(asProfile), [rows])
  const totalCount = report?.totalCount ?? 0
  const totalPages = report?.totalPages ?? 1
  const aggregates = report?.aggregates
  const definitions = report?.aggregate_definitions ?? {}
  const roleFacet = report?.facets?.role
  const canExport = report?.can_export ?? false
  const unknownParameters = report?.filters?.unknown_parameters ?? []

  const selectedUserId = dialogs.selectedUser?.user_id || dialogs.selectedUser?.id
  const effectiveCapabilitiesQuery = userQueries.useEffectiveCapabilities(
    dialogs.showPermissionsDialog ? selectedUserId : undefined,
  )

  const createFormHook = useForm<CreateUserForm>({
    resolver: zodResolver(createUserSchema),
    defaultValues: { email: '', password: '', full_name: '', phone: '', role: 'student' },
  })
  const editFormHook = useForm<EditUserForm>({
    resolver: zodResolver(editUserSchema),
    defaultValues: { full_name: '', email: '', phone: '', role: 'student' },
  })

  useEffect(() => {
    if (queryError) {
      dispatch({
        type: 'SET_ERROR',
        payload: queryError instanceof Error ? queryError.message : 'Failed to load users',
      })
    } else {
      dispatch({ type: 'SET_ERROR', payload: '' })
    }
  }, [queryError])

  const selectedCount = selection.selectedUsers.length
  const hasActiveFilters = Boolean(
    filters.searchTerm ||
      filters.roleFilter ||
      filters.activeFilter !== null ||
      filters.membershipFilter !== null ||
      filters.institutionId,
  )

  const createUser = createFormHook.handleSubmit(async (values) => {
    try {
      await createUserMutation.mutateAsync(values)
      dispatch({ type: 'SET_ERROR', payload: '' })
      dispatch({ type: 'CLOSE_CREATE' })
      createFormHook.reset({ email: '', password: '', full_name: '', phone: '', role: 'student' })
      showSuccess('User created', `${values.full_name} can now sign in as ${getRoleLabel(values.role)}.`)
      showInfo('Secure handoff', 'Share the temporary password through a trusted channel and ask the user to change it after first sign-in.')
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to create user'
      logger.error('Failed to create user:', sanitizeForLog(errorMessage))
      dispatch({ type: 'SET_ERROR', payload: errorMessage })
    }
  })

  const openEditDialog = useCallback((user: UserProfile) => {
    editFormHook.reset({
      full_name: user.full_name || '',
      email: user.email || '',
      phone: user.phone || '',
      role: (user.role || 'student') as EditUserForm['role'],
    })
    dispatch({ type: 'OPEN_EDIT', user })
  }, [editFormHook])

  const updateUser = editFormHook.handleSubmit(async (values) => {
    if (!selectedUserId) return
    try {
      const roleChanged = dialogs.selectedUser?.role !== values.role
      // Every field here is one the endpoint implements (R6.2). `email` and
      // `phone` used to be sent and silently dropped inside a 200.
      const result = await updateUserMutation.mutateAsync({
        id: selectedUserId,
        data: {
          ...splitFullName(values.full_name),
          email: values.email,
          phone: values.phone,
          role: values.role,
        },
      })
      dispatch({ type: 'SET_ERROR', payload: '' })
      dispatch({ type: 'CLOSE_EDIT' })
      showSuccess(
        'User updated',
        roleChanged
          ? `${values.full_name} now has the ${getRoleLabel(values.role)} role.`
          : 'Profile details were updated.',
      )
      const revoked = (result as { revokedSessions?: number } | undefined)?.revokedSessions
      if (revoked) showInfo('Reauthentication required', getSessionSummary(revoked))
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to update user'
      logger.error('Failed to update user:', sanitizeForLog(errorMessage))
      dispatch({ type: 'SET_ERROR', payload: errorMessage })
    }
  })

  const deactivateUser = async () => {
    if (!selectedUserId) return
    try {
      const userName = dialogs.selectedUser?.full_name || dialogs.selectedUser?.email || 'User'
      await deleteUserMutation.mutateAsync(selectedUserId)
      dispatch({ type: 'SET_ERROR', payload: '' })
      dispatch({ type: 'CLOSE_DELETE' })
      dispatch({ type: 'REMOVE_FROM_SELECTION', userId: selectedUserId })
      showSuccess('User deactivated', `${userName} no longer has access to the portal.`)
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to deactivate user'
      logger.error('Failed to deactivate user:', sanitizeForLog(errorMessage))
      dispatch({ type: 'SET_ERROR', payload: errorMessage })
    }
  }

  const handleSelectAll = useCallback(() => {
    // "All" means the rows on screen. It cannot mean the whole filtered set: a
    // bulk command is bounded at 25 targets, and pretending otherwise is how the
    // old page offered an action it could not complete.
    const pageIds = rows.map((row) => row.id)
    if (pageIds.every((id) => selection.selectedUsers.includes(id)) && pageIds.length > 0) {
      dispatch({ type: 'DESELECT_ALL' })
    } else {
      dispatch({ type: 'SELECT_ALL', userIds: pageIds })
    }
  }, [rows, selection.selectedUsers])

  const handleUserSelect = useCallback((userId: string) => {
    dispatch({ type: 'TOGGLE_USER', userId })
  }, [])

  const runExport = useCallback(async () => {
    try {
      // The whole filtered set, page-independent, authored and audited by the
      // server (R6.5).
      await exportMutation.mutateAsync(query)
      showSuccess('Export ready', 'The directory export was downloaded.')
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'The export could not be generated.'
      showError('Export failed', message)
    }
  }, [exportMutation, query, showSuccess, showError])

  const metricValue = (value: number | undefined) =>
    typeof value === 'number' ? value : 'Unknown'

  return (
    <>
      <Seo
        title="User Management | Beanola Admissions"
        description="Create accounts, manage roles, permissions, and review user activity."
        path="/admin/users"
        noindex
      />
      <PageShell
        title="User management"
        eyebrow="People & Access"
        subtitle="Create accounts, adjust platform roles, review backend-derived effective access, and review account activity."
        maxWidth="7xl"
        tone="admin"
        metrics={[
          {
            label: 'Accounts',
            value: metricValue(aggregates?.total_count),
            helper: definitions.total_count || 'Accounts matching the current filters, in your scope.',
          },
          {
            label: 'Enabled',
            value: metricValue(aggregates?.enabled_count),
            helper: definitions.enabled_count || 'Accounts permitted to sign in.',
          },
          {
            label: 'Staff without a school',
            value: metricValue(aggregates?.staff_without_membership_count),
            helper:
              definitions.staff_without_membership_count ||
              'Staff accounts with no active school membership, and therefore no tenant access.',
          },
          {
            label: 'Selected',
            value: selectedCount,
            helper: 'Targets for the next bulk command (max 25).',
          },
        ]}
        actions={
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap">
            <Link to="/admin" className="w-full sm:w-auto">
              <Button variant="ghost" size="sm" className="min-h-touch min-w-touch w-full sm:w-auto">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back
              </Button>
            </Link>
            <Button onClick={() => dispatch({ type: 'TOGGLE_STATS' })} variant="ghost" size="sm" className="min-h-touch min-w-touch w-full sm:w-auto">
              <BarChart3 className="mr-2 h-4 w-4" />
              {dialogs.showStats ? 'Hide stats' : 'Show stats'}
            </Button>
            <Button onClick={() => dispatch({ type: 'OPEN_IMPORT' })} variant="ghost" size="sm" className="min-h-touch min-w-touch w-full sm:w-auto">
              <Upload className="mr-2 h-4 w-4" />
              Import
            </Button>
            {canExport && (
              <Button
                onClick={runExport}
                loading={exportMutation.isPending}
                variant="ghost"
                size="sm"
                className="min-h-touch min-w-touch w-full sm:w-auto"
              >
                <Download className="mr-2 h-4 w-4" />
                Export
              </Button>
            )}
            <Button onClick={() => dispatch({ type: 'OPEN_CREATE' })} size="sm" className="min-h-touch min-w-touch w-full sm:w-auto">
              <UserPlus className="mr-2 h-4 w-4" />
              Add user
            </Button>
          </div>
        }
      >
        <div className="space-y-6">
          <SectionCard
            title="Filter and operate"
            description="Every filter here is applied by the server across the whole directory in your scope, not to the rows on this page."
            icon={<Filter className="h-5 w-5" />}
            actions={hasActiveFilters ? (
              <Button variant="outline" size="sm" className="min-h-touch min-w-touch" onClick={() => dispatch({ type: 'CLEAR_FILTERS' })}>
                Clear filters
              </Button>
            ) : undefined}
          >
            <div className="grid gap-4 lg:grid-cols-3">
              <Input
                label="Search users"
                value={filters.searchTerm}
                onChange={(event) => dispatch({ type: 'SET_SEARCH', payload: event.target.value })}
                placeholder="Search by name, email, or phone"
                icon={<Search className="h-4 w-4" />}
                helperText="Matched by the server across every account in your scope."
              />
              <div>
                <label htmlFor="user-role-filter" className="mb-1.5 block text-sm font-medium text-foreground">Role</label>
                <div className="relative">
                  <Filter className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-foreground" />
                  <select
                    id="user-role-filter"
                    value={filters.roleFilter}
                    onChange={(event) => dispatch({ type: 'SET_ROLE_FILTER', payload: event.target.value })}
                    className="min-h-touch h-12 w-full rounded-lg border border-input bg-background pl-10 pr-3 text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  >
                    <option value="">All roles</option>
                    {/*
                      Options come from the server's facet, each with its own
                      whole-set count — so a role with no row on this page is
                      still offered, which a list harvested from the loaded rows
                      could not do. The static catalogue is the fallback label
                      source only.
                    */}
                    {(roleFacet?.options.length
                      ? roleFacet.options.map((option) => ({
                          value: String(option.value ?? ''),
                          label: `${getRoleLabel(String(option.value ?? ''))} (${option.count})`,
                        }))
                      : AVAILABLE_ROLES.map((role) => ({ value: role.value, label: role.label }))
                    ).map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </div>
                <p className="mt-1.5 text-sm text-foreground">Counts are for the whole filtered directory.</p>
              </div>
              <div>
                <label htmlFor="user-status-filter" className="mb-1.5 block text-sm font-medium text-foreground">Account status</label>
                <select
                  id="user-status-filter"
                  value={filters.activeFilter === null ? '' : String(filters.activeFilter)}
                  onChange={(event) =>
                    dispatch({
                      type: 'SET_ACTIVE_FILTER',
                      payload: event.target.value === '' ? null : event.target.value === 'true',
                    })
                  }
                  className="min-h-touch h-12 w-full rounded-lg border border-input bg-background px-3 text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  <option value="">Enabled accounts (default)</option>
                  <option value="true">Enabled accounts</option>
                  <option value="false">Deactivated accounts</option>
                </select>
                <p className="mt-1.5 text-sm text-foreground">
                  Enabled means permitted to sign in.
                </p>
              </div>
            </div>

            <div>
              <label htmlFor="user-membership-filter" className="mb-1.5 block text-sm font-medium text-foreground">School membership</label>
              <select
                id="user-membership-filter"
                value={filters.membershipFilter === null ? '' : String(filters.membershipFilter)}
                onChange={(event) =>
                  dispatch({
                    type: 'SET_MEMBERSHIP_FILTER',
                    payload: event.target.value === '' ? null : event.target.value === 'true',
                  })
                }
                className="min-h-touch h-12 w-full rounded-lg border border-input bg-background px-3 text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:max-w-md"
              >
                <option value="">Any membership</option>
                <option value="true">Has an active school membership</option>
                <option value="false">No active school membership</option>
              </select>
              <p className="mt-1.5 text-sm text-foreground">
                A staff account with no membership has no tenant access at all, whatever its role says.
              </p>
            </div>

            {unknownParameters.length > 0 && (
              <div className="rounded-lg border border-warning/40 bg-warning/5 p-4" role="status">
                <p className="text-sm font-medium text-foreground">
                  Some filters in this link were not applied
                </p>
                <p className="mt-1 text-sm text-foreground">
                  The directory does not implement: {unknownParameters.join(', ')}.
                </p>
              </div>
            )}
          </SectionCard>

          {dialogs.showStats && (
            <SectionCard
              title="Directory statistics"
              description="Server counts over the whole filtered directory in your scope."
              icon={<BarChart3 className="h-5 w-5" />}
            >
              <UserStats
                aggregates={aggregates ?? null}
                definitions={definitions}
                isLoading={loading}
              />
            </SectionCard>
          )}

          {selectedCount > 0 && (
            <SectionCard
              title={`Bulk operations (${selectedCount} selected)`}
              description="One server command: authorized, bounded, all-or-nothing, and audited."
              icon={<CheckSquare className="h-5 w-5" />}
            >
              <BulkUserOperations
                users={users}
                selectedUsers={selection.selectedUsers}
                onSelectionChange={(ids) => dispatch({ type: 'SELECT_ALL', userIds: ids })}
                onOperationComplete={() => refetch()}
              />
            </SectionCard>
          )}

          <SectionCard
            title="User directory"
            description={
              aggregates ? (
                <>
                  {/*
                    The one place the whole-directory total is rendered, and it is
                    rendered whatever the page holds — including zero rows — so a
                    browser journey can assert it does not move with the page
                    (task 9.3, ADM-03).
                  */}
                  <span data-testid="user-total-count">{totalCount}</span>{' '}
                  account{totalCount === 1 ? '' : 's'} match the current filters.
                </>
              ) : (
                'Loading the directory.'
              )
            }
            icon={<User className="h-5 w-5" />}
            actions={<Button variant="outline" size="sm" className="min-h-touch min-w-touch" onClick={() => refetch()}>Refresh users</Button>}
          >
            {state.error && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4">
                <p className="text-sm font-medium text-destructive">User operations issue</p>
                <p className="mt-1 text-sm text-foreground">{state.error}</p>
              </div>
            )}

            {loading && rows.length === 0 ? (
              <>
                <div className="block space-y-4 lg:hidden">
                  {Array.from({ length: 5 }).map((_, index) => (<CardSkeleton key={index} />))}
                </div>
                <div className="hidden lg:block"><TableSkeleton rows={8} columns={5} /></div>
              </>
            ) : rows.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border bg-muted/40 px-6 py-12 text-center">
                <UsersIcon className="mx-auto h-12 w-12 text-foreground" />
                <h3 className="mt-4 text-xl font-semibold text-foreground">
                  {hasActiveFilters ? 'No matching users' : 'No users found'}
                </h3>
                <p className="mx-auto mt-2 max-w-md text-sm text-foreground">
                  {hasActiveFilters
                    ? 'Adjust the search query or filters to widen the directory.'
                    : 'Users will appear here once accounts are created or imported into the system.'}
                </p>
                <div className="mt-6 flex flex-wrap justify-center gap-3">
                  {hasActiveFilters && (
                    <Button variant="outline" onClick={() => dispatch({ type: 'CLEAR_FILTERS' })}>Clear filters</Button>
                  )}
                  <Button onClick={() => refetch()}>Refresh users</Button>
                </div>
              </div>
            ) : (
              <>
                <div className="rounded-lg border border-border bg-muted/40 p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="space-y-1">
                      <p className="text-sm font-medium text-foreground">
                        Page {report?.page ?? 1} of {totalPages}. Sorting, filtering, and paging are the server&apos;s.
                      </p>
                      <p className="text-sm text-foreground">
                        Open a user to edit their details, inspect activity history, or review backend-derived effective access.
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2 text-xs text-foreground">
                      <span className="rounded-full border border-border bg-card px-2.5 py-1">Matching: {totalCount}</span>
                      <span className="rounded-full border border-border bg-card px-2.5 py-1">Selected: {selectedCount}</span>
                    </div>
                  </div>
                </div>

                <UsersTableSection
                  paginatedUsers={users}
                  filteredUsers={users}
                  selectedUsers={selection.selectedUsers}
                  sortField={filters.sortField}
                  sortDirection={filters.sortDirection}
                  currentPage={report?.page ?? filters.currentPage}
                  totalPages={totalPages}
                  totalSorted={totalCount}
                  pageSize={report?.pageSize || PAGE_SIZE}
                  onToggleSort={(field) => dispatch({ type: 'TOGGLE_SORT', field })}
                  onSelectAll={handleSelectAll}
                  onSelectUser={handleUserSelect}
                  onEdit={openEditDialog}
                  onPermissions={(user) => dispatch({ type: 'OPEN_PERMISSIONS', user })}
                  onActivity={(userId) => dispatch({ type: 'OPEN_ACTIVITY_LOG', userId })}
                  onDeactivate={(user) => dispatch({ type: 'OPEN_DELETE', user })}
                  onPageChange={(page) => dispatch({ type: 'SET_PAGE', page })}
                />
              </>
            )}
          </SectionCard>

          <CreateUserDialog
            open={dialogs.showCreateDialog}
            onOpenChange={(open) => { if (!open) dispatch({ type: 'CLOSE_CREATE' }) }}
            form={createFormHook as never}
            onSubmit={createUser}
            isPending={createUserMutation.isPending}
            showPassword={dialogs.showPassword}
            onTogglePassword={() => dispatch({ type: 'TOGGLE_PASSWORD' })}
          />

          <EditUserDialog
            open={dialogs.showEditDialog}
            onOpenChange={(open) => { if (!open) dispatch({ type: 'CLOSE_EDIT' }) }}
            form={editFormHook as never}
            onSubmit={updateUser}
            isPending={updateUserMutation.isPending}
            selectedUser={dialogs.selectedUser}
          />

          <DeleteUserDialog
            open={dialogs.showDeleteDialog}
            onOpenChange={(open) => { if (!open) dispatch({ type: 'CLOSE_DELETE' }) }}
            onConfirm={deactivateUser}
            isPending={deleteUserMutation.isPending}
            selectedUser={dialogs.selectedUser}
          />

          {dialogs.selectedUser && (
            <UserEffectiveCapabilities
              user={dialogs.selectedUser}
              isOpen={dialogs.showPermissionsDialog}
              onClose={() => dispatch({ type: 'CLOSE_PERMISSIONS' })}
              capabilities={effectiveCapabilitiesQuery.data ?? null}
              isLoading={effectiveCapabilitiesQuery.isLoading}
              isError={effectiveCapabilitiesQuery.isError}
            />
          )}

          <UserActivityLog
            userId={dialogs.activityLogUserId || undefined}
            isOpen={dialogs.showActivityLog}
            onClose={() => dispatch({ type: 'CLOSE_ACTIVITY_LOG' })}
          />

          <UserImport
            isOpen={dialogs.showImportDialog}
            onClose={() => dispatch({ type: 'CLOSE_IMPORT' })}
            // Refresh the directory, but leave the dialog open: the operator has
            // to be able to read what the import did — and download the rows that
            // failed (R6.4) — before it closes. The pre-9.3 page closed the dialog
            // on completion, which is why a row-level failure was unreadable in
            // practice however carefully it was reported.
            onImportComplete={() => { refetch() }}
          />
        </div>
      </PageShell>
    </>
  )
}
