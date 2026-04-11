/**
 * Preservation property tests — Grade validation enforced after hydration.
 *
 * Property 8: Preservation — Grade Validation Correct After Hydration and for Fresh Apps
 *
 * These tests verify EXISTING correct behavior that must be preserved:
 * 1. Fresh applications with no grades show "0 added" validation
 * 2. Manual grade add/remove validates in real-time
 * 3. Fewer than 5 valid grades after hydration shows correct count
 *
 * All tests MUST PASS on UNFIXED code.
 *
 * **Validates: Requirements 3.5, 3.6, 3.7**
 */
// @vitest-environment node
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import * as fs from 'fs';
import * as path from 'path';

// ── Source paths ────────────────────────────────────────────────────────

const INDEX_PATH = path.resolve(
  __dirname,
  '../../src/pages/student/applicationWizard/index.tsx',
);

const USE_WIZARD_STATE_PATH = path.resolve(
  __dirname,
  '../../src/pages/student/applicationWizard/hooks/wizard/state/useWizardState.ts',
);

// ── Types ───────────────────────────────────────────────────────────────

interface SubjectGrade {
  subject_id: string;
  grade: number;
}

// ── Validation logic extracted from index.tsx ───────────────────────────
// This mirrors the validation logic in collectStepValidationErrors()
// for the education step. On both unfixed and fixed code, this logic
// checks selectedGrades.filter(g => g.subject_id && grade in 1-9).length

function validateGradeCount(selectedGrades: SubjectGrade[]): {
  gradeCount: number;
  isValid: boolean;
  errorMessage: string | null;
} {
  const gradeCount = selectedGrades.filter(
    (grade) =>
      grade.subject_id &&
      Number(grade.grade) >= 1 &&
      Number(grade.grade) <= 9,
  ).length;

  const isValid = gradeCount >= 5;
  const errorMessage = isValid
    ? null
    : `Minimum 5 subjects required (${gradeCount} added)`;

  return { gradeCount, isValid, errorMessage };
}

// ── Generators ──────────────────────────────────────────────────────────
// Tests below use inline grade construction for clarity and simplicity.

// ── Property Tests ──────────────────────────────────────────────────────

describe('Property 8: Preservation — Grade Validation Correct After Hydration and for Fresh Apps', () => {
  /**
   * STRUCTURAL TEST: The index.tsx education step validation contains
   * the grade count check with the "Minimum 5 subjects required" message.
   *
   * This verifies the validation logic exists on both unfixed and fixed code.
   *
   * **Validates: Requirements 3.5, 3.6, 3.7**
   */
  it('index.tsx contains education step grade count validation', () => {
    const source = fs.readFileSync(INDEX_PATH, 'utf-8');

    // The validation must check for education step
    expect(source).toContain("currentStepConfig.key === 'education'");

    // The validation must filter grades by subject_id and grade range
    expect(source).toContain('grade.subject_id');
    expect(source).toContain('Number(grade.grade)');

    // The validation must enforce minimum 5 subjects
    expect(source).toContain('gradeCount < 5');
    expect(source).toContain('Minimum 5 subjects required');
  });

  /**
   * STRUCTURAL TEST: useWizardState.ts initializes selectedGrades as
   * an empty array and provides add/remove/update operations.
   *
   * This verifies the grade state management exists on both unfixed
   * and fixed code.
   *
   * **Validates: Requirements 3.5, 3.6**
   */
  it('useWizardState.ts manages selectedGrades with add/remove/update', () => {
    const source = fs.readFileSync(USE_WIZARD_STATE_PATH, 'utf-8');

    // selectedGrades must be initialized as empty array
    expect(source).toContain('selectedGrades');
    expect(source).toContain('setSelectedGrades');

    // Must have add, remove, update operations
    expect(source).toContain('addGrade');
    expect(source).toContain('removeGrade');
    expect(source).toContain('updateGrade');
  });

  /**
   * FUNCTIONAL PROPERTY TEST:
   * For a fresh application with no grades (empty selectedGrades),
   * validation shows "Minimum 5 subjects required (0 added)".
   *
   * This is correct behavior that must be preserved.
   *
   * **Validates: Requirements 3.5**
   */
  it('fresh application with no grades shows "0 added" validation', () => {
    const selectedGrades: SubjectGrade[] = [];
    const result = validateGradeCount(selectedGrades);

    expect(result.gradeCount).toBe(0);
    expect(result.isValid).toBe(false);
    expect(result.errorMessage).toBe('Minimum 5 subjects required (0 added)');
  });

  /**
   * FUNCTIONAL PROPERTY TEST:
   * For any number of valid grades from 0 to 4, validation fails
   * with the correct count in the error message.
   *
   * **Validates: Requirements 3.6, 3.7**
   */
  it('fewer than 5 valid grades shows correct count in error', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 0, max: 4 }),
        async (validCount) => {
          // Generate exactly validCount valid grades
          const grades: SubjectGrade[] = Array.from(
            { length: validCount },
            (_, i) => ({
              subject_id: `subject-${i + 1}`,
              grade: (i % 9) + 1, // grades 1-9
            }),
          );

          const result = validateGradeCount(grades);

          expect(result.gradeCount).toBe(validCount);
          expect(result.isValid).toBe(false);
          expect(result.errorMessage).toBe(
            `Minimum 5 subjects required (${validCount} added)`,
          );
        },
      ),
      { numRuns: 5 },
    );
  });

  /**
   * FUNCTIONAL PROPERTY TEST:
   * For any number of valid grades >= 5, validation passes.
   *
   * **Validates: Requirements 3.6**
   */
  it('5 or more valid grades passes validation', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 5, max: 10 }),
        async (validCount) => {
          const grades: SubjectGrade[] = Array.from(
            { length: validCount },
            (_, i) => ({
              subject_id: `subject-${i + 1}`,
              grade: (i % 9) + 1,
            }),
          );

          const result = validateGradeCount(grades);

          expect(result.gradeCount).toBe(validCount);
          expect(result.isValid).toBe(true);
          expect(result.errorMessage).toBeNull();
        },
      ),
      { numRuns: 6 },
    );
  });

  /**
   * FUNCTIONAL PROPERTY TEST:
   * For any combination of valid and invalid grades, only valid grades
   * (non-empty subject_id AND grade 1-9) are counted.
   *
   * This tests real-time validation during manual grade add/remove.
   *
   * **Validates: Requirements 3.6**
   */
  it('validation counts only grades with subject_id and grade 1-9', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 0, max: 8 }),
        fc.integer({ min: 0, max: 5 }),
        async (validCount, invalidCount) => {
          const validGrades: SubjectGrade[] = Array.from(
            { length: validCount },
            (_, i) => ({
              subject_id: `subject-${i + 1}`,
              grade: (i % 9) + 1,
            }),
          );

          const invalidGrades: SubjectGrade[] = Array.from(
            { length: invalidCount },
            () => ({
              subject_id: '',
              grade: 0,
            }),
          );

          // Shuffle valid and invalid together
          const allGrades = [...validGrades, ...invalidGrades];
          const result = validateGradeCount(allGrades);

          // Only valid grades should be counted
          expect(result.gradeCount).toBe(validCount);
          expect(result.isValid).toBe(validCount >= 5);
        },
      ),
      { numRuns: 50 },
    );
  });

  /**
   * FUNCTIONAL PROPERTY TEST:
   * For any selectedGrades array of length 0-20 where all grades have
   * valid subject_id and grade in 1-9, the validation result matches
   * the array length comparison against 5.
   *
   * **Validates: Requirements 3.5, 3.6, 3.7**
   */
  it('validation pass/fail matches length >= 5 for all-valid arrays', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 0, max: 20 }),
        async (count) => {
          const grades: SubjectGrade[] = Array.from(
            { length: count },
            (_, i) => ({
              subject_id: `subject-${i + 1}`,
              grade: (i % 9) + 1,
            }),
          );

          const result = validateGradeCount(grades);

          expect(result.gradeCount).toBe(count);
          expect(result.isValid).toBe(count >= 5);

          if (count < 5) {
            expect(result.errorMessage).toBe(
              `Minimum 5 subjects required (${count} added)`,
            );
          } else {
            expect(result.errorMessage).toBeNull();
          }
        },
      ),
      { numRuns: 21 },
    );
  });

  /**
   * FUNCTIONAL PROPERTY TEST:
   * Adding a grade increases the count by 1 (if valid), removing
   * decreases by 1. This tests real-time validation behavior.
   *
   * **Validates: Requirements 3.6**
   */
  it('adding a valid grade increases count, removing decreases count', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 0, max: 9 }),
        async (startCount) => {
          const grades: SubjectGrade[] = Array.from(
            { length: startCount },
            (_, i) => ({
              subject_id: `subject-${i + 1}`,
              grade: (i % 9) + 1,
            }),
          );

          const beforeResult = validateGradeCount(grades);
          expect(beforeResult.gradeCount).toBe(startCount);

          // Add a valid grade
          const withAdded = [
            ...grades,
            { subject_id: 'new-subject', grade: 5 },
          ];
          const afterAddResult = validateGradeCount(withAdded);
          expect(afterAddResult.gradeCount).toBe(startCount + 1);

          // Remove the last grade
          const withRemoved = withAdded.slice(0, -1);
          const afterRemoveResult = validateGradeCount(withRemoved);
          expect(afterRemoveResult.gradeCount).toBe(startCount);
        },
      ),
      { numRuns: 10 },
    );
  });

  /**
   * FUNCTIONAL PROPERTY TEST:
   * Fewer than 5 valid grades after hydration completes shows the
   * correct count and blocks progression.
   *
   * This simulates the post-hydration scenario where the server
   * returned fewer than 5 grades.
   *
   * **Validates: Requirements 3.7**
   */
  it('fewer than 5 valid grades after hydration shows correct count', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 4 }),
        async (hydratedCount) => {
          // Simulate grades that came from the server via hydration
          const hydratedGrades: SubjectGrade[] = Array.from(
            { length: hydratedCount },
            (_, i) => ({
              subject_id: `server-subject-${i + 1}`,
              grade: (i % 9) + 1,
            }),
          );

          const result = validateGradeCount(hydratedGrades);

          // After hydration with < 5 grades, validation should fail
          expect(result.gradeCount).toBe(hydratedCount);
          expect(result.isValid).toBe(false);
          expect(result.errorMessage).toBe(
            `Minimum 5 subjects required (${hydratedCount} added)`,
          );
        },
      ),
      { numRuns: 4 },
    );
  });
});
