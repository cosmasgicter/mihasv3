# Design System Migration Guide

## Phase 2: Component Migration

### Button Migration

#### Before (Inline Styles)
```tsx
<button className="bg-primary hover:bg-primary/90 text-white font-semibold px-6 py-3 text-lg">
  Submit
</button>
```

#### After (Design System)
```tsx
<Button variant="primary" size="lg">
  Submit
</Button>
```

### Variant Mapping

| Old Style | New Variant |
|-----------|-------------|
| `bg-primary hover:bg-primary/90 text-white` | `variant="primary"` |
| `bg-success hover:bg-success/90 text-white` | `variant="success"` |
| `bg-error hover:bg-error/90 text-white` | `variant="destructive"` |
| `border-2 border-primary text-primary` | `variant="outline"` |
| `hover:bg-primary/5 text-primary` | `variant="ghost"` |
| `bg-gradient-to-r from-blue-600 to-purple-600` | `variant="gradient"` |

### Size Mapping

| Old Style | New Size |
|-----------|----------|
| `px-3 py-1.5 text-sm` | `size="sm"` |
| `px-4 py-2 text-base` | `size="md"` |
| `px-6 py-3 text-lg` | `size="lg"` |
| `px-8 py-4 text-xl` | `size="xl"` |

### Migration Steps

1. **Find inline styles**
```bash
grep -r "className.*bg-primary" src --include="*.tsx"
```

2. **Replace with variants**
```tsx
// Before
<button className="bg-primary hover:bg-primary/90 text-white px-6 py-3">

// After
<Button variant="primary" size="lg">
```

3. **Test functionality**
- Verify hover states
- Check disabled states
- Test loading states
- Validate accessibility

### Automated Migration

Run the migration script:
```bash
npm run migrate:buttons
```

### Manual Review Required

Some buttons need manual review:
- Buttons with custom icons
- Buttons with complex layouts
- Buttons with conditional styling
- Buttons in third-party components

### Checklist

- [ ] Update Button imports
- [ ] Replace inline styles with variants
- [ ] Update size props
- [ ] Test all button states
- [ ] Verify accessibility
- [ ] Update tests
- [ ] Document custom cases

### Common Issues

**Issue**: Button too small on mobile
**Fix**: Use responsive sizes `size={{ base: 'md', lg: 'lg' }}`

**Issue**: Custom colors needed
**Fix**: Extend variants in `variants.ts`

**Issue**: Loading state not working
**Fix**: Use `loading` prop instead of custom spinner

### Next Components

1. ✅ Button (Complete)
2. 🔄 Card (In Progress)
3. 📋 Badge (Planned)
4. 📋 Input (Planned)
5. 📋 Modal (Planned)
