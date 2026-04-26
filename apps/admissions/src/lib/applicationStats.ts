/**
 * Application Statistics Utility
 *
 * Pure functions for computing dashboard statistics from an application list.
 * All stats are derived from the data — no hardcoded or placeholder values.
 *
 * Status categories per spec (Requirement 19):
 *   In-progress = status IN ('draft', 'submitted')
 *   Completed   = status IN ('approved', 'rejected', 'waitlisted')
 *
 * @requirements 19.1, 19.2, 19.3, 19.4, 19.5
 */

export interface ApplicationStatsInput {
  status: string;
}

export interface ApplicationStats {
  /** Count of applications with status 'draft' or 'submitted' */
  inProgress: number;
  /** Count of applications with status 'approved', 'rejected', or 'waitlisted' */
  completed: number;
  /** Total number of applications */
  total: number;
}

const IN_PROGRESS_STATUSES = new Set(['draft', 'submitted', 'under_review', 'conditionally_approved', 'waitlisted']);
const COMPLETED_STATUSES = new Set(['approved', 'enrolled', 'rejected', 'withdrawn', 'expired', 'enrollment_expired']);

/**
 * Compute application statistics from a list of applications.
 *
 * - In-progress = draft | submitted
 * - Completed   = approved | rejected | waitlisted
 * - Total       = all applications regardless of status
 *
 * The sum of inProgress + completed may be less than total when applications
 * have other statuses (e.g. 'under_review').
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
