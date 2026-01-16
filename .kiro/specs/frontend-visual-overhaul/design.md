# Design Document: Frontend Visual Overhaul

## Overview

This design document outlines the technical architecture and implementation approach for transforming the MIHAS Application System frontend into a lightning-fast, visually stunning interface. The redesign leverages shadcn/ui registries (SmoothUI, 8starlabs UI, Supabase UI, ShadcnBlocks) to create a modern, performant user experience while maintaining all existing functionality.

The core philosophy is "instant perceived performance" - users should see meaningful content within 500ms and interact with a fully loaded page within 1.5 seconds.

## Architecture

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Browser                                   │
├─────────────────────────────────────────────────────────────────┤
│  Critical CSS (Inlined)  │  Deferred CSS  │  Lazy Components    │
├─────────────────────────────────────────────────────────────────┤
│                    React Application                             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐ │
│  │  SmoothUI   │  │ 8starlabs   │  │    Supabase UI          │ │
│  │ Animations  │  │ Components  │  │  Auth + Realtime        │ │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘ │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │              shadcn/ui Base Components                      ││
│  │  (Button, Card, Input, Dialog, Table, Form, etc.)          ││
│  └─────────────────────────────────────────────────────────────┘│
│  ┌─────────────────────────────────────────────────────────────┐│
│  │              Motion Animation Layer                         ││
│  │  (Page transitions, scroll animations, micro-interactions) ││
│  └─────────────────────────────────────────────────────────────┘│
├─────────────────────────────────────────────────────────────────┤
│                    Existing Services Layer                       │
│  (Supabase Client, API Services, State Management - Unchanged)  │
└─────────────────────────────────────────────────────────────────┘
```

### Performance Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    Initial Page Load                             │
├─────────────────────────────────────────────────────────────────┤
│  0ms     │ HTML + Critical CSS (inlined, <14KB)                 │
│  100ms   │ First Paint - Skeleton UI visible                    │
│  300ms   │ Main bundle loaded (code-split, <100KB)              │
│  500ms   │ First Contentful Paint - Hero visible                │
│  800ms   │ Interactive - User can click/scroll                  │
│  1500ms  │ Largest Contentful Paint - Full page rendered        │
└─────────────────────────────────────────────────────────────────┘
```

## Components and Interfaces

### Component Registry Structure

```
src/
├── components/
│   ├── ui/                    # Base shadcn/ui components
│   │   ├── button.tsx
│   │   ├── card.tsx
│   │   ├── input.tsx
│   │   └── ...
│   ├── smoothui/              # SmoothUI animated components
│   │   ├── animated-counter.tsx
│   │   ├── animated-input.tsx
│   │   ├── scroll-reveal.tsx
│   │   └── page-transition.tsx
│   ├── 8starlabs/             # 8starlabs specialized components
│   │   ├── status-indicator.tsx
│   │   ├── timeline.tsx
│   │   └── partition-bar.tsx
│   ├── supabase-ui/           # Supabase UI components
│   │   ├── auth-form.tsx
│   │   ├── realtime-cursor.tsx
│   │   └── avatar-stack.tsx
│   └── blocks/                # ShadcnBlocks page sections
│       ├── hero-section.tsx
│       ├── feature-grid.tsx
│       ├── stats-section.tsx
│       ├── cta-section.tsx
│       └── footer-section.tsx
```

### Core Component Interfaces

```typescript
// Animation wrapper for scroll-triggered reveals
interface ScrollRevealProps {
  children: React.ReactNode;
  direction?: 'up' | 'down' | 'left' | 'right';
  delay?: number;
  duration?: number;
  threshold?: number;
}

// Animated counter for statistics
interface AnimatedCounterProps {
  value: number;
  suffix?: string;
  prefix?: string;
  duration?: number;
  className?: string;
}

// Status indicator from 8starlabs
interface StatusIndicatorProps {
  status: 'operational' | 'degraded' | 'down' | 'idle';
  label: string;
  showPulse?: boolean;
}

// Timeline component from 8starlabs
interface TimelineProps {
  events: Array<{
    date: Date;
    title: string;
    description: string;
    status?: 'completed' | 'current' | 'pending' | 'error';
  }>;
  orientation?: 'vertical' | 'horizontal';
}

// Hero section block
interface HeroSectionProps {
  title: string;
  subtitle: string;
  primaryCTA: { label: string; href: string };
  secondaryCTA?: { label: string; onClick: () => void };
  backgroundGradient?: string;
  stats?: Array<{ value: string; label: string }>;
}

// Feature grid block
interface FeatureGridProps {
  title: string;
  subtitle?: string;
  features: Array<{
    icon: React.ComponentType;
    title: string;
    description: string;
    gradient?: string;
  }>;
  columns?: 2 | 3 | 4;
}
```

### Page Component Structure

```typescript
// Landing Page Structure
const LandingPage = () => (
  <PageTransition>
    <Header />
    <HeroSection {...heroProps} />
    <StatsSection stats={stats} />
    <FeatureGrid features={features} />
    <AccreditationSection accreditations={accreditations} />
    <ProgramsSection programs={programs} />
    <CTASection {...ctaProps} />
    <Footer />
  </PageTransition>
);

// Auth Page Structure
const SignInPage = () => (
  <AuthLayout>
    <BrandingPanel />
    <AuthForm 
      mode="signin"
      providers={['email']}
      onSuccess={handleSuccess}
    />
  </AuthLayout>
);

// Dashboard Structure
const StudentDashboard = () => (
  <DashboardLayout>
    <DashboardHeader />
    <StatusOverview />
    <ApplicationTimeline />
    <QuickActions />
  </DashboardLayout>
);
```

## Data Models

### Animation Configuration

```typescript
// Global animation settings
interface AnimationConfig {
  // Respect user preferences
  reducedMotion: boolean;
  
  // Default durations (in ms)
  durations: {
    fast: 150;
    normal: 300;
    slow: 500;
  };
  
  // Easing functions
  easings: {
    default: [0.4, 0, 0.2, 1];
    bounce: [0.68, -0.55, 0.265, 1.55];
    smooth: [0.25, 0.1, 0.25, 1];
  };
}

// Page transition variants
const pageTransitionVariants = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -20 },
};
```

### Design Token System

```typescript
// Extended design tokens for the new UI
const designTokens = {
  colors: {
    // Primary brand colors (preserved from existing)
    primary: {
      50: '#eff6ff',
      500: '#3b82f6',
      600: '#2563eb',
      700: '#1d4ed8',
    },
    // Gradient definitions
    gradients: {
      hero: 'from-primary-600 via-secondary-500 to-primary-700',
      cta: 'from-primary-500 to-secondary-600',
      card: 'from-white to-slate-50',
    },
  },
  
  spacing: {
    section: {
      mobile: '3rem',    // 48px
      tablet: '4rem',    // 64px
      desktop: '5rem',   // 80px
    },
  },
  
  typography: {
    hero: {
      mobile: 'text-3xl',
      tablet: 'text-4xl',
      desktop: 'text-6xl',
    },
  },
  
  shadows: {
    card: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
    cardHover: '0 20px 25px -5px rgb(0 0 0 / 0.1)',
    button: '0 1px 3px 0 rgb(0 0 0 / 0.1)',
  },
};
```

### Component State Models

```typescript
// Loading state for skeleton displays
interface LoadingState {
  isLoading: boolean;
  skeleton: 'card' | 'table' | 'form' | 'page';
  itemCount?: number;
}

// Animation state for scroll reveals
interface ScrollRevealState {
  isInView: boolean;
  hasAnimated: boolean;
  progress: number;
}

// Auth form state
interface AuthFormState {
  mode: 'signin' | 'signup' | 'forgot' | 'reset';
  isLoading: boolean;
  error: string | null;
  success: boolean;
}
```

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system-essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

Based on the prework analysis, the following properties have been identified and consolidated to eliminate redundancy:

### Property 1: Performance Metrics Consistency

*For any* page load on the landing page under simulated 4G network conditions, the First Contentful Paint SHALL occur within 500ms AND the Largest Contentful Paint SHALL occur within 1500ms.

**Validates: Requirements 1.1, 1.2**

### Property 2: Animation Reduced Motion Compliance

*For any* animated component in the Frontend_System, when the user has `prefers-reduced-motion: reduce` enabled, the animation duration SHALL be 0ms or the animation SHALL be replaced with an instant state change with no visible motion.

**Validates: Requirements 8.7, 10.6**

### Property 3: Content Preservation Round-Trip

*For any* page in the redesigned Frontend_System, extracting the visible text content, interactive element count, and navigation links SHALL produce an equivalent set to the original page before redesign, ensuring no functionality or content is lost.

**Validates: Requirements 11.1, 11.2, 11.3, 11.4, 11.5, 11.6, 11.7**

### Property 4: Touch Target Size Compliance

*For any* interactive element (button, link, form input, clickable card) rendered on a mobile viewport (width < 768px), the computed bounding box SHALL have both width and height of at least 44 pixels.

**Validates: Requirements 9.2**

### Property 5: Responsive Layout Integrity

*For any* page in the Frontend_System rendered at any viewport width between 320px and 1920px, the document body SHALL NOT have horizontal overflow (no horizontal scrollbar) AND all interactive elements SHALL remain visible and accessible.

**Validates: Requirements 9.3, 9.4**

### Property 6: Skeleton Loading State Consistency

*For any* component that fetches data asynchronously, while the data is loading (isLoading=true), a skeleton placeholder element SHALL be rendered, AND the skeleton's dimensions SHALL match the final rendered content dimensions within a 20% tolerance.

**Validates: Requirements 1.5**

### Property 7: Navigation State Synchronization

*For any* route in the Frontend_System, the navigation component SHALL visually indicate the current route (via active class or aria-current), AND when navigating between routes, the page transition animation SHALL complete within 300ms.

**Validates: Requirements 4.3, 4.4**

### Property 8: Form Validation Feedback

*For any* form input field with validation rules, when an invalid value is entered and the field loses focus OR the form is submitted, an error message SHALL appear within 150ms with appropriate ARIA attributes (aria-invalid, aria-describedby).

**Validates: Requirements 3.4, 7.4**

### Property 9: Keyboard Navigation and ARIA Completeness

*For any* interactive element in the Frontend_System, it SHALL be reachable via sequential keyboard Tab navigation, activatable via Enter or Space keys, AND have appropriate ARIA labels or accessible names.

**Validates: Requirements 10.2, 10.7**

### Property 10: Color Contrast Compliance

*For any* text element in the Frontend_System, the computed color contrast ratio between the text color and its background color SHALL meet WCAG AA standards: at least 4.5:1 for normal text (< 18pt or < 14pt bold) and at least 3:1 for large text (≥ 18pt or ≥ 14pt bold).

**Validates: Requirements 10.5**

### Property 11: Heading Hierarchy Correctness

*For any* page in the Frontend_System, the heading elements (h1-h6) SHALL follow a logical hierarchy where h1 appears exactly once, and subsequent headings do not skip levels (e.g., h2 followed by h4 without h3 is invalid).

**Validates: Requirements 10.4**

### Property 12: Breadcrumb Navigation Presence

*For any* interior page (non-landing, non-auth pages) in the Frontend_System, a breadcrumb navigation component SHALL be rendered showing the path from home to the current page.

**Validates: Requirements 4.6**

## Error Handling

### Loading Error States

```typescript
// Error boundary for component failures
const ComponentErrorFallback = ({ error, resetErrorBoundary }) => (
  <Card className="p-6 text-center">
    <AlertTriangle className="h-12 w-12 text-warning mx-auto mb-4" />
    <h3 className="text-lg font-semibold mb-2">Something went wrong</h3>
    <p className="text-muted-foreground mb-4">{error.message}</p>
    <Button onClick={resetErrorBoundary}>Try Again</Button>
  </Card>
);

// Network error handling for data fetching
const useDataWithFallback = (queryFn, fallbackData) => {
  const { data, error, isLoading } = useQuery({
    queryFn,
    retry: 2,
    retryDelay: 1000,
  });
  
  if (error) {
    console.error('Data fetch failed:', error);
    return { data: fallbackData, isError: true };
  }
  
  return { data, isLoading, isError: false };
};
```

### Animation Error Handling

```typescript
// Graceful degradation for animation failures
const SafeMotion = ({ children, ...props }) => {
  const prefersReducedMotion = useReducedMotion();
  
  if (prefersReducedMotion) {
    return <div>{children}</div>;
  }
  
  return (
    <ErrorBoundary fallback={<div>{children}</div>}>
      <motion.div {...props}>{children}</motion.div>
    </ErrorBoundary>
  );
};
```

### Image Loading Errors

```typescript
// Image with fallback and blur placeholder
const OptimizedImage = ({ src, alt, fallback, ...props }) => {
  const [error, setError] = useState(false);
  const [loaded, setLoaded] = useState(false);
  
  return (
    <div className="relative">
      {!loaded && <Skeleton className="absolute inset-0" />}
      <img
        src={error ? fallback : src}
        alt={alt}
        onError={() => setError(true)}
        onLoad={() => setLoaded(true)}
        className={cn(
          'transition-opacity duration-300',
          loaded ? 'opacity-100' : 'opacity-0'
        )}
        {...props}
      />
    </div>
  );
};
```

## Testing Strategy

### Dual Testing Approach

This project requires both unit tests and property-based tests to ensure comprehensive coverage:

- **Unit tests**: Verify specific examples, edge cases, and error conditions
- **Property tests**: Verify universal properties across all inputs using randomized testing

### Unit Testing Strategy

Unit tests will focus on:
- Component rendering with various props
- User interaction handling (clicks, keyboard events)
- Error state displays
- Loading state transitions
- Responsive breakpoint behavior

```typescript
// Example unit test structure
describe('HeroSection', () => {
  it('renders title and subtitle correctly', () => {
    render(<HeroSection title="Test" subtitle="Subtitle" />);
    expect(screen.getByText('Test')).toBeInTheDocument();
  });
  
  it('handles CTA click', async () => {
    const onClick = vi.fn();
    render(<HeroSection primaryCTA={{ label: 'Click', onClick }} />);
    await userEvent.click(screen.getByText('Click'));
    expect(onClick).toHaveBeenCalled();
  });
});
```

### Property-Based Testing Strategy

Property-based tests will use **fast-check** library to verify universal properties:

```typescript
// Property test configuration
import fc from 'fast-check';

// Minimum 100 iterations per property test
const propertyTestConfig = { numRuns: 100 };

// Example property test
describe('Property: Touch Target Size Compliance', () => {
  it('all buttons have minimum 44x44 touch targets', () => {
    fc.assert(
      fc.property(
        fc.record({
          size: fc.constantFrom('sm', 'md', 'lg', 'xl'),
          variant: fc.constantFrom('default', 'outline', 'ghost'),
        }),
        (props) => {
          const { container } = render(<Button {...props}>Test</Button>);
          const button = container.querySelector('button');
          const rect = button.getBoundingClientRect();
          return rect.width >= 44 && rect.height >= 44;
        }
      ),
      propertyTestConfig
    );
  });
});
```

### Performance Testing

```typescript
// Lighthouse CI configuration
module.exports = {
  ci: {
    collect: {
      url: ['http://localhost:5173/'],
      numberOfRuns: 3,
    },
    assert: {
      assertions: {
        'first-contentful-paint': ['error', { maxNumericValue: 500 }],
        'largest-contentful-paint': ['error', { maxNumericValue: 1500 }],
        'cumulative-layout-shift': ['error', { maxNumericValue: 0.1 }],
        'total-blocking-time': ['error', { maxNumericValue: 200 }],
      },
    },
  },
};
```

### Visual Regression Testing

```typescript
// Playwright visual comparison
test('landing page visual regression', async ({ page }) => {
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await expect(page).toHaveScreenshot('landing-page.png', {
    maxDiffPixels: 100,
  });
});
```

### Accessibility Testing

```typescript
// axe-core integration
import { axe, toHaveNoViolations } from 'jest-axe';

expect.extend(toHaveNoViolations);

test('landing page has no accessibility violations', async () => {
  const { container } = render(<LandingPage />);
  const results = await axe(container);
  expect(results).toHaveNoViolations();
});
```

### Test File Organization

```
tests/
├── unit/
│   ├── components/
│   │   ├── ui/
│   │   ├── smoothui/
│   │   ├── 8starlabs/
│   │   └── blocks/
│   └── pages/
├── property/
│   ├── performance.property.test.ts
│   ├── accessibility.property.test.ts
│   ├── responsive.property.test.ts
│   └── animation.property.test.ts
├── visual/
│   ├── landing.visual.test.ts
│   ├── auth.visual.test.ts
│   └── dashboard.visual.test.ts
└── e2e/
    ├── user-flows.spec.ts
    └── performance.spec.ts
```
