# MIHAS Design System

## 🎨 Design Language Overview

This document defines the unified design language for the entire MIHAS application system.

## Color Palette

### Primary Colors
- **Primary Blue**: `hsl(199, 89%, 48%)` - Main brand color
- **Secondary Purple**: `hsl(210, 40%, 96.1%)` - Accent color
- **Success Green**: `hsl(142, 76%, 36%)` - Success states
- **Warning Orange**: `hsl(38, 92%, 50%)` - Warning states
- **Error Red**: `hsl(0, 84.2%, 60.2%)` - Error states

### Neutral Colors
- **Background**: `hsl(0, 0%, 100%)` - White
- **Foreground**: `hsl(0, 0%, 15%)` - Dark gray (15% lightness)
- **Muted**: `hsl(210, 40%, 96.1%)` - Light gray background
- **Border**: `hsl(214.3, 31.8%, 91.4%)` - Border color

### Text Colors (Specific Grays)
- **Primary Text**: `text-gray-900` - 10% lightness
- **Secondary Text**: `text-gray-700` - 30% lightness
- **Tertiary Text**: `text-gray-600` - 40% lightness

## Header Gradients (Standardized)

### Admin Pages
All admin page headers use: `bg-gradient-to-r from-blue-600 via-purple-600 to-blue-800`

### Specific Page Headers
- **Dashboard**: Blue-Purple gradient (standard)
- **Analytics**: Green-Teal `from-green-500 to-teal-600`
- **Users**: Purple-Indigo `from-purple-500 to-indigo-600`
- **Programs**: Blue-Purple (standard)
- **Intakes**: Purple-Blue `from-secondary to-primary`

## Skeleton Loading States

### Unified Skeleton Colors
- **Primary Skeleton**: `bg-gray-200` (consistent across all components)
- **Secondary Skeleton**: `bg-gray-300` (for emphasis)
- **Animation**: `animate-pulse` (standard)

### Skeleton Patterns
```tsx
// Primary content
<div className="h-6 bg-gray-200 rounded animate-pulse" />

// Secondary content
<div className="h-4 bg-gray-300 rounded animate-pulse" />

// Large blocks
<div className="h-48 bg-gray-200 rounded animate-pulse" />
```

## Status Colors

### Status Badges
All status badges use consistent color scheme:
- **Approved**: `bg-green-200 text-green-900`
- **Rejected**: `bg-red-200 text-red-900`
- **Pending**: `bg-yellow-200 text-yellow-900`
- **Under Review**: `bg-blue-200 text-blue-900`
- **In Progress**: `bg-blue-200 text-blue-900`

## Card Styles

### Standard Card
```tsx
<div className="bg-card rounded-2xl shadow-lg border border-border p-6">
  {/* Content */}
</div>
```

### Hover Card
```tsx
<div className="bg-card rounded-2xl shadow-lg border border-border p-6 hover:shadow-xl transition-all duration-300">
  {/* Content */}
</div>
```

## Typography

### Headings
- **H1**: `text-2xl sm:text-3xl font-bold text-gray-900`
- **H2**: `text-xl sm:text-2xl font-bold text-gray-900`
- **H3**: `text-lg font-bold text-gray-900`

### Body Text
- **Primary**: `text-base text-gray-900`
- **Secondary**: `text-sm text-gray-700`
- **Tertiary**: `text-xs text-gray-600`

## Spacing

### Container Padding
- **Mobile**: `px-4 py-4`
- **Tablet**: `sm:px-6 sm:py-6`
- **Desktop**: `lg:px-8 lg:py-8`

### Card Spacing
- **Standard**: `p-6`
- **Compact**: `p-4`
- **Spacious**: `p-8`

## Border Radius

### Standard Sizes
- **Small**: `rounded-lg` (0.5rem)
- **Medium**: `rounded-xl` (0.75rem)
- **Large**: `rounded-2xl` (1rem)
- **Extra Large**: `rounded-3xl` (1.5rem)

## Shadows

### Standard Shadows
- **Soft**: `shadow-lg`
- **Medium**: `shadow-xl`
- **Hard**: `shadow-2xl`

## Buttons

### Primary Button
```tsx
<Button className="bg-primary hover:bg-primary text-white">
  Action
</Button>
```

### Secondary Button
```tsx
<Button variant="outline" className="border-border text-gray-900">
  Action
</Button>
```

## Implementation Rules

1. **Always use gray-X colors for text** instead of CSS variables
2. **Standardize all skeleton loaders** to use gray-200/gray-300
3. **Use consistent header gradients** across similar pages
4. **Apply uniform card styles** throughout the application
5. **Maintain consistent spacing** using the defined scale
