/**
 * Unit tests — currency formatter.
 *
 * Ensures Intl.NumberFormat output is stable across the engines we care
 * about (Node + Bun) and handles the defensive cases (NaN, Infinity,
 * non-round amounts, large amounts).
 */

import { describe, expect, it } from 'vitest'

import { formatAmount } from '@/lib/pdf/currency'

describe('formatAmount', () => {
  it('formats round ZMW amounts with two decimals', () => {
    const out = formatAmount(150, 'ZMW')
    expect(out.numeric).toBe('150.00')
    expect(out.symbol).toBe('K')
    expect(out.code).toBe('ZMW')
    expect(out.display).toBe('K150.00')
    expect(out.displayWithCode).toBe('K150.00 ZMW')
  })

  it('formats round USD amounts with the dollar symbol', () => {
    const out = formatAmount(20, 'USD')
    expect(out.display).toBe('$20.00')
    expect(out.displayWithCode).toBe('$20.00 USD')
  })

  it('defaults to ZMW when currency is omitted', () => {
    expect(formatAmount(99).code).toBe('ZMW')
  })

  it('inserts grouping separators for amounts >= 1000', () => {
    expect(formatAmount(1500, 'ZMW').numeric).toBe('1,500.00')
    expect(formatAmount(1234567.89, 'ZMW').numeric).toBe('1,234,567.89')
  })

  it('rounds half-cent values deterministically (banker avoidance)', () => {
    // Classic float edge: 0.1 + 0.2 = 0.30000000000000004
    // toFixed(2) produces "0.30" — but earlier bugs with non-decimal values
    // produced drift. Intl.NumberFormat is the safe anchor.
    const out = formatAmount(0.1 + 0.2, 'ZMW')
    expect(out.numeric).toBe('0.30')
  })

  it('rounds to exactly two decimals for pathological inputs', () => {
    expect(formatAmount(150.005, 'ZMW').numeric).toMatch(/^150\.00|150\.01$/)
    // Whatever the rounding direction, we get 2 decimals. That's the
    // guarantee we need — no trailing long fractional tails.
    expect(formatAmount(99.999999, 'USD').numeric).toBe('100.00')
  })

  it('returns a placeholder for NaN/Infinity without throwing', () => {
    expect(formatAmount(Number.NaN, 'ZMW').numeric).toBe('0.00')
    expect(formatAmount(Number.POSITIVE_INFINITY, 'USD').numeric).toBe('0.00')
    expect(formatAmount(Number.NEGATIVE_INFINITY, 'ZMW').display).toBe('K0.00')
  })

  it('handles negative amounts (refund scenario) gracefully', () => {
    const out = formatAmount(-50, 'ZMW')
    // Intl.NumberFormat negative output starts with minus; we don't
    // strip it because negative amounts are a legitimate real case.
    expect(out.numeric).toMatch(/^-?50\.00$/)
  })

  it('zero renders as "K0.00" not ""', () => {
    expect(formatAmount(0, 'ZMW').display).toBe('K0.00')
  })
})
