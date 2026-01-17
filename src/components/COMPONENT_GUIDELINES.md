# Component Usage Guidelines - MIHAS Application System

**Last Updated**: 2025-01-17  
**Migration Status**: shadcn/ui Migration Complete

## 🎯 Component Strategy

All UI components now follow **shadcn/ui patterns** with **Radix UI primitives**. This migration provides:
- Consistent, accessible components across the application
- Full React Hook Form compatibility
- WCAG 2.1 AA compliance
- 44px minimum touch targets for mobile
- Proper ARIA attributes and keyboard navigation

---

## 📦 Component Reference

### Foundation Components

| Component | Path | Pattern | Notes |
|-----------|------|---------|-------|
| **Button** | `@/components/ui/Button` | shadcn/ui + Radix Slot | All variants preserved |
| **Input** | `@/components/ui/Input` | shadcn/ui | RHF register() compatible |
| **Textarea** | `@/components/ui/textarea` | shadcn/ui | RHF register() compatible |
| **Card** | `@/components/ui/card` | shadcn/ui | CardHeader, CardTitle, CardContent, CardFooter |

### Form Components (RHF Controller Pattern)

| Component | Path | Pattern | Notes |
|-----------|------|---------|-------|
| **FormSelect** | `@/components/ui/form-select` | Radix + Controller | **Use for all dropdowns in forms** |
| **FormRadioGroup** | `@/components/ui/form-radio-group` | Radix + Controller | **Use for all radio groups in forms** |
| **Select** | `@/components/ui/select` | Radix | Low-level, use FormSelect for forms |
| **RadioGroup** | `@/components/ui/radio-group` | Radix | Low-level, use FormRadioGroup for forms |

### Overlay Components

| Component | Path | Pattern | Notes |
|-----------|------|---------|-------|
| **Dialog** | `@/components/ui/Dialog` | Radix | Focus trapping, Escape close, backdrop close |
| **ModalDialog** | `@/components/ui/Dialog` | Radix wrapper | Compatibility wrapper (isOpen/onClose API) |
| **AlertDialog** | `@/components/ui/alert-dialog` | Radix | No backdrop close, requires explicit action |
| **ConfirmAlertDialog** | `@/components/ui/alert-dialog` | Radix wrapper | Compatibility wrapper for confirmations |

### Feedback Components

| Component | Path | Pattern | Notes |
|-----------|------|---------|-------|
| **Alert** | `@/components/ui/Alert` | shadcn/ui | Variants: default, info, success, warning, error, destructive |
| **Toast** | `@/components/ui/Toast` | Custom | Notification system |

---

## 🔄 Migration Breaking Changes

### 1. Native `<select>` → FormSelect

**Before (deprecated):**
```tsx
// ❌ OLD - Native select with register()
<select {...register('sex')}>
  <option value="">Select...</option>
  <option value="Male">Male</option>
  <option value="Female">Female</option>
</select>
```

**After (required):**
```tsx
// ✅ NEW - FormSelect with Controller
import { FormSelect } from '@/components/ui/form-select'

<FormSelect
  name="sex"
  control={control}
  options={[
    { value: 'Male', label: 'Male' },
    { value: 'Female', label: 'Female' },
  ]}
  label="Sex"
  placeholder="Select sex"
  error={errors.sex?.message}
  required
/>
```

### 2. Native Radio → FormRadioGroup

**Before (deprecated):**
```tsx
// ❌ OLD - Native radio inputs
<input type="radio" {...register('sex')} value="Male" /> Male
<input type="radio" {...register('sex')} value="Female" /> Female
```

**After (required):**
```tsx
// ✅ NEW - FormRadioGroup with Controller
import { FormRadioGroup } from '@/components/ui/form-radio-group'

<FormRadioGroup
  name="sex"
  control={control}
  options={[
    { value: 'Male', label: 'Male' },
    { value: 'Female', label: 'Female' },
  ]}
  label="Sex"
  error={errors.sex?.message}
  required
/>
```

### 3. Modal → Dialog/ModalDialog

**Before (deprecated):**
```tsx
// ❌ OLD - Custom Modal with framer-motion
import { Modal } from '@/components/ui/Modal'

<Modal isOpen={isOpen} onClose={onClose} title="My Modal">
  {content}
</Modal>
```

**After (required):**
```tsx
// ✅ NEW - ModalDialog (compatibility wrapper)
import { ModalDialog } from '@/components/ui/Dialog'

<ModalDialog isOpen={isOpen} onClose={onClose} title="My Modal" size="md">
  {content}
</ModalDialog>

// OR use Radix Dialog directly
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/Dialog'

<Dialog open={isOpen} onOpenChange={setIsOpen}>
  <DialogContent size="md">
    <DialogHeader>
      <DialogTitle>My Modal</DialogTitle>
    </DialogHeader>
    {content}
  </DialogContent>
</Dialog>
```

### 4. ConfirmDialog → AlertDialog/ConfirmAlertDialog

**Before (deprecated):**
```tsx
// ❌ OLD - Custom ConfirmDialog
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'

<ConfirmDialog
  isOpen={isOpen}
  onClose={onClose}
  onConfirm={handleConfirm}
  title="Delete Item"
  message="Are you sure?"
/>
```

**After (required):**
```tsx
// ✅ NEW - ConfirmAlertDialog (compatibility wrapper)
import { ConfirmAlertDialog } from '@/components/ui/alert-dialog'

<ConfirmAlertDialog
  isOpen={isOpen}
  onClose={onClose}
  onConfirm={handleConfirm}
  title="Delete Item"
  message="Are you sure?"
  variant="danger"
  confirmText="Delete"
  cancelText="Cancel"
/>
```

---

## 📋 React Hook Form Integration

### Pattern 1: register() for Input/Textarea

Use `register()` spread pattern for simple inputs:

```tsx
import { useForm } from 'react-hook-form'
import { Input } from '@/components/ui/Input'
import { Textarea } from '@/components/ui/textarea'

const { register, formState: { errors } } = useForm()

<Input
  {...register('email')}
  label="Email"
  type="email"
  error={errors.email?.message}
  required
/>

<Textarea
  {...register('message')}
  label="Message"
  error={errors.message?.message}
/>
```

### Pattern 2: Controller for Select/RadioGroup

Use `Controller` pattern (via FormSelect/FormRadioGroup) for Radix components:

```tsx
import { useForm } from 'react-hook-form'
import { FormSelect } from '@/components/ui/form-select'
import { FormRadioGroup } from '@/components/ui/form-radio-group'

const { control, formState: { errors } } = useForm()

<FormSelect
  name="program"
  control={control}
  options={programOptions}
  label="Program"
  error={errors.program?.message}
/>

<FormRadioGroup
  name="intake"
  control={control}
  options={intakeOptions}
  label="Intake"
  orientation="horizontal"
  error={errors.intake?.message}
/>
```

---

## 🎨 Component Props Reference

### Button

```tsx
interface ButtonProps {
  variant?: 'default' | 'primary' | 'secondary' | 'outline' | 'ghost' | 
            'link' | 'destructive' | 'danger' | 'success' | 'warning' | 'gradient'
  size?: 'default' | 'xs' | 'sm' | 'md' | 'lg' | 'xl' | 'icon'
  loading?: boolean  // Shows spinner, disables interactions
  asChild?: boolean  // Radix Slot pattern for composition
  disabled?: boolean
}
```

### Input

```tsx
interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string      // Label text above input
  error?: string      // Error message (shows red styling)
  helperText?: string // Helper text below input
  icon?: React.ReactNode // Icon prefix
}
```

### FormSelect

```tsx
interface FormSelectProps<T extends FieldValues> {
  name: Path<T>                    // RHF field name
  control: Control<T>              // RHF control object
  options: Array<{ value: string; label: string; disabled?: boolean }>
  label?: string
  error?: string
  placeholder?: string
  disabled?: boolean
  helperText?: string
  required?: boolean
  onValueChange?: (value: string) => void
}
```

### FormRadioGroup

```tsx
interface FormRadioGroupProps<T extends FieldValues> {
  name: Path<T>                    // RHF field name
  control: Control<T>              // RHF control object
  options: Array<{ value: string; label: string; description?: string; disabled?: boolean }>
  label?: string
  error?: string
  orientation?: 'horizontal' | 'vertical'
  disabled?: boolean
  helperText?: string
  required?: boolean
  onValueChange?: (value: string) => void
}
```

### Dialog/ModalDialog

```tsx
// ModalDialog (compatibility wrapper)
interface ModalDialogProps {
  isOpen?: boolean           // Modal API
  onClose?: () => void       // Modal API
  open?: boolean             // Radix API
  onOpenChange?: (open: boolean) => void  // Radix API
  title?: string
  description?: string
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full'
  hideCloseButton?: boolean
  children: React.ReactNode
}
```

### AlertDialog/ConfirmAlertDialog

```tsx
// ConfirmAlertDialog (compatibility wrapper)
interface ConfirmAlertDialogProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: () => void
  title: string
  message: string
  confirmText?: string       // Default: 'Confirm'
  cancelText?: string        // Default: 'Cancel'
  variant?: 'danger' | 'warning' | 'info'
  showCancel?: boolean       // Default: true
}
```

### Alert

```tsx
interface AlertProps {
  variant?: 'default' | 'info' | 'success' | 'warning' | 'error' | 'destructive'
  children: React.ReactNode
}

// Subcomponents
<Alert variant="success">
  <AlertTitle>Success</AlertTitle>
  <AlertDescription>Your changes have been saved.</AlertDescription>
</Alert>
```

---

## ♿ Accessibility Features

All migrated components include:

| Feature | Implementation |
|---------|----------------|
| **Touch Targets** | 44px minimum height/width on all interactive elements |
| **Keyboard Navigation** | Arrow keys for Select/RadioGroup, Tab for focus cycling |
| **Focus Trapping** | Dialogs trap focus within content |
| **ARIA Attributes** | aria-invalid, aria-describedby, role="alert", role="dialog" |
| **Reduced Motion** | CSS `motion-reduce:` classes respect user preferences |
| **Screen Reader** | Proper labels, descriptions, and live regions |

---

## 🚫 Deprecated Components (Do Not Use)

| Component | Replacement | Reason |
|-----------|-------------|--------|
| Native `<select>` in forms | `FormSelect` | RHF Controller required for Radix |
| Native `<input type="radio">` in forms | `FormRadioGroup` | RHF Controller required for Radix |
| `Modal` (framer-motion) | `ModalDialog` or `Dialog` | Performance, accessibility |
| `ConfirmDialog` (framer-motion) | `ConfirmAlertDialog` or `AlertDialog` | Performance, accessibility |

---

## 📚 Resources

- **shadcn/ui Docs**: https://ui.shadcn.com
- **Radix UI Docs**: https://www.radix-ui.com
- **React Hook Form**: https://react-hook-form.com
- **Zod Validation**: https://zod.dev

### Adding New shadcn Components

```bash
# Add a new component
npx shadcn@latest add <component-name>

# Example
npx shadcn@latest add popover
```

---

## ✅ Migration Checklist for New Features

When building new features, ensure:

- [ ] Use `FormSelect` instead of native `<select>` in forms
- [ ] Use `FormRadioGroup` instead of native radio inputs in forms
- [ ] Use `Dialog`/`ModalDialog` instead of custom modals
- [ ] Use `AlertDialog`/`ConfirmAlertDialog` for confirmations
- [ ] All interactive elements have 44px minimum touch targets
- [ ] Forms use Zod validation schemas
- [ ] Error states display with proper ARIA attributes
- [ ] Keyboard navigation works correctly
- [ ] Test with screen reader

---

**Remember**: All components are now shadcn/ui patterns with Radix primitives. Use the wrapper components (`FormSelect`, `FormRadioGroup`, `ModalDialog`, `ConfirmAlertDialog`) for easier migration and consistent APIs.
