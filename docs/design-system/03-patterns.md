# Design Patterns

## Navigation

### Desktop Navigation
- Logo left, navigation center, user menu right
- Sticky header with backdrop blur
- Active state: border-bottom + color change

### Mobile Navigation
- Hamburger menu
- Full-screen overlay
- Touch-optimized (min 48px targets)

---

## Forms

### Structure
```tsx
<form className="space-y-6">
  <div>
    <label className="block text-sm font-medium text-foreground mb-1">
      Field Label
    </label>
    <input className="w-full rounded-lg border border-input px-3 py-2" />
    <p className="text-xs text-gray-600 mt-1">Helper text</p>
  </div>
</form>
```

### Validation
- Inline errors below fields
- Red border on error state
- Success checkmark on valid

---

## Status Indicators

### Application Status
```tsx
submitted: 'bg-warning/10 text-warning-foreground'
under_review: 'bg-primary/10 text-primary-foreground'
approved: 'bg-success/10 text-success-foreground'
rejected: 'bg-error/10 text-error-foreground'
```

### Payment Status
```tsx
pending_review: 'bg-warning/10 text-warning-foreground'
verified: 'bg-success/10 text-success-foreground'
rejected: 'bg-error/10 text-error-foreground'
```

---

## Modals

### Structure
```tsx
<div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
  <div className="bg-card rounded-xl max-w-2xl w-full max-h-[90vh] overflow-hidden">
    <div className="p-6 border-b border-border">Header</div>
    <div className="p-6 overflow-y-auto">Content</div>
    <div className="p-6 border-t border-border">Actions</div>
  </div>
</div>
```

---

## Loading States

### Spinner
```tsx
<div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
```

### Skeleton
```tsx
<div className="h-4 bg-skeleton rounded animate-pulse" />
```

---

## Empty States

### Structure
```tsx
<div className="text-center py-12">
  <Icon className="h-12 w-12 mx-auto mb-3 text-gray-400" />
  <p className="font-medium text-foreground">No items found</p>
  <p className="text-sm text-gray-600 mt-1">Description</p>
</div>
```

---

## Notifications

### Toast Position
- Top-right on desktop
- Top-center on mobile
- Auto-dismiss after 5s

### Types
```tsx
success: 'bg-success/10 border-success/30'
error: 'bg-error/10 border-error/30'
warning: 'bg-warning/10 border-warning/30'
info: 'bg-primary/10 border-primary/30'
```
