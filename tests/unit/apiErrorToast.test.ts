import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useToastStore } from '../../src/components/ui/Toast';
import { showApiErrorToast, withErrorToast } from '../../src/lib/apiErrorToast';

describe('showApiErrorToast', () => {
  beforeEach(() => {
    useToastStore.setState({ toasts: [] });
  });

  it('shows an error toast with the error message', () => {
    showApiErrorToast(new Error('Server error. Please try again later.'));
    const toasts = useToastStore.getState().toasts;
    expect(toasts).toHaveLength(1);
    expect(toasts[0].type).toBe('error');
    expect(toasts[0].message).toBe('Server error. Please try again later.');
  });

  it('shows a generic message for non-Error values', () => {
    showApiErrorToast('something');
    const toasts = useToastStore.getState().toasts;
    expect(toasts[0].message).toBe('An unexpected error occurred. Please try again.');
  });

  it('includes retry action for retryable network errors', () => {
    const retryFn = vi.fn();
    showApiErrorToast(
      new Error('Network connection issue. Please check your internet and try again.'),
      retryFn
    );
    const toasts = useToastStore.getState().toasts;
    expect(toasts[0].action).toBeDefined();
    expect(toasts[0].action!.label).toBe('Retry');
    toasts[0].action!.onClick();
    expect(retryFn).toHaveBeenCalledOnce();
  });

  it('does not include retry action for non-retryable errors', () => {
    const retryFn = vi.fn();
    showApiErrorToast(new Error('Access denied. You do not have permission for this action.'), retryFn);
    const toasts = useToastStore.getState().toasts;
    expect(toasts[0].action).toBeUndefined();
  });
});

describe('withErrorToast', () => {
  beforeEach(() => {
    useToastStore.setState({ toasts: [] });
  });

  it('returns the result on success', async () => {
    const result = await withErrorToast(() => Promise.resolve({ data: 42 }));
    expect(result).toEqual({ data: 42 });
    expect(useToastStore.getState().toasts).toHaveLength(0);
  });

  it('shows a toast and returns null on failure', async () => {
    const result = await withErrorToast(() =>
      Promise.reject(new Error('Server error. Please try again later.'))
    );
    expect(result).toBeNull();
    expect(useToastStore.getState().toasts).toHaveLength(1);
    expect(useToastStore.getState().toasts[0].type).toBe('error');
  });

  it('includes retry action for retryable errors when onRetry is provided', async () => {
    const retryFn = vi.fn();
    await withErrorToast(
      () => Promise.reject(new Error('Service temporarily unavailable. Please try again in a moment.')),
      retryFn
    );
    const toasts = useToastStore.getState().toasts;
    expect(toasts[0].action).toBeDefined();
    expect(toasts[0].action!.label).toBe('Retry');
  });
});
