/**
 * Unit tests — derivePaymentUiState() UI state matrix (Task 34.2).
 *
 * Exhaustive coverage of the design's "Frontend UI State Matrix" table.
 * Every row pins one (backendStatus, inflight, stableCode,
 * pollingExceededTimeout) tuple to a PaymentUiState.
 *
 * Validates: Requirements R14.1, R14.3, R14.6, R14.7.
 */

import { describe, expect, it } from 'vitest'

import {
  derivePaymentUiState,
  type DerivePaymentUiStateInput,
  type PaymentUiState,
} from '@/lib/paymentStatus'

interface Row {
  name: string
  input: DerivePaymentUiStateInput
  expected: PaymentUiState
}

const ROWS: Row[] = [
  // --- Terminal confirmed short-circuits ---
  {
    name: 'successful → confirmed',
    input: {
      backendStatus: 'successful',
      inflight: false,
      stableCode: null,
      pollingExceededTimeout: false,
    },
    expected: 'confirmed',
  },
  {
    name: 'force_approved → confirmed',
    input: {
      backendStatus: 'force_approved',
      inflight: false,
      stableCode: null,
      pollingExceededTimeout: false,
    },
    expected: 'confirmed',
  },
  // Even during polling timeout, a successful row is confirmed.
  {
    name: 'successful + polling timeout → confirmed',
    input: {
      backendStatus: 'successful',
      inflight: false,
      stableCode: null,
      pollingExceededTimeout: true,
    },
    expected: 'confirmed',
  },

  // --- Stable code overrides ---
  {
    name: 'ALREADY_PAID → already_paid',
    input: {
      backendStatus: null,
      inflight: false,
      stableCode: 'ALREADY_PAID',
      pollingExceededTimeout: false,
    },
    expected: 'already_paid',
  },
  {
    name: 'MAX_PAYMENT_ATTEMPTS_EXCEEDED → max_attempts_reached',
    input: {
      backendStatus: null,
      inflight: false,
      stableCode: 'MAX_PAYMENT_ATTEMPTS_EXCEEDED',
      pollingExceededTimeout: false,
    },
    expected: 'max_attempts_reached',
  },
  {
    name: 'PAYMENT_SENSITIVE_FIELDS_LOCKED → sensitive_fields_locked',
    input: {
      backendStatus: null,
      inflight: false,
      stableCode: 'PAYMENT_SENSITIVE_FIELDS_LOCKED',
      pollingExceededTimeout: false,
    },
    expected: 'sensitive_fields_locked',
  },
  {
    name: 'RATE_LIMITED → rate_limited',
    input: {
      backendStatus: null,
      inflight: false,
      stableCode: 'RATE_LIMITED',
      pollingExceededTimeout: false,
    },
    expected: 'rate_limited',
  },
  {
    name: 'PROVIDER_UNAVAILABLE + pending → retry_with_different_number',
    input: {
      backendStatus: 'pending',
      inflight: false,
      stableCode: 'PROVIDER_UNAVAILABLE',
      pollingExceededTimeout: false,
    },
    expected: 'retry_with_different_number',
  },
  {
    name: 'PROVIDER_UNAVAILABLE + expired → unavailable',
    input: {
      backendStatus: 'expired',
      inflight: false,
      stableCode: 'PROVIDER_UNAVAILABLE',
      pollingExceededTimeout: false,
    },
    expected: 'unavailable',
  },
  {
    name: 'PAYMENT_UNAVAILABLE + null status → retry_with_different_number',
    input: {
      backendStatus: null,
      inflight: false,
      stableCode: 'PAYMENT_UNAVAILABLE',
      pollingExceededTimeout: false,
    },
    expected: 'retry_with_different_number',
  },
  {
    name: 'AMOUNT_MISMATCH → needs_admin_followup',
    input: {
      backendStatus: 'pending',
      inflight: false,
      stableCode: 'AMOUNT_MISMATCH',
      pollingExceededTimeout: false,
    },
    expected: 'needs_admin_followup',
  },
  {
    name: 'CURRENCY_MISMATCH → needs_admin_followup',
    input: {
      backendStatus: 'pending',
      inflight: false,
      stableCode: 'CURRENCY_MISMATCH',
      pollingExceededTimeout: false,
    },
    expected: 'needs_admin_followup',
  },
  {
    name: 'MISSING_PROVIDER_REFERENCE → needs_admin_followup',
    input: {
      backendStatus: 'pending',
      inflight: false,
      stableCode: 'MISSING_PROVIDER_REFERENCE',
      pollingExceededTimeout: false,
    },
    expected: 'needs_admin_followup',
  },

  // --- Polling timeout vs. pending (R14.3) ---
  {
    name: 'pending + polling timeout → still_confirming (never failed)',
    input: {
      backendStatus: 'pending',
      inflight: false,
      stableCode: null,
      pollingExceededTimeout: true,
    },
    expected: 'still_confirming',
  },

  // --- Inflight ---
  {
    name: 'inflight + null status → initiating',
    input: {
      backendStatus: null,
      inflight: true,
      stableCode: null,
      pollingExceededTimeout: false,
    },
    expected: 'initiating',
  },

  // --- Raw status mapping ---
  {
    name: 'pending + idle → awaiting_provider',
    input: {
      backendStatus: 'pending',
      inflight: false,
      stableCode: null,
      pollingExceededTimeout: false,
    },
    expected: 'awaiting_provider',
  },
  {
    name: 'expired + idle → expired',
    input: {
      backendStatus: 'expired',
      inflight: false,
      stableCode: null,
      pollingExceededTimeout: false,
    },
    expected: 'expired',
  },
  {
    name: 'failed + idle → retry_with_different_number',
    input: {
      backendStatus: 'failed',
      inflight: false,
      stableCode: null,
      pollingExceededTimeout: false,
    },
    expected: 'retry_with_different_number',
  },
  {
    name: 'deferred + idle → idle (student chose pay-later)',
    input: {
      backendStatus: 'deferred',
      inflight: false,
      stableCode: null,
      pollingExceededTimeout: false,
    },
    expected: 'idle',
  },

  // --- Default ---
  {
    name: 'null status + nothing else → idle',
    input: {
      backendStatus: null,
      inflight: false,
      stableCode: null,
      pollingExceededTimeout: false,
    },
    expected: 'idle',
  },
]

describe('derivePaymentUiState — exhaustive matrix', () => {
  for (const row of ROWS) {
    it(row.name, () => {
      expect(derivePaymentUiState(row.input)).toBe(row.expected)
    })
  }

  it('is pure — same input yields same output', () => {
    const input: DerivePaymentUiStateInput = {
      backendStatus: 'pending',
      inflight: false,
      stableCode: 'PROVIDER_UNAVAILABLE',
      pollingExceededTimeout: false,
    }
    const a = derivePaymentUiState(input)
    const b = derivePaymentUiState(input)
    expect(a).toBe(b)
  })
})
