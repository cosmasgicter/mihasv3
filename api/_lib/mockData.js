import { randomUUID } from 'node:crypto'

const now = new Date()

const mockUsers = [
  {
    id: 'user-student-1',
    email: 'cosmaskanchepa8@gmail.com',
    password: 'Beanola2025',
    first_name: 'Cosmas',
    last_name: 'Kanchepa',
    roles: ['student'],
    metadata: {
      phone: '+260971000001',
      programme_interest: 'Registered Nursing'
    }
  },
  {
    id: 'user-admin-1',
    email: 'cosmas@beanola.com',
    password: 'Beanola2025',
    first_name: 'Cosmas',
    last_name: 'Mihas',
    roles: ['admin', 'admissions_officer'],
    metadata: {
      phone: '+260971000002'
    }
  }
]

const mockInstitutions = [
  {
    id: 'inst-1',
    name: 'MIHAS',
    full_name: 'Midlands Health Allied Sciences',
    slug: 'mhas'
  }
]

const mockPrograms = [
  {
    id: 'prog-1',
    name: 'Registered Nursing',
    description: 'Diploma programme focused on core nursing competencies.',
    duration: '3 Years',
    is_active: true,
    created_at: new Date(now.getFullYear() - 1, 5, 10).toISOString(),
    institutions: mockInstitutions[0]
  },
  {
    id: 'prog-2',
    name: 'Clinical Medicine',
    description: 'Clinical sciences with a focus on diagnostics and patient care.',
    duration: '4 Years',
    is_active: true,
    created_at: new Date(now.getFullYear() - 1, 8, 15).toISOString(),
    institutions: mockInstitutions[0]
  },
  {
    id: 'prog-3',
    name: 'Pharmacy Technology',
    description: 'Technical diploma covering pharmaceutical dispensing and regulation.',
    duration: '3 Years',
    is_active: true,
    created_at: new Date(now.getFullYear() - 2, 2, 20).toISOString(),
    institutions: mockInstitutions[0]
  }
]

const mockSubjects = [
  { id: 'sub-1', code: 'BIO', name: 'Biology', is_active: true },
  { id: 'sub-2', code: 'CHE', name: 'Chemistry', is_active: true },
  { id: 'sub-3', code: 'ENG', name: 'English', is_active: true },
  { id: 'sub-4', code: 'MTH', name: 'Mathematics', is_active: true }
]

const mockIntakes = [
  {
    id: 'intake-jan',
    name: 'January 2025 Intake',
    description: 'Primary intake for the academic year 2025.',
    application_deadline: new Date(now.getFullYear(), 0, 15).toISOString(),
    orientation_date: new Date(now.getFullYear(), 0, 28).toISOString(),
    is_active: true
  },
  {
    id: 'intake-may',
    name: 'May 2025 Intake',
    description: 'Mid-year intake focusing on health sciences programmes.',
    application_deadline: new Date(now.getFullYear(), 4, 30).toISOString(),
    orientation_date: new Date(now.getFullYear(), 5, 12).toISOString(),
    is_active: true
  },
  {
    id: 'intake-sep',
    name: 'September 2025 Intake',
    description: 'Late year intake for bridging and conversion courses.',
    application_deadline: new Date(now.getFullYear(), 8, 10).toISOString(),
    orientation_date: new Date(now.getFullYear(), 8, 24).toISOString(),
    is_active: true
  }
]

const mockApplications = [
  {
    id: 'app-001',
    applicant_name: 'Cosmas Kanchepa',
    program_id: 'prog-1',
    user_id: 'user-student-1',
    status: 'submitted',
    created_at: new Date(now.getFullYear(), 0, 6).toISOString(),
    updated_at: new Date(now.getFullYear(), 0, 7).toISOString(),
    intake_id: 'intake-jan'
  },
  {
    id: 'app-002',
    applicant_name: 'Linda Mwila',
    program_id: 'prog-2',
    user_id: 'user-student-1',
    status: 'under_review',
    created_at: new Date(now.getFullYear(), 1, 14).toISOString(),
    updated_at: new Date(now.getFullYear(), 1, 20).toISOString(),
    intake_id: 'intake-may'
  },
  {
    id: 'app-003',
    applicant_name: 'John Banda',
    program_id: 'prog-3',
    user_id: 'user-student-1',
    status: 'approved',
    created_at: new Date(now.getFullYear(), 2, 3).toISOString(),
    updated_at: new Date(now.getFullYear(), 2, 12).toISOString(),
    intake_id: 'intake-may'
  },
  {
    id: 'app-004',
    applicant_name: 'Mary Zulu',
    program_id: 'prog-2',
    user_id: 'user-student-1',
    status: 'rejected',
    created_at: new Date(now.getFullYear(), 3, 18).toISOString(),
    updated_at: new Date(now.getFullYear(), 3, 25).toISOString(),
    intake_id: 'intake-sep'
  }
]

const mockConsents = [
  {
    id: 'consent-1',
    user_id: 'user-student-1',
    consent_type: 'marketing_emails',
    granted: true,
    granted_at: new Date(now.getFullYear(), 0, 2).toISOString(),
    granted_by: 'user-student-1',
    revoked_at: null,
    revoked_by: null,
    source: 'self_service',
    metadata: { channel: 'web' }
  }
]

const mockPushSubscriptions = [
  {
    id: 'sub-1',
    user_id: 'user-student-1',
    endpoint: 'https://example.com/push/endpoint/1',
    subscription: {
      endpoint: 'https://example.com/push/endpoint/1',
      keys: {
        auth: 'auth-key-1',
        p256dh: 'p256dh-key-1'
      }
    },
    auth_key: 'auth-key-1',
    p256dh_key: 'p256dh-key-1',
    expiration_time: null,
    user_agent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
    created_at: new Date(now.getFullYear(), 0, 4).toISOString(),
    updated_at: new Date(now.getFullYear(), 0, 4).toISOString()
  }
]

const mockEmailNotifications = []

const mockAuditEvents = [
  {
    id: randomUUID(),
    actor_id: 'user-admin-1',
    action: 'user.login',
    target: 'user-student-1',
    created_at: new Date(now.getFullYear(), 0, 1).toISOString()
  },
  {
    id: randomUUID(),
    actor_id: 'user-admin-1',
    action: 'application.review.started',
    target: 'app-002',
    created_at: new Date(now.getFullYear(), 1, 20).toISOString()
  }
]

const mockDatabase = {
  programs: mockPrograms,
  institutions: mockInstitutions,
  grade12_subjects: mockSubjects,
  intakes: mockIntakes,
  applications_new: mockApplications,
  user_consents: mockConsents,
  push_subscriptions: mockPushSubscriptions,
  email_notifications: mockEmailNotifications,
  audit_events: mockAuditEvents
}

export {
  mockUsers,
  mockPrograms,
  mockSubjects,
  mockIntakes,
  mockApplications,
  mockConsents,
  mockPushSubscriptions,
  mockEmailNotifications,
  mockAuditEvents,
  mockDatabase
}
