/**
 * Unit tests for shared CSS animation utilities
 * @see src/lib/animations.ts
 */
import { describe, it, expect } from 'vitest';
import {
  fadeIn,
  slideUp,
  scaleIn,
  staggerChild,
  animateClasses,
  initialStates,
  visibleStates,
} from '@/lib/animations';

describe('CSS Animation Utilities', () => {
  describe('fadeIn', () => {
    it('should include transition-opacity class', () => {
      expect(fadeIn).toContain('transition-opacity');
    });

    it('should include duration and easing', () => {
      expect(fadeIn).toContain('duration-240');
      expect(fadeIn).toContain('ease-smooth-out');
    });
  });

  describe('slideUp', () => {
    it('should include targeted transition and transform classes', () => {
      expect(slideUp).toContain('transition-[transform,opacity]');
      expect(slideUp).toContain('transform');
    });

    it('should include duration and easing', () => {
      expect(slideUp).toContain('duration-240');
      expect(slideUp).toContain('ease-smooth-out');
    });
  });

  describe('scaleIn', () => {
    it('should include targeted transition and transform classes', () => {
      expect(scaleIn).toContain('transition-[transform,opacity]');
      expect(scaleIn).toContain('transform');
    });

    it('should include duration and easing', () => {
      expect(scaleIn).toContain('duration-200');
      expect(scaleIn).toContain('ease-smooth-out');
    });
  });

  describe('staggerChild', () => {
    it('should return an object with animationDelay for index 0', () => {
      const style = staggerChild(0);
      expect(style.animationDelay).toBe('0ms');
      expect(style.animationFillMode).toBe('forwards');
    });

    it('should calculate delay based on index with default 50ms base', () => {
      expect(staggerChild(1).animationDelay).toBe('50ms');
      expect(staggerChild(2).animationDelay).toBe('100ms');
      expect(staggerChild(5).animationDelay).toBe('250ms');
    });

    it('should accept a custom base delay', () => {
      expect(staggerChild(1, 100).animationDelay).toBe('100ms');
      expect(staggerChild(3, 100).animationDelay).toBe('300ms');
    });

    it('should always set animationFillMode to forwards', () => {
      expect(staggerChild(0).animationFillMode).toBe('forwards');
      expect(staggerChild(10).animationFillMode).toBe('forwards');
      expect(staggerChild(3, 200).animationFillMode).toBe('forwards');
    });
  });

  describe('animateClasses', () => {
    it('should map to correct Tailwind animate-* classes', () => {
      expect(animateClasses.fadeIn).toBe('animate-fade-in');
      expect(animateClasses.slideUp).toBe('animate-slide-up');
      expect(animateClasses.scaleIn).toBe('animate-scale-in');
    });
  });

  describe('initialStates', () => {
    it('should define hidden state with opacity-0', () => {
      expect(initialStates.hidden).toContain('opacity-0');
    });

    it('should define below state with translate-y and opacity', () => {
      expect(initialStates.below).toContain('opacity-0');
      expect(initialStates.below).toContain('translate-y-5');
    });

    it('should define small state with scale and opacity', () => {
      expect(initialStates.small).toContain('opacity-0');
      expect(initialStates.small).toContain('scale-95');
    });
  });

  describe('visibleStates', () => {
    it('should define shown state with full opacity', () => {
      expect(visibleStates.shown).toContain('opacity-100');
    });

    it('should define inPlace state with translate-y-0 and opacity', () => {
      expect(visibleStates.inPlace).toContain('opacity-100');
      expect(visibleStates.inPlace).toContain('translate-y-0');
    });

    it('should define fullSize state with scale-100 and opacity', () => {
      expect(visibleStates.fullSize).toContain('opacity-100');
      expect(visibleStates.fullSize).toContain('scale-100');
    });
  });
});
