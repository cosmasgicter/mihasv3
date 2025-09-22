import React, { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { AdminNavigation } from '@/components/ui/AdminNavigation'
import { ArrowLeft, Plus, Edit2, Trash2, Save, X, Settings, Globe, Lock, Database } from 'lucide-react'

interface SystemSetting {
  id: string
  setting_key: string
  setting_value: string
  setting_type: 'string' | 'integer' | 'decimal' | 'boolean'
  description: string | null
  is_public: boolean
  updated_by: string | null
  created_at: string
  updated_at: string
}

interface NewSetting {
  setting_key: string
  setting_value: string
  setting_type: 'string' | 'integer' | 'decimal' | 'boolean'
  description: string
  is_public: boolean
}

export default function AdminSettings() {
  const [settings, setSettings] = useState<SystemSetting[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [showAddForm, setShowAddForm] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [filterType, setFilterType] = useState<'all' | 'public' | 'private'>('all')
  const [editForm, setEditForm] = useState<Partial<SystemSetting>>({})
  const [newSetting, setNewSetting] = useState<NewSetting>({
    setting_key: '',
    setting_value: '',
    setting_type: 'string',
    description: '',
    is_public: false
  })

  const loadSettings = useCallback(async () => {
    try {
      setLoading(true)
      const { data, error } = await supabase
        .from('system_settings')
        .select('*')
        .order('setting_key')
      if (error) throw error
      setSettings(data || [])
    } catch (error: any) {
      setError(error.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadSettings()
  }, [loadSettings])

  useEffect(() => {
    if (success) {
      const timer = setTimeout(() => setSuccess(''), 3000)
      return () => clearTimeout(timer)
    }
  }, [success])

  const handleEditStart = (setting: SystemSetting) => {
    setEditingId(setting.id)
    setEditForm(setting)
  }

  const handleEditCancel = () => {
    setEditingId(null)
    setEditForm({})
  }

  const handleEditSave = async (id: string) => {
    const validationErrors = validateSetting(editForm)
    if (validationErrors.length > 0) {
      setError(validationErrors.join(', '))
      return
    }

    try {
      setSaving(true)
      setError('')
      const { error } = await supabase
        .from('system_settings')
        .update({
          setting_value: editForm.setting_value,
          description: editForm.description,
          is_public: editForm.is_public,
          updated_at: new Date().toISOString()
        })
        .eq('id', id)
      if (error) throw error
      setSuccess('Setting updated successfully!')
      setEditingId(null)
      setEditForm({})
      loadSettings()
    } catch (error: any) {
      setError(error.message)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string, key: string) => {
    if (!confirm(`Are you sure you want to delete the setting "${key}"?`)) return
    try {
      setSaving(true)
      setError('')
      const { error } = await supabase
        .from('system_settings')
        .delete()
        .eq('id', id)
      if (error) throw error
      setSuccess('Setting deleted successfully!')
      loadSettings()
    } catch (error: any) {
      setError(error.message)
    } finally {
      setSaving(false)
    }
  }

  const validateSetting = (setting: NewSetting | Partial<SystemSetting>) => {
    const errors: string[] = []
    
    if (!setting.setting_key?.trim()) {
      errors.push('Setting key is required')
    } else if (!/^[a-z0-9_]+$/.test(setting.setting_key)) {
      errors.push('Setting key must contain only lowercase letters, numbers, and underscores')
    }
    
    if (!setting.setting_value?.trim()) {
      errors.push('Setting value is required')
    } else {
      // Validate based on type
      if (setting.setting_type === 'boolean' && !['true', 'false'].includes(setting.setting_value.toLowerCase())) {
        errors.push('Boolean value must be "true" or "false"')
      } else if (setting.setting_type === 'integer' && !/^-?\d+$/.test(setting.setting_value)) {
        errors.push('Integer value must be a whole number')
      } else if (setting.setting_type === 'decimal' && !/^-?\d*\.?\d+$/.test(setting.setting_value)) {
        errors.push('Decimal value must be a valid number')
      }
    }
    
    return errors
  }

  const handleAddNew = async () => {
    const validationErrors = validateSetting(newSetting)
    if (validationErrors.length > 0) {
      setError(validationErrors.join(', '))
      return
    }

    try {
      setSaving(true)
      setError('')
      
      // Check if key already exists
      const { data: existing } = await supabase
        .from('system_settings')
        .select('id')
        .eq('setting_key', newSetting.setting_key)
        .single()
      
      if (existing) {
        throw new Error('A setting with this key already exists')
      }
      
      const { error } = await supabase
        .from('system_settings')
        .insert([newSetting])
      if (error) throw error
      setSuccess('Setting added successfully!')
      setShowAddForm(false)
      setNewSetting({
        setting_key: '',
        setting_value: '',
        setting_type: 'string',
        description: '',
        is_public: false
      })
      loadSettings()
    } catch (error: any) {
      setError(error.message)
    } finally {
      setSaving(false)
    }
  }

  const filteredSettings = settings.filter(setting => {
    const matchesSearch = setting.setting_key.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         (setting.description?.toLowerCase().includes(searchTerm.toLowerCase()) ?? false)
    const matchesFilter = filterType === 'all' || 
                         (filterType === 'public' && setting.is_public) ||
                         (filterType === 'private' && !setting.is_public)
    return matchesSearch && matchesFilter
  })

  const formatValue = (value: string, type: string) => {
    if (type === 'boolean') return value === 'true' ? '✅ Yes' : '❌ No'
    if (type === 'decimal') return `$${value}`
    return value
  }

  const exportSettings = () => {
    const exportData = {
      exported_at: new Date().toISOString(),
      settings: settings.map(({ id, created_at, updated_at, ...rest }) => rest)
    }
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `system-settings-${new Date().toISOString().split('T')[0]}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    setSuccess('Settings exported successfully!')
  }

  const handleImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    try {
      const text = await file.text()
      const data = JSON.parse(text)
      
      if (!data.settings || !Array.isArray(data.settings)) {
        throw new Error('Invalid file format')
      }

      setSaving(true)
      setError('')
      
      for (const setting of data.settings) {
        const { error } = await supabase
          .from('system_settings')
          .upsert([setting], { onConflict: 'setting_key' })
        if (error) throw error
      }
      
      setSuccess(`Successfully imported ${data.settings.length} settings!`)
      loadSettings()
    } catch (error: any) {
      setError(`Import failed: ${error.message}`)
    } finally {
      setSaving(false)
      event.target.value = ''
    }
  }

  const resetToDefaults = async () => {
    if (!confirm('Are you sure you want to reset all settings to defaults? This will delete all custom settings.')) return
    
    try {
      setSaving(true)
      setError('')
      
      // Delete all existing settings
      const { error: deleteError } = await supabase
        .from('system_settings')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000') // Delete all
      
      if (deleteError) throw deleteError
      
      // Insert default settings
      const defaultSettings = [
        {
          setting_key: 'site_name',
          setting_value: 'MIHAS-KATC Application System',
          setting_type: 'string',
          description: 'Name of the application system',
          is_public: true
        },
        {
          setting_key: 'contact_email',
          setting_value: 'admissions@mihas-katc.ac.zm',
          setting_type: 'string',
          description: 'Main contact email for admissions',
          is_public: true
        },
        {
          setting_key: 'contact_phone',
          setting_value: '+260-123-456-789',
          setting_type: 'string',
          description: 'Main contact phone number',
          is_public: true
        },
        {
          setting_key: 'application_fee',
          setting_value: '50.00',
          setting_type: 'decimal',
          description: 'Application processing fee in USD',
          is_public: true
        },
        {
          setting_key: 'max_applications_per_user',
          setting_value: '3',
          setting_type: 'integer',
          description: 'Maximum number of applications a user can submit',
          is_public: false
        },
        {
          setting_key: 'enable_online_applications',
          setting_value: 'true',
          setting_type: 'boolean',
          description: 'Enable or disable online application submissions',
          is_public: true
        }
      ]
      
      const { error: insertError } = await supabase
        .from('system_settings')
        .insert(defaultSettings)
      
      if (insertError) throw insertError
      
      setSuccess('Settings reset to defaults successfully!')
      loadSettings()
    } catch (error: any) {
      setError(error.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50">
      <AdminNavigation />
      <div className="container-mobile py-4 sm:py-6 lg:py-8 safe-area-bottom">
        <div className="max-w-7xl mx-auto bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden">
          {/* Header */}
          <div className="bg-gradient-to-r from-indigo-500 to-purple-600 p-6 text-white">
            <div className="flex flex-col space-y-4 sm:flex-row sm:items-center sm:justify-between sm:space-y-0">
              <div className="flex flex-col space-y-3 sm:flex-row sm:items-center sm:space-y-0 sm:space-x-4">
                <Link to="/admin">
                  <Button variant="ghost" size="sm" className="text-white hover:bg-white/20 border-white/30">
                    <ArrowLeft className="h-4 w-4 mr-2" />
                    Back
                  </Button>
                </Link>
                <div>
                  <h1 className="text-2xl sm:text-3xl font-bold flex items-center">
                    <Settings className="h-8 w-8 mr-3" />
                    System Settings
                  </h1>
                  <p className="text-white/90 text-sm sm:text-base">Manage system configuration and preferences</p>
                </div>
              </div>
              <div className="flex flex-col sm:flex-row gap-2">
                <Button 
                  onClick={() => setShowAddForm(true)}
                  className="bg-white/20 hover:bg-white/30 text-white border-white/30"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Add Setting
                </Button>
                <div className="flex gap-2">
                  <Button 
                    onClick={exportSettings}
                    variant="outline"
                    className="bg-white/10 hover:bg-white/20 text-white border-white/30"
                    size="sm"
                  >
                    Export
                  </Button>
                  <label className="cursor-pointer">
                    <span className="inline-flex items-center justify-center rounded-xl font-semibold transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:pointer-events-none disabled:opacity-50 overflow-hidden group h-9 px-4 text-sm border-2 border-secondary bg-transparent text-white hover:bg-secondary hover:text-white bg-white/10 hover:bg-white/20 border-white/30">
                      Import
                    </span>
                    <input
                      type="file"
                      accept=".json"
                      onChange={handleImport}
                      className="hidden"
                    />
                  </label>
                </div>
              </div>
            </div>
          </div>

          {/* Statistics */}
          <div className="p-6 border-b border-gray-200 bg-gradient-to-r from-blue-50 to-indigo-50">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center">
                <div className="text-2xl font-bold text-blue-600">{settings.length}</div>
                <div className="text-sm text-gray-600">Total Settings</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-green-600">{settings.filter(s => s.is_public).length}</div>
                <div className="text-sm text-gray-600">Public</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-red-600">{settings.filter(s => !s.is_public).length}</div>
                <div className="text-sm text-gray-600">Private</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-purple-600">
                  {new Set(settings.map(s => s.setting_type)).size}
                </div>
                <div className="text-sm text-gray-600">Data Types</div>
              </div>
            </div>
          </div>

          {/* Filters and Search */}
          <div className="p-6 border-b border-gray-200 bg-gray-50">
            <div className="flex flex-col lg:flex-row gap-4">
              <div className="flex-1">
                <Input
                  placeholder="Search settings by key or description..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full"
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant={filterType === 'all' ? 'primary' : 'outline'}
                  onClick={() => setFilterType('all')}
                  size="sm"
                >
                  All ({settings.length})
                </Button>
                <Button
                  variant={filterType === 'public' ? 'primary' : 'outline'}
                  onClick={() => setFilterType('public')}
                  size="sm"
                >
                  <Globe className="h-4 w-4 mr-1" />
                  Public ({settings.filter(s => s.is_public).length})
                </Button>
                <Button
                  variant={filterType === 'private' ? 'primary' : 'outline'}
                  onClick={() => setFilterType('private')}
                  size="sm"
                >
                  <Lock className="h-4 w-4 mr-1" />
                  Private ({settings.filter(s => !s.is_public).length})
                </Button>
                <Button
                  variant="outline"
                  onClick={resetToDefaults}
                  size="sm"
                  className="text-red-600 hover:text-red-700 border-red-300 hover:border-red-400"
                >
                  Reset to Defaults
                </Button>
              </div>
            </div>
          </div>

          {/* Content */}
          <div className="p-6">

            {error && (
              <div className="rounded-xl bg-red-50 border border-red-200 p-4 mb-6">
                <div className="flex items-center space-x-3">
                  <div className="text-2xl">⚠️</div>
                  <div className="text-red-700 font-medium">{error}</div>
                </div>
              </div>
            )}

            {success && (
              <div className="rounded-xl bg-green-50 border border-green-200 p-4 mb-6">
                <div className="flex items-center space-x-3">
                  <div className="text-2xl">✅</div>
                  <div className="text-green-700 font-medium">{success}</div>
                </div>
              </div>
            )}

            {loading ? (
              <div className="flex justify-center py-16">
                <div className="text-center">
                  <LoadingSpinner size="lg" />
                  <p className="mt-4 text-lg text-gray-600">Loading settings...</p>
                </div>
              </div>
            ) : (
              <>
                {/* Add New Setting Form */}
                {showAddForm && (
                  <div className="bg-blue-50 border border-blue-200 rounded-xl p-6 mb-6">
                    <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                      <Plus className="h-5 w-5 mr-2" />
                      Add New Setting
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                      <Input
                        label="Setting Key"
                        value={newSetting.setting_key}
                        onChange={(e) => setNewSetting({...newSetting, setting_key: e.target.value})}
                        placeholder="e.g., max_file_size"
                      />
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
                        <select
                          value={newSetting.setting_type}
                          onChange={(e) => setNewSetting({...newSetting, setting_type: e.target.value as any})}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                          <option value="string">String</option>
                          <option value="integer">Integer</option>
                          <option value="decimal">Decimal</option>
                          <option value="boolean">Boolean</option>
                        </select>
                      </div>
                      <Input
                        label="Value"
                        value={newSetting.setting_value}
                        onChange={(e) => setNewSetting({...newSetting, setting_value: e.target.value})}
                        placeholder={newSetting.setting_type === 'boolean' ? 'true or false' : 'Enter value'}
                      />
                      <div className="flex items-center space-x-2">
                        <input
                          type="checkbox"
                          id="is_public"
                          checked={newSetting.is_public}
                          onChange={(e) => setNewSetting({...newSetting, is_public: e.target.checked})}
                          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                        <label htmlFor="is_public" className="text-sm font-medium text-gray-700">
                          Public Setting
                        </label>
                      </div>
                    </div>
                    <Input
                      label="Description"
                      value={newSetting.description}
                      onChange={(e) => setNewSetting({...newSetting, description: e.target.value})}
                      placeholder="Brief description of this setting"
                      className="mb-4"
                    />
                    <div className="flex space-x-3">
                      <Button onClick={handleAddNew} loading={saving}>
                        <Save className="h-4 w-4 mr-2" />
                        Add Setting
                      </Button>
                      <Button variant="outline" onClick={() => setShowAddForm(false)}>
                        <X className="h-4 w-4 mr-2" />
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}

                {/* Settings Table */}
                <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Setting Key
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Value
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Type
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Visibility
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Description
                          </th>
                          <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Actions
                          </th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {filteredSettings.map((setting) => (
                          <tr key={setting.id} className="hover:bg-gray-50">
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="flex items-center">
                                <Database className="h-4 w-4 text-gray-400 mr-2" />
                                <span className="text-sm font-medium text-gray-900">{setting.setting_key}</span>
                              </div>
                            </td>
                            <td className="px-6 py-4">
                              {editingId === setting.id ? (
                                <Input
                                  value={editForm.setting_value || ''}
                                  onChange={(e) => setEditForm({...editForm, setting_value: e.target.value})}
                                  className="w-full"
                                />
                              ) : (
                                <span className="text-sm text-gray-900 break-words">
                                  {formatValue(setting.setting_value, setting.setting_type)}
                                </span>
                              )}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                                setting.setting_type === 'boolean' ? 'bg-purple-100 text-purple-800' :
                                setting.setting_type === 'integer' ? 'bg-blue-100 text-blue-800' :
                                setting.setting_type === 'decimal' ? 'bg-green-100 text-green-800' :
                                'bg-gray-100 text-gray-800'
                              }`}>
                                {setting.setting_type}
                              </span>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              {editingId === setting.id ? (
                                <input
                                  type="checkbox"
                                  checked={editForm.is_public || false}
                                  onChange={(e) => setEditForm({...editForm, is_public: e.target.checked})}
                                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                />
                              ) : (
                                <span className={`inline-flex items-center px-2 py-1 text-xs font-semibold rounded-full ${
                                  setting.is_public ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                                }`}>
                                  {setting.is_public ? (
                                    <><Globe className="h-3 w-3 mr-1" /> Public</>
                                  ) : (
                                    <><Lock className="h-3 w-3 mr-1" /> Private</>
                                  )}
                                </span>
                              )}
                            </td>
                            <td className="px-6 py-4">
                              {editingId === setting.id ? (
                                <Input
                                  value={editForm.description || ''}
                                  onChange={(e) => setEditForm({...editForm, description: e.target.value})}
                                  className="w-full"
                                  placeholder="Description"
                                />
                              ) : (
                                <span className="text-sm text-gray-500 break-words">
                                  {setting.description || 'No description'}
                                </span>
                              )}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                              {editingId === setting.id ? (
                                <div className="flex justify-end space-x-2">
                                  <Button
                                    size="sm"
                                    onClick={() => handleEditSave(setting.id)}
                                    loading={saving}
                                  >
                                    <Save className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={handleEditCancel}
                                  >
                                    <X className="h-4 w-4" />
                                  </Button>
                                </div>
                              ) : (
                                <div className="flex justify-end space-x-2">
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => handleEditStart(setting)}
                                  >
                                    <Edit2 className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => handleDelete(setting.id, setting.setting_key)}
                                    className="text-red-600 hover:text-red-700"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </div>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  
                  {filteredSettings.length === 0 && (
                    <div className="text-center py-12">
                      <Database className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                      <h3 className="text-lg font-medium text-gray-900 mb-2">No settings found</h3>
                      <p className="text-gray-500 mb-4">
                        {searchTerm ? 'No settings match your search criteria.' : 'No settings configured yet.'}
                      </p>
                      {!searchTerm && (
                        <Button onClick={() => setShowAddForm(true)}>
                          <Plus className="h-4 w-4 mr-2" />
                          Add First Setting
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}