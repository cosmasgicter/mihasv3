import React from 'react'
import { Send } from 'lucide-react'
import { Button } from '@/components/ui/Button'

const AMENDABLE_FIELDS = [
  { key: 'phone', label: 'Phone' },
  { key: 'email', label: 'Email' },
  { key: 'address_line_1', label: 'Address Line 1' },
  { key: 'address_line_2', label: 'Address Line 2' },
  { key: 'residence_town', label: 'Residence town' },
  { key: 'next_of_kin_name', label: 'Next of Kin Name' },
  { key: 'next_of_kin_phone', label: 'Next of Kin Phone' },
] as const

const PHONE_AMENDMENT_FIELDS = new Set(['phone', 'next_of_kin_phone'])

/**
 * The 44 px floor, at **every** width (GATE-13.3-15, 13.6 §8.1 item L6; R16.2).
 *
 * Task 13.3 measured these three controls at 414x37 / 414x38 at 768 px, 579x37/38
 * at 1280 px and 686x37/38 at 1440 px — the width tracked the container and the
 * height never changed — and found nothing wrong below 640 px. The reason is
 * exact, and it is the interesting half of the finding: `src/index.css` carries the
 * platform's 44 px form-control floor
 *
 *     @media (max-width: 639px) { input…, textarea, select { min-height: 44px } }
 *
 * so a global rule rescued these raw `<select>` / `<input>` / `<textarea>`
 * elements on phones and **nothing** did at 768 px and above. A control that is
 * compliant only because of a mobile media query is not compliant; R16.2 admits
 * no width exemption.
 *
 * `min-h-touch` states the floor on the control itself, so it holds at every
 * width and no longer depends on a rule scoped to another one. The media query in
 * `index.css` is deliberately left alone — it is a safety net for elements nobody
 * has reached yet, and removing it would be a change with a blast radius far
 * wider than this form.
 */
const CONTROL_CLASS =
  'w-full min-h-touch rounded-md border border-input bg-card px-3 py-2 text-base sm:text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

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
        <label htmlFor="amend-field" className="block text-base sm:text-sm font-medium text-foreground mb-1">Field to amend</label>
        <select
          id="amend-field"
          value={amendField}
          onChange={(e) => onFieldChange(e.target.value)}
          className={CONTROL_CLASS}
        >
          <option value="">Select a field</option>
          {AMENDABLE_FIELDS.map(f => (
            <option key={f.key} value={f.key}>{f.label}</option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="amend-value" className="block text-base sm:text-sm font-medium text-foreground mb-1">New value</label>
        <input
          id="amend-value"
          type={amendField === 'email' ? 'email' : 'text'}
          inputMode={PHONE_AMENDMENT_FIELDS.has(amendField) ? 'tel' : amendField === 'email' ? 'email' : 'text'}
          value={amendValue}
          onChange={(e) => onValueChange(e.target.value)}
          className={CONTROL_CLASS}
          placeholder="Enter the corrected value"
        />
      </div>
      <div>
        <label htmlFor="amend-reason" className="block text-base sm:text-sm font-medium text-foreground mb-1">Reason for change</label>
        <textarea
          id="amend-reason"
          value={amendReason}
          onChange={(e) => onReasonChange(e.target.value)}
          rows={2}
          className={CONTROL_CLASS}
          placeholder="Explain why this change is needed"
        />
      </div>
      {amendError && (
        <p className="text-base sm:text-sm text-destructive" role="alert" aria-live="assertive">{amendError}</p>
      )}
      {amendSuccess && (
        <p className="text-base sm:text-sm text-success" role="status" aria-live="polite">{amendSuccess}</p>
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
