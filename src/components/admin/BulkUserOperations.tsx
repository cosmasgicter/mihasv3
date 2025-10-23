import React, { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/Dialog'
import { useUserManagement } from '@/hooks/useUserManagement'
import { UserProfile } from '@/lib/supabase'
import { Users, Shield, Trash2, CheckSquare, Square, AlertTriangle } from 'lucide-react'

interface BulkUserOperationsProps {
  users: UserProfile[]
  selectedUsers: string[]
  onSelectionChange: (userIds: string[]) => void
  onOperationComplete: () => void
}

const AVAILABLE_ROLES = [
  { value: 'student', label: 'Student' },
  { value: 'admissions_officer', label: 'Admissions Officer' },
  { value: 'registrar', label: 'Registrar' },
  { value: 'finance_officer', label: 'Finance Officer' },
  { value: 'academic_head', label: 'Academic Head' },
  { value: 'admin', label: 'Administrator' },
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

  const handleSelectAll = () => {
    if (selectedUsers.length === users.length) {
      onSelectionChange([])
    } else {
      onSelectionChange(users.map(user => user.user_id))
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
    const result = await bulkUpdateRoles(selectedUsers, selectedRole)
    setOperationResult(result)
    setShowRoleDialog(false)
    onSelectionChange([])
    onOperationComplete()
  }

  const handleBulkDelete = async () => {
    const result = await bulkDeleteUsers(selectedUsers)
    setOperationResult(result)
    setShowDeleteDialog(false)
    onSelectionChange([])
    onOperationComplete()
  }

  const selectedUserDetails = users.filter(user => selectedUsers.includes(user.user_id))
  const canDelete = selectedUserDetails.every(user => user.role !== 'super_admin')

  return (
    <div className="space-y-4">
      {/* Selection Controls */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 bg-muted rounded-lg border border-border">
        <div className="flex items-center space-x-3">
          <button
            onClick={handleSelectAll}
            className="flex items-center space-x-2 text-sm font-medium text-body hover:text-foreground"
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
            <span className="text-sm text-body">
              {selectedUsers.length} user{selectedUsers.length !== 1 ? 's' : ''} selected
            </span>
          )}
        </div>

        {selectedUsers.length > 0 && (
          <div className="flex items-center space-x-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowRoleDialog(true)}
              className="text-primary border-blue-300 hover:bg-primary/5"
            >
              <Shield className="h-4 w-4 mr-1" />
              Update Roles
            </Button>
            {canDelete && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowDeleteDialog(true)}
                className="text-destructive border-destructive/30 hover:bg-destructive/5"
              >
                <Trash2 className="h-4 w-4 mr-1" />
                Delete Users
              </Button>
            )}
          </div>
        )}
      </div>

      {/* User Selection List */}
      {selectedUsers.length > 0 && (
        <div className="bg-card rounded-lg border border-border p-4">
          <h4 className="font-medium text-body mb-3 flex items-center">
            <Users className="h-4 w-4 mr-2" />
            Selected Users ({selectedUsers.length})
          </h4>
          <div className="space-y-2 max-h-40 overflow-y-auto">
            {selectedUserDetails.map(user => (
              <div key={user.user_id} className="flex items-center justify-between p-2 bg-muted rounded">
                <div className="flex items-center space-x-3">
                  <button
                    onClick={() => handleUserSelect(user.user_id)}
                    className="text-primary hover:text-primary-foreground"
                  >
                    <CheckSquare className="h-4 w-4" />
                  </button>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-body truncate" title={user.full_name || 'No name'}>{user.full_name?.replace(/[<>"'&]/g, '') || 'No name'}</p>
                    <p className="text-xs text-body truncate" title={user.email}>{user.email?.replace(/[<>"'&]/g, '')}</p>
                  </div>
                </div>
                <span className="text-xs px-2 py-1 bg-skeleton text-body rounded">
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
            <p className="text-body">
              Update the role for {selectedUsers.length} selected user{selectedUsers.length !== 1 ? 's' : ''}:
            </p>
            <div>
              <label className="block text-sm font-medium text-body mb-2">
                New Role
              </label>
              <select
                value={selectedRole}
                onChange={(e) => setSelectedRole(e.target.value)}
                className="w-full px-3 py-2 border border-input rounded-md focus:ring-2 focus:ring-blue-500 focus:border-primary"
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
              className="bg-primary hover:bg-primary text-white"
            >
              Update Roles
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Delete Dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center space-x-2 text-destructive">
              <Trash2 className="h-5 w-5" />
              <span>Delete Users</span>
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-body">
              Are you sure you want to delete {selectedUsers.length} selected user{selectedUsers.length !== 1 ? 's' : ''}?
            </p>
            <div className="bg-destructive/5 border border-destructive/30 rounded-lg p-3">
              <div className="flex items-start space-x-2">
                <AlertTriangle className="h-4 w-4 text-destructive mt-0.5" />
                <div className="text-sm text-error">
                  <p className="font-medium">This action cannot be undone!</p>
                  <p>All user data and associated records will be permanently deleted.</p>
                </div>
              </div>
            </div>
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
              variant="destructive"
            >
              Delete Users
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