/**
 * Unit tests: Application Wizard form validation (all 4 steps)
 *
 * Tests Zambian-specific validation (NRC, phone, ECZ grades) and
 * per-step schema rules for the 4-step application wizard.
 */
import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { nrcSchema, zambianPhoneSchema, eczGradeSchema } from '../../lib/validation/zambian';
import { applicationSchema } from '../../src/forms/applicationSchema';

// ─── Step 1: Personal Information ────────────────────────────────────────────

/**
 * Step 1 schema — validates personal info fields.
 * Derived from applicationSchema fields relevant to step 1.
 */
const step1Schema = z.object({
  first_name: z.string().min(1, 'First name is required'),
  last_name: z.string().min(1, 'Last name is required'),
  date_of_birth: z.string().min(1, 'Date of birth is required').refine((dob) => {
    const date = new Date(dob);
    if (isNaN(date.getTime())) return false;
    const now = new Date();
    if (date >= now) return false;
    const age = now.getFullYear() - date.getFullYear();
    const hadBirthday =
      now.getMonth() > date.getMonth() ||
      (now.getMonth() === date.getMonth() && now.getDate() >= date.getDate());
    const actualAge = hadBirthday ? age : age - 1;
    return actualAge >= 16;
  }, 'Applicant must be at least 16 years old and date must be in the past'),
  nrc_number: nrcSchema.optional(),
  phone: zambianPhoneSchema,
  nationality: z.string().min(1, 'Nationality is required'),
  physical_address: z.string().min(5, 'Physical address is required'),
});

describe('Step 1: Personal Information', () => {
  const validBase = {
    first_name: 'Chanda',
    last_name: 'Mwale',
    date_of_birth: '1998-06-15',
    phone: '+260971234567',
    nationality: 'Zambian',
    physical_address: '123 Cairo Road, Lusaka',
  };

  // ── Required fields ──────────────────────────────────────────────────────

  it('accepts valid personal info', () => {
    expect(step1Schema.safeParse(validBase).success).toBe(true);
  });

  it('rejects missing first_name', () => {
    const result = step1Schema.safeParse({ ...validBase, first_name: '' });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join('.'));
      expect(paths).toContain('first_name');
    }
  });

  it('rejects missing last_name', () => {
    const result = step1Schema.safeParse({ ...validBase, last_name: '' });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join('.'));
      expect(paths).toContain('last_name');
    }
  });

  it('rejects missing date_of_birth', () => {
    const result = step1Schema.safeParse({ ...validBase, date_of_birth: '' });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join('.'));
      expect(paths).toContain('date_of_birth');
    }
  });

  // ── Date of birth ────────────────────────────────────────────────────────

  it('rejects a future date of birth', () => {
    const future = new Date();
    future.setFullYear(future.getFullYear() + 1);
    const result = step1Schema.safeParse({
      ...validBase,
      date_of_birth: future.toISOString().split('T')[0],
    });
    expect(result.success).toBe(false);
  });

  it('rejects today as date of birth (not in the past)', () => {
    const today = new Date().toISOString().split('T')[0];
    const result = step1Schema.safeParse({ ...validBase, date_of_birth: today });
    expect(result.success).toBe(false);
  });

  it('rejects applicant under 16 years old', () => {
    const dob = new Date();
    dob.setFullYear(dob.getFullYear() - 15);
    const result = step1Schema.safeParse({
      ...validBase,
      date_of_birth: dob.toISOString().split('T')[0],
    });
    expect(result.success).toBe(false);
  });

  it('accepts applicant exactly 16 years old', () => {
    const dob = new Date();
    dob.setFullYear(dob.getFullYear() - 16);
    dob.setDate(dob.getDate() - 1); // one day past 16th birthday
    const result = step1Schema.safeParse({
      ...validBase,
      date_of_birth: dob.toISOString().split('T')[0],
    });
    expect(result.success).toBe(true);
  });

  it('accepts applicant well over 16 years old', () => {
    const result = step1Schema.safeParse({ ...validBase, date_of_birth: '1985-03-20' });
    expect(result.success).toBe(true);
  });

  // ── NRC format ───────────────────────────────────────────────────────────

  it('accepts valid NRC format 123456/78/9', () => {
    const result = nrcSchema.safeParse('123456/78/9');
    expect(result.success).toBe(true);
  });

  it('accepts valid NRC format 000000/00/0', () => {
    const result = nrcSchema.safeParse('000000/00/0');
    expect(result.success).toBe(true);
  });

  it('rejects NRC with wrong digit counts (5/2/1)', () => {
    expect(nrcSchema.safeParse('12345/78/9').success).toBe(false);
  });

  it('rejects NRC with wrong digit counts (6/3/1)', () => {
    expect(nrcSchema.safeParse('123456/789/9').success).toBe(false);
  });

  it('rejects NRC with wrong digit counts (6/2/2)', () => {
    expect(nrcSchema.safeParse('123456/78/90').success).toBe(false);
  });

  it('rejects NRC with letters', () => {
    expect(nrcSchema.safeParse('ABCDEF/78/9').success).toBe(false);
  });

  it('rejects NRC missing slashes', () => {
    expect(nrcSchema.safeParse('123456789').success).toBe(false);
  });

  it('rejects NRC with extra characters', () => {
    expect(nrcSchema.safeParse('123456/78/9X').success).toBe(false);
  });

  it('trims whitespace from NRC before validation', () => {
    const result = nrcSchema.safeParse('  123456/78/9  ');
    expect(result.success).toBe(true);
  });

  it('rejects NRC with null bytes', () => {
    expect(nrcSchema.safeParse('123456\u0000/78/9').success).toBe(false);
  });

  // ── Zambian phone ────────────────────────────────────────────────────────

  it('accepts valid Zambian phone +260971234567', () => {
    expect(zambianPhoneSchema.safeParse('+260971234567').success).toBe(true);
  });

  it('accepts valid Zambian phone +260955000000', () => {
    expect(zambianPhoneSchema.safeParse('+260955000000').success).toBe(true);
  });

  it('rejects phone without +260 prefix', () => {
    expect(zambianPhoneSchema.safeParse('0971234567').success).toBe(false);
  });

  it('rejects phone with wrong country code +263', () => {
    expect(zambianPhoneSchema.safeParse('+263971234567').success).toBe(false);
  });

  it('rejects phone with only 8 digits after +260', () => {
    expect(zambianPhoneSchema.safeParse('+26097123456').success).toBe(false);
  });

  it('rejects phone with 10 digits after +260', () => {
    expect(zambianPhoneSchema.safeParse('+2609712345678').success).toBe(false);
  });

  it('rejects phone with letters', () => {
    expect(zambianPhoneSchema.safeParse('+260ABCDEFGHI').success).toBe(false);
  });

  it('trims whitespace from phone before validation', () => {
    expect(zambianPhoneSchema.safeParse('  +260971234567  ').success).toBe(true);
  });

  it('rejects phone with null bytes', () => {
    expect(zambianPhoneSchema.safeParse('+260971\u0000234567').success).toBe(false);
  });
});

// ─── Step 2: Academic History ─────────────────────────────────────────────────

const gradeEntrySchema = z.object({
  subject_id: z.string().min(1, 'Subject ID is required'),
  grade: eczGradeSchema,
});

const step2Schema = z.object({
  grades: z.array(gradeEntrySchema).min(1, 'At least one grade entry is required'),
  school_name: z.string().min(1, 'School name is required'),
  year: z.number().int().min(1990).max(new Date().getFullYear()),
});

describe('Step 2: Academic History', () => {
  const validGrade = { subject_id: 'math-101', grade: 3 };
  const validBase = {
    grades: [validGrade],
    school_name: 'Lusaka Secondary School',
    year: 2020,
  };

  it('accepts valid academic history', () => {
    expect(step2Schema.safeParse(validBase).success).toBe(true);
  });

  // ── ECZ grades ───────────────────────────────────────────────────────────

  it('accepts ECZ grade 1 (best)', () => {
    expect(eczGradeSchema.safeParse(1).success).toBe(true);
  });

  it('accepts ECZ grade 6 (last passing grade)', () => {
    expect(eczGradeSchema.safeParse(6).success).toBe(true);
  });

  it('accepts ECZ grade 7 (first failing grade)', () => {
    expect(eczGradeSchema.safeParse(7).success).toBe(true);
  });

  it('accepts ECZ grade 9 (worst)', () => {
    expect(eczGradeSchema.safeParse(9).success).toBe(true);
  });

  it('rejects ECZ grade 0', () => {
    expect(eczGradeSchema.safeParse(0).success).toBe(false);
  });

  it('rejects ECZ grade 10', () => {
    expect(eczGradeSchema.safeParse(10).success).toBe(false);
  });

  it('rejects negative ECZ grade', () => {
    expect(eczGradeSchema.safeParse(-1).success).toBe(false);
  });

  it('rejects non-integer ECZ grade (1.5)', () => {
    expect(eczGradeSchema.safeParse(1.5).success).toBe(false);
  });

  it('rejects string ECZ grade', () => {
    expect(eczGradeSchema.safeParse('3').success).toBe(false);
  });

  it('rejects null ECZ grade', () => {
    expect(eczGradeSchema.safeParse(null).success).toBe(false);
  });

  // ── Grade entries ────────────────────────────────────────────────────────

  it('rejects empty subject_id in grade entry', () => {
    const result = gradeEntrySchema.safeParse({ subject_id: '', grade: 3 });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join('.'));
      expect(paths).toContain('subject_id');
    }
  });

  it('accepts UUID as subject_id', () => {
    const result = gradeEntrySchema.safeParse({
      subject_id: '550e8400-e29b-41d4-a716-446655440000',
      grade: 4,
    });
    expect(result.success).toBe(true);
  });

  it('accepts non-empty string as subject_id', () => {
    const result = gradeEntrySchema.safeParse({ subject_id: 'english-lang', grade: 2 });
    expect(result.success).toBe(true);
  });

  // ── Minimum grade entries ────────────────────────────────────────────────

  it('rejects empty grades array', () => {
    const result = step2Schema.safeParse({ ...validBase, grades: [] });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join('.'));
      expect(paths).toContain('grades');
    }
  });

  it('accepts multiple grade entries', () => {
    const result = step2Schema.safeParse({
      ...validBase,
      grades: [
        { subject_id: 'math', grade: 2 },
        { subject_id: 'english', grade: 3 },
        { subject_id: 'science', grade: 5 },
      ],
    });
    expect(result.success).toBe(true);
  });

  it('rejects grade entry with invalid grade in array', () => {
    const result = step2Schema.safeParse({
      ...validBase,
      grades: [{ subject_id: 'math', grade: 10 }],
    });
    expect(result.success).toBe(false);
  });
});

// ─── Step 3: Program Selection ────────────────────────────────────────────────

const step3Schema = z.object({
  program_id: z.string().min(1, 'Program selection is required'),
  intake_id: z.string().min(1, 'Intake selection is required'),
});

describe('Step 3: Program Selection', () => {
  it('accepts valid program and intake IDs', () => {
    const result = step3Schema.safeParse({
      program_id: 'diploma-clinical-medicine',
      intake_id: 'january-2026',
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing program_id', () => {
    const result = step3Schema.safeParse({ program_id: '', intake_id: 'january-2026' });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join('.'));
      expect(paths).toContain('program_id');
    }
  });

  it('rejects missing intake_id', () => {
    const result = step3Schema.safeParse({ program_id: 'diploma-clinical-medicine', intake_id: '' });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join('.'));
      expect(paths).toContain('intake_id');
    }
  });

  it('rejects both fields missing', () => {
    const result = step3Schema.safeParse({ program_id: '', intake_id: '' });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join('.'));
      expect(paths).toContain('program_id');
      expect(paths).toContain('intake_id');
    }
  });

  it('rejects undefined program_id', () => {
    const result = step3Schema.safeParse({ intake_id: 'january-2026' });
    expect(result.success).toBe(false);
  });

  it('rejects undefined intake_id', () => {
    const result = step3Schema.safeParse({ program_id: 'diploma-clinical-medicine' });
    expect(result.success).toBe(false);
  });

  it('accepts UUID-style IDs', () => {
    const result = step3Schema.safeParse({
      program_id: '550e8400-e29b-41d4-a716-446655440000',
      intake_id: '660e8400-e29b-41d4-a716-446655440001',
    });
    expect(result.success).toBe(true);
  });

  // Verify applicationSchema also enforces program_id and intake_id
  it('applicationSchema rejects missing program_id', () => {
    const result = applicationSchema.safeParse({
      program_id: '',
      intake_id: 'january-2026',
      date_of_birth: '1998-01-01',
      sex: 'Male',
      marital_status: 'Single',
      nationality: 'Zambian',
      province: 'Lusaka',
      district: 'Lusaka',
      physical_address: '123 Cairo Road',
      nrc_number: '123456/78/9',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join('.'));
      expect(paths).toContain('program_id');
    }
  });

  it('applicationSchema rejects missing intake_id', () => {
    const result = applicationSchema.safeParse({
      program_id: 'diploma-clinical-medicine',
      intake_id: '',
      date_of_birth: '1998-01-01',
      sex: 'Male',
      marital_status: 'Single',
      nationality: 'Zambian',
      province: 'Lusaka',
      district: 'Lusaka',
      physical_address: '123 Cairo Road',
      nrc_number: '123456/78/9',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join('.'));
      expect(paths).toContain('intake_id');
    }
  });
});

// ─── Step 4: Document Upload ──────────────────────────────────────────────────

const ALLOWED_MIME_TYPES = ['application/pdf', 'image/jpeg', 'image/png'];
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

const documentFileSchema = z.object({
  name: z.string().min(1, 'File name is required'),
  type: z.string().refine(
    (t) => ALLOWED_MIME_TYPES.includes(t),
    `File type must be one of: ${ALLOWED_MIME_TYPES.join(', ')}`
  ),
  size: z.number().int().positive().max(MAX_FILE_SIZE_BYTES, 'File size must not exceed 10 MB'),
});

const step4Schema = z.object({
  documents: z.array(documentFileSchema).min(1, 'At least one document is required'),
});

describe('Step 4: Document Upload', () => {
  const validPdf = { name: 'transcript.pdf', type: 'application/pdf', size: 1_000_000 };
  const validJpeg = { name: 'photo.jpg', type: 'image/jpeg', size: 500_000 };
  const validPng = { name: 'id.png', type: 'image/png', size: 750_000 };

  // ── File type validation ─────────────────────────────────────────────────

  it('accepts PDF file type', () => {
    expect(documentFileSchema.safeParse(validPdf).success).toBe(true);
  });

  it('accepts JPEG file type', () => {
    expect(documentFileSchema.safeParse(validJpeg).success).toBe(true);
  });

  it('accepts PNG file type', () => {
    expect(documentFileSchema.safeParse(validPng).success).toBe(true);
  });

  it('rejects Word document (.docx)', () => {
    const result = documentFileSchema.safeParse({
      name: 'doc.docx',
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      size: 500_000,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join('.'));
      expect(paths).toContain('type');
    }
  });

  it('rejects GIF file type', () => {
    const result = documentFileSchema.safeParse({ name: 'anim.gif', type: 'image/gif', size: 100_000 });
    expect(result.success).toBe(false);
  });

  it('rejects text/plain file type', () => {
    const result = documentFileSchema.safeParse({ name: 'notes.txt', type: 'text/plain', size: 1_000 });
    expect(result.success).toBe(false);
  });

  it('rejects empty MIME type', () => {
    const result = documentFileSchema.safeParse({ name: 'file', type: '', size: 1_000 });
    expect(result.success).toBe(false);
  });

  // ── File size validation ─────────────────────────────────────────────────

  it('accepts file exactly at 10 MB limit', () => {
    const result = documentFileSchema.safeParse({ ...validPdf, size: MAX_FILE_SIZE_BYTES });
    expect(result.success).toBe(true);
  });

  it('rejects file exceeding 10 MB', () => {
    const result = documentFileSchema.safeParse({ ...validPdf, size: MAX_FILE_SIZE_BYTES + 1 });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join('.'));
      expect(paths).toContain('size');
    }
  });

  it('rejects file of 0 bytes', () => {
    const result = documentFileSchema.safeParse({ ...validPdf, size: 0 });
    expect(result.success).toBe(false);
  });

  it('rejects negative file size', () => {
    const result = documentFileSchema.safeParse({ ...validPdf, size: -1 });
    expect(result.success).toBe(false);
  });

  it('accepts 1-byte file', () => {
    const result = documentFileSchema.safeParse({ ...validPdf, size: 1 });
    expect(result.success).toBe(true);
  });

  // ── Document array ───────────────────────────────────────────────────────

  it('accepts multiple valid documents', () => {
    const result = step4Schema.safeParse({
      documents: [validPdf, validJpeg, validPng],
    });
    expect(result.success).toBe(true);
  });

  it('rejects empty documents array', () => {
    const result = step4Schema.safeParse({ documents: [] });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join('.'));
      expect(paths).toContain('documents');
    }
  });

  it('rejects array containing an invalid file', () => {
    const result = step4Schema.safeParse({
      documents: [validPdf, { name: 'bad.exe', type: 'application/x-msdownload', size: 500_000 }],
    });
    expect(result.success).toBe(false);
  });
});

// ─── applicationSchema: NRC/passport mutual exclusion ────────────────────────

describe('applicationSchema: NRC / passport mutual exclusion', () => {
  const validCore = {
    program_id: 'diploma-clinical-medicine',
    intake_id: 'january-2026',
    date_of_birth: '1998-01-01',
    sex: 'Male' as const,
    marital_status: 'Single' as const,
    nationality: 'Zambian',
    province: 'Lusaka',
    district: 'Lusaka',
    physical_address: '123 Cairo Road, Lusaka',
  };

  it('accepts NRC only', () => {
    const result = applicationSchema.safeParse({ ...validCore, nrc_number: '123456/78/9' });
    expect(result.success).toBe(true);
  });

  it('accepts passport only', () => {
    const result = applicationSchema.safeParse({ ...validCore, passport_number: 'ZM123456' });
    expect(result.success).toBe(true);
  });

  it('rejects when neither NRC nor passport is provided', () => {
    const result = applicationSchema.safeParse(validCore);
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message);
      expect(messages.some((m) => m.toLowerCase().includes('nrc') || m.toLowerCase().includes('passport'))).toBe(true);
    }
  });

  it('rejects when both NRC and passport are provided', () => {
    const result = applicationSchema.safeParse({
      ...validCore,
      nrc_number: '123456/78/9',
      passport_number: 'ZM123456',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message);
      expect(messages.some((m) => m.toLowerCase().includes('passport') || m.toLowerCase().includes('both'))).toBe(true);
    }
  });
});
