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
 * (`"Application Slip"`), because the same words read wrong in both places.
 *
 * SJR task 3.20 (R5-f): `label` is the document's name only. The control says what
 * it does with a verb in front of it, "Prepare" for a document the platform has
 * not issued yet and "Open" for one it has, because the old "Download Slip" claimed
 * an action (a download, of a file that might not exist) the control did not take.
 */
export interface OfficialDocumentCopy {
  /** The document, named in prose: "your acceptance letter". */
  readonly noun: string
  /** The document's name as it reads on a control, without a verb. */
  readonly label: string
  /** The label of its email command. */
  readonly emailLabel: string
}

export const OFFICIAL_DOCUMENT_COPY: Readonly<
  Record<OfficialDocumentType | string, OfficialDocumentCopy>
> = Object.freeze({
  acceptance_letter: {
    noun: 'acceptance letter',
    label: 'Acceptance letter',
    emailLabel: 'Email acceptance letter to me',
  },
  conditional_offer: {
    noun: 'conditional acceptance',
    label: 'Conditional acceptance',
    emailLabel: 'Email conditional acceptance to me',
  },
  application_slip: {
    noun: 'application slip',
    label: 'Application slip',
    emailLabel: 'Email application slip to me',
  },
  payment_receipt: {
    noun: 'payment receipt',
    label: 'Payment receipt',
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

/**
 * The document types that render only from a school's document profile, so a
 * school that has not set one up cannot produce them (SJR R7-d). Mirrors the
 * backend's `PROFILE_REQUIRED_DOCUMENT_TYPES`; the backend read path is
 * authoritative and the surface only asks it.
 */
export const PROFILE_REQUIRED_LETTER_TYPES: readonly string[] = Object.freeze([
  'acceptance_letter',
  'conditional_offer',
])

/**
 * What a student reads when the school has not set a letter up (SJR R7-d, D9
 * confirmed 2026-11-08, option C). It names no configuration, offers no retry and
 * promises nothing the platform does not do: the school's own staff are alerted
 * by the platform, and the student is given a way to ask.
 *
 * `school` is the resolved school's brand on a white-label host, else `null`.
 */
export function officialDocumentUnavailableMessage(
  noun: string,
  school: string | null,
  { statedElsewhere = false }: { statedElsewhere?: boolean } = {},
): string {
  const who = school && school.trim() ? school.trim() : 'Your school'
  const detail = `${who} is still setting it up. Check back here soon, or contact admissions.`
  // The status sentence above the controls already says the document "isn't
  // available yet" for the primary document; saying it twice on one card is two
  // renderings of one fact (R16.5).
  return statedElsewhere ? detail : `Your ${noun} isn't available yet. ${detail}`
}

export interface OfficialDocumentPresentationInput {
  /** The document types this application has, in any order. */
  readonly available: readonly string[]
  /** The types the platform is serving under the read-existing policy. */
  readonly historical?: readonly string[]
  /**
   * The types the platform has actually issued (a stored artifact exists). A type
   * that is `available` but not `issued` can be prepared, not opened (R5-f).
   */
  readonly issued?: readonly string[]
}

export interface PresentedOfficialDocument {
  readonly documentType: string
  readonly copy: OfficialDocumentCopy
  /** True when this is the issued copy rather than today's state (STU-18). */
  readonly historical: boolean
  /** True when the platform has issued it, so it can be opened rather than prepared. */
  readonly issued: boolean
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
      label: 'Document',
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
  issued = [],
}: OfficialDocumentPresentationInput): OfficialDocumentPresentation {
  const historicalSet = new Set(historical)
  const issuedSet = new Set(issued)
  const seen = new Set<string>()
  const ordered: PresentedOfficialDocument[] = []

  for (const documentType of available) {
    if (!documentType || seen.has(documentType)) continue
    seen.add(documentType)
    ordered.push({
      documentType,
      copy: copyFor(documentType),
      historical: historicalSet.has(documentType),
      issued: issuedSet.has(documentType),
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
 * It states what the platform has, and it says "ready" only for a document the
 * platform has issued (R5-f, clause 2.27). A document the student may prepare but
 * that has not been issued "can be prepared now"; one being made "is being
 * prepared"; one that failed "couldn't be prepared"; and one the school has not
 * set up "isn't available yet". The old sentence said "ready to download" for all
 * of them, so a student pressed a control for a file that did not exist.
 *
 * It never says "not available" for a document the application does not have: such
 * a document is simply not mentioned, because the surface renders nothing at all
 * in that case.
 *
 * `states` is the per-type UI state the surface already holds. It only refines the
 * primary document's sentence: a type the student has just prepared reads as
 * ready, and no other type does unless the platform issued it.
 */
export function officialDocumentSummary(
  presentation: OfficialDocumentPresentation,
  states: Readonly<Record<string, string>> = {},
): string | null {
  const { primary, secondary } = presentation
  if (!primary) return null
  const rest = secondary.length
  const noun = primary.copy.noun
  const state = states[primary.documentType]

  let lead: string
  if (state === 'generating' || state === 'queued') {
    lead = `Your ${noun} is being prepared`
  } else if (state === 'failed') {
    return `Your ${noun} couldn't be prepared. Try again.`
  } else if (state === 'setup_required') {
    lead = `Your ${noun} isn't available yet`
  } else if (primary.issued || state === 'ready') {
    lead = `Your ${noun} is ready to open`
  } else {
    lead = `Your ${noun} can be prepared now`
  }
  if (rest === 0) {
    return `${lead}.`
  }
  return `${lead}, with ${rest} other ${rest === 1 ? 'document' : 'documents'} available.`
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
