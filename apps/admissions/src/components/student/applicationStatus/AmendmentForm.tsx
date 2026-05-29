import React from 'react'
import { Send } from 'lucide-react'
import { Button } from '@/components/ui/Button'

const AMENDABLE_FIELDS = [
  { key: 'phone', label: 'Phone' },
  { key: 'email', label: 'Email' },
  { key: 'address_line_1', label: 'Address Line 1' },
  { key: 'address_line_2', label: 'Address Line 2' },
  { key: 'residence_town', label: 'Residence Town' },
  { key: 'next_of_kin_name', label: 'Next of Kin Name' },
  { key: 'next_of_kin_phone', label: 'Next of Kin Phone' },
] as const

const PHONE_AMENDMENT_FIELDS = new Set(['phone', 'next_of_kin_phone'])

interface AmendmentFormProps {
  amendField: string
  amendValue: string
  amendReason: string
  amendError: string
  amendSuccess: string
  isPending: boolean
  onFieldChange: (value: string) => void
  onValueChange: (value: string) => void
  onReasonChange: (value: string) => void
  onSubmit: (e: React.FormEvent) => void
}

export function AmendmentForm({
  amendField,
  amendValue,
  amendReason,
  amendError,
  amendSuccess,
  isPending,
  onFieldChange,
  onValueChange,
  onReasonChange,
  onSubmit,
}: AmendmentFormProps) {
  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div>
        <label htmlFor="amend-field" className="block text-sm font-medium text-foreground mb-1">Field to amend</label>
        <select
          id="amend-field"
          value={amendField}
          onChange={(e) => onFieldChange(e.target.value)}
          className="w-full rounded-md border border-input bg-card px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <option value="">Select a field</option>
          {AMENDABLE_FIELDS.map(f => (
            <option key={f.key} value={f.key}>{f.label}</option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="amend-value" className="block text-sm font-medium text-foreground mb-1">New value</label>
        <input
          id="amend-value"
          type={amendField === 'email' ? 'email' : 'text'}
          inputMode={PHONE_AMENDMENT_FIELDS.has(amendField) ? 'tel' : amendField === 'email' ? 'email' : 'text'}
          value={amendValue}
          onChange={(e) => onValueChange(e.target.value)}
          className="w-full rounded-md border border-input bg-card px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          placeholder="Enter the corrected value"
        />
      </div>
      <div>
        <label htmlFor="amend-reason" className="block text-sm font-medium text-foreground mb-1">Reason for change</label>
        <textarea
          id="amend-reason"
          value={amendReason}
          onChange={(e) => onReasonChange(e.target.value)}
          rows={2}
          className="w-full rounded-md border border-input bg-card px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          placeholder="Explain why this change is needed"
        />
      </div>
      {amendError && (
        <p className="text-sm text-destructive" role="alert" aria-live="assertive">{amendError}</p>
      )}
      {amendSuccess && (
        <p className="text-sm text-success" role="status" aria-live="polite">{amendSuccess}</p>
      )}
      <Button
        type="submit"
        variant="outline"
        size="sm"
        loading={isPending}
        disabled={!amendField || !amendValue.trim() || !amendReason.trim()}
      >
        <Send className="mr-2 h-4 w-4" />
        Submit amendment request
      </Button>
    </form>
  )
}
