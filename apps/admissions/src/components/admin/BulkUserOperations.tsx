import React, { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/Dialog'
import { useUserManagement } from '@/hooks/useUserManagement'
import { UserProfile } from '@/types/database'
import { Users, Shield, Trash2, CheckSquare, Square, AlertTriangle } from 'lucide-react'

interface BulkUserOperationsProps {
  users: UserProfile[]
  selectedUsers: string[]
  onSelectionChange: (userIds: string[]) => void
  onOperationComplete: () => void
}

const AVAILABLE_ROLES = [
  { value: 'student', label: 'Student' },
  { value: 'reviewer', label: 'Reviewer' },
  { value: 'admissions_officer', label: 'Admissions Officer' },
  { value: 'registrar', label: 'Registrar' },
  { value: 'finance_officer', label: 'Finance Officer' },
  { value: 'academic_head', label: 'Academic Head' },
  { value: 'admin', label: 'Administrator' },
  { value: 'super_admin', label: 'Super Admin' },
]

export function BulkUserOperations({ 
  users, 
  selectedUsers, 
  onSelectionChange, 
  onOperationComplete 
}: BulkUserOperationsProps) {
  const { bulkUpdateRoles, bulkDeleteUsers, loading } = useUserManagement()
  const [showRoleDialog, setShowRoleDialog] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [selectedRole, setSelectedRole] = useState('student')
  const [operationResult, setOperationResult] = useState<any>(null)
  const [confirmationToken, setConfirmationToken] = useState<string | null>(null)
  const [confirmInput, setConfirmInput] = useState('')

  const computeConfirmationToken = async (operation: string, details: Record<string, unknown>): Promise<string> => {
    const payload = JSON.stringify({ operation, ...details, userIds: selectedUsers.sort() })
    const encoded = new TextEncoder().encode(payload)
    const hash = await crypto.subtle.digest('SHA-256', encoded)
    return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 8)
  }

  const handleSelectAll = () => {
    if (selectedUsers.length === users.length) {
      onSelectionChange([])
    } else {
      onSelectionChange(users.map(user => user.user_id).filter((id): id is string => id !== undefined))
    }
  }

  const handleUserSelect = (userId: string) => {
    if (selectedUsers.includes(userId)) {
      onSelectionChange(selectedUsers.filter(id => id !== userId))
    } else {
      onSelectionChange([...selectedUsers, userId])
    }
  }

  const handleBulkRoleUpdate = async () => {
    if (confirmInput !== confirmationToken) return
    const result = await bulkUpdateRoles(selectedUsers, selectedRole)
    setOperationResult(result)
    setShowRoleDialog(false)
    setConfirmationToken(null)
    setConfirmInput('')
    onSelectionChange([])
    onOperationComplete()
  }

  const handleBulkDelete = async () => {
    if (confirmInput !== confirmationToken) return
    const result = await bulkDeleteUsers(selectedUsers)
    setOperationResult(result)
    setShowDeleteDialog(false)
    setConfirmationToken(null)
    setConfirmInput('')
    onSelectionChange([])
    onOperationComplete()
  }

  const selectedUserDetails = users.filter(user => user.user_id && selectedUsers.includes(user.user_id))
  const canDelete = selectedUserDetails.every(user => user.role !== 'super_admin')

  return (
    <div className="space-y-4">
      {/* Selection Controls */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 bg-muted rounded-lg border border-border">
        <div className="flex items-center space-x-3">
          <button
            onClick={handleSelectAll}
            className="flex items-center space-x-2 text-sm font-medium text-foreground hover:text-foreground"
          >
            {selectedUsers.length === users.length ? (
              <CheckSquare className="h-4 w-4 text-primary" />
            ) : (
              <Square className="h-4 w-4" />
            )}
            <span>
              {selectedUsers.length === users.length ? 'Deselect All' : 'Select All'}
            </span>
          </button>
          {selectedUsers.length > 0 && (
            <span className="text-sm text-foreground">
              {selectedUsers.length} user{selectedUsers.length !== 1 ? 's' : ''} selected
            </span>
          )}
        </div>

        {selectedUsers.length > 0 && (
          <div className="flex items-center space-x-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => { void computeConfirmationToken('role_update', { role: selectedRole }).then(t => { setConfirmationToken(t); setConfirmInput(''); setShowRoleDialog(true) }) }}
              className="text-primary border-blue-300 hover:bg-primary/5"
            >
              <Shield className="h-4 w-4 mr-1" />
              Update Roles
            </Button>
            {canDelete && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => { void computeConfirmationToken('delete', {}).then(t => { setConfirmationToken(t); setConfirmInput(''); setShowDeleteDialog(true) }) }}
                className="text-destructive border-destructive/30 hover:bg-destructive/5"
              >
                <Trash2 className="h-4 w-4 mr-1" />
                Deactivate Users
              </Button>
            )}
          </div>
        )}
      </div>

      {/* User Selection List */}
      {selectedUsers.length > 0 && (
        <div className="bg-card rounded-lg border border-border p-4">
          <h4 className="font-medium text-foreground mb-3 flex items-center">
            <Users className="h-4 w-4 mr-2" />
            Selected Users ({selectedUsers.length})
          </h4>
          <div className="space-y-2 max-h-40 overflow-y-auto">
            {selectedUserDetails.map(user => (
              <div key={user.user_id} className="flex items-center justify-between p-2 bg-muted rounded">
                <div className="flex items-center space-x-3">
                  <button
                    onClick={() => handleUserSelect(user.user_id ?? '')}
                    className="text-primary hover:text-primary-foreground"
                  >
                    <CheckSquare className="h-4 w-4" />
                  </button>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground truncate" title={user.full_name || 'No name'}>{user.full_name?.replace(/[<>"'&]/g, '') || 'No name'}</p>
                    <p className="text-xs text-foreground truncate" title={user.email}>{user.email?.replace(/[<>"'&]/g, '')}</p>
                  </div>
                </div>
                <span className="text-xs px-2 py-1 bg-skeleton text-foreground rounded">
                  {user.role.replace('_', ' ').toUpperCase()}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Bulk Role Update Dialog */}
      <Dialog open={showRoleDialog} onOpenChange={setShowRoleDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center space-x-2">
              <Shield className="h-5 w-5 text-primary" />
              <span>Update User Roles</span>
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-foreground">
              Update the role for {selectedUsers.length} selected user{selectedUsers.length !== 1 ? 's' : ''}:
            </p>
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                New Role
              </label>
              <select
                value={selectedRole}
                onChange={(e) => setSelectedRole(e.target.value)}
                className="w-full px-3 py-2 border border-input rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                {AVAILABLE_ROLES.map(role => (
                  <option key={role.value} value={role.value}>
                    {role.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="bg-primary/5 border border-primary/30 rounded-lg p-3">
              <p className="text-sm text-info-strong">
                ℹ️ This will update the role for all selected users. This action cannot be undone.
              </p>
            </div>
            {confirmationToken && (
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  Type <code className="bg-muted px-1.5 py-0.5 rounded text-xs font-mono">{confirmationToken}</code> to confirm
                </label>
                <input
                  type="text"
                  value={confirmInput}
                  onChange={(e) => setConfirmInput(e.target.value)}
                  placeholder="Enter confirmation code"
                  className="w-full px-3 py-2 border border-input rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 font-mono"
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowRoleDialog(false)}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button
              onClick={handleBulkRoleUpdate}
              loading={loading}
              disabled={confirmInput !== confirmationToken}
              className="bg-primary hover:bg-primary text-white"
            >
              Update Roles
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Deactivate Dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center space-x-2 text-destructive">
              <Trash2 className="h-5 w-5" />
              <span>Deactivate Users</span>
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-foreground">
              Deactivate {selectedUsers.length} selected user{selectedUsers.length !== 1 ? 's' : ''}?
            </p>
            <div className="bg-destructive/5 border border-destructive/30 rounded-lg p-3">
              <div className="flex items-start space-x-2">
                <AlertTriangle className="h-4 w-4 text-destructive mt-0.5" />
                <div className="text-sm text-error">
                  <p className="font-medium">Sign-in access will be removed immediately.</p>
                  <p>User records stay available for audit/history, but the selected accounts will become inactive.</p>
                </div>
              </div>
            </div>
            {confirmationToken && (
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  Type <code className="bg-muted px-1.5 py-0.5 rounded text-xs font-mono">{confirmationToken}</code> to confirm
                </label>
                <input
                  type="text"
                  value={confirmInput}
                  onChange={(e) => setConfirmInput(e.target.value)}
                  placeholder="Enter confirmation code"
                  className="w-full px-3 py-2 border border-input rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 font-mono"
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowDeleteDialog(false)}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button
              onClick={handleBulkDelete}
              loading={loading}
              disabled={confirmInput !== confirmationToken}
              variant="destructive"
            >
              Deactivate Users
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Operation Result Dialog */}
      {operationResult && (
        <Dialog open={!!operationResult} onOpenChange={() => setOperationResult(null)}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center space-x-2">
                <Users className="h-5 w-5 text-primary" />
                <span>Operation Complete</span>
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="text-center p-3 bg-accent/10 border border-accent/30 rounded-lg">
                  <p className="text-2xl font-bold text-warning-strong">{operationResult.success}</p>
                  <p className="text-sm text-warning-strong">Successful</p>
                </div>
                <div className="text-center p-3 bg-destructive/5 border border-destructive/30 rounded-lg">
                  <p className="text-2xl font-bold text-destructive">{operationResult.failed}</p>
                  <p className="text-sm text-error">Failed</p>
                </div>
              </div>
              {operationResult.errors.length > 0 && (
                <div className="bg-destructive/5 border border-destructive/30 rounded-lg p-3">
                  <p className="text-sm font-medium text-error mb-2">Errors:</p>
                  <ul className="text-xs text-destructive space-y-1">
                    {operationResult.errors.map((error: string, index: number) => (
                      <li key={index}>• {error?.replace(/[<>"'&]/g, '')}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button
                onClick={() => setOperationResult(null)}
                className="bg-primary hover:bg-primary text-white"
              >
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}
