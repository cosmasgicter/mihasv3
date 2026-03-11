import React, { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/Dialog'
import { UnifiedLoader } from '@/components/ui/UnifiedLoader'
import type { UserProfile } from '@/types/database'
import {
  BarChart3,
  DollarSign,
  Edit,
  Eye,
  FileText,
  Lock,
  RotateCcw,
  Settings,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  Unlock,
  Users,
} from 'lucide-react'

interface UserPermissionsProps {
  user: UserProfile
  isOpen: boolean
  initialPermissions?: string[] | null
  permissionSource?: string | null
  isLoading?: boolean
  readOnly?: boolean
  onClose: () => void
  onSave: (permissions: string[]) => Promise<void>
}

interface Permission {
  id: string
  name: string
  description: string
  icon: React.ReactNode
  category: string
}

const AVAILABLE_PERMISSIONS: Permission[] = [
  { id: 'users:read', name: 'View Users', description: 'Can view user profiles and lists', icon: <Eye className="h-4 w-4" />, category: 'User Management' },
  { id: 'users:write', name: 'Create or Edit Users', description: 'Can create users and update user roles or profile details', icon: <Users className="h-4 w-4" />, category: 'User Management' },
  { id: 'users:delete', name: 'Delete Users', description: 'Can deactivate user accounts', icon: <Trash2 className="h-4 w-4" />, category: 'User Management' },
  { id: 'applications:create', name: 'Create Applications', description: 'Can start new student applications', icon: <Edit className="h-4 w-4" />, category: 'Applications' },
  { id: 'applications:read', name: 'View Applications', description: 'Can view application submissions', icon: <FileText className="h-4 w-4" />, category: 'Applications' },
  { id: 'applications:review', name: 'Review Applications', description: 'Can review and process applications', icon: <Edit className="h-4 w-4" />, category: 'Applications' },
  { id: 'applications:write', name: 'Update Applications', description: 'Can update application records and statuses', icon: <Shield className="h-4 w-4" />, category: 'Applications' },
  { id: 'applications:read_own', name: 'View Own Applications', description: 'Can view personal application records only', icon: <Eye className="h-4 w-4" />, category: 'Applications' },
  { id: 'applications:update_own', name: 'Update Own Applications', description: 'Can edit personal application records only', icon: <Edit className="h-4 w-4" />, category: 'Applications' },
  { id: 'payments:read', name: 'View Payments', description: 'Can view payment records', icon: <DollarSign className="h-4 w-4" />, category: 'Finance' },
  { id: 'payments:verify', name: 'Verify Payments', description: 'Can verify payment proofs', icon: <Shield className="h-4 w-4" />, category: 'Finance' },
  { id: 'payments:make_own', name: 'Make Own Payments', description: 'Can submit personal application payments', icon: <DollarSign className="h-4 w-4" />, category: 'Finance' },
  { id: 'payments:read_own', name: 'View Own Payments', description: 'Can view personal payment records only', icon: <Eye className="h-4 w-4" />, category: 'Finance' },
  { id: 'programs:read', name: 'View Programs', description: 'Can access programme and institution data', icon: <FileText className="h-4 w-4" />, category: 'Programs' },
  { id: 'programs:write', name: 'Manage Programs', description: 'Can update programme and institution records', icon: <Edit className="h-4 w-4" />, category: 'Programs' },
  { id: 'documents:read', name: 'View Documents', description: 'Can access uploaded application documents', icon: <FileText className="h-4 w-4" />, category: 'Documents' },
  { id: 'documents:verify', name: 'Verify Documents', description: 'Can verify uploaded application documents', icon: <Shield className="h-4 w-4" />, category: 'Documents' },
  { id: 'documents:upload_own', name: 'Upload Own Documents', description: 'Can upload personal supporting documents', icon: <Edit className="h-4 w-4" />, category: 'Documents' },
  { id: 'documents:read_own', name: 'View Own Documents', description: 'Can access personal uploaded documents only', icon: <Eye className="h-4 w-4" />, category: 'Documents' },
  { id: 'profile:read_own', name: 'View Own Profile', description: 'Can access personal profile details only', icon: <Eye className="h-4 w-4" />, category: 'Profile' },
  { id: 'profile:update_own', name: 'Update Own Profile', description: 'Can edit personal profile details only', icon: <Edit className="h-4 w-4" />, category: 'Profile' },
  { id: 'settings:read', name: 'View Settings', description: 'Can access system settings', icon: <Settings className="h-4 w-4" />, category: 'System' },
  { id: 'settings:write', name: 'Update Settings', description: 'Can modify system configurations', icon: <Settings className="h-4 w-4" />, category: 'System' },
  { id: 'analytics:read', name: 'View Analytics', description: 'Can access system analytics and reports', icon: <BarChart3 className="h-4 w-4" />, category: 'System' },
]

const ROLE_DEFAULT_PERMISSIONS: Record<string, string[]> = {
  student: ['applications:create', 'applications:read_own', 'applications:update_own', 'documents:upload_own', 'documents:read_own', 'payments:make_own', 'payments:read_own', 'profile:read_own', 'profile:update_own'],
  reviewer: ['applications:read', 'applications:review', 'documents:read'],
  admissions_officer: ['applications:read', 'applications:review', 'applications:write', 'documents:read', 'documents:verify', 'payments:read'],
  registrar: ['applications:read', 'applications:review', 'programs:read', 'documents:read', 'analytics:read'],
  finance_officer: ['applications:read', 'payments:read', 'payments:verify', 'documents:read'],
  academic_head: ['applications:read', 'applications:review', 'programs:read', 'documents:read', 'analytics:read'],
  admin: ['users:read', 'applications:read', 'applications:write', 'applications:review', 'programs:read', 'payments:read', 'payments:verify', 'documents:read', 'documents:verify', 'analytics:read'],
  super_admin: AVAILABLE_PERMISSIONS.map((permission) => permission.id),
}

const haveSamePermissions = (left: string[], right: string[]) => {
  if (left.length !== right.length) {
    return false
  }

  const rightSet = new Set(right)
  return left.every((permission) => rightSet.has(permission))
}

const formatRoleLabel = (role: string) => role.replace(/_/g, ' ')

const getSourceLabel = (source?: string | null) => (source === 'override' ? 'Custom override' : 'Role derived')

export function UserPermissions({
  user,
  isOpen,
  onClose,
  onSave,
  initialPermissions,
  permissionSource,
  isLoading,
  readOnly = false,
}: UserPermissionsProps) {
  const defaultPermissions = useMemo(() => ROLE_DEFAULT_PERMISSIONS[user.role] || [], [user.role])
  const [selectedPermissions, setSelectedPermissions] = useState<string[]>(() => [...defaultPermissions])
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    if (!isOpen) {
      return
    }

    if (Array.isArray(initialPermissions)) {
      setSelectedPermissions([...initialPermissions])
      return
    }

    setSelectedPermissions([...defaultPermissions])
  }, [defaultPermissions, initialPermissions, isOpen])

  const isBusy = Boolean(isLoading) || isSaving
  const matchesRoleDefaults = useMemo(
    () => haveSamePermissions(selectedPermissions, defaultPermissions),
    [defaultPermissions, selectedPermissions],
  )
  const pendingSource = matchesRoleDefaults ? 'role' : 'override'
  const addedPermissions = useMemo(
    () => selectedPermissions.filter((permission) => !defaultPermissions.includes(permission)),
    [defaultPermissions, selectedPermissions],
  )
  const removedPermissions = useMemo(
    () => defaultPermissions.filter((permission) => !selectedPermissions.includes(permission)),
    [defaultPermissions, selectedPermissions],
  )
  const categories = [...new Set(AVAILABLE_PERMISSIONS.map((permission) => permission.category))]

  const handlePermissionToggle = (permissionId: string) => {
    if (isBusy || readOnly) {
      return
    }

    setSelectedPermissions((current) =>
      current.includes(permissionId)
        ? current.filter((id) => id !== permissionId)
        : [...current, permissionId],
    )
  }

  const handleSelectAllInCategory = (category: string) => {
    if (isBusy || readOnly) {
      return
    }

    const categoryPermissions = AVAILABLE_PERMISSIONS
      .filter((permission) => permission.category === category)
      .map((permission) => permission.id)

    const allSelected = categoryPermissions.every((permission) => selectedPermissions.includes(permission))

    if (allSelected) {
      setSelectedPermissions((current) => current.filter((permission) => !categoryPermissions.includes(permission)))
      return
    }

    setSelectedPermissions((current) => {
      const next = new Set(current)
      categoryPermissions.forEach((permission) => next.add(permission))
      return [...next]
    })
  }

  const handleResetToRoleDefaults = () => {
    if (isBusy || readOnly) {
      return
    }

    setSelectedPermissions([...defaultPermissions])
  }

  const handleSave = async () => {
    if (isBusy) {
      return
    }

    try {
      setIsSaving(true)
      await onSave(selectedPermissions)
      onClose()
    } catch {
      // parent page surfaces the error toast/banner
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-4xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            <span>{readOnly ? 'Effective Permissions' : 'Manage Permissions'} for {user.full_name}</span>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-border bg-muted/60 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-foreground">Assigned role</p>
              <p className="mt-2 text-lg font-semibold text-foreground">{formatRoleLabel(user.role)}</p>
              <p className="mt-1 text-sm text-foreground">Role defaults start from this access baseline.</p>
            </div>
            <div className="rounded-2xl border border-border bg-muted/60 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-foreground">Current source</p>
              <div className="mt-2 inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-sm font-medium text-foreground">
                {permissionSource === 'override' ? <ShieldAlert className="h-4 w-4 text-warning" /> : <ShieldCheck className="h-4 w-4 text-success" />}
                <span>{getSourceLabel(permissionSource)}</span>
              </div>
              <p className="mt-2 text-sm text-foreground">
                {permissionSource === 'override'
                  ? 'This account already has custom access beyond the role defaults.'
                  : 'This account currently inherits access directly from the assigned role.'}
              </p>
            </div>
            <div className="rounded-2xl border border-border bg-muted/60 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-foreground">{readOnly ? 'Effective total' : 'After save'}</p>
              <div className="mt-2 inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-sm font-medium text-foreground">
                {pendingSource === 'override' ? <ShieldAlert className="h-4 w-4 text-warning" /> : <ShieldCheck className="h-4 w-4 text-success" />}
                <span>{readOnly ? `${selectedPermissions.length} permissions` : getSourceLabel(pendingSource)}</span>
              </div>
              <p className="mt-2 text-sm text-foreground">
                {readOnly
                  ? 'This is the access the user receives at sign-in.'
                  : pendingSource === 'override'
                    ? 'Saving will keep or create a custom permission override for this account.'
                    : 'Saving will remove any custom override and return the user to role-derived access.'}
              </p>
            </div>
          </div>

          <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4">
            <div className="flex items-start gap-3">
              <Shield className="mt-0.5 h-5 w-5 text-primary" />
              <div className="space-y-1">
                <p className="font-medium text-foreground">Active sessions are revoked after access changes.</p>
                <p className="text-sm text-foreground">
                  Saving permissions signs the user out of active devices so the next login gets fresh role and permission claims.
                </p>
              </div>
            </div>
          </div>

          {!readOnly && (
            <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 md:flex-row md:items-center md:justify-between">
              <div className="space-y-2">
                <p className="text-sm font-medium text-foreground">
                  {matchesRoleDefaults
                    ? 'The current selection matches the role defaults.'
                    : 'This selection differs from the role defaults and will save as a custom override.'}
                </p>
                <div className="flex flex-wrap gap-2 text-xs text-foreground">
                  <span className="rounded-full border border-success/30 bg-success/10 px-2.5 py-1">
                    Added: {addedPermissions.length}
                  </span>
                  <span className="rounded-full border border-warning/30 bg-warning/10 px-2.5 py-1">
                    Removed: {removedPermissions.length}
                  </span>
                  <span className="rounded-full border border-border bg-muted px-2.5 py-1">
                    Selected: {selectedPermissions.length}
                  </span>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleResetToRoleDefaults}
                disabled={isBusy || matchesRoleDefaults}
              >
                <RotateCcw className="mr-2 h-4 w-4" />
                Reset to role defaults
              </Button>
            </div>
          )}

          {isLoading ? (
            <div className="flex justify-center py-10">
              <UnifiedLoader variant="page" />
            </div>
          ) : (
            categories.map((category) => {
              const categoryPermissions = AVAILABLE_PERMISSIONS.filter((permission) => permission.category === category)
              const selectedInCategory = categoryPermissions.filter((permission) => selectedPermissions.includes(permission.id)).length
              const allSelected = selectedInCategory === categoryPermissions.length

              return (
                <div key={category} className="rounded-2xl border border-border bg-card p-4">
                  <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <h3 className="font-semibold text-foreground">{category}</h3>
                      <p className="text-sm text-foreground">
                        {selectedInCategory} of {categoryPermissions.length} permissions selected
                      </p>
                    </div>
                    {!readOnly && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleSelectAllInCategory(category)}
                        disabled={isBusy}
                      >
                        {allSelected ? (
                          <>
                            <Unlock className="mr-2 h-4 w-4" />
                            Deselect all
                          </>
                        ) : (
                          <>
                            <Lock className="mr-2 h-4 w-4" />
                            Select all
                          </>
                        )}
                      </Button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    {categoryPermissions.map((permission) => {
                      const selected = selectedPermissions.includes(permission.id)

                      return (
                        <div
                          key={permission.id}
                          className={`rounded-xl border p-3 transition-colors ${
                            selected
                              ? 'border-primary/30 bg-primary/5'
                              : 'border-border bg-muted/40'
                          } ${readOnly || isBusy ? '' : 'cursor-pointer hover:border-primary/30 hover:bg-primary/5'}`}
                          onClick={() => handlePermissionToggle(permission.id)}
                        >
                          <div className="flex items-start gap-3">
                            <div className={selected ? 'text-primary' : 'text-foreground'}>
                              {permission.icon}
                            </div>
                            <div className="min-w-0 flex-1 space-y-1">
                              <div className="flex items-center gap-2">
                                <h4 className="text-sm font-medium text-foreground">{permission.name}</h4>
                                {selected && <Shield className="h-3.5 w-3.5 text-primary" />}
                              </div>
                              <p className="text-xs text-foreground">{permission.description}</p>
                              <p className="font-mono text-[11px] text-foreground/80">{permission.id}</p>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })
          )}
        </div>

        <DialogFooter>
          <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1 text-sm text-foreground">
              <p>{selectedPermissions.length} of {AVAILABLE_PERMISSIONS.length} permissions selected</p>
              {!readOnly && <p>Saving requires the user to sign in again with refreshed access.</p>}
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="outline" onClick={onClose} disabled={isSaving}>
                {readOnly ? 'Close' : 'Cancel'}
              </Button>
              {!readOnly && (
                <Button onClick={handleSave} className="bg-primary text-white hover:bg-primary" disabled={isBusy} loading={isSaving}>
                  Save permissions
                </Button>
              )}
            </div>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
