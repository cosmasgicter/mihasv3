# Phase 3 Migration Guide: Card, Badge, Input

## Card Component

### Migration Pattern

**Before:**
```tsx
<Card gradient={true} hover>
  <CardHeader>
    <CardTitle>Title</CardTitle>
  </CardHeader>
</Card>
```

**After:**
```tsx
<Card variant="gradient" hover>
  <CardHeader>
    <CardTitle>Title</CardTitle>
  </CardHeader>
</Card>
```

### Available Variants

| Variant | Use Case | Visual |
|---------|----------|--------|
| `default` | Standard card | White bg, border, shadow |
| `elevated` | Emphasized card | Larger shadow, hover lift |
| `gradient` | Hero/feature card | Gradient background |
| `interactive` | Clickable card | Hover effects, cursor pointer |

### Props

```tsx
interface CardProps {
  variant?: 'default' | 'elevated' | 'gradient' | 'interactive'
  hover?: boolean  // Adds hover animation
  className?: string
}
```

## Badge Component

### No Migration Needed

Badge component already uses design system variants. Just ensure you're using the correct variant names:

```tsx
<Badge variant="success">Active</Badge>
<Badge variant="error">Failed</Badge>
<Badge variant="warning">Pending</Badge>
<Badge variant="neutral">Draft</Badge>
```

### Available Variants

| Variant | Color | Use Case |
|---------|-------|----------|
| `default` | Primary blue | Default state |
| `success` | Green | Success, active, approved |
| `error` | Red | Error, rejected, failed |
| `warning` | Yellow | Warning, pending |
| `neutral` | Gray | Neutral, draft, inactive |

## Input Component

### No Migration Needed

Input component already uses clean implementation. Variant support added for future use:

```tsx
<Input
  label="Email"
  type="email"
  placeholder="Enter email"
  error={errors.email}
  helperText="We'll never share your email"
/>
```

### Available Variants

| Variant | Use Case |
|---------|----------|
| `default` | Standard input |
| `error` | Error state (auto-applied when error prop present) |
| `success` | Success state |

### Props

```tsx
interface InputProps {
  variant?: 'default' | 'error' | 'success'
  label?: string
  error?: string
  helperText?: string
  icon?: React.ReactNode
}
```

## Common Patterns

### Card with Badge

```tsx
<Card variant="elevated" hover>
  <CardHeader>
    <div className="flex items-center justify-between">
      <CardTitle>Application</CardTitle>
      <Badge variant="success">Approved</Badge>
    </div>
  </CardHeader>
  <CardContent>
    <Input label="Name" placeholder="Enter name" />
  </CardContent>
</Card>
```

### Interactive Card Grid

```tsx
<div className="grid grid-cols-1 md:grid-cols-3 gap-6">
  <Card variant="interactive" hover>
    <CardHeader>
      <CardTitle>Option 1</CardTitle>
    </CardHeader>
  </Card>
  <Card variant="interactive" hover>
    <CardHeader>
      <CardTitle>Option 2</CardTitle>
    </CardHeader>
  </Card>
</div>
```

### Form with Validation

```tsx
<Card>
  <CardHeader>
    <CardTitle>Sign Up</CardTitle>
  </CardHeader>
  <CardContent className="space-y-4">
    <Input
      label="Email"
      type="email"
      error={errors.email}
    />
    <Input
      label="Password"
      type="password"
      helperText="Min 8 characters"
    />
  </CardContent>
  <CardFooter>
    <Button variant="primary" size="lg">
      Submit
    </Button>
  </CardFooter>
</Card>
```

## Automated Migration

Run the migration script:

```bash
# Migrate Card gradient prop
find src -type f \( -name "*.tsx" -o -name "*.ts" \) -exec sed -i 's/gradient={true}/variant="gradient"/g' {} +
```

## Verification

```bash
# Check for old patterns
grep -r "gradient={" src/

# Should return no results after migration
```

## Benefits

1. **Consistency**: All components use same variant pattern
2. **Type Safety**: TypeScript enforces valid variants
3. **Maintainability**: Single source of truth for styles
4. **Flexibility**: Easy to add new variants
5. **Performance**: No runtime style calculations

## Next Steps

After Phase 3, proceed to:
- Phase 4: Layout components (Container, Grid, Section)
- Phase 5: Form components (Select, Checkbox, Radio)
- Phase 6: Documentation (Storybook, examples)
