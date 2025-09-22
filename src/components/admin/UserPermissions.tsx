import React, { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/Dialog'
import { UserProfile } from '@/lib/supabase'
import { Shield, Lock, Unlock, Settings, Eye, Edit, Trash2, Users, FileText, DollarSign, BarChart3 } from 'lucide-react'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'

interface UserPermissionsProps {
  user: UserProfile
  isOpen: boolean
  initialPermissions?: string[] | null
  isLoading?: boolean
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
  // User Management
  { id: 'users.view', name: 'View Users', description: 'Can view user profiles and lists', icon: <Eye className="h-4 w-4" />, category: 'User Management' },
  { id: 'users.create', name: 'Create Users', description: 'Can create new user accounts', icon: <Users className="h-4 w-4" />, category: 'User Management' },
  { id: 'users.edit', name: 'Edit Users', description: 'Can modify user profiles and roles', icon: <Edit className="h-4 w-4" />, category: 'User Management' },
  { id: 'users.delete', name: 'Delete Users', description: 'Can delete user accounts', icon: <Trash2 className="h-4 w-4" />, category: 'User Management' },
  
  // Application Management
  { id: 'applications.view', name: 'View Applications', description: 'Can view application submissions', icon: <FileText className="h-4 w-4" />, category: 'Applications' },
  { id: 'applications.review', name: 'Review Applications', description: 'Can review and process applications', icon: <Edit className="h-4 w-4" />, category: 'Applications' },
  { id: 'applications.approve', name: 'Approve Applications', description: 'Can approve or reject applications', icon: <Shield className="h-4 w-4" />, category: 'Applications' },
  { id: 'applications.export', name: 'Export Applications', description: 'Can export application data', icon: <FileText className="h-4 w-4" />, category: 'Applications' },
  
  // Financial Management
  { id: 'payments.view', name: 'View Payments', description: 'Can view payment records', icon: <DollarSign className="h-4 w-4" />, category: 'Finance' },
  { id: 'payments.verify', name: 'Verify Payments', description: 'Can verify payment proofs', icon: <Shield className="h-4 w-4" />, category: 'Finance' },
  { id: 'payments.refund', name: 'Process Refunds', description: 'Can process payment refunds', icon: <DollarSign className="h-4 w-4" />, category: 'Finance' },
  
  // System Administration
  { id: 'system.settings', name: 'System Settings', description: 'Can modify system configurations', icon: <Settings className="h-4 w-4" />, category: 'System' },
  { id: 'system.analytics', name: 'View Analytics', description: 'Can access system analytics and reports', icon: <BarChart3 className="h-4 w-4" />, category: 'System' },
  { id: 'system.maintenance', name: 'System Maintenance', description: 'Can perform system maintenance tasks', icon: <Settings className="h-4 w-4" />, category: 'System' },
]

const ROLE_DEFAULT_PERMISSIONS: Record<string, string[]> = {
  student: ['applications.view'],
  admissions_officer: ['applications.view', 'applications.review', 'applications.approve', 'users.view'],
  registrar: ['applications.view', 'applications.review', 'applications.export', 'users.view', 'users.edit'],
  finance_officer: ['payments.view', 'payments.verify', 'payments.refund', 'applications.view'],
  academic_head: ['applications.view', 'applications.review', 'applications.approve', 'users.view', 'users.edit', 'system.analytics'],
  admin: ['users.view', 'users.create', 'users.edit', 'users.delete', 'applications.view', 'applications.review', 'applications.approve', 'applications.export', 'payments.view', 'payments.verify', 'payments.refund', 'system.settings', 'system.analytics'],
  super_admin: AVAILABLE_PERMISSIONS.map(p => p.id)
}

export function UserPermissions({ user, isOpen, onClose, onSave, initialPermissions, isLoading }: UserPermissionsProps) {
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
  }, [initialPermissions, defaultPermissions, isOpen])

  const isBusy = Boolean(isLoading) || isSaving

  const handlePermissionToggle = (permissionId: string) => {
    if (isBusy) {
      return
    }
    if (selectedPermissions.includes(permissionId)) {
      setSelectedPermissions(selectedPermissions.filter(id => id !== permissionId))
    } else {
      setSelectedPermissions([...selectedPermissions, permissionId])
    }
  }

  const handleSelectAllInCategory = (category: string) => {
    if (isBusy) {
      return
    }
    const categoryPermissions = AVAILABLE_PERMISSIONS
      .filter(p => p.category === category)
      .map(p => p.id)
    
    const allSelected = categoryPermissions.every(id => selectedPermissions.includes(id))
    
    if (allSelected) {
      setSelectedPermissions(selectedPermissions.filter(id => !categoryPermissions.includes(id)))
    } else {
      const newPermissions = [...selectedPermissions]
      categoryPermissions.forEach(id => {
        if (!newPermissions.includes(id)) {
          newPermissions.push(id)
        }
      })
      setSelectedPermissions(newPermissions)
    }
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
      // Errors are surfaced by the parent component's error boundary/UI
    } finally {
      setIsSaving(false)
    }
  }

  const categories = [...new Set(AVAILABLE_PERMISSIONS.map(p => p.category))]

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center space-x-2">
            <Shield className="h-5 w-5 text-blue-600" />
            <span>Manage Permissions - {user.full_name}</span>
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-6">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex items-center space-x-2 mb-2">
              <Shield className="h-4 w-4 text-blue-600" />
              <span className="font-medium text-blue-900">Current Role: {user.role.replace('_', ' ').toUpperCase()}</span>
            </div>
            <p className="text-sm text-blue-700">
              Customize permissions for this user. Changes will override default role permissions.
            </p>
          </div>

          {isLoading ? (
            <div className="flex justify-center py-10">
              <LoadingSpinner size="lg" />
            </div>
          ) : (
            categories.map(category => {
              const categoryPermissions = AVAILABLE_PERMISSIONS.filter(p => p.category === category)
              const selectedInCategory = categoryPermissions.filter(p => selectedPermissions.includes(p.id)).length
              const allSelected = selectedInCategory === categoryPermissions.length

              return (
                <div key={category} className="border border-gray-200 rounded-lg p-4">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold text-gray-900 flex items-center space-x-2">
                    <span>{category}</span>
                    <span className="text-sm text-gray-500">({selectedInCategory}/{categoryPermissions.length})</span>
                  </h3>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleSelectAllInCategory(category)}
                    className="text-xs"
                    disabled={isBusy}
                  >
                    {allSelected ? (
                      <>
                        <Unlock className="h-3 w-3 mr-1" />
                        Deselect All
                      </>
                    ) : (
                      <>
                        <Lock className="h-3 w-3 mr-1" />
                        Select All
                      </>
                    )}
                  </Button>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {categoryPermissions.map(permission => (
                    <div
                      key={permission.id}
                      className={`p-3 border rounded-lg cursor-pointer transition-colors ${
                        selectedPermissions.includes(permission.id)
                          ? 'border-blue-300 bg-blue-50'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                      onClick={() => handlePermissionToggle(permission.id)}
                    >
                      <div className="flex items-start space-x-3">
                        <div className={`mt-0.5 ${
                          selectedPermissions.includes(permission.id) ? 'text-blue-600' : 'text-gray-400'
                        }`}>
                          {permission.icon}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center space-x-2">
                            <h4 className={`font-medium text-sm ${
                              selectedPermissions.includes(permission.id) ? 'text-blue-900' : 'text-gray-900'
                            }`}>
                              {permission.name}
                            </h4>
                            {selectedPermissions.includes(permission.id) && (
                              <Shield className="h-3 w-3 text-blue-600" />
                            )}
                          </div>
                          <p className={`text-xs mt-1 ${
                            selectedPermissions.includes(permission.id) ? 'text-blue-700' : 'text-gray-600'
                          }`}>
                            {permission.description}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                </div>
              )
            })
          )}
        </div>

        <DialogFooter>
          <div className="flex items-center justify-between w-full">
            <div className="text-sm text-gray-600">
              {selectedPermissions.length} of {AVAILABLE_PERMISSIONS.length} permissions selected
            </div>
            <div className="flex space-x-2">
              <Button variant="outline" onClick={onClose} disabled={isSaving}>
                Cancel
              </Button>
              <Button
                onClick={handleSave}
                className="bg-blue-600 hover:bg-blue-700 text-white"
                disabled={isBusy}
                loading={isSaving}
              >
                Save Permissions
              </Button>
            </div>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}