# Animation Optimization Guide

## Overview

This guide provides best practices for creating performant animations that maintain 60fps in the MIHAS Application System.

**Requirements**: 14.5 - Maintain 60fps animation performance  
**Task**: 25.2 - Optimize animations

## Key Principles

### 1. Use GPU-Accelerated Properties

✅ **DO**: Animate these properties (GPU-accelerated)
- `transform` (translate, scale, rotate)
- `opacity`
- `filter`
- `backdrop-filter`

❌ **DON'T**: Animate these properties (CPU-bound, causes layout/paint)
- `width`, `height`
- `top`, `left`, `right`, `bottom`
- `margin`, `padding`
- `border-width`
- `font-size`

### 2. Use translate3d for GPU Acceleration

```css
/* ❌ Bad - 2D transform */
.element {
  transform: translateY(10px);
}

/* ✅ Good - 3D transform triggers GPU */
.element {
  transform: translate3d(0, 10px, 0);
}
```

### 3. Use will-change Sparingly

```javascript
// ❌ Bad - will-change always on
element.style.willChange = 'transform';

// ✅ Good - add before animation, remove after
element.style.willChange = 'transform';
element.animate(/* ... */);
setTimeout(() => {
  element.style.willChange = 'auto';
}, animationDuration + 50);
```

### 4. Avoid Layout Thrashing

```javascript
// ❌ Bad - interleaved reads and writes
elements.forEach(el => {
  const height = el.offsetHeight; // Read
  el.style.height = height + 10 + 'px'; // Write
});

// ✅ Good - batch reads, then writes
const heights = elements.map(el => el.offsetHeight); // All reads
elements.forEach((el, i) => {
  el.style.height = heights[i] + 10 + 'px'; // All writes
});
```

### 5. Keep Animations Short

- **Fast interactions** (buttons, links): 100-150ms
- **Standard interactions** (modals, dropdowns): 200-250ms
- **Smooth transitions** (page changes): 300ms max
- **Loading animations**: Can be longer, but use infinite loops

### 6. Respect Reduced Motion

```css
@media (prefers-reduced-motion: reduce) {
  * {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

```javascript
// Check in JavaScript
const prefersReducedMotion = window.matchMedia(
  '(prefers-reduced-motion: reduce)'
).matches;

if (!prefersReducedMotion) {
  // Apply animations
}
```

## Using the Animation Utilities

### Import the Utilities

```typescript
import {
  optimizedVariants,
  getAnimationConfig,
  getTransition,
  prefersReducedMotion,
  withWillChange,
  animationBatcher,
} from '@/utils/animationOptimization';
```

### Framer Motion Variants

```typescript
import { motion } from 'framer-motion';
import { optimizedVariants } from '@/utils/animationOptimization';

function MyComponent() {
  return (
    <motion.div
      initial="initial"
      animate="animate"
      exit="exit"
      variants={optimizedVariants.fadeIn}
    >
      Content
    </motion.div>
  );
}
```

### Responsive to User Preferences

```typescript
import { getAnimationConfig } from '@/utils/animationOptimization';

function MyComponent() {
  const animationConfig = getAnimationConfig('slideUp');
  
  return (
    <motion.div {...animationConfig}>
      Content
    </motion.div>
  );
}
```

### CSS Classes

```tsx
// Use optimized CSS classes
<div className="animate-fade-in">Fading in</div>
<div className="animate-slide-up">Sliding up</div>
<div className="transition-smooth hover-lift">Interactive element</div>
```

### Dynamic will-change

```typescript
import { withWillChange } from '@/utils/animationOptimization';

function handleAnimation(element: HTMLElement) {
  // Add will-change before animation
  withWillChange(element, ['transform', 'opacity'], 300);
  
  // Trigger animation
  element.classList.add('animate-slide-up');
}
```

### Batch DOM Operations

```typescript
import { animationBatcher } from '@/utils/animationOptimization';

// Schedule reads
animationBatcher.read(() => {
  const height = element.offsetHeight;
  // Store height
});

// Schedule writes
animationBatcher.write(() => {
  element.style.height = newHeight + 'px';
});
```

## Common Patterns

### Fade In on Mount

```typescript
<motion.div
  initial={{ opacity: 0 }}
  animate={{ opacity: 1 }}
  transition={{ duration: 0.2 }}
>
  Content
</motion.div>
```

### Slide Up on Mount

```typescript
<motion.div
  initial={{ opacity: 0, y: 20 }}
  animate={{ opacity: 1, y: 0 }}
  transition={{ duration: 0.3, ease: 'easeOut' }}
>
  Content
</motion.div>
```

### Stagger Children

```typescript
<motion.div
  variants={optimizedVariants.staggerContainer}
  initial="initial"
  animate="animate"
>
  {items.map(item => (
    <motion.div
      key={item.id}
      variants={optimizedVariants.staggerItem}
    >
      {item.content}
    </motion.div>
  ))}
</motion.div>
```

### Hover Effects

```typescript
<motion.button
  whileHover={{ scale: 1.05 }}
  whileTap={{ scale: 0.95 }}
  transition={{ duration: 0.15 }}
>
  Click me
</motion.button>
```

## Performance Monitoring

### Monitor FPS

```typescript
import { AnimationPerformanceMonitor } from '@/utils/animationOptimization';

const monitor = new AnimationPerformanceMonitor();
monitor.start();

// Later, check FPS
console.log('Current FPS:', monitor.getFPS());
```

### Validate Animation Properties

```typescript
import { validateAnimationProperties } from '@/utils/animationOptimization';

const properties = ['transform', 'opacity'];
const validation = validateAnimationProperties(properties);

if (!validation.valid) {
  console.warn('Animation warnings:', validation.warnings);
}
```

## Debugging Performance Issues

### Chrome DevTools

1. Open DevTools → Performance tab
2. Click Record
3. Trigger animation
4. Stop recording
5. Look for:
   - Long frames (> 16.67ms)
   - Layout/Reflow warnings
   - Paint operations
   - Composite layers

### Performance Checklist

- [ ] Animation uses only `transform` and `opacity`
- [ ] Using `translate3d` instead of `translateX/Y`
- [ ] Using `scale3d` instead of `scale`
- [ ] `will-change` added only during animation
- [ ] Animation duration < 300ms
- [ ] Respects `prefers-reduced-motion`
- [ ] No layout-triggering properties animated
- [ ] DOM reads and writes are batched
- [ ] Tested on low-end devices

## Common Mistakes to Avoid

### 1. Animating Width/Height

```css
/* ❌ Bad */
.element {
  transition: width 0.3s;
}

/* ✅ Good */
.element {
  transition: transform 0.3s;
  transform: scaleX(1.5);
}
```

### 2. Using `all` in Transitions

```css
/* ❌ Bad - animates everything */
.element {
  transition: all 0.3s;
}

/* ✅ Good - specific properties */
.element {
  transition: transform 0.3s, opacity 0.3s;
}
```

### 3. Permanent will-change

```css
/* ❌ Bad - always on */
.element {
  will-change: transform;
}

/* ✅ Good - only on hover */
.element:hover {
  will-change: transform;
}
```

### 4. Too Many Simultaneous Animations

```javascript
// ❌ Bad - animating 100 elements at once
elements.forEach(el => {
  el.animate(/* ... */);
});

// ✅ Good - stagger animations
elements.forEach((el, i) => {
  setTimeout(() => {
    el.animate(/* ... */);
  }, i * 50); // 50ms stagger
});
```

## Mobile Considerations

### Reduce Animation Complexity on Mobile

```typescript
const isMobile = window.innerWidth < 768;

const animationConfig = {
  duration: isMobile ? 0.2 : 0.3,
  ease: isMobile ? 'easeOut' : [0.4, 0, 0.2, 1],
};
```

### Test on Real Devices

- Animations that work well on desktop may lag on mobile
- Test on low-end Android devices (not just iPhones)
- Use Chrome DevTools CPU throttling for testing

## Resources

- [CSS Triggers](https://csstriggers.com/) - See what properties trigger layout/paint
- [Web Animations API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Animations_API)
- [Framer Motion Docs](https://www.framer.com/motion/)
- [High Performance Animations](https://web.dev/animations/)

## Summary

1. **Use GPU-accelerated properties**: `transform` and `opacity`
2. **Use 3D transforms**: `translate3d`, `scale3d`, `rotate3d`
3. **Manage will-change**: Add before animation, remove after
4. **Batch DOM operations**: Read all, then write all
5. **Keep it short**: < 300ms for most animations
6. **Respect preferences**: Check `prefers-reduced-motion`
7. **Test performance**: Use DevTools and real devices
8. **Monitor FPS**: Aim for consistent 60fps

Following these guidelines will ensure smooth, performant animations throughout the MIHAS application.
