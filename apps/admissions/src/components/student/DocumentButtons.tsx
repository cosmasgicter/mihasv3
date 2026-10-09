/**
 * One application's official documents: status first, one primary action, and one
 * accessible sheet for everything else (admissions-v2 task 11.3).
 *
 * Requirements: **R13.2** (official-document availability on the application
 * surface), **R16.1** (320 px first, and a compact layout may not lose commands),
 * **R16.2** (44 px targets, WCAG 2.1 AA keyboard/name/state), **R16.5** (no
 * redundant duplicate affordances). Findings: **STU-05**, **STU-18**.
 *
 * ## What this replaces
 *
 * STU-05: *"Application document actions become a tall stack of equally prominent
 * buttons on mobile"*, with the remedy *"Present status first, one primary action,
 * and an accessible overflow/menu for secondary document commands"*.
 *
 * Before task 11.3 this component rendered **every control twice** — a
 * `sm:hidden` mobile `<details>` and a `hidden sm:flex` desktop row — so:
 *
 * - each document type mounted **two** `useOfficialDocument` instances with two
 *   independent states, and the copy a student pressed was not the copy the other
 *   viewport would have driven;
 * - a screen reader met every document heading, note and alert twice;
 * - each control carried its own `aria-live="polite"`, so up to eight live
 *   regions competed on one card;
 * - on a phone the disclosure was **collapsed by default and held the only
 *   controls**, so a student whose acceptance letter was ready saw a closed box
 *   labelled "Documents" and nothing else. That is not a density fix; it is the
 *   platform publishing a ready artifact and the surface hiding it.
 *
 * Now: rendered **once**, at every width. The status sentence comes first, the one
 * document worth a button gets one, and every other command — email, the other
 * documents, the issued copies — lives behind one counted disclosure. The sheet's
 * content stays mounted (`hidden`) so an action in flight is not unmounted by
 * closing the sheet, and so there is still exactly one hook per document type.
 *
 * ## What it still does not decide
 *
 * Availability is task 10.4's, and it arrives two ways that must stay apart:
 * {@link isOfficialDocumentOffered} mirrors *issuance* (may a new artifact be
 * minted from today's status and payment — pure, so the browser may answer it),
 * and `useIssuedOfficialDocuments` asks the platform what it has already issued
 * and which of those are `historical` (a fact about stored rows, so the browser
 * asks). Order and prominence are this file's only decision, and they are made by
 * the pure {@link presentOfficialDocuments}.
 */
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle,
  Award,
  ChevronDown,
  Download,
  FileCheck,
  FileText,
  Mail,
  RotateCcw,
} from 'lucide-react'

import { Button } from '@/components/ui/Button'
import { useToastStore } from '@/hooks/useToast'
import {
  useOfficialDocument,
  type OfficialDocumentUiState,
} from '@/hooks/useOfficialDocument'
import { OfficialDocumentRecovery } from '@/components/student/documents/OfficialDocumentRecovery'
import { useIssuedOfficialDocuments } from '@/hooks/useIssuedOfficialDocuments'
import { isOfficialDocumentOffered } from '@/lib/officialDocumentGate'
import {
  announceOfficialDocumentState,
  officialDocumentOverflowLabel,
  officialDocumentSummary,
  presentOfficialDocuments,
  type OfficialDocumentCopy,
} from '@/lib/officialDocumentPresentation'
import type { OfficialDocumentType } from '@/services/officialDocuments'

/**
 * How much room the surface has.
 *
 * `panel` is the application workspace's own documents card: one prominent
 * download, then the sheet. `row` is a dashboard list row, where a prominent
 * per-application download would be the equally-prominent stack STU-05 names
 * multiplied by the number of applications — so the row keeps the status sentence
 * and one counted control, and every command including the download lives inside
 * it. No command is lost either way (R16.1).
 */
export type DocumentActionsDensity = 'panel' | 'row'

interface DocumentButtonsProps {
  applicationId: string
  applicationNumber?: string
  status: string
  paymentStatus: string | null
  density?: DocumentActionsDensity
}

/**
 * Where each document's email command is registered so the sheet can offer it.
 *
 * A **ref**, not state: the primary document's download button and its email
 * command render in two different places (the card, and the sheet below it), and
 * only one `useOfficialDocument` instance may exist per type — a second instance
 * would be the two-copies-of-every-control defect this task removed, in miniature.
 * Registering the callback in a ref lets the sheet call the hook that already
 * exists without a state write on every render of every document.
 */
type DocumentEmailRegistry = Map<string, () => Promise<void>>

/** Map a UI state to the in-button label for an official-document download. */
function actionLabel(uiState: OfficialDocumentUiState, restingLabel: string): string {
  switch (uiState) {
    case 'generating':
      return 'Generating…'
    case 'queued':
      return 'Queued…'
    case 'failed':
      return 'Retry'
    case 'setup_required':
      return 'Setup Required'
    default:
      return restingLabel
  }
}

const DOCUMENT_ICONS: Record<string, React.ReactNode> = {
  acceptance_letter: <Award className="h-4 w-4" aria-hidden="true" />,
  conditional_offer: <FileCheck className="h-4 w-4" aria-hidden="true" />,
  application_slip: <Download className="h-4 w-4" aria-hidden="true" />,
  payment_receipt: <Download className="h-4 w-4" aria-hidden="true" />,
}

interface OfficialDocActionProps {
  applicationId: string
  /** Non-PII context for the support affordance on the failure path. */
  applicationNumber?: string
  documentType: OfficialDocumentType | string
  copy: OfficialDocumentCopy
  /**
   * True when the platform is serving an artifact it already issued rather than
   * one it would mint from today's application state (task 10.4, R13.11, design
   * §11.3). Said plainly next to the control, because the two are genuinely
   * different things and the student is entitled to know which they have.
   */
  historical: boolean
  /** `primary` gets the prominent button; `listed` sits inside the sheet. */
  placement: 'primary' | 'listed'
  /** Report state upward so the surface can hold **one** live region (R16.2). */
  onUiState: (documentType: string, uiState: OfficialDocumentUiState) => void
  /** Where to register this document's email command for the sheet to call. */
  emailRegistry?: DocumentEmailRegistry
}

/**
 * One document, one hook, one place in the DOM.
 *
 * Sources everything from `services/officialDocuments.ts` via
 * `useOfficialDocument` (R13.5) — never a client `@/lib/pdf` render. Surfaces the
 * backend `Queued`/`Generating`/`Ready`/`Failed`/`Setup required` states, streams
 * the authoritative stored record on success, and renders task 10.4's neutral
 * recovery when the platform cannot produce it.
 *
 * The container keeps its `official-document-{type}` test id, its `data-historical`
 * flag and its `role="alert"` recovery **together**, because that is one document's
 * whole story and task 10.4's browser journeys read it as one.
 */
function OfficialDocAction({
  applicationId,
  applicationNumber,
  documentType,
  copy,
  historical,
  placement,
  onUiState,
  emailRegistry,
}: OfficialDocActionProps) {
  const { uiState, isBusy, error, canRetry, isSetupRequired, download, email } =
    useOfficialDocument(applicationId, documentType as OfficialDocumentType)
  const { addToast } = useToastStore()

  const handleDownload = useCallback(async () => {
    const ok = await download()
    if (ok) {
      addToast('success', 'Document downloaded successfully')
    } else {
      addToast('error', error || 'Failed to generate document. Please try again.')
    }
  }, [addToast, download, error])

  /**
   * The platform emails an official record to its owner and refuses any other
   * address with `RECIPIENT_NOT_PERMITTED` (task 10.4). So this is one command
   * with no address to type — the pre-11.3 surface offered a prefilled text input
   * that accepted a parent's address and then failed at the API with a 400.
   */
  const handleEmail = useCallback(async () => {
    const ok = await email()
    if (ok) {
      addToast('success', `Your ${copy.noun} is on its way to your email address`)
    } else {
      addToast('error', error || `Your ${copy.noun} could not be emailed. Please try again.`)
    }
  }, [addToast, copy.noun, email, error])

  useEffect(() => {
    onUiState(documentType, uiState)
  }, [documentType, onUiState, uiState])

  useEffect(() => {
    if (!emailRegistry) return
    emailRegistry.set(documentType, handleEmail)
    return () => {
      emailRegistry.delete(documentType)
    }
  }, [documentType, emailRegistry, handleEmail])

  const showSpinnerIcon = uiState === 'generating' || uiState === 'queued'
  const leadingIcon =
    uiState === 'failed' ? (
      <RotateCcw className="h-4 w-4" aria-hidden="true" />
    ) : uiState === 'setup_required' ? (
      <AlertTriangle className="h-4 w-4" aria-hidden="true" />
    ) : !showSpinnerIcon ? (
      DOCUMENT_ICONS[documentType] ?? <Download className="h-4 w-4" aria-hidden="true" />
    ) : null

  return (
    <div
      className="flex w-full flex-col gap-2"
      data-testid={`official-document-${documentType}`}
      data-historical={historical ? 'true' : 'false'}
    >
      <Button
        onClick={handleDownload}
        disabled={isBusy || uiState === 'setup_required'}
        loading={showSpinnerIcon}
        variant={placement === 'primary' ? 'primary' : 'outline'}
        size={placement === 'primary' ? 'lg' : 'sm'}
        className={
          placement === 'primary'
            ? 'min-h-touch-lg w-full justify-center gap-2 px-6 text-base font-semibold shadow-sm sm:w-auto'
            : 'min-h-touch w-full justify-start gap-2'
        }
      >
        {leadingIcon}
        {actionLabel(uiState, copy.downloadLabel)}
      </Button>

      {placement === 'listed' && (
        <Button
          onClick={handleEmail}
          disabled={isBusy || uiState === 'setup_required'}
          variant="ghost"
          size="sm"
          className="min-h-touch w-full justify-start gap-2"
        >
          <Mail className="h-4 w-4" aria-hidden="true" />
          {copy.emailLabel}
        </Button>
      )}

      {historical && (
        // Not a warning and not an error: the document is lawful and readable.
        // It is simply the copy the platform issued, which is why it stays
        // available once the application itself is terminal (STU-18).
        <p className="text-xs text-muted-foreground">Issued copy on record</p>
      )}

      {(isSetupRequired || uiState === 'failed') && (
        // admissions-v2 task 10.4 (STU-18): a neutral sentence, who is dealing
        // with it, and a tenant-resolved route to a human — never this school's
        // document-setup checklist, and no retry the server says cannot help.
        <OfficialDocumentRecovery
          message={error}
          canRetry={canRetry}
          isSetupRequired={isSetupRequired}
          applicationNumber={applicationNumber}
          documentLabel={copy.noun}
          onRetry={handleDownload}
          busy={isBusy}
        />
      )}
    </div>
  )
}

export function DocumentButtons({
  applicationId,
  applicationNumber,
  status,
  paymentStatus,
  density = 'panel',
}: DocumentButtonsProps) {
  // The **read-existing** half of the policy, and it is the server's answer
  // (task 10.4, R13.11, STU-18). `isOfficialDocumentOffered` mirrors *issuance*
  // only — "may a new artifact be created from today's state?" — which is a pure
  // function of status and payment. Whether the platform already issued a lawful
  // artifact is a fact about stored rows, so the surface asks rather than guesses.
  const { isIssued, isHistorical } = useIssuedOfficialDocuments(applicationId)

  const presentation = useMemo(() => {
    const candidates: OfficialDocumentType[] = [
      'acceptance_letter',
      'conditional_offer',
      'application_slip',
      'payment_receipt',
    ]
    const available = candidates.filter(
      (documentType) =>
        isOfficialDocumentOffered(documentType, status, paymentStatus) || isIssued(documentType),
    )
    return presentOfficialDocuments({
      available,
      historical: available.filter((documentType) => isHistorical(documentType)),
    })
  }, [isHistorical, isIssued, paymentStatus, status])

  const [uiStates, setUiStates] = useState<Record<string, OfficialDocumentUiState>>({})
  const [open, setOpen] = useState(false)
  const panelId = useId()
  const emailRegistry = useRef<DocumentEmailRegistry>(new Map()).current

  const handleUiState = useCallback((documentType: string, uiState: OfficialDocumentUiState) => {
    setUiStates((current) => (current[documentType] === uiState ? current : { ...current, [documentType]: uiState }))
  }, [])

  const { primary, secondary } = presentation
  if (!primary) {
    return null
  }

  const summary = officialDocumentSummary(presentation)
  const announcement = announceOfficialDocumentState(uiStates, presentation)
  // Every command that is not the one primary download: the primary's email, and
  // both commands for each other document.
  const overflowCount = (density === 'row' ? 2 : 1) + secondary.length * 2
  // The hook's own re-entrancy guard (`if (inflight) return false`) is what makes
  // a double tap safe; this only keeps the control from *looking* available while
  // the platform is already working on that document.
  const primaryState = uiStates[primary.documentType]
  const primaryBusy = primaryState === 'generating' || primaryState === 'queued'

  const primaryAction = (
    <OfficialDocAction
      applicationId={applicationId}
      applicationNumber={applicationNumber}
      documentType={primary.documentType}
      copy={primary.copy}
      historical={primary.historical}
      placement={density === 'row' ? 'listed' : 'primary'}
      onUiState={handleUiState}
      emailRegistry={emailRegistry}
    />
  )

  return (
    <div
      className="flex w-full min-w-0 flex-col gap-3"
      data-testid="application-document-actions"
      data-density={density}
    >
      {/*
        Status first (STU-05). What the platform has, in a sentence, before any
        control — so a student on a 320 px screen knows there is something here
        without opening anything, which is exactly what the collapsed `<details>`
        took away.
      */}
      {summary && (
        <p className="break-words text-sm text-muted-foreground" data-testid="document-status-summary">
          {summary}
        </p>
      )}

      {density === 'panel' && primaryAction}

      {/*
        One counted disclosure for every remaining command. A real ARIA
        disclosure rather than a `<details>`: the trigger is a 44 px button with
        `aria-expanded`/`aria-controls`, and the panel stays mounted so an action
        in flight survives closing it — and so each document keeps exactly one
        `useOfficialDocument` instance (R16.2).
      */}
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        aria-controls={panelId}
        data-testid="document-options-trigger"
        className="inline-flex min-h-touch w-full items-center justify-between gap-3 rounded-lg border border-border bg-card px-3 py-2 text-sm font-semibold text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:w-auto"
      >
        <span className="inline-flex min-w-0 items-center gap-2">
          <FileText className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
          <span className="break-words">{officialDocumentOverflowLabel(overflowCount)}</span>
        </span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform motion-reduce:transition-none ${open ? 'rotate-180' : ''}`}
          aria-hidden="true"
        />
      </button>

      <div
        id={panelId}
        hidden={!open}
        data-testid="document-options-panel"
        /*
          `hidden` **and** the display utility, because the attribute alone does
          not survive Tailwind.

          `[hidden] { display: none }` and `.flex { display: flex }` have equal
          specificity, so source order decides — and utilities are emitted after
          preflight. A permanently-`flex` panel with `hidden` on it therefore stays
          on screen: every command the sheet was supposed to hold would be visible
          at all times, with `aria-expanded="false"` claiming otherwise. That is
          the density defect back again, and it is invisible to jsdom, which
          computes no display from a class. Found by
          `student-document-density.spec.ts` journey 1 (README §3).

          The attribute is kept rather than replaced: it is what takes the subtree
          out of the accessibility tree and out of the tab order, which the class
          alone would also do but the attribute states declaratively.
        */
        /*
          No border and no background of its own. This surface already sits inside
          a `SectionCard` (the workspace) or inside a list row (the dashboard), and
          PRODUCT.md's "one container deep" rule means the panel may not become a
          second card inside either. Task 11.2's `WizardContextPanel` settled the
          same question the same way: the card treatment belongs to the trigger and
          to the content, never to the disclosure panel.
        */
        className={`w-full flex-col gap-2 pl-1 ${open ? 'flex' : 'hidden'}`}
      >
        {density === 'row' && primaryAction}

        {density === 'panel' && (
          <Button
            onClick={() => void emailRegistry.get(primary.documentType)?.()}
            disabled={primaryBusy || primaryState === 'setup_required'}
            variant="ghost"
            size="sm"
            className="min-h-touch w-full justify-start gap-2"
          >
            <Mail className="h-4 w-4" aria-hidden="true" />
            {primary.copy.emailLabel}
          </Button>
        )}

        {secondary.map((document) => (
          <OfficialDocAction
            key={document.documentType}
            applicationId={applicationId}
            applicationNumber={applicationNumber}
            documentType={document.documentType}
            copy={document.copy}
            historical={document.historical}
            placement="listed"
            onUiState={handleUiState}
            emailRegistry={emailRegistry}
          />
        ))}

        {/*
          In a list row the live region lives **inside** the sheet, because every
          command does — so a dashboard row carries no live status of its own, and
          a page of applications cannot accumulate one live region per row. While
          the sheet is closed the region is inside `hidden` and therefore out of
          the accessibility tree, which is correct: nothing can be in flight,
          because nothing in there has been reachable.
        */}
        {density === 'row' && <LiveDocumentStatus announcement={announcement} />}
      </div>

      {/*
        One live region for the whole surface, outside the action cluster rather
        than on the controls (R16.2, and the "live status feedback outside dense
        rows" half of task 11.3). Before this every control carried its own
        `aria-live="polite"`, so a card with four documents had four competing live
        regions bolted to elements whose accessible names were changing.
      */}
      {density === 'panel' && <LiveDocumentStatus announcement={announcement} />}
    </div>
  )
}

/** The one polite region a document surface owns. */
function LiveDocumentStatus({ announcement }: { announcement: string }) {
  return (
    <p className="sr-only" role="status" aria-live="polite" aria-atomic="true" data-testid="document-live-status">
      {announcement}
    </p>
  )
}
