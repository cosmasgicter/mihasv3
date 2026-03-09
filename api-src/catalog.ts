import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleCors } from '../lib/cors';
import { query } from '../lib/db';
import { CatalogQueries, SubjectRecord } from '../lib/queries';
import { withArcjetProtection } from '../lib/arcjet';
import { getAuthUser, requireAuth, AuthenticationError, AuthorizationError, type AuthContext } from '../lib/auth/middleware';
import { requireCsrf } from '../lib/csrf';
import { logAuditEvent } from '../lib/auditLogger';
import { handleError, sendSuccess, sendError, HttpStatus } from '../lib/errorHandler';
import { validateServerEnv } from '../lib/envValidator';
import {
  catalogTypeQuerySchema,
  createIntakeBodySchema,
  createInstitutionBodySchema,
  createProgramBodySchema,
  deleteCatalogEntityQuerySchema,
  updateIntakeBodySchema,
  updateInstitutionBodySchema,
  updateProgramBodySchema,
  validateBody,
  validateQuery,
} from '../lib/validation';

interface InstitutionRecord {
  id: string;
  name: string;
  full_name?: string;
  code?: string;
  description?: string;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

interface ProgramRow {
  id: string;
  name: string;
  code: string;
  description: string | null;
  duration_months: number | null;
  application_fee: number | null;
  tuition_fee: number | null;
  regulatory_body: string | null;
  accreditation_status: string | null;
  institution_id: string | null;
  institution_name: string | null;
  institution_full_name: string | null;
  is_active: boolean | null;
  created_at: string;
  updated_at: string;
}

interface IntakeRow {
  id: string;
  name: string;
  year: number | null;
  semester: string | null;
  start_date: string;
  end_date: string;
  application_start_date: string | null;
  application_deadline: string;
  max_capacity: number | null;
  current_enrollment: number | null;
  is_active: boolean | null;
  created_at: string;
  updated_at: string;
}

const ADMIN_ROLES = ['admin', 'super_admin', 'admissions_officer'];

function isAdminRole(role?: string): boolean {
  return Boolean(role && ADMIN_ROLES.includes(role));
}

function normalizeProgram(row: ProgramRow) {
  return {
    id: row.id,
    name: row.name,
    code: row.code,
    description: row.description ?? '',
    duration_months: Number(row.duration_months ?? 0),
    duration_years: Math.ceil(Number(row.duration_months ?? 0) / 12),
    application_fee: Number(row.application_fee ?? 153),
    tuition_fee: row.tuition_fee ? Number(row.tuition_fee) : null,
    regulatory_body: row.regulatory_body,
    accreditation_status: row.accreditation_status,
    institution_id: row.institution_id,
    institutions: row.institution_id ? {
      id: row.institution_id,
      name: row.institution_name ?? '',
      full_name: row.institution_full_name ?? row.institution_name ?? '',
    } : null,
    is_active: row.is_active !== false,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function generateProgramCode(name: string) {
  return name
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 24)
}

function parseDeleteId(req: VercelRequest, res: VercelResponse): string | null {
  const result = deleteCatalogEntityQuerySchema.safeParse({
    id: req.query.id ?? req.body?.id,
  });

  if (!result.success) {
    const firstIssue = result.error.issues[0];
    sendError(res, firstIssue?.message || 'Validation failed', HttpStatus.BAD_REQUEST, 'VALIDATION_ERROR');
    return null;
  }

  return result.data.id;
}

function normalizeInstitution(record: InstitutionRecord) {
  return {
    id: record.id,
    name: record.name,
    full_name: record.full_name ?? record.name,
    code: record.code ?? null,
    description: record.description ?? '',
    is_active: record.is_active !== false,
    created_at: record.created_at,
    updated_at: record.updated_at,
  };
}

function normalizeIntake(row: IntakeRow) {
  return {
    id: row.id,
    name: row.name,
    year: Number(row.year ?? (row.start_date ? new Date(row.start_date).getFullYear() : new Date().getFullYear())),
    semester: row.semester,
    start_date: row.start_date,
    end_date: row.end_date,
    application_start_date: row.application_start_date,
    application_deadline: row.application_deadline,
    max_capacity: Number(row.max_capacity ?? 0),
    current_enrollment: Number(row.current_enrollment ?? 0),
    available_spots: Math.max(0, Number(row.max_capacity ?? 0) - Number(row.current_enrollment ?? 0)),
    is_active: row.is_active !== false,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

async function ensureAdmin(req: VercelRequest, res: VercelResponse) {
  let user: AuthContext;
  try {
    user = await requireAuth(req);
  } catch (error) {
    if (error instanceof AuthenticationError) {
      sendError(res, error.message, error.statusCode, error.code);
      return null;
    }
    throw error;
  }

  if (!isAdminRole(user.role)) {
    sendError(res, 'Insufficient permissions', HttpStatus.FORBIDDEN, 'INSUFFICIENT_PERMISSIONS');
    return null;
  }

  return user;
}

function getHeaderValue(header: string | string[] | undefined): string | null {
  if (Array.isArray(header)) {
    return header[0] ?? null;
  }
  return header ?? null;
}

async function logCatalogAuditEvent(input: {
  req: VercelRequest;
  actorId: string;
  action: string;
  entityType: 'program' | 'intake' | 'institution';
  entityId: string;
  changes?: Record<string, unknown>;
}) {
  const forwardedFor = getHeaderValue(input.req.headers['x-forwarded-for']);
  const ipAddress = forwardedFor ? forwardedFor.split(',')[0]?.trim() ?? null : null;
  const userAgent = getHeaderValue(input.req.headers['user-agent']);

  await logAuditEvent({
    actor_id: input.actorId,
    action: input.action,
    entity_type: input.entityType,
    entity_id: input.entityId,
    changes: input.changes,
    ip_address: ipAddress,
    user_agent: userAgent,
  });
}

async function listPrograms(res: VercelResponse, includeInactive: boolean, shouldCache: boolean) {
  try {
    const result = await query<ProgramRow>(
      `SELECT
        p.id,
        p.name,
        p.code,
        p.description,
        p.duration_months,
        p.application_fee,
        p.tuition_fee,
        p.regulatory_body,
        p.accreditation_status,
        p.institution_id,
        i.name AS institution_name,
        i.full_name AS institution_full_name,
        p.is_active,
        p.created_at,
        p.updated_at
      FROM programs p
      LEFT JOIN institutions i ON i.id = p.institution_id
      WHERE ($1::boolean = true OR p.is_active = true)
      ORDER BY p.name ASC`,
      [includeInactive]
    );

    if (shouldCache) {
      res.setHeader('Cache-Control', 'public, max-age=300');
    }

    return sendSuccess(res, { programs: result.rows.map(normalizeProgram) });
  } catch (error) {
    return handleError(res, error, 'catalog/list-programs');
  }
}

async function listIntakes(res: VercelResponse, includeInactive: boolean, shouldCache: boolean) {
  try {
    const result = await query<IntakeRow>(
      `SELECT
        id,
        name,
        COALESCE(year, EXTRACT(YEAR FROM start_date)::int) AS year,
        semester,
        start_date,
        end_date,
        application_start_date,
        application_deadline,
        COALESCE(max_capacity, 0) AS max_capacity,
        COALESCE(current_enrollment, 0) AS current_enrollment,
        is_active,
        created_at,
        updated_at
      FROM intakes
      WHERE ($1::boolean = true OR is_active = true)
      ORDER BY year DESC, start_date DESC`,
      [includeInactive]
    );

    if (shouldCache) {
      res.setHeader('Cache-Control', 'public, max-age=300');
    }

    return sendSuccess(res, { intakes: result.rows.map(normalizeIntake) });
  } catch (error) {
    return handleError(res, error, 'catalog/list-intakes');
  }
}

async function createProgram(req: VercelRequest, res: VercelResponse, actorId: string) {
  const parsed = validateBody(createProgramBodySchema, req, res);
  if (!parsed) return;

  const name = parsed.name;
  const code = String(parsed.code || generateProgramCode(name)).trim();
  const description = parsed.description ?? '';
  const durationMonths = Number(parsed.duration_months ?? (Number(parsed.duration_years) * 12));
  const applicationFee = parsed.application_fee !== undefined && parsed.application_fee !== null
    ? Number(parsed.application_fee)
    : 153;
  const tuitionFee = parsed.tuition_fee !== undefined ? parsed.tuition_fee : null;
  const regulatoryBody = parsed.regulatory_body ?? null;
  const institutionId = parsed.institution_id;

  try {
    const result = await query<ProgramRow>(
      `INSERT INTO programs (name, code, description, duration_months, application_fee, tuition_fee, regulatory_body, institution_id, is_active, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true, NOW(), NOW())
       RETURNING *`,
      [name, code, description || null, durationMonths, applicationFee, tuitionFee, regulatoryBody, institutionId]
    );

    await logCatalogAuditEvent({
      req,
      actorId,
      action: 'catalog_program_created',
      entityType: 'program',
      entityId: result.rows[0].id,
      changes: {
        code,
        institution_id: institutionId,
        duration_months: durationMonths,
      },
    });

    return sendSuccess(res, { program: normalizeProgram(result.rows[0]) });
  } catch (error) {
    return handleError(res, error, 'catalog/create-program');
  }
}

async function updateProgram(req: VercelRequest, res: VercelResponse, actorId: string) {
  const parsed = validateBody(updateProgramBodySchema, req, res);
  if (!parsed) return;

  const id = parsed.id;
  const name = parsed.name;
  const code = String(parsed.code || generateProgramCode(name)).trim();
  const description = parsed.description ?? '';
  const durationMonths = Number(parsed.duration_months ?? (Number(parsed.duration_years) * 12));
  const applicationFee = parsed.application_fee !== undefined && parsed.application_fee !== null
    ? Number(parsed.application_fee)
    : null;
  const tuitionFee = parsed.tuition_fee !== undefined ? parsed.tuition_fee : null;
  const regulatoryBody = parsed.regulatory_body ?? null;
  const institutionId = parsed.institution_id;
  const isActive = parsed.is_active;

  try {
    const result = await query<ProgramRow>(
      `UPDATE programs
       SET name = $2,
           code = $3,
           description = $4,
           duration_months = $5,
           application_fee = COALESCE($6, application_fee),
           tuition_fee = $7,
           regulatory_body = $8,
           institution_id = $9,
           is_active = COALESCE($10, is_active),
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [id, name, code, description || null, durationMonths, applicationFee, tuitionFee, regulatoryBody, institutionId, isActive ?? null]
    );

    if (result.rowCount === 0) {
      return sendError(res, 'Program not found', HttpStatus.NOT_FOUND);
    }

    await logCatalogAuditEvent({
      req,
      actorId,
      action: 'catalog_program_updated',
      entityType: 'program',
      entityId: result.rows[0].id,
      changes: {
        code,
        institution_id: institutionId,
        is_active: isActive ?? undefined,
      },
    });

    return sendSuccess(res, { program: normalizeProgram(result.rows[0]) });
  } catch (error) {
    return handleError(res, error, 'catalog/update-program');
  }
}

async function deleteProgram(req: VercelRequest, res: VercelResponse, actorId: string) {
  const id = parseDeleteId(req, res);
  if (!id) return;

  try {
    const result = await query<{ id: string }>(
      `UPDATE programs
       SET is_active = false,
           updated_at = NOW()
       WHERE id = $1 AND is_active = true
       RETURNING id`,
      [id]
    );

    if (result.rowCount === 0) {
      return sendError(res, 'Program not found or already inactive', HttpStatus.NOT_FOUND);
    }

    await logCatalogAuditEvent({
      req,
      actorId,
      action: 'catalog_program_archived',
      entityType: 'program',
      entityId: result.rows[0].id,
      changes: { is_active: false },
    });

    return sendSuccess(res, { deleted: true, id });
  } catch (error) {
    return handleError(res, error, 'catalog/delete-program');
  }
}

async function listInstitutions(res: VercelResponse, includeInactive: boolean, shouldCache: boolean) {
  try {
    const result = await query<InstitutionRecord>(
      `SELECT id, name, full_name, code, description, is_active, created_at, updated_at
       FROM institutions
       WHERE ($1::boolean = true OR is_active = true)
       ORDER BY full_name ASC, name ASC`,
      [includeInactive]
    );

    if (shouldCache) {
      res.setHeader('Cache-Control', 'public, max-age=300');
    }

    return sendSuccess(res, { institutions: result.rows.map(normalizeInstitution) });
  } catch (error) {
    return handleError(res, error, 'catalog/list-institutions');
  }
}

async function createInstitution(req: VercelRequest, res: VercelResponse, actorId: string) {
  const parsed = validateBody(createInstitutionBodySchema, req, res);
  if (!parsed) return;

  const name = parsed.name;
  const fullName = parsed.full_name || parsed.fullName || name;
  const code = parsed.code || null;
  const description = parsed.description ?? '';

  try {
    const result = await query<InstitutionRecord>(
      `INSERT INTO institutions (name, full_name, code, description, is_active, created_at, updated_at)
       VALUES ($1, $2, $3, $4, true, NOW(), NOW())
       RETURNING id, name, full_name, code, description, is_active, created_at, updated_at`,
      [name, fullName, code, description || null]
    );

    await logCatalogAuditEvent({
      req,
      actorId,
      action: 'catalog_institution_created',
      entityType: 'institution',
      entityId: result.rows[0].id,
      changes: { code, full_name: fullName },
    });

    return sendSuccess(res, { institution: normalizeInstitution(result.rows[0]) });
  } catch (error) {
    return handleError(res, error, 'catalog/create-institution');
  }
}

async function updateInstitution(req: VercelRequest, res: VercelResponse, actorId: string) {
  const parsed = validateBody(updateInstitutionBodySchema, req, res);
  if (!parsed) return;

  const id = parsed.id;
  const name = parsed.name;
  const fullName = parsed.full_name || parsed.fullName || name;
  const code = parsed.code || null;
  const description = parsed.description ?? '';
  const isActive = parsed.is_active;

  try {
    const result = await query<InstitutionRecord>(
      `UPDATE institutions
       SET name = $2,
           full_name = $3,
           code = $4,
           description = $5,
           is_active = COALESCE($6, is_active),
           updated_at = NOW()
       WHERE id = $1
       RETURNING id, name, full_name, code, description, is_active, created_at, updated_at`,
      [id, name, fullName, code, description || null, isActive ?? null]
    );

    if (result.rowCount === 0) {
      return sendError(res, 'Institution not found', HttpStatus.NOT_FOUND);
    }

    await logCatalogAuditEvent({
      req,
      actorId,
      action: 'catalog_institution_updated',
      entityType: 'institution',
      entityId: result.rows[0].id,
      changes: { code, is_active: isActive ?? undefined },
    });

    return sendSuccess(res, { institution: normalizeInstitution(result.rows[0]) });
  } catch (error) {
    return handleError(res, error, 'catalog/update-institution');
  }
}

async function deleteInstitution(req: VercelRequest, res: VercelResponse, actorId: string) {
  const id = parseDeleteId(req, res);
  if (!id) return;

  try {
    const programCount = await query<{ count: string }>(
      `SELECT COUNT(*)::text AS count
       FROM programs
       WHERE institution_id = $1
         AND is_active = true`,
      [id]
    );

    if (Number(programCount.rows[0]?.count ?? '0') > 0) {
      return sendError(res, 'Cannot archive an institution that still has active programs', HttpStatus.CONFLICT);
    }

    const result = await query<{ id: string }>(
      `UPDATE institutions
       SET is_active = false,
           updated_at = NOW()
       WHERE id = $1 AND is_active = true
       RETURNING id`,
      [id]
    );

    if (result.rowCount === 0) {
      return sendError(res, 'Institution not found or already inactive', HttpStatus.NOT_FOUND);
    }

    await logCatalogAuditEvent({
      req,
      actorId,
      action: 'catalog_institution_archived',
      entityType: 'institution',
      entityId: result.rows[0].id,
      changes: { is_active: false },
    });

    return sendSuccess(res, { deleted: true, id });
  } catch (error) {
    return handleError(res, error, 'catalog/delete-institution');
  }
}

async function createIntake(req: VercelRequest, res: VercelResponse, actorId: string) {
  const parsed = validateBody(createIntakeBodySchema, req, res);
  if (!parsed) return;

  const name = parsed.name;
  const year = Number(parsed.year);
  const semester = parsed.semester ?? null;
  const startDate = parsed.start_date;
  const endDate = parsed.end_date;
  const applicationDeadline = parsed.application_deadline;
  const maxCapacity = Number(parsed.max_capacity || parsed.total_capacity);

  try {
    const result = await query<IntakeRow>(
      `INSERT INTO intakes (
        name, year, semester, start_date, end_date, application_deadline,
        max_capacity, current_enrollment, is_active, created_at, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, 0, true, NOW(), NOW())
      RETURNING *`,
      [name, year, semester, startDate, endDate, applicationDeadline, maxCapacity]
    );

    await logCatalogAuditEvent({
      req,
      actorId,
      action: 'catalog_intake_created',
      entityType: 'intake',
      entityId: result.rows[0].id,
      changes: {
        year,
        semester,
        max_capacity: maxCapacity,
      },
    });

    return sendSuccess(res, { intake: normalizeIntake(result.rows[0]) });
  } catch (error) {
    return handleError(res, error, 'catalog/create-intake');
  }
}

async function updateIntake(req: VercelRequest, res: VercelResponse, actorId: string) {
  const parsed = validateBody(updateIntakeBodySchema, req, res);
  if (!parsed) return;

  const id = parsed.id;
  const name = parsed.name;
  const year = Number(parsed.year);
  const semester = parsed.semester ?? null;
  const startDate = parsed.start_date;
  const endDate = parsed.end_date;
  const applicationDeadline = parsed.application_deadline;
  const maxCapacity = Number(parsed.max_capacity || parsed.total_capacity);
  const currentEnrollment = parsed.current_enrollment !== undefined ? Number(parsed.current_enrollment) : null;
  const isActive = parsed.is_active;

  try {
    const result = await query<IntakeRow>(
      `UPDATE intakes
       SET name = $2,
           year = $3,
           semester = $4,
           start_date = $5,
           end_date = $6,
           application_deadline = $7,
           max_capacity = $8,
           current_enrollment = COALESCE($9, current_enrollment),
           is_active = COALESCE($10, is_active),
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [id, name, year, semester, startDate, endDate, applicationDeadline, maxCapacity, currentEnrollment, isActive ?? null]
    );

    if (result.rowCount === 0) {
      return sendError(res, 'Intake not found', HttpStatus.NOT_FOUND);
    }

    await logCatalogAuditEvent({
      req,
      actorId,
      action: 'catalog_intake_updated',
      entityType: 'intake',
      entityId: result.rows[0].id,
      changes: {
        max_capacity: maxCapacity,
        current_enrollment: currentEnrollment ?? undefined,
        is_active: isActive ?? undefined,
      },
    });

    return sendSuccess(res, { intake: normalizeIntake(result.rows[0]) });
  } catch (error) {
    return handleError(res, error, 'catalog/update-intake');
  }
}

async function deleteIntake(req: VercelRequest, res: VercelResponse, actorId: string) {
  const id = parseDeleteId(req, res);
  if (!id) return;

  try {
    const result = await query<{ id: string }>(
      `UPDATE intakes
       SET is_active = false,
           updated_at = NOW()
       WHERE id = $1 AND is_active = true
       RETURNING id`,
      [id]
    );

    if (result.rowCount === 0) {
      return sendError(res, 'Intake not found or already inactive', HttpStatus.NOT_FOUND);
    }

    await logCatalogAuditEvent({
      req,
      actorId,
      action: 'catalog_intake_archived',
      entityType: 'intake',
      entityId: result.rows[0].id,
      changes: { is_active: false },
    });

    return sendSuccess(res, { deleted: true, id });
  } catch (error) {
    return handleError(res, error, 'catalog/delete-intake');
  }
}

/**
 * Consolidated Catalog API
 */
async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleCors(req, res)) return;

  // Validate required environment variables (Req 25.3)
  const envResult = validateServerEnv();
  if (!envResult.valid) {
    const details = envResult.errors.map((e) => e.message).join('; ');
    return sendError(res, `Server misconfiguration: ${details}`, HttpStatus.SERVICE_UNAVAILABLE, 'SERVICE_UNAVAILABLE');
  }

  if (req.method === 'HEAD') {
    return res.status(200).end();
  }

  const parsedQuery = validateQuery(catalogTypeQuerySchema, req, res);
  if (!parsedQuery) return;
  const type = parsedQuery.type;

  try {
    const authUser = await getAuthUser(req);
    const isAdmin = isAdminRole(authUser?.role);

    if (req.method === 'GET') {
      if (type === 'programs') {
        return await listPrograms(res, isAdmin, !authUser);
      }

      if (type === 'intakes') {
        return await listIntakes(res, isAdmin, !authUser);
      }

      if (type === 'subjects') {
        const q = CatalogQueries.getSubjects();
        const result = await query<SubjectRecord>(q.text, q.values);

        if (!authUser) {
          res.setHeader('Cache-Control', 'public, max-age=300');
        }

        return sendSuccess(res, { subjects: result.rows });
      }

      if (type === 'institutions') {
        return await listInstitutions(res, isAdmin, !authUser);
      }

      return sendError(res, 'Invalid type. Use: programs, intakes, subjects, or institutions', HttpStatus.BAD_REQUEST);
    }

    if (!['POST', 'PUT', 'DELETE'].includes(req.method || '')) {
      return sendError(res, 'Method not allowed', HttpStatus.METHOD_NOT_ALLOWED);
    }

    if (await requireCsrf(req, res)) return;

    if (!['programs', 'intakes', 'institutions'].includes(type)) {
      return sendError(res, 'Write operations are only supported for programs, institutions, and intakes', HttpStatus.BAD_REQUEST);
    }

    const adminUser = await ensureAdmin(req, res);
    if (!adminUser) {
      return;
    }

    if (type === 'programs') {
      if (req.method === 'POST') return await createProgram(req, res, adminUser.userId);
      if (req.method === 'PUT') return await updateProgram(req, res, adminUser.userId);
      return await deleteProgram(req, res, adminUser.userId);
    }

    if (type === 'institutions') {
      if (req.method === 'POST') return await createInstitution(req, res, adminUser.userId);
      if (req.method === 'PUT') return await updateInstitution(req, res, adminUser.userId);
      return await deleteInstitution(req, res, adminUser.userId);
    }

    if (req.method === 'POST') return await createIntake(req, res, adminUser.userId);
    if (req.method === 'PUT') return await updateIntake(req, res, adminUser.userId);
    return await deleteIntake(req, res, adminUser.userId);
  } catch (error) {
    return handleError(res, error, 'catalog');
  }
}

export default withArcjetProtection(handler, 'general');
