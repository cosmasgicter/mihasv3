/**
 * Generated API types barrel export.
 *
 * This file re-exports the auto-generated OpenAPI TypeScript types for use
 * by domain service modules. Pages and components should NOT import from this
 * file directly — they consume domain service modules which expose typed hooks
 * and functions.
 *
 * Regenerate with: ./scripts/generate-api-types.sh
 *
 * @module generated
 */
export type { paths, components, operations } from './api'

// ─── Convenience type aliases for common schema shapes ──────────────────────
// These save service modules from writing components['schemas']['...'] every time.

type Schemas = import('./api').components['schemas']

// Auth domain
export type LoginRequest = Schemas['Login']
export type LoginResponse = Schemas['LoginResponse']
export type RegisterRequest = Schemas['Register']
export type RegisterResponse = Schemas['RegisterResponse']
export type Session = Schemas['Session']
export type SessionResponse = Schemas['SessionResponse']
export type PasswordResetRequest = Schemas['PasswordResetRequest']
export type PasswordResetConfirmRequest = Schemas['PasswordResetConfirm']

// Applications — interviews (reference-converted domain: src/services/interviews.ts)
export type ApplicationInterview = Schemas['ApplicationInterview']
export type ApplicationInterviewWrite = Schemas['ApplicationInterviewWrite']
export type ApplicationInterviewListResponse = Schemas['ApplicationInterviewListResponse']
export type ApplicationInterviewResponse = Schemas['ApplicationInterviewResponse']

// Common
export type ErrorResponse = Schemas['ErrorResponse']
export type AuthMessageResponse = Schemas['AuthMessageResponse']

// Re-export the operations type for endpoint-specific request/response access
export type Operations = import('./api').operations
