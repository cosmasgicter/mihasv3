# Styling Audit - Root Cause Analysis

## Problem
Multiple CSS files creating conflicting styles and dark-looking elements.

## Root Causes Found

### 1. Multiple CSS Imports in main.tsx
```typescript
import './index.css'              // Imports themes.css
import './styles/design-tokens.css'
import './styles/animations.css'
import './styles/print.css'
```

### 2. CSS Variable Conflicts
- `themes.css` defines HSL color variables
- `design-tokens.css` defines additional CSS variables
- Both are loaded, creating potential conflicts

### 3. Tailwind @apply in themes.css
```css
@layer base {
  body {
    @apply bg-background text-foreground;
  }
}
```
This creates dependency on Tailwind processing order.

## Solution: Single Source of Truth

### Keep ONLY:
1. **Tailwind CSS** (via @tailwind directives)
2. **CSS Variables** (consolidated in one place)
3. **Minimal custom CSS** (only what Tailwind can't do)

### Remove/Consolidate:
- Merge design-tokens.css into themes.css
- Remove redundant CSS files
- Use Tailwind classes exclusively in components
