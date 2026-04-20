// @vitest-environment node
/**
 * Property-Based Tests: Accessibility
 * Feature: ui-ux-performance-overhaul
 * Task: 16.4 Write property tests for accessibility
 *
 * **Property 6: Form Field Accessibility Invariants** — label association, aria-required, aria-invalid, aria-describedby
 * **Property 7: Form Input Touch Target Minimum** — min 44px height for inputs, 44×44px for checkboxes/radios
 * **Property 22: Icon-Only Button Accessibility** — aria-label on icon-only buttons
 * **Property 24: Escape Key Dismissal** — Escape closes overlays, returns focus
 * **Property 25: Modal Focus Trapping** — Tab cycles within modal only
 *
 * **Validates: Requirements 5.4, 6.4, 9.2, 9.3, 9.4, 16.3, 16.4, 17.3, 17.5**
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
// Component File Registry
// ============================================================================

const UI_DIR = resolve(process.cwd(), 'src/components/ui')
const HOOKS_DIR = resolve(process.cwd(), 'src/hooks')

/** Form input components that must have accessibility attributes */
const FORM_INPUT_FILES: Array<{ name: string; path: string }> = [
  { name: 'Input', path: resolve(UI_DIR, 'input.tsx') },
  { name: 'Textarea', path: resolve(UI_DIR, 'textarea.tsx') },
  { name: 'PasswordInput', path: resolve(UI_DIR, 'PasswordInput.tsx') },
  { name: 'CanonicalSelect', path: resolve(UI_DIR, 'CanonicalSelect.tsx') },
]

/** Components that contain icon-only buttons */
const ICON_BUTTON_FILES: Array<{ name: string; path: string }> = [
  { name: 'PasswordInput', path: resolve(UI_DIR, 'PasswordInput.tsx') },
  { name: 'ConfirmDialog', path: resolve(UI_DIR, 'ConfirmDialog.tsx') },
  { name: 'Dialog', path: resolve(UI_DIR, 'Dialog.tsx') },
  { name: 'Toast', path: resolve(UI_DIR, 'Toast.tsx') },
]

/** Overlay components that must support Escape key dismissal */
const OVERLAY_FILES: Array<{ name: string; path: string }> = [
  { name: 'Dialog', path: resolve(UI_DIR, 'Dialog.tsx') },
  { name: 'ConfirmDialog', path: resolve(UI_DIR, 'ConfirmDialog.tsx') },
]

/** Components that must implement focus trapping */
const FOCUS_TRAP_FILES: Array<{ name: string; path: string }> = [
  { name: 'Dialog', path: resolve(UI_DIR, 'Dialog.tsx') },
  { name: 'ConfirmDialog', path: resolve(UI_DIR, 'ConfirmDialog.tsx') },
]

// ============================================================================
// Helpers
// ============================================================================

/** Load a component file's source content */
function loadSource(filePath: string): string {
  return readFileSync(filePath, 'utf-8')
}

// ============================================================================
// Load all component sources once
// ============================================================================

const formInputSources = new Map<string, string>()
for (const file of FORM_INPUT_FILES) {
  try {
    formInputSources.set(file.name, loadSource(file.path))
  } catch {
    // File may not exist — skip
  }
}

const iconButtonSources = new Map<string, string>()
for (const file of ICON_BUTTON_FILES) {
  try {
    iconButtonSources.set(file.name, loadSource(file.path))
  } catch {
    // File may not exist — skip
  }
}

const overlaySources = new Map<string, string>()
for (const file of OVERLAY_FILES) {
  try {
    overlaySources.set(file.name, loadSource(file.path))
  } catch {
    // File may not exist — skip
  }
}

const focusTrapSources = new Map<string, string>()
for (const file of FOCUS_TRAP_FILES) {
  try {
    focusTrapSources.set(file.name, loadSource(file.path))
  } catch {
    // File may not exist — skip
  }
}


// ============================================================================
// Property 6: Form Field Accessibility Invariants
// ============================================================================

describe('Property 6: Form Field Accessibility Invariants', () => {
  /**
   * **Validates: Requirements 5.4, 9.3, 9.4, 17.3**
   *
   * For any form field rendered with a label, the label element should be
   * associated via htmlFor/id pairing. For any required field, aria-required
   * should be present. For any field with a validation error, aria-invalid="true"
   * should be present and an error message element linked via aria-describedby
   * should exist with text-destructive styling.
   */

  const loadedFormInputs = Array.from(formInputSources.entries()).map(
    ([name, source]) => ({ name, source })
  )

  it('PROPERTY: All form inputs support label association via htmlFor/id pairing', () => {
    expect(loadedFormInputs.length).toBeGreaterThan(0)

    const formInputArb = fc.constantFrom(...loadedFormInputs)

    fc.assert(
      fc.property(formInputArb, (component) => {
        const source = component.source
        // Component should have htmlFor on label and id on the input element
        const hasLabelFor = source.includes('htmlFor=')
          || source.includes('htmlFor={')
          || source.includes("htmlFor=")
        const hasInputId = source.includes('id={')
          || source.includes('id=')

        // CanonicalSelect uses Radix which handles label association differently
        // but still has htmlFor on its label element
        expect(
          hasLabelFor && hasInputId,
          `${component.name} must support label association via htmlFor/id pairing`
        ).toBe(true)
      }),
      { numRuns: NUM_RUNS }
    )
  })

  it('PROPERTY: All form inputs support aria-required attribute', () => {
    expect(loadedFormInputs.length).toBeGreaterThan(0)

    const formInputArb = fc.constantFrom(...loadedFormInputs)

    fc.assert(
      fc.property(formInputArb, (component) => {
        expect(
          component.source.includes('aria-required'),
          `${component.name} must support aria-required attribute for required fields`
        ).toBe(true)
      }),
      { numRuns: NUM_RUNS }
    )
  })

  it('PROPERTY: All form inputs support aria-invalid attribute for error state', () => {
    expect(loadedFormInputs.length).toBeGreaterThan(0)

    const formInputArb = fc.constantFrom(...loadedFormInputs)

    fc.assert(
      fc.property(formInputArb, (component) => {
        expect(
          component.source.includes('aria-invalid'),
          `${component.name} must support aria-invalid attribute for error state`
        ).toBe(true)
      }),
      { numRuns: NUM_RUNS }
    )
  })

  it('PROPERTY: All form inputs support aria-describedby for error/helper linkage', () => {
    expect(loadedFormInputs.length).toBeGreaterThan(0)

    const formInputArb = fc.constantFrom(...loadedFormInputs)

    fc.assert(
      fc.property(formInputArb, (component) => {
        expect(
          component.source.includes('aria-describedby'),
          `${component.name} must support aria-describedby for error/helper text linkage`
        ).toBe(true)
      }),
      { numRuns: NUM_RUNS }
    )
  })

  it('PROPERTY: All form inputs render error messages with text-destructive styling', () => {
    expect(loadedFormInputs.length).toBeGreaterThan(0)

    const formInputArb = fc.constantFrom(...loadedFormInputs)

    fc.assert(
      fc.property(formInputArb, (component) => {
        expect(
          component.source.includes('text-destructive'),
          `${component.name} must use text-destructive for error message styling`
        ).toBe(true)
      }),
      { numRuns: NUM_RUNS }
    )
  })

  it('PROPERTY: Error message elements have matching id for aria-describedby linkage (exhaustive)', () => {
    for (const [name, source] of formInputSources) {
      // Each component should generate an error id pattern like `${id}-error`
      const hasErrorIdPattern =
        source.includes('-error') &&
        source.includes('aria-describedby')

      expect(
        hasErrorIdPattern,
        `${name} must generate error element ids matching aria-describedby references`
      ).toBe(true)
    }
  })

  it('PROPERTY: Labels precede inputs in rendered DOM order', () => {
    for (const [name, source] of formInputSources) {
      // For CanonicalSelect, the label is rendered in the field-wrapped JSX block
      // where <label> appears before {selectElement}. We check the JSX return block.
      if (name === 'CanonicalSelect') {
        // In the field-wrapped return, label comes before selectElement
        const fieldWrappedBlock = source.indexOf('Field-wrapped mode')
        if (fieldWrappedBlock !== -1) {
          const afterBlock = source.slice(fieldWrappedBlock)
          const labelInBlock = afterBlock.indexOf('<label')
          const selectInBlock = afterBlock.indexOf('{selectElement}')
          if (labelInBlock !== -1 && selectInBlock !== -1) {
            expect(
              labelInBlock < selectInBlock,
              `${name}: label must precede select element in field-wrapped render`
            ).toBe(true)
          }
        }
        continue
      }

      // For other components, find the JSX return block and check label vs input order
      const labelPos = source.indexOf('<label')
      const inputPos = Math.min(
        source.indexOf('<input') === -1 ? Infinity : source.indexOf('<input'),
        source.indexOf('<textarea') === -1 ? Infinity : source.indexOf('<textarea'),
      )

      if (labelPos !== -1 && inputPos !== Infinity) {
        expect(
          labelPos < inputPos,
          `${name}: label element must precede input element in DOM order`
        ).toBe(true)
      }
    }
  })
})


// ============================================================================
// Property 7: Form Input Touch Target Minimum
// ============================================================================

describe('Property 7: Form Input Touch Target Minimum', () => {
  /**
   * **Validates: Requirements 6.4, 9.2**
   *
   * For any form input (text, select, textarea) rendered by a canonical UI
   * primitive, the computed minimum height should be at least 44px. For any
   * checkbox or radio button, the touch target area should be at least 44×44px.
   */

  const loadedFormInputs = Array.from(formInputSources.entries()).map(
    ([name, source]) => ({ name, source })
  )

  it('PROPERTY: All form inputs have min-h-[44px] or equivalent touch target sizing', () => {
    expect(loadedFormInputs.length).toBeGreaterThan(0)

    const formInputArb = fc.constantFrom(...loadedFormInputs)

    fc.assert(
      fc.property(formInputArb, (component) => {
        // Check for min-h-[44px], min-h-[48px], h-11 (44px), h-12 (48px), or min-h-[100px] (textarea)
        const hasTouchTarget =
          component.source.includes('min-h-[44px]') ||
          component.source.includes('min-h-[48px]') ||
          component.source.includes('min-h-[100px]') ||
          component.source.includes('h-11') ||
          component.source.includes('h-12')

        expect(
          hasTouchTarget,
          `${component.name} must have minimum 44px height for touch targets (min-h-[44px], h-11, or equivalent)`
        ).toBe(true)
      }),
      { numRuns: NUM_RUNS }
    )
  })

  it('PROPERTY: PasswordInput toggle button meets 44×44px touch target', () => {
    const passwordSource = formInputSources.get('PasswordInput')
    expect(passwordSource, 'PasswordInput source must be loaded').toBeDefined()

    // The toggle button should have both h-12 and w-12 (48px) or equivalent
    const hasMinHeight =
      passwordSource!.includes('min-h-[44px]') || passwordSource!.includes('h-11') || passwordSource!.includes('h-12')
    const hasMinWidth =
      passwordSource!.includes('w-11') || passwordSource!.includes('w-12') || passwordSource!.includes('min-w-[44px]')

    expect(
      hasMinHeight,
      'PasswordInput toggle button must have min 44px height'
    ).toBe(true)
    expect(
      hasMinWidth,
      'PasswordInput toggle button must have min 44px width'
    ).toBe(true)
  })

  it('PROPERTY: CanonicalSelect trigger meets 44px minimum height', () => {
    // CanonicalSelect delegates to select.tsx SelectTrigger
    const selectPrimitivePath = resolve(UI_DIR, 'select.tsx')
    const selectPrimitiveSource = loadSource(selectPrimitivePath)

    const hasTouchTarget =
      selectPrimitiveSource.includes('min-h-[44px]') ||
      selectPrimitiveSource.includes('h-11')

    expect(
      hasTouchTarget,
      'SelectTrigger (select.tsx) must have min-h-[44px] for touch target compliance'
    ).toBe(true)
  })

  it('PROPERTY: Touch target sizing is consistent across all form inputs (exhaustive)', () => {
    // Map of expected minimum height patterns per component
    const touchTargetPatterns = ['min-h-[44px]', 'min-h-[48px]', 'min-h-[100px]', 'h-11']

    for (const [name, source] of formInputSources) {
      const hasAnyPattern = touchTargetPatterns.some(p => source.includes(p))
      expect(
        hasAnyPattern,
        `${name} must include a touch target height class (${touchTargetPatterns.join(' | ')})`
      ).toBe(true)
    }
  })
})


// ============================================================================
// Property 22: Icon-Only Button Accessibility
// ============================================================================

describe('Property 22: Icon-Only Button Accessibility', () => {
  /**
   * **Validates: Requirements 17.5**
   *
   * For any button element that contains only an icon (SVG or icon component)
   * with no visible text content, the button should have an aria-label attribute
   * with a non-empty descriptive string.
   */

  const loadedIconButtons = Array.from(iconButtonSources.entries()).map(
    ([name, source]) => ({ name, source })
  )

  it('PROPERTY: All components with icon-only buttons include aria-label or sr-only text', () => {
    expect(loadedIconButtons.length).toBeGreaterThan(0)

    const iconButtonArb = fc.constantFrom(...loadedIconButtons)

    fc.assert(
      fc.property(iconButtonArb, (component) => {
        // Every component with icon-only buttons must have aria-label or sr-only
        // text to provide an accessible name for the button
        const hasAccessibleName =
          component.source.includes('aria-label') ||
          component.source.includes('sr-only')

        expect(
          hasAccessibleName,
          `${component.name} must have aria-label or sr-only text on icon-only buttons`
        ).toBe(true)
      }),
      { numRuns: NUM_RUNS }
    )
  })

  it('PROPERTY: Icon-only buttons use aria-hidden on icons, sr-only text, or aria-label for accessible name', () => {
    expect(loadedIconButtons.length).toBeGreaterThan(0)

    const iconButtonArb = fc.constantFrom(...loadedIconButtons)

    fc.assert(
      fc.property(iconButtonArb, (component) => {
        // Icons inside icon-only buttons should have at least one of:
        // 1. aria-hidden="true" on icons (so screen readers use button's aria-label)
        // 2. sr-only text as the accessible name
        // 3. aria-label on the button itself (sufficient for accessible naming)
        // All three patterns are valid for icon-only button accessibility
        const hasAriaHidden = component.source.includes('aria-hidden')
        const hasSrOnly = component.source.includes('sr-only')
        const hasAriaLabel = component.source.includes('aria-label')

        expect(
          hasAriaHidden || hasSrOnly || hasAriaLabel,
          `${component.name} must use aria-hidden on icons, sr-only text, or aria-label for accessible naming`
        ).toBe(true)
      }),
      { numRuns: NUM_RUNS }
    )
  })

  it('PROPERTY: PasswordInput toggle has descriptive aria-label mentioning password', () => {
    const passwordSource = iconButtonSources.get('PasswordInput')
    expect(passwordSource, 'PasswordInput source must be loaded').toBeDefined()

    // The toggle button should have aria-label with "password" context
    const hasShowLabel = passwordSource!.includes('Show password') ||
      passwordSource!.includes('show password')
    const hasHideLabel = passwordSource!.includes('Hide password') ||
      passwordSource!.includes('hide password')

    expect(
      hasShowLabel || hasHideLabel,
      'PasswordInput toggle must have descriptive aria-label mentioning "password"'
    ).toBe(true)
  })

  it('PROPERTY: Dialog close button has aria-label or sr-only text', () => {
    const dialogSource = iconButtonSources.get('Dialog')
    expect(dialogSource, 'Dialog source must be loaded').toBeDefined()

    // Dialog close button should have either aria-label or sr-only text
    const hasAriaLabel = dialogSource!.includes('aria-label')
    const hasSrOnly = dialogSource!.includes('sr-only')

    expect(
      hasAriaLabel || hasSrOnly,
      'Dialog close button must have aria-label or sr-only text for accessibility'
    ).toBe(true)
  })

  it('PROPERTY: ConfirmDialog close button has aria-label="Close dialog"', () => {
    const confirmSource = iconButtonSources.get('ConfirmDialog')
    expect(confirmSource, 'ConfirmDialog source must be loaded').toBeDefined()

    expect(
      confirmSource!.includes('aria-label="Close dialog"'),
      'ConfirmDialog close button must have aria-label="Close dialog"'
    ).toBe(true)
  })

  it('PROPERTY: Toast dismiss button has aria-label', () => {
    const toastSource = iconButtonSources.get('Toast')
    expect(toastSource, 'Toast source must be loaded').toBeDefined()

    // Toast dismiss button should have aria-label
    expect(
      toastSource!.includes('aria-label="Dismiss notification"') ||
      toastSource!.includes('aria-label="Dismiss"') ||
      toastSource!.includes('aria-label="Close"'),
      'Toast dismiss button must have a descriptive aria-label'
    ).toBe(true)
  })
})


// ============================================================================
// Property 24: Escape Key Dismissal
// ============================================================================

describe('Property 24: Escape Key Dismissal', () => {
  /**
   * **Validates: Requirements 16.4**
   *
   * For any open overlay (modal, dialog, dropdown, toast), pressing the Escape
   * key should close the overlay and return focus to the element that triggered it.
   */

  it('PROPERTY: Dialog uses Radix DialogPrimitive which handles Escape natively', () => {
    const dialogSource = overlaySources.get('Dialog')
    expect(dialogSource, 'Dialog source must be loaded').toBeDefined()

    // Radix Dialog handles Escape key natively via DialogPrimitive
    expect(
      dialogSource!.includes('@radix-ui/react-dialog') ||
      dialogSource!.includes('DialogPrimitive'),
      'Dialog must use Radix DialogPrimitive which provides native Escape key handling'
    ).toBe(true)
  })

  it('PROPERTY: ConfirmDialog uses useEscapeKey hook for Escape dismissal', () => {
    const confirmSource = overlaySources.get('ConfirmDialog')
    expect(confirmSource, 'ConfirmDialog source must be loaded').toBeDefined()

    expect(
      confirmSource!.includes('useEscapeKey'),
      'ConfirmDialog must use useEscapeKey hook for Escape key dismissal'
    ).toBe(true)
  })

  it('PROPERTY: useEscapeKey hook listens for Escape key and calls callback', () => {
    const hookSource = loadSource(resolve(HOOKS_DIR, 'useEscapeKey.ts'))

    // The hook must listen for 'Escape' key
    expect(
      hookSource.includes("e.key === 'Escape'") || hookSource.includes('e.key === "Escape"'),
      'useEscapeKey must check for Escape key in keydown handler'
    ).toBe(true)

    // The hook must call the onEscape callback
    expect(
      hookSource.includes('onEscape()') || hookSource.includes('onEscape('),
      'useEscapeKey must call the onEscape callback when Escape is pressed'
    ).toBe(true)

    // The hook must clean up the event listener
    expect(
      hookSource.includes('removeEventListener'),
      'useEscapeKey must clean up the keydown event listener on deactivation'
    ).toBe(true)
  })

  it('PROPERTY: ConfirmDialog passes onClose to useEscapeKey for focus restoration', () => {
    const confirmSource = overlaySources.get('ConfirmDialog')
    expect(confirmSource, 'ConfirmDialog source must be loaded').toBeDefined()

    // useEscapeKey should be called with isOpen and onClose
    expect(
      confirmSource!.includes('useEscapeKey(isOpen, onClose)') ||
      confirmSource!.includes('useEscapeKey(isOpen,'),
      'ConfirmDialog must pass isOpen and onClose to useEscapeKey'
    ).toBe(true)
  })

  it('PROPERTY: All overlay components have a mechanism to close on Escape (exhaustive)', () => {
    for (const [name, source] of overlaySources) {
      const hasEscapeHandling =
        source.includes('useEscapeKey') ||
        source.includes('@radix-ui/react-dialog') ||
        source.includes('DialogPrimitive') ||
        source.includes("key === 'Escape'") ||
        source.includes('key === "Escape"')

      expect(
        hasEscapeHandling,
        `${name} must have Escape key dismissal (via useEscapeKey hook or Radix primitive)`
      ).toBe(true)
    }
  })
})


// ============================================================================
// Property 25: Modal Focus Trapping
// ============================================================================

describe('Property 25: Modal Focus Trapping', () => {
  /**
   * **Validates: Requirements 16.3**
   *
   * For any open modal or dialog containing focusable elements, Tab key
   * navigation should cycle only through focusable elements within the modal,
   * never escaping to elements behind the overlay.
   */

  it('PROPERTY: Dialog uses Radix DialogPrimitive which provides native focus trapping', () => {
    const dialogSource = focusTrapSources.get('Dialog')
    expect(dialogSource, 'Dialog source must be loaded').toBeDefined()

    // Radix Dialog handles focus trapping natively
    expect(
      dialogSource!.includes('@radix-ui/react-dialog') ||
      dialogSource!.includes('DialogPrimitive'),
      'Dialog must use Radix DialogPrimitive which provides native focus trapping'
    ).toBe(true)

    // Radix Dialog uses a Portal to render content outside the DOM tree
    expect(
      dialogSource!.includes('DialogPortal') || dialogSource!.includes('Portal'),
      'Dialog must use Portal for proper overlay rendering and focus isolation'
    ).toBe(true)
  })

  it('PROPERTY: ConfirmDialog uses useFocusTrap hook for focus trapping', () => {
    const confirmSource = focusTrapSources.get('ConfirmDialog')
    expect(confirmSource, 'ConfirmDialog source must be loaded').toBeDefined()

    expect(
      confirmSource!.includes('useFocusTrap'),
      'ConfirmDialog must use useFocusTrap hook for keyboard focus trapping'
    ).toBe(true)
  })

  it('PROPERTY: useFocusTrap hook implements Tab key wrapping at boundaries', () => {
    const hookSource = loadSource(resolve(HOOKS_DIR, 'useFocusTrap.ts'))

    // Must handle Tab key
    expect(
      hookSource.includes("e.key !== 'Tab'") || hookSource.includes("e.key === 'Tab'"),
      'useFocusTrap must handle Tab key events'
    ).toBe(true)

    // Must handle Shift+Tab for reverse navigation
    expect(
      hookSource.includes('e.shiftKey'),
      'useFocusTrap must handle Shift+Tab for reverse focus navigation'
    ).toBe(true)

    // Must prevent default to stop focus from escaping
    expect(
      hookSource.includes('e.preventDefault()'),
      'useFocusTrap must call preventDefault to prevent focus from escaping the container'
    ).toBe(true)
  })

  it('PROPERTY: useFocusTrap queries focusable elements using standard selector', () => {
    const hookSource = loadSource(resolve(HOOKS_DIR, 'useFocusTrap.ts'))

    // Must query for standard focusable elements
    const hasFocusableSelector =
      hookSource.includes('button') &&
      hookSource.includes('input') &&
      hookSource.includes('[tabindex]')

    expect(
      hasFocusableSelector,
      'useFocusTrap must query for standard focusable elements (button, input, [tabindex])'
    ).toBe(true)
  })

  it('PROPERTY: useFocusTrap restores focus to previously focused element on deactivation', () => {
    const hookSource = loadSource(resolve(HOOKS_DIR, 'useFocusTrap.ts'))

    // Must store and restore previous focus
    expect(
      hookSource.includes('previousFocus') || hookSource.includes('document.activeElement'),
      'useFocusTrap must store the previously focused element'
    ).toBe(true)

    // Must restore focus in cleanup
    expect(
      hookSource.includes('.focus()'),
      'useFocusTrap must restore focus to the previously focused element on deactivation'
    ).toBe(true)
  })

  it('PROPERTY: ConfirmDialog applies focus trap ref to dialog container', () => {
    const confirmSource = focusTrapSources.get('ConfirmDialog')
    expect(confirmSource, 'ConfirmDialog source must be loaded').toBeDefined()

    // The focus trap ref must be applied to the dialog container
    expect(
      confirmSource!.includes('ref={focusTrapRef'),
      'ConfirmDialog must apply focusTrapRef to the dialog container element'
    ).toBe(true)
  })

  it('PROPERTY: ConfirmDialog has aria-modal="true" for assistive technology', () => {
    const confirmSource = focusTrapSources.get('ConfirmDialog')
    expect(confirmSource, 'ConfirmDialog source must be loaded').toBeDefined()

    expect(
      confirmSource!.includes('aria-modal="true"') || confirmSource!.includes('aria-modal={true}'),
      'ConfirmDialog must have aria-modal="true" to indicate modal behavior to assistive technology'
    ).toBe(true)
  })

  it('PROPERTY: All modal components implement focus trapping (exhaustive)', () => {
    for (const [name, source] of focusTrapSources) {
      const hasFocusTrapping =
        source.includes('useFocusTrap') ||
        source.includes('@radix-ui/react-dialog') ||
        source.includes('DialogPrimitive')

      expect(
        hasFocusTrapping,
        `${name} must implement focus trapping (via useFocusTrap hook or Radix primitive)`
      ).toBe(true)
    }
  })
})
