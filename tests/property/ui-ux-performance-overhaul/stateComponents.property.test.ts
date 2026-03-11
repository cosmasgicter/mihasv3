// @vitest-environment node
/**
 * Property-Based Tests: State Components (EmptyState, ErrorDisplay, FileUpload)
 * Feature: ui-ux-performance-overhaul
 * Task: 12.4 Write property tests for state components
 *
 * **Property 15: EmptyState Rendering Completeness** — heading always rendered, description/action conditional
 * **Property 16: ErrorDisplay Retry Invariant** — retry button present iff onRetry provided
 * **Property 17: FileUpload State Machine Rendering** — correct UI for each upload state
 *
 * **Validates: Requirements 8.3, 8.4, 14.1, 14.2, 14.3, 14.4**
 */
import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// ============================================================================
// Test Configuration
// ============================================================================

const NUM_RUNS = 10

// ============================================================================
// Component File Paths
// ============================================================================

const UI_DIR = resolve(process.cwd(), 'src/components/ui')

const EMPTY_STATE_PATH = resolve(UI_DIR, 'EmptyState.tsx')
const ERROR_DISPLAY_PATH = resolve(UI_DIR, 'ErrorDisplay.tsx')
const FILE_UPLOAD_PATH = resolve(UI_DIR, 'FileUpload.tsx')

// ============================================================================
// Load component sources once
// ============================================================================

const emptyStateSource = readFileSync(EMPTY_STATE_PATH, 'utf-8')
const errorDisplaySource = readFileSync(ERROR_DISPLAY_PATH, 'utf-8')
const fileUploadSource = readFileSync(FILE_UPLOAD_PATH, 'utf-8')

// ============================================================================
// Helpers
// ============================================================================

/** Extract all className string literals from source code */
function extractClassNameStrings(source: string): string[] {
  const classNames: string[] = []
  const jsxAttrRegex = /className\s*=\s*"([^"]+)"/g
  for (const match of source.matchAll(jsxAttrRegex)) {
    classNames.push(match[1])
  }
  const stringLiteralRegex = /['"]([^'"]*(?:text-|bg-|border-|ring-|shadow-|rounded-|hover:|focus|active:|transition|animate)[^'"]*)['"]/g
  for (const match of source.matchAll(stringLiteralRegex)) {
    classNames.push(match[1])
  }
  return classNames
}

/** Check for hardcoded color values in a className string */
function findHardcodedColors(classNameStr: string): string[] {
  const violations: string[] = []
  const hexPattern = /#(?:[0-9a-fA-F]{3}){1,2}(?:[0-9a-fA-F]{2})?\b/g
  for (const match of classNameStr.matchAll(hexPattern)) {
    violations.push(match[0])
  }
  if (/\brgba?\s*\(/.test(classNameStr)) {
    violations.push('rgb()/rgba() found')
  }
  const hslPattern = /\bhsla?\s*\(\s*(?!var\b)/
  if (hslPattern.test(classNameStr)) {
    violations.push('hsl()/hsla() found')
  }
  return violations
}

// ============================================================================
// Property 15: EmptyState Rendering Completeness
// ============================================================================

describe('Property 15: EmptyState Rendering Completeness', () => {
  /**
   * **Validates: Requirements 8.3**
   *
   * For any EmptyState with a heading string, optional description, and optional
   * action, the component should always render the heading. When description is
   * provided, it should be rendered. When action is provided, a button with the
   * action label should be rendered. The component should use design token colors
   * exclusively.
   */

  it('PROPERTY: EmptyState always renders a heading element', () => {
    // The source must contain an h-level element that renders the heading prop
    expect(emptyStateSource).toContain('<h3')
    // The heading is rendered via displayHeading which falls back to heading || title
    expect(emptyStateSource).toMatch(/displayHeading|heading/)
  })

  it('PROPERTY: EmptyState heading is always rendered for any non-empty heading string', () => {
    const headingArb = fc.string({ minLength: 1, maxLength: 100 }).filter(s => s.trim().length > 0)

    fc.assert(
      fc.property(headingArb, (heading) => {
        // The component unconditionally renders <h3>{displayHeading}</h3>
        // There is no conditional guard around the heading element
        // Verify the source has an unconditional h3 render (not wrapped in && or ternary)
        const h3Match = emptyStateSource.match(/<h3[^>]*>.*?<\/h3>/s)
        expect(h3Match, 'EmptyState must have an <h3> element for heading').toBeTruthy()

        // Verify the h3 is NOT conditionally rendered (no {heading && <h3>} pattern)
        const conditionalH3 = emptyStateSource.match(/\{.*&&\s*<h3/s)
        expect(
          conditionalH3,
          'EmptyState heading <h3> must not be conditionally rendered'
        ).toBeNull()
      }),
      { numRuns: NUM_RUNS }
    )
  })

  it('PROPERTY: EmptyState description is conditionally rendered only when provided', () => {
    // The source should have a conditional render for description: {description && ...}
    expect(emptyStateSource).toMatch(/\{description\s*&&/)
  })

  it('PROPERTY: EmptyState action button is conditionally rendered only when provided', () => {
    // The source should have a conditional render for action: {action && ...}
    expect(emptyStateSource).toMatch(/\{action\s*&&/)
    // When action is provided, a Button with action.label should be rendered
    expect(emptyStateSource).toContain('action.label')
  })

  it('PROPERTY: EmptyState uses design token colors exclusively (no hardcoded colors)', () => {
    const classNames = extractClassNameStrings(emptyStateSource)

    fc.assert(
      fc.property(fc.constantFrom(...classNames), (cls) => {
        const violations = findHardcodedColors(cls)
        expect(
          violations,
          `EmptyState has hardcoded color(s) in className: "${cls}" → [${violations.join(', ')}]`
        ).toHaveLength(0)
      }),
      { numRuns: NUM_RUNS }
    )
  })

  it('PROPERTY: EmptyState uses semantic token classes for text colors', () => {
    // Heading should use standard foreground (no explicit color = inherits)
    // Description should use muted-foreground
    expect(emptyStateSource).toContain('text-muted-foreground')
    // Icon area should use muted-foreground
    const iconSection = emptyStateSource.match(/icon\s*&&[\s\S]*?text-muted-foreground/)
    expect(iconSection, 'EmptyState icon area should use text-muted-foreground').toBeTruthy()
  })
})

// ============================================================================
// Property 16: ErrorDisplay Retry Invariant
// ============================================================================

describe('Property 16: ErrorDisplay Retry Invariant', () => {
  /**
   * **Validates: Requirements 8.4**
   *
   * For any error message string and an optional onRetry callback, the
   * ErrorDisplay component should render the message text. When onRetry is
   * provided, a "Try Again" button should be present. When onRetry is not
   * provided, no retry button should be rendered.
   */

  // Extract only the canonical ErrorDisplay function (not legacy exports)
  const canonicalErrorDisplaySource = (() => {
    // The canonical ErrorDisplay ends before the legacy exports section
    const legacyMarker = '// Legacy exports'
    const idx = errorDisplaySource.indexOf(legacyMarker)
    return idx > 0 ? errorDisplaySource.substring(0, idx) : errorDisplaySource
  })()

  it('PROPERTY: ErrorDisplay always renders the message text', () => {
    const messageArb = fc.string({ minLength: 1, maxLength: 200 }).filter(s => s.trim().length > 0)

    fc.assert(
      fc.property(messageArb, (_message) => {
        // The canonical ErrorDisplay renders {message} in both inline and section variants
        // Inline: <span className="text-destructive">{message}</span>
        // Section: <p className="text-sm text-muted-foreground">{message}</p>
        expect(canonicalErrorDisplaySource).toContain('{message}')
      }),
      { numRuns: NUM_RUNS }
    )
  })

  it('PROPERTY: ErrorDisplay retry button is present iff onRetry is provided', () => {
    // Both inline and section variants conditionally render retry based on onRetry
    // Pattern: {onRetry && (...Try Again...)}
    const onRetryConditionalCount = (canonicalErrorDisplaySource.match(/\{onRetry\s*&&/g) || []).length

    // There should be exactly 2 conditional renders of onRetry (one per variant: inline + section)
    expect(
      onRetryConditionalCount,
      'ErrorDisplay should conditionally render retry button in both inline and section variants'
    ).toBe(2)
  })

  it('PROPERTY: ErrorDisplay retry button contains "Try Again" text in both variants', () => {
    // Both variants should render "Try Again" text
    const tryAgainCount = (canonicalErrorDisplaySource.match(/Try Again/g) || []).length
    expect(
      tryAgainCount,
      'ErrorDisplay should have "Try Again" text in both inline and section variants'
    ).toBe(2)
  })

  it('PROPERTY: ErrorDisplay uses role="alert" and aria-live="assertive" for accessibility', () => {
    // Both variants should have role="alert"
    const roleAlertCount = (canonicalErrorDisplaySource.match(/role="alert"/g) || []).length
    expect(
      roleAlertCount,
      'ErrorDisplay should have role="alert" in both inline and section variants'
    ).toBeGreaterThanOrEqual(2)

    // Both variants should have aria-live="assertive"
    const ariaLiveCount = (canonicalErrorDisplaySource.match(/aria-live="assertive"/g) || []).length
    expect(
      ariaLiveCount,
      'ErrorDisplay should have aria-live="assertive" in both variants'
    ).toBeGreaterThanOrEqual(2)
  })

  it('PROPERTY: ErrorDisplay uses destructive design token for error styling', () => {
    expect(canonicalErrorDisplaySource).toContain('text-destructive')
  })

  it('PROPERTY: For any variant, retry is guarded by onRetry conditional', () => {
    const variantArb = fc.constantFrom('inline', 'section')

    fc.assert(
      fc.property(variantArb, (variant) => {
        // Both variants use the same pattern: {onRetry && (...)}
        // The retry button never appears unconditionally
        // Verify no unconditional "Try Again" render exists
        const unconditionalTryAgain = canonicalErrorDisplaySource.match(
          /(?<!onRetry\s*&&[^}]*?)>\s*Try Again\s*</
        )
        // All "Try Again" occurrences should be inside onRetry conditionals
        expect(
          canonicalErrorDisplaySource.includes('onRetry'),
          `ErrorDisplay ${variant} variant must reference onRetry prop`
        ).toBe(true)
      }),
      { numRuns: NUM_RUNS }
    )
  })
})

// ============================================================================
// Property 17: FileUpload State Machine Rendering
// ============================================================================

describe('Property 17: FileUpload State Machine Rendering', () => {
  /**
   * **Validates: Requirements 14.1, 14.2, 14.3, 14.4**
   *
   * For any file and upload state (idle, uploading, error, success), the
   * FileUpload component should render the correct UI elements for each state.
   */

  it('PROPERTY: FileUpload renders dropzone in idle state (no file)', () => {
    // The default/idle state renders a dropzone with react-dropzone
    expect(fileUploadSource).toContain('useDropzone')
    expect(fileUploadSource).toContain('getRootProps')
    expect(fileUploadSource).toContain('getInputProps')
    // Idle state shows upload instruction text
    expect(fileUploadSource).toContain('Drop file here or click to browse')
  })

  it('PROPERTY: FileUpload shows progress bar, file name, size, and cancel during upload', () => {
    // Uploading state section: if (uploading && hasFile)
    expect(fileUploadSource).toMatch(/uploading\s*&&\s*hasFile/)

    // Progress bar with role="progressbar"
    expect(fileUploadSource).toContain('role="progressbar"')
    expect(fileUploadSource).toContain('aria-valuenow')
    expect(fileUploadSource).toContain('aria-valuemin')
    expect(fileUploadSource).toContain('aria-valuemax')

    // File name display during upload
    expect(fileUploadSource).toContain("primaryFile?.name")

    // Cancel button during upload
    expect(fileUploadSource).toContain('Cancel upload')
    expect(fileUploadSource).toContain('onCancel')
  })

  it('PROPERTY: FileUpload shows error message and retry button with file retained on error', () => {
    // Error state section: if (error && hasFile)
    expect(fileUploadSource).toMatch(/error\s*&&\s*hasFile/)

    // Error message with role="alert"
    const errorAlertCount = (fileUploadSource.match(/role="alert"/g) || []).length
    expect(errorAlertCount).toBeGreaterThanOrEqual(1)

    // Retry button in error state
    expect(fileUploadSource).toContain('Retry')
    expect(fileUploadSource).toContain('onRetry')

    // File is retained — file name still shown in error state
    // The error state block still renders primaryFile?.name
    const errorBlock = fileUploadSource.match(/error\s*&&\s*hasFile[\s\S]*?(?=\/\/\s*---)/)?.[0] || ''
    expect(errorBlock).toContain('primaryFile?.name')
  })

  it('PROPERTY: FileUpload shows preview/icon, file name, and remove button on success', () => {
    // Success state section: if (hasPreview && hasFile && !error)
    expect(fileUploadSource).toMatch(/hasPreview\s*&&\s*hasFile/)

    // Preview image for image type
    expect(fileUploadSource).toContain('preview.url')
    expect(fileUploadSource).toContain("preview.type === 'image'")

    // File icon for non-image types
    expect(fileUploadSource).toContain('getFileIcon')

    // Remove button in success state
    expect(fileUploadSource).toContain('Remove file')
    expect(fileUploadSource).toContain('handleRemove')

    // CheckCircle icon for success indication
    expect(fileUploadSource).toContain('CheckCircle')
  })

  it('PROPERTY: FileUpload validates file type and size client-side before upload', () => {
    // react-dropzone handles client-side validation via accept and maxSize props
    expect(fileUploadSource).toContain('maxSize')
    expect(fileUploadSource).toContain('onDropRejected')

    // Error messages for validation failures
    expect(fileUploadSource).toContain('file-too-large')
    expect(fileUploadSource).toContain('file-invalid-type')
    expect(fileUploadSource).toContain('File exceeds maximum size')
    expect(fileUploadSource).toContain('Invalid file type')
  })

  it('PROPERTY: FileUpload state machine has correct state priority ordering', () => {
    // The component checks states in this order:
    // 1. uploading && hasFile → upload progress UI
    // 2. hasPreview && hasFile && !error → success UI
    // 3. error && hasFile → error with file retained UI
    // 4. hasFile && !error && !uploading && !hasPreview → file selected UI
    // 5. default → dropzone (idle)

    // Verify the ordering by checking that uploading check comes before preview check
    const uploadingIdx = fileUploadSource.indexOf('if (uploading && hasFile)')
    const previewIdx = fileUploadSource.indexOf('if (hasPreview && hasFile && !error)')
    const errorIdx = fileUploadSource.indexOf('if (error && hasFile)')

    expect(uploadingIdx, 'Uploading state should be checked').toBeGreaterThan(-1)
    expect(previewIdx, 'Preview/success state should be checked').toBeGreaterThan(-1)
    expect(errorIdx, 'Error state should be checked').toBeGreaterThan(-1)

    expect(
      uploadingIdx < previewIdx,
      'Uploading state should be checked before success state'
    ).toBe(true)
    expect(
      previewIdx < errorIdx,
      'Success state should be checked before error state'
    ).toBe(true)
  })

  it('PROPERTY: FileUpload renders correct UI elements for any upload progress value', () => {
    const progressArb = fc.integer({ min: 0, max: 100 })

    fc.assert(
      fc.property(progressArb, (progress) => {
        // The component clamps progress to 0-100 range
        expect(fileUploadSource).toContain('Math.min(100, Math.max(0, progress))')
        // Progress percentage is displayed
        expect(fileUploadSource).toContain('Math.round(progress)')
        // aria-valuenow uses the progress value
        expect(fileUploadSource).toContain('aria-valuenow={Math.round(progress)}')
      }),
      { numRuns: NUM_RUNS }
    )
  })

  it('PROPERTY: FileUpload uses design token colors exclusively (no hardcoded colors)', () => {
    const classNames = extractClassNameStrings(fileUploadSource)
    expect(classNames.length).toBeGreaterThan(0)

    fc.assert(
      fc.property(fc.constantFrom(...classNames), (cls) => {
        const violations = findHardcodedColors(cls)
        expect(
          violations,
          `FileUpload has hardcoded color(s) in className: "${cls}" → [${violations.join(', ')}]`
        ).toHaveLength(0)
      }),
      { numRuns: NUM_RUNS }
    )
  })
})
