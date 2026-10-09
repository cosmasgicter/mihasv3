/**
 * The compact command surface an admin record carries at every width
 * (admissions-v2 task 11.4, R16.1-R16.2, findings ADM-01 / ADM-03).
 *
 * This is task 11.3's shape, not a third one: **one primary control, one counted
 * accessible disclosure holding every remaining command, one live region outside
 * the dense rows, and a panel that is not a second card.** The comments below
 * that look defensive are load-bearing — 11.3 §3 records a defect that shipped
 * because a disclosure disagreed with itself about `display`, and jsdom could not
 * see it.
 *
 * The commands themselves are data, produced by `presentAdminRecordCommands`.
 * Nothing here decides whether a command is authorized: the backend is the
 * boundary and re-enforces every one. Hiding a control an actor cannot use is
 * convenience; the absence is never the security boundary.
 */
import { useId, useState, type ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'

import { Button } from '@/components/ui/Button'
import {
  adminRecordOverflowLabel,
  presentAdminRecordCommands,
  type AdminRecordCommand,
} from '@/lib/adminRecordCommands'

export interface AdminRecordActionsProps {
  /** Every authorized command on this record, in reading order. */
  commands: readonly AdminRecordCommand[]
  /**
   * Names the record the commands belong to, so the disclosure trigger and the
   * live region are distinguishable when a page holds many records.
   */
  recordLabel: string
  /**
   * Extra content that belongs **inside** the disclosure — used when a record's
   * remaining commands live in an existing component rather than in the
   * `commands` array (the applications roster's decision block). Anything passed
   * here must also be represented in `additionalOverflowCount` so the label
   * stays honest.
   */
  overflowContent?: ReactNode
  /**
   * How many commands `overflowContent` contributes. Counted, not estimated: the
   * unit suite renders the real component and compares.
   */
  additionalOverflowCount?: number
  /** The one polite sentence this record announces. Empty means silence. */
  announcement?: string
  /** Test hook prefix so a journey can address one record's surface. */
  testId?: string
  className?: string
}

const TONE_VARIANT = {
  default: 'default',
  outline: 'outline',
  ghost: 'ghost',
  destructive: 'outline',
  success: 'outline',
  warning: 'outline',
} as const

/** Destructive/success/warning stay outline-shaped; the word carries the state. */
const TONE_CLASS: Record<string, string> = {
  destructive: 'border-destructive/30 text-destructive hover:bg-destructive/5',
  success: 'border-success/30 text-success hover:bg-success/5',
  warning: 'border-warning/30 text-warning hover:bg-warning/5',
}

function CommandButton({
  command,
  emphasis,
}: {
  command: AdminRecordCommand
  emphasis: 'primary' | 'listed'
}) {
  const tone = command.tone ?? (emphasis === 'primary' ? 'default' : 'outline')
  return (
    <Button
      type="button"
      size="sm"
      variant={TONE_VARIANT[tone]}
      disabled={command.disabled}
      title={command.disabled ? command.disabledReason : undefined}
      onClick={command.onSelect}
      data-command-id={command.id}
      className={`min-h-touch ${emphasis === 'primary' ? 'w-full sm:w-auto' : 'w-full justify-start'} ${TONE_CLASS[tone] ?? ''}`}
    >
      {command.label}
    </Button>
  )
}

export function AdminRecordActions({
  commands,
  recordLabel,
  overflowContent,
  additionalOverflowCount = 0,
  announcement = '',
  testId = 'admin-record-actions',
  className,
}: AdminRecordActionsProps) {
  const [open, setOpen] = useState(false)
  const panelId = useId()
  const { primary, overflow, overflowCount } = presentAdminRecordCommands(commands)
  const totalOverflow = overflowCount + additionalOverflowCount

  if (!primary && totalOverflow === 0) {
    return null
  }

  return (
    <div
      className={`flex w-full min-w-0 flex-col gap-2 ${className ?? ''}`}
      data-testid={testId}
      data-overflow-count={totalOverflow}
    >
      {primary && <CommandButton command={primary} emphasis="primary" />}

      {totalOverflow > 0 && (
        <>
          {/*
            A real ARIA disclosure rather than a `<details>`: a 44 px trigger with
            `aria-expanded`/`aria-controls`, and a panel that stays mounted so a
            command in flight is not torn down by collapsing it.
          */}
          <button
            type="button"
            onClick={() => setOpen((current) => !current)}
            aria-expanded={open}
            aria-controls={panelId}
            aria-label={`${adminRecordOverflowLabel(totalOverflow)} for ${recordLabel}`}
            data-testid={`${testId}-trigger`}
            className="inline-flex min-h-touch w-full items-center justify-between gap-3 rounded-lg border border-border bg-card px-3 py-2 text-sm font-semibold text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:w-auto"
          >
            <span className="break-words">{adminRecordOverflowLabel(totalOverflow)}</span>
            <ChevronDown
              className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform motion-reduce:transition-none ${open ? 'rotate-180' : ''}`}
              aria-hidden="true"
            />
          </button>

          <div
            id={panelId}
            hidden={!open}
            data-testid={`${testId}-panel`}
            /*
              `hidden` **and** the display utility, because the attribute alone
              does not survive Tailwind. `[hidden] { display: none }` and
              `.flex { display: flex }` are both `0,1,0`, so source order decides
              and utilities are emitted after preflight: a permanently-`flex`
              panel carrying `hidden` stays on screen with `aria-expanded="false"`
              claiming otherwise, and the whole density fix is inert. That defect
              shipped once already (11.3 §3) and jsdom cannot see it, so the class
              and the attribute are kept in agreement here and a jsdom guard
              asserts they agree.

              The attribute is kept rather than replaced: it is what declaratively
              removes the subtree from the accessibility tree and the tab order.

              No border and no background: this surface already sits inside a
              record card, and "one container deep" means the panel may not become
              a second card inside it. The card treatment belongs to the trigger
              and to the content, never to the disclosure panel.
            */
            className={`w-full min-w-0 flex-col gap-2 pl-1 ${open ? 'flex' : 'hidden'}`}
          >
            {overflow.map((command) => (
              <CommandButton key={command.id} command={command} emphasis="listed" />
            ))}
            {overflowContent}
          </div>
        </>
      )}

      {/*
        One polite region for the whole record, outside the command cluster
        rather than on the controls, so a page of records cannot accumulate one
        live region per control (R16.2, and 11.3's "live status feedback outside
        dense rows").
      */}
      <p
        className="sr-only"
        role="status"
        aria-live="polite"
        aria-atomic="true"
        data-testid={`${testId}-live`}
      >
        {announcement}
      </p>
    </div>
  )
}
