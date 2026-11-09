/**
 * API-side setup for the journey-gate specs that are not about the wizard's early steps
 * (SJR task 4.2). The student is registered and signed in on the seeded school's host
 * through the page's own cookie jar, then a draft is built through the same commands a
 * student's browser sends. The claim each of those specs makes starts after this setup.
 */
import { expect, type APIRequestContext, type Page } from '@playwright/test';
import { createDraftApplication, persistMinimumGrades, uploadDocument } from '../helpers/api';
import { GATE_PASSWORD, GATE_PHONE_LOCAL, gateEmail } from './journey-steps';

export interface SignedInStudent {
  email: string;
  csrf: string;
  ctx: APIRequestContext;
}

function unwrap(json: any): any {
  return json && typeof json === 'object' && 'data' in json ? json.data : json;
}

/**
 * Register a student and sign this page's context in as them, on the run's base URL (the
 * shared portal). The draft is bound to the seeded school by its programme and intake
 * ids, exactly as in a browser; only the host the cookies live on differs from the
 * mobile journey, which registers on the school's own host.
 */
export async function registerAndSignInOnPage(page: Page, tag: string): Promise<SignedInStudent> {
  const ctx = page.request;
  const email = gateEmail(tag);
  const register = await ctx.post('/api/v1/auth/register/', {
    data: { email, password: GATE_PASSWORD, first_name: 'Gate', last_name: 'Student', phone: GATE_PHONE_LOCAL },
  });
  expect(register.ok(), `register should succeed (got ${register.status()})`).toBeTruthy();
  const login = await ctx.post('/api/v1/auth/login/', { data: { email, password: GATE_PASSWORD } });
  expect(login.ok(), `login should succeed (got ${login.status()})`).toBeTruthy();
  const csrf = login.headers()['x-csrf-token'] || '';
  expect(csrf, 'login should return a CSRF token').toBeTruthy();
  return { email, csrf, ctx };
}

/** The seeded school's published programme and its January intake, read as an anonymous visitor. */
export async function seededOffering(ctx: APIRequestContext): Promise<{ canonicalProgramId: string; intakeId: string }> {
  const programs = await ctx.get('/api/v1/catalog/programs/?pageSize=100');
  expect(programs.ok(), 'the portal should list programmes').toBeTruthy();
  const offering = (unwrap(await programs.json()).results as any[] | undefined)?.find(
    (row) => row?.institution?.code === 'MIHAS',
  );
  expect(offering?.canonical_program_id, 'the seeded school should offer a programme').toBeTruthy();
  const intakes = await ctx.get('/api/v1/catalog/intakes/');
  expect(intakes.ok(), 'the school host should list intakes').toBeTruthy();
  const rows: any[] = unwrap(await intakes.json());
  const intake = rows.find((row) => /MIHAS January 2027/.test(row.name));
  expect(intake?.id, 'the seeded school should have its January 2027 intake').toBeTruthy();
  return { canonicalProgramId: offering.canonical_program_id as string, intakeId: intake.id as string };
}

export interface DraftOptions {
  grades?: boolean;
  documents?: boolean;
  deferPayment?: boolean;
}

/** Create a draft for the signed-in student and bring it as far as the options say. */
export async function prepareDraft(student: SignedInStudent, options: DraftOptions): Promise<{ applicationId: string }> {
  const { canonicalProgramId, intakeId } = await seededOffering(student.ctx);
  const { applicationId } = await createDraftApplication(student.ctx, student.csrf, {
    canonicalProgramId,
    intakeId,
    email: student.email,
    phone: '+260971234567',
  });
  if (options.grades) await persistMinimumGrades(student.ctx, student.csrf, applicationId, 5);
  if (options.documents) {
    await uploadDocument(student.ctx, student.csrf, applicationId, 'nrc');
    await uploadDocument(student.ctx, student.csrf, applicationId, 'result_slip');
  }
  if (options.deferPayment) {
    const defer = await student.ctx.post('/api/v1/payments/defer/', {
      headers: { 'x-csrf-token': student.csrf, 'idempotency-key': `gate-defer-${applicationId}` },
      data: { application_id: applicationId },
    });
    expect([200, 201].includes(defer.status()), `defer should succeed (got ${defer.status()})`).toBe(true);
  }
  return { applicationId };
}
