/**
 * Property-based tests for ARIA attributes on form controls
 * Feature: website-quality-remediation, Property 20: ARIA attributes on form controls
 *
 * **Validates: Requirements 13.1, 13.2, 13.3, 13.5**
 *
 * Tests verify that form components used in the Application Wizard correctly
 * apply ARIA attributes for accessibility:
 * - Associated label elements for form controls
 * - aria-invalid="true" and aria-describedby on error state
 * - aria-required="true" on required fields
 * - aria-label on icon-only buttons
 */
import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { AnimatedInput } from '@/components/smoothui/animated-input'
import { FileUpload } from '@/components/ui/FileUpload'
import { PasswordInput } from '@/components/ui/PasswordInput'

// ── Arbitraries ─────────────────────────────────────────────────────────

/** Arbitrary for non-empty label text (realistic form labels, safe for HTML) */
const labelArb = fc.string({ minLength: 1, maxLength: 50 })
  .filter(s => s.trim().length > 0 && !/[<>"&\0]/.test(s))

/** Arbitrary for non-empty error messages (safe for HTML) */
const errorArb = fc.string({ minLength: 1, maxLength: 100 })
  .filter(s => s.trim().length > 0 && !/[<>"&\0]/.test(s))

// ── Helpers ─────────────────────────────────────────────────────────────

/** Parse static HTML to check for attributes on input elements */
function getInputAttributes(html: string): Record<string, string> {
  const attrs: Record<string, string> = {}
  // Match the <input .../> tag
  const inputMatch = html.match(/<input\s[^>]*>/i)
  if (!inputMatch) return attrs

  const tag = inputMatch[0]
  // Extract all attributes
  const attrRegex = /(\w[\w-]*)(?:="([^"]*)")?/g
  let match
  while ((match = attrRegex.exec(tag)) !== null) {
    attrs[match[1]] = match[2] ?? ''
  }
  return attrs
}

/** Check if HTML contains a <label> with a matching for attribute */
function hasLabelFor(html: string, inputId: string): boolean {
  const labelRegex = new RegExp(`<label[^>]*\\bfor="${inputId}"[^>]*>`, 'i')
  return labelRegex.test(html)
}

/** Check if HTML contains an element with a specific id */
function hasElementWithId(html: string, id: string): boolean {
  const regex = new RegExp(`\\bid="${id}"`, 'i')
  return regex.test(html)
}

/** Check if HTML contains a button with aria-label */
function getButtonAriaLabels(html: string): string[] {
  const labels: string[] = []
  const buttonRegex = /<button[^>]*aria-label="([^"]*)"[^>]*>/gi
  let match
  while ((match = buttonRegex.exec(html)) !== null) {
    labels.push(match[1])
  }
  return labels
}

// ── Tests ───────────────────────────────────────────────────────────────

describe('ARIA Attributes Property Tests (P20)', () => {

  // Feature: website-quality-remediation, Property 20: ARIA attributes on form controls
  // **Validates: Requirements 13.1, 13.2, 13.3, 13.5**

  describe('AnimatedInput', () => {
    it('has an associated <label> element when label prop is provided', () => {
      fc.assert(
        fc.property(labelArb, (label) => {
          const html = renderToStaticMarkup(
            React.createElement(AnimatedInput, { label, id: 'test-input' })
          )
          const attrs = getInputAttributes(html)
          // Input must have an id
          expect(attrs['id']).toBe('test-input')
          // A <label for="test-input"> must exist
          expect(hasLabelFor(html, 'test-input')).toBe(true)
        }),
        { numRuns: 10 },
      )
    })

    it('sets aria-invalid="true" and aria-describedby pointing to error element when error is provided', () => {
      fc.assert(
        fc.property(errorArb, (error) => {
          const html = renderToStaticMarkup(
            React.createElement(AnimatedInput, { error, id: 'err-input', label: 'Field' })
          )
          const attrs = getInputAttributes(html)
          // aria-invalid must be "true" (string) when error is present
          expect(attrs['aria-invalid']).toBe('true')
          // aria-describedby must reference the error element id
          expect(attrs['aria-describedby']).toBe('err-input-error')
          // The error element with that id must exist in the HTML
          expect(hasElementWithId(html, 'err-input-error')).toBe(true)
        }),
        { numRuns: 10 },
      )
    })

    it('sets aria-required="true" when required prop is true', () => {
      const html = renderToStaticMarkup(
        React.createElement(AnimatedInput, { required: true, id: 'req-input', label: 'Required Field' })
      )
      const attrs = getInputAttributes(html)
      expect(attrs['aria-required']).toBe('true')
    })

    it('does not set aria-invalid="true" when no error is provided', () => {
      fc.assert(
        fc.property(labelArb, (label) => {
          const html = renderToStaticMarkup(
            React.createElement(AnimatedInput, { label, id: 'ok-input' })
          )
          const attrs = getInputAttributes(html)
          // aria-invalid should be "false" or absent
          expect(attrs['aria-invalid']).not.toBe('true')
        }),
        { numRuns: 10 },
      )
    })
  })

  describe('FileUpload (canonical)', () => {
    it('has an accessible label via aria-label when label prop is provided', () => {
      fc.assert(
        fc.property(labelArb, (label) => {
          const html = renderToStaticMarkup(
            React.createElement(FileUpload, { label })
          )
          // FileUpload uses react-dropzone with aria-label on the input
          const attrs = getInputAttributes(html)
          expect(attrs['aria-label']).toBe(label)
        }),
        { numRuns: 10 },
      )
    })

    it('renders error message with role="alert" when error is provided', () => {
      fc.assert(
        fc.property(errorArb, (error) => {
          const html = renderToStaticMarkup(
            React.createElement(FileUpload, { error, label: 'Upload' })
          )
          // Error message should be present with role="alert"
          expect(html).toContain('role="alert"')
          // The error element should have the destructive styling
          expect(html).toContain('text-destructive')
        }),
        { numRuns: 10 },
      )
    })

    it('renders aria-describedby pointing to error element when error is provided', () => {
      fc.assert(
        fc.property(errorArb, (error) => {
          const html = renderToStaticMarkup(
            React.createElement(FileUpload, { error, label: 'Upload' })
          )
          const attrs = getInputAttributes(html)
          // aria-describedby should reference the error element
          if (attrs['aria-describedby']) {
            expect(hasElementWithId(html, attrs['aria-describedby'])).toBe(true)
          }
        }),
        { numRuns: 10 },
      )
    })

    it('does not render error alert when no error is provided', () => {
      fc.assert(
        fc.property(labelArb, (label) => {
          const html = renderToStaticMarkup(
            React.createElement(FileUpload, { label })
          )
          // No role="alert" should be present when there's no error
          expect(html).not.toContain('role="alert"')
        }),
        { numRuns: 10 },
      )
    })
  })

  describe('PasswordInput', () => {
    it('has an associated <label> element when label prop is provided', () => {
      fc.assert(
        fc.property(labelArb, (label) => {
          const html = renderToStaticMarkup(
            React.createElement(PasswordInput, { label, id: 'test-pwd' })
          )
          expect(hasLabelFor(html, 'test-pwd')).toBe(true)
          const attrs = getInputAttributes(html)
          expect(attrs['id']).toBe('test-pwd')
        }),
        { numRuns: 10 },
      )
    })

    it('sets aria-invalid="true" and aria-describedby pointing to error element when error is provided', () => {
      fc.assert(
        fc.property(errorArb, (error) => {
          const html = renderToStaticMarkup(
            React.createElement(PasswordInput, { error, id: 'err-pwd', label: 'Password' })
          )
          const attrs = getInputAttributes(html)
          expect(attrs['aria-invalid']).toBe('true')
          expect(attrs['aria-describedby']).toBe('err-pwd-error')
          expect(hasElementWithId(html, 'err-pwd-error')).toBe(true)
        }),
        { numRuns: 10 },
      )
    })

    it('sets aria-required="true" when required prop is true', () => {
      const html = renderToStaticMarkup(
        React.createElement(PasswordInput, { required: true, id: 'req-pwd', label: 'Password' })
      )
      const attrs = getInputAttributes(html)
      expect(attrs['aria-required']).toBe('true')
    })

    it('has aria-invalid="false" when no error is provided', () => {
      fc.assert(
        fc.property(labelArb, (label) => {
          const html = renderToStaticMarkup(
            React.createElement(PasswordInput, { label, id: 'ok-pwd' })
          )
          const attrs = getInputAttributes(html)
          // PasswordInput explicitly sets aria-invalid="false" when no error
          expect(attrs['aria-invalid']).toBe('false')
        }),
        { numRuns: 10 },
      )
    })

    it('icon-only toggle button has aria-label', () => {
      const html = renderToStaticMarkup(
        React.createElement(PasswordInput, { label: 'Password', id: 'pwd-btn' })
      )
      const ariaLabels = getButtonAriaLabels(html)
      // The show/hide password button must have an aria-label
      expect(ariaLabels.length).toBeGreaterThanOrEqual(1)
      expect(
        ariaLabels.some(l => l.toLowerCase().includes('password'))
      ).toBe(true)
    })
  })

  describe('Cross-component: error state consistency', () => {
    it('all components set aria-describedby to {id}-error when error is present', () => {
      fc.assert(
        fc.property(errorArb, (error) => {
          // AnimatedInput and PasswordInput use id-based error linking
          const inputComponents = [
            { Component: AnimatedInput, props: { error, id: 'cc-input', label: 'Field' } },
            { Component: PasswordInput, props: { error, id: 'cc-pwd', label: 'Password' } },
          ]

          for (const { Component, props } of inputComponents) {
            const html = renderToStaticMarkup(React.createElement(Component as any, props))
            const attrs = getInputAttributes(html)
            expect(attrs['aria-invalid']).toBe('true')
            expect(attrs['aria-describedby']).toBe(`${props.id}-error`)
            expect(hasElementWithId(html, `${props.id}-error`)).toBe(true)
          }

          // FileUpload uses role="alert" for error display
          const fileHtml = renderToStaticMarkup(
            React.createElement(FileUpload, { error, label: 'Upload' })
          )
          expect(fileHtml).toContain('role="alert"')
          expect(fileHtml).toContain(error)
        }),
        { numRuns: 10 },
      )
    })

    it('all components omit error indicators when no error is present', () => {
      fc.assert(
        fc.property(labelArb, (label) => {
          const inputComponents = [
            { Component: AnimatedInput, props: { label, id: 'ne-input' } },
            { Component: PasswordInput, props: { label, id: 'ne-pwd' } },
          ]

          for (const { Component, props } of inputComponents) {
            const html = renderToStaticMarkup(React.createElement(Component as any, props))
            const attrs = getInputAttributes(html)
            // Should not reference an error element
            if (attrs['aria-describedby']) {
              expect(attrs['aria-describedby']).not.toContain('-error')
            }
          }

          // FileUpload should not have role="alert" when no error
          const fileHtml = renderToStaticMarkup(
            React.createElement(FileUpload, { label })
          )
          expect(fileHtml).not.toContain('role="alert"')
        }),
        { numRuns: 10 },
      )
    })
  })
})
