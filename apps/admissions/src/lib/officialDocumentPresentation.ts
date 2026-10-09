/**
 * How one application's official documents are *presented* — one primary action,
 * everything else behind one control (admissions-v2 task 11.3).
 *
 * Requirements: R13.2, R16.1-R16.2, R16.5. Findings: **STU-05**
 * (*"Application document actions become a tall stack of equally prominent
 * buttons on mobile"* — remedy: *"Present status first, one primary action, and
 * an accessible overflow/menu for secondary document commands"*), **STU-18**.
 *
 * This module **decides nothing about availability**. Which documents exist is
 * task 10.4's answer, and it arrives two ways that the surface must keep apart:
 *
 * - {@link isOfficialDocumentOffered} mirrors *issuance* — may a new artifact be
 *   minted from today's status and payment? Pure, so the browser may answer it;
 * - `useIssuedOfficialDocuments` asks the platform which artifacts it has
 *   already issued, and marks a read-existing one `historical`. A fact about
 *   stored rows, so the browser must ask.
 *
 * What is decided here is *order and prominence*: given the set of documents an
 * application has, which single one is worth a button, and what the surface says
 * about the rest. That is a presentation question, which is why it is a pure
 * function with no hook, no request and no status rule of its own.
 *
 * The order is the order of consequence to the student, not the order the types
 * happen to be declared in: an offer letter is the document a student opens; a
 * receipt is the one they look for once a year.
 */
import type { OfficialDocumentType } from '@/services/officialDocuments'

/**
 * The student-facing name of each official document type, and the verbs used for
 * it. Sentence-cased in prose (`"application slip"`), title-cased on a control
 * (`"Download Slip"`), because the same words read wrong in both places.
 *
 * `Download Slip` and the other resting labels are the strings task 10.4's
 * browser journeys press by name; they are kept verbatim so a presentation change
 * does not silently rename a command.
 */
export interface OfficialDocumentCopy {
  /** The document, named in prose: "your acceptance letter". */
  readonly noun: string
  /** The resting label of its download control. */
  readonly downloadLabel: string
  /** The label of its email command. */
  readonly emailLabel: string
}

export const OFFICIAL_DOCUMENT_COPY: Readonly<
  Record<OfficialDocumentType | string, OfficialDocumentCopy>
> = Object.freeze({
  acceptance_letter: {
    noun: 'acceptance letter',
    downloadLabel: 'Acceptance Letter',
    emailLabel: 'Email acceptance letter to me',
  },
  conditional_offer: {
    noun: 'conditional acceptance',
    downloadLabel: 'Conditional Acceptance',
    emailLabel: 'Email conditional acceptance to me',
  },
  application_slip: {
    noun: 'application slip',
    downloadLabel: 'Download Slip',
    emailLabel: 'Email application slip to me',
  },
  payment_receipt: {
    noun: 'payment receipt',
    downloadLabel: 'Payment Receipt',
    emailLabel: 'Email payment receipt to me',
  },
})

/**
 * Which document earns the one primary control, in order.
 *
 * A decision letter outranks proof of submission, which outranks a receipt. The
 * tuple is closed and ordered on purpose: an unknown type sorts after every known
 * one rather than displacing the offer letter.
 */
export const OFFICIAL_DOCUMENT_PRIORITY: readonly string[] = Object.freeze([
  'acceptance_letter',
  'conditional_offer',
  'application_slip',
  'payment_receipt',
])

export interface OfficialDocumentPresentationInput {
  /** The document types this application has, in any order. */
  readonly available: readonly string[]
  /** The types the platform is serving under the read-existing policy. */
  readonly historical?: readonly string[]
}

export interface PresentedOfficialDocument {
  readonly documentType: string
  readonly copy: OfficialDocumentCopy
  /** True when this is the issued copy rather than today's state (STU-18). */
  readonly historical: boolean
}

export interface OfficialDocumentPresentation {
  /** The one document that earns a visible control, or `null` when there are none. */
  readonly primary: PresentedOfficialDocument | null
  /** Everything else, in priority order, for the one overflow control. */
  readonly secondary: readonly PresentedOfficialDocument[]
  /** Every document, primary first — the order the surface lists them in. */
  readonly all: readonly PresentedOfficialDocument[]
}

function copyFor(documentType: string): OfficialDocumentCopy {
  return (
    OFFICIAL_DOCUMENT_COPY[documentType] ?? {
      noun: documentType.replace(/_/g, ' '),
      downloadLabel: 'Download document',
      emailLabel: 'Email document to me',
    }
  )
}

function priorityOf(documentType: string): number {
  const index = OFFICIAL_DOCUMENT_PRIORITY.indexOf(documentType)
  return index === -1 ? OFFICIAL_DOCUMENT_PRIORITY.length : index
}

/**
 * Split an application's documents into the one that gets a button and the rest.
 *
 * Total, pure and order-independent: the same set of types always produces the
 * same primary, whatever order they arrive in, and a type named twice is listed
 * once.
 */
export function presentOfficialDocuments({
  available,
  historical = [],
}: OfficialDocumentPresentationInput): OfficialDocumentPresentation {
  const historicalSet = new Set(historical)
  const seen = new Set<string>()
  const ordered: PresentedOfficialDocument[] = []

  for (const documentType of available) {
    if (!documentType || seen.has(documentType)) continue
    seen.add(documentType)
    ordered.push({
      documentType,
      copy: copyFor(documentType),
      historical: historicalSet.has(documentType),
    })
  }

  ordered.sort((left, right) => {
    const byPriority = priorityOf(left.documentType) - priorityOf(right.documentType)
    if (byPriority !== 0) return byPriority
    // Two unknown types keep a stable, explainable order rather than the order
    // the server's list happened to arrive in.
    return left.documentType.localeCompare(right.documentType)
  })

  return {
    primary: ordered[0] ?? null,
    secondary: ordered.slice(1),
    all: ordered,
  }
}

/**
 * The sentence that goes **before** the controls (STU-05: *"present status
 * first"*).
 *
 * It states what the platform has, and — when it is serving an issued copy —
 * that this is the copy on record rather than a claim about today's state. It
 * never says "not available": a document the application does not have is simply
 * not mentioned, because the surface renders nothing at all in that case.
 */
export function officialDocumentSummary(
  presentation: OfficialDocumentPresentation,
): string | null {
  const { primary, secondary } = presentation
  if (!primary) return null
  const rest = secondary.length
  const noun = primary.copy.noun
  if (rest === 0) {
    return `Your ${noun} is ready to download.`
  }
  return `Your ${noun} is ready to download, with ${rest} other ${
    rest === 1 ? 'document' : 'documents'
  } on record.`
}

/**
 * The label of the one control that opens everything else.
 *
 * Counted, because an overflow control that does not say how much it hides is the
 * closed box a phone student could not tell held anything (the reason the
 * pre-11.3 mobile `<details>` was a density defect rather than a density fix).
 */
export function officialDocumentOverflowLabel(count: number): string {
  return count === 1 ? 'More document options (1)' : `More document options (${count})`
}

/**
 * The one sentence the surface's single live region announces.
 *
 * Before task 11.3 every document control carried its own `aria-live="polite"`,
 * so a card with four documents had four competing live regions bolted to
 * elements whose own accessible names were changing. There is one region now, it
 * lives outside the action cluster, and this is what it says.
 *
 * Precedence is worst-news-first and is deliberate: a student whose letter failed
 * while their receipt is downloading needs to hear about the failure. `idle` and
 * `ready` say nothing about *work*, so a surface at rest announces the resting
 * state rather than chattering.
 */
export function announceOfficialDocumentState(
  states: Readonly<Record<string, string>>,
  presentation: OfficialDocumentPresentation,
): string {
  const named = (documentType: string): string =>
    presentation.all.find((entry) => entry.documentType === documentType)?.copy.noun ??
    'official document'

  const find = (wanted: readonly string[]): string | null => {
    for (const entry of presentation.all) {
      const state = states[entry.documentType]
      if (state && wanted.includes(state)) return entry.documentType
    }
    return null
  }

  const failed = find(['failed', 'setup_required'])
  if (failed) return `Your ${named(failed)} could not be prepared.`

  const working = find(['generating', 'queued'])
  if (working) return `Preparing your ${named(working)}. This can take a moment.`

  const ready = find(['ready'])
  if (ready) return `Your ${named(ready)} is ready.`

  return ''
}
