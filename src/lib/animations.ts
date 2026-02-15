/**
 * Shared CSS Animation Utilities
 *
 * Reusable CSS class constants that replace framer-motion usage across the app.
 * All animations use CSS transitions and Tailwind utility classes for performance.
 * Reduced-motion is handled via `@media (prefers-reduced-motion: reduce)` in index.css.
 *
 * @requirements 1.2 - Use CSS transitions/Tailwind instead of framer-motion
 * @requirements 1.5 - Preserve same visual transition behavior using CSS equivalents
 */

/** Fade-in transition: opacity 0→1 over 300ms with ease-out */
export const fadeIn = 'transition-opacity duration-300 ease-out';

/** Slide-up transition: translateY + opacity over 300ms with ease-out */
export const slideUp = 'transition-all duration-300 ease-out transform';

/** Scale-in transition: scale + opacity over 200ms with ease-out */
export const scaleIn = 'transition-all duration-200 ease-out transform';

/**
 * Returns an inline style string for staggered animation delay.
 * Use with CSS `@keyframes` animations to create sequential reveal effects.
 *
 * @param index - The child index (0-based) used to calculate the delay
 * @param baseDelayMs - Base delay per child in milliseconds (default: 50)
 * @returns CSS animation-delay value as an inline style object
 *
 * @example
 * ```tsx
 * {items.map((item, i) => (
 *   <div
 *     key={item.id}
 *     className="animate-fade-in opacity-0"
 *     style={staggerChild(i)}
 *   >
 *     {item.name}
 *   </div>
 * ))}
 * ```
 */
export const staggerChild = (index: number, baseDelayMs = 50): React.CSSProperties => ({
  animationDelay: `${index * baseDelayMs}ms`,
  animationFillMode: 'forwards',
});

/**
 * Tailwind class presets for keyframe-based animations.
 * These map to the `@keyframes` defined in `src/index.css`.
 */
export const animateClasses = {
  /** Keyframe fade-in: opacity 0→1, 300ms ease-out */
  fadeIn: 'animate-fade-in',
  /** Keyframe slide-up: translateY(20px)→0 + opacity, 300ms ease-out */
  slideUp: 'animate-slide-up',
  /** Keyframe scale-in: scale(0.95)→1 + opacity, 200ms ease-out */
  scaleIn: 'animate-scale-in',
} as const;

/**
 * Initial-state classes to pair with transition utilities.
 * Apply these first, then remove them (or toggle a "visible" class) to trigger the transition.
 *
 * @example
 * ```tsx
 * <div className={`${fadeIn} ${isVisible ? 'opacity-100' : initialStates.hidden}`}>
 *   Content
 * </div>
 * ```
 */
export const initialStates = {
  /** Hidden: fully transparent */
  hidden: 'opacity-0',
  /** Below: shifted down 20px and transparent */
  below: 'opacity-0 translate-y-5',
  /** Scaled down: slightly smaller and transparent */
  small: 'opacity-0 scale-95',
} as const;

/**
 * Visible-state classes to pair with transition utilities.
 * Apply these to trigger the transition from the initial state.
 */
export const visibleStates = {
  /** Visible: fully opaque */
  shown: 'opacity-100',
  /** In place: at origin position and fully opaque */
  inPlace: 'opacity-100 translate-y-0',
  /** Full size: normal scale and fully opaque */
  fullSize: 'opacity-100 scale-100',
} as const;
