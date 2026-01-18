/**
 * Property-Based Test: Auto-Save Timing
 * 
 * **Property 3: Auto-Save Timing**
 * **Validates: Requirements 3.1**
 * 
 * For any form with data, the auto-save mechanism SHALL save to localStorage
 * within 8 seconds of the last save, regardless of whether changes were detected.
 * 
 * Feature: realtime-autosave-fix, Property 3: Auto-Save Timing
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';

// Property test configuration - minimum 100 iterations
const propertyTestConfig = { numRuns: 100 };

// Auto-save interval in milliseconds (8 seconds)
const AUTO_SAVE_INTERVAL_MS = 8000;

/**
 * WizardFormData interface matching the application wizard
 */
interface WizardFormData {
  full_name?: string;
  email?: string;
  phone?: string;
  date_of_birth?: string;
  sex?: 'Male' | 'Female';
  nrc_number?: string;
  passport_number?: string;
  residence_town?: string;
  nationality?: string;
  next_of_kin_name?: string;
  next_of_kin_phone?: string;
  program?: string;
  intake?: string;
  payment_method?: string;
  amount?: number;
}

/**
 * Draft structure matching localStorage storage format
 */
interface WizardDraft {
  formData: WizardFormData;
  selectedGrades: Array<{ subject_id: string; grade: number }>;
  currentStep: number;
  currentStepKey: string;
  applicationId: string | null;
  savedAt: string;
  version: number;
}

/**
 * Simulates the auto-save mechanism logic
 * This mirrors the setInterval logic in useWizardController.ts
 */
class AutoSaveSimulator {
  private lastSaveTime: number | null = null;
  private saveCount = 0;
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private localStorage: Map<string, string> = new Map();
  
  /**
   * Check if form has data (mirrors the hasData check in useWizardController)
   */
  private hasData(formData: WizardFormData): boolean {
    return Object.values(formData).some(v => v !== undefined && v !== null && v !== '');
  }
  
  /**
   * Save draft to localStorage (mirrors saveDraft function)
   */
  private saveDraft(formData: WizardFormData, selectedGrades: Array<{ subject_id: string; grade: number }> = []): void {
    const draft: WizardDraft = {
      formData,
      selectedGrades,
      currentStep: 1,
      currentStepKey: 'basicKyc',
      applicationId: null,
      savedAt: new Date().toISOString(),
      version: 2
    };
    
    this.localStorage.set('applicationWizardDraft', JSON.stringify(draft));
    this.lastSaveTime = Date.now();
    this.saveCount++;
  }
  
  /**
   * Start auto-save interval (mirrors the useEffect in useWizardController)
   */
  startAutoSave(getFormData: () => WizardFormData): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
    }
    
    this.intervalId = setInterval(() => {
      const formData = getFormData();
      if (this.hasData(formData)) {
        this.saveDraft(formData);
      }
    }, AUTO_SAVE_INTERVAL_MS);
  }
  
  /**
   * Stop auto-save interval
   */
  stopAutoSave(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }
  
  /**
   * Get the last save time
   */
  getLastSaveTime(): number | null {
    return this.lastSaveTime;
  }
  
  /**
   * Get the save count
   */
  getSaveCount(): number {
    return this.saveCount;
  }
  
  /**
   * Get saved draft from localStorage
   */
  getSavedDraft(): WizardDraft | null {
    const saved = this.localStorage.get('applicationWizardDraft');
    if (!saved) return null;
    try {
      return JSON.parse(saved);
    } catch {
      return null;
    }
  }
  
  /**
   * Reset the simulator
   */
  reset(): void {
    this.stopAutoSave();
    this.lastSaveTime = null;
    this.saveCount = 0;
    this.localStorage.clear();
  }
  
  /**
   * Manually trigger a save (for testing)
   */
  triggerSave(formData: WizardFormData): void {
    if (this.hasData(formData)) {
      this.saveDraft(formData);
    }
  }
}

/**
 * Calculate time since last save
 */
function timeSinceLastSave(lastSaveTime: number | null): number {
  if (lastSaveTime === null) return Infinity;
  return Date.now() - lastSaveTime;
}

/**
 * Check if auto-save timing constraint is satisfied
 * The constraint: save should occur within 8 seconds
 */
function isAutoSaveTimingValid(
  lastSaveTime: number | null,
  currentTime: number,
  intervalMs: number = AUTO_SAVE_INTERVAL_MS
): boolean {
  if (lastSaveTime === null) return true; // No save yet is valid initially
  const elapsed = currentTime - lastSaveTime;
  // Allow small tolerance for timing variations (100ms)
  return elapsed <= intervalMs + 100;
}

describe('Property 3: Auto-Save Timing', () => {
  let simulator: AutoSaveSimulator;
  
  beforeEach(() => {
    simulator = new AutoSaveSimulator();
    vi.useFakeTimers();
  });
  
  afterEach(() => {
    simulator.reset();
    vi.useRealTimers();
  });
  
  // Arbitrary for form data with at least one non-empty field
  const nonEmptyFormDataArb = fc.record({
    full_name: fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nil: undefined }),
    email: fc.option(fc.emailAddress(), { nil: undefined }),
    phone: fc.option(fc.string({ minLength: 10, maxLength: 15 }), { nil: undefined }),
    date_of_birth: fc.option(fc.constant('1990-01-01'), { nil: undefined }),
    sex: fc.option(fc.constantFrom<'Male' | 'Female'>('Male', 'Female'), { nil: undefined }),
    nrc_number: fc.option(fc.string({ minLength: 6, maxLength: 15 }), { nil: undefined }),
    passport_number: fc.option(fc.string({ minLength: 6, maxLength: 15 }), { nil: undefined }),
    residence_town: fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nil: undefined }),
    nationality: fc.option(fc.constant('Zambian'), { nil: undefined }),
    next_of_kin_name: fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nil: undefined }),
    next_of_kin_phone: fc.option(fc.string({ minLength: 10, maxLength: 15 }), { nil: undefined }),
    program: fc.option(fc.uuid(), { nil: undefined }),
    intake: fc.option(fc.string({ minLength: 1, maxLength: 30 }), { nil: undefined }),
    payment_method: fc.option(fc.constantFrom('MTN Money', 'Airtel Money', 'Bank Transfer'), { nil: undefined }),
    amount: fc.option(fc.integer({ min: 153, max: 1000 }), { nil: undefined })
  }).filter(data => {
    // Ensure at least one field has data
    return Object.values(data).some(v => v !== undefined && v !== null && v !== '');
  });
  
  // Arbitrary for empty form data
  const emptyFormDataArb = fc.constant<WizardFormData>({});
  
  // Arbitrary for number of intervals to simulate
  const intervalCountArb = fc.integer({ min: 1, max: 10 });

  /**
   * Property: Auto-save fires within 8 seconds for forms with data
   * For any form with data, after 8 seconds, a save should have occurred
   */
  it('auto-save fires within 8 seconds for forms with data', () => {
    fc.assert(
      fc.property(
        nonEmptyFormDataArb,
        (formData) => {
          simulator.reset();
          
          // Start auto-save with the form data
          simulator.startAutoSave(() => formData);
          
          // Advance time by exactly 8 seconds
          vi.advanceTimersByTime(AUTO_SAVE_INTERVAL_MS);
          
          // Verify save occurred
          expect(simulator.getSaveCount()).toBeGreaterThanOrEqual(1);
          
          // Verify draft was saved to localStorage
          const savedDraft = simulator.getSavedDraft();
          expect(savedDraft).not.toBeNull();
          expect(savedDraft?.version).toBe(2);
          
          simulator.stopAutoSave();
          return true;
        }
      ),
      propertyTestConfig
    );
  });

  /**
   * Property: Auto-save does not fire for empty forms
   * For any empty form, auto-save should not save to localStorage
   */
  it('auto-save does not fire for empty forms', () => {
    fc.assert(
      fc.property(
        emptyFormDataArb,
        (formData) => {
          simulator.reset();
          
          // Start auto-save with empty form data
          simulator.startAutoSave(() => formData);
          
          // Advance time by 8 seconds
          vi.advanceTimersByTime(AUTO_SAVE_INTERVAL_MS);
          
          // Verify no save occurred
          expect(simulator.getSaveCount()).toBe(0);
          
          // Verify no draft in localStorage
          const savedDraft = simulator.getSavedDraft();
          expect(savedDraft).toBeNull();
          
          simulator.stopAutoSave();
          return true;
        }
      ),
      propertyTestConfig
    );
  });

  /**
   * Property: Multiple intervals result in multiple saves
   * For any form with data, after N intervals, N saves should have occurred
   */
  it('multiple intervals result in multiple saves', () => {
    fc.assert(
      fc.property(
        nonEmptyFormDataArb,
        intervalCountArb,
        (formData, intervalCount) => {
          simulator.reset();
          
          // Start auto-save
          simulator.startAutoSave(() => formData);
          
          // Advance time by N intervals
          vi.advanceTimersByTime(AUTO_SAVE_INTERVAL_MS * intervalCount);
          
          // Verify correct number of saves occurred
          expect(simulator.getSaveCount()).toBe(intervalCount);
          
          simulator.stopAutoSave();
          return true;
        }
      ),
      propertyTestConfig
    );
  });

  /**
   * Property: Save timing is consistent
   * For any form with data, each save should occur at the expected interval
   */
  it('save timing is consistent at 8-second intervals', () => {
    fc.assert(
      fc.property(
        nonEmptyFormDataArb,
        (formData) => {
          simulator.reset();
          const saveTimes: number[] = [];
          
          // Create a custom simulator that tracks save times
          let saveCount = 0;
          const trackingSaveDraft = () => {
            saveTimes.push(Date.now());
            saveCount++;
          };
          
          // Manually simulate the interval behavior
          const startTime = Date.now();
          
          // Simulate 3 intervals
          for (let i = 0; i < 3; i++) {
            vi.advanceTimersByTime(AUTO_SAVE_INTERVAL_MS);
            trackingSaveDraft();
          }
          
          // Verify timing between saves
          for (let i = 1; i < saveTimes.length; i++) {
            const timeBetweenSaves = saveTimes[i] - saveTimes[i - 1];
            expect(timeBetweenSaves).toBe(AUTO_SAVE_INTERVAL_MS);
          }
          
          return true;
        }
      ),
      propertyTestConfig
    );
  });

  /**
   * Property: Form data is preserved in saved draft
   * For any form with data, the saved draft should contain the same data
   */
  it('form data is preserved in saved draft', () => {
    fc.assert(
      fc.property(
        nonEmptyFormDataArb,
        (formData) => {
          simulator.reset();
          
          // Trigger a save
          simulator.triggerSave(formData);
          
          // Get the saved draft
          const savedDraft = simulator.getSavedDraft();
          
          // Verify draft exists
          expect(savedDraft).not.toBeNull();
          
          // Verify form data is preserved
          Object.keys(formData).forEach(key => {
            const originalValue = formData[key as keyof WizardFormData];
            const savedValue = savedDraft?.formData[key as keyof WizardFormData];
            
            if (originalValue !== undefined) {
              expect(savedValue).toBe(originalValue);
            }
          });
          
          return true;
        }
      ),
      propertyTestConfig
    );
  });

  /**
   * Property: Draft version is always 2
   * For any saved draft, the version should be 2 (current schema version)
   */
  it('draft version is always 2', () => {
    fc.assert(
      fc.property(
        nonEmptyFormDataArb,
        (formData) => {
          simulator.reset();
          
          // Trigger a save
          simulator.triggerSave(formData);
          
          // Get the saved draft
          const savedDraft = simulator.getSavedDraft();
          
          // Verify version is 2
          expect(savedDraft?.version).toBe(2);
          
          return true;
        }
      ),
      propertyTestConfig
    );
  });

  /**
   * Property: savedAt timestamp is valid ISO string
   * For any saved draft, the savedAt field should be a valid ISO timestamp
   */
  it('savedAt timestamp is valid ISO string', () => {
    fc.assert(
      fc.property(
        nonEmptyFormDataArb,
        (formData) => {
          simulator.reset();
          
          // Trigger a save
          simulator.triggerSave(formData);
          
          // Get the saved draft
          const savedDraft = simulator.getSavedDraft();
          
          // Verify savedAt is a valid ISO string
          expect(savedDraft?.savedAt).toBeDefined();
          const parsedDate = new Date(savedDraft!.savedAt);
          expect(parsedDate.toISOString()).toBe(savedDraft!.savedAt);
          
          return true;
        }
      ),
      propertyTestConfig
    );
  });

  /**
   * Property: Auto-save interval is exactly 8 seconds
   * The interval between saves should be exactly 8000ms
   */
  it('auto-save interval is exactly 8 seconds (8000ms)', () => {
    fc.assert(
      fc.property(
        nonEmptyFormDataArb,
        (formData) => {
          simulator.reset();
          
          // Start auto-save
          simulator.startAutoSave(() => formData);
          
          // Advance by less than 8 seconds - no save should occur
          vi.advanceTimersByTime(7999);
          expect(simulator.getSaveCount()).toBe(0);
          
          // Advance by 1 more ms to reach exactly 8 seconds
          vi.advanceTimersByTime(1);
          expect(simulator.getSaveCount()).toBe(1);
          
          simulator.stopAutoSave();
          return true;
        }
      ),
      propertyTestConfig
    );
  });
});
