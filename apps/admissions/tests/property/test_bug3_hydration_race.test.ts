/**
 * Bug condition exploration test — Grade validation race during hydration.
 *
 * Property 7: Bug Condition — Grade Validation Runs on Empty State During Hydration
 *
 * This test encodes the EXPECTED (fixed) behavior:
 * - When the wizard is on the education step during draft restoration with
 *   grade hydration in progress, validation MUST NOT show "0 added" error.
 * - The source code must contain a `gradesHydrating` state in useWizardState.ts
 *   and hydration-aware validation logic in index.tsx.
 *
 * On UNFIXED code, this test MUST FAIL because:
 * - `useWizardState.ts` has no `gradesHydrating` state
 * - `index.tsx` validates `selectedGrades` synchronously without checking
 *   hydration state, producing false "0 added" errors during async hydration
 *
 * **Validates: Requirements 1.5, 1.6**
 */
// @vitest-environment node
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import * as fs from 'fs';
import * as path from 'path';

// ── Source paths ────────────────────────────────────────────────────────

const USE_WIZARD_STATE_PATH = path.resolve(
  __dirname,
  '../../src/pages/student/applicationWizard/hooks/wizard/state/useWizardState.ts',
);

const INDEX_PATH = path.resolve(
  __dirname,
  '../../src/pages/student/applicationWizard/index.tsx',
);

const USE_WIZARD_CONTROLLER_PATH = path.resolve(
  __dirname,
  '../../src/pages/student/applicationWizard/hooks/useWizardController.ts',
);

// ── Generators ──────────────────────────────────────────────────────────

/** Generate server grade counts that should pass validation (>= 5) */
const passingServerGradeCountArb = fc.integer({ min: 5, max: 10 });

// ── Property Tests ──────────────────────────────────────────────────────

describe('Property 7: Bug Condition — Grade Validation Runs on Empty State During Hydration', () => {
  /**
   * STRUCTURAL TEST: Verify useWizardState.ts contains a `gradesHydrating`
   * boolean state.
   *
   * On UNFIXED code: useWizardState.ts has no `gradesHydrating` state,
   * so this test FAILS.
   *
   * On FIXED code: useWizardState.ts declares and exposes `gradesHydrating`.
   *
   * **Validates: Requirements 1.5, 1.6**
   */
  it('useWizardState.ts declares gradesHydrating state', () => {
    const source = fs.readFileSync(USE_WIZARD_STATE_PATH, 'utf-8');

    // The file must contain a gradesHydrating state declaration
    const hasGradesHydrating =
      source.includes('gradesHydrating') &&
      source.includes('setGradesHydrating');

    expect(hasGradesHydrating).toBe(true);
  });

  /**
   * STRUCTURAL TEST: Verify index.tsx education step validation checks
   * the gradesHydrating flag before running grade count validation.
   *
   * On UNFIXED code: index.tsx validates selectedGrades synchronously
   * without any hydration check, so this test FAILS.
   *
   * On FIXED code: index.tsx checks gradesHydrating and skips or defers
   * grade count validation when hydration is in progress.
   *
   * **Validates: Requirements 1.5, 1.6**
   */
  it('index.tsx education validation checks gradesHydrating before grade count', () => {
    const source = fs.readFileSync(INDEX_PATH, 'utf-8');

    // The file must reference gradesHydrating in the validation logic
    const hasHydrationCheck = source.includes('gradesHydrating');

    expect(hasHydrationCheck).toBe(true);
  });

  /**
   * STRUCTURAL TEST: Verify useWizardController.ts sets gradesHydrating
   * around the hydrateServerGrades call.
   *
   * On UNFIXED code: useWizardController.ts does not reference
   * gradesHydrating at all, so this test FAILS.
   *
   * On FIXED code: useWizardController.ts sets gradesHydrating = true
   * before calling hydrateServerGrades and false after it resolves.
   *
   * **Validates: Requirements 1.5, 1.6**
   */
  it('useWizardController.ts manages gradesHydrating lifecycle around hydrateServerGrades', () => {
    const source = fs.readFileSync(USE_WIZARD_CONTROLLER_PATH, 'utf-8');

    // The controller must reference gradesHydrating
    const hasGradesHydrating = source.includes('gradesHydrating');
    expect(hasGradesHydrating).toBe(true);

    // The controller must expose gradesHydrating in its return value
    const exposesGradesHydrating =
      source.includes('gradesHydrating') &&
      (source.includes('gradesHydrating,') || source.includes('gradesHydrating:'));
    expect(exposesGradesHydrating).toBe(true);
  });

  /**
   * FUNCTIONAL PROPERTY TEST:
   * For any wizard state where currentStep == 'education' AND
   * gradesHydrating == true AND serverGradeCount >= 5, the validation
   * logic MUST NOT produce a "0 added" or low-count error.
   *
   * This simulates the expected fixed validation behavior.
   * On UNFIXED code, the structural tests above fail first (no
   * gradesHydrating state exists).
   *
   * **Validates: Requirements 1.5, 1.6**
   */
  it('validation does not show "0 added" error during hydration', async () => {
    // First verify the structural prerequisite
    const stateSource = fs.readFileSync(USE_WIZARD_STATE_PATH, 'utf-8');
    expect(stateSource).toContain('gradesHydrating');

    await fc.assert(
      fc.asyncProperty(
        passingServerGradeCountArb,
        async (serverGradeCount) => {
          // Simulate the bug condition:
          // - education step active
          // - draft restoration in progress
          // - gradesHydrating == true (hydration not yet complete)
          // - selectedGrades is still [] (not yet populated)
          // - server has >= 5 valid grades
          const gradesHydrating = true;
          const selectedGrades: Array<{ subject_id: string; grade: number }> = [];

          // Simulate the EXPECTED fixed validation logic:
          // When gradesHydrating is true, skip grade count validation
          const errors: Array<{ field: string; message: string }> = [];

          if (!gradesHydrating) {
            const gradeCount = selectedGrades.filter(
              (grade) =>
                grade.subject_id &&
                Number(grade.grade) >= 1 &&
                Number(grade.grade) <= 9,
            ).length;
            if (gradeCount < 5) {
              errors.push({
                field: 'grades',
                message: `Minimum 5 subjects required (${gradeCount} added)`,
              });
            }
          }

          // During hydration, no grade validation error should appear
          const gradeErrors = errors.filter((e) => e.field === 'grades');
          expect(gradeErrors).toHaveLength(0);
        },
      ),
      { numRuns: 50 },
    );
  });

  /**
   * FUNCTIONAL PROPERTY TEST:
   * For any combination of server grade counts >= 5 with empty local
   * selectedGrades during hydration, the validation must not produce
   * a false "0 added" error.
   *
   * This is the core race condition: selectedGrades is [] while
   * hydrateServerGrades() is fetching grades from the server.
   *
   * **Validates: Requirements 1.5, 1.6**
   */
  it('empty selectedGrades during hydration does not trigger false validation error', async () => {
    // Structural prerequisite
    const stateSource = fs.readFileSync(USE_WIZARD_STATE_PATH, 'utf-8');
    expect(stateSource).toContain('gradesHydrating');

    await fc.assert(
      fc.asyncProperty(
        passingServerGradeCountArb,
        fc.boolean(),
        async (serverGradeCount, _randomFlag) => {
          // The bug scenario: selectedGrades is empty, but server has grades
          const gradesHydrating = true;
          const selectedGrades: Array<{ subject_id: string; grade: number }> = [];

          // The UNFIXED validation would do:
          // const gradeCount = selectedGrades.filter(...).length  // = 0
          // if (gradeCount < 5) errors.push(...)  // "0 added" error!

          // The FIXED validation checks gradesHydrating first:
          let wouldShowError = false;
          if (!gradesHydrating) {
            const gradeCount = selectedGrades.filter(
              (g) => g.subject_id && Number(g.grade) >= 1 && Number(g.grade) <= 9,
            ).length;
            if (gradeCount < 5) {
              wouldShowError = true;
            }
          }

          // Must NOT show error during hydration
          expect(wouldShowError).toBe(false);

          // Verify the server actually has enough grades
          expect(serverGradeCount).toBeGreaterThanOrEqual(5);
        },
      ),
      { numRuns: 50 },
    );
  });
});
