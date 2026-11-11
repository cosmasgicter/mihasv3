/**
 * Conditions for a conditional offer (SJR R7-c, clause 2.38).
 *
 * "Conditional" used to send the status change at once with no conditions, which
 * recorded an offer the student had nothing to meet. This dialog collects 1-10
 * conditions, each with a description (1-500 characters after trimming) and a
 * deadline that is today or later in the admin's local date. Confirm stays
 * disabled until every row is valid. The backend re-validates all of it.
 */
import { useId, useMemo, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/Dialog'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  MAX_CONDITION_DESCRIPTION_LENGTH,
  MAX_OFFER_CONDITIONS,
  type OfferConditionInput,
} from '@/types/statusCommand'

interface ConditionsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: (conditions: OfferConditionInput[]) => void | Promise<void>
  submitting?: boolean
}

interface Row {
  key: number
  description: string
  deadline: string
}

/** Today's date in the admin's local calendar, as YYYY-MM-DD. */
export function localDateString(now: Date = new Date()): string {
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${month}-${day}`
}

export function conditionRowError(row: { description: string; deadline: string }, today: string): string | null {
  const description = row.description.trim()
  if (!description) return 'Describe what the applicant must do.'
  if (description.length > MAX_CONDITION_DESCRIPTION_LENGTH) {
    return `Keep the description under ${MAX_CONDITION_DESCRIPTION_LENGTH} characters.`
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(row.deadline)) return 'Choose a deadline.'
  if (row.deadline < today) return 'The deadline cannot be in the past.'
  return null
}

export function ConditionsDialog({ open, onOpenChange, onConfirm, submitting = false }: ConditionsDialogProps) {
  const idBase = useId()
  const [rows, setRows] = useState<Row[]>([{ key: 0, description: '', deadline: '' }])
  const [nextKey, setNextKey] = useState(1)
  const [touched, setTouched] = useState(false)
  const today = localDateString()

  const errors = useMemo(() => rows.map((row) => conditionRowError(row, today)), [rows, today])
  const valid = rows.length >= 1 && errors.every((error) => error === null)

  const reset = () => {
    setRows([{ key: 0, description: '', deadline: '' }])
    setNextKey(1)
    setTouched(false)
  }

  const handleOpenChange = (next: boolean) => {
    if (!next) reset()
    onOpenChange(next)
  }

  const update = (key: number, patch: Partial<Row>) =>
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)))

  const submit = () => {
    setTouched(true)
    if (!valid || submitting) return
    void onConfirm(rows.map((row) => ({ description: row.description.trim(), deadline: row.deadline })))
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>Conditions for this offer</DialogTitle>
          <DialogDescription>
            The applicant must meet every condition by its deadline. Add at least one.
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-[60vh] space-y-5 overflow-y-auto pr-1">
          {rows.map((row, index) => {
            const error = touched || row.description || row.deadline ? errors[index] : null
            return (
              <fieldset key={row.key} className="space-y-3 border-t border-border pt-4 first:border-t-0 first:pt-0">
                <legend className="text-sm font-semibold text-foreground">Condition {index + 1}</legend>
                <Textarea
                  id={`${idBase}-desc-${row.key}`}
                  label="What must the applicant do?"
                  value={row.description}
                  maxLength={MAX_CONDITION_DESCRIPTION_LENGTH + 50}
                  onChange={(event) => update(row.key, { description: event.target.value })}
                />
                <Input
                  id={`${idBase}-date-${row.key}`}
                  type="date"
                  label="Deadline"
                  min={today}
                  value={row.deadline}
                  onChange={(event) => update(row.key, { deadline: event.target.value })}
                />
                {error ? (
                  <p role="alert" className="text-sm font-medium text-destructive">
                    {error}
                  </p>
                ) : null}
                {rows.length > 1 ? (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setRows((current) => current.filter((item) => item.key !== row.key))}
                    disabled={submitting}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                    Remove condition {index + 1}
                  </Button>
                ) : null}
              </fieldset>
            )
          })}
        </div>
        {rows.length < MAX_OFFER_CONDITIONS ? (
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setRows((current) => [...current, { key: nextKey, description: '', deadline: '' }])
              setNextKey((value) => value + 1)
            }}
            disabled={submitting}
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            Add another condition
          </Button>
        ) : (
          <p className="text-sm text-muted-foreground">An offer can carry up to {MAX_OFFER_CONDITIONS} conditions.</p>
        )}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => handleOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button type="button" onClick={submit} disabled={!valid || submitting}>
            {submitting ? 'Saving…' : 'Record conditional offer'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
