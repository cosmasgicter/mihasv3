# Animation Guidelines

## Principles

1. **Purposeful**: Animations should guide attention, not distract
2. **Fast**: Keep under 300ms for UI feedback
3. **Smooth**: Use easing functions (ease-out for entrances, ease-in for exits)
4. **Respectful**: Honor `prefers-reduced-motion`

---

## Timing

```typescript
fast: 150ms    // Hover states, tooltips
base: 200ms    // Button clicks, toggles
slow: 300ms    // Page transitions, modals
slower: 500ms  // Hero animations
```

---

## Common Patterns

### Fade In
```tsx
<motion.div
  initial={{ opacity: 0 }}
  animate={{ opacity: 1 }}
  transition={{ duration: 0.3 }}
>
  Content
</motion.div>
```

### Slide Up
```tsx
<motion.div
  initial={{ opacity: 0, y: 20 }}
  animate={{ opacity: 1, y: 0 }}
  transition={{ duration: 0.3 }}
>
  Content
</motion.div>
```

### Scale
```tsx
<motion.button
  whileHover={{ scale: 1.05 }}
  whileTap={{ scale: 0.95 }}
>
  Click Me
</motion.button>
```

### Stagger Children
```tsx
<motion.div
  variants={{
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: { staggerChildren: 0.1 }
    }
  }}
>
  {items.map(item => (
    <motion.div
      key={item.id}
      variants={{
        hidden: { opacity: 0, y: 20 },
        visible: { opacity: 1, y: 0 }
      }}
    >
      {item.content}
    </motion.div>
  ))}
</motion.div>
```

---

## Reduced Motion

Always respect user preferences:

```tsx
const shouldReduceMotion = useReducedMotion()

<motion.div
  initial={shouldReduceMotion ? undefined : { opacity: 0 }}
  animate={shouldReduceMotion ? undefined : { opacity: 1 }}
>
  Content
</motion.div>
```

---

## When to Animate

### ✅ Do Animate
- Page transitions
- Modal open/close
- List item additions/removals
- Hover states
- Loading states
- Success/error feedback

### ❌ Don't Animate
- Text content
- Form inputs (except focus states)
- Static images
- Background colors (use transitions instead)

---

## Performance

### Best Practices
1. Animate `transform` and `opacity` only (GPU accelerated)
2. Avoid animating `width`, `height`, `top`, `left`
3. Use `will-change` sparingly
4. Limit simultaneous animations to 3-5 elements

### Example
```tsx
// ✅ Good - GPU accelerated
<motion.div
  animate={{ x: 100, opacity: 0.5 }}
/>

// ❌ Bad - Forces layout recalculation
<motion.div
  animate={{ left: 100, width: 200 }}
/>
```
