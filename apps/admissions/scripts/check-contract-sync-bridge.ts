#!/usr/bin/env bun
/**
 * Contract_Sync_Gate (Gate 8) TypeScript bridge.
 *
 * Spec: `.kiro/specs/beanola-launch-verification/` — task 10.5, Requirement 8.
 *
 * This is the thin **bun entry** that lets the Python orchestrator
 * (`scripts/launch-verification/check-contract-sync.py`) reuse the single source
 * of truth for the contract decision — the pure comparator in
 * `apps/admissions/tests/contract/contractComparator.ts` (task 10.1) — instead of
 * re-implementing shape diffing in Python. It is approach (a) from the task:
 *
 *   1. Import `evaluateContract` + `TENANT_ADMIN_TABS` (the comparator) and the
 *      declared tenant-admin endpoint contracts (`tenantAdminContractFixtures.ts`).
 *   2. Optionally load the freshly generated OpenAPI schema (`--openapi <path>`,
 *      JSON) and cross-check that every declared endpoint path is present in the
 *      generated artifact (R8.1 — the artifact is generated in the same run and
 *      actually consumed here; a removed/renamed backend route is recorded as a
 *      contract divergence with its endpoint path, R8.5).
 *   3. Run `evaluateContract` over all eleven tabs (shape divergence R8.2/8.5,
 *      error-code coverage R8.4/8.6, tab coverage R8.3).
 *   4. Print a single JSON object on stdout for the orchestrator to consume.
 *
 * The bridge performs no evidence writing and sets no special exit semantics
 * beyond `1` on its own internal error — the orchestrator owns the evidence
 * envelope, the redaction pass, and the final pass/fail exit code.
 */

import fs from 'node:fs'

import {
  evaluateContract,
  TENANT_ADMIN_TABS,
  type ContractFailure,
  type ContractResult,
} from '../tests/contract/contractComparator'
import {
  TENANT_ADMIN_ENDPOINTS,
  type TenantAdminEndpointFixture,
} from '../tests/contract/tenantAdminContractFixtures'

/** Normalise an OpenAPI/declared path: collapse `{param}` segments to `{}`. */
function normalisePath(path: string): string {
  return path.replace(/\{[^}]+\}/g, '{}')
}

/** A single endpoint→schema presence check result. */
interface SpecPathCheck {
  endpoint: string
  specPath: string
  tab: string
  present: boolean
}

/** The bridge's full result, consumed by the Python orchestrator. */
interface BridgeResult {
  /** Whether the comparator AND (when provided) the spec cross-check both pass. */
  pass: boolean
  /** `evaluateContract` output: per-check rows + failures. */
  contract: ContractResult
  /** OpenAPI cross-check summary. */
  openapi: {
    provided: boolean
    path: string | null
    pathCount: number
    checks: SpecPathCheck[]
    /** Declared endpoints whose path is absent from the generated schema. */
    missingPaths: SpecPathCheck[]
  }
  /** Spec-derived contract failures merged into the comparator failures (R8.5). */
  failures: ContractFailure[]
  tabsExpected: number
  tabsCovered: number
  endpointCount: number
}

/** Read the `--openapi <path>` argument, if present. */
function readOpenApiArg(argv: readonly string[]): string | null {
  const idx = argv.indexOf('--openapi')
  if (idx >= 0 && idx + 1 < argv.length) {
    return argv[idx + 1]
  }
  return null
}

/**
 * Extract the set of normalised paths from a generated OpenAPI JSON document.
 * Returns `null` when the document cannot be read/parsed or has no `paths`.
 */
function loadSpecPaths(openapiPath: string): Set<string> | null {
  let raw: string
  try {
    raw = fs.readFileSync(openapiPath, 'utf8')
  } catch {
    return null
  }
  let doc: unknown
  try {
    doc = JSON.parse(raw)
  } catch {
    return null
  }
  if (
    typeof doc !== 'object' ||
    doc === null ||
    typeof (doc as { paths?: unknown }).paths !== 'object' ||
    (doc as { paths?: unknown }).paths === null
  ) {
    return null
  }
  const paths = (doc as { paths: Record<string, unknown> }).paths
  return new Set(Object.keys(paths).map(normalisePath))
}

/** Build the per-endpoint spec presence checks against the loaded path set. */
function crossCheckSpecPaths(
  endpoints: readonly TenantAdminEndpointFixture[],
  specPaths: Set<string>
): SpecPathCheck[] {
  return endpoints.map((ep) => ({
    endpoint: ep.endpoint,
    specPath: ep.specPath,
    tab: ep.tab,
    present: specPaths.has(normalisePath(ep.specPath)),
  }))
}

export function runBridge(argv: readonly string[]): BridgeResult {
  const openapiPath = readOpenApiArg(argv)

  // 1) Comparator decision over all eleven tabs (the SSOT).
  const contract = evaluateContract({
    endpoints: TENANT_ADMIN_ENDPOINTS,
    tabs: TENANT_ADMIN_TABS,
  })

  // 2) OpenAPI cross-check (R8.1: artifact generated in the same run is consumed).
  const specPaths = openapiPath ? loadSpecPaths(openapiPath) : null
  const provided = specPaths !== null
  const checks: SpecPathCheck[] = provided
    ? crossCheckSpecPaths(TENANT_ADMIN_ENDPOINTS, specPaths)
    : []
  const missingPaths = checks.filter((c) => !c.present)

  // Spec-path drift is a contract divergence recorded with the endpoint path (R8.5).
  const specFailures: ContractFailure[] = missingPaths.map((c) => ({
    kind: 'shape-divergence',
    endpoint: c.endpoint,
    tab: c.tab,
    field: '$path',
    detail: `endpoint path ${c.specPath} is absent from the generated OpenAPI schema`,
  }))

  const failures = [...contract.failures, ...specFailures]
  const tabsCovered =
    TENANT_ADMIN_TABS.length -
    contract.failures.filter((f) => f.kind === 'tab-not-covered').length

  return {
    pass: failures.length === 0,
    contract,
    openapi: {
      provided,
      path: openapiPath,
      pathCount: specPaths ? specPaths.size : 0,
      checks,
      missingPaths,
    },
    failures,
    tabsExpected: TENANT_ADMIN_TABS.length,
    tabsCovered,
    endpointCount: TENANT_ADMIN_ENDPOINTS.length,
  }
}

function main(): void {
  try {
    const result = runBridge(process.argv.slice(2))
    process.stdout.write(JSON.stringify(result))
    process.exit(0)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    process.stderr.write(`check-contract-sync-bridge: ${message}\n`)
    process.exit(1)
  }
}

if (import.meta.main) {
  main()
}
