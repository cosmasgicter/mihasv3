import React from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/Button'
import { CanonicalSelect } from '@/components/ui/CanonicalSelect'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { Save, Settings } from 'lucide-react'
import type { SystemSetting } from '@/lib/api/adminApi'
import type { GuidedSettingDraft, SettingBlueprint } from '@/pages/admin/lib/settingsValidation'
import { formatValue, getValueTypeClass } from '@/pages/admin/lib/settingsValidation'

interface FilteredSection {
  id: string
  title: string
  description: string
  icon: React.ReactNode
  settingKeys: string[]
  blueprints: SettingBlueprint[]
}

interface GuidedSectionProps {
  sections: FilteredSection[]
  settings: SystemSetting[]
  guidedDrafts: Record<string, GuidedSettingDraft>
  activeMutationKey: string | null
  saving: boolean
  onDraftChange: (key: string, field: keyof GuidedSettingDraft, value: string | boolean) => void
  onSave: (blueprint: SettingBlueprint) => void
}

export function GuidedSection({
  sections,
  settings,
  guidedDrafts,
  activeMutationKey,
  saving,
  onDraftChange,
  onSave,
}: GuidedSectionProps) {
  if (sections.length === 0) {
    return (
      <div className="xl:col-span-3 rounded-lg border border-dashed border-border bg-muted/20 px-6 py-12 text-center">
        <Settings className="mx-auto h-10 w-10 text-muted-foreground" />
        <h3 className="mt-4 text-lg font-semibold text-foreground">No guided controls match this filter</h3>
        <p className="mt-2 text-sm text-muted-foreground">
          Clear the search or visibility filter to resume configuring the main admissions controls.
        </p>
      </div>
    )
  }

  return (
    <>
      {sections.map((section) => (
        <div key={section.id} className="rounded-lg border border-border bg-muted/20 p-4">
          <div className="mb-4 flex items-start gap-3">
            <div className="rounded-lg bg-primary/10 p-3 text-primary">
              {section.icon}
            </div>
            <div>
              <h3 className="font-semibold text-foreground">{section.title}</h3>
              <p className="text-sm text-muted-foreground">{section.description}</p>
            </div>
          </div>

          <div className="space-y-4">
            {section.blueprints.map((blueprint) => {
              const existingSetting = settings.find((s) => s.key === blueprint.key)
              const draft = guidedDrafts[blueprint.key] || { value: '', description: blueprint.description, category: blueprint.category, is_public: blueprint.is_public }
              const isSavingBlueprint = activeMutationKey === blueprint.key

              return (
                <div key={blueprint.key} className="rounded-lg border border-border bg-card p-4">
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h4 className="font-semibold text-foreground">{blueprint.label}</h4>
                        <StatusBadge
                          tone={existingSetting ? 'success' : 'warning'}
                          label={existingSetting ? 'Configured' : 'Missing'}
                        />
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
                        onChange={(value) => onDraftChange(blueprint.key, 'value', value)}
                        options={[
                          { value: 'true', label: 'Enabled' },
                          { value: 'false', label: 'Disabled' },
                        ]}
                      />
                    ) : blueprint.key === 'multi_intake_policy' ? (
                      <CanonicalSelect
                        label="Value"
                        value={draft.value || 'unrestricted'}
                        onChange={(value) => onDraftChange(blueprint.key, 'value', value)}
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
                        onChange={(event) => onDraftChange(blueprint.key, 'value', event.target.value)}
                        placeholder={blueprint.placeholder}
                      />
                    )}

                    <div className="grid gap-3 md:grid-cols-2">
                      <CanonicalSelect
                        label="Visibility"
                        value={draft.is_public ? 'public' : 'private'}
                        onChange={(value) => onDraftChange(blueprint.key, 'is_public', value === 'public')}
                        options={[
                          { value: 'public', label: 'Public' },
                          { value: 'private', label: 'Private' },
                        ]}
                      />
                      <Input
                        label="Category"
                        value={draft.category}
                        onChange={(event) => onDraftChange(blueprint.key, 'category', event.target.value)}
                        placeholder={blueprint.category}
                      />
                    </div>

                    <Input
                      label="Description"
                      value={draft.description}
                      onChange={(event) => onDraftChange(blueprint.key, 'description', event.target.value)}
                      placeholder={blueprint.description}
                    />

                    <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-muted/20 px-3 py-2">
                      <div className="text-sm text-muted-foreground">
                        Live value: <span className="font-medium text-foreground">{formatValue(draft.value || blueprint.placeholder, blueprint.valueType)}</span>
                      </div>
                      <Button
                        onClick={() => onSave(blueprint)}
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
      ))}
    </>
  )
}
