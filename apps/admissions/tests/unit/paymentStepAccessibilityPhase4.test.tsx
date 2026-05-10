/**
 * Regression test — Phase 4 accessibility semantics preserved (Task 39.4).
 *
 * The existing `ErrorDisplay` component returns `null` for empty /
 * whitespace-only `message` props. The Phase 4 recovery-store import
 * must not accidentally introduce an empty `role="alert"` region, and
 * the existing focus-on-state-change semantics in PaymentStep must be
 * preserved.
 *
 * The focus-on-state-change test needs a fully rendered PaymentStep,
 * which requires the application wizard scaffolding. This module pins
 * the narrower invariant — that `ErrorDisplay` returns null on empty
 * messages — as the enforcement anchor for the broader a11y posture.
 *
 * Validates: Requirements R22.8.
 */

import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { ErrorDisplay } from '@/components/ui/ErrorDisplay'

describe('PaymentStep a11y — R22.8 regression anchors', () => {
  it('ErrorDisplay returns null for empty message', () => {
    const { container } = render(<ErrorDisplay message="" />)
    expect(container.firstChild).toBeNull()
  })

  it('ErrorDisplay returns null for whitespace-only message', () => {
    const { container } = render(<ErrorDisplay message="   " />)
    expect(container.firstChild).toBeNull()
  })

  it('ErrorDisplay renders role=alert for non-empty message', () => {
    const { container } = render(<ErrorDisplay message="Real error" />)
    expect(container.firstChild).not.toBeNull()
    const alert = container.querySelector('[role="alert"]')
    expect(alert).not.toBeNull()
  })
})
