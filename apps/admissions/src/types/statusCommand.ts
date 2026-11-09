/**
 * Options a staff status command may carry (SJR R7-c).
 *
 * `conditions` is required by the backend for `conditionally_approved`
 * (`NO_CONDITIONS_PROVIDED` otherwise). `condition_type` is deliberately absent:
 * the backend default applies, so no frontend mirror of `VALID_CONDITION_TYPES`
 * exists.
 */
export interface OfferConditionInput {
  description: string
  /** `YYYY-MM-DD` */
  deadline: string
}

export interface StatusCommandOptions {
  notes?: string
  force?: boolean
  conditions?: OfferConditionInput[]
}

export const MAX_OFFER_CONDITIONS = 10
export const MAX_CONDITION_DESCRIPTION_LENGTH = 500
