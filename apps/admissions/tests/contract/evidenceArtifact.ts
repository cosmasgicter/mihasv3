/**
 * TypeScript mirror of the shared launch-verification `Evidence_Artifact` envelope.
 *
 * Spec: `beanola-launch-verification` (task 1.1, Requirement 12.6).
 *
 * The canonical definition lives in
 * `backend/apps/common/launch_verification/evidence.py`. This module mirrors that
 * envelope for the TS-side gates (Bundle_Guard, Mobile_UI_Gate detectors,
 * Contract_Sync_Gate comparator) so they emit artifacts the Python rollup
 * aggregator can read uniformly. Keep the two in sync.
 *
 * This file is pure types + tiny helpers — no runtime dependencies — so it is
 * safe to import from Vitest/fast-check tests and from build-time gate scripts.
 */

/** Closed set of gate-level statuses (mirror of `EvidenceStatus`). */
export type EvidenceStatus = 'passed' | 'failed' | 'unknown';

/** Who/what produced the artifact (mirror of `GeneratedBy`). */
export type GeneratedBy = 'ci' | 'operator' | 'deployed-target';

/** Closed set of per-check results (mirror of `CheckResult`). */
export type CheckResult = 'pass' | 'fail' | 'not-measured';

/** Enumerated allowed values, useful for runtime validation in tests. */
export const EVIDENCE_STATUSES: readonly EvidenceStatus[] = [
  'passed',
  'failed',
  'unknown',
] as const;

export const GENERATED_BY_VALUES: readonly GeneratedBy[] = [
  'ci',
  'operator',
  'deployed-target',
] as const;

export const CHECK_RESULTS: readonly CheckResult[] = [
  'pass',
  'fail',
  'not-measured',
] as const;

/**
 * A single per-check row inside an artifact's `checks` list.
 *
 * The common columns are typed first-class; gate-specific columns (e.g. the
 * bundle gate's `entry_gz_bytes`) are permitted via the index signature and are
 * preserved verbatim through a serialize round-trip.
 */
export interface EvidenceCheck {
  id: string;
  result: CheckResult;
  observed?: string;
  threshold?: string;
  detail?: string;
  /** Gate-specific fields, preserved verbatim. */
  [key: string]: unknown;
}

/** The common evidence envelope emitted by every launch gate. */
export interface EvidenceArtifact {
  gate_id: string;
  requirement: string;
  status: EvidenceStatus;
  generated_at: string;
  generated_by: GeneratedBy;
  summary: string;
  checks: EvidenceCheck[];
  assets: string[];
  failures: unknown[];
}

/** Narrowing type guard for an arbitrary value being an `EvidenceStatus`. */
export function isEvidenceStatus(value: unknown): value is EvidenceStatus {
  return typeof value === 'string' && (EVIDENCE_STATUSES as readonly string[]).includes(value);
}

/** Narrowing type guard for an arbitrary value being a `GeneratedBy`. */
export function isGeneratedBy(value: unknown): value is GeneratedBy {
  return typeof value === 'string' && (GENERATED_BY_VALUES as readonly string[]).includes(value);
}

/** Narrowing type guard for an arbitrary value being a `CheckResult`. */
export function isCheckResult(value: unknown): value is CheckResult {
  return typeof value === 'string' && (CHECK_RESULTS as readonly string[]).includes(value);
}

/**
 * Structural validation of a parsed value against the `EvidenceArtifact` envelope.
 *
 * Returns `true` only when the required fields are present and the closed-enum
 * fields hold allowed values. Mirrors the strictness of the Python `from_dict`
 * helper so a TS gate cannot emit an out-of-contract artifact unnoticed.
 */
export function isEvidenceArtifact(value: unknown): value is EvidenceArtifact {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const obj = value as Record<string, unknown>;
  return (
    typeof obj.gate_id === 'string' &&
    obj.gate_id.length > 0 &&
    typeof obj.requirement === 'string' &&
    obj.requirement.length > 0 &&
    isEvidenceStatus(obj.status) &&
    typeof obj.generated_at === 'string' &&
    isGeneratedBy(obj.generated_by) &&
    typeof obj.summary === 'string' &&
    Array.isArray(obj.checks) &&
    Array.isArray(obj.assets) &&
    Array.isArray(obj.failures)
  );
}

/** Current UTC time as a second-precision ISO-8601 `...Z` string (mirror of `utc_now_iso`). */
export function utcNowIso(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
}

/** Serialize an artifact to a stable, human-reviewable JSON string. */
export function toJson(artifact: EvidenceArtifact, indent = 2): string {
  return JSON.stringify(artifact, null, indent);
}
