import type { SystemSetting } from '@/lib/api/adminApi'
import { toError } from '@/lib/toError'

export type SettingValueType = 'string' | 'integer' | 'decimal' | 'boolean'
export type VisibilityFilter = 'all' | 'public' | 'private'

export interface NewSetting {
  key: string
  value: string
  valueType: SettingValueType
  description: string
  category: string
  is_public: boolean
}

export interface GuidedSettingDraft {
  value: string
  description: string
  category: string
  is_public: boolean
}

export interface SettingBlueprint {
  key: string
  label: string
  description: string
  category: string
  valueType: SettingValueType
  placeholder: string
  is_public: boolean
}

export interface GuidedSectionDef {
  id: string
  title: string
  description: string
  icon: React.ReactNode
  settingKeys: string[]
}

export const initialNewSetting: NewSetting = {
  key: '',
  value: '',
  valueType: 'string',
  description: '',
  category: '',
  is_public: false,
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

export function inferValueType(value: string): SettingValueType {
  const trimmed = value.trim().toLowerCase()
  if (trimmed === 'true' || trimmed === 'false') return 'boolean'
  if (/^-?\d+$/.test(trimmed)) return 'integer'
  if (/^-?\d*\.?\d+$/.test(trimmed)) return 'decimal'
  return 'string'
}

export function getValueTypeClass(type: SettingValueType) {
  if (type === 'boolean') return 'bg-info/10 text-info'
  if (type === 'integer') return 'bg-primary/10 text-primary-foreground'
  if (type === 'decimal') return 'bg-accent/10 text-accent-foreground'
  return 'bg-accent text-foreground'
}

export function formatValue(value: string, type: SettingValueType) {
  if (type === 'boolean') return value === 'true' ? 'Enabled' : 'Disabled'
  if (type === 'decimal') return Number.parseFloat(value || '0').toFixed(2)
  if (type === 'integer') return Number.parseInt(value || '0', 10).toLocaleString()
  return value
}

export function matchesVisibility(isPublic: boolean, filterType: VisibilityFilter) {
  if (filterType === 'all') return true
  if (filterType === 'public') return isPublic
  return !isPublic
}

export function getErrorMessage(error: unknown, fallback: string) {
  return toError(error).message || fallback
}

export function buildGuidedDraft(blueprint: SettingBlueprint, setting?: SystemSetting): GuidedSettingDraft {
  return {
    value: setting?.value || '',
    description: setting?.description || blueprint.description,
    category: setting?.category || blueprint.category,
    is_public: setting?.is_public ?? blueprint.is_public,
  }
}
