# Component Usage Guidelines - MIHAS Application System

**Last Updated**: 2025-01-23

## 🎯 Component Strategy

We use a **hybrid approach** combining custom Radix components with Shadcn/ui components.

## ✅ Existing Components (Keep Using)

### Custom Radix Components
These are battle-tested, working perfectly. **DO NOT REPLACE**.

| Component | Path | Usage |
|-----------|------|-------|
| **Dialog** | `@/components/ui/Dialog` | All modals, popups |
| **Navigation** | `@/components/ui/AuthenticatedNavigation` | Main navigation |
| **Navigation** | `@/components/ui/AdminNavigation` | Admin navigation |

**Example**:
```tsx
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/Dialog'

<Dialog>
  <DialogContent>
    <DialogTitle>My Modal</DialogTitle>
    {/* Content */}
  </DialogContent>
</Dialog>
```

## 🆕 Shadcn Components (Use for New Features)

### Form Components
| Component | Path | Usage |
|-----------|------|-------|
| **Label** | `@/components/ui/label` | Form labels |
| **Input** | `@/components/ui/input` | Text inputs |
| **Textarea** | `@/components/ui/textarea` | Multi-line text |
| **Select** | `@/components/ui/select` | Dropdowns |
| **Checkbox** | `@/components/ui/checkbox` | Checkboxes |
| **Switch** | `@/components/ui/switch` | Toggle switches |

**Example**:
```tsx
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'

<div>
  <Label htmlFor="email">Email</Label>
  <Input id="email" type="email" placeholder="Enter email" />
</div>
```

### Feedback Components
| Component | Path | Usage |
|-----------|------|-------|
| **Alert** | `@/components/ui/alert` | Alerts, warnings |
| **Toast** | `@/components/ui/toast` | Notifications |
| **Progress** | `@/components/ui/progress` | Progress bars |

**Example**:
```tsx
import { Alert, AlertDescription } from '@/components/ui/alert'

<Alert>
  <AlertDescription>
    Your application has been submitted successfully!
  </AlertDescription>
</Alert>
```

### Layout Components
| Component | Path | Usage |
|-----------|------|-------|
| **Separator** | `@/components/ui/separator` | Dividers |
| **Tabs** | `@/components/ui/tabs` | Tab navigation |
| **Accordion** | `@/components/ui/accordion` | Collapsible sections |
| **Card** | `@/components/ui/card` | Content cards |

**Example**:
```tsx
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'

<Card>
  <CardHeader>
    <CardTitle>Application Status</CardTitle>
  </CardHeader>
  <CardContent>
    Your application is under review.
  </CardContent>
</Card>
```

### Utility Components
| Component | Path | Usage |
|-----------|------|-------|
| **Dropdown Menu** | `@/components/ui/dropdown-menu` | Dropdown menus |
| **Tooltip** | `@/components/ui/tooltip` | Tooltips |
| **Badge** | `@/components/ui/badge` | Status badges |
| **Skeleton** | `@/components/ui/skeleton` | Loading states |

**Example**:
```tsx
import { Badge } from '@/components/ui/badge'

<Badge variant="success">Approved</Badge>
<Badge variant="warning">Pending</Badge>
<Badge variant="destructive">Rejected</Badge>
```

## 📋 Decision Tree

### When to Use What?

```
Need a component?
│
├─ Is it Dialog or Navigation?
│  └─ YES → Use existing custom Radix component
│
├─ Is it a form element?
│  └─ YES → Use Shadcn (label, input, select, etc.)
│
├─ Is it for feedback?
│  └─ YES → Use Shadcn (alert, toast, progress)
│
├─ Is it for layout?
│  └─ YES → Use Shadcn (card, tabs, separator)
│
└─ Is it a utility?
   └─ YES → Use Shadcn (badge, tooltip, skeleton)
```

## 🚫 What NOT to Do

### ❌ Don't Replace Working Components
```tsx
// ❌ BAD - Don't replace existing Dialog
import { Dialog } from '@/components/ui/dialog' // Shadcn version

// ✅ GOOD - Use existing Dialog
import { Dialog } from '@/components/ui/Dialog' // Custom version
```

### ❌ Don't Mix Styling Approaches
```tsx
// ❌ BAD - Mixing custom styles with Shadcn
<Input className="custom-input-style" />

// ✅ GOOD - Use Shadcn variants
<Input variant="outline" />
```

### ❌ Don't Create Custom Components for Common Needs
```tsx
// ❌ BAD - Creating custom badge
const CustomBadge = ({ children }) => (
  <span className="px-2 py-1 rounded bg-blue-500">{children}</span>
)

// ✅ GOOD - Use Shadcn badge
import { Badge } from '@/components/ui/badge'
<Badge>{children}</Badge>
```

## ✅ What TO Do

### ✅ Use Shadcn for All New Features
```tsx
// New feature: User profile form
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'

<Card>
  <CardContent>
    <Label>Name</Label>
    <Input placeholder="Enter name" />
  </CardContent>
</Card>
```

### ✅ Combine Components When Needed
```tsx
// Using both: Custom Dialog + Shadcn form
import { Dialog, DialogContent } from '@/components/ui/Dialog'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'

<Dialog>
  <DialogContent>
    <Label>Email</Label>
    <Input type="email" />
  </DialogContent>
</Dialog>
```

### ✅ Follow Shadcn Patterns
```tsx
// Shadcn components follow consistent patterns
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'

// Notice the pattern: Component + ComponentPart
```

## 🔄 Migration Strategy (Optional)

### When to Migrate Old Components
Only migrate when:
1. ✅ Component needs major refactor
2. ✅ Adding significant new features
3. ✅ Fixing critical bugs
4. ✅ Have spare development time

### Migration Priority
1. **Never**: Dialog, Navigation (working perfectly)
2. **Low**: Rarely used components
3. **Medium**: Components needing updates
4. **High**: Components with bugs

## 📚 Resources

### Shadcn Documentation
- **Main Docs**: https://ui.shadcn.com
- **Components**: https://ui.shadcn.com/docs/components
- **CLI**: https://ui.shadcn.com/docs/cli

### Adding New Components
```bash
# List available components
npx shadcn@latest add

# Add specific component
npx shadcn@latest add button

# Add multiple components
npx shadcn@latest add button card alert
```

### Customizing Components
Shadcn components are in your codebase, so you can:
1. Edit them directly in `src/components/ui/`
2. Add custom variants
3. Modify styling
4. Add new features

## 🎨 Styling Guidelines

### Use Tailwind Classes
```tsx
// ✅ GOOD
<Input className="w-full" />
<Card className="max-w-md mx-auto" />
```

### Use Component Variants
```tsx
// ✅ GOOD
<Badge variant="success">Approved</Badge>
<Alert variant="destructive">Error occurred</Alert>
```

### Maintain Consistency
```tsx
// ✅ GOOD - Consistent spacing
<div className="space-y-4">
  <Input />
  <Input />
  <Input />
</div>
```

## 🐛 Troubleshooting

### Component Not Found?
```bash
# Install the component
npx shadcn@latest add <component-name>
```

### Import Error?
```tsx
// Check the correct path
import { Component } from '@/components/ui/component'
```

### Styling Issues?
```tsx
// Shadcn uses Tailwind, ensure classes are correct
<Component className="your-tailwind-classes" />
```

## 📞 Questions?

- Check Shadcn docs: https://ui.shadcn.com
- Review existing usage in codebase
- Ask team lead
- Create issue in project repo

---

**Remember**: Keep what works, use Shadcn for new features, migrate gradually.
