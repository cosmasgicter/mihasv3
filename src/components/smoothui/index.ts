/**
 * SmoothUI Components Index
 * Re-exports all SmoothUI-style animated components
 * 
 * @requirements 8.1, 8.6 - SmoothUI animation registry
 */

// Scroll reveal animations
export { 
  ScrollReveal, 
  StaggerReveal, 
  StaggerItem 
} from './scroll-reveal';

// Animated counter for statistics
export { 
  AnimatedCounter, 
  SimpleCounter 
} from './animated-counter';

// Animated form inputs
export { AnimatedInput } from './animated-input';

// Page transitions
export { 
  PageTransition, 
  RouteTransition,
  AnimatedRoutes, 
  LayoutTransition,
  ContentTransition
} from './page-transition';

// Re-export animation configuration
export * from '@/lib/animation-config';
