import React, { useCallback, useEffect, useMemo, useReducer } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/Button'
import { DashboardSkeleton } from '@/components/ui'
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
import { ArrowLeft, Globe, Lock, Phone, Plus, Settings, Users } from 'lucide-react'
import { PageShell } from '@/components/ui/PageShell'
import { Seo } from '@/components/seo/Seo'
import { GuidedSection } from '@/components/admin/settings/GuidedSection'
import { AdvancedKeysSection } from '@/components/admin/settings/AdvancedKeysSection'
import { settingsReducer, initialSettingsState } from './lib/settingsReducer'
import {
  validateSetting as _validateSetting,
  inferValueType,
  matchesVisibility,
  getErrorMessage,
  buildGuidedDraft,
  initialNewSetting,
  type SettingBlueprint,
  type GuidedSectionDef,
  type GuidedSettingDraft,
} from './lib/settingsValidation'

// Re-export for backward compatibility (tests import from this module)
export const validateSetting = _validateSetting

const SETTING_BLUEPRINTS: SettingBlueprint[] = [
  { key: 'site_name', label: 'Portal name', description: 'Primary platform title shown across public and authenticated screens.', category: 'general', valueType: 'string', placeholder: 'MIHAS Application System', is_public: true },
  { key: 'enable_online_applications', label: 'Online applications', description: 'Controls whether students can start or continue applications online.', category: 'general', valueType: 'boolean', placeholder: 'true', is_public: true },
  { key: 'contact_email', label: 'Admissions email', description: 'Primary email used for admissions contact, slip delivery, and public support messaging.', category: 'contact', valueType: 'string', placeholder: 'admissions@mihas.edu.zm', is_public: true },
  { key: 'contact_phone', label: 'Admissions phone', description: 'Primary phone number shown to applicants and used by support surfaces.', category: 'contact', valueType: 'string', placeholder: '+260-000-000-000', is_public: true },
  { key: 'application_fee', label: 'Application fee', description: 'Default admissions application fee used in payment guidance and review.', category: 'finance', valueType: 'decimal', placeholder: '153.00', is_public: true },
  { key: 'max_applications_per_user', label: 'Application limit per student', description: 'Maximum number of application records a single student can submit.', category: 'limits', valueType: 'integer', placeholder: '3', is_public: false },
  { key: 'multi_intake_policy', label: 'Multi-intake policy', description: 'Controls how students may apply across multiple intakes.', category: 'limits', valueType: 'string', placeholder: 'unrestricted', is_public: false },
]

const GUIDED_SECTIONS: GuidedSectionDef[] = [
  { id: 'experience', title: 'Portal Experience', description: 'Public-facing branding and the main online admissions switch.', icon: <Settings className="h-5 w-5" />, settingKeys: ['site_name', 'enable_online_applications'] },
  { id: 'contact', title: 'Admissions Contact', description: 'Official contact details used across public pages and notification surfaces.', icon: <Phone className="h-5 w-5" />, settingKeys: ['contact_email', 'contact_phone'] },
  { id: 'operations', title: 'Admissions Operations', description: 'Fee and intake guardrails that affect application processing.', icon: <Users className="h-5 w-5" />, settingKeys: ['application_fee', 'max_applications_per_user', 'multi_intake_policy'] },
]

export default function AdminSettings() {
  const queryClient = useQueryClient()
  const [state, dispatch] = useReducer(settingsReducer, initialSettingsState)
  const confirmDialog = useConfirmDialog()

  const managedSettingKeys = useMemo(
    () => new Set(SETTING_BLUEPRINTS.map((b) => b.key)),
    []
  )

  const { data: settings = [], isLoading: loading } = useQuery({
    queryKey: ['admin', 'settings'],
    queryFn: fetchSettings,
  })

  const invalidateSettings = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['admin', 'settings'] })
  }, [queryClient])

  useEffect(() => {
    const nextDrafts: Record<string, GuidedSettingDraft> = {}
    for (const blueprint of SETTING_BLUEPRINTS) {
      const existing = settings.find((s) => s.key === blueprint.key)
      nextDrafts[blueprint.key] = buildGuidedDraft(blueprint, existing)
    }
    dispatch({ type: 'SET_GUIDED_DRAFTS', payload: nextDrafts })
  }, [settings])

  useEffect(() => {
    if (!state.success) return
    const timer = setTimeout(() => dispatch({ type: 'SET_SUCCESS', payload: '' }), 3000)
    return () => clearTimeout(timer)
  }, [state.success])

  const runReloadingMutation = async (operation: () => Promise<boolean>, successMessage: string) => {
    try {
      dispatch({ type: 'SET_SAVING', payload: true })
      dispatch({ type: 'SET_ERROR', payload: '' })
      const result = await operation()
      if (!result) throw new Error('Operation failed')
      dispatch({ type: 'SET_SUCCESS', payload: successMessage })
      invalidateSettings()
    } catch (err: unknown) {
      dispatch({ type: 'SET_ERROR', payload: getErrorMessage(err, 'Unable to save settings') })
    } finally {
      dispatch({ type: 'SET_SAVING', payload: false })
    }
  }

  const handleSaveGuidedSetting = async (blueprint: SettingBlueprint) => {
    const draft = state.guidedDrafts[blueprint.key] || buildGuidedDraft(blueprint)
    const errors = validateSetting({ key: blueprint.key, value: draft.value }, blueprint.valueType)
    if (errors.length > 0) { dispatch({ type: 'SET_ERROR', payload: errors.join(', ') }); return }

    const existing = settings.find((s) => s.key === blueprint.key)
    try {
      dispatch({ type: 'SET_ACTIVE_MUTATION_KEY', payload: blueprint.key })
      dispatch({ type: 'SET_ERROR', payload: '' })
      const payload = { key: blueprint.key, value: draft.value, description: draft.description || blueprint.description, category: draft.category || blueprint.category, is_public: draft.is_public }
      const ok = existing ? await updateSetting(existing.id, payload) : await createSetting(payload)
      if (!ok) throw new Error('Setting update failed')
      dispatch({ type: 'SET_SUCCESS', payload: `${blueprint.label} updated successfully` })
      invalidateSettings()
    } catch (err: unknown) {
      dispatch({ type: 'SET_ERROR', payload: getErrorMessage(err, `Failed to update ${blueprint.label}`) })
    } finally {
      dispatch({ type: 'SET_ACTIVE_MUTATION_KEY', payload: null })
    }
  }

  const handleEditSave = async (id: string) => {
    const errors = validateSetting(state.editForm, inferValueType(state.editForm.value || ''))
    if (errors.length > 0) { dispatch({ type: 'SET_ERROR', payload: errors.join(', ') }); return }
    await runReloadingMutation(
      () => updateSetting(id, { value: state.editForm.value, description: state.editForm.description, category: state.editForm.category, is_public: state.editForm.is_public }),
      'Advanced setting updated successfully'
    )
    dispatch({ type: 'CANCEL_EDIT' })
  }

  const handleDelete = async (id: string, key: string) => {
    const confirmed = await confirmDialog.confirm({ title: 'Delete Advanced Setting', message: `The setting "${key}" will be permanently deleted.`, confirmText: 'Delete', variant: 'danger' })
    if (!confirmed) return
    await runReloadingMutation(() => deleteSetting(id), 'Advanced setting deleted successfully')
  }

  const handleAddNew = async () => {
    const errors = validateSetting(state.newSetting, state.newSetting.valueType)
    if (errors.length > 0) { dispatch({ type: 'SET_ERROR', payload: errors.join(', ') }); return }
    await runReloadingMutation(() => createSetting(state.newSetting), 'Advanced setting added successfully')
    dispatch({ type: 'RESET_ADD_FORM' })
  }

  const exportSettings = () => {
    const exportData = { exported_at: new Date().toISOString(), settings: settings.map(({ id, created_at, updated_at, ...rest }) => rest) }
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `system-settings-${new Date().toISOString().split('T')[0]}.json`
    document.body.appendChild(anchor)
    anchor.click()
    document.body.removeChild(anchor)
    URL.revokeObjectURL(url)
    dispatch({ type: 'SET_SUCCESS', payload: 'Settings exported successfully' })
  }

  const handleImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    try {
      const text = await file.text()
      const data = JSON.parse(text)
      if (!data.settings || !Array.isArray(data.settings)) throw new Error('Invalid file format')
      dispatch({ type: 'SET_SAVING', payload: true })
      dispatch({ type: 'SET_ERROR', payload: '' })
      const result = await importSettings(data.settings)
      if (!result.success) throw new Error(result.message || 'Import failed')
      dispatch({ type: 'SET_SUCCESS', payload: result.message || `Successfully imported ${data.settings.length} settings` })
      invalidateSettings()
    } catch (err: unknown) {
      dispatch({ type: 'SET_ERROR', payload: `Import failed: ${getErrorMessage(err, 'Unknown error')}` })
    } finally {
      dispatch({ type: 'SET_SAVING', payload: false })
      event.target.value = ''
    }
  }

  const handleResetToDefaults = async () => {
    const confirmed = await confirmDialog.confirm({ title: 'Reset to Guided Defaults', message: 'All current settings will be replaced with the default operational configuration.', confirmText: 'Reset', variant: 'warning' })
    if (!confirmed) return
    try {
      dispatch({ type: 'SET_SAVING', payload: true })
      dispatch({ type: 'SET_ERROR', payload: '' })
      const result = await resetSettings()
      if (!result.success) throw new Error(result.message || 'Reset failed')
      dispatch({ type: 'SET_SUCCESS', payload: result.message || 'Settings reset to defaults successfully' })
      invalidateSettings()
    } catch (err: unknown) {
      dispatch({ type: 'SET_ERROR', payload: getErrorMessage(err, 'Reset failed') })
    } finally {
      dispatch({ type: 'SET_SAVING', payload: false })
    }
  }

  const filteredGuidedSections = useMemo(() => {
    const search = state.searchTerm.trim().toLowerCase()
    return GUIDED_SECTIONS.map((section) => {
      const blueprints = section.settingKeys
        .map((key) => SETTING_BLUEPRINTS.find((b) => b.key === key))
        .filter((b): b is SettingBlueprint => Boolean(b))
        .filter((b) => {
          const draft = state.guidedDrafts[b.key] || buildGuidedDraft(b)
          const matchesSearch = !search || b.label.toLowerCase().includes(search) || b.key.toLowerCase().includes(search) || b.description.toLowerCase().includes(search)
          return matchesSearch && matchesVisibility(draft.is_public, state.filterType)
        })
      return { ...section, blueprints }
    }).filter((s) => s.blueprints.length > 0)
  }, [state.filterType, state.guidedDrafts, state.searchTerm])

  const filteredAdvancedSettings = useMemo(() => {
    const search = state.searchTerm.trim().toLowerCase()
    return settings.filter((s) => {
      const matchesSearch = !search || s.key.toLowerCase().includes(search) || (s.description?.toLowerCase().includes(search) ?? false)
      return !managedSettingKeys.has(s.key) && matchesSearch && matchesVisibility(s.is_public, state.filterType)
    })
  }, [state.filterType, managedSettingKeys, state.searchTerm, settings])

  const configuredBlueprintCount = SETTING_BLUEPRINTS.filter((b) => settings.some((s) => s.key === b.key)).length
  const advancedSettingsCount = settings.filter((s) => !managedSettingKeys.has(s.key)).length
  const publicSettingsCount = settings.filter((s) => s.is_public).length
  const privateSettingsCount = settings.filter((s) => !s.is_public).length

  return (
    <>
      <Seo title="Operational Settings | MIHAS-KATC Admissions" description="Configure admissions portal settings, guided controls, and advanced system keys." path="/admin/settings" noindex />
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
          { label: 'State', value: loading ? 'Loading' : state.error ? 'Needs attention' : 'Ready', helper: state.error || state.success || 'Settings layer is healthy' },
        ]}
        actions={
          <div className="flex flex-wrap gap-2">
            <Link to="/admin">
              <Button variant="ghost" size="sm"><ArrowLeft className="h-4 w-4 mr-2" />Back</Button>
            </Link>
            <Button onClick={() => dispatch({ type: 'TOGGLE_SHOW_ADD_FORM' })} variant="outline" size="sm">
              <Plus className="h-4 w-4 mr-2" />{state.showAddForm ? 'Hide Advanced Key' : 'New Advanced Key'}
            </Button>
            <Button onClick={exportSettings} variant="outline" size="sm">Export</Button>
            <label className="cursor-pointer">
              <span className="inline-flex h-9 items-center justify-center rounded-lg border border-input bg-background px-4 text-sm font-semibold text-foreground transition-colors hover:bg-muted">Import</span>
              <input type="file" accept=".json" onChange={handleImport} className="hidden" />
            </label>
          </div>
        }
      >
        <div className="space-y-6">
          {state.error ? (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-destructive" role="alert" aria-live="assertive">{state.error}</div>
          ) : null}
          {state.success ? (
            <div className="rounded-lg border border-accent/30 bg-accent/10 p-4 text-accent" role="status" aria-live="polite">{state.success}</div>
          ) : null}

          {loading ? (
            <div className="flex justify-center py-16"><div className="text-center"><DashboardSkeleton /></div></div>
          ) : (
            <>
              <div className="grid gap-4 md:grid-cols-4">
                <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
                  <p className="text-xs font-semibold uppercase tracking-wide text-primary">Guided Controls</p>
                  <p className="mt-2 text-3xl font-bold text-foreground">{configuredBlueprintCount}/{SETTING_BLUEPRINTS.length}</p>
                  <p className="mt-1 text-sm text-muted-foreground">Operational settings configured</p>
                </div>
                <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
                  <p className="text-xs font-semibold uppercase tracking-wide text-primary">Public Settings</p>
                  <p className="mt-2 text-3xl font-bold text-foreground">{publicSettingsCount}</p>
                  <p className="mt-1 text-sm text-muted-foreground">Visible to applicants and portal surfaces</p>
                </div>
                <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
                  <p className="text-xs font-semibold uppercase tracking-wide text-primary">Private Settings</p>
                  <p className="mt-2 text-3xl font-bold text-foreground">{privateSettingsCount}</p>
                  <p className="mt-1 text-sm text-muted-foreground">Operational settings only for staff workflows</p>
                </div>
                <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
                  <p className="text-xs font-semibold uppercase tracking-wide text-primary">Advanced Keys</p>
                  <p className="mt-2 text-3xl font-bold text-foreground">{advancedSettingsCount}</p>
                  <p className="mt-1 text-sm text-muted-foreground">Custom keys outside the guided configuration</p>
                </div>
              </div>

              <div className="rounded-lg border border-border bg-muted/30 p-4">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div className="flex-1">
                    <Input placeholder="Search guided controls or advanced keys..." value={state.searchTerm} onChange={(e) => dispatch({ type: 'SET_SEARCH_TERM', payload: e.target.value })} aria-label="Search settings" />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button variant={state.filterType === 'all' ? 'primary' : 'outline'} onClick={() => dispatch({ type: 'SET_FILTER_TYPE', payload: 'all' })} size="sm">All</Button>
                    <Button variant={state.filterType === 'public' ? 'primary' : 'outline'} onClick={() => dispatch({ type: 'SET_FILTER_TYPE', payload: 'public' })} size="sm"><Globe className="h-4 w-4 mr-1" />Public</Button>
                    <Button variant={state.filterType === 'private' ? 'primary' : 'outline'} onClick={() => dispatch({ type: 'SET_FILTER_TYPE', payload: 'private' })} size="sm"><Lock className="h-4 w-4 mr-1" />Private</Button>
                    <Button variant="outline" onClick={handleResetToDefaults} size="sm" className="border-destructive/30 text-destructive hover:bg-destructive/5">Reset to Defaults</Button>
                  </div>
                </div>
              </div>

              <div className="rounded-lg border border-border bg-card p-5">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h2 className="text-lg font-semibold text-foreground">Guided Configuration</h2>
                    <p className="text-sm text-muted-foreground">Use these operational controls for the main admissions settings instead of creating raw keys manually.</p>
                  </div>
                  <div className="rounded-md bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">{configuredBlueprintCount} configured</div>
                </div>
                <div className="mt-6 grid gap-6 xl:grid-cols-3">
                  <GuidedSection
                    sections={filteredGuidedSections}
                    settings={settings}
                    guidedDrafts={state.guidedDrafts}
                    activeMutationKey={state.activeMutationKey}
                    saving={state.saving}
                    onDraftChange={(key, field, value) => dispatch({ type: 'UPDATE_GUIDED_DRAFT', key, field, value })}
                    onSave={(blueprint) => void handleSaveGuidedSetting(blueprint)}
                  />
                </div>
              </div>

              <AdvancedKeysSection
                showAdvancedSettings={state.showAdvancedSettings}
                showAddForm={state.showAddForm}
                filteredAdvancedSettings={filteredAdvancedSettings}
                editingId={state.editingId}
                editForm={state.editForm}
                newSetting={state.newSetting}
                saving={state.saving}
                onToggleAdvanced={() => dispatch({ type: 'TOGGLE_SHOW_ADVANCED' })}
                onEditStart={(setting) => dispatch({ type: 'START_EDIT', setting })}
                onEditCancel={() => dispatch({ type: 'CANCEL_EDIT' })}
                onEditSave={(id) => void handleEditSave(id)}
                onDelete={(id, key) => void handleDelete(id, key)}
                onAddNew={() => void handleAddNew()}
                onCancelAdd={() => dispatch({ type: 'RESET_ADD_FORM' })}
                onEditFormChange={(field, value) => dispatch({ type: 'UPDATE_EDIT_FORM', field, value })}
                onNewSettingChange={(field, value) => dispatch({ type: 'UPDATE_NEW_SETTING', field, value })}
              />
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
