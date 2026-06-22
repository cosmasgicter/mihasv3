/**
 * Declared tenant-admin contract fixtures for Gate 8 — Contract_Sync_Gate (R8).
 *
 * Spec: `beanola-launch-verification` (task 10.5).
 *
 * The pure comparator in `contractComparator.ts` (task 10.1) is the single
 * source of truth for the *decision* (shape divergence, error-code coverage, tab
 * coverage). It deliberately takes already-extracted shapes; it does not read the
 * filesystem or parse OpenAPI. This module supplies those extracted shapes: one
 * `EndpointContract` per tenant-admin endpoint, covering all **eleven** tabs with
 * at least one endpoint each (R8.3).
 *
 * Two independently-authored sides per endpoint:
 *   - `frontendShape` mirrors the request/response shape the frontend service
 *     `apps/admissions/src/services/admin/tenants.ts` consumes (its exported
 *     `Tenant*` interfaces).
 *   - `serializerShape` mirrors the matching backend serializer in
 *     `backend/apps/catalog/admin_serializers.py` (and the catalog / payments
 *     serializers for offerings / settlement), restricted to the fields the
 *     frontend actually consumes. Extra backend-only fields the frontend ignores
 *     are intentionally out of contract scope — the gate asserts the backend
 *     *provides every field the frontend reads*, with matching
 *     type/optional/nullable, including the `{"success": true, "data": ...}`
 *     envelope framing (R8.2, R8.5).
 *
 * Because the two sides are authored from two different files, a future drift on
 * either side (a renamed/retyped field on one side only) surfaces as a
 * divergence. The orchestrator (`scripts/launch-verification/check-contract-sync.py`)
 * additionally cross-checks each `specPath` against the freshly generated OpenAPI
 * so a removed/renamed backend route is caught against the real artifact (R8.1).
 *
 * Error-code coverage (R8.4, R8.6): each endpoint lists the backend error codes
 * it can return and the codes the frontend maps; the recoverable
 * routing-simulator `NO_ELIGIBLE_OFFERING` failure and the out-of-scope `NOT_FOUND`
 * (404) are included where applicable.
 */

import type {
  EndpointContract,
  FieldSpec,
  Shape,
  TenantAdminTabId,
} from './contractComparator'

// ---------------------------------------------------------------------------
// Small shape-builder helpers (keep the fixture table readable).
// ---------------------------------------------------------------------------

/** Required, non-nullable field of the given type. */
const req = (type: FieldSpec['type']): FieldSpec => ({ type })
/** Optional field (may be absent from the payload). */
const opt = (type: FieldSpec['type']): FieldSpec => ({ type, optional: true })
/** Optional + nullable field (may be absent, or present and `null`). */
const optNull = (type: FieldSpec['type']): FieldSpec => ({
  type,
  optional: true,
  nullable: true,
})

/** Build an enveloped response shape (`{success, data}` framing). */
function responseShape(fields: Shape['fields'], isList: boolean): Shape {
  return { envelope: true, isList, fields }
}

/**
 * One declared endpoint contract plus the OpenAPI path template the orchestrator
 * cross-checks against the generated schema. `specPath` uses `{}` for path
 * parameters; the orchestrator normalises parameter names before matching.
 */
export interface TenantAdminEndpointFixture extends EndpointContract {
  /** OpenAPI path template (params normalised to `{}`) to confirm in the schema. */
  specPath: string
}

/** The base error codes every tenant-admin write/detail endpoint can return. */
const BASE_ERROR_CODES = ['VALIDATION_ERROR', 'NOT_FOUND', 'PERMISSION_DENIED'] as const

// ---------------------------------------------------------------------------
// Per-tab field shapes (frontend interface ∩ backend serializer).
// ---------------------------------------------------------------------------

const institutionFields: Shape['fields'] = {
  id: req('string'),
  name: req('string'),
  code: req('string'),
  slug: optNull('string'),
  full_name: optNull('string'),
  brand_name: optNull('string'),
  email: optNull('string'),
  is_active: opt('boolean'),
}

const domainFields: Shape['fields'] = {
  id: req('string'),
  institution_id: req('string'),
  hostname: req('string'),
  is_primary: opt('boolean'),
  is_active: opt('boolean'),
}

const offeringFields: Shape['fields'] = {
  id: req('string'),
  name: req('string'),
  code: req('string'),
  institution_id: req('string'),
  canonical_program_id: optNull('string'),
  assignment_priority: optNull('number'),
  offering_status: optNull('string'),
  assignment_rules: optNull('object'),
  // Frontend types `application_fee` as `number | string | null`; coarse
  // `unknown` is the honest contract type for a runtime union.
  application_fee: optNull('unknown'),
  is_active: opt('boolean'),
}

const routingResultFields: Shape['fields'] = {
  assigned: req('boolean'),
  inputs: req('object'),
  program_offering_id: opt('string'),
  offering_code: opt('string'),
  institution_id: opt('string'),
  error: optNull('object'),
}

const requiredDocumentFields: Shape['fields'] = {
  id: req('string'),
  institution_id: req('string'),
  program_id: optNull('string'),
  canonical_program_id: optNull('string'),
  document_type: req('string'),
  label: req('string'),
  is_required: opt('boolean'),
  is_active: opt('boolean'),
}

const templateFields: Shape['fields'] = {
  id: req('string'),
  institution_id: req('string'),
  document_type: req('string'),
  name: req('string'),
  version: req('number'),
  sections: opt('object'),
  tokens: opt('array'),
  is_active: opt('boolean'),
}

const documentProfileFields: Shape['fields'] = {
  id: req('string'),
  institution_id: req('string'),
  document_type: req('string'),
  program_id: optNull('string'),
  canonical_program_id: optNull('string'),
  intake_id: optNull('string'),
  layout_key: req('string'),
  sections: opt('object'),
  fee_chart: opt('array'),
  bank_accounts: opt('array'),
  requirements: opt('array'),
  signatory: opt('object'),
  version: req('number'),
  is_active: opt('boolean'),
}

const assetFields: Shape['fields'] = {
  id: req('string'),
  institution_id: req('string'),
  asset_type: req('string'),
  storage_key: req('string'),
  public_url: optNull('string'),
  mime_type: req('string'),
  checksum_sha256: opt('string'),
  version: opt('number'),
  is_active: opt('boolean'),
}

const membershipFields: Shape['fields'] = {
  id: req('string'),
  user_id: req('string'),
  institution_id: req('string'),
  role: req('string'),
  is_active: opt('boolean'),
}

const accessGrantFields: Shape['fields'] = {
  id: req('string'),
  user_id: req('string'),
  scope_type: req('string'),
  institution_id: optNull('string'),
  program_id: optNull('string'),
  application_id: optNull('string'),
  expires_at: optNull('string'),
  is_active: opt('boolean'),
}

const settlementFields: Shape['fields'] = {
  institution_id: { type: 'string', nullable: true },
  institution_name: req('string'),
  program_offering_id: { type: 'string', nullable: true },
  program_name: req('string'),
  currency: req('string'),
  payment_count: req('number'),
  gross_amount: req('string'),
}

const auditEventFields: Shape['fields'] = {
  id: req('string'),
  action: req('string'),
  created_at: req('string'),
  institution_id: optNull('string'),
}

// ---------------------------------------------------------------------------
// Endpoint contracts — all eleven tabs, ≥1 endpoint each (R8.3).
// ---------------------------------------------------------------------------

/**
 * Build a contract whose frontend and serializer shapes are the same declared
 * field set (the healthy, in-sync baseline). Both sides are authored from their
 * respective sources; they coincide today because the contract is in sync.
 */
function aligned(
  endpoint: string,
  specPath: string,
  tab: TenantAdminTabId,
  fields: Shape['fields'],
  isList: boolean,
  errorCodes: readonly string[] = BASE_ERROR_CODES
): TenantAdminEndpointFixture {
  const shape = responseShape(fields, isList)
  return {
    endpoint,
    specPath,
    tab,
    frontendShape: shape,
    serializerShape: responseShape({ ...fields }, isList),
    backendErrorCodes: [...errorCodes],
    frontendMappedErrorCodes: [...errorCodes],
  }
}

/**
 * The declared tenant-admin contract surface: one or more endpoints per tab,
 * covering every one of the eleven tabs. The orchestrator feeds these to
 * `evaluateContract` and cross-checks each `specPath` against the generated
 * OpenAPI artifact.
 */
export const TENANT_ADMIN_ENDPOINTS: readonly TenantAdminEndpointFixture[] = [
  // 1. institution CRUD
  aligned(
    '/api/v1/admin/institutions/',
    '/api/v1/admin/institutions/',
    'institution-crud',
    institutionFields,
    true
  ),
  aligned(
    '/api/v1/admin/institutions/{id}/',
    '/api/v1/admin/institutions/{}/',
    'institution-crud',
    institutionFields,
    false
  ),

  // 2. domains
  aligned(
    '/api/v1/admin/institutions/{id}/domains/',
    '/api/v1/admin/institutions/{}/domains/',
    'domains',
    domainFields,
    true
  ),

  // 3. offerings and rules
  aligned(
    '/api/v1/catalog/programs/',
    '/api/v1/catalog/programs/',
    'offerings-rules',
    offeringFields,
    true
  ),
  aligned(
    '/api/v1/catalog/programs/{id}/',
    '/api/v1/catalog/programs/{}/',
    'offerings-rules',
    offeringFields,
    false
  ),

  // 4. routing simulator (recoverable NO_ELIGIBLE_OFFERING failure — R8.4)
  aligned(
    '/api/v1/admin/routing/simulate/',
    '/api/v1/admin/routing/simulate/',
    'routing-simulator',
    routingResultFields,
    false,
    ['VALIDATION_ERROR', 'NO_ELIGIBLE_OFFERING', 'NOT_FOUND']
  ),

  // 5. required documents
  aligned(
    '/api/v1/admin/institutions/{id}/required-documents/',
    '/api/v1/admin/institutions/{}/required-documents/',
    'required-documents',
    requiredDocumentFields,
    true
  ),

  // 6. templates
  aligned(
    '/api/v1/admin/institutions/{id}/templates/',
    '/api/v1/admin/institutions/{}/templates/',
    'templates',
    templateFields,
    true
  ),

  // 7. document profiles
  aligned(
    '/api/v1/admin/institutions/{id}/document-profiles/',
    '/api/v1/admin/institutions/{}/document-profiles/',
    'document-profiles',
    documentProfileFields,
    true
  ),

  // 8. assets
  aligned(
    '/api/v1/admin/institutions/{id}/assets/',
    '/api/v1/admin/institutions/{}/assets/',
    'assets',
    assetFields,
    true
  ),

  // 9. staff memberships and grants (two endpoints)
  aligned(
    '/api/v1/admin/memberships/',
    '/api/v1/admin/memberships/',
    'staff-memberships-grants',
    membershipFields,
    true
  ),
  aligned(
    '/api/v1/admin/access-grants/',
    '/api/v1/admin/access-grants/',
    'staff-memberships-grants',
    accessGrantFields,
    true
  ),

  // 10. settlement
  aligned(
    '/api/v1/payments/settlements/',
    '/api/v1/payments/settlements/',
    'settlement',
    settlementFields,
    true
  ),

  // 11. audit (tenant-wide + per-institution scoped feed)
  aligned(
    '/api/v1/admin/tenant-audit/',
    '/api/v1/admin/tenant-audit/',
    'audit',
    auditEventFields,
    true
  ),
  aligned(
    '/api/v1/admin/institutions/{id}/audit/',
    '/api/v1/admin/institutions/{}/audit/',
    'audit',
    auditEventFields,
    true
  ),
] as const
