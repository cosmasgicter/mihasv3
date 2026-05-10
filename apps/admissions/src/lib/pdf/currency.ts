/**
 * Currency formatting — PDF documents and any other consumer that needs
 * a stable, locale-correct money string.
 *
 * Rationale for using Intl.NumberFormat over `toFixed(2)`:
 *   - `Number.prototype.toFixed` rounds via the host's JS engine, which
 *     uses IEEE-754 banker's rounding on some platforms and half-away-
 *     from-zero on others. For amounts drawn on receipts that function
 *     as financial records, that inconsistency matters.
 *   - Intl.NumberFormat rounds deterministically and respects the
 *     currency's fraction-digit rules (ZMW and USD both default to 2).
 *   - The output also inserts locale-appropriate grouping separators
 *     for free, which helps readability on larger amounts like K10,500.
 *
 * We intentionally render the currency symbol ourselves rather than
 * relying on the formatter's built-in symbol — `Intl` renders "USD"
 * not "$" when `currencyDisplay: 'code'`, and the symbol output depends
 * on the chosen locale in ways that aren't portable. Returning a
 * plain number string and composing the symbol separately keeps the
 * hero card layout predictable.
 */

export type SupportedCurrency = 'ZMW' | 'USD'

const NUMBER_FORMATTERS: Record<SupportedCurrency, Intl.NumberFormat> = {
  ZMW: new Intl.NumberFormat('en-ZM', {
    style: 'currency',
    currency: 'ZMW',
    currencyDisplay: 'code',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }),
  USD: new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    currencyDisplay: 'code',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }),
}

const CURRENCY_SYMBOLS: Record<SupportedCurrency, string> = {
  ZMW: 'K',
  USD: '$',
}

export interface FormattedAmount {
  /** The numeric part only, with 2 decimals and grouping separators — e.g. "1,500.00". */
  numeric: string
  /** Currency symbol — "K" or "$". */
  symbol: string
  /** Currency code — "ZMW" or "USD". */
  code: SupportedCurrency
  /** Full display string — "K1,500.00". */
  display: string
  /** Full display string with code suffix — "K1,500.00 ZMW". */
  displayWithCode: string
}

/**
 * Format a numeric amount as a currency object. Never throws for finite
 * numbers. For non-finite inputs (NaN, Infinity) returns a placeholder
 * so rendering never fails on bad data.
 */
export function formatAmount(
  amount: number,
  currency: SupportedCurrency = 'ZMW',
): FormattedAmount {
  const symbol = CURRENCY_SYMBOLS[currency]
  const code = currency

  if (!Number.isFinite(amount)) {
    return {
      numeric: '0.00',
      symbol,
      code,
      display: `${symbol}0.00`,
      displayWithCode: `${symbol}0.00 ${code}`,
    }
  }

  // Intl.NumberFormat with currencyDisplay:'code' returns e.g. "ZMW 1,500.00"
  // for ZMW and "-ZMW 50.00" for negatives. We strip the code, then collapse
  // any whitespace gaps that were left around the sign.
  const formatter = NUMBER_FORMATTERS[currency]
  const raw = formatter.format(amount)
  const numeric = raw.replace(code, '').replace(/\s+/g, '').trim()

  return {
    numeric,
    symbol,
    code,
    display: `${symbol}${numeric}`,
    displayWithCode: `${symbol}${numeric} ${code}`,
  }
}
