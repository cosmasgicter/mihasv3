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

// Animated select inputs
export { AnimatedSelect } from './animated-select';

// Page transitions
export { 
  PageTransition, 
  RouteTransition,
  AnimatedRoutes, 
  LayoutTransition,
  ContentTransition
} from './page-transition';

// Infinite grid background
export { InfiniteGrid } from './infinite-grid';

// Shiny text shimmer effect
export { ShinyText } from './shiny-text';

// Text rotation component
export { TextRotate } from './text-rotate';

// Text entrance effects
export { TextEffect } from './text-effect';

// Re-export animation configuration
export * from '@/lib/animation-config';
