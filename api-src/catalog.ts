import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleCors } from '../lib/cors';
import { query } from '../lib/db';
import { CatalogQueries, SubjectRecord } from '../lib/queries';
import { withArcjetProtection } from '../lib/arcjet';
import { getAuthUser } from '../lib/auth/middleware';
import { handleError, sendSuccess, sendError, HttpStatus } from '../lib/errorHandler';
import { validateServerEnv } from '../lib/envValidator';

interface InstitutionRecord {
  id: string;
  name: string;
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
    is_active: row.is_active !== false,
    created_at: row.created_at,
    updated_at: row.updated_at,
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
  const user = await getAuthUser(req);

  if (!user) {
    sendError(res, 'Authentication required', HttpStatus.UNAUTHORIZED);
    return null;
  }

  if (!isAdminRole(user.role)) {
    sendError(res, 'Forbidden: admin access required', HttpStatus.FORBIDDEN);
    return null;
  }

  return user;
}

async function listPrograms(res: VercelResponse, includeInactive: boolean, shouldCache: boolean) {
  try {
    const result = await query<ProgramRow>(
      `SELECT
        id,
        name,
        code,
        description,
        duration_months,
        application_fee,
        tuition_fee,
        regulatory_body,
        accreditation_status,
        is_active,
        created_at,
        updated_at
      FROM programs
      WHERE ($1::boolean = true OR is_active = true)
      ORDER BY name ASC`,
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

async function createProgram(req: VercelRequest, res: VercelResponse) {
  const body = req.body || {};
  const name = String(body.name || '').trim();
  const code = String(body.code || '').trim();
  const description = typeof body.description === 'string' ? body.description.trim() : '';
  const durationMonths = Number(body.duration_months);
  const applicationFee = body.application_fee !== undefined ? Number(body.application_fee) : 153;
  const tuitionFee = body.tuition_fee !== undefined ? Number(body.tuition_fee) : null;
  const regulatoryBody = typeof body.regulatory_body === 'string' ? body.regulatory_body.trim() : null;

  if (!name) {
    return sendError(res, 'Program name is required', HttpStatus.BAD_REQUEST);
  }
  if (!code) {
    return sendError(res, 'Program code is required', HttpStatus.BAD_REQUEST);
  }
  if (!Number.isFinite(durationMonths) || durationMonths < 1 || durationMonths > 120) {
    return sendError(res, 'duration_months must be between 1 and 120', HttpStatus.BAD_REQUEST);
  }

  try {
    const result = await query<ProgramRow>(
      `INSERT INTO programs (name, code, description, duration_months, application_fee, tuition_fee, regulatory_body, is_active, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, true, NOW(), NOW())
       RETURNING *`,
      [name, code, description || null, durationMonths, applicationFee, tuitionFee, regulatoryBody]
    );

    return sendSuccess(res, { program: normalizeProgram(result.rows[0]) });
  } catch (error) {
    return handleError(res, error, 'catalog/create-program');
  }
}

async function updateProgram(req: VercelRequest, res: VercelResponse) {
  const body = req.body || {};
  const id = String(body.id || '').trim();
  const name = String(body.name || '').trim();
  const code = String(body.code || '').trim();
  const description = typeof body.description === 'string' ? body.description.trim() : '';
  const durationMonths = Number(body.duration_months);
  const applicationFee = body.application_fee !== undefined ? Number(body.application_fee) : null;
  const tuitionFee = body.tuition_fee !== undefined ? Number(body.tuition_fee) : null;
  const regulatoryBody = typeof body.regulatory_body === 'string' ? body.regulatory_body.trim() : null;
  const isActive = typeof body.is_active === 'boolean' ? body.is_active : undefined;

  if (!id) {
    return sendError(res, 'Program id is required', HttpStatus.BAD_REQUEST);
  }
  if (!name) {
    return sendError(res, 'Program name is required', HttpStatus.BAD_REQUEST);
  }
  if (!code) {
    return sendError(res, 'Program code is required', HttpStatus.BAD_REQUEST);
  }
  if (!Number.isFinite(durationMonths) || durationMonths < 1 || durationMonths > 120) {
    return sendError(res, 'duration_months must be between 1 and 120', HttpStatus.BAD_REQUEST);
  }

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
           is_active = COALESCE($9, is_active),
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [id, name, code, description || null, durationMonths, applicationFee, tuitionFee, regulatoryBody, isActive ?? null]
    );

    if (result.rowCount === 0) {
      return sendError(res, 'Program not found', HttpStatus.NOT_FOUND);
    }

    return sendSuccess(res, { program: normalizeProgram(result.rows[0]) });
  } catch (error) {
    return handleError(res, error, 'catalog/update-program');
  }
}

async function deleteProgram(req: VercelRequest, res: VercelResponse) {
  const body = req.body || {};
  const id = String(body.id || req.query.id || '').trim();

  if (!id) {
    return sendError(res, 'Program id is required', HttpStatus.BAD_REQUEST);
  }

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

    return sendSuccess(res, { deleted: true, id });
  } catch (error) {
    return handleError(res, error, 'catalog/delete-program');
  }
}

async function createIntake(req: VercelRequest, res: VercelResponse) {
  const body = req.body || {};
  const name = String(body.name || '').trim();
  const year = Number(body.year);
  const semester = typeof body.semester === 'string' ? body.semester.trim() : null;
  const startDate = String(body.start_date || '').trim();
  const endDate = String(body.end_date || '').trim();
  const applicationDeadline = String(body.application_deadline || '').trim();
  const maxCapacity = Number(body.max_capacity || body.total_capacity);

  if (!name || !startDate || !endDate || !applicationDeadline) {
    return sendError(res, 'name, start_date, end_date, and application_deadline are required', HttpStatus.BAD_REQUEST);
  }

  if (!Number.isFinite(year) || year < 2000) {
    return sendError(res, 'Valid year is required', HttpStatus.BAD_REQUEST);
  }

  if (!Number.isFinite(maxCapacity) || maxCapacity < 1) {
    return sendError(res, 'max_capacity must be at least 1', HttpStatus.BAD_REQUEST);
  }

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

    return sendSuccess(res, { intake: normalizeIntake(result.rows[0]) });
  } catch (error) {
    return handleError(res, error, 'catalog/create-intake');
  }
}

async function updateIntake(req: VercelRequest, res: VercelResponse) {
  const body = req.body || {};
  const id = String(body.id || '').trim();
  const name = String(body.name || '').trim();
  const year = Number(body.year);
  const semester = typeof body.semester === 'string' ? body.semester.trim() : null;
  const startDate = String(body.start_date || '').trim();
  const endDate = String(body.end_date || '').trim();
  const applicationDeadline = String(body.application_deadline || '').trim();
  const maxCapacity = Number(body.max_capacity || body.total_capacity);
  const currentEnrollment = body.current_enrollment !== undefined ? Number(body.current_enrollment) : null;
  const isActive = typeof body.is_active === 'boolean' ? body.is_active : undefined;

  if (!id) {
    return sendError(res, 'Intake id is required', HttpStatus.BAD_REQUEST);
  }
  if (!name || !startDate || !endDate || !applicationDeadline) {
    return sendError(res, 'name, start_date, end_date, and application_deadline are required', HttpStatus.BAD_REQUEST);
  }
  if (!Number.isFinite(year) || year < 2000) {
    return sendError(res, 'Valid year is required', HttpStatus.BAD_REQUEST);
  }
  if (!Number.isFinite(maxCapacity) || maxCapacity < 1) {
    return sendError(res, 'max_capacity must be at least 1', HttpStatus.BAD_REQUEST);
  }

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

    return sendSuccess(res, { intake: normalizeIntake(result.rows[0]) });
  } catch (error) {
    return handleError(res, error, 'catalog/update-intake');
  }
}

async function deleteIntake(req: VercelRequest, res: VercelResponse) {
  const body = req.body || {};
  const id = String(body.id || req.query.id || '').trim();

  if (!id) {
    return sendError(res, 'Intake id is required', HttpStatus.BAD_REQUEST);
  }

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

  const type = (req.query.type as string) || 'programs';

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
        const result = await query<InstitutionRecord>(
          'SELECT * FROM institutions WHERE is_active = true ORDER BY name ASC'
        );

        if (!authUser) {
          res.setHeader('Cache-Control', 'public, max-age=300');
        }

        return sendSuccess(res, { institutions: result.rows });
      }

      return sendError(res, 'Invalid type. Use: programs, intakes, subjects, or institutions', HttpStatus.BAD_REQUEST);
    }

    if (!['POST', 'PUT', 'DELETE'].includes(req.method || '')) {
      return sendError(res, 'Method not allowed', HttpStatus.METHOD_NOT_ALLOWED);
    }

    if (type !== 'programs' && type !== 'intakes') {
      return sendError(res, 'Write operations are only supported for programs and intakes', HttpStatus.BAD_REQUEST);
    }

    const adminUser = await ensureAdmin(req, res);
    if (!adminUser) {
      return;
    }

    if (type === 'programs') {
      if (req.method === 'POST') return await createProgram(req, res);
      if (req.method === 'PUT') return await updateProgram(req, res);
      return await deleteProgram(req, res);
    }

    if (req.method === 'POST') return await createIntake(req, res);
    if (req.method === 'PUT') return await updateIntake(req, res);
    return await deleteIntake(req, res);
  } catch (error) {
    return handleError(res, error, 'catalog');
  }
}

export default withArcjetProtection(handler, 'general');
