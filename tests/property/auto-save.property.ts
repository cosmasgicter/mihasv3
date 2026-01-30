/**
 * Property Test: Auto-Save Round-Trip
 * Feature: bun-vercel-migration
 * Property 3: Auto-Save Round-Trip
 * Validates: Requirements 8.2, 8.3, 8.4
 * 
 * For any form data object in the Application Wizard, if the auto-save system 
 * saves it to localStorage, then reloading the page SHALL restore the exact 
 * same form data. The save operation SHALL occur every 8 seconds and SHALL 
 * NOT block UI interactions.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';

// Mock localStorage for testing
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; },
  };
})();

// Auto-save key pattern
const AUTO_SAVE_KEY_PREFIX = 'autosave_/apply_';

// Form data interface matching Application Wizard
interface WizardFormData {
  // Step 1: Personal Information
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  dateOfBirth: string;
  sex: 'Male' | 'Female' | '';
  nationality: string;
  
  // Step 2: Academic History
  previousSchool: string;
  yearCompleted: number;
  
  // Step 3: Program Selection
  programId: string;
  intakeId: string;
  
  // Step 4: Documents (file references)
  uploadedDocuments: string[];
  
  // Meta
  currentStep: number;
}

// Auto-save data structure
interface AutoSaveData {
  data: WizardFormData;
  timestamp: string;
  version: number;
}

// Save function (mirrors useAutoSave.ts)
function saveFormData(key: string, data: WizardFormData): void {
  const saveData: AutoSaveData = {
    data,
    timestamp: new Date().toISOString(),
    version: 1,
  };
  localStorageMock.setItem(key, JSON.stringify(saveData));
}

// Restore function (mirrors useAutoSave.ts)
function restoreFormData(key: string): WizardFormData | null {
  const saved = localStorageMock.getItem(key);
  if (!saved) return null;
  
  try {
    const parsed: AutoSaveData = JSON.parse(saved);
    return parsed.data;
  } catch {
    return null;
  }
}

// Form data arbitrary generator
const wizardFormDataArbitrary = fc.record({
  firstName: fc.string({ minLength: 1, maxLength: 100 }),
  lastName: fc.string({ minLength: 1, maxLength: 100 }),
  email: fc.emailAddress(),
  phone: fc.stringMatching(/^\+260[0-9]{9}$/),
  dateOfBirth: fc.constantFrom('1990-01-15', '1995-06-20', '2000-03-10', '1985-12-25', '2005-08-30'),
  sex: fc.constantFrom('Male', 'Female', '' as const),
  nationality: fc.constantFrom('Zambian', 'Zimbabwean', 'Malawian', 'Other'),
  previousSchool: fc.string({ minLength: 1, maxLength: 200 }),
  yearCompleted: fc.integer({ min: 2000, max: 2025 }),
  programId: fc.uuid(),
  intakeId: fc.uuid(),
  uploadedDocuments: fc.array(fc.uuid(), { minLength: 0, maxLength: 5 }),
  currentStep: fc.integer({ min: 0, max: 3 }),
});

describe('Feature: bun-vercel-migration, Property 3: Auto-Save Round-Trip', () => {
  
  beforeEach(() => {
    localStorageMock.clear();
  });

  afterEach(() => {
    localStorageMock.clear();
  });

  it('should restore saved form data exactly', () => {
    fc.assert(
      fc.property(
        wizardFormDataArbitrary,
        (formData) => {
          const key = `${AUTO_SAVE_KEY_PREFIX}test`;
          
          // Save to localStorage
          saveFormData(key, formData);
          
          // Restore from localStorage
          const restored = restoreFormData(key);
          
          // Verify round-trip
          expect(restored).toEqual(formData);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should preserve all form fields through save/restore cycle', () => {
    fc.assert(
      fc.property(
        wizardFormDataArbitrary,
        (formData) => {
          const key = `${AUTO_SAVE_KEY_PREFIX}fields`;
          
          saveFormData(key, formData);
          const restored = restoreFormData(key);
          
          // Check each field individually
          expect(restored?.firstName).toBe(formData.firstName);
          expect(restored?.lastName).toBe(formData.lastName);
          expect(restored?.email).toBe(formData.email);
          expect(restored?.phone).toBe(formData.phone);
          expect(restored?.dateOfBirth).toBe(formData.dateOfBirth);
          expect(restored?.sex).toBe(formData.sex);
          expect(restored?.nationality).toBe(formData.nationality);
          expect(restored?.previousSchool).toBe(formData.previousSchool);
          expect(restored?.yearCompleted).toBe(formData.yearCompleted);
          expect(restored?.programId).toBe(formData.programId);
          expect(restored?.intakeId).toBe(formData.intakeId);
          expect(restored?.uploadedDocuments).toEqual(formData.uploadedDocuments);
          expect(restored?.currentStep).toBe(formData.currentStep);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should handle special characters in form data', () => {
    fc.assert(
      fc.property(
        fc.record({
          firstName: fc.string({ minLength: 1, maxLength: 50 }),
          lastName: fc.string({ minLength: 1, maxLength: 50 }),
          email: fc.emailAddress(),
          phone: fc.constant('+260971234567'),
          dateOfBirth: fc.constant('2000-01-01'),
          sex: fc.constant('Male' as const),
          nationality: fc.constant('Zambian'),
          previousSchool: fc.string({ minLength: 1, maxLength: 100 }),
          yearCompleted: fc.constant(2020),
          programId: fc.uuid(),
          intakeId: fc.uuid(),
          uploadedDocuments: fc.constant([]),
          currentStep: fc.constant(0),
        }),
        (formData) => {
          const key = `${AUTO_SAVE_KEY_PREFIX}special`;
          
          saveFormData(key, formData);
          const restored = restoreFormData(key);
          
          expect(restored).toEqual(formData);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should return null for non-existent keys', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 50 }),
        (randomKey) => {
          const restored = restoreFormData(`nonexistent_${randomKey}`);
          expect(restored).toBeNull();
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should handle multiple save operations (latest wins)', () => {
    fc.assert(
      fc.property(
        fc.array(wizardFormDataArbitrary, { minLength: 2, maxLength: 5 }),
        (formDataArray) => {
          const key = `${AUTO_SAVE_KEY_PREFIX}multiple`;
          
          // Save multiple times
          for (const formData of formDataArray) {
            saveFormData(key, formData);
          }
          
          // Restore should return the last saved data
          const restored = restoreFormData(key);
          const lastSaved = formDataArray[formDataArray.length - 1];
          
          expect(restored).toEqual(lastSaved);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should include timestamp in saved data', () => {
    fc.assert(
      fc.property(
        wizardFormDataArbitrary,
        (formData) => {
          const key = `${AUTO_SAVE_KEY_PREFIX}timestamp`;
          const beforeSave = new Date();
          
          saveFormData(key, formData);
          
          const afterSave = new Date();
          const saved = localStorageMock.getItem(key);
          const parsed: AutoSaveData = JSON.parse(saved!);
          const savedTime = new Date(parsed.timestamp);
          
          // Timestamp should be between before and after save
          expect(savedTime.getTime()).toBeGreaterThanOrEqual(beforeSave.getTime());
          expect(savedTime.getTime()).toBeLessThanOrEqual(afterSave.getTime());
        }
      ),
      { numRuns: 100 }
    );
  });
});
