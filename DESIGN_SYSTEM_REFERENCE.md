# MIHAS V3 - Design System Reference

**Quick reference for maintaining design consistency**

---

## 🎨 Color System

### Background Gradients
```tsx
// Light mode
className="bg-gradient-to-br from-gray-50 via-blue-50 to-purple-50"

// Dark mode
className="dark:from-gray-900 dark:via-blue-950 dark:to-purple-950"

// Combined
className="bg-gradient-to-br from-gray-50 via-blue-50 to-purple-50 dark:from-gray-900 dark:via-blue-950 dark:to-purple-950 transition-colors duration-500"
```

### Header Gradients
```tsx
// Primary gradient
className="bg-gradient-to-r from-blue-600 via-purple-600 to-blue-800"

// With dark mode
className="bg-gradient-to-r from-blue-600 to-purple-600 dark:from-blue-500 dark:to-purple-500"
```

### Surface Colors
```tsx
// Cards, modals
className="bg-white dark:bg-gray-800"

// Borders
className="border-gray-200 dark:border-gray-700"
```

### Text Colors
```tsx
// Primary text
className="text-gray-900 dark:text-gray-100"

// Secondary text
className="text-gray-600 dark:text-gray-400"

// Muted text
className="text-gray-500 dark:text-gray-500"
```

---

## 🧩 Components

### Button
```tsx
// Primary (gradient)
<Button variant="primary">Submit</Button>

// Secondary
<Button variant="secondary">Cancel</Button>

// Outline
<Button variant="outline">Learn More</Button>

// Ghost
<Button variant="ghost">Skip</Button>

// Danger
<Button variant="danger">Delete</Button>

// Sizes
<Button size="sm">Small</Button>
<Button size="md">Medium</Button>
<Button size="lg">Large</Button>

// Loading
<Button loading={true}>Processing...</Button>
```

### Card
```tsx
// Basic
<Card>Content</Card>

// With hover effect
<Card hover>Content</Card>

// With gradient
<Card gradient>Content</Card>

// Combined
<Card hover gradient>Content</Card>

// Structure
<Card>
  <CardHeader>
    <CardTitle>Title</CardTitle>
    <CardDescription>Description</CardDescription>
  </CardHeader>
  <CardContent>Content</CardContent>
  <CardFooter>Footer</CardFooter>
</Card>
```

### Badge
```tsx
<Badge variant="default">Default</Badge>
<Badge variant="success">Success</Badge>
<Badge variant="warning">Warning</Badge>
<Badge variant="danger">Danger</Badge>
<Badge variant="info">Info</Badge>
<Badge variant="gradient">Gradient</Badge>

// Sizes
<Badge size="sm">Small</Badge>
<Badge size="md">Medium</Badge>
<Badge size="lg">Large</Badge>

// Animated
<Badge animate>New</Badge>
```

### Modal
```tsx
<Modal
  isOpen={isOpen}
  onClose={() => setIsOpen(false)}
  title="Modal Title"
  description="Optional description"
  size="md" // sm, md, lg, xl, full
>
  Content
</Modal>
```

### Input
```tsx
<Input
  label="Email"
  type="email"
  placeholder="Enter email"
  error={errors.email}
  icon={<Mail className="w-4 h-4" />}
/>
```

### Loading
```tsx
// Spinner
<Loading size="md" text="Loading..." />

// Full screen
<Loading size="lg" text="Please wait..." fullScreen />

// Skeleton
<LoadingSkeleton className="h-20 w-full" />
```

### StatusIcon
```tsx
<StatusIcon status="approved" size="lg" animated />
<StatusIcon status="rejected" size="md" />
<StatusIcon status="under_review" size="sm" />
<StatusIcon status="submitted" size="xl" />
<StatusIcon status="pending" size="md" />
<StatusIcon status="warning" size="lg" />
```

---

## 📐 Layout

### Page Container
```tsx
<div className="page-container bg-gradient-to-br from-gray-50 via-blue-50 to-purple-50 dark:from-gray-900 dark:via-blue-950 dark:to-purple-950 transition-colors duration-500">
  {/* Content */}
</div>
```

### Content Wrapper
```tsx
<div className="content-wrapper py-4 sm:py-6 lg:py-8 safe-area-bottom">
  {/* Content */}
</div>
```

### Grid Layouts
```tsx
// Responsive grid
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
  {/* Items */}
</div>

// Dashboard layout
<div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-8">
  <div className="lg:col-span-2">{/* Main content */}</div>
  <div>{/* Sidebar */}</div>
</div>
```

---

## 🎭 Welcome Messages

### Format
```tsx
// Student Dashboard
<h1>Welcome back, {firstName}</h1>

// Admin Dashboard
<h1>Welcome back, {firstName}</h1>

// Get first name
const firstName = profile?.full_name?.split(' ')[0] || 'User'
```

### ❌ Don't Use
```tsx
// Wrong - shows username
<h1>Welcome back, {user?.email?.split('@')[0]}</h1>

// Wrong - has emoji
<h1>👋 Welcome back, {name}</h1>

// Wrong - full name
<h1>Welcome back, {profile?.full_name}</h1>
```

---

## 🔗 Navigation

### Routes Pattern
```tsx
// Student routes
/student/dashboard
/student/application-wizard
/student/status
/student/profile
/student/settings
/student/notifications

// Admin routes
/admin/dashboard
/admin/applications
/admin/programs
/admin/users
/admin/profile
/admin/settings
```

### Link Component
```tsx
import { Link } from 'react-router-dom'

<Link to="/student/dashboard">
  <Button>Go to Dashboard</Button>
</Link>
```

---

## 🌙 Dark Mode

### Theme Toggle
```tsx
import { useTheme } from 'next-themes'

const { theme, setTheme } = useTheme()

<button onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
  Toggle Theme
</button>
```

### Dark Mode Classes
```tsx
// Always include dark mode variant
className="bg-white dark:bg-gray-800"
className="text-gray-900 dark:text-gray-100"
className="border-gray-200 dark:border-gray-700"

// Transitions
className="transition-colors duration-500"
```

---

## 📱 Responsive Design

### Breakpoints
```tsx
// Mobile first
className="text-sm md:text-base lg:text-lg"
className="p-4 md:p-6 lg:p-8"
className="grid-cols-1 md:grid-cols-2 lg:grid-cols-3"

// Hide on mobile
className="hidden md:block"

// Show only on mobile
className="md:hidden"
```

### Touch Targets
```tsx
// Minimum 44x44px
className="min-h-[44px] min-w-[44px]"

// Buttons
<Button size="md"> // Already 44px height
```

---

## ✨ Animations

### Framer Motion
```tsx
import { motion } from 'framer-motion'

// Fade in
<motion.div
  initial={{ opacity: 0 }}
  animate={{ opacity: 1 }}
  transition={{ duration: 0.3 }}
>
  Content
</motion.div>

// Slide up
<motion.div
  initial={{ opacity: 0, y: 20 }}
  animate={{ opacity: 1, y: 0 }}
  transition={{ duration: 0.3 }}
>
  Content
</motion.div>

// Hover effect
<motion.div
  whileHover={{ y: -4, scale: 1.02 }}
  transition={{ duration: 0.2 }}
>
  Content
</motion.div>
```

### Transitions
```tsx
// Color transitions
className="transition-colors duration-500"

// All properties
className="transition-all duration-200"

// Transform
className="transition-transform duration-300"
```

---

## 🚫 Don't Use

### Deprecated Props
```tsx
// ❌ Don't use
<Button magnetic glow>

// ✅ Use instead
<Button>
```

### Old Colors
```tsx
// ❌ Don't use
className="from-primary via-secondary to-accent"

// ✅ Use instead
className="from-blue-600 via-purple-600 to-blue-800"
```

### Emojis in UI
```tsx
// ❌ Don't use
<h1>🎓 Welcome</h1>

// ✅ Use instead
<h1 className="flex items-center gap-2">
  <GraduationCap className="w-6 h-6" />
  Welcome
</h1>
```

---

## ✅ Best Practices

1. **Always include dark mode** - Add `dark:` variants
2. **Use semantic colors** - green for success, red for danger
3. **Mobile first** - Start with mobile, add `md:` and `lg:`
4. **Consistent spacing** - Use `gap-4`, `gap-6`, `gap-8`
5. **Smooth transitions** - Add `transition-colors duration-500`
6. **Touch targets** - Minimum 44x44px for interactive elements
7. **Icons over emojis** - Use lucide-react icons
8. **First names only** - In welcome messages
9. **Proper routes** - Always check route exists in config

---

**Last Updated**: 2025-01-23  
**Version**: Redesign Complete
