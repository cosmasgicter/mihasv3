# UI/UX Remediation Design

## Color Token Mapping

### Auth Pages — Replace hardcoded colors with semantic equivalents
| Hardcoded | Semantic Replacement | Context |
|-----------|---------------------|---------|
| `cyan-200` | `border-info/30` or `border-primary/30` | SignIn callout border |
| `cyan-50/80` | `bg-info/5` or `bg-primary/5` | SignIn callout background |
| `cyan-900` | `text-primary` | SignIn callout icon |
| `slate-950` | `text-foreground` | Callout heading text |
| `slate-700` | `text-muted-foreground` | Callout body text |
| `emerald-200` | `border-success/30` | SignUp callout border |
| `emerald-50/80` | `bg-success/5` | SignUp callout background |
| `emerald-900` | `text-success` | SignUp callout icon |

### Admin Dashboard
| Hardcoded | Semantic Replacement |
|-----------|---------------------|
| `from-blue-600/90 via-indigo-600/85 to-blue-700/90` | `bg-gradient-vibrant` (already in tailwind config) |
| `bg-black/10` | `bg-foreground/10` |
| `text-white/90` | `text-primary-foreground/90` |

## InfoCallout Component
Reusable callout for auth pages and forms:
```tsx
interface InfoCalloutProps {
  icon: LucideIcon
  title: string
  description: string
  variant: 'info' | 'success' | 'warning' | 'neutral'
}
```
Variants map to semantic tokens: info→primary, success→success, warning→warning, neutral→muted.

## Deprecated Export Cleanup
Remove deprecated re-exports from barrel, verify no active consumers first.
