import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useDebounce } from '@/hooks/useDebounce'
import { Link } from 'react-router-dom'
import type { UserProfile } from '@/types/database'
import { Button } from '@/components/ui/Button'
import { SkeletonTable as TableSkeleton, SkeletonCard as CardSkeleton } from '@/components/ui/skeleton'
import { UserMobileCard, UserTableRow } from '@/components/admin/UserRowCard'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/Dialog'
import { Container } from '@/components/ui/Container'
import { PageHeader } from '@/components/ui/PageHeader'
import { SectionCard } from '@/components/ui/SectionCard'
import { PageShell } from '@/components/ui/PageShell'
import { UserStats } from '@/components/admin/UserStats'
import { BulkUserOperations } from '@/components/admin/BulkUserOperations'
import { formatDate } from '@/lib/dateFormat'
import { UserActivityLog } from '@/components/admin/UserActivityLog'
import { UserExport } from '@/components/admin/UserExport'
import { UserImport } from '@/components/admin/UserImport'
import { UserPermissions } from '@/components/admin/UserPermissions'
import {
  useUsers,
  useCreateUser,
  useUpdateUser,
  useDeleteUser,
  useUserPermissions,
  useUpdateUserPermissions,
} from '@/hooks/useApiServices'
import {
  ArrowLeft,
  BarChart3,
  Calendar,
  CheckSquare,
  Download,
  Eye,
  EyeOff,
  Filter,
  Lock,
  Phone,
  Search,
  Shield,
  Square,
  Trophy,
  Upload,
  User,
  UserPlus,
  UserX,
  Users as UsersIcon,
} from 'lucide-react'
import { useToastStore } from '@/hooks/useToast'
import { sanitizeForLog } from '@/lib/security'
import { sanitizeForDisplay } from '@/lib/sanitize'
import type { AdminUserMutationResult } from '@/services/admin/users'

interface CreateUserForm {
  email: string
  password: string
  full_name: string
  phone: string
  role: string
}

interface EditUserForm {
  full_name: string
  email: string
  phone: string
  role: string
}

const AVAILABLE_ROLES = [
  { value: 'student', label: 'Student', description: 'Regular student user' },
  { value: 'reviewer', label: 'Reviewer', description: 'Can review submitted applications' },
  { value: 'admissions_officer', label: 'Admissions Officer', description: 'Can review applications' },
  { value: 'registrar', label: 'Registrar', description: 'Academic records management' },
  { value: 'finance_officer', label: 'Finance Officer', description: 'Payment verification' },
  { value: 'academic_head', label: 'Academic Head', description: 'Department oversight' },
  { value: 'admin', label: 'Administrator', description: 'Full system access' },
  { value: 'super_admin', label: 'Super Admin', description: 'Platform-wide administrative control' },
]

const ADMIN_ROLES = new Set(['admin', 'super_admin'])

const getRoleLabel = (role: string) => {
  const roleMatch = AVAILABLE_ROLES.find((entry) => entry.value === role)
  return roleMatch ? roleMatch.label : role.replace(/_/g, ' ').toUpperCase()
}

const getRoleDescription = (role: string) => {
  const roleMatch = AVAILABLE_ROLES.find((entry) => entry.value === role)
  return roleMatch?.description || 'Operational access role'
}

const getRoleIcon = (role: string) => {
  if (ADMIN_ROLES.has(role)) {
    return <Shield className="h-4 w-4 text-destructive" />
  }

  if (role !== 'student') {
    return <Shield className="h-4 w-4 text-primary" />
  }

  return <User className="h-4 w-4 text-foreground" />
}

const getRoleColor = (role: string) => {
  if (ADMIN_ROLES.has(role)) {
    return 'border-destructive/30 bg-destructive/5 text-destructive'
  }

  if (role !== 'student') {
    return 'border-primary/30 bg-primary/5 text-primary'
  }

  return 'border-border bg-muted text-foreground'
}

const formatJoinDate = (value?: string) => {
  if (!value) {
    return 'Unknown'
  }
  const result = formatDate(value)
  return result === 'Not available' ? 'Unknown' : result
}

const getSessionSummary = (count?: number) => {
  if (!count) {
    return 'No active sessions needed revocation.'
  }

  return `${count} active session${count === 1 ? '' : 's'} revoked.`
}

export default function AdminUsers() {
  const { data: usersData, isLoading: loading, error: queryError, refetch } = useUsers()
  const createUserMutation = useCreateUser()
  const updateUserMutation = useUpdateUser()
  const deleteUserMutation = useDeleteUser()
  const updatePermissionsMutation = useUpdateUserPermissions()
  const { success: showSuccess, info: showInfo } = useToastStore()

  const users = (usersData?.users || []) as UserProfile[]
  const totalCount = usersData?.totalCount ?? users.length
  const [error, setError] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const debouncedSearchTerm = useDebounce(searchTerm, 300)
  const [roleFilter, setRoleFilter] = useState('')
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [showEditDialog, setShowEditDialog] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [showPermissionsDialog, setShowPermissionsDialog] = useState(false)
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null)
  const [createForm, setCreateForm] = useState<CreateUserForm>({
    email: '',
    password: '',
    full_name: '',
    phone: '',
    role: 'student',
  })
  const [editForm, setEditForm] = useState<EditUserForm>({
    full_name: '',
    email: '',
    phone: '',
    role: 'student',
  })
  const [showPassword, setShowPassword] = useState(false)
  const [selectedUsers, setSelectedUsers] = useState<string[]>([])
  const [showStats, setShowStats] = useState(false)
  const [showActivityLog, setShowActivityLog] = useState(false)
  const [activityLogUserId, setActivityLogUserId] = useState<string | null>(null)
  const [showExportDialog, setShowExportDialog] = useState(false)
  const [showImportDialog, setShowImportDialog] = useState(false)

  const selectedUserId = selectedUser?.user_id || selectedUser?.id
  const permissionsQuery = useUserPermissions(showPermissionsDialog ? selectedUserId : undefined)

  useEffect(() => {
    if (queryError) {
      setError(queryError instanceof Error ? queryError.message : 'Failed to load users')
      return
    }

    setError('')
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

    if (roleFilter) {
      filtered = filtered.filter((user) => user.role === roleFilter)
    }

    return filtered
  }, [roleFilter, debouncedSearchTerm, users])

  const filteredCount = filteredUsers.length
  const selectedCount = selectedUsers.length
  const hasActiveFilters = Boolean(searchTerm || roleFilter)
  const staffCount = useMemo(() => users.filter((user) => user.role !== 'student').length, [users])
  const privilegedCount = useMemo(() => users.filter((user) => ADMIN_ROLES.has(user.role)).length, [users])
  const newThisMonthCount = useMemo(() => {
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - 30)

    return users.filter((user) => {
      if (!user.created_at) {
        return false
      }

      const createdAt = new Date(user.created_at)
      return Number.isFinite(createdAt.getTime()) && createdAt >= cutoff
    }).length
  }, [users])

  const createUser = async () => {
    try {
      const result = await createUserMutation.mutateAsync(createForm) as AdminUserMutationResult
      setError('')
      setShowCreateDialog(false)
      setCreateForm({ email: '', password: '', full_name: '', phone: '', role: 'student' })
      showSuccess('User created', `${createForm.full_name} can now sign in as ${getRoleLabel(createForm.role)}.`)
      showInfo('Secure handoff', 'Share the temporary password through a trusted channel and ask the user to change it after first sign-in.')

      if (result?.message) {
        showInfo('Admin API', result.message)
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to create user'
      console.error('Failed to create user:', sanitizeForLog(errorMessage))
      setError(errorMessage)
    }
  }

  const openEditDialog = useCallback((user: UserProfile) => {
    setSelectedUser(user)
    setEditForm({
      full_name: user.full_name || '',
      email: user.email || '',
      phone: user.phone || '',
      role: user.role || 'student',
    })
    setShowEditDialog(true)
  }, [])

  const openPermissionsDialog = useCallback((user: UserProfile) => {
    setSelectedUser(user)
    setShowPermissionsDialog(true)
  }, [])

  const openDeleteDialog = useCallback((user: UserProfile) => {
    setSelectedUser(user)
    setShowDeleteDialog(true)
  }, [])

  const updateUser = async () => {
    if (!selectedUserId) {
      return
    }

    try {
      const roleChanged = selectedUser?.role !== editForm.role
      const result = await updateUserMutation.mutateAsync({
        id: selectedUserId,
        data: editForm,
      }) as AdminUserMutationResult

      setError('')
      setShowEditDialog(false)
      setSelectedUser(null)
      showSuccess('User updated', roleChanged ? `${editForm.full_name} now has the ${getRoleLabel(editForm.role)} role.` : 'Profile details were updated.')

      if (result?.revokedSessions) {
        showInfo('Reauthentication required', getSessionSummary(result.revokedSessions))
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to update user'
      console.error('Failed to update user:', sanitizeForLog(errorMessage))
      setError(errorMessage)
    }
  }

  const deactivateUser = async () => {
    if (!selectedUserId) {
      return
    }

    try {
      const userName = selectedUser?.full_name || selectedUser?.email || 'User'
      const result = await deleteUserMutation.mutateAsync(selectedUserId) as AdminUserMutationResult
      setError('')
      setShowDeleteDialog(false)
      setSelectedUser(null)
      setSelectedUsers((current) => current.filter((id) => id !== selectedUserId))
      showSuccess('User deactivated', `${userName} no longer has access to the portal.`)

      if (result?.revokedSessions) {
        showInfo('Sessions revoked', getSessionSummary(result.revokedSessions))
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to deactivate user'
      console.error('Failed to deactivate user:', sanitizeForLog(errorMessage))
      setError(errorMessage)
    }
  }

  const savePermissions = async (permissions: string[]) => {
    if (!selectedUserId) {
      return
    }

    try {
      const result = await updatePermissionsMutation.mutateAsync({
        id: selectedUserId,
        permissions,
      })
      await refetch()
      setError('')
      showSuccess(
        'Permissions updated',
        result?.source === 'override'
          ? 'Custom access is now active for this user.'
          : 'Role-derived access has been restored for this user.',
      )
      showInfo('Reauthentication required', getSessionSummary(result?.revokedSessions))
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to update permissions'
      console.error('Failed to update permissions:', sanitizeForLog(errorMessage))
      setError(errorMessage)
      throw err
    }
  }

  const handleUserSelect = useCallback((userId: string) => {
    setSelectedUsers((current) =>
      current.includes(userId)
        ? current.filter((id) => id !== userId)
        : [...current, userId],
    )
  }, [])

  const handleSelectAll = useCallback(() => {
    if (selectedUsers.length === filteredUsers.length) {
      setSelectedUsers([])
      return
    }

    setSelectedUsers(filteredUsers.map((user) => user.user_id || user.id).filter((id): id is string => Boolean(id)))
  }, [selectedUsers.length, filteredUsers])

  const openActivityLog = useCallback((userId: string) => {
    setActivityLogUserId(userId)
    setShowActivityLog(true)
  }, [])

  return (
    <PageShell
      title="User Management"
      subtitle="Create accounts, adjust operational roles, manage effective permissions, and review account activity."
      maxWidth="7xl"
      actions={
        <div className="flex flex-wrap gap-2">
          <Link to="/admin">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Button>
          </Link>
          <Button
            onClick={() => setShowStats((current) => !current)}
            variant="ghost"
            size="sm"
          >
            <BarChart3 className="mr-2 h-4 w-4" />
            {showStats ? 'Hide stats' : 'Show stats'}
          </Button>
          <Button
            onClick={() => setShowImportDialog(true)}
            variant="ghost"
            size="sm"
          >
            <Upload className="mr-2 h-4 w-4" />
            Import
          </Button>
          <Button
            onClick={() => setShowExportDialog(true)}
            variant="ghost"
            size="sm"
          >
            <Download className="mr-2 h-4 w-4" />
            Export
          </Button>
          <Button
            onClick={() => setShowCreateDialog(true)}
            size="sm"
          >
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
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setSearchTerm('')
                setRoleFilter('')
              }}
            >
              Clear filters
            </Button>
          ) : undefined}
        >
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_16rem]">
            <Input
              label="Search users"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search by name, email, or phone"
              icon={<Search className="h-4 w-4" />}
              helperText="The directory only shows active accounts by default."
            />
            <div>
              <label className="mb-1.5 block text-sm font-medium text-foreground">
                Role
              </label>
              <div className="relative">
                <Filter className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-foreground" />
                <select
                  value={roleFilter}
                  onChange={(event) => setRoleFilter(event.target.value)}
                  className="h-11 w-full rounded-lg border border-input bg-background pl-10 pr-3 text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="">All roles</option>
                  {AVAILABLE_ROLES.map((role) => (
                    <option key={role.value} value={role.value}>
                      {role.label}
                    </option>
                  ))}
                </select>
              </div>
              <p className="mt-1.5 text-sm text-foreground">Use role filtering before running bulk actions or exports.</p>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-primary">Access changes</p>
              <p className="mt-2 text-base font-semibold text-foreground">Role and permission saves force reauthentication</p>
              <p className="mt-2 text-sm text-foreground">
                Admin role updates and custom permission overrides revoke active sessions so the next login receives fresh claims.
              </p>
            </div>
            <div className="rounded-2xl border border-border bg-muted/50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-foreground">Operational directory</p>
              <p className="mt-2 text-base font-semibold text-foreground">Deactivated users stay in history, not the live list</p>
              <p className="mt-2 text-sm text-foreground">
                Account deactivation removes sign-in access immediately while preserving audit continuity and prior application ownership.
              </p>
            </div>
            <div className="rounded-2xl border border-border bg-muted/50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-foreground">Account creation</p>
              <p className="mt-2 text-base font-semibold text-foreground">Phone, role, and seeded profile basics are captured together</p>
              <p className="mt-2 text-sm text-foreground">
                New users now leave this screen with the contact details and initial operational role the rest of the admin system expects.
              </p>
            </div>
          </div>
        </SectionCard>

        {showStats && (
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
              selectedUsers={selectedUsers}
              onSelectionChange={setSelectedUsers}
              onOperationComplete={() => refetch()}
            />
          </SectionCard>
        )}

        <SectionCard
          title="Active user directory"
          description={`${filteredCount} of ${totalCount} active accounts are currently shown.`}
          icon={<User className="h-5 w-5" />}
          actions={(
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              Refresh users
            </Button>
          )}
        >
          {error && (
            <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4">
              <p className="text-sm font-medium text-destructive">User operations issue</p>
              <p className="mt-1 text-sm text-foreground">{error}</p>
            </div>
          )}

          {loading ? (
            <>
              <div className="block space-y-4 lg:hidden">
                {Array.from({ length: 5 }).map((_, index) => (
                  <CardSkeleton key={index} />
                ))}
              </div>
              <div className="hidden lg:block">
                <TableSkeleton rows={8} columns={5} />
              </div>
            </>
          ) : filteredUsers.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border bg-muted/40 px-6 py-12 text-center">
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
                  <Button
                    variant="outline"
                    onClick={() => {
                      setSearchTerm('')
                      setRoleFilter('')
                    }}
                  >
                    Clear filters
                  </Button>
                )}
                <Button onClick={() => refetch()}>Refresh users</Button>
              </div>
            </div>
          ) : (
            <>
              <div className="rounded-2xl border border-border bg-muted/40 p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-foreground">Showing the operational active-user directory.</p>
                    <p className="text-sm text-foreground">
                      Open a user to edit role, inspect activity history, or manage effective permissions without leaving this screen.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2 text-xs text-foreground">
                    <span className="rounded-full border border-border bg-card px-2.5 py-1">
                      Filtered: {filteredCount}
                    </span>
                    <span className="rounded-full border border-border bg-card px-2.5 py-1">
                      Selected: {selectedCount}
                    </span>
                  </div>
                </div>
              </div>

              <div className="block space-y-4 lg:hidden">
                {filteredUsers.map((user) => {
                  const userId = user.user_id || user.id
                  return (
                    <UserMobileCard
                      key={userId}
                      user={user}
                      isSelected={selectedUsers.includes(userId)}
                      onSelect={handleUserSelect}
                      onEdit={openEditDialog}
                      onPermissions={openPermissionsDialog}
                      onActivity={openActivityLog}
                      onDeactivate={openDeleteDialog}
                    />
                  )
                })}
              </div>

              <div className="hidden overflow-x-auto lg:block">
                <table className="min-w-full divide-y divide-border" aria-label="Users">
                  <thead className="bg-muted/50">
                    <tr>
                      <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-foreground">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={handleSelectAll}
                            className="text-primary hover:text-primary"
                            aria-label={selectedUsers.length === filteredUsers.length ? 'Deselect all users' : 'Select all users'}
                          >
                            {selectedUsers.length === filteredUsers.length && filteredUsers.length > 0 ? (
                              <CheckSquare className="h-4 w-4" />
                            ) : (
                              <Square className="h-4 w-4" />
                            )}
                          </button>
                          <span>User</span>
                        </div>
                      </th>
                      <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-foreground">
                        <div className="flex items-center gap-2">
                          <Phone className="h-4 w-4" />
                          Contact
                        </div>
                      </th>
                      <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-foreground">
                        <div className="flex items-center gap-2">
                          <Trophy className="h-4 w-4" />
                          Role
                        </div>
                      </th>
                      <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-foreground">
                        <div className="flex items-center gap-2">
                          <Calendar className="h-4 w-4" />
                          Joined
                        </div>
                      </th>
                      <th scope="col" className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-foreground">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border bg-card">
                    {filteredUsers.map((user) => {
                      const userId = user.user_id || user.id
                      return (
                        <UserTableRow
                          key={userId}
                          user={user}
                          isSelected={selectedUsers.includes(userId)}
                          onSelect={handleUserSelect}
                          onEdit={openEditDialog}
                          onPermissions={openPermissionsDialog}
                          onActivity={openActivityLog}
                          onDeactivate={openDeleteDialog}
                        />
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </SectionCard>

        <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <UserPlus className="h-5 w-5 text-primary" />
                <span>Create user</span>
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="rounded-2xl border border-border bg-muted/50 p-4">
                <p className="text-sm font-medium text-foreground">Create the account with its operational role from the start.</p>
                <p className="mt-1 text-sm text-foreground">
                  The phone number captured here now feeds the same profile/contact flows used elsewhere in the system.
                </p>
              </div>
              <Input
                label="Full name"
                value={createForm.full_name}
                onChange={(event) => setCreateForm({ ...createForm, full_name: event.target.value })}
                placeholder="Enter full name"
                required
              />
              <Input
                label="Email"
                type="email"
                value={createForm.email}
                onChange={(event) => setCreateForm({ ...createForm, email: event.target.value })}
                placeholder="Enter email address"
                required
              />
              <div className="relative">
                <Input
                  label="Temporary password"
                  type={showPassword ? 'text' : 'password'}
                  value={createForm.password}
                  onChange={(event) => setCreateForm({ ...createForm, password: event.target.value })}
                  placeholder="Enter password"
                  helperText="Share this securely with the user after creation."
                  required
                />
                <button
                  type="button"
                  className="absolute right-3 top-[2.75rem] text-foreground hover:text-foreground"
                  onClick={() => setShowPassword((current) => !current)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
                </button>
              </div>
              <Input
                label="Phone"
                value={createForm.phone}
                onChange={(event) => setCreateForm({ ...createForm, phone: event.target.value })}
                placeholder="Enter phone number"
              />
              <div>
                <label className="mb-1.5 block text-sm font-medium text-foreground">
                  Role <span className="text-destructive">*</span>
                </label>
                <select
                  value={createForm.role}
                  onChange={(event) => setCreateForm({ ...createForm, role: event.target.value })}
                  className="h-11 w-full rounded-lg border border-input bg-background px-3 text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  required
                >
                  {AVAILABLE_ROLES.map((role) => (
                    <option key={role.value} value={role.value}>
                      {role.label} - {role.description}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowCreateDialog(false)} disabled={createUserMutation.isPending}>
                Cancel
              </Button>
              <Button onClick={createUser} loading={createUserMutation.isPending}>
                Create user
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <User className="h-5 w-5 text-primary" />
                <span>Edit user</span>
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              {selectedUser && (
                <div className="rounded-2xl border border-border bg-muted/50 p-4">
                  <p className="text-sm font-medium text-foreground">{sanitizeForDisplay(selectedUser.email)}</p>
                  <p className="mt-1 text-sm text-foreground">
                    Changing the assigned role revokes active sessions so the user signs in again with fresh access.
                  </p>
                </div>
              )}
              <Input
                label="Full name"
                value={editForm.full_name}
                onChange={(event) => setEditForm({ ...editForm, full_name: event.target.value })}
                placeholder="Enter full name"
                required
              />
              <Input
                label="Email"
                type="email"
                value={editForm.email}
                onChange={(event) => setEditForm({ ...editForm, email: event.target.value })}
                placeholder="Enter email address"
                required
              />
              <Input
                label="Phone"
                value={editForm.phone}
                onChange={(event) => setEditForm({ ...editForm, phone: event.target.value })}
                placeholder="Enter phone number"
              />
              <div>
                <label className="mb-1.5 block text-sm font-medium text-foreground">
                  Role <span className="text-destructive">*</span>
                </label>
                <select
                  value={editForm.role}
                  onChange={(event) => setEditForm({ ...editForm, role: event.target.value })}
                  className="h-11 w-full rounded-lg border border-input bg-background px-3 text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  required
                  disabled={selectedUser?.role === 'super_admin'}
                >
                  {AVAILABLE_ROLES.map((role) => (
                    <option key={role.value} value={role.value}>
                      {role.label} - {role.description}
                    </option>
                  ))}
                </select>
                {selectedUser?.role === 'super_admin' ? (
                  <p className="mt-1.5 text-sm text-foreground">Super admin access is locked from this dialog.</p>
                ) : (
                  <p className="mt-1.5 text-sm text-foreground">Role changes end active sessions and require the user to sign in again.</p>
                )}
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowEditDialog(false)} disabled={updateUserMutation.isPending}>
                Cancel
              </Button>
              <Button onClick={updateUser} loading={updateUserMutation.isPending}>
                Update user
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-destructive">
                <UserX className="h-5 w-5" />
                <span>Deactivate user</span>
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-1">
              <p className="text-sm text-foreground">
                Deactivate <strong>{sanitizeForDisplay(selectedUser?.full_name || selectedUser?.email)}</strong>?
              </p>
              <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4">
                <p className="text-sm font-medium text-destructive">This removes live sign-in access immediately.</p>
                <p className="mt-1 text-sm text-foreground">
                  Existing sessions are revoked, but audit history and owned records remain intact for operational traceability.
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowDeleteDialog(false)} disabled={deleteUserMutation.isPending}>
                Cancel
              </Button>
              <Button onClick={deactivateUser} loading={deleteUserMutation.isPending} variant="destructive">
                Deactivate user
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {selectedUser && (
          <UserPermissions
            user={selectedUser}
            isOpen={showPermissionsDialog}
            onClose={() => setShowPermissionsDialog(false)}
            onSave={savePermissions}
            initialPermissions={permissionsQuery.data?.permissions ?? null}
            permissionSource={permissionsQuery.data?.source ?? 'role'}
            isLoading={permissionsQuery.isLoading || updatePermissionsMutation.isPending}
          />
        )}

        <UserActivityLog
          userId={activityLogUserId || undefined}
          isOpen={showActivityLog}
          onClose={() => {
            setShowActivityLog(false)
            setActivityLogUserId(null)
          }}
        />

        <UserExport
          users={users}
          isOpen={showExportDialog}
          onClose={() => setShowExportDialog(false)}
        />

        <UserImport
          isOpen={showImportDialog}
          onClose={() => setShowImportDialog(false)}
          onImportComplete={() => {
            setShowImportDialog(false)
            refetch()
          }}
        />
      </div>
    </PageShell>
  )
}
