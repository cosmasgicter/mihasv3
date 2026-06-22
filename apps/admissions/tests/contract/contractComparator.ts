/**
 * Pure-logic core for Gate 8 — Contract_Sync_Gate (Requirement 8).
 *
 * Spec: `beanola-launch-verification` (task 10.1).
 *
 * This module is intentionally **pure**: no filesystem, no network, no OpenAPI
 * generation. It takes already-extracted shapes / code sets / tab→endpoint maps
 * and decides pass/fail deterministically, so it is unit- and property-testable
 * with fast-check (tasks 10.2 / 10.3 / 10.4). The orchestrator
 * (`scripts/launch-verification/check-contract-sync.py`, task 10.5) does the
 * impure work — generating the OpenAPI artifact and reading
 * `apps/admissions/src/services/admin/tenants.ts` shapes — then feeds this core.
 *
 * It covers three checks from Requirement 8:
 *   - `compareShapes`            — field-for-field request/response shape diff,
 *                                  including the `{"success": true, "data": ...}`
 *                                  envelope wrapping (R8.2, R8.5).
 *   - `errorCodeMappingCovered`  — every backend error code an endpoint can
 *                                  return is mapped on the frontend (R8.4, R8.6).
 *   - `tabCoverageHolds`         — every listed tenant-admin tab has ≥1 checked
 *                                  endpoint (R8.3).
 *
 * `evaluateContract` combines them into per-check `EvidenceCheck` rows plus an
 * overall pass flag and a `failures` list that records the diverging field name,
 * the endpoint path, and any unmapped error code.
 */

import type { EvidenceCheck } from './evidenceArtifact'

// ---------------------------------------------------------------------------
// Canonical tenant-admin tabs (R8.3)
// ---------------------------------------------------------------------------

/** Stable slug id for each of the eleven tenant-admin tabs. */
export type TenantAdminTabId =
  | 'institution-crud'
  | 'domains'
  | 'offerings-rules'
  | 'routing-simulator'
  | 'required-documents'
  | 'templates'
  | 'document-profiles'
  | 'assets'
  | 'staff-memberships-grants'
  | 'settlement'
  | 'audit'

/**
 * The canonical list of eleven tenant-admin tabs whose endpoints the
 * Contract_Sync_Gate must check (R8.3). Order is stable for deterministic
 * evidence output. Mirrors the tab set named in the design doc and the
 * `apps/admissions/src/services/admin/tenants.ts` service surface.
 */
export const TENANT_ADMIN_TABS: readonly TenantAdminTabId[] = [
  'institution-crud',
  'domains',
  'offerings-rules',
  'routing-simulator',
  'required-documents',
  'templates',
  'document-profiles',
  'assets',
  'staff-memberships-grants',
  'settlement',
  'audit',
] as const

// ---------------------------------------------------------------------------
// Shape model
// ---------------------------------------------------------------------------

/** Coarse field type, sufficient for a field-for-field contract diff. */
export type FieldType =
  | 'string'
  | 'number'
  | 'boolean'
  | 'object'
  | 'array'
  | 'null'
  | 'unknown'

/** Allowed field types, useful for runtime validation in tests. */
export const FIELD_TYPES: readonly FieldType[] = [
  'string',
  'number',
  'boolean',
  'object',
  'array',
  'null',
  'unknown',
] as const

/** A single field's contract: its type plus optional/nullable markers. */
export interface FieldSpec {
  type: FieldType
  /** Field may be absent from the payload. Defaults to `false`. */
  optional?: boolean
  /** Field value may be `null`. Defaults to `false`. */
  nullable?: boolean
}

/** A map of field name → field contract. */
export type ShapeFields = Record<string, FieldSpec>

/**
 * A request or response payload shape.
 *
 * For responses, the backend wraps the payload in the
 * `{"success": true, "data": ...}` envelope, so `envelope` is `true` and
 * `isList` indicates whether `data` is an array. For requests, `envelope` is
 * `false`. The comparator checks both sides agree on the envelope and list
 * framing before diffing fields, so an envelope mismatch is itself a divergence
 * (R8.2, R8.5).
 */
export interface Shape {
  /** Whether the payload is wrapped in the `{success, data}` envelope. */
  envelope: boolean
  /** Whether the (unwrapped) payload is a list. */
  isList: boolean
  /** The field-for-field contract of the (unwrapped) payload. */
  fields: ShapeFields
}

// ---------------------------------------------------------------------------
// Shape comparison (R8.2, R8.5)
// ---------------------------------------------------------------------------

/** The kind of divergence a single field/framing comparison can report. */
export type DivergenceKind =
  | 'envelope-mismatch'
  | 'list-mismatch'
  | 'missing-field'
  | 'extra-field'
  | 'type-mismatch'
  | 'optionality-mismatch'
  | 'nullability-mismatch'

/** A single recorded divergence between a frontend shape and its serializer. */
export interface ShapeDivergence {
  endpoint: string
  /** The diverging field name, or a `$`-prefixed framing marker. */
  field: string
  kind: DivergenceKind
  frontend?: string
  serializer?: string
  detail: string
}

function describeField(spec: FieldSpec): string {
  const flags: string[] = []
  if (spec.optional) flags.push('optional')
  if (spec.nullable) flags.push('nullable')
  return flags.length > 0 ? `${spec.type} (${flags.join(', ')})` : spec.type
}

/**
 * Field-for-field comparison of a frontend service shape against its backend
 * serializer shape, including the `{success, data}` envelope and list framing.
 *
 * Returns an array of divergences. The array is empty **if and only if** the two
 * shapes match field-for-field (same envelope flag, same list flag, identical
 * field set with identical type/optional/nullable for every field) — this is the
 * iff guarantee Property 12 checks. Each divergence records the field name and
 * the endpoint path (R8.5).
 */
export function compareShapes(
  frontendShape: Shape,
  serializerShape: Shape,
  endpoint = ''
): ShapeDivergence[] {
  const divergences: ShapeDivergence[] = []

  if (frontendShape.envelope !== serializerShape.envelope) {
    divergences.push({
      endpoint,
      field: '$envelope',
      kind: 'envelope-mismatch',
      frontend: String(frontendShape.envelope),
      serializer: String(serializerShape.envelope),
      detail: 'success/data envelope wrapping differs between frontend and serializer',
    })
  }

  if (frontendShape.isList !== serializerShape.isList) {
    divergences.push({
      endpoint,
      field: '$data',
      kind: 'list-mismatch',
      frontend: frontendShape.isList ? 'list' : 'object',
      serializer: serializerShape.isList ? 'list' : 'object',
      detail: 'payload list-vs-object framing differs between frontend and serializer',
    })
  }

  const frontendFields = frontendShape.fields
  const serializerFields = serializerShape.fields
  const fieldNames = new Set<string>([
    ...Object.keys(frontendFields),
    ...Object.keys(serializerFields),
  ])

  // Sort for deterministic divergence ordering in evidence output.
  for (const field of [...fieldNames].sort()) {
    const fe = frontendFields[field]
    const be = serializerFields[field]

    if (be === undefined && fe !== undefined) {
      divergences.push({
        endpoint,
        field,
        kind: 'extra-field',
        frontend: describeField(fe),
        detail: 'field present on frontend but absent from serializer',
      })
      continue
    }
    if (fe === undefined && be !== undefined) {
      divergences.push({
        endpoint,
        field,
        kind: 'missing-field',
        serializer: describeField(be),
        detail: 'field present on serializer but absent from frontend',
      })
      continue
    }
    if (fe === undefined || be === undefined) {
      continue
    }

    if (fe.type !== be.type) {
      divergences.push({
        endpoint,
        field,
        kind: 'type-mismatch',
        frontend: describeField(fe),
        serializer: describeField(be),
        detail: `field type differs (${fe.type} vs ${be.type})`,
      })
    }
    if (Boolean(fe.optional) !== Boolean(be.optional)) {
      divergences.push({
        endpoint,
        field,
        kind: 'optionality-mismatch',
        frontend: describeField(fe),
        serializer: describeField(be),
        detail: 'field optionality differs',
      })
    }
    if (Boolean(fe.nullable) !== Boolean(be.nullable)) {
      divergences.push({
        endpoint,
        field,
        kind: 'nullability-mismatch',
        frontend: describeField(fe),
        serializer: describeField(be),
        detail: 'field nullability differs',
      })
    }
  }

  return divergences
}

// ---------------------------------------------------------------------------
// Error-code mapping coverage (R8.4, R8.6)
// ---------------------------------------------------------------------------

/** Result of an error-code mapping coverage check for one endpoint. */
export interface ErrorCodeCoverage {
  endpoint: string
  covered: boolean
  /** Backend codes the endpoint can return that the frontend does not map. */
  unmapped: string[]
}

/**
 * Coverage holds **if and only if** every backend error code the endpoint can
 * return is mapped on the frontend — i.e. the backend code set is a subset of
 * the frontend-mapped set (R8.4). Any unmapped code fails the check and is
 * recorded alongside the endpoint path (R8.6).
 *
 * Codes are de-duplicated and comparison is exact-string; ordering of inputs
 * does not affect the result. `unmapped` is returned sorted for deterministic
 * evidence output.
 */
export function errorCodeMappingCovered(
  backendCodes: readonly string[],
  frontendMapped: readonly string[],
  endpoint = ''
): ErrorCodeCoverage {
  const mapped = new Set(frontendMapped)
  const unmapped = [...new Set(backendCodes)].filter((code) => !mapped.has(code)).sort()
  return {
    endpoint,
    covered: unmapped.length === 0,
    unmapped,
  }
}

// ---------------------------------------------------------------------------
// Tab coverage (R8.3)
// ---------------------------------------------------------------------------

/** Result of the tenant-admin tab-coverage check. */
export interface TabCoverage {
  holds: boolean
  /** Tabs with zero checked endpoints (the blocking set). */
  uncoveredTabs: TenantAdminTabId[]
}

/**
 * Tab coverage holds **if and only if** every listed tenant-admin tab has at
 * least one checked endpoint (R8.3). A tab is covered when its entry in
 * `checkedEndpointsByTab` exists and is a non-empty list. Tabs with zero checked
 * endpoints are reported in `uncoveredTabs` (preserving the canonical tab order).
 */
export function tabCoverageHolds(
  tabs: readonly TenantAdminTabId[],
  checkedEndpointsByTab: Partial<Record<TenantAdminTabId, readonly string[]>>
): TabCoverage {
  const uncoveredTabs = tabs.filter((tab) => {
    const endpoints = checkedEndpointsByTab[tab]
    return !endpoints || endpoints.length === 0
  })
  return {
    holds: uncoveredTabs.length === 0,
    uncoveredTabs: [...uncoveredTabs],
  }
}

// ---------------------------------------------------------------------------
// Top-level contract evaluation
// ---------------------------------------------------------------------------

/** One endpoint's contract inputs for `evaluateContract`. */
export interface EndpointContract {
  /** Endpoint path, e.g. `/api/v1/admin/institutions/`. */
  endpoint: string
  /** The tenant-admin tab this endpoint backs. */
  tab: TenantAdminTabId
  /** Frontend service request/response shape. */
  frontendShape: Shape
  /** Backend serializer shape from the generated OpenAPI. */
  serializerShape: Shape
  /** Backend error codes this endpoint can return. */
  backendErrorCodes: readonly string[]
  /** Error codes the frontend maps for this endpoint. */
  frontendMappedErrorCodes: readonly string[]
}

/** Input to `evaluateContract`. */
export interface ContractInput {
  endpoints: readonly EndpointContract[]
  /** Tabs that must be covered. Defaults to the canonical eleven. */
  tabs?: readonly TenantAdminTabId[]
}

/** A single recorded contract failure (field/endpoint/unmapped code). */
export interface ContractFailure {
  kind: 'shape-divergence' | 'unmapped-error-code' | 'tab-not-covered'
  endpoint?: string
  tab?: string
  field?: string
  unmappedCode?: string
  detail: string
}

/** Combined result of a full contract evaluation. */
export interface ContractResult {
  pass: boolean
  checks: EvidenceCheck[]
  failures: ContractFailure[]
}

/**
 * Combine the shape, error-code, and tab-coverage checks into per-check
 * `EvidenceCheck` rows plus an overall pass flag and a `failures` list.
 *
 * Overall pass holds iff no endpoint shape diverges, every endpoint maps all of
 * its backend error codes, and every listed tab has ≥1 checked endpoint. Each
 * failure records the diverging field name + endpoint path, the unmapped error
 * code + endpoint path, or the uncovered tab — the exact data the
 * Contract_Sync_Gate must surface (R8.2–R8.6).
 */
export function evaluateContract(input: ContractInput): ContractResult {
  const tabs = input.tabs ?? TENANT_ADMIN_TABS
  const checks: EvidenceCheck[] = []
  const failures: ContractFailure[] = []

  // Per-endpoint shape + error-code checks.
  const checkedEndpointsByTab: Partial<Record<TenantAdminTabId, string[]>> = {}

  for (const ep of input.endpoints) {
    const list = checkedEndpointsByTab[ep.tab] ?? []
    list.push(ep.endpoint)
    checkedEndpointsByTab[ep.tab] = list

    // Shape comparison (R8.2, R8.5).
    const divergences = compareShapes(ep.frontendShape, ep.serializerShape, ep.endpoint)
    checks.push({
      id: `shape:${ep.endpoint}`,
      result: divergences.length === 0 ? 'pass' : 'fail',
      observed: `${divergences.length} divergence(s)`,
      threshold: '0 divergences',
      detail: divergences.map((d) => `${d.field}: ${d.detail}`).join('; '),
      endpoint: ep.endpoint,
      tab: ep.tab,
    })
    for (const d of divergences) {
      failures.push({
        kind: 'shape-divergence',
        endpoint: d.endpoint,
        tab: ep.tab,
        field: d.field,
        detail: `${d.kind} at ${d.field}: ${d.detail}`,
      })
    }

    // Error-code mapping coverage (R8.4, R8.6).
    const coverage = errorCodeMappingCovered(
      ep.backendErrorCodes,
      ep.frontendMappedErrorCodes,
      ep.endpoint
    )
    checks.push({
      id: `error-codes:${ep.endpoint}`,
      result: coverage.covered ? 'pass' : 'fail',
      observed: coverage.covered
        ? 'all backend codes mapped'
        : `unmapped: ${coverage.unmapped.join(', ')}`,
      threshold: 'every backend error code mapped',
      detail: '',
      endpoint: ep.endpoint,
      tab: ep.tab,
    })
    for (const code of coverage.unmapped) {
      failures.push({
        kind: 'unmapped-error-code',
        endpoint: ep.endpoint,
        tab: ep.tab,
        unmappedCode: code,
        detail: `backend error code "${code}" is not mapped on the frontend for ${ep.endpoint}`,
      })
    }
  }

  // Tab coverage (R8.3).
  const coverage = tabCoverageHolds(tabs, checkedEndpointsByTab)
  checks.push({
    id: 'tab-coverage',
    result: coverage.holds ? 'pass' : 'fail',
    observed: coverage.holds
      ? `${tabs.length}/${tabs.length} tabs covered`
      : `uncovered: ${coverage.uncoveredTabs.join(', ')}`,
    threshold: 'every listed tab has ≥1 checked endpoint',
    detail: '',
  })
  for (const tab of coverage.uncoveredTabs) {
    failures.push({
      kind: 'tab-not-covered',
      tab,
      detail: `tenant-admin tab "${tab}" has zero checked endpoints`,
    })
  }

  return {
    pass: failures.length === 0,
    checks,
    failures,
  }
}
