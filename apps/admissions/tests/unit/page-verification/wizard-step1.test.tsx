// @ts-nocheck
/**
 * Application Wizard Step 1 Verification Test
 *
 * Verifies that the catalog service normalizers correctly process Django
 * response shapes for programs and intakes, which populate the wizard's
 * step 1 dropdowns. Tests the service layer normalization rather than
 * rendering the full wizard component (which has many dependencies).
 *
 * Requirements: 12.1, 12.2, 12.3
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Mock ApiClient before importing catalog service ───────────────────
const mockRequest = vi.fn()

vi.mock('@/services/client', () => ({
  apiClient: {
    request: (...args: unknown[]) => mockRequest(...args),
  },
}))

vi.mock('@/lib/apiErrorLogger', () => ({
  logApiError: vi.fn(),
}))

// ── Import catalog service and normalizers ─────────────────────────────
import {
  catalogService,
  normalizeProgram,
  normalizeIntake,
  normalizeProgramsResponse,
  normalizeIntakesResponse,
} from '@/services/catalog'

// ── Django catalog response shapes (after envelope unwrap) ────────────
// These match the actual Django API responses for GET /api/v1/catalog/programs/
// and GET /api/v1/catalog/intakes/

const djangoProgramsResponse = [
  {
    id: 'prog-001',
    name: 'Bachelor of Nursing',
    code: 'PRG-NURSING-A1B2',
    description: 'A comprehensive nursing program',
    institution_id: 'inst-001',
    institution: {
      id: 'inst-001',
      name: 'MIHAS',
      full_name: 'MIHAS Institute of Health Sciences',
      code: 'INS-MIHAS',
      type: 'University',
      accreditation_status: 'active',
      is_active: true,
    },
    duration_years: 4,
    application_fee: 500,
    requirements: { summary: 'Grade 12 with science credits' },
    is_active: true,
  },
  {
    id: 'prog-002',
    name: 'Diploma in Pharmacy',
    code: 'PRG-PHARMACY-C3D4',
    description: 'Pharmacy technician diploma',
    institution_id: 'inst-001',
    institution: null,
    duration_years: 3,
    application_fee: '350',
    requirements: null,
    is_active: true,
  },
  {
    id: 'prog-003',
    name: 'Certificate in Community Health',
    code: 'PRG-COMHEALTH-E5F6',
    description: '',
    institution_id: 'inst-002',
    duration_months: 18,
    application_fee: 200,
    is_active: false,
  },
]

const djangoIntakesResponse = [
  {
    id: 'intake-001',
    name: 'January 2026 Intake',
    year: 2026,
    application_deadline: '2025-12-15T23:59:59Z',
    start_date: '2026-01-10T00:00:00Z',
    end_date: '2026-06-30T00:00:00Z',
    max_capacity: 120,
    current_enrollment: 45,
    is_active: true,
  },
  {
    id: 'intake-002',
    name: 'September 2025 Intake',
    year: 2025,
    application_deadline: '2025-08-01T23:59:59Z',
    start_date: '2025-09-01T00:00:00Z',
    end_date: '2026-02-28T00:00:00Z',
    max_capacity: 80,
    current_enrollment: 80,
    is_active: true,
  },
  {
    id: 'intake-003',
    name: 'May 2025 Intake',
    year: 2025,
    application_deadline: '2025-04-15T23:59:59Z',
    start_date: '2025-05-01T00:00:00Z',
    end_date: '2025-10-31T00:00:00Z',
    max_capacity: 60,
    is_active: false,
  },
]

describe('Wizard Step 1 — catalog service normalization', () => {
  beforeEach(() => {
    mockRequest.mockReset()
  })

  // ── Program normalization ─────────────────────────────────────────

  describe('normalizeProgram', () => {
    it('normalizes a Django program with all fields', () => {
      const raw = djangoProgramsResponse[0]
      const result = normalizeProgram(raw)

      expect(result).not.toBeNull()
      expect(result!.id).toBe('prog-001')
      expect(result!.name).toBe('Bachelor of Nursing')
      expect(result!.code).toBe('PRG-NURSING-A1B2')
      expect(result!.duration_years).toBe(4)
      expect(result!.institution_id).toBe('inst-001')
      expect(result!.application_fee).toBe(500)
      expect(result!.is_active).toBe(true)
      // Institution should be normalized
      expect(result!.institutions).not.toBeNull()
      expect(result!.institutions!.id).toBe('inst-001')
      expect(result!.institutions!.name).toBe('MIHAS')
    })

    it('normalizes string application_fee to number', () => {
      const raw = djangoProgramsResponse[1]
      const result = normalizeProgram(raw)

      expect(result).not.toBeNull()
      expect(result!.application_fee).toBe(350)
      expect(typeof result!.application_fee).toBe('number')
    })

    it('converts duration_months to duration_years', () => {
      const raw = djangoProgramsResponse[2]
      const result = normalizeProgram(raw)

      expect(result).not.toBeNull()
      expect(result!.duration_years).toBe(1.5) // 18 months = 1.5 years
    })

    it('handles null institution gracefully', () => {
      const raw = djangoProgramsResponse[1]
      const result = normalizeProgram(raw)

      expect(result).not.toBeNull()
      expect(result!.institutions).toBeNull()
      expect(result!.institution_id).toBe('inst-001')
    })

    it('returns null for null/undefined input', () => {
      expect(normalizeProgram(null)).toBeNull()
      expect(normalizeProgram(undefined)).toBeNull()
    })

    it('returns null for record missing id', () => {
      const result = normalizeProgram({ name: 'No ID' } as any)
      expect(result).toBeNull()
    })
  })

  // ── Intake normalization ──────────────────────────────────────────

  describe('normalizeIntake', () => {
    it('normalizes a Django intake with all fields', () => {
      const raw = djangoIntakesResponse[0]
      const result = normalizeIntake(raw)

      expect(result).not.toBeNull()
      expect(result!.id).toBe('intake-001')
      expect(result!.name).toBe('January 2026 Intake')
      expect(result!.year).toBe(2026)
      expect(result!.application_deadline).toBe('2025-12-15T23:59:59Z')
      expect(result!.start_date).toBe('2026-01-10T00:00:00Z')
      expect(result!.end_date).toBe('2026-06-30T00:00:00Z')
      expect(result!.total_capacity).toBe(120)
      expect(result!.available_spots).toBe(75) // 120 - 45
      expect(result!.is_active).toBe(true)
    })

    it('calculates available_spots as max_capacity minus current_enrollment', () => {
      const raw = djangoIntakesResponse[1]
      const result = normalizeIntake(raw)

      expect(result).not.toBeNull()
      expect(result!.total_capacity).toBe(80)
      expect(result!.available_spots).toBe(0) // 80 - 80 = 0
    })

    it('handles missing current_enrollment (defaults to 0)', () => {
      const raw = djangoIntakesResponse[2]
      const result = normalizeIntake(raw)

      expect(result).not.toBeNull()
      expect(result!.total_capacity).toBe(60)
      expect(result!.available_spots).toBe(60) // 60 - 0
    })

    it('returns null for null/undefined input', () => {
      expect(normalizeIntake(null)).toBeNull()
      expect(normalizeIntake(undefined)).toBeNull()
    })

    it('returns null for record missing id', () => {
      const result = normalizeIntake({ name: 'No ID' } as any)
      expect(result).toBeNull()
    })
  })

  // ── Collection normalization ──────────────────────────────────────

  describe('normalizeProgramsResponse', () => {
    it('normalizes a raw Django array of programs', () => {
      const result = normalizeProgramsResponse(djangoProgramsResponse as any)

      expect(result.programs).toHaveLength(3)
      expect(result.programs[0].id).toBe('prog-001')
      expect(result.programs[1].id).toBe('prog-002')
      expect(result.programs[2].id).toBe('prog-003')
    })

    it('normalizes a paginated {results: [...]} shape', () => {
      const paginated = { results: djangoProgramsResponse }
      const result = normalizeProgramsResponse(paginated as any)

      expect(result.programs).toHaveLength(3)
    })

    it('normalizes a {programs: [...]} shape', () => {
      const wrapped = { programs: djangoProgramsResponse }
      const result = normalizeProgramsResponse(wrapped as any)

      expect(result.programs).toHaveLength(3)
    })

    it('returns empty programs for null/undefined', () => {
      expect(normalizeProgramsResponse(null).programs).toEqual([])
      expect(normalizeProgramsResponse(undefined).programs).toEqual([])
    })
  })

  describe('normalizeIntakesResponse', () => {
    it('normalizes a raw Django array of intakes', () => {
      const result = normalizeIntakesResponse(djangoIntakesResponse as any)

      expect(result.intakes).toHaveLength(3)
      expect(result.intakes[0].id).toBe('intake-001')
      expect(result.intakes[0].total_capacity).toBe(120)
      expect(result.intakes[0].available_spots).toBe(75)
    })

    it('normalizes a paginated {results: [...]} shape', () => {
      const paginated = { results: djangoIntakesResponse }
      const result = normalizeIntakesResponse(paginated as any)

      expect(result.intakes).toHaveLength(3)
    })

    it('normalizes an {intakes: [...]} shape', () => {
      const wrapped = { intakes: djangoIntakesResponse }
      const result = normalizeIntakesResponse(wrapped as any)

      expect(result.intakes).toHaveLength(3)
    })

    it('returns empty intakes for null/undefined', () => {
      expect(normalizeIntakesResponse(null).intakes).toEqual([])
      expect(normalizeIntakesResponse(undefined).intakes).toEqual([])
    })
  })

  // ── catalogService integration (mocked ApiClient) ─────────────────

  describe('catalogService.getPrograms', () => {
    it('returns normalized programs from Django array response', async () => {
      mockRequest.mockResolvedValue(djangoProgramsResponse)

      const result = await catalogService.getPrograms()

      expect(mockRequest).toHaveBeenCalledWith('/catalog/programs/')
      expect(result.programs).toHaveLength(3)
      expect(result.programs[0].name).toBe('Bachelor of Nursing')
      expect(result.programs[0].duration_years).toBe(4)
      expect(result.programs[0].institution_id).toBe('inst-001')
      expect(result.programs[1].application_fee).toBe(350)
      expect(result.programs[2].duration_years).toBe(1.5)
    })

    it('returns normalized programs from paginated response', async () => {
      mockRequest.mockResolvedValue({
        results: djangoProgramsResponse,
        count: 3,
        page: 1,
        pageSize: 50,
      })

      const result = await catalogService.getPrograms()

      expect(result.programs).toHaveLength(3)
    })
  })

  describe('catalogService.getIntakes', () => {
    it('returns normalized intakes from Django array response', async () => {
      mockRequest.mockResolvedValue(djangoIntakesResponse)

      const result = await catalogService.getIntakes()

      expect(mockRequest).toHaveBeenCalledWith('/catalog/intakes/')
      expect(result.intakes).toHaveLength(3)
      expect(result.intakes[0].name).toBe('January 2026 Intake')
      expect(result.intakes[0].total_capacity).toBe(120)
      expect(result.intakes[0].available_spots).toBe(75)
      expect(result.intakes[1].available_spots).toBe(0)
      expect(result.intakes[2].total_capacity).toBe(60)
    })

    it('returns normalized intakes from paginated response', async () => {
      mockRequest.mockResolvedValue({
        results: djangoIntakesResponse,
        count: 3,
        page: 1,
        pageSize: 50,
      })

      const result = await catalogService.getIntakes()

      expect(result.intakes).toHaveLength(3)
    })
  })

  // ── Dropdown population verification ──────────────────────────────

  describe('dropdown population from normalized data', () => {
    it('programs provide id and name for dropdown options', async () => {
      mockRequest.mockResolvedValue(djangoProgramsResponse)

      const { programs } = await catalogService.getPrograms()

      const dropdownOptions = programs.map((p) => ({ value: p.id, label: p.name }))
      expect(dropdownOptions).toEqual([
        { value: 'prog-001', label: 'Bachelor of Nursing' },
        { value: 'prog-002', label: 'Diploma in Pharmacy' },
        { value: 'prog-003', label: 'Certificate in Community Health' },
      ])
    })

    it('intakes provide id and name for dropdown options', async () => {
      mockRequest.mockResolvedValue(djangoIntakesResponse)

      const { intakes } = await catalogService.getIntakes()

      const dropdownOptions = intakes.map((i) => ({ value: i.id, label: i.name }))
      expect(dropdownOptions).toEqual([
        { value: 'intake-001', label: 'January 2026 Intake' },
        { value: 'intake-002', label: 'September 2025 Intake' },
        { value: 'intake-003', label: 'May 2025 Intake' },
      ])
    })

    it('all numeric fields are finite numbers after normalization', async () => {
      mockRequest
        .mockResolvedValueOnce(djangoProgramsResponse)
        .mockResolvedValueOnce(djangoIntakesResponse)

      const { programs } = await catalogService.getPrograms()
      const { intakes } = await catalogService.getIntakes()

      for (const p of programs) {
        expect(Number.isFinite(p.duration_years)).toBe(true)
        expect(Number.isFinite(p.application_fee)).toBe(true)
      }

      for (const i of intakes) {
        expect(Number.isFinite(i.total_capacity)).toBe(true)
        expect(Number.isFinite(i.year)).toBe(true)
        if (i.available_spots !== undefined) {
          expect(Number.isFinite(i.available_spots)).toBe(true)
        }
      }
    })
  })
})
