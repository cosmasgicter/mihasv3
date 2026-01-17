# Design Document: shadcn/ui Component Migration

## Overview

This design document outlines the technical architecture and implementation approach for systematically migrating the MIHAS Application System frontend components to shadcn/ui patterns with Radix UI primitives. The migration preserves all existing functionality, React Hook Form compatibility, form validation, accessibility, and Supabase data integrity.

The core philosophy is "incremental and defensive" - migrate one component family at a time, verify at each step, and roll back immediately if any regression is detected.

## Architecture

### High-Level Migration Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    Current State                                 │
├─────────────────────────────────────────────────────────────────┤
│  Custom Components    │  Native Elements    │  Mixed Patterns   │
│  - Button (motion)    │  - <select>         │  - Modal (custom) │
│  - Input (custom)     │  - <input radio>    │  - Dialog (Radix) │
│  - Card (custom)      │                     │  - Alert (custom) │
└─────────────────────────────────────────────────────────────────┘
                              ↓
                    Migration Process
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                    Target State                                  │
├─────────────────────────────────────────────────────────────────┤
│              shadcn/ui + Radix UI Primitives                    │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐ │
│  │   Button    │  │   Input     │  │      Select             │ │
│  │  (shadcn)   │  │  (shadcn)   │  │  (Radix + Controller)   │ │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘ │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐ │
│  │  Textarea   │  │    Card     │  │     RadioGroup          │ │
│  │  (shadcn)   │  │  (shadcn)   │  │  (Radix + Controller)   │ │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘ │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐ │
│  │   Dialog    │  │    Alert    │  │     AlertDialog         │ │
│  │   (Radix)   │  │  (shadcn)   │  │       (Radix)           │ │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

### Migration Order (Strict)

```
Phase 1: Foundation Components (Low Risk)
├── 1. Button → shadcn Button
├── 2. Input → shadcn Input  
├── 3. Textarea → shadcn Textarea
└── 4. Card → shadcn Card

Phase 2: Form Controls (High Risk)
├── 5. Native <select> → Radix Select + Controller
└── 6. Native <input radio> → Radix RadioGroup + Controller

Phase 3: Overlays & Feedback
├── 7. Modal → shadcn Dialog
├── 8. Alert → shadcn Alert
└── 9. ConfirmDialog → shadcn AlertDialog
```

## Components and Interfaces

### Component Registry Structure

```
src/components/ui/
├── button.tsx          # shadcn Button (already Radix-compatible)
├── input.tsx           # shadcn Input with RHF support
├── textarea.tsx        # shadcn Textarea with RHF support
├── card.tsx            # shadcn Card (already exists)
├── select.tsx          # shadcn Select (Radix-based, exists)
├── radio-group.tsx     # shadcn RadioGroup (Radix-based, NEW)
├── dialog.tsx          # shadcn Dialog (Radix-based, exists)
├── alert.tsx           # shadcn Alert
├── alert-dialog.tsx    # shadcn AlertDialog (Radix-based, NEW)
└── index.ts            # Barrel exports
```

### Core Component Interfaces

```typescript
// Button - Enhanced shadcn Button with existing variants
interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'primary' | 'secondary' | 'outline' | 'ghost' | 
            'link' | 'destructive' | 'success' | 'warning' | 'gradient';
  size?: 'default' | 'xs' | 'sm' | 'md' | 'lg' | 'xl' | 'icon';
  loading?: boolean;
  asChild?: boolean;
}

// Input - shadcn Input with label/error support
interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
  icon?: React.ReactNode;
}

// Select with RHF Controller wrapper
interface FormSelectProps {
  name: string;
  control: Control<any>;
  options: Array<{ value: string; label: string }>;
  label?: string;
  error?: string;
  placeholder?: string;
  disabled?: boolean;
}

// RadioGroup with RHF Controller wrapper
interface FormRadioGroupProps {
  name: string;
  control: Control<any>;
  options: Array<{ value: string; label: string; description?: string }>;
  label?: string;
  error?: string;
  orientation?: 'horizontal' | 'vertical';
  disabled?: boolean;
}

// Dialog - shadcn Dialog with size variants
interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  description?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
  children: React.ReactNode;
}

// AlertDialog for confirmations
interface AlertDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel?: () => void;
  variant?: 'default' | 'destructive';
}
```

### React Hook Form Integration Patterns

```typescript
// Pattern 1: register() spread for native-like components
// Used for: Input, Textarea
<Input {...register('fieldName')} error={errors.fieldName?.message} />

// Pattern 2: Controller for Radix components
// Used for: Select, RadioGroup
<Controller
  name="fieldName"
  control={control}
  render={({ field }) => (
    <Select value={field.value} onValueChange={field.onChange}>
      <SelectTrigger>
        <SelectValue placeholder="Select..." />
      </SelectTrigger>
      <SelectContent>
        {options.map(opt => (
          <SelectItem key={opt.value} value={opt.value}>
            {opt.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )}
/>

// Pattern 3: FormSelect wrapper (recommended)
// Encapsulates Controller pattern for cleaner usage
<FormSelect
  name="sex"
  control={control}
  options={[
    { value: 'male', label: 'Male' },
    { value: 'female', label: 'Female' },
  ]}
  label="Sex"
  error={errors.sex?.message}
/>
```

## Data Models

### Migration State Tracking

```typescript
interface MigrationState {
  component: string;
  phase: 'inventory' | 'wrapper' | 'parallel' | 'replace' | 'verify' | 'complete';
  filesAffected: string[];
  rhfBindings: Array<{
    file: string;
    pattern: 'register' | 'controller' | 'uncontrolled';
    fieldName: string;
  }>;
  supabasePaths: Array<{
    file: string;
    operation: 'insert' | 'update' | 'upsert';
    table: string;
  }>;
  verified: {
    build: boolean;
    formSubmission: boolean;
    visualParity: boolean;
    accessibility: boolean;
  };
}
```

### Form Payload Verification

```typescript
// Capture payload before migration
interface PayloadSnapshot {
  formId: string;
  timestamp: Date;
  fields: Record<string, {
    name: string;
    type: string;
    value: any;
  }>;
  serialized: string; // JSON stringified for comparison
}

// Compare payloads after migration
function verifyPayloadIntegrity(
  before: PayloadSnapshot,
  after: PayloadSnapshot
): boolean {
  return before.serialized === after.serialized;
}
```

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system-essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

Based on the prework analysis, the following properties have been identified and consolidated:

### Property 1: Button Variant Rendering

*For any* valid button variant (default, primary, secondary, outline, ghost, link, destructive, success, warning, gradient) and size (xs, sm, md, lg, xl, icon), the Button component SHALL render without errors and apply the correct CSS classes.

**Validates: Requirements 1.2, 1.3**

### Property 2: Touch Target Compliance

*For any* interactive element (Button, Input, Select trigger, RadioGroup item) rendered on a mobile viewport (width < 768px), the computed bounding box SHALL have both width and height of at least 44 pixels.

**Validates: Requirements 1.6, 2.5, 5.6, 6.6**

### Property 3: Disabled/Loading State Click Prevention

*For any* Button with disabled=true OR loading=true, clicking the button SHALL NOT trigger the onClick handler.

**Validates: Requirements 1.7**

### Property 4: Reduced Motion Compliance

*For any* animated component (Button, Dialog, Alert) when the user has `prefers-reduced-motion: reduce` enabled, animations SHALL be disabled or replaced with instant state changes.

**Validates: Requirements 1.5, 12.6**

### Property 5: Input Error State Accessibility

*For any* Input or Textarea with an error prop set, the component SHALL have aria-invalid="true" AND aria-describedby pointing to the error message element.

**Validates: Requirements 2.7, 2.8, 3.5, 3.6**

### Property 6: Select Default Value Preservation

*For any* Select component with a defaultValue or value prop, when the form loads, the Select SHALL display the correct selected option matching that value.

**Validates: Requirements 5.4, 6.4**

### Property 7: Form Payload Round-Trip Integrity

*For any* form containing migrated Select or RadioGroup components, submitting the form SHALL produce a payload with identical field names and values as the pre-migration native elements.

**Validates: Requirements 5.7, 6.7, 11.1, 11.2, 11.5**

### Property 8: Select Keyboard Navigation

*For any* Select component, pressing arrow keys SHALL navigate between options, and pressing Enter or Space SHALL select the focused option.

**Validates: Requirements 5.5**

### Property 9: RadioGroup Keyboard Navigation

*For any* RadioGroup component, pressing arrow keys SHALL move focus between radio options within the group.

**Validates: Requirements 6.5**

### Property 10: Dialog Focus Trapping

*For any* open Dialog or AlertDialog, pressing Tab SHALL cycle focus only within the dialog content, never escaping to elements behind the dialog.

**Validates: Requirements 7.2, 9.2**

### Property 11: Dialog Escape Key Close

*For any* open Dialog, pressing the Escape key SHALL close the dialog.

**Validates: Requirements 7.3**

### Property 12: AlertDialog No Backdrop Close

*For any* open AlertDialog, clicking the backdrop SHALL NOT close the dialog (explicit action required).

**Validates: Requirements 9.3**

### Property 13: Dialog Body Scroll Lock

*For any* open Dialog or AlertDialog, the document body SHALL have overflow:hidden to prevent background scrolling.

**Validates: Requirements 7.7**

### Property 14: ARIA Attributes Compliance

*For any* Dialog, the element SHALL have role="dialog" and aria-modal="true". For any AlertDialog, the element SHALL have role="alertdialog".

**Validates: Requirements 7.8, 9.5**

### Property 15: RHF Controller Binding

*For any* Radix-based form component (Select, RadioGroup) wrapped with Controller, changes to the component value SHALL update the form state, and form state changes SHALL reflect in the component.

**Validates: Requirements 10.2, 10.5**

### Property 16: Zod Validation Preservation

*For any* form with Zod validation schema, validation errors SHALL be correctly displayed on migrated components when invalid data is entered.

**Validates: Requirements 10.6**

## Error Handling

### Migration Failure Conditions

```typescript
// Failure conditions that trigger immediate rollback
const FAILURE_CONDITIONS = [
  'FORM_SUBMISSION_FAILS',      // Form stops submitting
  'VALIDATION_BREAKS',          // Validation no longer works
  'DEFAULT_VALUES_LOST',        // Default values disappear
  'KEYBOARD_NAV_REGRESSES',     // Keyboard navigation broken
  'SUPABASE_OPERATION_FAILS',   // Insert/update fails
  'HYDRATION_WARNING',          // React hydration mismatch
  'CONTROLLED_UNCONTROLLED_WARNING', // React controlled/uncontrolled warning
];

// Rollback procedure
async function rollbackMigration(component: string): Promise<void> {
  // 1. Revert all file changes via git
  await exec(`git checkout -- src/components/ui/${component}.tsx`);
  
  // 2. Revert affected usage files
  const affectedFiles = await getAffectedFiles(component);
  for (const file of affectedFiles) {
    await exec(`git checkout -- ${file}`);
  }
  
  // 3. Verify build succeeds
  await exec('npm run build');
  
  // 4. Log rollback reason
  console.error(`Migration rolled back for ${component}`);
}
```

### Form Submission Error Handling

```typescript
// Verify form submission works after migration
async function verifyFormSubmission(
  formId: string,
  testData: Record<string, any>
): Promise<boolean> {
  try {
    // 1. Fill form with test data
    await fillForm(formId, testData);
    
    // 2. Submit form
    const response = await submitForm(formId);
    
    // 3. Verify Supabase received correct data
    const supabaseData = await fetchLatestRecord(formId);
    
    // 4. Compare payloads
    return comparePayloads(testData, supabaseData);
  } catch (error) {
    console.error('Form submission verification failed:', error);
    return false;
  }
}
```

## Testing Strategy

### Dual Testing Approach

This migration requires both unit tests and property-based tests:

- **Unit tests**: Verify specific component rendering, props, and interactions
- **Property tests**: Verify universal properties across all valid inputs using fast-check

### Unit Testing Strategy

```typescript
// Example unit tests for migrated components
describe('Button Migration', () => {
  it('renders all variants correctly', () => {
    const variants = ['default', 'primary', 'secondary', 'outline', 'ghost', 
                      'link', 'destructive', 'success', 'warning', 'gradient'];
    variants.forEach(variant => {
      const { container } = render(<Button variant={variant}>Test</Button>);
      expect(container.querySelector('button')).toBeInTheDocument();
    });
  });

  it('prevents click when disabled', async () => {
    const onClick = vi.fn();
    render(<Button disabled onClick={onClick}>Test</Button>);
    await userEvent.click(screen.getByRole('button'));
    expect(onClick).not.toHaveBeenCalled();
  });

  it('prevents click when loading', async () => {
    const onClick = vi.fn();
    render(<Button loading onClick={onClick}>Test</Button>);
    await userEvent.click(screen.getByRole('button'));
    expect(onClick).not.toHaveBeenCalled();
  });
});

describe('FormSelect Migration', () => {
  it('integrates with React Hook Form Controller', async () => {
    const onSubmit = vi.fn();
    render(
      <TestForm onSubmit={onSubmit}>
        <FormSelect
          name="sex"
          control={control}
          options={[
            { value: 'male', label: 'Male' },
            { value: 'female', label: 'Female' },
          ]}
        />
        <button type="submit">Submit</button>
      </TestForm>
    );
    
    // Select an option
    await userEvent.click(screen.getByRole('combobox'));
    await userEvent.click(screen.getByText('Male'));
    
    // Submit form
    await userEvent.click(screen.getByText('Submit'));
    
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ sex: 'male' })
    );
  });
});
```

### Property-Based Testing Strategy

```typescript
import fc from 'fast-check';

// Property test configuration
const propertyTestConfig = { numRuns: 100 };

describe('Property: Touch Target Compliance', () => {
  it('all interactive elements have 44x44 minimum touch targets', () => {
    fc.assert(
      fc.property(
        fc.record({
          component: fc.constantFrom('Button', 'Input', 'SelectTrigger', 'RadioGroupItem'),
          size: fc.constantFrom('xs', 'sm', 'md', 'lg', 'xl'),
        }),
        ({ component, size }) => {
          const { container } = render(
            <ComponentFactory component={component} size={size} />
          );
          const element = container.firstChild as HTMLElement;
          const rect = element.getBoundingClientRect();
          return rect.width >= 44 && rect.height >= 44;
        }
      ),
      propertyTestConfig
    );
  });
});

describe('Property: Form Payload Round-Trip', () => {
  it('migrated Select produces identical payload to native select', () => {
    fc.assert(
      fc.property(
        fc.record({
          fieldName: fc.string({ minLength: 1, maxLength: 20 }),
          value: fc.constantFrom('option1', 'option2', 'option3'),
        }),
        async ({ fieldName, value }) => {
          // Render native select form
          const nativePayload = await submitNativeSelectForm(fieldName, value);
          
          // Render migrated Select form
          const migratedPayload = await submitMigratedSelectForm(fieldName, value);
          
          // Payloads should be identical
          return JSON.stringify(nativePayload) === JSON.stringify(migratedPayload);
        }
      ),
      propertyTestConfig
    );
  });
});

describe('Property: Dialog Focus Trapping', () => {
  it('Tab key cycles focus within dialog only', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 10 }), // Number of Tab presses
        async (tabCount) => {
          render(
            <Dialog open={true} onOpenChange={() => {}}>
              <DialogContent>
                <input data-testid="input1" />
                <input data-testid="input2" />
                <button data-testid="button1">OK</button>
              </DialogContent>
            </Dialog>
          );
          
          // Press Tab multiple times
          for (let i = 0; i < tabCount; i++) {
            await userEvent.tab();
          }
          
          // Focus should still be within dialog
          const activeElement = document.activeElement;
          const dialog = screen.getByRole('dialog');
          return dialog.contains(activeElement);
        }
      ),
      propertyTestConfig
    );
  });
});
```

### Integration Testing

```typescript
// Verify Supabase integration after migration
describe('Supabase Integration', () => {
  it('Application Wizard form submission works after Select migration', async () => {
    // 1. Navigate to wizard
    await page.goto('/apply');
    
    // 2. Fill form with migrated Select components
    await page.click('[data-testid="sex-select"]');
    await page.click('[data-testid="sex-option-male"]');
    
    await page.click('[data-testid="program-select"]');
    await page.click('[data-testid="program-option-nursing"]');
    
    // 3. Submit form
    await page.click('[data-testid="submit-button"]');
    
    // 4. Verify data in Supabase
    const { data } = await supabase
      .from('applications')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();
    
    expect(data.sex).toBe('male');
    expect(data.program).toBe('nursing');
  });
});
```

### Test File Organization

```
tests/
├── unit/
│   ├── components/
│   │   ├── button.test.tsx
│   │   ├── input.test.tsx
│   │   ├── textarea.test.tsx
│   │   ├── select.test.tsx
│   │   ├── radio-group.test.tsx
│   │   ├── dialog.test.tsx
│   │   ├── alert.test.tsx
│   │   └── alert-dialog.test.tsx
│   └── integration/
│       ├── form-select.test.tsx
│       └── form-radio-group.test.tsx
├── property/
│   ├── touch-target.property.test.tsx
│   ├── form-payload.property.test.tsx
│   ├── keyboard-navigation.property.test.tsx
│   ├── focus-trapping.property.test.tsx
│   └── accessibility.property.test.tsx
└── e2e/
    ├── application-wizard.spec.ts
    ├── admin-forms.spec.ts
    └── auth-forms.spec.ts
```
