# Component Guidelines

## Buttons

### Variants

#### Primary
```tsx
<Button className="bg-primary hover:bg-primary/90 text-white font-semibold">
  Submit Application
</Button>
```
**Use for**: Main CTAs, form submissions, primary actions

#### Success
```tsx
<Button className="bg-success hover:bg-success/90 text-white font-semibold">
  Approve
</Button>
```
**Use for**: Approval actions, success confirmations

#### Error
```tsx
<Button className="bg-error hover:bg-error/90 text-white font-semibold">
  Reject
</Button>
```
**Use for**: Destructive actions, rejections, deletions

#### Outline
```tsx
<Button className="border-2 border-primary text-primary hover:bg-primary/5">
  Learn More
</Button>
```
**Use for**: Secondary actions, cancel buttons

#### Ghost
```tsx
<Button className="hover:bg-primary/5 text-primary">
  View Details
</Button>
```
**Use for**: Tertiary actions, icon buttons

#### Gradient
```tsx
<Button className="bg-gradient-to-r from-blue-600 to-purple-600 text-white">
  Start Application
</Button>
```
**Use for**: Hero CTAs, premium actions

### Sizes
```tsx
sm: 'px-3 py-1.5 text-sm'   // Compact spaces
md: 'px-4 py-2 text-base'   // Default
lg: 'px-6 py-3 text-lg'     // Emphasis
xl: 'px-8 py-4 text-xl'     // Hero sections
```

---

## Cards

### Default
```tsx
<div className="bg-card border border-border rounded-xl p-6">
  Content
</div>
```
**Use for**: Standard content containers

### Elevated
```tsx
<div className="bg-card shadow-lg rounded-xl p-6">
  Content
</div>
```
**Use for**: Important content, modals

### Gradient
```tsx
<div className="bg-gradient-to-br from-blue-50 to-purple-50 rounded-xl p-6 border border-primary/30">
  Content
</div>
```
**Use for**: Featured content, highlights

---

## Badges

### Success
```tsx
<span className="bg-success/10 text-success-foreground border border-success/30 px-2 py-1 rounded-full text-xs font-semibold">
  Approved
</span>
```

### Error
```tsx
<span className="bg-error/10 text-error-foreground border border-error/30 px-2 py-1 rounded-full text-xs font-semibold">
  Rejected
</span>
```

### Warning
```tsx
<span className="bg-warning/10 text-warning-foreground border border-warning/30 px-2 py-1 rounded-full text-xs font-semibold">
  Pending
</span>
```

---

## Inputs

### Default
```tsx
<input className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:border-primary focus:ring-2 focus:ring-blue-200" />
```

### Error State
```tsx
<input className="w-full rounded-lg border-2 border-error bg-background px-3 py-2 text-sm focus:border-error focus:ring-2 focus:ring-red-200" />
```

---

## Layout Patterns

### Page Container
```tsx
<div className="min-h-screen bg-background">
  <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
    Content
  </div>
</div>
```

### Section
```tsx
<section className="py-12 sm:py-16 lg:py-20">
  Content
</section>
```

### Grid Layouts
```tsx
// 1-4 columns responsive
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
  Cards
</div>
```
