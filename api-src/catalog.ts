import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleCors } from '../lib/cors';
import { query } from '../lib/db';
import { CatalogQueries, SubjectRecord } from '../lib/queries';
import { withArcjetProtection } from '../lib/arcjet';
import { getAuthUser } from '../lib/auth/middleware';
import { handleError, sendSuccess, sendError, HttpStatus } from '../lib/errorHandler';

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
  description: string | null;
  duration_years: number | null;
  institution_id: string | null;
  is_active: boolean | null;
  created_at: string;
  updated_at: string;
  institution_name: string | null;
  institution_code: string | null;
}

interface IntakeRow {
  id: string;
  name: string;
  year: number | null;
  start_date: string;
  end_date: string;
  application_deadline: string;
  total_capacity: number | null;
  available_spots: number | null;
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
    description: row.description ?? '',
    duration_years: Number(row.duration_years ?? 0),
    institution_id: row.institution_id,
    is_active: row.is_active !== false,
    institution_name: row.institution_name,
    institution_code: row.institution_code,
    institutions: row.institution_id
      ? {
          id: row.institution_id,
          name: row.institution_name ?? 'Unknown Institution',
          code: row.institution_code ?? undefined,
        }
      : undefined,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function normalizeIntake(row: IntakeRow) {
  return {
    id: row.id,
    name: row.name,
    year: Number(row.year ?? new Date(row.start_date).getFullYear()),
    start_date: row.start_date,
    end_date: row.end_date,
    application_deadline: row.application_deadline,
    total_capacity: Number(row.total_capacity ?? 0),
    available_spots: Number(row.available_spots ?? 0),
    is_active: row.is_active !== false,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

async function validateInstitution(institutionId: string): Promise<InstitutionRecord | null> {
  const result = await query<InstitutionRecord>(
    'SELECT id, name, code, description, is_active FROM institutions WHERE id = $1 LIMIT 1',
    [institutionId]
  );

  if (result.rowCount === 0) {
    return null;
  }

  const institution = result.rows[0];
  if (!institution.is_active) {
    return null;
  }

  return institution;
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
  const result = await query<ProgramRow>(
    `SELECT
      p.id,
      p.name,
      p.description,
      COALESCE(p.duration_years, CEIL(COALESCE(p.duration_months, 0)::numeric / 12)::int) AS duration_years,
      p.institution_id,
      p.is_active,
      p.created_at,
      p.updated_at,
      i.name AS institution_name,
      i.code AS institution_code
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
}

async function listIntakes(res: VercelResponse, includeInactive: boolean, shouldCache: boolean) {
  const result = await query<IntakeRow>(
    `SELECT
      id,
      name,
      COALESCE(year, EXTRACT(YEAR FROM start_date)::int) AS year,
      start_date,
      end_date,
      application_deadline,
      COALESCE(total_capacity, 0) AS total_capacity,
      COALESCE(available_spots, 0) AS available_spots,
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
}

async function createProgram(req: VercelRequest, res: VercelResponse) {
  const body = req.body || {};
  const name = String(body.name || '').trim();
  const description = typeof body.description === 'string' ? body.description.trim() : '';
  const durationYears = Number(body.duration_years);
  const institutionId = String(body.institution_id || '').trim();

  if (!name) {
    return sendError(res, 'Program name is required', HttpStatus.BAD_REQUEST);
  }
  if (!institutionId) {
    return sendError(res, 'institution_id is required', HttpStatus.BAD_REQUEST);
  }
  if (!Number.isFinite(durationYears) || durationYears < 1 || durationYears > 10) {
    return sendError(res, 'duration_years must be between 1 and 10', HttpStatus.BAD_REQUEST);
  }

  const institution = await validateInstitution(institutionId);
  if (!institution) {
    return sendError(res, 'Invalid or inactive institution_id', HttpStatus.BAD_REQUEST);
  }

  const result = await query<ProgramRow>(
    `INSERT INTO programs (name, description, duration_years, institution_id, is_active, created_at, updated_at)
     VALUES ($1, $2, $3, $4, true, NOW(), NOW())
     RETURNING
      id,
      name,
      description,
      duration_years,
      institution_id,
      is_active,
      created_at,
      updated_at,
      $5::text AS institution_name,
      $6::text AS institution_code`,
    [name, description || null, durationYears, institutionId, institution.name, institution.code || null]
  );

  return sendSuccess(res, { program: normalizeProgram(result.rows[0]) });
}

async function updateProgram(req: VercelRequest, res: VercelResponse) {
  const body = req.body || {};
  const id = String(body.id || '').trim();
  const name = String(body.name || '').trim();
  const description = typeof body.description === 'string' ? body.description.trim() : '';
  const durationYears = Number(body.duration_years);
  const institutionId = String(body.institution_id || '').trim();
  const isActive = typeof body.is_active === 'boolean' ? body.is_active : undefined;

  if (!id) {
    return sendError(res, 'Program id is required', HttpStatus.BAD_REQUEST);
  }
  if (!name) {
    return sendError(res, 'Program name is required', HttpStatus.BAD_REQUEST);
  }
  if (!institutionId) {
    return sendError(res, 'institution_id is required', HttpStatus.BAD_REQUEST);
  }
  if (!Number.isFinite(durationYears) || durationYears < 1 || durationYears > 10) {
    return sendError(res, 'duration_years must be between 1 and 10', HttpStatus.BAD_REQUEST);
  }

  const institution = await validateInstitution(institutionId);
  if (!institution) {
    return sendError(res, 'Invalid or inactive institution_id', HttpStatus.BAD_REQUEST);
  }

  const result = await query<ProgramRow>(
    `UPDATE programs
     SET name = $2,
         description = $3,
         duration_years = $4,
         institution_id = $5,
         is_active = COALESCE($6, is_active),
         updated_at = NOW()
     WHERE id = $1
     RETURNING
      id,
      name,
      description,
      duration_years,
      institution_id,
      is_active,
      created_at,
      updated_at,
      $7::text AS institution_name,
      $8::text AS institution_code`,
    [id, name, description || null, durationYears, institutionId, isActive ?? null, institution.name, institution.code || null]
  );

  if (result.rowCount === 0) {
    return sendError(res, 'Program not found', HttpStatus.NOT_FOUND);
  }

  return sendSuccess(res, { program: normalizeProgram(result.rows[0]) });
}

async function deleteProgram(req: VercelRequest, res: VercelResponse) {
  const body = req.body || {};
  const id = String(body.id || req.query.id || '').trim();

  if (!id) {
    return sendError(res, 'Program id is required', HttpStatus.BAD_REQUEST);
  }

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
}

async function createIntake(req: VercelRequest, res: VercelResponse) {
  const body = req.body || {};
  const name = String(body.name || '').trim();
  const year = Number(body.year);
  const startDate = String(body.start_date || '').trim();
  const endDate = String(body.end_date || '').trim();
  const applicationDeadline = String(body.application_deadline || '').trim();
  const totalCapacity = Number(body.total_capacity);
  const availableSpots = Number(body.available_spots ?? totalCapacity);

  if (!name || !startDate || !endDate || !applicationDeadline) {
    return sendError(res, 'name, start_date, end_date, and application_deadline are required', HttpStatus.BAD_REQUEST);
  }

  if (!Number.isFinite(year) || year < 2000) {
    return sendError(res, 'Valid year is required', HttpStatus.BAD_REQUEST);
  }

  if (!Number.isFinite(totalCapacity) || totalCapacity < 1) {
    return sendError(res, 'total_capacity must be at least 1', HttpStatus.BAD_REQUEST);
  }

  if (!Number.isFinite(availableSpots) || availableSpots < 0 || availableSpots > totalCapacity) {
    return sendError(res, 'available_spots must be between 0 and total_capacity', HttpStatus.BAD_REQUEST);
  }

  const result = await query<IntakeRow>(
    `INSERT INTO intakes (
      name, year, start_date, end_date, application_deadline,
      total_capacity, available_spots, is_active, created_at, updated_at
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, true, NOW(), NOW())
    RETURNING
      id, name, year, start_date, end_date, application_deadline,
      total_capacity, available_spots, is_active, created_at, updated_at`,
    [name, year, startDate, endDate, applicationDeadline, totalCapacity, availableSpots]
  );

  return sendSuccess(res, { intake: normalizeIntake(result.rows[0]) });
}

async function updateIntake(req: VercelRequest, res: VercelResponse) {
  const body = req.body || {};
  const id = String(body.id || '').trim();
  const name = String(body.name || '').trim();
  const year = Number(body.year);
  const startDate = String(body.start_date || '').trim();
  const endDate = String(body.end_date || '').trim();
  const applicationDeadline = String(body.application_deadline || '').trim();
  const totalCapacity = Number(body.total_capacity);
  const availableSpots = Number(body.available_spots ?? totalCapacity);
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
  if (!Number.isFinite(totalCapacity) || totalCapacity < 1) {
    return sendError(res, 'total_capacity must be at least 1', HttpStatus.BAD_REQUEST);
  }
  if (!Number.isFinite(availableSpots) || availableSpots < 0 || availableSpots > totalCapacity) {
    return sendError(res, 'available_spots must be between 0 and total_capacity', HttpStatus.BAD_REQUEST);
  }

  const result = await query<IntakeRow>(
    `UPDATE intakes
     SET name = $2,
         year = $3,
         start_date = $4,
         end_date = $5,
         application_deadline = $6,
         total_capacity = $7,
         available_spots = $8,
         is_active = COALESCE($9, is_active),
         updated_at = NOW()
     WHERE id = $1
     RETURNING
       id, name, year, start_date, end_date, application_deadline,
       total_capacity, available_spots, is_active, created_at, updated_at`,
    [id, name, year, startDate, endDate, applicationDeadline, totalCapacity, availableSpots, isActive ?? null]
  );

  if (result.rowCount === 0) {
    return sendError(res, 'Intake not found', HttpStatus.NOT_FOUND);
  }

  return sendSuccess(res, { intake: normalizeIntake(result.rows[0]) });
}

async function deleteIntake(req: VercelRequest, res: VercelResponse) {
  const body = req.body || {};
  const id = String(body.id || req.query.id || '').trim();

  if (!id) {
    return sendError(res, 'Intake id is required', HttpStatus.BAD_REQUEST);
  }

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
}

/**
 * Consolidated Catalog API
 */
async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleCors(req, res)) return;

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
