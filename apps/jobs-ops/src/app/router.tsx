import { createBrowserRouter } from 'react-router-dom'

import { JobsOpsShell } from '@/app/layout/JobsOpsShell'
import { ProtectedRoute } from '@/auth/ProtectedRoute'
import { ReportsPage } from '@/features/analytics/pages/ReportsPage'
import { AuditLogPage } from '@/features/audit/pages/AuditLogPage'
import { AutomationRunsPage } from '@/features/automation/pages/AutomationRunsPage'
import { ResumeLabPage } from '@/features/documents/pages/ResumeLabPage'
import { EmailOpsPage } from '@/features/email/pages/EmailOpsPage'
import { IntegrationsPage } from '@/features/integrations/pages/IntegrationsPage'
import { JobApplicationsPage } from '@/features/job-applications/pages/JobApplicationsPage'
import { JobDetailPage } from '@/features/jobs/pages/JobDetailPage'
import { JobsInboxPage } from '@/features/jobs/pages/JobsInboxPage'
import { OverviewPage } from '@/features/overview/pages/OverviewPage'
import { OutreachCRMPage } from '@/features/outreach/pages/OutreachCRMPage'
import { ReviewWorkbenchPage } from '@/features/review/pages/ReviewWorkbenchPage'
import { SourceHealthPage } from '@/features/sources/pages/SourceHealthPage'

export const router = createBrowserRouter([
  {
    path: '/',
    element: (
      <ProtectedRoute>
        <JobsOpsShell />
      </ProtectedRoute>
    ),
    children: [
      { index: true, element: <OverviewPage /> },
      { path: 'jobs', element: <JobsInboxPage /> },
      { path: 'jobs/:jobId', element: <JobDetailPage /> },
      { path: 'job-applications', element: <JobApplicationsPage /> },
      { path: 'automation/runs', element: <AutomationRunsPage /> },
      { path: 'outreach/contacts', element: <OutreachCRMPage /> },
      { path: 'email/threads', element: <EmailOpsPage /> },
      { path: 'documents/resumes', element: <ResumeLabPage /> },
      { path: 'integrations', element: <IntegrationsPage /> },
      { path: 'sources', element: <SourceHealthPage /> },
      { path: 'reports', element: <ReportsPage /> },
      { path: 'review', element: <ReviewWorkbenchPage /> },
      { path: 'audit', element: <AuditLogPage /> },
    ],
  },
])

