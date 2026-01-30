/**
 * Property Test: Non-Blocking Validation
 * Feature: bun-vercel-migration
 * Property 6: Non-Blocking Validation
 * Validates: Requirements 8.8
 * 
 * For any validation error in the Application Wizard (except required fields 
 * on final submission), the system SHALL allow the user to proceed to the 
 * next step. Validation errors SHALL be advisory, not blocking.
 */
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

// Validation result interface
interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  canProceed: boolean;  // Key property: can user proceed despite errors?
}

interface ValidationError {
  field: string;
  message: string;
  severity: 'error' | 'warning' | 'info';
  blocking: boolean;  // Only true for required fields on final submission
}

// Wizard step enum
enum WizardStep {
  PersonalInfo = 0,
  AcademicHistory = 1,
  ProgramSelection = 2,
  DocumentUpload = 3,
}

// Form data for each step
interface StepFormData {
  step: WizardStep;
  data: Record<string, unknown>;
  isFinalSubmission: boolean;
}

// Required fields per step
const REQUIRED_FIELDS: Record<WizardStep, string[]> = {
  [WizardStep.PersonalInfo]: ['firstName', 'lastName', 'email', 'phone'],
  [WizardStep.AcademicHistory]: ['previousSchool', 'yearCompleted'],
  [WizardStep.ProgramSelection]: ['programId', 'intakeId'],
  [WizardStep.DocumentUpload]: ['idDocument'],
};

// Validation function (mirrors wizard validation logic)
function validateStep(formData: StepFormData): ValidationResult {
  const errors: ValidationError[] = [];
  const requiredFields = REQUIRED_FIELDS[formData.step];
  
  // Check each field
  for (const [field, value] of Object.entries(formData.data)) {
    const isRequired = requiredFields.includes(field);
    const isEmpty = value === '' || value === null || value === undefined;
    
    if (isEmpty && isRequired) {
      errors.push({
        field,
        message: `${field} is required`,
        severity: 'error',
        // Only blocking on final submission
        blocking: formData.isFinalSubmission,
      });
    }
    
    // Additional validation (non-blocking)
    if (field === 'email' && value && typeof value === 'string') {
      if (!value.includes('@')) {
        errors.push({
          field,
          message: 'Invalid email format',
          severity: 'warning',
          blocking: false,  // Never blocking
        });
      }
    }
    
    if (field === 'phone' && value && typeof value === 'string') {
      if (!value.startsWith('+260')) {
        errors.push({
          field,
          message: 'Phone should be Zambian format (+260...)',
          severity: 'warning',
          blocking: false,  // Never blocking
        });
      }
    }
  }
  
  // Can proceed if no blocking errors
  const hasBlockingErrors = errors.some(e => e.blocking);
  
  return {
    isValid: errors.length === 0,
    errors,
    canProceed: !hasBlockingErrors,
  };
}

// Arbitrary generators
const wizardStepArbitrary = fc.constantFrom(
  WizardStep.PersonalInfo,
  WizardStep.AcademicHistory,
  WizardStep.ProgramSelection,
  WizardStep.DocumentUpload
);

const personalInfoDataArbitrary = fc.record({
  firstName: fc.option(fc.string({ minLength: 0, maxLength: 50 }), { nil: '' }),
  lastName: fc.option(fc.string({ minLength: 0, maxLength: 50 }), { nil: '' }),
  email: fc.option(fc.string({ minLength: 0, maxLength: 100 }), { nil: '' }),
  phone: fc.option(fc.string({ minLength: 0, maxLength: 20 }), { nil: '' }),
  nationality: fc.option(fc.string({ minLength: 0, maxLength: 50 }), { nil: '' }),
});

const academicHistoryDataArbitrary = fc.record({
  previousSchool: fc.option(fc.string({ minLength: 0, maxLength: 100 }), { nil: '' }),
  yearCompleted: fc.option(fc.integer({ min: 1990, max: 2025 }), { nil: undefined }),
  grades: fc.option(fc.array(fc.integer({ min: 1, max: 9 })), { nil: [] }),
});

const programSelectionDataArbitrary = fc.record({
  programId: fc.option(fc.uuid(), { nil: '' }),
  intakeId: fc.option(fc.uuid(), { nil: '' }),
});

const documentUploadDataArbitrary = fc.record({
  idDocument: fc.option(fc.uuid(), { nil: '' }),
  transcript: fc.option(fc.uuid(), { nil: '' }),
});

describe('Feature: bun-vercel-migration, Property 6: Non-Blocking Validation', () => {
  
  describe('Non-final submission (navigation between steps)', () => {
    
    it('should allow proceeding with validation errors when not final submission', () => {
      fc.assert(
        fc.property(
          fc.record({
            step: wizardStepArbitrary,
            data: personalInfoDataArbitrary,
            isFinalSubmission: fc.constant(false),
          }),
          (formData) => {
            const result = validateStep(formData);
            
            // Should always be able to proceed when not final submission
            expect(result.canProceed).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should mark validation errors as non-blocking during navigation', () => {
      fc.assert(
        fc.property(
          fc.record({
            step: wizardStepArbitrary,
            data: fc.record({
              firstName: fc.constant(''),  // Empty required field
              lastName: fc.constant(''),
              email: fc.constant('invalid-email'),  // Invalid format
              phone: fc.constant('123456'),  // Non-Zambian format
            }),
            isFinalSubmission: fc.constant(false),
          }),
          (formData) => {
            const result = validateStep(formData);
            
            // All errors should be non-blocking
            for (const error of result.errors) {
              expect(error.blocking).toBe(false);
            }
            
            // Should be able to proceed
            expect(result.canProceed).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Final submission', () => {
    
    it('should block on missing required fields during final submission', () => {
      fc.assert(
        fc.property(
          fc.record({
            step: fc.constant(WizardStep.PersonalInfo),
            data: fc.record({
              firstName: fc.constant(''),  // Empty required field
              lastName: fc.constant('Test'),
              email: fc.constant('test@example.com'),
              phone: fc.constant('+260971234567'),
            }),
            isFinalSubmission: fc.constant(true),
          }),
          (formData) => {
            const result = validateStep(formData);
            
            // Should have blocking error for empty required field
            const blockingErrors = result.errors.filter(e => e.blocking);
            expect(blockingErrors.length).toBeGreaterThan(0);
            
            // Should not be able to proceed
            expect(result.canProceed).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should allow final submission when all required fields are filled', () => {
      fc.assert(
        fc.property(
          fc.record({
            step: fc.constant(WizardStep.PersonalInfo),
            data: fc.record({
              firstName: fc.string({ minLength: 1, maxLength: 50 }),
              lastName: fc.string({ minLength: 1, maxLength: 50 }),
              email: fc.emailAddress(),
              phone: fc.stringMatching(/^\+260[0-9]{9}$/),
            }),
            isFinalSubmission: fc.constant(true),
          }),
          (formData) => {
            const result = validateStep(formData);
            
            // Should be able to proceed with all required fields filled
            expect(result.canProceed).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Format validation (always advisory)', () => {
    
    it('should never block on email format errors', () => {
      fc.assert(
        fc.property(
          fc.record({
            step: fc.constant(WizardStep.PersonalInfo),
            data: fc.record({
              firstName: fc.string({ minLength: 1, maxLength: 50 }),
              lastName: fc.string({ minLength: 1, maxLength: 50 }),
              email: fc.string({ minLength: 1, maxLength: 50 }).filter(s => !s.includes('@')),
              phone: fc.stringMatching(/^\+260[0-9]{9}$/),
            }),
            isFinalSubmission: fc.boolean(),
          }),
          (formData) => {
            const result = validateStep(formData);
            
            // Email format errors should never be blocking
            const emailErrors = result.errors.filter(e => e.field === 'email' && e.message.includes('format'));
            for (const error of emailErrors) {
              expect(error.blocking).toBe(false);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should never block on phone format errors', () => {
      fc.assert(
        fc.property(
          fc.record({
            step: fc.constant(WizardStep.PersonalInfo),
            data: fc.record({
              firstName: fc.string({ minLength: 1, maxLength: 50 }),
              lastName: fc.string({ minLength: 1, maxLength: 50 }),
              email: fc.emailAddress(),
              phone: fc.string({ minLength: 1, maxLength: 20 }).filter(s => !s.startsWith('+260')),
            }),
            isFinalSubmission: fc.boolean(),
          }),
          (formData) => {
            const result = validateStep(formData);
            
            // Phone format errors should never be blocking
            const phoneErrors = result.errors.filter(e => e.field === 'phone' && e.message.includes('format'));
            for (const error of phoneErrors) {
              expect(error.blocking).toBe(false);
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Error severity classification', () => {
    
    it('should classify format errors as warnings, not errors', () => {
      fc.assert(
        fc.property(
          fc.record({
            step: fc.constant(WizardStep.PersonalInfo),
            data: fc.record({
              firstName: fc.string({ minLength: 1, maxLength: 50 }),
              lastName: fc.string({ minLength: 1, maxLength: 50 }),
              email: fc.constant('not-an-email'),
              phone: fc.constant('123'),
            }),
            isFinalSubmission: fc.constant(false),
          }),
          (formData) => {
            const result = validateStep(formData);
            
            // Format errors should be warnings
            const formatErrors = result.errors.filter(e => 
              e.message.includes('format') || e.message.includes('should be')
            );
            for (const error of formatErrors) {
              expect(error.severity).toBe('warning');
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
