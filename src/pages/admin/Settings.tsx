import React, { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { StandaloneSelect } from '@/components/ui/standalone-select'
import { ArrowLeft, Plus, Edit2, Trash2, Save, X, Settings, Globe, Lock, Database, Grid, List } from 'lucide-react'
import { ConfirmAlertDialog } from '@/components/ui/alert-dialog'
import { useConfirmDialog } from '@/hooks/useConfirmDialog'
import { fetchSettings, createSetting, updateSetting, deleteSetting, importSettings, resetSettings, type SystemSetting } from '@/lib/api/adminApi'



type SettingValueType = 'string' | 'integer' | 'decimal' | 'boolean'

interface NewSetting {
  key: string
  value: string
  valueType: SettingValueType
  description: string
  category: string
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
  const [viewMode, setViewMode] = useState<'table' | 'cards'>('table')
  const [editForm, setEditForm] = useState<Partial<SystemSetting>>({})
  const confirmDialog = useConfirmDialog()
  const [newSetting, setNewSetting] = useState<NewSetting>({
    key: '',
    value: '',
    valueType: 'string',
    description: '',
    category: '',
    is_public: false
  })

  const loadSettings = useCallback(async () => {
    try {
      setLoading(true)
      const data = await fetchSettings()
      setSettings(data)
    } catch (error: any) {
      setError(error.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadSettings()
  }, [loadSettings])



  const inferValueType = (value: string): SettingValueType => {
    const trimmed = value.trim().toLowerCase()
    if (trimmed === 'true' || trimmed === 'false') return 'boolean'
    if (/^-?\d+$/.test(trimmed)) return 'integer'
    if (/^-?\d*\.\d+$/.test(trimmed)) return 'decimal'
    return 'string'
  }

  const getValueTypeClass = (type: SettingValueType) => {
    if (type === 'boolean') return 'bg-purple-100 text-purple-800'
    if (type === 'integer') return 'bg-primary/10 text-primary-foreground'
    if (type === 'decimal') return 'bg-accent/10 text-accent-foreground'
    return 'bg-accent text-foreground'
  }

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
    const validationErrors = validateSetting(editForm, inferValueType(editForm.value || ''))
    if (validationErrors.length > 0) {
      setError(validationErrors.join(', '))
      return
    }

    try {
      setSaving(true)
      setError('')
      const success = await updateSetting(id, {
        value: editForm.value,
        description: editForm.description,
        is_public: editForm.is_public
      })
      if (!success) throw new Error('Update failed')
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
    const confirmed = await confirmDialog.confirm({
      title: 'Delete Setting',
      message: `The setting "${key}" will be permanently deleted.`,
      confirmText: 'Delete',
      variant: 'danger'
    })
    if (!confirmed) return
    try {
      setSaving(true)
      setError('')
      const success = await deleteSetting(id, key)
      if (!success) throw new Error('Delete failed')
      setSuccess('Setting deleted successfully!')
      loadSettings()
    } catch (error: any) {
      setError(error.message)
    } finally {
      setSaving(false)
    }
  }

  const validateSetting = (
    setting: Pick<NewSetting, 'key' | 'value'> | Partial<SystemSetting>,
    valueType: SettingValueType
  ) => {
    const errors: string[] = []
    
    if (!setting.key?.trim()) {
      errors.push('Setting key is required')
    } else if (!/^[a-z0-9_]+$/.test(setting.key)) {
      errors.push('Setting key must contain only lowercase letters, numbers, and underscores')
    }
    
    if (!setting.value?.trim()) {
      errors.push('Setting value is required')
    } else {
      // Validate based on type
      if (valueType === 'boolean' && !['true', 'false'].includes(setting.value.toLowerCase())) {
        errors.push('Boolean value must be "true" or "false"')
      } else if (valueType === 'integer' && !/^-?\d+$/.test(setting.value)) {
        errors.push('Integer value must be a whole number')
      } else if (valueType === 'decimal' && !/^-?\d*\.?\d+$/.test(setting.value)) {
        errors.push('Decimal value must be a valid number')
      }
    }
    
    return errors
  }

  const handleAddNew = async () => {
    const validationErrors = validateSetting(newSetting, newSetting.valueType)
    if (validationErrors.length > 0) {
      setError(validationErrors.join(', '))
      return
    }

    try {
      setSaving(true)
      setError('')
      
      const success = await createSetting(newSetting)
      if (!success) throw new Error('Create failed')
      setSuccess('Setting added successfully!')
      setShowAddForm(false)
      setNewSetting({
        key: '',
        value: '',
        valueType: 'string',
        description: '',
        category: '',
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
    const matchesSearch = setting.key.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         (setting.description?.toLowerCase().includes(searchTerm.toLowerCase()) ?? false)
    const matchesFilter = filterType === 'all' || 
                         (filterType === 'public' && setting.is_public) ||
                         (filterType === 'private' && !setting.is_public)
    return matchesSearch && matchesFilter
  })

  const formatValue = (value: string, type: string) => {
    if (type === 'boolean') return value === 'true' ? '✅ Yes' : '❌ No'
    if (type === 'decimal') return parseFloat(value).toFixed(2)
    if (type === 'integer') return parseInt(value).toLocaleString()
    return value
  }

  const getSettingCategory = (key: string): string => {
    if (key.includes('email') || key.includes('contact') || key.includes('phone')) return 'Contact'
    if (key.includes('fee') || key.includes('payment') || key.includes('price')) return 'Financial'
    if (key.includes('enable') || key.includes('allow') || key.includes('disable')) return 'Features'
    if (key.includes('max') || key.includes('min') || key.includes('limit')) return 'Limits'
    if (key.includes('site') || key.includes('name') || key.includes('title')) return 'General'
    return 'Other'
  }

  const groupedSettings = filteredSettings.reduce((acc, setting) => {
    const category = setting.category || getSettingCategory(setting.key)
    if (!acc[category]) acc[category] = []
    acc[category].push(setting)
    return acc
  }, {} as Record<string, SystemSetting[]>)

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
      
      const result = await importSettings(data.settings)
      
      if (!result.success) {
        throw new Error(result.message || 'Import failed')
      }
      
      setSuccess(result.message || `Successfully imported ${data.settings.length} settings!`)
      loadSettings()
    } catch (error: any) {
      setError(`Import failed: ${error.message}`)
    } finally {
      setSaving(false)
      event.target.value = ''
    }
  }

  const resetToDefaults = async () => {
    const confirmed = await confirmDialog.confirm({
      title: 'Reset to Defaults',
      message: 'All custom settings will be deleted and replaced with default values.',
      confirmText: 'Reset',
      variant: 'warning'
    })
    if (!confirmed) return
    
    try {
      setSaving(true)
      setError('')
      
      const result = await resetSettings()
      
      if (!result.success) {
        throw new Error(result.message || 'Reset failed')
      }
      
      setSuccess(result.message || 'Settings reset to defaults successfully!')
      loadSettings()
    } catch (error: any) {
      setError(error.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50">
      <div className="safe-area-bottom py-4 sm:py-6 lg:py-8 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
        <div className="bg-card rounded-2xl shadow-xl border border-border overflow-hidden">
          {/* Header */}
          <div className="bg-gradient-to-r from-indigo-500 to-purple-600 p-6 text-white">
            <div className="flex flex-col space-y-4 sm:flex-row sm:items-center sm:justify-between sm:space-y-0">
              <div className="flex flex-col space-y-3 sm:flex-row sm:items-center sm:space-y-0 sm:space-x-4">
                <Link to="/admin">
                  <Button variant="ghost" size="sm" className="text-white hover:bg-white/20 border-white">
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
                  className="bg-card/80 hover:bg-white/20 text-white border-white/30"
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
                    <span className="inline-flex items-center justify-center rounded-xl font-semibold transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:pointer-events-none disabled:opacity-50 overflow-hidden group h-9 px-4 text-sm bg-white/10 hover:bg-white/20 text-white border-white/30">
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
          <div className="p-6 border-b border-border bg-gradient-to-r from-blue-50 to-indigo-50">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center">
                <div className="text-2xl font-bold text-info-strong">{settings.length}</div>
                <div className="text-sm text-foreground">Total Settings</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-warning-strong">{settings.filter(s => s.is_public).length}</div>
                <div className="text-sm text-foreground">Public</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-destructive">{settings.filter(s => !s.is_public).length}</div>
                <div className="text-sm text-foreground">Private</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-foreground">
                  {new Set(settings.map(s => inferValueType(s.value))).size}
                </div>
                <div className="text-sm text-foreground">Data Types</div>
              </div>
            </div>
          </div>

          {/* Filters and Search */}
          <div className="p-6 border-b border-border bg-muted">
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
                <div className="flex gap-1 mr-2">
                  <Button
                    variant={viewMode === 'table' ? 'primary' : 'outline'}
                    onClick={() => setViewMode('table')}
                    size="sm"
                  >
                    <List className="h-4 w-4" />
                  </Button>
                  <Button
                    variant={viewMode === 'cards' ? 'primary' : 'outline'}
                    onClick={() => setViewMode('cards')}
                    size="sm"
                  >
                    <Grid className="h-4 w-4" />
                  </Button>
                </div>
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
                  className="text-destructive hover:text-error border-destructive/30 hover:border-red-400"
                >
                  Reset to Defaults
                </Button>
              </div>
            </div>
          </div>

          {/* Content */}
          <div className="p-6">

            {error && (
              <div className="rounded-xl bg-destructive/5 border border-destructive/30 p-4 mb-6">
                <div className="flex items-center space-x-3">
                  <div className="text-2xl">⚠️</div>
                  <div className="text-error font-medium">{error}</div>
                </div>
              </div>
            )}

            {success && (
              <div className="rounded-xl bg-accent/10 border border-accent/30 p-4 mb-6">
                <div className="flex items-center space-x-3">
                  <div className="text-2xl">✅</div>
                  <div className="text-accent font-medium">{success}</div>
                </div>
              </div>
            )}

            {loading ? (
              <div className="flex justify-center py-8 sm:py-16">
                <div className="text-center">
                  <LoadingSpinner size="lg" />
                  <p className="mt-4 text-lg text-foreground">Loading settings...</p>
                </div>
              </div>
            ) : (
              <>
                {/* Add New Setting Form */}
                {showAddForm && (
                  <div className="bg-primary/5 border border-primary/30 rounded-xl p-6 mb-6">
                    <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center">
                      <Plus className="h-5 w-5 mr-2" />
                      Add New Setting
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                      <Input
                        label="Setting Key"
                        value={newSetting.key}
                        onChange={(e) => setNewSetting({...newSetting, key: e.target.value})}
                        placeholder="e.g., max_file_size"
                      />
                      <StandaloneSelect
                        value={newSetting.valueType}
                        onChange={(value) => setNewSetting({...newSetting, valueType: value as SettingValueType})}
                        options={[
                          { value: 'string', label: 'String' },
                          { value: 'integer', label: 'Integer' },
                          { value: 'decimal', label: 'Decimal' },
                          { value: 'boolean', label: 'Boolean' },
                        ]}
                        label="Type"
                      />
                      <Input
                        label="Value"
                        value={newSetting.value}
                        onChange={(e) => setNewSetting({...newSetting, value: e.target.value})}
                        placeholder={newSetting.valueType === 'boolean' ? 'true or false' : 'Enter value'}
                      />
                      <div className="flex items-center space-x-2">
                        <input
                          type="checkbox"
                          id="is_public"
                          checked={newSetting.is_public}
                          onChange={(e) => setNewSetting({...newSetting, is_public: e.target.checked})}
                          className="rounded border-input text-primary focus:ring-blue-500"
                        />
                        <label htmlFor="is_public" className="text-sm font-medium text-foreground">
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
                    <Input
                      label="Category"
                      value={newSetting.category}
                      onChange={(e) => setNewSetting({...newSetting, category: e.target.value})}
                      placeholder="e.g., general"
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

                {/* Settings Display */}
                {viewMode === 'cards' ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {Object.entries(groupedSettings).map(([category, categorySettings]) => (
                      <div key={category} className="space-y-3">
                        <h3 className="text-sm font-semibold text-foreground uppercase tracking-wide px-2">
                          {category}
                        </h3>
                        {categorySettings.map((setting) => (
                          <div key={setting.id} className="bg-card border border-border rounded-xl p-4 hover:shadow-md transition-shadow">
                            <div className="flex items-start justify-between mb-2">
                              <div className="flex-1">
                                <div className="flex items-center gap-2 mb-1">
                                  <Database className="h-4 w-4 text-foreground" />
                                  <span className="text-sm font-semibold text-foreground">{setting.key}</span>
                                </div>
                                <span className={`inline-flex px-2 py-0.5 text-xs font-semibold rounded-full ${
                                  getValueTypeClass(inferValueType(setting.value))
                                }`}>
                                  {inferValueType(setting.value)}
                                </span>
                              </div>
                              <span className={`inline-flex items-center px-2 py-1 text-xs font-semibold rounded-full ${
                                setting.is_public ? 'bg-accent/10 text-accent-foreground' : 'bg-destructive/10 text-destructive-foreground'
                              }`}>
                                {setting.is_public ? <Globe className="h-3 w-3" /> : <Lock className="h-3 w-3" />}
                              </span>
                            </div>
                            <div className="mb-3">
                              <div className="text-lg font-bold text-foreground mb-1">
                                {formatValue(setting.value, inferValueType(setting.value))}
                              </div>
                              <p className="text-xs text-foreground">{setting.description || 'No description'}</p>
                            </div>
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleEditStart(setting)}
                                className="flex-1"
                              >
                                <Edit2 className="h-3 w-3 mr-1" />
                                Edit
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleDelete(setting.id, setting.key)}
                                className="text-destructive hover:text-error"
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="bg-card border border-border rounded-xl overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-border">
                      <thead className="bg-muted">
                        <tr>
                          <th className="px-6 py-3 text-left text-xs font-medium text-foreground uppercase tracking-wider">
                            Setting Key
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-foreground uppercase tracking-wider">
                            Value
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-foreground uppercase tracking-wider">
                            Type
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-foreground uppercase tracking-wider">
                            Visibility
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-foreground uppercase tracking-wider">
                            Description
                          </th>
                          <th className="px-6 py-3 text-right text-xs font-medium text-foreground uppercase tracking-wider">
                            Actions
                          </th>
                        </tr>
                      </thead>
                      <tbody className="bg-card divide-y divide-border">
                        {filteredSettings.map((setting) => (
                          <tr key={setting.id} className="hover:bg-muted">
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="flex items-center">
                                <Database className="h-4 w-4 text-foreground mr-2" />
                                <span className="text-sm font-medium text-foreground">{setting.key}</span>
                              </div>
                            </td>
                            <td className="px-6 py-4">
                              {editingId === setting.id ? (
                                <Input
                                  value={editForm.value || ''}
                                  onChange={(e) => setEditForm({...editForm, value: e.target.value})}
                                  className="w-full"
                                />
                              ) : (
                                <span className="text-sm text-foreground break-words">
                                  {formatValue(setting.value, inferValueType(setting.value))}
                                </span>
                              )}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                                getValueTypeClass(inferValueType(setting.value))
                              }`}>
                                {inferValueType(setting.value)}
                              </span>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              {editingId === setting.id ? (
                                <input
                                  type="checkbox"
                                  checked={editForm.is_public || false}
                                  onChange={(e) => setEditForm({...editForm, is_public: e.target.checked})}
                                  className="rounded border-input text-primary focus:ring-blue-500"
                                />
                              ) : (
                                <span className={`inline-flex items-center px-2 py-1 text-xs font-semibold rounded-full ${
                                  setting.is_public ? 'bg-accent/10 text-accent-foreground' : 'bg-destructive/10 text-destructive-foreground'
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
                                <span className="text-sm text-foreground break-words">
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
                                    onClick={() => handleDelete(setting.id, setting.key)}
                                    className="text-destructive hover:text-error"
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
                  </div>
                )}
                  
                  {filteredSettings.length === 0 && (
                    <div className="text-center py-6 sm:py-12">
                      <Database className="h-12 w-12 text-foreground mx-auto mb-4" />
                      <h3 className="text-lg font-medium text-foreground mb-2">No settings found</h3>
                      <p className="text-foreground mb-4">
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
              </>
            )}
          </div>
        </div>
      </div>
      <ConfirmAlertDialog
        isOpen={confirmDialog.isOpen}
        onClose={confirmDialog.handleCancel}
        onConfirm={confirmDialog.handleConfirm}
        title={confirmDialog.options.title}
        message={confirmDialog.options.message}
        confirmText={confirmDialog.options.confirmText}
        cancelText={confirmDialog.options.cancelText}
        variant={confirmDialog.options.variant}
      />
    </div>
  )
}
