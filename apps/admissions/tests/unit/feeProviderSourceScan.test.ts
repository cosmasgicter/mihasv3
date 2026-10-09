/**
 * Executable source scan — no frontend fee arithmetic, no invented amounts, no
 * client-side provider guessing.
 *
 * Spec:         `.kiro/specs/admissions-v2-canonical-rebuild/` task 8.1
 *               ("Implement expiring server-authored fee quotes"). This file is the
 *               second half of that task's `_Evidence:` line — "quote contract
 *               tests **and source scan for fee/provider hardcodes**" — and the
 *               closure artifact for finding STU-08.
 * Requirements: R12.1 (the frontend performs no amount arithmetic),
 *               R12.2 (no hardcoded substitute when a fee is not configured),
 *               R12.6 (the UI shows server amounts, expiry, and a recovery action).
 * Findings:     STU-08 (payment UI hardcoded a 1% transaction fee and a K150/USD 20
 *               empty state), DATA-05 (fee lookup used display names + a default).
 * Design:       §10.1 (fee quote), §10.2 ("provider phone/network routing is
 *               server-authored").
 *
 * Why a scan and not only behaviour tests: the deletions in this slice are all
 * *absences*. A rendering test proves the right number appears today; it cannot
 * prove that nobody re-adds `amount * 1.01` next to it, or drops a `K150` default
 * into a new empty state. Each rule below fails on the specific line that would
 * bring the finding back, and prints it — so the failure output is itself the scan
 * report.
 *
 * Scope: `apps/admissions/src`. Backend fee authority is proven by the task 8.1
 * quote contract suites (`backend/tests/unit/test_fee_quote_*_8_1.py`).
 */
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const ADMISSIONS_ROOT = path.resolve(__dirname, '../..')
const SRC = path.join(ADMISSIONS_ROOT, 'src')

/**
 * Generated code is excluded: `src/generated/api.d.ts` is emitted from the backend
 * OpenAPI schema, so it legitimately describes the server's own `operator` field
 * and fee endpoints. It declares types; it cannot compute or default money.
 */
const EXCLUDED_DIRS = new Set(['generated'])

interface SourceFile {
  /** Path relative to `apps/admissions`, for readable failure output. */
  rel: string
  contents: string
  lines: string[]
}

function collect(dir: string, acc: SourceFile[] = []): SourceFile[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (EXCLUDED_DIRS.has(entry.name)) continue
      collect(path.join(dir, entry.name), acc)
      continue
    }
    if (!/\.(ts|tsx)$/.test(entry.name)) continue
    const full = path.join(dir, entry.name)
    const contents = fs.readFileSync(full, 'utf-8')
    acc.push({
      rel: path.relative(ADMISSIONS_ROOT, full),
      contents,
      lines: contents.split('\n'),
    })
  }
  return acc
}

const FILES = collect(SRC)

/** Every match of `pattern`, reported as `path:line: <source line>`. */
function hits(pattern: RegExp, files: SourceFile[] = FILES): string[] {
  const found: string[] = []
  for (const file of files) {
    file.lines.forEach((line, index) => {
      // A rule about executable money must not fail on prose describing the fix.
      if (isCommentary(line)) return
      if (pattern.test(line)) {
        found.push(`${file.rel}:${index + 1}: ${line.trim()}`)
      }
      pattern.lastIndex = 0
    })
  }
  return found
}

/** Comment / JSDoc lines. The rules target code, not the documentation of it. */
function isCommentary(line: string): boolean {
  const trimmed = line.trim()
  return trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')
}

/**
 * Blank out string literals so a `data-testid="fee-quote-error"` or a
 * `className="text-sm"` cannot look like `fee - quote` arithmetic. Numeric and
 * percentage rules run on the raw line, so a computed template literal is still
 * caught by them.
 */
function withoutStringLiterals(files: SourceFile[]): SourceFile[] {
  return files.map((file) => ({
    ...file,
    lines: file.lines.map((line) => line.replace(/'[^']*'|"[^"]*"|`[^`]*`/g, '""')),
  }))
}

function only(rel: string): SourceFile[] {
  return FILES.filter((file) => file.rel === rel)
}

/** The surfaces where a student is shown or charged an application fee. */
const PAYMENT_SURFACES = [
  'src/pages/student/applicationWizard/steps/PaymentStep.tsx',
  'src/pages/student/applicationWizard/steps/AssignedSchoolStep.tsx',
  'src/pages/student/Payment.tsx',
  'src/components/student/PaymentForm.tsx',
  'src/components/student/FeeQuoteRefusal.tsx',
  'src/components/student/applicationStatus/PaymentStatusBlock.tsx',
  // Added by task 8.3: the post-submission recovery surface and its two pure
  // modules. A payment surface that is not in this list is not scanned, so the
  // list grows with the feature (task 8.3 constraint).
  'src/components/student/payment/PaymentApplicationCard.tsx',
  'src/lib/paymentRecovery.ts',
  'src/hooks/useFeeQuote.ts',
  'src/lib/serverAmount.ts',
  // Added by task 8.4: the admin money surfaces. The server is the sole money
  // authority on the *admin* side too — a settlement total or a fee amount
  // computed in an operator's browser is the same defect as one computed in a
  // student's (ADM-06).
  'src/pages/admin/tenants/SettlementPanel.tsx',
  'src/pages/admin/ProgramFees.tsx',
  'src/services/admin/settlement.ts',
  'src/hooks/admin/useMoneyAdmin.ts',
]

/** The admin money surfaces task 8.4 added to the scan. */
const ADMIN_MONEY_SURFACES = [
  'src/pages/admin/tenants/SettlementPanel.tsx',
  'src/pages/admin/ProgramFees.tsx',
  'src/services/admin/settlement.ts',
  'src/hooks/admin/useMoneyAdmin.ts',
]

const PAYMENT_SURFACE_FILES = FILES.filter((file) => PAYMENT_SURFACES.includes(file.rel))

describe('source scan: the frontend computes no money (R12.1, STU-08)', () => {
  it('scans the payment surfaces it claims to scan', () => {
    // A scan that silently stopped matching any file would pass every rule below.
    expect(PAYMENT_SURFACE_FILES.map((f) => f.rel).sort()).toEqual([...PAYMENT_SURFACES].sort())
    expect(FILES.length).toBeGreaterThan(100)
  })

  it('declares no transaction-fee rate constant anywhere in src/', () => {
    expect(hits(/TRANSACTION_FEE|FEE_RATE|PROVIDER_FEE_PERCENT/)).toEqual([])
  })

  it('multiplies nothing by a fee factor, anywhere in src/', () => {
    // `* (1 + RATE)`, `* 1.01`, `* 0.01`, `1.01 *` — the exact shape of the retired
    // PaymentForm arithmetic. Scoped to money-named identifiers and fee-rate
    // constants so unrelated maths (poll windows, retry budgets) is not caught.
    expect(hits(/\*\s*\(?1\s*\+\s*\w*(?:RATE|FEE|PERCENT)/i)).toEqual([])
    // `\*(?!\/)` so a JSX comment terminator (`{/* Application fee */}`) is not
    // read as a multiplication.
    expect(hits(/(?:amount|fee|total|price)\w*\s*\*(?!\/)/i)).toEqual([])
    // Bare decimal factors, outside string literals (a CSS `${i * 0.08}s`
    // animation delay is not a fee). A factor applied to a money-named identifier
    // inside a template literal is still caught by the rule above, which reads the
    // raw line.
    const code = withoutStringLiterals(PAYMENT_SURFACE_FILES)
    expect(hits(/\*\s*1\.0\d/, code)).toEqual([])
    expect(hits(/\*\s*0\.0\d/, code)).toEqual([])
    expect(hits(/1\.0\d\s*\*/, code)).toEqual([])
  })

  it('adds, subtracts, or divides no amount on a payment surface', () => {
    // Any arithmetic operator applied to an identifier containing amount / fee /
    // total / price. The server sends `base_amount`, `provider_fee`, and
    // `total_amount` already reconciled (`total = base + provider` is a database
    // CHECK), so the client has nothing left to work out.
    const arithmetic = /\b\w*(?:amount|fee|total|price)\w*\s*[+\-/]\s*\w|\b\w+\s*[+\-/]\s*\w*(?:amount|fee|total|price)\b/i
    expect(hits(arithmetic, withoutStringLiterals(PAYMENT_SURFACE_FILES))).toEqual([])
  })

  it('re-quantises no server amount with toFixed / Math rounding on a payment surface', () => {
    expect(hits(/toFixed\(|Math\.(round|floor|ceil)\(/, PAYMENT_SURFACE_FILES)).toEqual([])
  })

  it('parses no server amount into a float on a payment surface', () => {
    // Amounts stay decimal strings end to end: parsing them into IEEE-754 is how a
    // "153.00" becomes a "152.99999999999997" in front of a student.
    expect(hits(/parseFloat\(|Number\.parseFloat\(/, PAYMENT_SURFACE_FILES)).toEqual([])
  })
})

describe('source scan: no invented or defaulted amount (R12.2, STU-08)', () => {
  it('hardcodes no K150 / USD 20 style fee default on a payment surface', () => {
    // The literal empty-state amounts from the finding, plus any bare
    // `= <number>` fee/amount default.
    //
    // `(?!count)` (task 8.4): the rule is about an invented *amount*, and the
    // admin money surfaces legitimately carry zeroed **counters** in their
    // empty-aggregate shape (`fee_count: 0`, `payment_count: 0`). A count is not
    // money; excluding the count suffix keeps the rule aimed at what STU-08 was
    // about — `amount = 150`, `fee: 153` — rather than at a zeroed tally.
    expect(hits(/K\s?150|USD\s?20\b|\bK153\b/, PAYMENT_SURFACE_FILES)).toEqual([])
    expect(
      hits(/(?:amount|fee|total)(?!\w*(?:count|Count))\w*\s*[=:]\s*\d/i, PAYMENT_SURFACE_FILES),
    ).toEqual([])
  })

  it('keeps the retired hardcoded payment config module deleted', () => {
    // `src/config/payments.ts` held the K153 fee and the mobile-money numbers.
    expect(fs.existsSync(path.join(SRC, 'config/payments.ts'))).toBe(false)
  })

  it('keeps the display-name fee resolver hook deleted', () => {
    // `useFeeResolver` resolved a fee by program *code* (DATA-05) and is replaced
    // by the offering-bound server quote.
    expect(fs.existsSync(path.join(SRC, 'hooks/useFeeResolver.ts'))).toBe(false)
    expect(hits(/useFeeResolver|resolve-fee/)).toEqual([])
  })

  it('formats money through exactly one helper, which does no arithmetic', () => {
    // One formatter means one place to audit. A second local `formatCurrency` is
    // how the `K`-for-every-currency assumption survived on three surfaces.
    expect(hits(/function\s+formatCurrency/, PAYMENT_SURFACE_FILES)).toEqual([])
    const serverAmount = fs.readFileSync(path.join(SRC, 'lib/serverAmount.ts'), 'utf-8')
    for (const banned of ['parseFloat', 'toFixed', 'Number(', 'Math.']) {
      expect(serverAmount.includes(banned), `serverAmount.ts must not use ${banned}`).toBe(false)
    }
  })

  it('assumes no currency symbol on a payment surface', () => {
    // A hardcoded `K` in front of an interpolated amount is a client-side currency
    // decision — an international applicant pays in USD.
    expect(hits(/[`'"]K\$\{|[`'"]K\s*\+/, PAYMENT_SURFACE_FILES)).toEqual([])
  })
})

describe('source scan: provider routing is server-authored (design §10.2)', () => {
  it('derives no mobile-money operator from a phone prefix', () => {
    expect(hits(/detectOperator|MomoOperator|momoOperator|guessOperator|inferOperator/)).toEqual([])
    // The retired prefix table: 096x/076x -> MTN, 097x/077x -> Airtel, and the
    // Zamtel-to-Airtel default that silently mis-routed a whole network.
    expect(hits(/\^0\?\s?9[5-7]|\^0\?\s?7[5-7]/)).toEqual([])
  })

  it('sends no client-chosen operator to the payment API', () => {
    // Reading the operator the server reports back (`operator: string` on the
    // response, `data.operator`) is fine — that is the server's answer. Assigning
    // one is not: a literal, a detector call, or a state setter means the client
    // decided the network.
    expect(hits(/operator\s*[:=]\s*(?:['"]|\w+\()/i, PAYMENT_SURFACE_FILES)).toEqual([])
    expect(hits(/setMomoOperator|useState<MomoOperator/)).toEqual([])
    const payments = fs.readFileSync(path.join(SRC, 'services/payments.ts'), 'utf-8')
    // The response may *report* the operator the server chose; the request type
    // must not accept one.
    expect(payments).not.toMatch(/phone:\s*string;\s*operator/)
    expect(payments).toContain('application_id: string; phone: string }')
  })

  it('leaves the supported-network legend intact', () => {
    // Telling a student which networks work is information. Deciding which network
    // their number belongs to was the bug. Only the second was removed.
    const form = fs.readFileSync(path.join(SRC, 'components/student/PaymentForm.tsx'), 'utf-8')
    expect(form).toContain('Airtel Money')
    expect(form).toContain('MTN MoMo')
  })
})

describe('source scan: no stale hardcoded support copy (R12.6, STU-24)', () => {
  /**
   * Added by admissions-v2 task 8.3. Finding STU-24 is that student pages print
   * platform contact details into every tenant's UI. Like the fee rules above, the
   * fix is an *absence*: a rendering test proves the tenant's address appears
   * today, but only a scan keeps the next empty state from hardcoding one.
   */
  const STUDENT_PAYMENT_SURFACES = FILES.filter((file) =>
    [
      'src/pages/student/Payment.tsx',
      'src/components/student/payment/PaymentApplicationCard.tsx',
      'src/components/student/PaymentForm.tsx',
      'src/pages/student/applicationWizard/steps/PaymentStep.tsx',
      'src/lib/tenantSupport.ts',
      'src/lib/paymentRecovery.ts',
    ].includes(file.rel),
  )

  it('scans the surfaces it claims to scan', () => {
    expect(STUDENT_PAYMENT_SURFACES).toHaveLength(6)
  })

  it('hardcodes no support address, phone, or office hours on a payment surface', () => {
    // A literal mailto/@-address, a Zambian phone number, or opening hours in the
    // source means the copy cannot follow the resolved tenant.
    expect(hits(/mailto:[a-z0-9.]+@/i, STUDENT_PAYMENT_SURFACES)).toEqual([])
    expect(hits(/[a-z0-9._%+-]+@(?:beanola|mihas|katc)\b/i, STUDENT_PAYMENT_SURFACES)).toEqual([])
    expect(hits(/\+260\s?\d|\b09[567]\d{7}\b/, STUDENT_PAYMENT_SURFACES.filter((f) => f.rel !== 'src/components/student/PaymentForm.tsx'))).toEqual([])
    expect(hits(/mon\s?[–-]\s?fri|office hours/i, STUDENT_PAYMENT_SURFACES)).toEqual([])
  })

  it('names no legacy tenant as the platform on a payment surface', () => {
    // MIHAS/KATC are example tenants (`.kiro/steering/enterprise-tenancy.md`); a
    // literal school name in payment copy is authority drift.
    expect(hits(/\bMIHAS\b|\bKATC\b/, STUDENT_PAYMENT_SURFACES)).toEqual([])
  })

  it('resolves the support affordance through the tenant helper', () => {
    for (const rel of [
      'src/pages/student/Payment.tsx',
      'src/components/student/payment/PaymentApplicationCard.tsx',
    ]) {
      const [file] = only(rel)
      expect(file, `${rel} not found`).toBeDefined()
      expect(file.contents, `${rel} must use the tenant support resolver`).toMatch(
        /tenantSupport|TenantSupportContact/,
      )
    }
    const page = only('src/pages/student/Payment.tsx')[0]
    // The page reads the runtime brand rather than hardcoding a title (STU-24).
    expect(page.contents).toContain('usePortalBrand')
    expect(page.contents).not.toMatch(/title="Payment \| Beanola/)
  })
})

describe('source scan: the payment page owns recovery, the wizard owns pre-submit (R12.3)', () => {
  it('the payment page renders the server phase vocabulary', () => {
    const [page] = only('src/components/student/payment/PaymentApplicationCard.tsx')
    expect(page, 'payment recovery card not found').toBeDefined()
    // The phase split is read from the server payload, via the shared mapper.
    expect(page.contents).toContain('resolvePaymentRecovery')
    expect(page.contents).toContain('usePaymentStatus')
  })

  it('the payment recovery presentation derives from the task 8.2 state machine', () => {
    const recoveryFiles = only('src/lib/paymentRecovery.ts')
    expect(recoveryFiles, 'paymentRecovery.ts not found').toHaveLength(1)
    const recovery = recoveryFiles[0].contents
    expect(recovery).toContain("from './paymentStatus'")
    expect(recovery).toContain('derivePaymentUiState')
    // No second copy of the wait budgets in code — they are the server's numbers,
    // read through PAYMENT_WAITING_STATES. (Prose may mention them; `hits` skips
    // comment lines, so the rule is about executable duplication.)
    expect(hits(/timeoutSeconds:\s*\d+/, recoveryFiles)).toEqual([])
    expect(hits(/\b120\b|\b600\b/, recoveryFiles)).toEqual([])
  })

  it('the wizard payment step renders no payment history', () => {
    const [step] = only('src/pages/student/applicationWizard/steps/PaymentStep.tsx')
    expect(step, 'wizard payment step not found').toBeDefined()
    // History and post-submission recovery belong to /student/payment (R12.3).
    expect(step.contents).not.toMatch(/payment[- ]history/i)
    expect(step.contents).not.toContain('listPayments')
    expect(step.contents).not.toContain('resolvePaymentRecovery')
  })
})

describe('source scan: the admin money surfaces are server-owned (task 8.4, ADM-06)', () => {
  /**
   * Added by admissions-v2 task 8.4. Finding ADM-06 is that the tenant console
   * fetched every settlement row it could reach, filtered the other schools' rows
   * out **in the browser**, and added up the currency totals itself. Two of those
   * three are absences once fixed — no client-side institution predicate, no
   * client-side money arithmetic — so, like the student rules above, only a scan
   * keeps the next panel from reintroducing them.
   */
  const ADMIN_MONEY_FILES = FILES.filter((file) => ADMIN_MONEY_SURFACES.includes(file.rel))

  it('scans the admin surfaces it claims to scan', () => {
    expect(ADMIN_MONEY_FILES.map((f) => f.rel).sort()).toEqual([...ADMIN_MONEY_SURFACES].sort())
  })

  it('does not filter settlement or fee rows by institution in the browser', () => {
    // The exact shape of the ADM-06 defect: `rows.filter(row =>
    // row.institution_id === institutionId)`. Scope is a query, not a render.
    expect(hits(/\.filter\([^)]*institution_id/i, ADMIN_MONEY_FILES)).toEqual([])
    expect(hits(/institution_id\s*===|===\s*institutionId/i, ADMIN_MONEY_FILES)).toEqual([])
  })

  it('sends the institution as a server filter', () => {
    const [panel] = only('src/pages/admin/tenants/SettlementPanel.tsx')
    expect(panel, 'settlement panel not found').toBeDefined()
    // The panel passes institutionId into the query the server answers.
    expect(panel.contents).toContain('institutionId')
    expect(panel.contents).toContain('useSettlementReport')
    const [service] = only('src/services/admin/settlement.ts')
    expect(service.contents).toContain('institution_id: query.institutionId')
  })

  it('re-quantises no admin amount and sums none of them', () => {
    // No toFixed / Math rounding / parseFloat, and no arithmetic on a
    // money-named identifier — the same rules the student surfaces carry.
    expect(hits(/toFixed\(|Math\.(round|floor|ceil)\(/, ADMIN_MONEY_FILES)).toEqual([])
    expect(hits(/parseFloat\(|Number\.parseFloat\(/, ADMIN_MONEY_FILES)).toEqual([])
    const arithmetic = /\b\w*(?:amount|gross|total)\w*\s*[+\-/]\s*\w|\b\w+\s*[+\-/]\s*\w*(?:amount|gross|total)\b/i
    expect(hits(arithmetic, withoutStringLiterals(ADMIN_MONEY_FILES))).toEqual([])
    // The retired accumulator: `current.gross += Number(row.gross_amount)`.
    expect(hits(/\+=\s*Number\(|Number\([^)]*gross/i, ADMIN_MONEY_FILES)).toEqual([])
  })

  it('formats admin money through the one canonical helper', () => {
    for (const rel of [
      'src/pages/admin/tenants/SettlementPanel.tsx',
      'src/pages/admin/ProgramFees.tsx',
    ]) {
      const [file] = only(rel)
      expect(file, `${rel} not found`).toBeDefined()
      expect(file.contents, `${rel} must format money through serverAmount`).toContain(
        'formatServerAmount',
      )
    }
  })

  it('derives no admin total from the loaded page', () => {
    // `fees.length`, a `Set` over loaded rows, and a `rows.reduce(...)` total were
    // the fee page's and the panel's client-side aggregates. Totals are the
    // server's `aggregates` block now.
    //
    // `(?!\s*===)` allows an emptiness test (`fees.length === 0` decides which
    // empty state to render); what is forbidden is using the loaded row count as
    // a *number the operator reads*, which is what ADM-06 was.
    expect(hits(/fees\.length(?!\s*===)|rows\.length(?!\s*===)/, ADMIN_MONEY_FILES)).toEqual([])
    expect(hits(/new Set\(/, ADMIN_MONEY_FILES)).toEqual([])
    expect(hits(/\.reduce\(/, ADMIN_MONEY_FILES)).toEqual([])
    for (const rel of [
      'src/pages/admin/tenants/SettlementPanel.tsx',
      'src/pages/admin/ProgramFees.tsx',
    ]) {
      const [file] = only(rel)
      expect(file.contents, `${rel} must read the server aggregates`).toContain('aggregates')
    }
  })

  it('reads the export authority from the server, and the export is a server command', () => {
    const [service] = only('src/services/admin/settlement.ts')
    // `export=csv` is a backend command; the client only follows it.
    expect(service.contents).toContain("export: 'csv'")
    // The export URL drops the page, because the export is page-independent.
    expect(service.contents).toContain('page: undefined, pageSize: undefined')
    for (const rel of [
      'src/pages/admin/tenants/SettlementPanel.tsx',
      'src/pages/admin/ProgramFees.tsx',
    ]) {
      const [file] = only(rel)
      // The button is gated by the server's own answer, never by a role string.
      expect(file.contents, `${rel} must gate export on the server's can_export`).toContain(
        'can_export',
      )
      expect(file.contents, `${rel} must not compare a role string`).not.toMatch(
        /role\s*===\s*['"](?:admin|super_admin)['"]/,
      )
    }
  })

  it('names no legacy tenant on an admin money surface', () => {
    expect(hits(/\bMIHAS\b|\bKATC\b/, ADMIN_MONEY_FILES)).toEqual([])
  })
})

describe('source scan: the quote endpoint is the money source (R12.1, R12.6)', () => {
  it('both student payment surfaces read the server quote', () => {
    // The wizard step consumes the quote directly. Task 8.3 moved the payment
    // page's own consumption down into the per-application recovery card, so the
    // rule follows the composition: the page renders that card, and that card is
    // the quote consumer. The page itself must show no amount of its own.
    for (const rel of [
      'src/pages/student/applicationWizard/steps/PaymentStep.tsx',
      'src/components/student/payment/PaymentApplicationCard.tsx',
    ]) {
      const [file] = only(rel)
      expect(file, `${rel} not found`).toBeDefined()
      expect(file.contents, `${rel} must consume useFeeQuote`).toContain('useFeeQuote')
    }
    const [page] = only('src/pages/student/Payment.tsx')
    expect(page, 'src/pages/student/Payment.tsx not found').toBeDefined()
    expect(page.contents, 'the payment page must render the quote-consuming card').toContain(
      'PaymentApplicationCard',
    )
    expect(page.contents, 'the payment page must not format money itself').not.toContain(
      'formatServerAmount',
    )
  })

  it('the quote is fetched through the payments service, not ad-hoc transport', () => {
    const hook = fs.readFileSync(path.join(SRC, 'hooks/useFeeQuote.ts'), 'utf-8')
    expect(hook).toContain("from '@/services/payments'")
    expect(hook).not.toContain('fetch(')
    const payments = fs.readFileSync(path.join(SRC, 'services/payments.ts'), 'utf-8')
    expect(payments).toContain("'/payments/quote/'")
    expect(payments).toContain('/payments/quote/${buildQueryString(')
  })

  it('PaymentForm takes server amount strings, never a numeric amount prop', () => {
    const form = fs.readFileSync(path.join(SRC, 'components/student/PaymentForm.tsx'), 'utf-8')
    expect(form).toMatch(/baseAmount:\s*string/)
    expect(form).toMatch(/providerFee\?:\s*string \| null/)
    expect(form).toMatch(/totalAmount\?:\s*string \| null/)
    expect(form).not.toMatch(/^\s*amount:\s*number/m)
  })

  it('every quote stable code carries user-facing copy and a decided recovery', () => {
    const codes = fs.readFileSync(path.join(SRC, 'lib/paymentErrorCodes.ts'), 'utf-8')
    const recovery = fs.readFileSync(path.join(SRC, 'lib/paymentNextActions.ts'), 'utf-8')
    for (const code of [
      'QUOTE_EXPIRED',
      'QUOTE_INVALID',
      'QUOTE_ALREADY_REDEEMED',
      'QUOTE_CONFIGURATION_CHANGED',
      'QUOTE_NOT_FOUND',
    ]) {
      expect(codes, `${code} missing from the stable-code mirror`).toContain(`${code}:`)
      expect(recovery, `${code} has no decided recovery action`).toContain(`${code}:`)
    }
  })
})
