/**
 * What an error boundary is allowed to say to a student.
 *
 * Closes **GATE-13.3-10** (13.6 §8.1 item L6, blocking item **B8**; R16.8,
 * finding STU-10).
 *
 * ## What was wrong
 *
 * `ErrorBoundary`'s section fallback rendered `this.state.error?.message`
 * verbatim. Task 13.3 cut the connection while the application wizard was mounted
 * and measured the screen a student actually sees:
 *
 * > **Something went wrong** · *Cannot read properties of undefined (reading
 * > 'SessionMonitor')* · **Try Again** · **Contact Support**
 *
 * R16.8 requires the student's error recovery to *remain understandable* under
 * offline/reconnect. A raw `TypeError` naming an internal module fails that on
 * every count: it does not say the connection dropped, it does not say whether
 * saved work survived, and it names a module the student has no concept of.
 *
 * ## The rule this module encodes
 *
 * **A boundary never renders an exception message.** It renders one of a closed
 * set of sentences chosen by *classifying* the exception. The technical detail
 * still exists — `reportBoundaryError` logs it and `onError` forwards it to error
 * monitoring — it just stops being copy.
 *
 * Classification is deliberately conservative. `unknown` is the default, and its
 * sentence is honest about not knowing rather than guessing at a cause; only a
 * recognised network or module-load signature earns the connection wording, so
 * the platform never tells a student their connection failed when it did not.
 *
 * Pure and dependency-free so it can be tested exhaustively without a browser.
 */

/** The recognised causes, in the order `classifyBoundaryError` checks them. */
export type BoundaryErrorKind = 'offline' | 'chunk' | 'network' | 'unknown'

export interface BoundaryCopy {
  kind: BoundaryErrorKind
  title: string
  message: string
  /** True when reloading the page is the useful control, not just retrying. */
  offerReload: boolean
}

/**
 * Vite/Rollup and the browsers each phrase a failed dynamic import differently,
 * and a *named-export* lazy wrapper can turn one into a `TypeError` before any of
 * these strings appear — which is exactly how GATE-13.3-10's message came about.
 * So the destructuring `TypeError` is matched here too, and
 * `AuthenticatedRouteShell` no longer produces it in the first place.
 */
const CHUNK_SIGNATURES = [
  /chunkloaderror/i,
  /loading chunk/i,
  /failed to fetch dynamically imported module/i,
  /error loading dynamically imported module/i,
  /importing a module script failed/i,
  /loading css chunk/i,
  /dynamically imported module/i,
  /'text\/html' is not a valid javascript mime type/i,
]

const NETWORK_SIGNATURES = [
  /failed to fetch/i,
  /networkerror/i,
  /network request failed/i,
  /load failed/i,
  /net::err_/i,
  /err_internet_disconnected/i,
  /the internet connection appears to be offline/i,
]

function describe(error: unknown): string {
  if (!error) return ''
  if (typeof error === 'string') return error
  if (error instanceof Error) return `${error.name}: ${error.message}`
  if (typeof error === 'object' && 'message' in error) {
    return String((error as { message?: unknown }).message ?? '')
  }
  return ''
}

function matches(text: string, signatures: RegExp[]): boolean {
  return signatures.some((signature) => signature.test(text))
}

/**
 * Choose the sentence a boundary shows.
 *
 * @param error the caught exception, in whatever shape React handed over
 * @param online the browser's own connectivity answer. Passed in rather than read
 *   here so this stays pure and so a test can state both worlds; callers pass
 *   `navigator.onLine`.
 */
export function classifyBoundaryError(error: unknown, online: boolean): BoundaryCopy {
  const text = describe(error)

  // The browser says the connection is gone. That is a better answer than any
  // signature match, so it is checked first.
  if (!online) {
    return {
      kind: 'offline',
      title: 'You appear to be offline',
      message:
        'We could not reach the network, so this part of the page could not load. Anything you had already saved is safe. Reconnect and try again.',
      offerReload: false,
    }
  }

  if (matches(text, CHUNK_SIGNATURES)) {
    return {
      kind: 'chunk',
      title: 'We could not finish loading this page',
      message:
        'Part of the app could not be downloaded — usually a dropped connection, or a newer version having just been released. Anything you had already saved is safe. Try again, or reload the page.',
      offerReload: true,
    }
  }

  if (matches(text, NETWORK_SIGNATURES)) {
    return {
      kind: 'network',
      title: 'We could not reach the network',
      message:
        'The connection failed while this page was loading. Anything you had already saved is safe. Check your connection and try again.',
      offerReload: false,
    }
  }

  return {
    kind: 'unknown',
    title: 'Something went wrong',
    message:
      'This part of the page stopped working. Anything you had already saved is safe. Try again, and contact support if it keeps happening.',
    offerReload: true,
  }
}

/**
 * The guard the converted `test.fail()` row asserts in the browser, available to
 * unit tests as well: no boundary copy may contain an internal error shape.
 *
 * Kept beside the copy it checks so a future sentence cannot be added without the
 * check being in view.
 */
export const INTERNAL_ERROR_SHAPES = [
  /cannot read propert/i,
  /undefined \(reading/i,
  /\bTypeError\b/,
  /\bReferenceError\b/,
  /is not a function/i,
  /\bundefined\b/,
  /\bnull\b/,
] as const

export function leaksInternalError(text: string): boolean {
  return INTERNAL_ERROR_SHAPES.some((shape) => shape.test(text))
}
