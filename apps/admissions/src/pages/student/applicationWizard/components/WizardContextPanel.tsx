/**
 * The wizard's context and checklist, on **every** viewport (task 11.2).
 *
 * Requirements: **R16.1** (designed at 320 px first; nothing essential depends on
 * a desktop layout), **R16.2** (keyboard support, names, 44 px targets),
 * **R16.4** (restrained hierarchy, no nested cards). Findings: **STU-03** — "the
 * wizard … mobile loses the desktop checklist/context".
 *
 * ── What was wrong ──────────────────────────────────────────────────────────
 *
 * The step checklist, the application preview and the step notes lived in
 * `<aside className="hidden lg:col-span-1 lg:block">`. On a phone — the way most
 * students apply — the entire "what does this step still need, and what have I
 * already told you" surface was simply absent from the DOM. Not collapsed, not
 * moved: not rendered.
 *
 * ── How it is reached now ───────────────────────────────────────────────────
 *
 * One instance, two placements, chosen by the parent. Below `lg` it is a real ARIA
 * disclosure — a 44 px `<button>` with `aria-expanded` / `aria-controls`, closed by
 * default so it does not push the form down, and openable by keyboard. At `lg` and
 * above the disclosure control is not rendered and the region is always open, which
 * is the sidebar the desktop had.
 *
 * `useResponsive` rather than a CSS-only trick, because "one DOM instance" is the
 * requirement: rendering the panel twice (`lg:hidden` + `hidden lg:block`) would
 * duplicate every heading and every `data-testid`, and a screen reader would meet
 * the checklist twice.
 *
 * `AnalyticsDashboard` is **not** carried across. It rendered two large numbers
 * ("Completion", "Last Save") and a "N completed / N in progress" tally, and to do
 * so it fetched up to 100 of the student's applications on the wizard — a page whose
 * job is one application. That is R16.5's redundant metrics with a network cost
 * attached (MAINT-02), so the component and its `progressSummary` helper are gone
 * rather than relocated.
 */
import { useState } from 'react'
import { ChevronDown, ClipboardList } from 'lucide-react'
import type { UseFormReturn } from 'react-hook-form'

import { useResponsive } from '@/hooks/useResponsive'
import { cn } from '@/lib/utils'

import { ApplicationPreview } from './ApplicationPreview'
import { StepChecklist } from './StepChecklist'
import { WIZARD_COPY, type WizardStepKey } from '../constants'
import type { WizardChecklistItem } from '../lib/wizardChecklist'
import type { WizardFormData } from '../types'

export interface WizardContextPanelProps {
  form: UseFormReturn<WizardFormData>
  stepKey: WizardStepKey
  checklistItems: WizardChecklistItem[]
  programName?: string
  intakeName?: string
}

export function WizardContextPanel({
  form,
  stepKey,
  checklistItems,
  programName,
  intakeName,
}: WizardContextPanelProps) {
  const { isMobile } = useResponsive()
  const [openOnMobile, setOpenOnMobile] = useState(false)
  const expanded = !isMobile || openOnMobile
  const completed = checklistItems.filter(item => item.completed).length
  const tips = WIZARD_COPY.quickTipsByStep[stepKey] ?? []

  return (
    <section data-testid="wizard-context-panel" aria-labelledby="wizard-context-heading">
      <h2 id="wizard-context-heading" className="sr-only">
        What this step needs
      </h2>

      {isMobile && (
        <button
          type="button"
          onClick={() => setOpenOnMobile(open => !open)}
          aria-expanded={openOnMobile}
          aria-controls="wizard-context-region"
          data-testid="wizard-context-toggle"
          className="flex min-h-touch w-full items-center justify-between gap-3 rounded-lg border border-border bg-card px-4 py-3 text-left text-sm font-semibold text-foreground hover:bg-accent"
        >
          <span className="flex min-w-0 items-center gap-2">
            <ClipboardList className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span className="break-words">
              This step needs {completed} of {checklistItems.length}
            </span>
          </span>
          <ChevronDown
            className={cn(
              'h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 motion-reduce:transition-none',
              openOnMobile && 'rotate-180',
            )}
            aria-hidden="true"
          />
        </button>
      )}

      {expanded && (
        <div
          id="wizard-context-region"
          data-testid="wizard-context-region"
          className={cn('space-y-3', isMobile && 'mt-3')}
        >
          <StepChecklist items={checklistItems} />

          {stepKey !== 'submit' && (
            <ApplicationPreview form={form} programName={programName} intakeName={intakeName} />
          )}

          {tips.length > 0 && (
            <div className="rounded-lg border border-border bg-card p-4">
              <h3 className="text-sm font-semibold text-foreground">{WIZARD_COPY.quickTipsTitle}</h3>
              <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                {tips.map(tip => (
                  <li key={tip} className="break-words">
                    {tip}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  )
}
