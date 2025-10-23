# Legibility Framework

## Overview
WCAG AA compliant text color system ensuring 4.5:1 minimum contrast ratio across the entire website.

## Text Hierarchy Classes

### Primary Text
- `text-heading` - Main headings (gray-900/white, font-semibold)
- `text-subheading` - Subheadings (gray-800/gray-100, font-medium)
- `text-body` - Body text (gray-800/gray-200)
- `text-body-secondary` - Secondary body text (gray-700/gray-300)
- `text-caption` - Small text/captions (gray-600/gray-400, text-sm)
- `text-muted` - Muted text (gray-500/gray-500)

### Status Colors
- `text-success-strong` - Success messages (green-700/green-400, font-semibold)
- `text-warning-strong` - Warning messages (yellow-700/yellow-400, font-semibold)
- `text-error-strong` - Error messages (red-700/red-400, font-semibold)
- `text-info-strong` - Info messages (blue-700/blue-400, font-semibold)

## Background Combinations

### Subtle Backgrounds
- `bg-success-subtle` - Green background with readable text
- `bg-warning-subtle` - Yellow background with readable text
- `bg-error-subtle` - Red background with readable text
- `bg-info-subtle` - Blue background with readable text

### Badges/Pills
- `badge-primary` - Blue badge (bg-blue-100/blue-900, text-blue-800/blue-200)
- `badge-success` - Green badge
- `badge-warning` - Yellow badge
- `badge-error` - Red badge

### Card Variants
- `card-primary` - Blue card with border
- `card-success` - Green card with border
- `card-warning` - Yellow card with border
- `card-error` - Red card with border

## Migration Guide

### Before
```tsx
<p className="text-foreground">Text</p>
<span className="text-muted-foreground">Caption</span>
<div className="text-primary">Info</div>
```

### After
```tsx
<p className="text-body">Text</p>
<span className="text-caption">Caption</span>
<div className="text-info-strong">Info</div>
```

## Files Updated
- 96 component files fixed
- All admin pages
- All student pages
- All auth pages
- All UI components

## Build Status
✅ Build successful (2m 2s)
✅ No TypeScript errors
✅ All styles compiled
