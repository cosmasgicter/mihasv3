/**
 * Centralized database type definitions.
 *
 * These interfaces were extracted into a dedicated shared types module
 * so every frontend file can import from `@/types/database`.
 * Shapes match the existing interfaces exactly.
 */

/**
 * One reason the platform will not accept an enrollment confirmation
 * (admissions-v2 task 10.3, R13.9). Same registered shape as every other
 * readiness blocker (task 6.5's `ReadinessBlocker`).
 */
export interface EnrollmentBlocker {
  code: string;
  category: string;
  message: string;
  retryable: boolean;
  fields: string[];
  details: Record<string, unknown>;
}

/** One action the student may take next. Never empty while a blocker stands. */
export interface EnrollmentAllowedAction {
  action: string;
  label: string;
  blocker_code: string | null;
}

/**
 * The server-authored answer to "may this application confirm enrollment?"
 * (admissions-v2 task 10.3, R13.2/R13.9, finding STU-15).
 *
 * Published on both the list row and the detail read, and produced by the same
 * evaluator the confirmation command re-runs under its row locks. Nothing here
 * is derived in the browser: the deadline, the countdown, whether a conditional
 * offer's conditions are resolved, whether a seat still exists, and whether the
 * confirm control should exist at all are all the platform's answers. Before
 * 10.3 the browser guessed with `status === 'approved'` and the server, which
 * had always accepted `conditionally_approved` too, disagreed.
 */
export interface EnrollmentReadiness {
  application_id: string;
  status: string;
  /** `confirmable` | `blocked` | `confirmed` | `not_applicable` */
  state: string;
  /** The platform's own words for `state` — rendered, never re-authored. */
  definition: string;
  deadline: string | null;
  deadline_passed: boolean;
  /** Negative once the deadline has passed, so "overdue by" is expressible. */
  seconds_remaining: number | null;
  days_remaining: number | null;
  conditions: {
    total: number;
    accepted: number;
    expired: number;
    outstanding: number;
    outstanding_conditions: Array<{ id: string; state: string; waiting_on: string | null }>;
    satisfied: boolean;
  };
  capacity: {
    canonical: boolean;
    limit: number | null;
    occupied: number | null;
    seats_available: number | null;
    satisfied: boolean;
    code: string | null;
  };
  existing_enrollment: {
    this_application: boolean;
    other_application_id: string | null;
    canonical: boolean;
  };
  blockers: EnrollmentBlocker[];
  can_confirm: boolean;
  allowed_actions: EnrollmentAllowedAction[];
  evaluated_at: string;
}

/**
 * One reason the platform will not accept a submission yet (task 6.5's
 * `ReadinessBlocker`, design §8.3). Same registered shape as
 * {@link EnrollmentBlocker} — one blocker vocabulary, two lifecycle points.
 */
export interface ReadinessBlocker {
  code: string;
  category: string;
  message: string;
  retryable: boolean;
  fields: string[];
  details: Record<string, unknown>;
}

/**
 * One action the student may take next on a pre-submission application, and the
 * blocker it clears. `step` names the wizard step the platform associates with
 * it. Never empty: `build_next_actions` always answers at least one.
 */
export interface ReadinessNextAction {
  action: string;
  label: string;
  step: string;
  blocker_code: string | null;
}

/**
 * The authoritative pre-submission readiness report for one application
 * (admissions-v2 task 6.5, R10.6/R11.2-R11.6/R12.3;
 * `GET /api/v2/student/applications/{id}/readiness/`).
 *
 * Produced by the same evaluator `POST /applications/{id}/submit/` re-runs under
 * its row locks, so the answer a student reads and the decision the platform
 * makes cannot disagree. Only the fields a student surface renders are declared
 * here; the payload carries more (`review_readiness` is staff-only, and the
 * per-section reports belong to the wizard rails, not the dashboard).
 */
export interface ApplicationReadiness {
  application_id: string;
  status: string;
  version: number;
  blockers: ReadinessBlocker[];
  can_submit: boolean;
  allowed_next_actions: ReadinessNextAction[];
  summary: {
    programme?: string | null;
    intake?: string | null;
    institution?: string | null;
    payment_state?: string | null;
    can_submit?: boolean;
    outstanding?: Array<{ code: string; message: string; category: string }>;
    next_actions?: ReadinessNextAction[];
    [key: string]: unknown;
  };
  evaluated_at: string;
}

export interface Application {
  id: string;
  user_id: string;
  /**
   * Optimistic-concurrency token for draft answer writes. The token is authored
   * by the server and must be echoed as `expected_version` on the canonical
   * draft PATCH; clients never increment it locally.
   */
  version?: number;
  /** Optimistic token for the separate assignment reroute command. */
  assignment_version?: number;
  application_number?: string;
  tracking_code?: string;
  status: string;
  institution_id?: string | null;
  program_id?: string | null;
  program_offering_id?: string | null;
  intake_id?: string | null;
  program?: string;
  intake?: string;
  institution?: string;
  full_name?: string;
  email?: string;
  phone?: string;
  nrc?: string;
  nrc_number?: string;
  date_of_birth?: string;
  gender?: string;
  sex?: 'Male' | 'Female' | (string & {});
  nationality?: string;
  address?: string;
  city?: string;
  province?: string;
  country?: string;
  postal_code?: string;
  residence_town?: string;
  next_of_kin_name?: string;
  next_of_kin_phone?: string;
  /**
   * The student's own name for a draft (task 6.2's validated rename field). It
   * has always been on `ApplicationListSerializer`; the frontend type never
   * declared it, so the multi-draft list read it through a cast. Declared by
   * task 11.1, whose draft management renders it.
   */
  draft_name?: string | null;
  /**
   * Server-computed enrollment confirmation deadline (admissions-v2 task 10.3,
   * R13.2/R13.9, finding STU-15). Present on the list row and the detail read.
   */
  enrollment_confirmation_deadline?: string | null;
  /**
   * Server-authored enrollment readiness — the same evaluation
   * `POST /applications/{id}/confirm-enrollment/` re-runs under its row locks.
   * `null` only when the canonical configuration could not be evaluated; an
   * unevaluable configuration is never rendered as "nothing to do".
   */
  enrollment?: EnrollmentReadiness | null;
  result_slip_url?: string;
  extra_kyc_url?: string;
  payment_reference?: string;
  payment_method?: string;
  paid_amount?: string | number;
  paid_at?: string | null;
  application_fee?: string | number;
  /** Server-recorded payment currency (e.g. `ZMW`, `USD`). Never assumed client-side. */
  payment_currency?: string | null;
  receipt_number?: string | null;
  created_at?: string;
  updated_at?: string;
  submitted_at?: string;
  payment_status?: string;
  payment_verified_at?: string;
  payment_verified_by?: string | null;
  payment_verified_by_name?: string | null;
  payment_verified_by_email?: string | null;
  last_payment_audit_id?: string | null;
  last_payment_audit_at?: string | null;
  last_payment_audit_by_name?: string | null;
  last_payment_audit_by_email?: string | null;
  last_payment_audit_notes?: string | null;
  last_payment_reference?: string | null;
  review_started_at?: string;
  decision_date?: string;
  decision_reason?: string;
  admin_feedback?: string;
  [key: string]: unknown;
}

export interface ApplicationInterview {
  id: string;
  application_id: string;
  scheduled_at: string;
  mode: 'in_person' | 'virtual' | 'phone';
  location?: string | null;
  interviewer_id?: string;
  status: 'scheduled' | 'rescheduled' | 'completed' | 'cancelled';
  notes?: string | null;
  program?: string | null;
  application_number?: string | null;
  created_at?: string;
  updated_at?: string;
  /** Legacy field aliases for backward compatibility */
  scheduled_date?: string;
  scheduled_time?: string;
}

export interface Program {
  id: string;
  name: string;
  code?: string;
  description?: string;
  duration_months?: number;
  application_fee?: number;
  tuition_fee?: number;
  institution_id?: string;
  canonical_program_id?: string | null;
  assignment_priority?: number | null;
  offering_status?: string | null;
  institutions?: Institution | null;
  requirements?: Record<string, unknown> | null;
  available_offerings?: Program[];
  regulatory_body?: string;
  accreditation_status?: string;
  is_active?: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface Intake {
  id: string;
  name: string;
  year?: number;
  semester?: string;
  start_date?: string;
  end_date?: string;
  application_start_date?: string;
  application_deadline?: string;
  max_capacity?: number;
  current_enrollment?: number;
  is_active?: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface UserProfile {
  id: string;
  user_id?: string;
  email: string;
  role: string;
  full_name?: string;
  first_name?: string;
  last_name?: string;
  phone?: string;
  date_of_birth?: string;
  sex?: string;
  residence_town?: string;
  nationality?: string;
  next_of_kin_name?: string;
  next_of_kin_phone?: string;
  is_active?: boolean;
  created_at?: string;
  updated_at?: string;
  avatar_url?: string;
  address?: string;
  city?: string;
  province?: string;
  country?: string;
  postal_code?: string;
  [key: string]: unknown;
}

export interface Subject {
  id: string;
  name: string;
  code?: string;
  category?: string;
  is_active?: boolean;
}

export interface ApplicationDocument {
  id: string;
  application_id: string;
  document_type: string;
  /** @deprecated Use document_name instead */
  file_path?: string;
  file_url?: string;
  /** @deprecated Use document_name instead */
  file_name?: string;
  file_size?: number;
  mime_type?: string;
  status?: string;
  document_name?: string;
  verification_status?: string;
  uploaded_at?: string;
  system_generated?: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface ApplicationGrade {
  id: string;
  application_id: string;
  subject_id: string;
  grade: number;
  points?: number;
  created_at?: string;
  updated_at?: string;
}

export interface ApplicationWithDetails extends Application {
  programs?: Program;
  intakes?: Intake;
  documents?: ApplicationDocument[];
  interview?: ApplicationInterview;
}

export interface Institution {
  id: string;
  slug?: string;
  name: string;
  full_name?: string;
  description?: string;
  logo_url?: string;
  contact_email?: string;
  contact_phone?: string;
  address?: string;
  is_active?: boolean;
  created_at?: string;
  updated_at?: string;
}
