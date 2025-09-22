import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { UserProfile } from '@/lib/supabase'
import { Button } from '@/components/ui/Button'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { AdminNavigation } from '@/components/ui/AdminNavigation'
import { Input } from '@/components/ui/Input'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/Dialog'
import { UserStats } from '@/components/admin/UserStats'
import { BulkUserOperations } from '@/components/admin/BulkUserOperations'
import { UserPermissions } from '@/components/admin/UserPermissions'
import { UserActivityLog } from '@/components/admin/UserActivityLog'
import { UserExport } from '@/components/admin/UserExport'
import { UserImport } from '@/components/admin/UserImport'
import {
  useUsers,
  useCreateUser,
  useUpdateUser,
  useDeleteUser,
  useUserPermissions,
  useUpdateUserPermissions
} from '@/hooks/useApiServices'
import { ArrowLeft, Users, Shield, User, Plus, Edit, Trash2, Search, Filter, UserPlus, Settings, Eye, EyeOff, BarChart3, CheckSquare, Square, Lock, Clock, Download, Upload } from 'lucide-react'
import { sanitizeForLog } from '@/lib/security'
import { sanitizeForDisplay } from '@/lib/sanitize'

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
  { value: 'admissions_officer', label: 'Admissions Officer', description: 'Can review applications' },
  { value: 'registrar', label: 'Registrar', description: 'Academic records management' },
  { value: 'finance_officer', label: 'Finance Officer', description: 'Payment verification' },
  { value: 'academic_head', label: 'Academic Head', description: 'Department oversight' },
  { value: 'admin', label: 'Administrator', description: 'Full system access' },
]

export default function AdminUsers() {
  const { data: usersData, isLoading: loading, error: queryError, refetch } = useUsers()
  const createUserMutation = useCreateUser()
  const updateUserMutation = useUpdateUser()
  const deleteUserMutation = useDeleteUser()
  const updateUserPermissionsMutation = useUpdateUserPermissions()
  
  const users = usersData?.data || []
  const [filteredUsers, setFilteredUsers] = useState<UserProfile[]>([])
  const [error, setError] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [roleFilter, setRoleFilter] = useState('')
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [showEditDialog, setShowEditDialog] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null)
  const [createForm, setCreateForm] = useState<CreateUserForm>({
    email: '',
    password: '',
    full_name: '',
    phone: '',
    role: 'student'
  })
  const [editForm, setEditForm] = useState<EditUserForm>({
    full_name: '',
    email: '',
    phone: '',
    role: 'student'
  })
  const [showPassword, setShowPassword] = useState(false)
  const [selectedUsers, setSelectedUsers] = useState<string[]>([])
  const [showStats, setShowStats] = useState(false)
  const [showBulkOps, setShowBulkOps] = useState(false)
  const [showPermissionsDialog, setShowPermissionsDialog] = useState(false)
  const [permissionsUser, setPermissionsUser] = useState<UserProfile | null>(null)
  const [showActivityLog, setShowActivityLog] = useState(false)
  const [activityLogUserId, setActivityLogUserId] = useState<string | null>(null)
  const [showExportDialog, setShowExportDialog] = useState(false)
  const [showImportDialog, setShowImportDialog] = useState(false)

  const activePermissionsUserId = showPermissionsDialog && permissionsUser ? permissionsUser.user_id : undefined
  const {
    data: permissionsData,
    isLoading: permissionsLoading,
    refetch: refetchUserPermissions
  } = useUserPermissions(activePermissionsUserId)

  useEffect(() => {
    if (queryError) {
      setError(queryError instanceof Error ? queryError.message : 'Failed to load users')
    }
  }, [queryError])

  useEffect(() => {
    filterUsers()
  }, [users, searchTerm, roleFilter])



  const filterUsers = () => {
    let filtered = users
    
    if (searchTerm) {
      filtered = filtered.filter(user => 
        user.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        user.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        user.phone?.includes(searchTerm)
      )
    }
    
    if (roleFilter) {
      filtered = filtered.filter(user => user.role === roleFilter)
    }
    
    setFilteredUsers(filtered)
  }

  const createUser = async () => {
    try {
      await createUserMutation.mutateAsync(createForm)
      setShowCreateDialog(false)
      setCreateForm({ email: '', password: '', full_name: '', phone: '', role: 'student' })
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to create user'
      console.error('Failed to create user:', sanitizeForLog(errorMessage))
      setError(errorMessage)
    }
  }

  const updateUser = async () => {
    if (!selectedUser) return
    
    try {
      await updateUserMutation.mutateAsync({ id: selectedUser.user_id, data: editForm })
      setShowEditDialog(false)
      setSelectedUser(null)
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to update user'
      console.error('Failed to update user:', sanitizeForLog(errorMessage))
      setError(errorMessage)
    }
  }

  const deleteUser = async () => {
    if (!selectedUser) return
    
    try {
      await deleteUserMutation.mutateAsync(selectedUser.user_id)
      setShowDeleteDialog(false)
      setSelectedUser(null)
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to delete user'
      console.error('Failed to delete user:', sanitizeForLog(errorMessage))
      setError(errorMessage)
    }
  }



  const openEditDialog = (user: UserProfile) => {
    setSelectedUser(user)
    setEditForm({
      full_name: user.full_name || '',
      email: user.email || '',
      phone: user.phone || '',
      role: user.role
    })
    setShowEditDialog(true)
  }

  const openDeleteDialog = (user: UserProfile) => {
    setSelectedUser(user)
    setShowDeleteDialog(true)
  }

  const handleUserSelect = (userId: string) => {
    if (selectedUsers.includes(userId)) {
      setSelectedUsers(selectedUsers.filter(id => id !== userId))
    } else {
      setSelectedUsers([...selectedUsers, userId])
    }
  }

  const handleSelectAll = () => {
    if (selectedUsers.length === filteredUsers.length) {
      setSelectedUsers([])
    } else {
      setSelectedUsers(filteredUsers.map(user => user.user_id))
    }
  }

  const openPermissionsDialog = (user: UserProfile) => {
    setError('')
    setPermissionsUser(user)
    setShowPermissionsDialog(true)
  }

  const handlePermissionsSave = async (permissions: string[]) => {
    if (!permissionsUser) return

    try {
      await updateUserPermissionsMutation.mutateAsync({
        id: permissionsUser.user_id,
        permissions
      })
      await refetchUserPermissions()
      await refetch()
      setError('')
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to save permissions'
      console.error('Failed to save permissions:', sanitizeForLog(errorMessage))
      setError(errorMessage)
      throw err instanceof Error ? err : new Error(errorMessage)
    }
  }

  const openActivityLog = (userId: string) => {
    setActivityLogUserId(userId)
    setShowActivityLog(true)
  }

  const getRoleIcon = (role: string) => {
    switch (role) {
      case 'admin':
      case 'super_admin':
        return <Shield className="h-4 w-4 text-red-500" />
      case 'admissions_officer':
      case 'registrar':
      case 'finance_officer':
      case 'academic_head':
        return <Shield className="h-4 w-4 text-blue-500" />
      default:
        return <User className="h-4 w-4 text-gray-500" />
    }
  }

  const getRoleColor = (role: string) => {
    switch (role) {
      case 'admin':
      case 'super_admin':
        return 'bg-red-100 text-red-800'
      case 'admissions_officer':
      case 'registrar':
      case 'finance_officer':
      case 'academic_head':
        return 'bg-blue-100 text-blue-800'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  const getRoleLabel = (role: string) => {
    const roleObj = AVAILABLE_ROLES.find(r => r.value === role)
    return roleObj ? roleObj.label : role.replace('_', ' ').toUpperCase()
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50">
      <AdminNavigation />
      <div className="container-mobile py-4 sm:py-6 lg:py-8 safe-area-bottom">
        <div className="bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden">
          {/* Header - Mobile First */}
          <div className="bg-gradient-to-r from-purple-500 to-indigo-600 p-6 text-white">
            <div className="flex flex-col space-y-4 sm:flex-row sm:items-center sm:justify-between sm:space-y-0">
              <div className="flex flex-col space-y-3 sm:flex-row sm:items-center sm:space-y-0 sm:space-x-4">
                <Link to="/admin">
                  <Button variant="ghost" size="sm" className="text-white hover:bg-white/20 border-white/30">
                    <ArrowLeft className="h-4 w-4 mr-2" />
                    Back
                  </Button>
                </Link>
                <div>
                  <h1 className="text-2xl sm:text-3xl font-bold">👥 User Management</h1>
                  <p className="text-white/90 text-sm sm:text-base">Manage user roles and permissions</p>
                </div>
              </div>
              <div className="flex flex-col sm:flex-row items-end sm:items-center space-y-2 sm:space-y-0 sm:space-x-4">
                <div className="flex items-center space-x-2">
                  <Button
                    onClick={() => setShowStats(!showStats)}
                    variant="ghost"
                    size="sm"
                    className="text-white hover:bg-white/20 border-white/30"
                  >
                    <BarChart3 className="h-4 w-4 mr-2" />
                    {showStats ? 'Hide Stats' : 'Show Stats'}
                  </Button>
                  <Button
                    onClick={() => setShowImportDialog(true)}
                    variant="ghost"
                    size="sm"
                    className="text-white hover:bg-white/20 border-white/30"
                  >
                    <Upload className="h-4 w-4 mr-2" />
                    Import
                  </Button>
                  <Button
                    onClick={() => setShowExportDialog(true)}
                    variant="ghost"
                    size="sm"
                    className="text-white hover:bg-white/20 border-white/30"
                  >
                    <Download className="h-4 w-4 mr-2" />
                    Export
                  </Button>
                  <Button
                    onClick={() => setShowCreateDialog(true)}
                    className="bg-white text-purple-600 hover:bg-gray-100 font-semibold"
                    size="sm"
                  >
                    <UserPlus className="h-4 w-4 mr-2" />
                    Add User
                  </Button>
                </div>
                <div className="text-right">
                  <div className="text-2xl sm:text-3xl font-bold">{filteredUsers.length}</div>
                  <div className="text-sm text-white/80">Users Found</div>
                </div>
              </div>
            </div>
          </div>

          {/* Search and Filters */}
          <div className="p-6 border-b border-gray-200 bg-gray-50">
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="flex-1">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                  <input
                    type="text"
                    placeholder="Search users by name, email, or phone..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                  />
                </div>
              </div>
              <div className="sm:w-48">
                <div className="relative">
                  <Filter className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                  <select
                    value={roleFilter}
                    onChange={(e) => setRoleFilter(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 appearance-none bg-white"
                  >
                    <option value="">All Roles</option>
                    {AVAILABLE_ROLES.map(role => (
                      <option key={role.value} value={role.value}>{role.label}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          </div>

          {/* User Statistics */}
          {showStats && (
            <div className="p-6 border-b border-gray-200 bg-gradient-to-r from-gray-50 to-purple-50">
              <UserStats users={users} />
            </div>
          )}

          {/* Bulk Operations */}
          {selectedUsers.length > 0 && (
            <div className="p-6 border-b border-gray-200 bg-blue-50">
              <BulkUserOperations
                users={filteredUsers}
                selectedUsers={selectedUsers}
                onSelectionChange={setSelectedUsers}
                onOperationComplete={() => refetch()}
              />
            </div>
          )}

          {/* Content */}
          <div className="p-6">

            {error && (
              <div className="rounded-xl bg-red-50 border border-red-200 p-6 mb-6">
                <div className="flex items-center space-x-3">
                  <div className="text-4xl">😱</div>
                  <div className="text-red-700 font-medium">{error}</div>
                </div>
              </div>
            )}

            {loading ? (
              <div className="flex justify-center py-16">
                <div className="text-center">
                  <LoadingSpinner size="lg" />
                  <p className="mt-4 text-lg text-gray-600">Loading users...</p>
                </div>
              </div>
            ) : filteredUsers.length === 0 ? (
              <div className="text-center py-16">
                <div className="text-8xl mb-6">👥</div>
                <h3 className="text-2xl font-bold text-gray-900 mb-2">No Users Found</h3>
                <p className="text-gray-600 mb-6 max-w-md mx-auto">
                  No users have been registered yet. Users will appear here once they sign up for the system.
                </p>
                <Button onClick={() => refetch()} className="bg-gradient-to-r from-purple-500 to-indigo-600 text-white font-semibold">
                  Refresh Users
                </Button>
              </div>
            ) : (
              <>
                {/* Mobile Cards View */}
                <div className="block lg:hidden space-y-4">
                  {filteredUsers.map((user) => (
                    <div key={user.user_id} className="bg-gray-50 rounded-xl p-4 border border-gray-200">
                      <div className="flex items-start space-x-3 mb-3">
                        <div className="flex-shrink-0 flex items-center space-x-2">
                          <button
                            onClick={() => handleUserSelect(user.user_id)}
                            className="text-blue-600 hover:text-blue-800"
                          >
                            {selectedUsers.includes(user.user_id) ? (
                              <CheckSquare className="h-4 w-4" />
                            ) : (
                              <Square className="h-4 w-4" />
                            )}
                          </button>
                          {getRoleIcon(user.role)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="font-bold text-lg text-gray-900 truncate">
                            {sanitizeForDisplay(user.full_name) || 'No name provided'}
                          </h3>
                          <p className="text-sm text-gray-600">{sanitizeForDisplay(user.email)}</p>
                          {user.phone && (
                            <p className="text-sm text-gray-500">{sanitizeForDisplay(user.phone)}</p>
                          )}
                          <p className="text-xs text-gray-400 mt-1">
                            ID: {user.user_id.slice(0, 8)}...
                          </p>
                        </div>
                        <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-bold ${
                          getRoleColor(user.role)
                        }`}>
                          {getRoleLabel(user.role)}
                        </span>
                      </div>
                      
                      <div className="flex items-center justify-between pt-3 border-t border-gray-200">
                        <div className="text-xs text-gray-500">
                          Joined: {user.created_at ? new Date(user.created_at).toLocaleDateString() : 'Unknown'}
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => openEditDialog(user)}
                            className="text-blue-600 border-blue-300 hover:bg-blue-50"
                          >
                            <Edit className="h-3 w-3 mr-1" />
                            Edit
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => openPermissionsDialog(user)}
                            className="text-purple-600 border-purple-300 hover:bg-purple-50"
                          >
                            <Lock className="h-3 w-3 mr-1" />
                            Permissions
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => openActivityLog(user.user_id)}
                            className="text-gray-600 border-gray-300 hover:bg-gray-50"
                          >
                            <Clock className="h-3 w-3 mr-1" />
                            Activity
                          </Button>
                          {user.role !== 'super_admin' && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => openDeleteDialog(user)}
                              className="text-red-600 border-red-300 hover:bg-red-50"
                            >
                              <Trash2 className="h-3 w-3 mr-1" />
                              Delete
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Desktop Table View */}
                <div className="hidden lg:block overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gradient-to-r from-gray-50 to-purple-50">
                      <tr>
                        <th className="px-6 py-4 text-left text-sm font-bold text-gray-700 uppercase tracking-wider">
                          <div className="flex items-center space-x-2">
                            <button
                              onClick={handleSelectAll}
                              className="text-blue-600 hover:text-blue-800"
                            >
                              {selectedUsers.length === filteredUsers.length && filteredUsers.length > 0 ? (
                                <CheckSquare className="h-4 w-4" />
                              ) : (
                                <Square className="h-4 w-4" />
                              )}
                            </button>
                            <span>👤 User</span>
                          </div>
                        </th>
                        <th className="px-6 py-4 text-left text-sm font-bold text-gray-700 uppercase tracking-wider">
                          📞 Contact
                        </th>
                        <th className="px-6 py-4 text-left text-sm font-bold text-gray-700 uppercase tracking-wider">
                          🏆 Role
                        </th>
                        <th className="px-6 py-4 text-left text-sm font-bold text-gray-700 uppercase tracking-wider">
                          📅 Joined
                        </th>
                        <th className="px-6 py-4 text-right text-sm font-bold text-gray-700 uppercase tracking-wider">
                          ⚙️ Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {filteredUsers.map((user) => (
                        <tr key={user.user_id} className="hover:bg-purple-50 transition-colors">
                          <td className="px-6 py-4">
                            <div className="flex items-center">
                              <button
                                onClick={() => handleUserSelect(user.user_id)}
                                className="text-blue-600 hover:text-blue-800 mr-3"
                              >
                                {selectedUsers.includes(user.user_id) ? (
                                  <CheckSquare className="h-4 w-4" />
                                ) : (
                                  <Square className="h-4 w-4" />
                                )}
                              </button>
                              {getRoleIcon(user.role)}
                              <div className="ml-3">
                                <div className="text-sm font-semibold text-gray-900">
                                  {sanitizeForDisplay(user.full_name) || 'No name provided'}
                                </div>
                                <div className="text-xs text-gray-500 font-mono">
                                  ID: {user.user_id.slice(0, 8)}...
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="text-sm text-gray-900">{sanitizeForDisplay(user.email)}</div>
                            {user.phone && (
                              <div className="text-sm text-gray-500">{sanitizeForDisplay(user.phone)}</div>
                            )}
                          </td>
                          <td className="px-6 py-4">
                            <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-bold ${
                              getRoleColor(user.role)
                            }`}>
                              {getRoleLabel(user.role)}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-sm text-gray-600">
                            {user.created_at ? new Date(user.created_at).toLocaleDateString() : 'Unknown'}
                          </td>
                          <td className="px-6 py-4 text-right">
                            <div className="flex items-center justify-end space-x-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => openEditDialog(user)}
                                className="text-blue-600 border-blue-300 hover:bg-blue-50"
                                disabled={selectedUsers.length > 0}
                              >
                                <Edit className="h-3 w-3 mr-1" />
                                Edit
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => openPermissionsDialog(user)}
                                className="text-purple-600 border-purple-300 hover:bg-purple-50"
                                disabled={selectedUsers.length > 0}
                              >
                                <Lock className="h-3 w-3 mr-1" />
                                Permissions
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => openActivityLog(user.user_id)}
                                className="text-gray-600 border-gray-300 hover:bg-gray-50"
                                disabled={selectedUsers.length > 0}
                              >
                                <Clock className="h-3 w-3 mr-1" />
                                Activity
                              </Button>
                              {user.role !== 'super_admin' && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => openDeleteDialog(user)}
                                  className="text-red-600 border-red-300 hover:bg-red-50"
                                  disabled={selectedUsers.length > 0}
                                >
                                  <Trash2 className="h-3 w-3 mr-1" />
                                  Delete
                                </Button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Create User Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center space-x-2">
              <UserPlus className="h-5 w-5 text-purple-600" />
              <span>Create New User</span>
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <Input
              label="Full Name"
              value={createForm.full_name}
              onChange={(e) => setCreateForm({ ...createForm, full_name: e.target.value })}
              placeholder="Enter full name"
              required
            />
            <Input
              label="Email"
              type="email"
              value={createForm.email}
              onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })}
              placeholder="Enter email address"
              required
            />
            <div className="relative">
              <Input
                label="Password"
                type={showPassword ? 'text' : 'password'}
                value={createForm.password}
                onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })}
                placeholder="Enter password"
                required
              />
              <button
                type="button"
                className="absolute right-3 top-8 text-gray-400 hover:text-gray-600"
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <Input
              label="Phone"
              value={createForm.phone}
              onChange={(e) => setCreateForm({ ...createForm, phone: e.target.value })}
              placeholder="Enter phone number"
            />
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Role <span className="text-red-500">*</span>
              </label>
              <select
                value={createForm.role}
                onChange={(e) => setCreateForm({ ...createForm, role: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                required
              >
                {AVAILABLE_ROLES.map(role => (
                  <option key={role.value} value={role.value}>
                    {role.label} - {role.description}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowCreateDialog(false)}
              disabled={createUserMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={createUser}
              loading={createUserMutation.isPending}
              className="bg-purple-600 hover:bg-purple-700 text-white"
            >
              Create User
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit User Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center space-x-2">
              <Edit className="h-5 w-5 text-blue-600" />
              <span>Edit User</span>
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <Input
              label="Full Name"
              value={editForm.full_name}
              onChange={(e) => setEditForm({ ...editForm, full_name: e.target.value })}
              placeholder="Enter full name"
              required
            />
            <Input
              label="Email"
              type="email"
              value={editForm.email}
              onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
              placeholder="Enter email address"
              required
            />
            <Input
              label="Phone"
              value={editForm.phone}
              onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
              placeholder="Enter phone number"
            />
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Role <span className="text-red-500">*</span>
              </label>
              <select
                value={editForm.role}
                onChange={(e) => setEditForm({ ...editForm, role: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                required
                disabled={selectedUser?.role === 'super_admin'}
              >
                {AVAILABLE_ROLES.map(role => (
                  <option key={role.value} value={role.value}>
                    {role.label} - {role.description}
                  </option>
                ))}
              </select>
              {selectedUser?.role === 'super_admin' && (
                <p className="text-xs text-gray-500 mt-1">Super admin role cannot be changed</p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowEditDialog(false)}
              disabled={updateUserMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={updateUser}
              loading={updateUserMutation.isPending}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              Update User
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete User Dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center space-x-2 text-red-600">
              <Trash2 className="h-5 w-5" />
              <span>Delete User</span>
            </DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className="text-gray-600">
              Are you sure you want to delete <strong>{sanitizeForDisplay(selectedUser?.full_name)}</strong>? 
              This action cannot be undone and will remove all user data.
            </p>
            <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-700">
                ⚠️ This will permanently delete the user profile and cannot be reversed.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowDeleteDialog(false)}
              disabled={deleteUserMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={deleteUser}
              loading={deleteUserMutation.isPending}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              Delete User
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* User Permissions Dialog */}
      {permissionsUser && (
        <UserPermissions
          user={permissionsUser}
          isOpen={showPermissionsDialog}
          initialPermissions={permissionsData?.data}
          isLoading={permissionsLoading}
          onClose={() => {
            setShowPermissionsDialog(false)
            setPermissionsUser(null)
          }}
          onSave={handlePermissionsSave}
        />
      )}

      {/* User Activity Log Dialog */}
      <UserActivityLog
        userId={activityLogUserId || undefined}
        isOpen={showActivityLog}
        onClose={() => {
          setShowActivityLog(false)
          setActivityLogUserId(null)
        }}
      />

      {/* User Export Dialog */}
      <UserExport
        users={users}
        isOpen={showExportDialog}
        onClose={() => setShowExportDialog(false)}
      />

      {/* User Import Dialog */}
      <UserImport
        isOpen={showImportDialog}
        onClose={() => setShowImportDialog(false)}
        onImportComplete={() => {
          setShowImportDialog(false)
          refetch()
        }}
      />
    </div>
  )
}