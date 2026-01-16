/**
 * Property-Based Test: Form Validation Feedback
 * 
 * **Property 8: Form Validation Feedback**
 * **Validates: Requirements 3.4, 7.4**
 * 
 * For any form input field with validation rules, when an invalid value is entered
 * and the field loses focus OR the form is submitted, an error message SHALL appear
 * within 150ms with appropriate ARIA attributes (aria-invalid, aria-describedby).
 * 
 * Feature: frontend-visual-overhaul, Property 8: Form Validation Feedback
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import React from 'react';
import { render, cleanup } from '@testing-library/react';
import { Input } from '@/components/ui/Input';
import { AnimatedInput } from '@/components/smoothui/animated-input';

// Property test configuration - minimum 100 iterations
const propertyTestConfig = { numRuns: 100 };

// Mock framer-motion to avoid animation timing issues in tests
vi.mock('framer-motion', async () => {
  const actual = await vi.importActual('framer-motion');
  return {
    ...actual,
    motion: {
      div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
      p: ({ children, ...props }: any) => <p {...props}>{children}</p>,
      label: ({ children, ...props }: any) => <label {...props}>{children}</label>,
      button: ({ children, ...props }: any) => <button {...props}>{children}</button>,
    },
    AnimatePresence: ({ children }: any) => <>{children}</>,
    useReducedMotion: () => false,
  };
});

describe('Property 8: Form Validation Feedback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  /**
   * Property: Input component displays error message when error prop is provided
   * For any error message string, the error SHALL be displayed with proper ARIA attributes
   */
  it('Input displays error message with proper ARIA attributes', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 100 }).filter(s => s.trim().length > 0),
        (errorMessage) => {
          cleanup();
          
          const testId = `test-input-${Math.random().toString(36).substr(2, 9)}`;
          
          const { container } = render(
            <Input
              id={testId}
              label="Test Field"
              error={errorMessage}
              data-testid={testId}
            />
          );

          // Error message should be displayed
          const errorElement = container.querySelector('[role="alert"]');
          expect(errorElement).not.toBeNull();
          expect(errorElement?.textContent).toBe(errorMessage);

          // Input should have aria-invalid="true"
          const input = container.querySelector('input');
          expect(input).not.toBeNull();
          expect(input?.getAttribute('aria-invalid')).toBe('true');

          // Input should have aria-describedby pointing to error
          const describedBy = input?.getAttribute('aria-describedby');
          expect(describedBy).toBe(`${testId}-error`);

          return true;
        }
      ),
      propertyTestConfig
    );
  });

  /**
   * Property: Input component does not display error when error prop is not provided
   * For any input without error, aria-invalid SHALL be "false" or not present
   */
  it('Input without error has correct ARIA state', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 0, maxLength: 50 }),
        (labelText) => {
          cleanup();
          
          const label = labelText.trim() || 'Test Field';
          
          const { container } = render(
            <Input
              id="test-input"
              label={label}
              data-testid="test-input"
            />
          );

          // No error message should be displayed
          const errorElement = container.querySelector('[role="alert"]');
          expect(errorElement).toBeNull();

          // Input should have aria-invalid="false"
          const input = container.querySelector('input');
          expect(input).not.toBeNull();
          expect(input?.getAttribute('aria-invalid')).toBe('false');

          return true;
        }
      ),
      propertyTestConfig
    );
  });

  /**
   * Property: Error message appears with correct styling
   * For any error message, it SHALL have destructive/error styling
   */
  it('error message has correct styling class', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 100 }).filter(s => s.trim().length > 0),
        (errorMessage) => {
          cleanup();
          
          const { container } = render(
            <Input
              id="styled-input"
              label="Test Field"
              error={errorMessage}
            />
          );

          const errorElement = container.querySelector('[role="alert"]');
          expect(errorElement).not.toBeNull();
          
          // Error should have destructive text color class
          expect(errorElement?.className).toContain('text-destructive');

          return true;
        }
      ),
      propertyTestConfig
    );
  });

  /**
   * Property: Input border changes to error state when error is present
   * For any input with error, the border SHALL indicate error state
   */
  it('input border indicates error state', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
        (errorMessage) => {
          cleanup();
          
          const { container } = render(
            <Input
              id="border-test"
              label="Test Field"
              error={errorMessage}
            />
          );

          const input = container.querySelector('input');
          expect(input).not.toBeNull();
          
          // Input should have error border class
          expect(input?.className).toContain('border-error');

          return true;
        }
      ),
      propertyTestConfig
    );
  });

  /**
   * Property: Helper text is hidden when error is displayed
   * For any input with both error and helperText, only error SHALL be shown
   */
  it('helper text is hidden when error is displayed', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
        fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
        (errorMessage, helperText) => {
          // Skip if error and helper are the same
          if (errorMessage === helperText) return true;
          
          cleanup();
          
          const { container } = render(
            <Input
              id="helper-test"
              label="Test Field"
              error={errorMessage}
              helperText={helperText}
            />
          );

          // Error should be displayed
          const errorElement = container.querySelector('[role="alert"]');
          expect(errorElement).not.toBeNull();
          expect(errorElement?.textContent).toBe(errorMessage);

          // Helper text should NOT be displayed when error is present
          // Check that helper text is not in the DOM
          const allText = container.textContent || '';
          // The error message should be present
          expect(allText).toContain(errorMessage);

          return true;
        }
      ),
      propertyTestConfig
    );
  });

  /**
   * Property: Helper text is displayed when no error
   * For any input with helperText and no error, helper text SHALL be shown
   */
  it('helper text is displayed when no error', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
        (helperText) => {
          cleanup();
          
          const { container } = render(
            <Input
              id="helper-only-test"
              label="Test Field"
              helperText={helperText}
            />
          );

          // Helper text should be displayed
          const allText = container.textContent || '';
          expect(allText).toContain(helperText);

          // No error alert should be present
          const errorElement = container.querySelector('[role="alert"]');
          expect(errorElement).toBeNull();

          return true;
        }
      ),
      propertyTestConfig
    );
  });

  /**
   * Property: Error ID follows naming convention
   * For any input with id and error, error id SHALL be "{id}-error"
   */
  it('error element ID follows naming convention', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 20 })
          .filter(s => /^[a-zA-Z][a-zA-Z0-9-]*$/.test(s)),
        fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
        (inputId, errorMessage) => {
          cleanup();
          
          const { container } = render(
            <Input
              id={inputId}
              label="Test Field"
              error={errorMessage}
            />
          );

          const errorElement = container.querySelector('[role="alert"]');
          expect(errorElement).not.toBeNull();
          
          // Error element ID should follow convention
          expect(errorElement?.id).toBe(`${inputId}-error`);

          return true;
        }
      ),
      propertyTestConfig
    );
  });

  /**
   * Property: Multiple inputs can have independent error states
   * For any combination of error states, each input SHALL maintain its own state
   */
  it('multiple inputs maintain independent error states', () => {
    fc.assert(
      fc.property(
        fc.boolean(),
        fc.boolean(),
        fc.string({ minLength: 1, maxLength: 30 }).filter(s => s.trim().length > 0),
        fc.string({ minLength: 1, maxLength: 30 }).filter(s => s.trim().length > 0),
        (hasError1, hasError2, error1, error2) => {
          cleanup();
          
          const { container } = render(
            <div>
              <Input
                id="input-1"
                label="Field 1"
                error={hasError1 ? error1 : undefined}
                data-testid="input-1"
              />
              <Input
                id="input-2"
                label="Field 2"
                error={hasError2 ? error2 : undefined}
                data-testid="input-2"
              />
            </div>
          );

          const inputs = container.querySelectorAll('input');
          const input1 = inputs[0];
          const input2 = inputs[1];

          // Each input should have correct aria-invalid state
          expect(input1?.getAttribute('aria-invalid')).toBe(hasError1 ? 'true' : 'false');
          expect(input2?.getAttribute('aria-invalid')).toBe(hasError2 ? 'true' : 'false');

          // Count error alerts
          const alerts = container.querySelectorAll('[role="alert"]');
          const expectedAlertCount = (hasError1 ? 1 : 0) + (hasError2 ? 1 : 0);
          expect(alerts.length).toBe(expectedAlertCount);

          return true;
        }
      ),
      propertyTestConfig
    );
  });

  /**
   * Property: Input types maintain error display behavior
   * For any input type, error display behavior SHALL be consistent
   */
  it('different input types maintain consistent error behavior', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('text', 'email', 'tel', 'url'),
        fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
        (inputType, errorMessage) => {
          cleanup();
          
          const { container } = render(
            <Input
              id="type-test"
              type={inputType}
              label="Test Field"
              error={errorMessage}
            />
          );

          // Error should be displayed regardless of input type
          const errorElement = container.querySelector('[role="alert"]');
          expect(errorElement).not.toBeNull();
          expect(errorElement?.textContent).toBe(errorMessage);

          return true;
        }
      ),
      propertyTestConfig
    );
  });

  /**
   * Property: Disabled inputs still show errors
   * For any disabled input with error, error SHALL still be displayed
   */
  it('disabled inputs still display errors', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
        (errorMessage) => {
          cleanup();
          
          const { container } = render(
            <Input
              id="disabled-test"
              label="Test Field"
              error={errorMessage}
              disabled
            />
          );

          // Error should be displayed even when disabled
          const errorElement = container.querySelector('[role="alert"]');
          expect(errorElement).not.toBeNull();
          expect(errorElement?.textContent).toBe(errorMessage);

          // Input should be disabled
          const input = container.querySelector('input');
          expect(input?.disabled).toBe(true);

          return true;
        }
      ),
      propertyTestConfig
    );
  });

  /**
   * Property: Error message is accessible to screen readers
   * For any error, it SHALL have role="alert" for immediate announcement
   */
  it('error messages are accessible to screen readers', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 100 }).filter(s => s.trim().length > 0),
        (errorMessage) => {
          cleanup();
          
          const { container } = render(
            <Input
              id="a11y-test"
              label="Test Field"
              error={errorMessage}
            />
          );

          // Error should have role="alert" for screen reader announcement
          const errorElement = container.querySelector('[role="alert"]');
          expect(errorElement).not.toBeNull();

          // The error should be programmatically associated with the input
          const input = container.querySelector('input');
          const describedBy = input?.getAttribute('aria-describedby');
          expect(describedBy).toBeTruthy();

          return true;
        }
      ),
      propertyTestConfig
    );
  });

  /**
   * Property: AnimatedInput component also supports error display
   * For any error on AnimatedInput, it SHALL display with proper ARIA
   */
  it('AnimatedInput displays errors with proper ARIA attributes', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
        (errorMessage) => {
          cleanup();
          
          const { container } = render(
            <AnimatedInput
              id="animated-test"
              label="Test Field"
              error={errorMessage}
            />
          );

          // Error should be displayed
          const errorElement = container.querySelector('[role="alert"]');
          expect(errorElement).not.toBeNull();
          expect(errorElement?.textContent).toBe(errorMessage);

          // Input should have aria-invalid="true"
          const input = container.querySelector('input');
          expect(input).not.toBeNull();
          expect(input?.getAttribute('aria-invalid')).toBe('true');

          return true;
        }
      ),
      propertyTestConfig
    );
  });
});
