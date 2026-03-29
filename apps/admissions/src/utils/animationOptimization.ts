/**
 * Animation Optimization Utilities
 * 
 * Provides optimized animation configurations and utilities to ensure
 * animations maintain 60fps performance.
 * 
 * Requirements: 14.5 - Maintain 60fps animation performance
 * Task: 25.2 - Optimize animations
 * 
 * Key Principles:
 * 1. Use CSS transforms (translate, scale, rotate) instead of position properties
 * 2. Avoid animating layout properties (width, height, top, left, margin, padding)
 * 3. Use will-change sparingly and only during animation
 * 4. Respect user's reduced motion preferences
 * 5. Keep animations short (< 300ms for most interactions)
 */

/**
 * Check if user prefers reduced motion
 */
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Optimized animation variants for framer-motion
 * Uses only transform and opacity for best performance
 */
export const optimizedVariants = {
  // Fade animations
  fadeIn: {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    exit: { opacity: 0 },
    transition: { duration: 0.2, ease: 'easeOut' },
  },
  
  // Slide animations (using transform)
  slideUp: {
    initial: { opacity: 0, y: 20 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -20 },
    transition: { duration: 0.3, ease: 'easeOut' },
  },
  
  slideDown: {
    initial: { opacity: 0, y: -20 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: 20 },
    transition: { duration: 0.3, ease: 'easeOut' },
  },
  
  slideLeft: {
    initial: { opacity: 0, x: 20 },
    animate: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: -20 },
    transition: { duration: 0.3, ease: 'easeOut' },
  },
  
  slideRight: {
    initial: { opacity: 0, x: -20 },
    animate: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: 20 },
    transition: { duration: 0.3, ease: 'easeOut' },
  },
  
  // Scale animations
  scaleIn: {
    initial: { opacity: 0, scale: 0.95 },
    animate: { opacity: 1, scale: 1 },
    exit: { opacity: 0, scale: 0.95 },
    transition: { duration: 0.2, ease: 'easeOut' },
  },
  
  // Stagger children animations
  staggerContainer: {
    animate: {
      transition: {
        staggerChildren: 0.05,
        delayChildren: 0.1,
      },
    },
  },
  
  staggerItem: {
    initial: { opacity: 0, y: 10 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.2 },
  },
};

/**
 * Get animation config based on user preferences
 * Returns instant animations if user prefers reduced motion
 */
export function getAnimationConfig(variant: keyof typeof optimizedVariants) {
  if (prefersReducedMotion()) {
    return {
      initial: optimizedVariants[variant].animate,
      animate: optimizedVariants[variant].animate,
      exit: optimizedVariants[variant].animate,
      transition: { duration: 0 },
    };
  }
  
  return optimizedVariants[variant];
}

/**
 * Optimized transition configurations
 */
export const optimizedTransitions = {
  // Fast interactions (buttons, links)
  fast: {
    duration: 0.15,
    ease: 'easeOut',
  },
  
  // Standard interactions (modals, dropdowns)
  standard: {
    duration: 0.2,
    ease: 'easeOut',
  },
  
  // Smooth interactions (page transitions)
  smooth: {
    duration: 0.3,
    ease: [0.4, 0, 0.2, 1], // Custom cubic-bezier
  },
  
  // Spring animations (for playful interactions)
  spring: {
    type: 'spring',
    stiffness: 300,
    damping: 30,
  },
  
  // Instant (for reduced motion)
  instant: {
    duration: 0,
  },
};

/**
 * Get transition config based on user preferences
 */
export function getTransition(type: keyof typeof optimizedTransitions = 'standard') {
  if (prefersReducedMotion()) {
    return optimizedTransitions.instant;
  }
  
  return optimizedTransitions[type];
}

/**
 * CSS class names for optimized animations
 * These use CSS transforms and are GPU-accelerated
 */
export const animationClasses = {
  fadeIn: 'animate-fade-in',
  slideUp: 'animate-slide-up',
  slideDown: 'animate-slide-down',
  scaleIn: 'animate-scale-in',
  shimmer: 'animate-shimmer',
  spin: 'animate-spin',
  pulse: 'animate-pulse',
  bounce: 'animate-bounce',
};

/**
 * Apply will-change property during animation
 * Automatically removes it after animation completes
 */
export function withWillChange(
  element: HTMLElement,
  properties: string[],
  duration: number = 300
): void {
  // Add will-change
  element.style.willChange = properties.join(', ');
  
  // Remove after animation completes
  setTimeout(() => {
    element.style.willChange = 'auto';
  }, duration + 50); // Add small buffer
}

/**
 * Debounce animation triggers to prevent layout thrashing
 */
export function debounceAnimation<T extends (...args: any[]) => any>(
  fn: T,
  delay: number = 16 // ~1 frame at 60fps
): (...args: Parameters<T>) => void {
  let timeoutId: NodeJS.Timeout | null = null;
  let rafId: number | null = null;
  
  return function (this: any, ...args: Parameters<T>) {
    // Cancel previous timeout and RAF
    if (timeoutId) clearTimeout(timeoutId);
    if (rafId) cancelAnimationFrame(rafId);
    
    // Schedule for next frame
    rafId = requestAnimationFrame(() => {
      timeoutId = setTimeout(() => {
        fn.apply(this, args);
      }, delay);
    });
  };
}

/**
 * Batch DOM reads and writes to prevent layout thrashing
 */
export class AnimationBatcher {
  private readQueue: Array<() => void> = [];
  private writeQueue: Array<() => void> = [];
  private scheduled = false;
  
  /**
   * Schedule a DOM read operation
   */
  read(fn: () => void): void {
    this.readQueue.push(fn);
    this.schedule();
  }
  
  /**
   * Schedule a DOM write operation
   */
  write(fn: () => void): void {
    this.writeQueue.push(fn);
    this.schedule();
  }
  
  /**
   * Schedule the batch execution
   */
  private schedule(): void {
    if (this.scheduled) return;
    
    this.scheduled = true;
    requestAnimationFrame(() => {
      this.flush();
    });
  }
  
  /**
   * Execute all queued operations
   */
  private flush(): void {
    // Execute all reads first
    const reads = this.readQueue.slice();
    this.readQueue = [];
    reads.forEach(fn => fn());
    
    // Then execute all writes
    const writes = this.writeQueue.slice();
    this.writeQueue = [];
    writes.forEach(fn => fn());
    
    this.scheduled = false;
  }
}

/**
 * Global animation batcher instance
 */
export const animationBatcher = new AnimationBatcher();

/**
 * Performance monitoring for animations
 */
export class AnimationPerformanceMonitor {
  private frameCount = 0;
  private lastTime = performance.now();
  private fps = 60;
  
  /**
   * Start monitoring FPS
   */
  start(): void {
    this.measure();
  }
  
  /**
   * Measure current FPS
   */
  private measure(): void {
    requestAnimationFrame(() => {
      const currentTime = performance.now();
      const delta = currentTime - this.lastTime;
      
      if (delta >= 1000) {
        this.fps = Math.round((this.frameCount * 1000) / delta);
        this.frameCount = 0;
        this.lastTime = currentTime;
        
        // Warn if FPS drops below 60
        if (this.fps < 55) {
          console.warn(`Animation performance warning: ${this.fps} FPS`);
        }
      }
      
      this.frameCount++;
      this.measure();
    });
  }
  
  /**
   * Get current FPS
   */
  getFPS(): number {
    return this.fps;
  }
}

/**
 * Check if an animation is GPU-accelerated
 */
export function isGPUAccelerated(property: string): boolean {
  const gpuProperties = [
    'transform',
    'opacity',
    'filter',
    'backdrop-filter',
  ];
  
  return gpuProperties.some(prop => property.includes(prop));
}

/**
 * Validate animation properties for performance
 */
export function validateAnimationProperties(properties: string[]): {
  valid: boolean;
  warnings: string[];
} {
  const warnings: string[] = [];
  
  // Check for non-GPU-accelerated properties
  const nonGPUProps = properties.filter(prop => !isGPUAccelerated(prop));
  if (nonGPUProps.length > 0) {
    warnings.push(
      `Non-GPU-accelerated properties detected: ${nonGPUProps.join(', ')}. ` +
      `Consider using transform and opacity instead.`
    );
  }
  
  // Check for layout-triggering properties
  const layoutProps = ['width', 'height', 'top', 'left', 'right', 'bottom', 'margin', 'padding'];
  const layoutTriggers = properties.filter(prop => 
    layoutProps.some(layout => prop.includes(layout))
  );
  
  if (layoutTriggers.length > 0) {
    warnings.push(
      `Layout-triggering properties detected: ${layoutTriggers.join(', ')}. ` +
      `These can cause layout thrashing and poor performance.`
    );
  }
  
  return {
    valid: warnings.length === 0,
    warnings,
  };
}

/**
 * Create an optimized animation hook for React components
 */
export function useOptimizedAnimation(enabled: boolean = true) {
  const shouldAnimate = enabled && !prefersReducedMotion();
  
  return {
    shouldAnimate,
    variants: shouldAnimate ? optimizedVariants : {},
    transition: shouldAnimate ? optimizedTransitions.standard : optimizedTransitions.instant,
  };
}
