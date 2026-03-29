import { useState, useEffect, useRef, useCallback } from 'react'
import { cn } from '@/lib/utils'

/**
 * LogoAnimation Component - Lightweight character-shuffle effect
 *
 * A performant logo animation that uses requestAnimationFrame
 * for a character-shuffle/scramble effect. Respects prefers-reduced-motion
 * and is non-blocking to page rendering.
 *
 * @see Requirements 8.1, 8.2, 8.3, 8.4
 *
 * Features:
 * - Lightweight character-shuffle effect (no framer-motion)
 * - Respects prefers-reduced-motion media query
 * - Non-blocking implementation using requestAnimationFrame
 * - Minimal performance impact
 * - Customizable duration, character set, and styling
 */

/** Characters used for the shuffle/scramble effect */
const DEFAULT_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'

export interface LogoAnimationProps {
  /** The text to animate */
  text: string
  /** Animation duration in milliseconds (default: 1000) */
  duration?: number
  /** Additional CSS class names */
  className?: string
  /** Character set used for the shuffle effect */
  chars?: string
  /** Callback fired when the animation completes */
  onComplete?: () => void
}

/**
 * Returns whether the user prefers reduced motion.
 * Safe for SSR — returns true (no animation) when window is unavailable.
 */
function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return true
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/**
 * LogoAnimation – a lightweight character-shuffle text reveal.
 *
 * The component cycles through random characters before resolving each
 * position to the final text, left-to-right. The effect is driven
 * entirely by `requestAnimationFrame` so it never blocks the main
 * thread and has zero impact on page performance metrics.
 *
 * When the user has `prefers-reduced-motion: reduce` enabled the
 * animation is skipped and the final text is rendered immediately.
 */
export function LogoAnimation({
  text,
  duration = 1000,
  className,
  chars = DEFAULT_CHARS,
  onComplete,
}: LogoAnimationProps) {
  const [displayText, setDisplayText] = useState<string>(() =>
    prefersReducedMotion() ? text : ''
  )
  const frameRef = useRef<number | null>(null)
  const startTimeRef = useRef<number | null>(null)
  const completedRef = useRef(false)

  const animate = useCallback(
    (timestamp: number) => {
      if (startTimeRef.current === null) {
        startTimeRef.current = timestamp
      }

      const elapsed = timestamp - startTimeRef.current
      const progress = Math.min(elapsed / duration, 1)

      // Number of characters that have "resolved" to their final value
      const resolvedCount = Math.floor(progress * text.length)

      const nextText = text
        .split('')
        .map((char, i) => {
          // Already resolved — show the real character
          if (i < resolvedCount) return char
          // Preserve whitespace so layout doesn't jump
          if (char === ' ') return ' '
          // Still shuffling — pick a random character
          return chars[Math.floor(Math.random() * chars.length)]
        })
        .join('')

      setDisplayText(nextText)

      if (progress < 1) {
        frameRef.current = requestAnimationFrame(animate)
      } else {
        // Ensure the final text is exactly correct
        setDisplayText(text)
        completedRef.current = true
        onComplete?.()
      }
    },
    [text, duration, chars, onComplete],
  )

  useEffect(() => {
    // Respect reduced-motion preference — render final text immediately
    if (prefersReducedMotion()) {
      setDisplayText(text)
      completedRef.current = true
      onComplete?.()
      return
    }

    // Reset state for a new animation cycle
    completedRef.current = false
    startTimeRef.current = null
    frameRef.current = requestAnimationFrame(animate)

    return () => {
      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current)
        frameRef.current = null
      }
    }
  }, [text, animate, onComplete])

  return (
    <span
      className={cn('inline-block', className)}
      aria-label={text}
      role="text"
    >
      {displayText}
    </span>
  )
}
