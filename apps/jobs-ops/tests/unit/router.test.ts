import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider, Outlet } from 'react-router-dom';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';

// ---------------------------------------------------------------------------
// Mocks — must be declared before any module that depends on them is imported
// ---------------------------------------------------------------------------

vi.mock('@/lib/env', () => ({
  env: { apiBaseUrl: 'http://localhost:8000', demoMode: false },
}));

vi.mock('@/hooks/useVisibilityRevalidation', () => ({
  useVisibilityRevalidation: vi.fn(),
}));

// Stub all feature page components so we don't pull in their heavy deps.
// Each stub renders a marker element we can query for.
vi.mock('@/features/overview/pages/OverviewPage', () => ({
  OverviewPage: () => createElement('div', { 'data-testid': 'page-overview' }, 'OverviewPage'),
}));
vi.mock('@/features/jobs/pages/JobsInboxPage', () => ({
  JobsInboxPage: () => createElement('div', { 'data-testid': 'page-jobs' }, 'JobsInboxPage'),
}));
vi.mock('@/features/jobs/pages/JobDetailPage', () => ({
  JobDetailPage: () => createElement('div', { 'data-testid': 'page-job-detail' }, 'JobDetailPage'),
}));
vi.mock('@/features/job-applications/pages/JobApplicationsPage', () => ({
  JobApplicationsPage: () =>
    createElement('div', { 'data-testid': 'page-job-applications' }, 'JobApplicationsPage'),
}));
vi.mock('@/features/automation/pages/AutomationRunsPage', () => ({
  AutomationRunsPage: () =>
    createElement('div', { 'data-testid': 'page-automation-runs' }, 'AutomationRunsPage'),
}));
vi.mock('@/features/outreach/pages/OutreachCRMPage', () => ({
  OutreachCRMPage: () =>
    createElement('div', { 'data-testid': 'page-outreach' }, 'OutreachCRMPage'),
}));
vi.mock('@/features/email/pages/EmailOpsPage', () => ({
  EmailOpsPage: () => createElement('div', { 'data-testid': 'page-email' }, 'EmailOpsPage'),
}));
vi.mock('@/features/documents/pages/ResumeLabPage', () => ({
  ResumeLabPage: () =>
    createElement('div', { 'data-testid': 'page-resume-lab' }, 'ResumeLabPage'),
}));
vi.mock('@/features/integrations/pages/IntegrationsPage', () => ({
  IntegrationsPage: () =>
    createElement('div', { 'data-testid': 'page-integrations' }, 'IntegrationsPage'),
}));
vi.mock('@/features/sources/pages/SourceHealthPage', () => ({
  SourceHealthPage: () =>
    createElement('div', { 'data-testid': 'page-sources' }, 'SourceHealthPage'),
}));
vi.mock('@/features/analytics/pages/ReportsPage', () => ({
  ReportsPage: () => createElement('div', { 'data-testid': 'page-reports' }, 'ReportsPage'),
}));
vi.mock('@/features/review/pages/ReviewWorkbenchPage', () => ({
  ReviewWorkbenchPage: () =>
    createElement('div', { 'data-testid': 'page-review' }, 'ReviewWorkbenchPage'),
}));
vi.mock('@/features/audit/pages/AuditLogPage', () => ({
  AuditLogPage: () => createElement('div', { 'data-testid': 'page-audit' }, 'AuditLogPage'),
}));

// Stub the shell layout — render Outlet without pulling in sidebar queries
vi.mock('@/app/layout/JobsOpsShell', () => ({
  JobsOpsShell: () => createElement('div', { 'data-testid': 'shell' }, createElement(Outlet)),
}));

// ---------------------------------------------------------------------------
// Imports that use the mocked modules
// ---------------------------------------------------------------------------
import { ProtectedRoute } from '@/auth/ProtectedRoute';
import { AuthProvider } from '@/auth/AuthContext';
import { OverviewPage } from '@/features/overview/pages/OverviewPage';
import { JobsInboxPage } from '@/features/jobs/pages/JobsInboxPage';
import { JobDetailPage } from '@/features/jobs/pages/JobDetailPage';
import { JobApplicationsPage } from '@/features/job-applications/pages/JobApplicationsPage';
import { AutomationRunsPage } from '@/features/automation/pages/AutomationRunsPage';
import { OutreachCRMPage } from '@/features/outreach/pages/OutreachCRMPage';
import { EmailOpsPage } from '@/features/email/pages/EmailOpsPage';
import { ResumeLabPage } from '@/features/documents/pages/ResumeLabPage';
import { IntegrationsPage } from '@/features/integrations/pages/IntegrationsPage';
import { SourceHealthPage } from '@/features/sources/pages/SourceHealthPage';
import { ReportsPage } from '@/features/analytics/pages/ReportsPage';
import { ReviewWorkbenchPage } from '@/features/review/pages/ReviewWorkbenchPage';
import { AuditLogPage } from '@/features/audit/pages/AuditLogPage';
import { JobsOpsShell } from '@/app/layout/JobsOpsShell';

const BASE = 'http://localhost:8000';

// ---------------------------------------------------------------------------
// MSW server — provides session endpoint for auth bootstrap
// ---------------------------------------------------------------------------
const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: 'bypass' }));
afterEach(() => {
  server.resetHandlers();
});
afterAll(() => server.close());

// ---------------------------------------------------------------------------
// Route config — mirrors the real router.tsx structure
// ---------------------------------------------------------------------------
function buildRoutes() {
  return [
    {
      path: '/',
      element: createElement(ProtectedRoute, null, createElement(JobsOpsShell)),
      children: [
        { index: true, element: createElement(OverviewPage) },
        { path: 'jobs', element: createElement(JobsInboxPage) },
        { path: 'jobs/:jobId', element: createElement(JobDetailPage) },
        { path: 'job-applications', element: createElement(JobApplicationsPage) },
        { path: 'automation/runs', element: createElement(AutomationRunsPage) },
        { path: 'outreach/contacts', element: createElement(OutreachCRMPage) },
        { path: 'email/threads', element: createElement(EmailOpsPage) },
        { path: 'documents/resumes', element: createElement(ResumeLabPage) },
        { path: 'integrations', element: createElement(IntegrationsPage) },
        { path: 'sources', element: createElement(SourceHealthPage) },
        { path: 'reports', element: createElement(ReportsPage) },
        { path: 'review', element: createElement(ReviewWorkbenchPage) },
        { path: 'audit', element: createElement(AuditLogPage) },
      ],
    },
  ];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderRoute(
  initialPath: string,
  options: { authenticated: boolean } = { authenticated: true },
) {
  if (options.authenticated) {
    server.use(
      http.get(`${BASE}/api/v1/auth/session/`, () =>
        HttpResponse.json({
          success: true,
          data: { id: 'u1', email: 'op@example.com', role: 'admin' },
        }),
      ),
    );
  } else {
    server.use(
      http.get(`${BASE}/api/v1/auth/session/`, () =>
        HttpResponse.json({ error: 'Unauthorized' }, { status: 401 }),
      ),
    );
  }

  const memoryRouter = createMemoryRouter(buildRoutes(), {
    initialEntries: [initialPath],
  });

  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  const result = render(
    createElement(
      QueryClientProvider,
      { client: queryClient },
      createElement(AuthProvider, null, createElement(RouterProvider, { router: memoryRouter })),
    ),
  );

  return { ...result, queryClient };
}

// ---------------------------------------------------------------------------
// Route definitions — path and expected test-id rendered by the stub
// ---------------------------------------------------------------------------
const ROUTE_TABLE: Array<{ path: string; testId: string; label: string }> = [
  { path: '/', testId: 'page-overview', label: 'Overview (index)' },
  { path: '/jobs', testId: 'page-jobs', label: 'Jobs Inbox' },
  { path: '/jobs/abc-123', testId: 'page-job-detail', label: 'Job Detail' },
  { path: '/job-applications', testId: 'page-job-applications', label: 'Job Applications' },
  { path: '/automation/runs', testId: 'page-automation-runs', label: 'Automation Runs' },
  { path: '/outreach/contacts', testId: 'page-outreach', label: 'Outreach CRM' },
  { path: '/email/threads', testId: 'page-email', label: 'Email Ops' },
  { path: '/documents/resumes', testId: 'page-resume-lab', label: 'Resume Lab' },
  { path: '/integrations', testId: 'page-integrations', label: 'Integrations' },
  { path: '/sources', testId: 'page-sources', label: 'Source Health' },
  { path: '/reports', testId: 'page-reports', label: 'Reports' },
  { path: '/review', testId: 'page-review', label: 'Review Workbench' },
  { path: '/audit', testId: 'page-audit', label: 'Audit Log' },
];

// ---------------------------------------------------------------------------
// Tests: all defined routes resolve to components
// ---------------------------------------------------------------------------

describe('Router — all defined routes resolve to components', () => {
  ROUTE_TABLE.forEach(({ path, testId, label }) => {
    it(`renders ${label} at "${path}"`, async () => {
      renderRoute(path, { authenticated: true });

      await waitFor(() => {
        expect(screen.getByTestId(testId)).toBeInTheDocument();
      });
    });
  });
});

// ---------------------------------------------------------------------------
// Tests: ProtectedRoute renders standalone regardless of auth state
// ---------------------------------------------------------------------------
//
// jobs-ops renders standalone (see ProtectedRoute.tsx docstring): read
// endpoints are public scaffold routes (AllowAny on the backend) and risky
// write actions stay backend-policy-gated, so the shell must never hard-
// redirect an unauthenticated visitor away from the dashboard UI. This
// replaces an earlier version of this test suite that asserted the opposite
// (a hard redirect to a sign-in page) — that assertion predated the
// intentional architecture change to a no-op ProtectedRoute and was never
// updated to match, leaving these two tests failing against current,
// correct behavior.

describe('Router — ProtectedRoute renders standalone (no redirect)', () => {
  it('renders page content at "/" when unauthenticated', async () => {
    renderRoute('/', { authenticated: false });

    await waitFor(() => {
      expect(screen.getByTestId('page-overview')).toBeInTheDocument();
    });
    expect(screen.getByTestId('shell')).toBeInTheDocument();
  });

  it('renders page content at "/jobs" when unauthenticated', async () => {
    renderRoute('/jobs', { authenticated: false });

    await waitFor(() => {
      expect(screen.getByTestId('page-jobs')).toBeInTheDocument();
    });
    expect(screen.getByTestId('shell')).toBeInTheDocument();
  });
});
