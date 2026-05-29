import { useCallback, useEffect, useMemo, useReducer } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from '@/lib/zod'
import { isSuperAdmin } from '@/types/roles'
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
import { UserExport } from '@/components/admin/UserExport'
import { UserImport } from '@/components/admin/UserImport'
import { UserPermissions } from '@/components/admin/UserPermissions'
import { usersData as userQueries } from '@/data/users'
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
import { isAdminRole } from '@/lib/auth/roles'
import type { AdminUserMutationResult } from '@/services/admin/users'
import { logger } from '@/lib/logger'
import {
  usersReducer,
  initialUsersState,
  ROLE_VALUES,
  AVAILABLE_ROLES,
  getRoleLabel,
  getSessionSummary,
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

export default function AdminUsers() {
  const { data: usersData, isLoading: loading, error: queryError, refetch } = userQueries.useList()
  const createUserMutation = userQueries.useCreate()
  const updateUserMutation = userQueries.useUpdate()
  const deleteUserMutation = userQueries.useRemove()
  const updatePermissionsMutation = userQueries.useUpdatePermissions()
  const { success: showSuccess, info: showInfo } = useToastStore()

  const [state, dispatch] = useReducer(usersReducer, initialUsersState)
  const { dialogs, filters, selection } = state

  const users = (usersData?.users || []) as UserProfile[]
  const totalCount = usersData?.totalCount ?? users.length
  const debouncedSearchTerm = useDebounce(filters.searchTerm, 300)

  const selectedUserId = dialogs.selectedUser?.user_id || dialogs.selectedUser?.id
  const permissionsQuery = userQueries.usePermissions(dialogs.showPermissionsDialog ? selectedUserId : undefined)

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
      dispatch({ type: 'SET_ERROR', payload: queryError instanceof Error ? queryError.message : 'Failed to load users' })
    } else {
      dispatch({ type: 'SET_ERROR', payload: '' })
    }
  }, [queryError])

  const filteredUsers = useMemo(() => {
    let filtered = users
    if (debouncedSearchTerm) {
      const normalizedSearch = debouncedSearchTerm.toLowerCase()
      filtered = filtered.filter((user) =>
        user.full_name?.toLowerCase().includes(normalizedSearch) ||
        user.email?.toLowerCase().includes(normalizedSearch) ||
        user.phone?.includes(debouncedSearchTerm),
      )
    }
    if (filters.roleFilter) {
      filtered = filtered.filter((user) => user.role === filters.roleFilter)
    }
    return filtered
  }, [filters.roleFilter, debouncedSearchTerm, users])

  const sortedUsers = useMemo(() => {
    const sorted = [...filteredUsers]
    sorted.sort((a, b) => {
      let cmp = 0
      switch (filters.sortField) {
        case 'name': cmp = (a.full_name || '').localeCompare(b.full_name || ''); break
        case 'email': cmp = (a.email || '').localeCompare(b.email || ''); break
        case 'role': cmp = (a.role || '').localeCompare(b.role || ''); break
        case 'created': cmp = (a.created_at || '').localeCompare(b.created_at || ''); break
      }
      return filters.sortDirection === 'asc' ? cmp : -cmp
    })
    return sorted
  }, [filteredUsers, filters.sortField, filters.sortDirection])

  const totalPages = Math.max(1, Math.ceil(sortedUsers.length / PAGE_SIZE))
  const paginatedUsers = useMemo(() => {
    const start = (filters.currentPage - 1) * PAGE_SIZE
    return sortedUsers.slice(start, start + PAGE_SIZE)
  }, [sortedUsers, filters.currentPage])

  useEffect(() => { dispatch({ type: 'RESET_PAGE' }) }, [debouncedSearchTerm, filters.roleFilter])

  const filteredCount = filteredUsers.length
  const selectedCount = selection.selectedUsers.length
  const hasActiveFilters = Boolean(filters.searchTerm || filters.roleFilter)

  const createUser = createFormHook.handleSubmit(async (values) => {
    try {
      const result = await createUserMutation.mutateAsync(values) as AdminUserMutationResult
      dispatch({ type: 'SET_ERROR', payload: '' })
      dispatch({ type: 'CLOSE_CREATE' })
      createFormHook.reset({ email: '', password: '', full_name: '', phone: '', role: 'student' })
      showSuccess('User created', `${values.full_name} can now sign in as ${getRoleLabel(values.role)}.`)
      showInfo('Secure handoff', 'Share the temporary password through a trusted channel and ask the user to change it after first sign-in.')
      if (result?.message) showInfo('Admin API', result.message)
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
      const result = await updateUserMutation.mutateAsync({ id: selectedUserId, data: values }) as AdminUserMutationResult
      dispatch({ type: 'SET_ERROR', payload: '' })
      dispatch({ type: 'CLOSE_EDIT' })
      showSuccess('User updated', roleChanged ? `${values.full_name} now has the ${getRoleLabel(values.role)} role.` : 'Profile details were updated.')
      if (result?.revokedSessions) showInfo('Reauthentication required', getSessionSummary(result.revokedSessions))
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
      const result = await deleteUserMutation.mutateAsync(selectedUserId) as AdminUserMutationResult
      dispatch({ type: 'SET_ERROR', payload: '' })
      dispatch({ type: 'CLOSE_DELETE' })
      dispatch({ type: 'REMOVE_FROM_SELECTION', userId: selectedUserId })
      showSuccess('User deactivated', `${userName} no longer has access to the portal.`)
      if (result?.revokedSessions) showInfo('Sessions revoked', getSessionSummary(result.revokedSessions))
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to deactivate user'
      logger.error('Failed to deactivate user:', sanitizeForLog(errorMessage))
      dispatch({ type: 'SET_ERROR', payload: errorMessage })
    }
  }

  const savePermissions = async (permissions: string[]) => {
    if (!selectedUserId) return
    try {
      const result = await updatePermissionsMutation.mutateAsync({ id: selectedUserId, permissions })
      await refetch()
      dispatch({ type: 'SET_ERROR', payload: '' })
      showSuccess(
        'Permissions updated',
        result?.source === 'override'
          ? 'Custom access is now active for this user.'
          : 'Role-derived access has been restored for this user.',
      )
      showInfo('Reauthentication required', getSessionSummary(result?.revokedSessions))
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to update permissions'
      logger.error('Failed to update permissions:', sanitizeForLog(errorMessage))
      dispatch({ type: 'SET_ERROR', payload: errorMessage })
      throw err
    }
  }

  const handleSelectAll = useCallback(() => {
    if (selection.selectedUsers.length === filteredUsers.length) {
      dispatch({ type: 'DESELECT_ALL' })
    } else {
      dispatch({ type: 'SELECT_ALL', userIds: filteredUsers.map((u) => u.user_id || u.id).filter((id): id is string => Boolean(id)) })
    }
  }, [selection.selectedUsers.length, filteredUsers])

  const handleUserSelect = useCallback((userId: string) => {
    dispatch({ type: 'TOGGLE_USER', userId })
  }, [])

  return (
    <>
      <Seo
        title="User Management | MIHAS-KATC Admissions"
        description="Create accounts, manage roles, permissions, and review user activity."
        path="/admin/users"
        noindex
      />
      <PageShell
        title="User Management"
        eyebrow="People & Access"
        subtitle="Create accounts, adjust operational roles, manage effective permissions, and review account activity."
        maxWidth="7xl"
        tone="admin"
        metrics={[
          { label: 'Users', value: totalCount, helper: `${filteredCount} currently match filters` },
          { label: 'Selected', value: selection.selectedUsers.length, helper: 'Bulk action selection size' },
          { label: 'Visible list', value: filteredUsers.length, helper: 'Users shown on the current screen' },
          { label: 'State', value: state.error ? 'Needs attention' : 'Ready', helper: state.error || 'Permissions and role actions available' },
        ]}
        actions={
          <div className="flex flex-wrap gap-2">
            <Link to="/admin">
              <Button variant="ghost" size="sm" className="min-h-touch min-w-touch">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back
              </Button>
            </Link>
            <Button onClick={() => dispatch({ type: 'TOGGLE_STATS' })} variant="ghost" size="sm" className="min-h-touch min-w-touch">
              <BarChart3 className="mr-2 h-4 w-4" />
              {dialogs.showStats ? 'Hide stats' : 'Show stats'}
            </Button>
            <Button onClick={() => dispatch({ type: 'OPEN_IMPORT' })} variant="ghost" size="sm" className="min-h-touch min-w-touch">
              <Upload className="mr-2 h-4 w-4" />
              Import
            </Button>
            <Button onClick={() => dispatch({ type: 'OPEN_EXPORT' })} variant="ghost" size="sm" className="min-h-touch min-w-touch">
              <Download className="mr-2 h-4 w-4" />
              Export
            </Button>
            <Button onClick={() => dispatch({ type: 'OPEN_CREATE' })} size="sm" className="min-h-touch min-w-touch">
              <UserPlus className="mr-2 h-4 w-4" />
              Add user
            </Button>
          </div>
        }
      >
        <div className="space-y-6">
          <SectionCard
            title="Filter and operate"
            description="Search the active directory, narrow by role, and keep the user operations workflow aligned with how access is really enforced."
            icon={<Filter className="h-5 w-5" />}
            actions={hasActiveFilters ? (
              <Button variant="outline" size="sm" className="min-h-touch min-w-touch" onClick={() => dispatch({ type: 'CLEAR_FILTERS' })}>
                Clear filters
              </Button>
            ) : undefined}
          >
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_16rem]">
              <Input
                label="Search users"
                value={filters.searchTerm}
                onChange={(event) => dispatch({ type: 'SET_SEARCH', payload: event.target.value })}
                placeholder="Search by name, email, or phone"
                icon={<Search className="h-4 w-4" />}
                helperText="The directory only shows active accounts by default."
              />
              <div>
                <label className="mb-1.5 block text-sm font-medium text-foreground">Role</label>
                <div className="relative">
                  <Filter className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-foreground" />
                  <select
                    value={filters.roleFilter}
                    onChange={(event) => dispatch({ type: 'SET_ROLE_FILTER', payload: event.target.value })}
                    className="min-h-touch h-12 w-full rounded-lg border border-input bg-background pl-10 pr-3 text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  >
                    <option value="">All roles</option>
                    {AVAILABLE_ROLES.map((role) => (
                      <option key={role.value} value={role.value}>{role.label}</option>
                    ))}
                  </select>
                </div>
                <p className="mt-1.5 text-sm text-foreground">Use role filtering before running bulk actions or exports.</p>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-primary">Access changes</p>
                <p className="mt-2 text-base font-semibold text-foreground">Role and permission saves force reauthentication</p>
                <p className="mt-2 text-sm text-foreground">
                  Admin role updates and custom permission overrides revoke active sessions so the next login receives fresh claims.
                </p>
              </div>
              <div className="rounded-lg border border-border bg-muted/50 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-foreground">Operational directory</p>
                <p className="mt-2 text-base font-semibold text-foreground">Deactivated users stay in history, not the live list</p>
                <p className="mt-2 text-sm text-foreground">
                  Account deactivation removes sign-in access immediately while preserving audit continuity and prior application ownership.
                </p>
              </div>
              <div className="rounded-lg border border-border bg-muted/50 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-foreground">Account creation</p>
                <p className="mt-2 text-base font-semibold text-foreground">Phone, role, and seeded profile basics are captured together</p>
                <p className="mt-2 text-sm text-foreground">
                  New users now leave this screen with the contact details and initial operational role the rest of the admin system expects.
                </p>
              </div>
            </div>
          </SectionCard>

          {dialogs.showStats && (
            <SectionCard
              title="Directory statistics"
              description="Use this summary when reviewing staffing mix before imports, bulk changes, or audit follow-up."
              icon={<BarChart3 className="h-5 w-5" />}
            >
              <UserStats users={users} />
            </SectionCard>
          )}

          {selectedCount > 0 && (
            <SectionCard
              title={`Bulk operations (${selectedCount} selected)`}
              description="Bulk changes apply only to the currently selected active accounts."
              icon={<CheckSquare className="h-5 w-5" />}
            >
              <BulkUserOperations
                users={filteredUsers}
                selectedUsers={selection.selectedUsers}
                onSelectionChange={(ids) => dispatch({ type: 'SELECT_ALL', userIds: ids })}
                onOperationComplete={() => refetch()}
              />
            </SectionCard>
          )}

          <SectionCard
            title="Active user directory"
            description={`${filteredCount} of ${totalCount} active accounts are currently shown.`}
            icon={<User className="h-5 w-5" />}
            actions={<Button variant="outline" size="sm" className="min-h-touch min-w-touch" onClick={() => refetch()}>Refresh users</Button>}
          >
            {state.error && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4">
                <p className="text-sm font-medium text-destructive">User operations issue</p>
                <p className="mt-1 text-sm text-foreground">{state.error}</p>
              </div>
            )}

            {loading ? (
              <>
                <div className="block space-y-4 lg:hidden">
                  {Array.from({ length: 5 }).map((_, index) => (<CardSkeleton key={index} />))}
                </div>
                <div className="hidden lg:block"><TableSkeleton rows={8} columns={5} /></div>
              </>
            ) : filteredUsers.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border bg-muted/40 px-6 py-12 text-center">
                <UsersIcon className="mx-auto h-12 w-12 text-foreground" />
                <h3 className="mt-4 text-xl font-semibold text-foreground">
                  {hasActiveFilters ? 'No matching users' : 'No active users found'}
                </h3>
                <p className="mx-auto mt-2 max-w-md text-sm text-foreground">
                  {hasActiveFilters
                    ? 'Adjust the search query or role filter to widen the directory.'
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
                      <p className="text-sm font-medium text-foreground">Showing the operational active-user directory.</p>
                      <p className="text-sm text-foreground">
                        Open a user to edit role, inspect activity history, or manage effective permissions without leaving this screen.
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2 text-xs text-foreground">
                      <span className="rounded-full border border-border bg-card px-2.5 py-1">Filtered: {filteredCount}</span>
                      <span className="rounded-full border border-border bg-card px-2.5 py-1">Selected: {selectedCount}</span>
                    </div>
                  </div>
                </div>

                <UsersTableSection
                  paginatedUsers={paginatedUsers}
                  filteredUsers={filteredUsers}
                  selectedUsers={selection.selectedUsers}
                  sortField={filters.sortField}
                  sortDirection={filters.sortDirection}
                  currentPage={filters.currentPage}
                  totalPages={totalPages}
                  totalSorted={sortedUsers.length}
                  pageSize={PAGE_SIZE}
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
            <UserPermissions
              user={dialogs.selectedUser}
              isOpen={dialogs.showPermissionsDialog}
              onClose={() => dispatch({ type: 'CLOSE_PERMISSIONS' })}
              onSave={savePermissions}
              initialPermissions={permissionsQuery.data?.permissions ?? null}
              permissionSource={permissionsQuery.data?.source ?? 'role'}
              isLoading={permissionsQuery.isLoading || updatePermissionsMutation.isPending}
            />
          )}

          <UserActivityLog
            userId={dialogs.activityLogUserId || undefined}
            isOpen={dialogs.showActivityLog}
            onClose={() => dispatch({ type: 'CLOSE_ACTIVITY_LOG' })}
          />

          <UserExport
            users={users}
            isOpen={dialogs.showExportDialog}
            onClose={() => dispatch({ type: 'CLOSE_EXPORT' })}
          />

          <UserImport
            isOpen={dialogs.showImportDialog}
            onClose={() => dispatch({ type: 'CLOSE_IMPORT' })}
            onImportComplete={() => { dispatch({ type: 'CLOSE_IMPORT' }); refetch() }}
          />
        </div>
      </PageShell>
    </>
  )
}
