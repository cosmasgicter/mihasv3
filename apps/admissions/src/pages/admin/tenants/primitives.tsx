import { type KeyboardEvent, useState } from 'react'
import { Plus, X, type LucideIcon } from 'lucide-react'

import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/input'
import { StatusBadge } from '@/components/ui'

/**
 * Shared, presentation-only building blocks for the tenant onboarding IA.
 *
 * These deliberately use only canonical primitives (`Button`, `Input`,
 * `StatusBadge`) and Lucide icons so the whole tenant surface stays inside the
 * design-system guardrails (no nested cards, no colour-only status, ≥44px
 * targets via `Button`/`Input`).
 */

export interface ResourceListItem {
  id: string
  title: string
  meta: string
  active?: boolean
  previewUrl?: string | null
  previewAlt?: string
}

export function ResourceList({
  items,
  empty,
  onDeactivate,
  deactivatingId,
  limit = 6,
}: {
  items: ResourceListItem[]
  empty: string
  onDeactivate?: (id: string) => void
  deactivatingId?: string | null
  limit?: number
}) {
  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">{empty}</p>
  }

  return (
    <div className="space-y-2">
      {items.slice(0, limit).map(item => (
        <div key={item.id} className="rounded-lg border border-border bg-background p-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-start gap-3">
              {item.previewUrl && (
                <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-muted">
                  <img
                    src={item.previewUrl}
                    alt={item.previewAlt || item.title}
                    width={48}
                    height={48}
                    className="max-h-full max-w-full object-contain"
                    loading="lazy"
                    decoding="async"
                  />
                </div>
              )}
              <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="break-words text-sm font-medium text-foreground">{item.title}</p>
                {item.active === false && (
                  <StatusBadge tone="muted" label="Inactive" />
                )}
              </div>
              <p className="mt-1 break-words text-xs text-muted-foreground">{item.meta}</p>
              </div>
            </div>
            {onDeactivate && item.active !== false && (
              <Button
                type="button"
                size="xs"
                variant="outline"
                loading={deactivatingId === item.id}
                onClick={() => onDeactivate(item.id)}
              >
                Deactivate
              </Button>
            )}
          </div>
        </div>
      ))}
      {items.length > limit && (
        <p className="text-xs text-muted-foreground">{items.length - limit} more configured</p>
      )}
    </div>
  )
}

export function ChecklistItem({
  icon: Icon,
  label,
  count,
}: {
  icon: LucideIcon
  label: string
  count: number
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-background p-3">
      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted text-foreground">
        <Icon className="h-4 w-4" aria-hidden="true" />
      </div>
      <div>
        <p className="text-sm font-medium text-foreground">{label}</p>
        <p className="text-xs text-muted-foreground">{count > 0 ? `${count} configured` : 'Not configured'}</p>
      </div>
    </div>
  )
}

/**
 * TokenChips — structured list builder for country codes / nationalities.
 *
 * Replaces raw JSON entry (R11.7): operators type a value and press Enter or
 * the add button; values render as removable chips. Normalises to trimmed,
 * de-duplicated entries and never stores empty strings.
 */
export function TokenChips({
  label,
  values,
  onChange,
  placeholder,
  tone = 'neutral',
  disabled = false,
}: {
  label: string
  values: string[]
  onChange: (next: string[]) => void
  placeholder?: string
  tone?: 'neutral' | 'success' | 'destructive'
  disabled?: boolean
}) {
  const [draft, setDraft] = useState('')

  const commit = () => {
    const value = draft.trim()
    if (!value) return
    const exists = values.some(item => item.toLowerCase() === value.toLowerCase())
    if (!exists) {
      onChange([...values, value])
    }
    setDraft('')
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault()
      commit()
    }
  }

  const remove = (value: string) => {
    onChange(values.filter(item => item !== value))
  }

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-foreground">{label}</p>
      <div className="flex gap-2">
        <Input
          value={draft}
          onChange={event => setDraft(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          aria-label={label}
          disabled={disabled}
        />
        <Button type="button" variant="outline" size="sm" onClick={commit} disabled={disabled || !draft.trim()}>
          <Plus className="h-4 w-4" aria-hidden="true" /> Add
        </Button>
      </div>
      {values.length > 0 ? (
        <ul className="flex flex-wrap gap-2" aria-label={`${label} values`}>
          {values.map(value => (
            <li key={value}>
              <span className={chipClass(tone)}>
                <span className="min-w-0 truncate">{value}</span>
                <button
                  type="button"
                  onClick={() => remove(value)}
                  className="flex min-h-touch min-w-touch items-center justify-center rounded-full p-0.5 text-current hover:bg-foreground/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label={`Remove ${value}`}
                  disabled={disabled}
                >
                  <X className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-muted-foreground">No entries — applies to all.</p>
      )}
    </div>
  )
}

function chipClass(tone: 'neutral' | 'success' | 'destructive') {
  const base = 'inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium'
  if (tone === 'success') return `${base} border-success/25 bg-success/10 text-success`
  if (tone === 'destructive') return `${base} border-destructive/25 bg-destructive/10 text-destructive`
  return `${base} border-border/60 bg-muted text-foreground`
}

export const TENANT_SELECT_CLASS =
  'min-h-touch h-11 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2'
