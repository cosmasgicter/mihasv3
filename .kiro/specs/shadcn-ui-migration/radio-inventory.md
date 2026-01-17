# Native Radio Element Inventory

## Summary

This document inventories all native `<input type="radio">` elements and Radio component usages that need migration to the shadcn/ui RadioGroup with RHF Controller pattern.

## Investigation Results

### Radio Component Definition
- **File**: `src/components/ui/Radio.tsx`
- **Components**: `Radio` and `RadioGroup`
- **Status**: Component exists but is NOT used in any forms

### Actual Usages Found

#### 1. Property Tests Only
- **File**: `tests/property/touch-target-compliance.property.test.tsx`
- **Usage**: Testing touch target compliance for Radio component
- **RHF Binding**: None (test only)
- **Supabase Path**: None
- **Status**: Test file only, not production usage

#### 2. DropdownMenu RadioGroup (Different Use Case)
- **File**: `src/components/ui/dropdown-menu.tsx`
- **Usage**: `DropdownMenuRadioGroup` and `DropdownMenuRadioItem` from Radix
- **Purpose**: Dropdown menu radio selection (not form radio buttons)
- **Status**: Already using Radix primitives, not a form control

### Form Fields That Could Use Radio Buttons (But Use Select Instead)

The following fields use Select components instead of Radio buttons:

1. **Sex Field** (Male/Female)
   - `src/pages/auth/SignUpPage.tsx` - Uses FormSelect
   - `src/components/application/wizard/StepOne.tsx` - Uses FormSelect
   - `src/pages/student/applicationWizard/steps/BasicKycStep.tsx` - Uses FormSelect
   - `src/pages/student/Settings.tsx` - Uses native select (needs migration to FormSelect)

2. **Program Selection**
   - Uses FormSelect (3+ options, appropriate for Select)

3. **Intake Selection**
   - Uses FormSelect (4+ options, appropriate for Select)

## Conclusion

**No native radio elements or Radio component usages exist in production forms.**

The Radio component (`src/components/ui/Radio.tsx`) was created but never integrated into any forms. All binary choices (like sex: Male/Female) use Select components instead.

## Migration Decision

Since there are no actual Radio usages in forms:

1. **Create FormRadioGroup wrapper** - ✅ COMPLETED (`src/components/ui/form-radio-group.tsx`)
2. **Create base RadioGroup component** - ✅ COMPLETED (`src/components/ui/radio-group.tsx`)
3. **No migration needed** - No existing usages to migrate
4. **Property tests** - Write tests for the new FormRadioGroup component

## Radix RadioGroup Package

The `@radix-ui/react-radio-group` package has been installed:

```bash
npm install @radix-ui/react-radio-group
```

## Created Components

### 1. RadioGroup (`src/components/ui/radio-group.tsx`)
- Base shadcn/ui pattern component using Radix primitives
- Exports: `RadioGroup`, `RadioGroupItem`
- Touch-optimized with 44px minimum touch targets
- Supports keyboard navigation via Radix

### 2. FormRadioGroup (`src/components/ui/form-radio-group.tsx`)
- RHF Controller wrapper for form integration
- Props: name, control, options, label, error, orientation, disabled, helperText, required
- Supports horizontal and vertical orientations
- Full accessibility support with ARIA attributes

## Notes

- The existing Radio component (`src/components/ui/Radio.tsx`) uses native `<input type="radio">` elements
- The new FormRadioGroup uses Radix RadioGroup primitives
- This follows the same pattern as FormSelect (Radix + RHF Controller)
- The component is available for future form implementations
- No breaking changes - existing Radio component remains for backward compatibility
