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
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 bg-gray-50 rounded-lg border border-gray-200">
        <div className="flex items-center space-x-3">
          <button
            onClick={handleSelectAll}
            className="flex items-center space-x-2 text-sm font-medium text-gray-700 hover:text-gray-900"
          >
            {selectedUsers.length === users.length ? (
              <CheckSquare className="h-4 w-4 text-blue-600" />
            ) : (
              <Square className="h-4 w-4" />
            )}
            <span>
              {selectedUsers.length === users.length ? 'Deselect All' : 'Select All'}
            </span>
          </button>
          {selectedUsers.length > 0 && (
            <span className="text-sm text-gray-600">
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
              className="text-blue-600 border-blue-300 hover:bg-blue-50"
            >
              <Shield className="h-4 w-4 mr-1" />
              Update Roles
            </Button>
            {canDelete && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowDeleteDialog(true)}
                className="text-red-600 border-red-300 hover:bg-red-50"
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
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <h4 className="font-medium text-gray-900 mb-3 flex items-center">
            <Users className="h-4 w-4 mr-2" />
            Selected Users ({selectedUsers.length})
          </h4>
          <div className="space-y-2 max-h-40 overflow-y-auto">
            {selectedUserDetails.map(user => (
              <div key={user.user_id} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                <div className="flex items-center space-x-3">
                  <button
                    onClick={() => handleUserSelect(user.user_id)}
                    className="text-blue-600 hover:text-blue-800"
                  >
                    <CheckSquare className="h-4 w-4" />
                  </button>
                  <div>
                    <p className="text-sm font-medium text-gray-900">{user.full_name?.replace(/[<>"'&]/g, '') || 'No name'}</p>
                    <p className="text-xs text-gray-500">{user.email?.replace(/[<>"'&]/g, '')}</p>
                  </div>
                </div>
                <span className="text-xs px-2 py-1 bg-gray-200 text-gray-700 rounded">
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
              <Shield className="h-5 w-5 text-blue-600" />
              <span>Update User Roles</span>
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-gray-600">
              Update the role for {selectedUsers.length} selected user{selectedUsers.length !== 1 ? 's' : ''}:
            </p>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                New Role
              </label>
              <select
                value={selectedRole}
                onChange={(e) => setSelectedRole(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                {AVAILABLE_ROLES.map(role => (
                  <option key={role.value} value={role.value}>
                    {role.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
              <p className="text-sm text-blue-700">
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
              className="bg-blue-600 hover:bg-blue-700 text-white"
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
            <DialogTitle className="flex items-center space-x-2 text-red-600">
              <Trash2 className="h-5 w-5" />
              <span>Delete Users</span>
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-gray-600">
              Are you sure you want to delete {selectedUsers.length} selected user{selectedUsers.length !== 1 ? 's' : ''}?
            </p>
            <div className="bg-red-50 border border-red-200 rounded-lg p-3">
              <div className="flex items-start space-x-2">
                <AlertTriangle className="h-4 w-4 text-red-600 mt-0.5" />
                <div className="text-sm text-red-700">
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
              className="bg-red-600 hover:bg-red-700 text-white"
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
                <Users className="h-5 w-5 text-blue-600" />
                <span>Operation Complete</span>
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="text-center p-3 bg-green-50 border border-green-200 rounded-lg">
                  <p className="text-2xl font-bold text-green-600">{operationResult.success}</p>
                  <p className="text-sm text-green-700">Successful</p>
                </div>
                <div className="text-center p-3 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-2xl font-bold text-red-600">{operationResult.failed}</p>
                  <p className="text-sm text-red-700">Failed</p>
                </div>
              </div>
              {operationResult.errors.length > 0 && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                  <p className="text-sm font-medium text-red-700 mb-2">Errors:</p>
                  <ul className="text-xs text-red-600 space-y-1">
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
                className="bg-blue-600 hover:bg-blue-700 text-white"
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