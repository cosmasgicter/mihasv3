/**
 * Application Statistics Utility
 *
 * Pure functions for computing dashboard statistics from an application list.
 * All stats are derived from the data — no hardcoded or placeholder values.
 *
 * Status categories per current admissions lifecycle:
 *   In-progress = statuses that still require institution/student action
 *   Completed   = terminal outcome statuses
 *
 * @requirements 19.1, 19.2, 19.3, 19.4, 19.5
 */

export interface ApplicationStatsInput {
  status: string;
}

export interface ApplicationStats {
  /** Count of applications that still need action */
  inProgress: number;
  /** Count of applications in terminal outcome states */
  completed: number;
  /** Total number of applications */
  total: number;
}

const IN_PROGRESS_STATUSES = new Set(['draft', 'submitted', 'under_review', 'conditionally_approved', 'waitlisted']);
const COMPLETED_STATUSES = new Set(['approved', 'enrolled', 'rejected', 'withdrawn', 'expired', 'enrollment_expired']);

/**
 * Compute application statistics from a list of applications.
 *
 * - In-progress = draft | submitted | under_review | conditionally_approved | waitlisted
 * - Completed   = approved | enrolled | rejected | withdrawn | expired | enrollment_expired
 * - Total       = all applications regardless of status
 *
 * The sum of inProgress + completed should equal total for the current canonical
 * lifecycle vocabulary. Unknown future statuses intentionally remain uncategorized.
 */
export function computeApplicationStats(
  applications: ApplicationStatsInput[],
): ApplicationStats {
  let inProgress = 0;
  let completed = 0;

  for (const app of applications) {
    if (IN_PROGRESS_STATUSES.has(app.status)) {
      inProgress++;
    } else if (COMPLETED_STATUSES.has(app.status)) {
      completed++;
    }
  }

  return {
    inProgress,
    completed,
    total: applications.length,
  };
}
