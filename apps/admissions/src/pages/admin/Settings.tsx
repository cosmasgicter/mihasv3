import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/Button'
import { DashboardSkeleton } from '@/components/ui'
import { CanonicalSelect } from '@/components/ui/CanonicalSelect'
import { ConfirmAlertDialog } from '@/components/ui/alert-dialog'
import { useConfirmDialog } from '@/hooks/useConfirmDialog'
import {
  fetchSettings,
  createSetting,
  updateSetting,
  deleteSetting,
  importSettings,
  resetSettings,
  type SystemSetting,
} from '@/lib/api/adminApi'
import {
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  Database,
  Edit2,
  Globe,
  Lock,
  Phone,
  Plus,
  Save,
  Settings,
  Trash2,
  Users,
  X,
} from 'lucide-react'
import { PageShell } from '@/components/ui/PageShell'
import { Seo } from '@/components/seo/Seo'

type SettingValueType = 'string' | 'integer' | 'decimal' | 'boolean'
type VisibilityFilter = 'all' | 'public' | 'private'

interface NewSetting {
  key: string
  value: string
  valueType: SettingValueType
  description: string
  category: string
  is_public: boolean
}

interface GuidedSettingDraft {
  value: string
  description: string
  category: string
  is_public: boolean
}

interface SettingBlueprint {
  key: string
  label: string
  description: string
  category: string
  valueType: SettingValueType
  placeholder: string
  is_public: boolean
}

interface GuidedSection {
  id: string
  title: string
  description: string
  icon: React.ReactNode
  settingKeys: string[]
}

const SETTING_BLUEPRINTS: SettingBlueprint[] = [
  {
    key: 'site_name',
    label: 'Portal name',
    description: 'Primary platform title shown across public and authenticated screens.',
    category: 'general',
    valueType: 'string',
    placeholder: 'MIHAS Application System',
    is_public: true,
  },
  {
    key: 'enable_online_applications',
    label: 'Online applications',
    description: 'Controls whether students can start or continue applications online.',
    category: 'general',
    valueType: 'boolean',
    placeholder: 'true',
    is_public: true,
  },
  {
    key: 'contact_email',
    label: 'Admissions email',
    description: 'Primary email used for admissions contact, slip delivery, and public support messaging.',
    category: 'contact',
    valueType: 'string',
    placeholder: 'admissions@mihas.edu.zm',
    is_public: true,
  },
  {
    key: 'contact_phone',
    label: 'Admissions phone',
    description: 'Primary phone number shown to applicants and used by support surfaces.',
    category: 'contact',
    valueType: 'string',
    placeholder: '+260-000-000-000',
    is_public: true,
  },
  {
    key: 'application_fee',
    label: 'Application fee',
    description: 'Default admissions application fee used in payment guidance and review.',
    category: 'finance',
    valueType: 'decimal',
    placeholder: '153.00',
    is_public: true,
  },
  {
    key: 'max_applications_per_user',
    label: 'Application limit per student',
    description: 'Maximum number of application records a single student can submit.',
    category: 'limits',
    valueType: 'integer',
    placeholder: '3',
    is_public: false,
  },
  {
    key: 'multi_intake_policy',
    label: 'Multi-intake policy',
    description: 'Controls how students may apply across multiple intakes.',
    category: 'limits',
    valueType: 'string',
    placeholder: 'unrestricted',
    is_public: false,
  },
]

const GUIDED_SECTIONS: GuidedSection[] = [
  {
    id: 'experience',
    title: 'Portal Experience',
    description: 'Public-facing branding and the main online admissions switch.',
    icon: <Settings className="h-5 w-5" />,
    settingKeys: ['site_name', 'enable_online_applications'],
  },
  {
    id: 'contact',
    title: 'Admissions Contact',
    description: 'Official contact details used across public pages and notification surfaces.',
    icon: <Phone className="h-5 w-5" />,
    settingKeys: ['contact_email', 'contact_phone'],
  },
  {
    id: 'operations',
    title: 'Admissions Operations',
    description: 'Fee and intake guardrails that affect application processing.',
    icon: <Users className="h-5 w-5" />,
    settingKeys: ['application_fee', 'max_applications_per_user', 'multi_intake_policy'],
  },
]

const initialNewSetting: NewSetting = {
  key: '',
  value: '',
  valueType: 'string',
  description: '',
  category: '',
  is_public: false,
}

function inferValueType(value: string): SettingValueType {
  const trimmed = value.trim().toLowerCase()
  if (trimmed === 'true' || trimmed === 'false') return 'boolean'
  if (/^-?\d+$/.test(trimmed)) return 'integer'
  if (/^-?\d*\.?\d+$/.test(trimmed)) return 'decimal'
  return 'string'
}

function getValueTypeClass(type: SettingValueType) {
  if (type === 'boolean') return 'bg-purple-100 text-purple-800'
  if (type === 'integer') return 'bg-primary/10 text-primary-foreground'
  if (type === 'decimal') return 'bg-accent/10 text-accent-foreground'
  return 'bg-accent text-foreground'
}

export function validateSetting(
  setting: Pick<NewSetting, 'key' | 'value'> | Partial<SystemSetting>,
  valueType: SettingValueType
) {
  const errors: string[] = []

  if (!setting.key?.trim()) {
    errors.push('Setting key is required')
  } else if (!/^[a-z0-9_]+$/.test(setting.key)) {
    errors.push('Setting key must contain only lowercase letters, numbers, and underscores')
  }

  if (!setting.value?.trim()) {
    errors.push('Setting value is required')
  } else {
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

function formatValue(value: string, type: SettingValueType) {
  if (type === 'boolean') return value === 'true' ? 'Enabled' : 'Disabled'
  if (type === 'decimal') return Number.parseFloat(value || '0').toFixed(2)
  if (type === 'integer') return Number.parseInt(value || '0', 10).toLocaleString()
  return value
}

function matchesVisibility(isPublic: boolean, filterType: VisibilityFilter) {
  if (filterType === 'all') return true
  if (filterType === 'public') return isPublic
  return !isPublic
}

function buildGuidedDraft(blueprint: SettingBlueprint, setting?: SystemSetting): GuidedSettingDraft {
  return {
    value: setting?.value || '',
    description: setting?.description || blueprint.description,
    category: setting?.category || blueprint.category,
    is_public: setting?.is_public ?? blueprint.is_public,
  }
}

export default function AdminSettings() {
  const queryClient = useQueryClient()
  const [guidedDrafts, setGuidedDrafts] = useState<Record<string, GuidedSettingDraft>>({})
  const [saving, setSaving] = useState(false)
  const [activeMutationKey, setActiveMutationKey] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [showAddForm, setShowAddForm] = useState(false)
  const [showAdvancedSettings, setShowAdvancedSettings] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [filterType, setFilterType] = useState<VisibilityFilter>('all')
  const [editForm, setEditForm] = useState<Partial<SystemSetting>>({})
  const [newSetting, setNewSetting] = useState<NewSetting>(initialNewSetting)
  const confirmDialog = useConfirmDialog()

  const managedSettingKeys = useMemo(
    () => new Set(SETTING_BLUEPRINTS.map((blueprint) => blueprint.key)),
    []
  )

  const { data: settings = [], isLoading: loading } = useQuery({
    queryKey: ['admin', 'settings'],
    queryFn: async () => {
      const data = await fetchSettings()
      return data
    },
  })

  const invalidateSettings = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['admin', 'settings'] })
  }, [queryClient])

  useEffect(() => {
    const nextDrafts: Record<string, GuidedSettingDraft> = {}
    for (const blueprint of SETTING_BLUEPRINTS) {
      const existing = settings.find((setting) => setting.key === blueprint.key)
      nextDrafts[blueprint.key] = buildGuidedDraft(blueprint, existing)
    }
    setGuidedDrafts(nextDrafts)
  }, [settings])

  useEffect(() => {
    if (!success) {
      return
    }

    const timer = setTimeout(() => setSuccess(''), 3000)
    return () => clearTimeout(timer)
  }, [success])

  useEffect(() => {
    if (showAddForm) {
      setShowAdvancedSettings(true)
    }
  }, [showAddForm])

  const runReloadingMutation = async (operation: () => Promise<boolean>, successMessage: string) => {
    try {
      setSaving(true)
      setError('')
      const result = await operation()
      if (!result) {
        throw new Error('Operation failed')
      }
      setSuccess(successMessage)
      invalidateSettings()
    } catch (requestError: any) {
      setError(requestError.message || 'Unable to save settings')
    } finally {
      setSaving(false)
    }
  }

  const handleGuidedDraftChange = (
    key: string,
    field: keyof GuidedSettingDraft,
    value: string | boolean
  ) => {
    setGuidedDrafts((current) => ({
      ...current,
      [key]: {
        ...(current[key] || { value: '', description: '', category: '', is_public: false }),
        [field]: value,
      },
    }))
  }

  const handleSaveGuidedSetting = async (blueprint: SettingBlueprint) => {
    const draft = guidedDrafts[blueprint.key] || buildGuidedDraft(blueprint)
    const validationErrors = validateSetting({ key: blueprint.key, value: draft.value }, blueprint.valueType)
    if (validationErrors.length > 0) {
      setError(validationErrors.join(', '))
      return
    }

    const existing = settings.find((setting) => setting.key === blueprint.key)
    try {
      setActiveMutationKey(blueprint.key)
      setError('')

      const payload = {
        key: blueprint.key,
        value: draft.value,
        description: draft.description || blueprint.description,
        category: draft.category || blueprint.category,
        is_public: draft.is_public,
      }

      const successResult = existing
        ? await updateSetting(existing.id, payload)
        : await createSetting(payload)

      if (!successResult) {
        throw new Error('Setting update failed')
      }

      setSuccess(`${blueprint.label} updated successfully`)
      invalidateSettings()
    } catch (requestError: any) {
      setError(requestError.message || `Failed to update ${blueprint.label}`)
    } finally {
      setActiveMutationKey(null)
    }
  }

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

    await runReloadingMutation(
      () =>
        updateSetting(id, {
          value: editForm.value,
          description: editForm.description,
          category: editForm.category,
          is_public: editForm.is_public,
        }),
      'Advanced setting updated successfully'
    )

    setEditingId(null)
    setEditForm({})
  }

  const handleDelete = async (id: string, key: string) => {
    const confirmed = await confirmDialog.confirm({
      title: 'Delete Advanced Setting',
      message: `The setting "${key}" will be permanently deleted.`,
      confirmText: 'Delete',
      variant: 'danger',
    })
    if (!confirmed) return

    await runReloadingMutation(
      () => deleteSetting(id),
      'Advanced setting deleted successfully'
    )
  }

  const handleAddNew = async () => {
    const validationErrors = validateSetting(newSetting, newSetting.valueType)
    if (validationErrors.length > 0) {
      setError(validationErrors.join(', '))
      return
    }

    await runReloadingMutation(
      () => createSetting(newSetting),
      'Advanced setting added successfully'
    )

    setShowAddForm(false)
    setNewSetting(initialNewSetting)
  }

  const exportSettings = () => {
    const exportData = {
      exported_at: new Date().toISOString(),
      settings: settings.map(({ id, created_at, updated_at, ...rest }) => rest),
    }
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `system-settings-${new Date().toISOString().split('T')[0]}.json`
    document.body.appendChild(anchor)
    anchor.click()
    document.body.removeChild(anchor)
    URL.revokeObjectURL(url)
    setSuccess('Settings exported successfully')
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

      setSuccess(result.message || `Successfully imported ${data.settings.length} settings`)
      invalidateSettings()
    } catch (requestError: any) {
      setError(`Import failed: ${requestError.message}`)
    } finally {
      setSaving(false)
      event.target.value = ''
    }
  }

  const handleResetToDefaults = async () => {
    const confirmed = await confirmDialog.confirm({
      title: 'Reset to Guided Defaults',
      message: 'All current settings will be replaced with the default operational configuration.',
      confirmText: 'Reset',
      variant: 'warning',
    })
    if (!confirmed) return

    try {
      setSaving(true)
      setError('')
      const result = await resetSettings()
      if (!result.success) {
        throw new Error(result.message || 'Reset failed')
      }
      setSuccess(result.message || 'Settings reset to defaults successfully')
      invalidateSettings()
    } catch (requestError: any) {
      setError(requestError.message || 'Reset failed')
    } finally {
      setSaving(false)
    }
  }

  const filteredGuidedSections = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase()

    return GUIDED_SECTIONS.map((section) => {
      const blueprints = section.settingKeys
        .map((key) => SETTING_BLUEPRINTS.find((blueprint) => blueprint.key === key))
        .filter((blueprint): blueprint is SettingBlueprint => Boolean(blueprint))
        .filter((blueprint) => {
          const draft = guidedDrafts[blueprint.key] || buildGuidedDraft(blueprint)
          const matchesSearch =
            !normalizedSearch ||
            blueprint.label.toLowerCase().includes(normalizedSearch) ||
            blueprint.key.toLowerCase().includes(normalizedSearch) ||
            blueprint.description.toLowerCase().includes(normalizedSearch)

          return matchesSearch && matchesVisibility(draft.is_public, filterType)
        })

      return { ...section, blueprints }
    }).filter((section) => section.blueprints.length > 0)
  }, [filterType, guidedDrafts, searchTerm])

  const filteredAdvancedSettings = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase()

    return settings.filter((setting) => {
      const matchesSearch =
        !normalizedSearch ||
        setting.key.toLowerCase().includes(normalizedSearch) ||
        (setting.description?.toLowerCase().includes(normalizedSearch) ?? false)

      return (
        !managedSettingKeys.has(setting.key) &&
        matchesSearch &&
        matchesVisibility(setting.is_public, filterType)
      )
    })
  }, [filterType, managedSettingKeys, searchTerm, settings])

  const configuredBlueprintCount = SETTING_BLUEPRINTS.filter((blueprint) =>
    settings.some((setting) => setting.key === blueprint.key)
  ).length
  const advancedSettingsCount = settings.filter((setting) => !managedSettingKeys.has(setting.key)).length
  const publicSettingsCount = settings.filter((setting) => setting.is_public).length
  const privateSettingsCount = settings.filter((setting) => !setting.is_public).length

  return (
    <>
      <Seo
        title="Operational Settings | MIHAS-KATC Admissions"
        description="Configure admissions portal settings, guided controls, and advanced system keys."
        path="/admin/settings"
        noindex
      />
    <PageShell
      title="Operational Settings"
      eyebrow="System Configuration"
      subtitle="Configure the admissions portal through guided controls first, then use advanced keys only when needed."
      maxWidth="7xl"
      tone="admin"
      metrics={[
        { label: 'Guided controls', value: `${configuredBlueprintCount}/${SETTING_BLUEPRINTS.length}`, helper: 'Operational settings already configured' },
        { label: 'Advanced keys', value: advancedSettingsCount, helper: 'Manual settings beyond the guided layer' },
        { label: 'Public settings', value: publicSettingsCount, helper: `${privateSettingsCount} remain internal only` },
        { label: 'State', value: loading ? 'Loading' : error ? 'Needs attention' : 'Ready', helper: error || success || 'Settings layer is healthy' },
      ]}
      actions={
        <div className="flex flex-wrap gap-2">
          <Link to="/admin">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
          </Link>
          <Button
            onClick={() => setShowAddForm((current) => !current)}
            variant="outline"
            size="sm"
          >
            <Plus className="h-4 w-4 mr-2" />
            {showAddForm ? 'Hide Advanced Key' : 'New Advanced Key'}
          </Button>
          <Button
            onClick={exportSettings}
            variant="outline"
            size="sm"
          >
            Export
          </Button>
          <label className="cursor-pointer">
            <span className="inline-flex h-9 items-center justify-center rounded-lg border border-input bg-background px-4 text-sm font-semibold text-foreground transition-colors hover:bg-muted">
              Import
            </span>
            <input type="file" accept=".json" onChange={handleImport} className="hidden" />
          </label>
        </div>
      }
    >
        <div className="space-y-6">
            {error ? (
              <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-destructive" role="alert" aria-live="assertive">
                {error}
              </div>
            ) : null}

            {success ? (
              <div className="rounded-xl border border-accent/30 bg-accent/10 p-4 text-accent" role="status" aria-live="polite">
                {success}
              </div>
            ) : null}

            {loading ? (
              <div className="flex justify-center py-16">
                <div className="text-center">
                  <DashboardSkeleton />
                </div>
              </div>
            ) : (
              <>
                <div className="grid gap-4 md:grid-cols-4">
                  <div className="rounded-lg border border-primary/20 bg-gradient-to-br from-primary/5 to-transparent p-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-primary">Guided Controls</p>
                    <p className="mt-2 text-3xl font-bold text-foreground">{configuredBlueprintCount}/{SETTING_BLUEPRINTS.length}</p>
                    <p className="mt-1 text-sm text-muted-foreground">Operational settings configured</p>
                  </div>
                  <div className="rounded-lg border border-primary/20 bg-gradient-to-br from-primary/5 to-transparent p-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-primary">Public Settings</p>
                    <p className="mt-2 text-3xl font-bold text-foreground">{publicSettingsCount}</p>
                    <p className="mt-1 text-sm text-muted-foreground">Visible to applicants and portal surfaces</p>
                  </div>
                  <div className="rounded-lg border border-primary/20 bg-gradient-to-br from-primary/5 to-transparent p-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-primary">Private Settings</p>
                    <p className="mt-2 text-3xl font-bold text-foreground">{privateSettingsCount}</p>
                    <p className="mt-1 text-sm text-muted-foreground">Operational settings only for staff workflows</p>
                  </div>
                  <div className="rounded-lg border border-primary/20 bg-gradient-to-br from-primary/5 to-transparent p-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-primary">Advanced Keys</p>
                    <p className="mt-2 text-3xl font-bold text-foreground">{advancedSettingsCount}</p>
                    <p className="mt-1 text-sm text-muted-foreground">Custom keys outside the guided configuration</p>
                  </div>
                </div>

                <div className="rounded-lg border border-border bg-muted/30 p-4">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div className="flex-1">
                      <Input
                        placeholder="Search guided controls or advanced keys..."
                        value={searchTerm}
                        onChange={(event) => setSearchTerm(event.target.value)}
                        aria-label="Search settings"
                      />
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant={filterType === 'all' ? 'primary' : 'outline'}
                        onClick={() => setFilterType('all')}
                        size="sm"
                      >
                        All
                      </Button>
                      <Button
                        variant={filterType === 'public' ? 'primary' : 'outline'}
                        onClick={() => setFilterType('public')}
                        size="sm"
                      >
                        <Globe className="h-4 w-4 mr-1" />
                        Public
                      </Button>
                      <Button
                        variant={filterType === 'private' ? 'primary' : 'outline'}
                        onClick={() => setFilterType('private')}
                        size="sm"
                      >
                        <Lock className="h-4 w-4 mr-1" />
                        Private
                      </Button>
                      <Button
                        variant="outline"
                        onClick={handleResetToDefaults}
                        size="sm"
                        className="border-destructive/30 text-destructive hover:bg-destructive/5"
                      >
                        Reset to Defaults
                      </Button>
                    </div>
                  </div>
                </div>

                <div className="rounded-lg border border-border bg-card p-5">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <h2 className="text-lg font-semibold text-foreground">Guided Configuration</h2>
                      <p className="text-sm text-muted-foreground">
                        Use these operational controls for the main admissions settings instead of creating raw keys manually.
                      </p>
                    </div>
                    <div className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
                      {configuredBlueprintCount} configured
                    </div>
                  </div>

                  <div className="mt-6 grid gap-6 xl:grid-cols-3">
                    {filteredGuidedSections.length > 0 ? (
                      filteredGuidedSections.map((section) => (
                        <div key={section.id} className="rounded-lg border border-border bg-muted/20 p-4">
                          <div className="mb-4 flex items-start gap-3">
                            <div className="rounded-xl bg-primary/10 p-3 text-primary">
                              {section.icon}
                            </div>
                            <div>
                              <h3 className="font-semibold text-foreground">{section.title}</h3>
                              <p className="text-sm text-muted-foreground">{section.description}</p>
                            </div>
                          </div>

                          <div className="space-y-4">
                            {section.blueprints.map((blueprint) => {
                              const existingSetting = settings.find((setting) => setting.key === blueprint.key)
                              const draft = guidedDrafts[blueprint.key] || buildGuidedDraft(blueprint, existingSetting)
                              const isSavingBlueprint = activeMutationKey === blueprint.key

                              return (
                                <div key={blueprint.key} className="rounded-xl border border-border bg-card p-4">
                                  <div className="mb-3 flex items-start justify-between gap-3">
                                    <div>
                                      <div className="flex flex-wrap items-center gap-2">
                                        <h4 className="font-semibold text-foreground">{blueprint.label}</h4>
                                        <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${
                                          existingSetting ? 'bg-accent/10 text-accent-foreground' : 'bg-amber-100 text-amber-800'
                                        }`}>
                                          {existingSetting ? 'Configured' : 'Missing'}
                                        </span>
                                      </div>
                                      <p className="mt-1 text-sm text-muted-foreground">{blueprint.description}</p>
                                      <p className="mt-1 text-xs font-mono text-muted-foreground">{blueprint.key}</p>
                                    </div>
                                    <span className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${getValueTypeClass(blueprint.valueType)}`}>
                                      {blueprint.valueType}
                                    </span>
                                  </div>

                                  <div className="space-y-3">
                                    {blueprint.valueType === 'boolean' ? (
                                      <CanonicalSelect
                                        label="Value"
                                        value={draft.value || 'false'}
                                        onChange={(value) => handleGuidedDraftChange(blueprint.key, 'value', value)}
                                        options={[
                                          { value: 'true', label: 'Enabled' },
                                          { value: 'false', label: 'Disabled' },
                                        ]}
                                      />
                                    ) : blueprint.key === 'multi_intake_policy' ? (
                                      <CanonicalSelect
                                        label="Value"
                                        value={draft.value || 'unrestricted'}
                                        onChange={(value) => handleGuidedDraftChange(blueprint.key, 'value', value)}
                                        options={[
                                          { value: 'unrestricted', label: 'Unrestricted' },
                                          { value: 'single_active', label: 'Single Active' },
                                          { value: 'waitlist_cascade', label: 'Waitlist Cascade' },
                                        ]}
                                      />
                                    ) : (
                                      <Input
                                        label="Value"
                                        value={draft.value}
                                        onChange={(event) => handleGuidedDraftChange(blueprint.key, 'value', event.target.value)}
                                        placeholder={blueprint.placeholder}
                                      />
                                    )}

                                    <div className="grid gap-3 md:grid-cols-2">
                                      <CanonicalSelect
                                        label="Visibility"
                                        value={draft.is_public ? 'public' : 'private'}
                                        onChange={(value) => handleGuidedDraftChange(blueprint.key, 'is_public', value === 'public')}
                                        options={[
                                          { value: 'public', label: 'Public' },
                                          { value: 'private', label: 'Private' },
                                        ]}
                                      />
                                      <Input
                                        label="Category"
                                        value={draft.category}
                                        onChange={(event) => handleGuidedDraftChange(blueprint.key, 'category', event.target.value)}
                                        placeholder={blueprint.category}
                                      />
                                    </div>

                                    <Input
                                      label="Description"
                                      value={draft.description}
                                      onChange={(event) => handleGuidedDraftChange(blueprint.key, 'description', event.target.value)}
                                      placeholder={blueprint.description}
                                    />

                                    <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-muted/20 px-3 py-2">
                                      <div className="text-sm text-muted-foreground">
                                        Live value: <span className="font-medium text-foreground">{formatValue(draft.value || blueprint.placeholder, blueprint.valueType)}</span>
                                      </div>
                                      <Button
                                        onClick={() => void handleSaveGuidedSetting(blueprint)}
                                        loading={isSavingBlueprint}
                                        disabled={saving && !isSavingBlueprint}
                                      >
                                        <Save className="h-4 w-4 mr-2" />
                                        Save
                                      </Button>
                                    </div>
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="xl:col-span-3 rounded-lg border border-dashed border-border bg-muted/20 px-6 py-12 text-center">
                        <Settings className="mx-auto h-10 w-10 text-muted-foreground" />
                        <h3 className="mt-4 text-lg font-semibold text-foreground">No guided controls match this filter</h3>
                        <p className="mt-2 text-sm text-muted-foreground">
                          Clear the search or visibility filter to resume configuring the main admissions controls.
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                <div className="rounded-lg border border-border bg-card">
                  <button
                    type="button"
                    onClick={() => setShowAdvancedSettings((current) => !current)}
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
                              onChange={(event) => setNewSetting((current) => ({ ...current, key: event.target.value }))}
                              placeholder="e.g. sms_provider_name"
                            />
                            <CanonicalSelect
                              value={newSetting.valueType}
                              onChange={(value) => setNewSetting((current) => ({ ...current, valueType: value as SettingValueType }))}
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
                              onChange={(event) => setNewSetting((current) => ({ ...current, value: event.target.value }))}
                              placeholder={newSetting.valueType === 'boolean' ? 'true or false' : 'Enter value'}
                            />
                            <CanonicalSelect
                              value={newSetting.is_public ? 'public' : 'private'}
                              onChange={(value) => setNewSetting((current) => ({ ...current, is_public: value === 'public' }))}
                              options={[
                                { value: 'public', label: 'Public' },
                                { value: 'private', label: 'Private' },
                              ]}
                              label="Visibility"
                            />
                            <Input
                              label="Description"
                              value={newSetting.description}
                              onChange={(event) => setNewSetting((current) => ({ ...current, description: event.target.value }))}
                              placeholder="What this key controls"
                            />
                            <Input
                              label="Category"
                              value={newSetting.category}
                              onChange={(event) => setNewSetting((current) => ({ ...current, category: event.target.value }))}
                              placeholder="e.g. messaging"
                            />
                          </div>

                          <div className="mt-4 flex gap-3">
                            <Button onClick={() => void handleAddNew()} loading={saving}>
                              <Save className="h-4 w-4 mr-2" />
                              Save Advanced Key
                            </Button>
                            <Button
                              variant="outline"
                              onClick={() => {
                                setShowAddForm(false)
                                setNewSetting(initialNewSetting)
                              }}
                            >
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
                              <div key={setting.id} className="rounded-xl border border-border bg-muted/20 p-4">
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
                                      onChange={(event) => setEditForm((current) => ({ ...current, value: event.target.value }))}
                                    />
                                    <CanonicalSelect
                                      label="Visibility"
                                      value={editForm.is_public ? 'public' : 'private'}
                                      onChange={(value) => setEditForm((current) => ({ ...current, is_public: value === 'public' }))}
                                      options={[
                                        { value: 'public', label: 'Public' },
                                        { value: 'private', label: 'Private' },
                                      ]}
                                    />
                                    <Input
                                      label="Description"
                                      value={editForm.description || ''}
                                      onChange={(event) => setEditForm((current) => ({ ...current, description: event.target.value }))}
                                      placeholder="Description"
                                    />
                                    <div className="flex gap-2">
                                      <Button size="sm" onClick={() => void handleEditSave(setting.id)} loading={saving} aria-label="Save setting">
                                        <Save className="h-4 w-4 mr-1" />
                                        Save
                                      </Button>
                                      <Button size="sm" variant="outline" onClick={handleEditCancel} aria-label="Cancel editing">
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
                                      <Button size="sm" variant="outline" onClick={() => handleEditStart(setting)} aria-label="Edit setting" className="min-h-[44px] min-w-[44px]">
                                        <Edit2 className="h-4 w-4 mr-1" />
                                        Edit
                                      </Button>
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => void handleDelete(setting.id, setting.key)}
                                        className="min-h-[44px] min-w-[44px] border-destructive/30 text-destructive hover:bg-destructive/5"
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
                                          onChange={(event) => setEditForm((current) => ({ ...current, value: event.target.value }))}
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
                                          onChange={(value) => setEditForm((current) => ({ ...current, is_public: value === 'public' }))}
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
                                          onChange={(event) => setEditForm((current) => ({ ...current, description: event.target.value }))}
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
                                            <Button size="sm" onClick={() => void handleEditSave(setting.id)} loading={saving} aria-label="Save setting">
                                              <Save className="h-4 w-4" />
                                            </Button>
                                            <Button size="sm" variant="outline" onClick={handleEditCancel} aria-label="Cancel editing">
                                              <X className="h-4 w-4" />
                                            </Button>
                                          </>
                                        ) : (
                                          <>
                                            <Button size="sm" variant="outline" onClick={() => handleEditStart(setting)} aria-label="Edit setting">
                                              <Edit2 className="h-4 w-4" />
                                            </Button>
                                            <Button
                                              size="sm"
                                              variant="outline"
                                              onClick={() => void handleDelete(setting.id, setting.key)}
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
              </>
            )}
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
    </PageShell>
    </>
  )
}
