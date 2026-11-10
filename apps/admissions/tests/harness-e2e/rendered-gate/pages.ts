/**
 * The Audited_Page_Set and the world it needs (platform-simplification task 22.1,
 * design 12.7, Requirement 19.2).
 *
 * Every state is built by this file's own setup, over the harness API helpers, on top
 * of Spec A's seed (`harness_seed_tenants`): nothing here assumes that seed data
 * already holds a draft, a submitted application or a scoped admin.
 *
 * The wizard is visited at `/student/application-wizard`, never at its `/apply` alias,
 * which is not a Student_Route.
 */
import { expect, type Page } from '../harness-fixtures';
import {
  assignOffering,
  createDraftApplication,
  createFee,
  createIntake,
  freshContext,
  linkIntake,
  listCanonicalPrograms,
  persistMinimumGrades,
  superAdminContext,
  SUPERADMIN_EMAIL,
  SUPERADMIN_PASSWORD,
  uploadDocument,
  type AuthedContext,
} from '../helpers/api';
import { createScopedTenantAdmin } from '../helpers/two-tenant';
import { seededInstitutionId, settled } from '../helpers/surfaces-13-3';

export interface Credentials {
  email: string;
  password: string;
}

export interface GateWorld {
  admin: AuthedContext;
  institutionId: string;
  /** Registered, no application: the empty dashboard. */
  emptyStudent: Credentials;
  /** One draft that has grades and the identity and result documents: every wizard step. */
  draftStudent: Credentials & { draftId: string };
  /** One submitted application with a fee still owed: workspace and payment page. */
  submittedStudent: Credentials & { applicationId: string; fullName: string };
  tenantAdmin: Credentials;
}

export type AuditedAuth = 'public' | 'emptyStudent' | 'draftStudent' | 'submittedStudent' | 'tenantAdmin' | 'superAdmin';

export interface AuditedPage {
  /** Stable baseline key. Starts with the route path so the font-size rule can scope itself. */
  id: string;
  auth: AuditedAuth;
  url: (world: GateWorld) => string;
  ready: (page: Page, world: GateWorld) => Promise<void>;
  /** Extra steps after `ready`, for example opening the admin review. */
  prepare?: (page: Page, world: GateWorld) => Promise<void>;
}

/** The font-size rule's scope: a Student_Route (the path starts with `/student`). */
export function isStudentRoute(id: string): boolean {
  return id.startsWith('/student');
}

const STUDENT_PASSWORD = 'HarnessStudent123';

async function registerStudent(label: string, stamp: string): Promise<Credentials> {
  const ctx = await freshContext();
  const email = `harness.rendered.${label}.${stamp}@example.com`;
  const register = await ctx.post('/api/v1/auth/register/', {
    data: { email, password: STUDENT_PASSWORD, first_name: 'Harness', last_name: 'Rendered' },
  });
  expect(register.ok(), `the ${label} applicant should register (got ${register.status()})`).toBeTruthy();
  await ctx.dispose();
  return { email, password: STUDENT_PASSWORD };
}

async function studentSession(creds: Credentials): Promise<{ ctx: Awaited<ReturnType<typeof freshContext>>; csrf: string }> {
  const ctx = await freshContext();
  const login = await ctx.post('/api/v1/auth/login/', { data: creds });
  expect(login.ok(), `${creds.email} should log in (got ${login.status()})`).toBeTruthy();
  const csrf = login.headers()['x-csrf-token'] || '';
  expect(csrf, 'login should return an X-CSRF-Token header').toBeTruthy();
  return { ctx, csrf };
}

export async function buildGateWorld(): Promise<GateWorld> {
  const admin = await superAdminContext();
  const stamp = `${Date.now()}`.slice(-8);
  const canonicals = await listCanonicalPrograms(admin);
  expect(canonicals.length, 'the harness catalogue should publish a canonical programme').toBeGreaterThan(0);
  const canonicalProgramId = String(canonicals[0].id);
  const { intakeId } = await createIntake(admin, {
    name: `Rendered gate intake ${stamp}`,
    year: new Date().getFullYear() + 1,
  });
  const institutionId = await seededInstitutionId(admin, 'MIHAS');
  const { offeringId } = await assignOffering(admin, institutionId, {
    canonical_program_id: canonicalProgramId,
    name: `Rendered gate offering ${stamp}`,
    code: `RG${stamp}`,
  });
  await linkIntake(admin, { program_id: offeringId, intake_id: intakeId, max_capacity: 60 });
  await createFee(admin, offeringId, { amount: '153.00' });

  const emptyStudent = await registerStudent('empty', stamp);

  const draft = await registerStudent('draft', stamp);
  const draftSession = await studentSession(draft);
  const { applicationId: draftId } = await createDraftApplication(draftSession.ctx, draftSession.csrf, {
    canonicalProgramId,
    intakeId,
    email: draft.email,
    fullName: `Rendered Gate Draft ${stamp}`,
  });
  await persistMinimumGrades(draftSession.ctx, draftSession.csrf, draftId);
  await uploadDocument(draftSession.ctx, draftSession.csrf, draftId, 'nrc');
  await uploadDocument(draftSession.ctx, draftSession.csrf, draftId, 'result_slip');
  await draftSession.ctx.dispose();

  const submitted = await registerStudent('submitted', stamp);
  const submittedSession = await studentSession(submitted);
  const fullName = `Rendered Gate Submitted ${stamp}`;
  const { applicationId } = await createDraftApplication(submittedSession.ctx, submittedSession.csrf, {
    canonicalProgramId,
    intakeId,
    email: submitted.email,
    fullName,
  });
  await persistMinimumGrades(submittedSession.ctx, submittedSession.csrf, applicationId);
  await uploadDocument(submittedSession.ctx, submittedSession.csrf, applicationId, 'nrc');
  await uploadDocument(submittedSession.ctx, submittedSession.csrf, applicationId, 'result_slip');
  await submittedSession.ctx.dispose();
  const review = await admin.ctx.post(`/api/v1/applications/${applicationId}/review/`, {
    headers: { 'x-csrf-token': admin.csrf },
    data: { new_status: 'submitted', notes: 'rendered gate setup' },
  });
  expect(review.ok(), `submission should succeed (got ${review.status()}: ${await review.text()})`).toBeTruthy();

  const scoped = await createScopedTenantAdmin(admin, institutionId, 'rendered');

  return {
    admin,
    institutionId,
    emptyStudent,
    draftStudent: { ...draft, draftId },
    submittedStudent: { ...submitted, applicationId, fullName },
    tenantAdmin: { email: scoped.email, password: scoped.password },
  };
}

export function credentialsFor(world: GateWorld, auth: AuditedAuth): Credentials | null {
  switch (auth) {
    case 'public':
      return null;
    case 'emptyStudent':
      return world.emptyStudent;
    case 'draftStudent':
      return world.draftStudent;
    case 'submittedStudent':
      return world.submittedStudent;
    case 'tenantAdmin':
      return world.tenantAdmin;
    case 'superAdmin':
      return { email: SUPERADMIN_EMAIL, password: SUPERADMIN_PASSWORD };
  }
}

export async function signIn(page: Page, creds: Credentials): Promise<void> {
  const login = await page.request.post('/api/v1/auth/login/', { data: creds });
  expect(login.ok(), `${creds.email} should log in (got ${login.status()})`).toBeTruthy();
}

async function mainVisible(page: Page): Promise<void> {
  await settled(page);
  await expect(page.locator('main').first()).toBeVisible({ timeout: 45_000 });
}

function wizardStep(step: string, testId: string): AuditedPage {
  return {
    id: `/student/application-wizard#${step}`,
    auth: 'draftStudent',
    url: (w) => `/student/application-wizard?mode=resume&draftId=${w.draftStudent.draftId}&step=${step}`,
    ready: async (page) => {
      await settled(page);
      await expect(page.getByTestId('wizard-action-bar')).toBeVisible({ timeout: 60_000 });
      await expect(page.getByTestId(testId)).toBeVisible({ timeout: 60_000 });
    },
  };
}

export const AUDITED_PAGES: AuditedPage[] = [
  {
    id: '/',
    auth: 'public',
    url: () => '/',
    ready: async (page) => {
      await settled(page);
      await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible({ timeout: 45_000 });
    },
  },
  {
    id: '/auth/signin',
    auth: 'public',
    url: () => '/auth/signin',
    ready: async (page) => {
      await settled(page);
      await expect(page.locator('form').first()).toBeVisible({ timeout: 45_000 });
    },
  },
  {
    id: '/auth/signup',
    auth: 'public',
    url: () => '/auth/signup',
    ready: async (page) => {
      await settled(page);
      await expect(page.locator('form').first()).toBeVisible({ timeout: 45_000 });
    },
  },
  {
    id: '/track-application',
    auth: 'public',
    url: () => '/track-application',
    ready: async (page) => {
      await settled(page);
      await expect(page.getByRole('heading', { name: /Track (your )?application/i }).first()).toBeVisible({
        timeout: 45_000,
      });
    },
  },
  {
    id: '/student/dashboard#empty',
    auth: 'emptyStudent',
    url: () => '/student/dashboard',
    ready: mainVisible,
  },
  {
    id: '/student/dashboard#draft',
    auth: 'draftStudent',
    url: () => '/student/dashboard',
    ready: async (page) => {
      await settled(page);
      await expect(page.getByTestId('student-next-action')).toBeVisible({ timeout: 45_000 });
    },
  },
  wizardStep('program', 'program-step'),
  wizardStep('assignedSchool', 'assigned-school-step'),
  wizardStep('personal', 'basic-kyc-step'),
  wizardStep('education', 'education-step'),
  wizardStep('payment', 'payment-step'),
  wizardStep('submit', 'submit-step'),
  {
    id: '/student/application/:id/status',
    auth: 'submittedStudent',
    url: (w) => `/student/application/${w.submittedStudent.applicationId}/status`,
    ready: mainVisible,
  },
  {
    id: '/student/payment',
    auth: 'submittedStudent',
    url: () => '/student/payment',
    ready: mainVisible,
  },
  {
    id: '/student/settings',
    auth: 'draftStudent',
    url: () => '/student/settings',
    ready: mainVisible,
  },
  {
    id: '/admin/applications',
    auth: 'tenantAdmin',
    url: () => '/admin/applications',
    ready: async (page) => {
      await settled(page);
      await expect(page.getByRole('button', { name: /open review/i }).first()).toBeVisible({ timeout: 60_000 });
    },
  },
  {
    id: '/admin/applications#review',
    auth: 'tenantAdmin',
    url: () => '/admin/applications',
    ready: async (page) => {
      await settled(page);
      await expect(page.getByRole('button', { name: /open review/i }).first()).toBeVisible({ timeout: 60_000 });
    },
    prepare: async (page) => {
      await page.getByRole('button', { name: /open review/i }).first().click();
      await expect(page.getByTestId('review-workspace')).toBeVisible({ timeout: 30_000 });
      // The dialog fades and zooms in (200 ms); a capture or an axe pass taken mid-fade
      // measures a translucent dialog over the scrim. Wait until it is fully opaque.
      await page.waitForFunction(() => {
        const el = document.querySelector('[data-testid="review-workspace"]');
        if (!el) return false;
        let node: Element | null = el;
        while (node) {
          if (parseFloat(getComputedStyle(node).opacity) < 1) return false;
          node = node.parentElement;
        }
        return true;
      });
      await page.waitForTimeout(400);
    },
  },
  {
    id: '/admin/tenants#superAdmin',
    auth: 'superAdmin',
    url: () => '/admin/tenants',
    ready: mainVisible,
  },
  {
    id: '/admin/tenants#tenantAdmin',
    auth: 'tenantAdmin',
    url: () => '/admin/tenants',
    ready: mainVisible,
  },
];
