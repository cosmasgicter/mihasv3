# MIHAS Design System

A comprehensive design system for the MIHAS Application Portal.

## 📚 Documentation

1. **[Foundation](./01-foundation.md)** - Colors, typography, spacing
2. **[Components](./02-components.md)** - Button, card, input variants
3. **[Patterns](./03-patterns.md)** - Layout patterns, navigation
4. **[Animations](./04-animations.md)** - Motion guidelines

## 🚀 Quick Start

### Using Design Tokens
```typescript
import { designTokens } from '@/design-system/tokens'

const primaryColor = designTokens.colors.primary.main
const standardSpacing = designTokens.spacing.standard
```

### Using Component Variants
```typescript
import { buttonVariants, buttonSizes } from '@/design-system/variants'

<button className={`${buttonVariants.primary} ${buttonSizes.lg}`}>
  Submit
</button>
```

## 🎨 Core Principles

1. **Consistency** - Use design tokens for all values
2. **Accessibility** - WCAG AA minimum, AAA preferred
3. **Performance** - Optimize animations, lazy load heavy components
4. **Mobile-First** - Design for mobile, enhance for desktop
5. **Semantic** - Use meaningful color names (success, error, not green, red)

## 📦 Component Library

### Buttons
- Primary, Secondary, Success, Error
- Outline, Ghost, Gradient
- Sizes: sm, md, lg, xl

### Cards
- Default, Elevated, Gradient, Flat

### Badges
- Success, Error, Warning, Info, Neutral

### Inputs
- Default, Error state

## 🎯 Usage Guidelines

### Colors
- **Primary**: CTAs, links, interactive elements
- **Success**: Approvals, confirmations
- **Error**: Rejections, destructive actions
- **Warning**: Pending states, cautions

### Typography
- **Headings**: Bold (700) or Extrabold (800)
- **Body**: Normal (400) or Medium (500)
- **Buttons**: Semibold (600)

### Spacing
- **Compact**: Mobile, tight layouts
- **Standard**: Desktop cards, sections
- **Spacious**: Hero sections, modals

## 🔧 Development

### Adding New Components
1. Define variants in `src/design-system/variants.ts`
2. Document in `docs/design-system/02-components.md`
3. Add usage examples
4. Test accessibility

### Updating Tokens
1. Update `src/design-system/tokens.ts`
2. Update documentation
3. Search codebase for hardcoded values
4. Replace with token references

## 📊 Metrics

- **Component Reuse**: Target 80%+
- **Token Usage**: Target 95%+
- **Accessibility**: WCAG AA minimum
- **Performance**: Lighthouse 95+

## 🤝 Contributing

1. Follow existing patterns
2. Use design tokens
3. Document new components
4. Test on mobile and desktop
5. Ensure accessibility

## 📞 Support

Questions? Contact the development team or refer to the documentation.
