/**
 * Property 6: Card variant rendering correctness
 * Feature: website-ui-ux-fix, Property 6: Card variant rendering correctness
 *
 * For any Card variant value (elevated, outlined, flat), the rendered Card SHALL
 * include the correct combination of border, shadow, and background classes for
 * that variant, and a Card with no variant SHALL render identically to variant="outlined".
 *
 * Validates: Requirements 7.1, 7.2, 7.3, 7.4, 7.5
 */
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { cardVariants } from '@/components/ui/card';

// Expected class substrings for each variant
const VARIANT_CLASSES = {
  elevated: {
    must: ['bg-card', 'shadow-md'],
    mustNot: ['border', 'bg-muted'],
  },
  outlined: {
    must: ['border', 'border-border', 'bg-card'],
    mustNot: ['bg-muted'],
  },
  flat: {
    must: ['bg-muted'],
    mustNot: ['border', 'shadow-md'],
  },
} as const;

// Base classes present on all variants
const BASE_CLASSES = ['rounded-lg', 'text-card-foreground', 'transition-shadow'];

// Interactive classes added when interactive=true
const INTERACTIVE_CLASSES = [
  'cursor-pointer',
  'hover:shadow-md',
  'focus-visible:outline-none',
  'focus-visible:ring-2',
  'focus-visible:ring-ring',
  'focus-visible:ring-offset-2',
];

// Arbitraries
const variantArb = fc.constantFrom('elevated', 'outlined', 'flat') as fc.Arbitrary<'elevated' | 'outlined' | 'flat'>;
const interactiveArb = fc.constantFrom(true, false);

function classListContains(classString: string, token: string): boolean {
  return classString.split(/\s+/).includes(token);
}

describe('Feature: website-ui-ux-fix, Property 6: Card variant rendering correctness', () => {
  it('each variant includes the correct combination of border, shadow, and background classes', () => {
    fc.assert(
      fc.property(variantArb, (variant) => {
        const result = cardVariants({ variant, interactive: false });
        const spec = VARIANT_CLASSES[variant];

        // Must include required classes
        for (const cls of spec.must) {
          expect(
            classListContains(result, cls),
            `variant="${variant}" should include "${cls}" but got: ${result}`
          ).toBe(true);
        }

        // Must not include excluded classes
        for (const cls of spec.mustNot) {
          expect(
            classListContains(result, cls),
            `variant="${variant}" should NOT include "${cls}" but got: ${result}`
          ).toBe(false);
        }
      }),
      { numRuns: 100 }
    );
  });

  it('all variants include base classes', () => {
    fc.assert(
      fc.property(variantArb, (variant) => {
        const result = cardVariants({ variant, interactive: false });

        for (const cls of BASE_CLASSES) {
          expect(
            classListContains(result, cls),
            `variant="${variant}" should include base class "${cls}" but got: ${result}`
          ).toBe(true);
        }
      }),
      { numRuns: 100 }
    );
  });

  it('no variant (undefined) renders identically to variant="outlined"', () => {
    fc.assert(
      fc.property(interactiveArb, (interactive) => {
        const withoutVariant = cardVariants({ variant: undefined, interactive });
        const withOutlined = cardVariants({ variant: 'outlined', interactive });

        expect(
          withoutVariant,
          `undefined variant should match outlined. Got "${withoutVariant}" vs "${withOutlined}"`
        ).toBe(withOutlined);
      }),
      { numRuns: 100 }
    );
  });

  it('interactive=true adds interactive classes for any variant', () => {
    fc.assert(
      fc.property(variantArb, (variant) => {
        const result = cardVariants({ variant, interactive: true });

        for (const cls of INTERACTIVE_CLASSES) {
          expect(
            classListContains(result, cls),
            `variant="${variant}" with interactive=true should include "${cls}" but got: ${result}`
          ).toBe(true);
        }
      }),
      { numRuns: 100 }
    );
  });

  it('interactive=false does not add interactive classes for any variant', () => {
    fc.assert(
      fc.property(variantArb, (variant) => {
        const result = cardVariants({ variant, interactive: false });

        for (const cls of INTERACTIVE_CLASSES) {
          expect(
            classListContains(result, cls),
            `variant="${variant}" with interactive=false should NOT include "${cls}" but got: ${result}`
          ).toBe(false);
        }
      }),
      { numRuns: 100 }
    );
  });
});
