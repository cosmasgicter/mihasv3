# Design System Foundation

## Colors

### Primary Palette
```typescript
primary: {
  main: '#0EA5E9',    // Primary actions, links
  hover: '#0284C7',   // Hover states
  light: '#38BDF8',   // Backgrounds
  dark: '#0369A1',    // Text on light backgrounds
}
```

### Semantic Colors
```typescript
success: '#22C55E'  // Approvals, success states
error: '#EF4444'    // Errors, rejections, destructive actions
warning: '#F59E0B'  // Warnings, pending states
```

### Usage Guidelines
- **Primary**: CTAs, links, interactive elements
- **Success**: Approved applications, success messages
- **Error**: Rejected applications, form errors, delete buttons
- **Warning**: Pending reviews, caution messages

---

## Typography

### Font Family
- **Primary**: Inter (sans-serif)
- **Monospace**: Fira Code (application numbers, codes)

### Scale
```
text-xs:   12px / 16px  - Labels, captions
text-sm:   14px / 20px  - Body text, descriptions
text-base: 16px / 24px  - Default body
text-lg:   18px / 28px  - Subheadings
text-xl:   20px / 28px  - Section titles
text-2xl:  24px / 32px  - Page headings
text-3xl:  30px / 36px  - Hero headings
text-4xl:  36px / 40px  - Display text
```

### Weight Guidelines
- **400 (normal)**: Body text
- **500 (medium)**: Emphasized text
- **600 (semibold)**: Subheadings, buttons
- **700 (bold)**: Headings
- **800 (extrabold)**: Hero text

---

## Spacing

### System
```typescript
compact:  12px (0.75rem)  // Small cards, mobile
standard: 24px (1.5rem)   // Default cards, sections
spacious: 32px (2rem)     // Hero sections, modals
```

### Usage
- **Compact**: Mobile cards, tight layouts
- **Standard**: Desktop cards, form sections
- **Spacious**: Hero sections, large modals

---

## Border Radius

```typescript
sm:   4px   // Small elements
md:   8px   // Inputs, small cards
lg:   12px  // Cards, buttons
xl:   16px  // Large cards
2xl:  24px  // Hero sections
full: 9999px // Avatars, badges
```

---

## Shadows

```typescript
sm:  Subtle depth
md:  Standard cards
lg:  Elevated cards
xl:  Modals, dropdowns
2xl: Hero sections
```

---

## Breakpoints

```typescript
xs:  475px   // Small phones
sm:  640px   // Phones
md:  768px   // Tablets
lg:  1024px  // Laptops
xl:  1280px  // Desktops
2xl: 1536px  // Large screens
```
