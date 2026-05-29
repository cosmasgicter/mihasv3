import React from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/Button'
import { CanonicalSelect } from '@/components/ui/CanonicalSelect'
import { ChevronDown, ChevronUp, Database, Edit2, Globe, Lock, Plus, Save, Trash2, X } from 'lucide-react'
import type { SystemSetting } from '@/lib/api/adminApi'
import type { NewSetting, SettingValueType } from '@/pages/admin/lib/settingsValidation'
import { formatValue, getValueTypeClass, inferValueType } from '@/pages/admin/lib/settingsValidation'

interface AdvancedKeysSectionProps {
  showAdvancedSettings: boolean
  showAddForm: boolean
  filteredAdvancedSettings: SystemSetting[]
  editingId: string | null
  editForm: Partial<SystemSetting>
  newSetting: NewSetting
  saving: boolean
  onToggleAdvanced: () => void
  onEditStart: (setting: SystemSetting) => void
  onEditCancel: () => void
  onEditSave: (id: string) => void
  onDelete: (id: string, key: string) => void
  onAddNew: () => void
  onCancelAdd: () => void
  onEditFormChange: (field: string, value: string | boolean) => void
  onNewSettingChange: (field: string, value: string | boolean) => void
}

export function AdvancedKeysSection({
  showAdvancedSettings,
  showAddForm,
  filteredAdvancedSettings,
  editingId,
  editForm,
  newSetting,
  saving,
  onToggleAdvanced,
  onEditStart,
  onEditCancel,
  onEditSave,
  onDelete,
  onAddNew,
  onCancelAdd,
  onEditFormChange,
  onNewSettingChange,
}: AdvancedKeysSectionProps) {
  return (
    <div className="rounded-lg border border-border bg-card">
      <button
        type="button"
        onClick={onToggleAdvanced}
        className="flex w-full items-center justify-between gap-4 p-5 text-left"
        aria-expanded={showAdvancedSettings}
      >
        <div>
          <h2 className="text-lg font-semibold text-foreground">Advanced Keys</h2>
          <p className="text-sm text-muted-foreground">
            Use this section for non-standard keys not covered by the guided configuration above.
          </p>
        </div>
        {showAdvancedSettings ? <ChevronUp className="h-5 w-5 text-muted-foreground" /> : <ChevronDown className="h-5 w-5 text-muted-foreground" />}
      </button>

      {showAdvancedSettings ? (
        <div className="border-t border-border p-5">
          {showAddForm ? (
            <div className="mb-6 rounded-lg border border-primary/30 bg-primary/5 p-5">
              <div className="mb-4 flex items-center gap-2">
                <Plus className="h-5 w-5 text-primary" />
                <h3 className="font-semibold text-foreground">Create Advanced Key</h3>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <Input
                  label="Setting key"
                  value={newSetting.key}
                  onChange={(event) => onNewSettingChange('key', event.target.value)}
                  placeholder="e.g. sms_provider_name"
                />
                <CanonicalSelect
                  value={newSetting.valueType}
                  onChange={(value) => onNewSettingChange('valueType', value)}
                  options={[
                    { value: 'string', label: 'String' },
                    { value: 'integer', label: 'Integer' },
                    { value: 'decimal', label: 'Decimal' },
                    { value: 'boolean', label: 'Boolean' },
                  ]}
                  label="Value type"
                />
                <Input
                  label="Value"
                  value={newSetting.value}
                  onChange={(event) => onNewSettingChange('value', event.target.value)}
                  placeholder={newSetting.valueType === 'boolean' ? 'true or false' : 'Enter value'}
                />
                <CanonicalSelect
                  value={newSetting.is_public ? 'public' : 'private'}
                  onChange={(value) => onNewSettingChange('is_public', value === 'public')}
                  options={[
                    { value: 'public', label: 'Public' },
                    { value: 'private', label: 'Private' },
                  ]}
                  label="Visibility"
                />
                <Input
                  label="Description"
                  value={newSetting.description}
                  onChange={(event) => onNewSettingChange('description', event.target.value)}
                  placeholder="What this key controls"
                />
                <Input
                  label="Category"
                  value={newSetting.category}
                  onChange={(event) => onNewSettingChange('category', event.target.value)}
                  placeholder="e.g. messaging"
                />
              </div>

              <div className="mt-4 flex gap-3">
                <Button onClick={onAddNew} loading={saving}>
                  <Save className="h-4 w-4 mr-2" />
                  Save Advanced Key
                </Button>
                <Button variant="outline" onClick={onCancelAdd}>
                  <X className="h-4 w-4 mr-2" />
                  Cancel
                </Button>
              </div>
            </div>
          ) : null}

          {filteredAdvancedSettings.length > 0 ? (
            <>
              {/* Mobile card layout */}
              <div className="space-y-3 md:hidden">
                {filteredAdvancedSettings.map((setting) => (
                  <div key={setting.id} className="rounded-lg border border-border bg-muted/20 p-4">
                    <div className="mb-2 flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <Database className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <span className="font-medium text-foreground truncate">{setting.key}</span>
                      </div>
                      <div className="flex shrink-0 gap-1">
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${getValueTypeClass(inferValueType(setting.value))}`}>
                          {inferValueType(setting.value)}
                        </span>
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${
                          setting.is_public ? 'bg-accent/10 text-accent-foreground' : 'bg-destructive/10 text-destructive-foreground'
                        }`}>
                          {setting.is_public ? <Globe className="h-3 w-3" /> : <Lock className="h-3 w-3" />}
                        </span>
                      </div>
                    </div>

                    {editingId === setting.id ? (
                      <div className="space-y-3">
                        <Input
                          label="Value"
                          value={editForm.value || ''}
                          onChange={(event) => onEditFormChange('value', event.target.value)}
                        />
                        <CanonicalSelect
                          label="Visibility"
                          value={editForm.is_public ? 'public' : 'private'}
                          onChange={(value) => onEditFormChange('is_public', value === 'public')}
                          options={[
                            { value: 'public', label: 'Public' },
                            { value: 'private', label: 'Private' },
                          ]}
                        />
                        <Input
                          label="Description"
                          value={editForm.description || ''}
                          onChange={(event) => onEditFormChange('description', event.target.value)}
                          placeholder="Description"
                        />
                        <div className="flex gap-2">
                          <Button size="sm" onClick={() => onEditSave(setting.id)} loading={saving} aria-label="Save setting">
                            <Save className="h-4 w-4 mr-1" />
                            Save
                          </Button>
                          <Button size="sm" variant="outline" onClick={onEditCancel} aria-label="Cancel editing">
                            <X className="h-4 w-4 mr-1" />
                            Cancel
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <p className="text-sm text-foreground">{formatValue(setting.value, inferValueType(setting.value))}</p>
                        <p className="mt-1 text-xs text-muted-foreground">{setting.description || 'No description'}</p>
                        <div className="mt-3 flex gap-2">
                          <Button size="sm" variant="outline" onClick={() => onEditStart(setting)} aria-label="Edit setting" className="min-h-touch min-w-touch">
                            <Edit2 className="h-4 w-4 mr-1" />
                            Edit
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => onDelete(setting.id, setting.key)}
                            className="min-h-touch min-w-touch border-destructive/30 text-destructive hover:bg-destructive/5"
                            aria-label="Delete setting"
                          >
                            <Trash2 className="h-4 w-4 mr-1" />
                            Delete
                          </Button>
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>

              {/* Desktop table layout */}
              <div className="hidden md:block overflow-x-auto">
                <table className="min-w-full divide-y divide-border" aria-label="Advanced settings">
                  <thead className="bg-muted/60">
                    <tr>
                      <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Key</th>
                      <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Value</th>
                      <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Type</th>
                      <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Visibility</th>
                      <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Description</th>
                      <th scope="col" className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border bg-card">
                    {filteredAdvancedSettings.map((setting) => (
                      <tr key={setting.id}>
                        <td className="px-4 py-4">
                          <div className="flex items-center gap-2">
                            <Database className="h-4 w-4 text-muted-foreground" />
                            <span className="font-medium text-foreground">{setting.key}</span>
                          </div>
                        </td>
                        <td className="px-4 py-4">
                          {editingId === setting.id ? (
                            <Input
                              value={editForm.value || ''}
                              onChange={(event) => onEditFormChange('value', event.target.value)}
                            />
                          ) : (
                            <span className="text-sm text-foreground">
                              {formatValue(setting.value, inferValueType(setting.value))}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-4">
                          <span className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${getValueTypeClass(inferValueType(setting.value))}`}>
                            {inferValueType(setting.value)}
                          </span>
                        </td>
                        <td className="px-4 py-4">
                          {editingId === setting.id ? (
                            <CanonicalSelect
                              value={editForm.is_public ? 'public' : 'private'}
                              onChange={(value) => onEditFormChange('is_public', value === 'public')}
                              options={[
                                { value: 'public', label: 'Public' },
                                { value: 'private', label: 'Private' },
                              ]}
                            />
                          ) : (
                            <span className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-semibold ${
                              setting.is_public ? 'bg-accent/10 text-accent-foreground' : 'bg-destructive/10 text-destructive-foreground'
                            }`}>
                              {setting.is_public ? (
                                <>
                                  <Globe className="h-3 w-3 mr-1" />
                                  Public
                                </>
                              ) : (
                                <>
                                  <Lock className="h-3 w-3 mr-1" />
                                  Private
                                </>
                              )}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-4">
                          {editingId === setting.id ? (
                            <Input
                              value={editForm.description || ''}
                              onChange={(event) => onEditFormChange('description', event.target.value)}
                              placeholder="Description"
                            />
                          ) : (
                            <span className="text-sm text-muted-foreground">{setting.description || 'No description'}</span>
                          )}
                        </td>
                        <td className="px-4 py-4">
                          <div className="flex justify-end gap-2">
                            {editingId === setting.id ? (
                              <>
                                <Button size="sm" onClick={() => onEditSave(setting.id)} loading={saving} aria-label="Save setting">
                                  <Save className="h-4 w-4" />
                                </Button>
                                <Button size="sm" variant="outline" onClick={onEditCancel} aria-label="Cancel editing">
                                  <X className="h-4 w-4" />
                                </Button>
                              </>
                            ) : (
                              <>
                                <Button size="sm" variant="outline" onClick={() => onEditStart(setting)} aria-label="Edit setting">
                                  <Edit2 className="h-4 w-4" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => onDelete(setting.id, setting.key)}
                                  className="border-destructive/30 text-destructive hover:bg-destructive/5"
                                  aria-label="Delete setting"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <div className="rounded-lg border border-dashed border-border bg-muted/20 px-6 py-12 text-center">
              <Database className="mx-auto h-10 w-10 text-muted-foreground" />
              <h3 className="mt-4 text-lg font-semibold text-foreground">No advanced keys found</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                The guided configuration covers the main admissions settings right now.
              </p>
            </div>
          )}
        </div>
      ) : null}
    </div>
  )
}
