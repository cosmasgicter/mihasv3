import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useToastStore, _clearRecentToasts } from '../../src/components/ui/Toast';
import { showApiErrorToast, withErrorToast } from '../../src/lib/apiErrorToast';

describe('showApiErrorToast', () => {
  beforeEach(() => {
    useToastStore.setState({ toasts: [] });
    _clearRecentToasts();
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

  it('maps known error codes to user-friendly messages (Req 16.2)', () => {
    const error = Object.assign(new Error('raw msg'), { code: 'RATE_LIMIT_EXCEEDED' });
    showApiErrorToast(error);
    const toasts = useToastStore.getState().toasts;
    expect(toasts[0].message).toBe('Too many requests. Please wait a moment.');
  });

  it('shows network error message with retry for fetch failures (Req 16.3)', () => {
    const retryFn = vi.fn();
    showApiErrorToast(new TypeError('Failed to fetch'), retryFn);
    const toasts = useToastStore.getState().toasts;
    expect(toasts[0].title).toBe('Connection error');
    expect(toasts[0].message).toContain('Connection error');
    expect(toasts[0].action).toBeDefined();
    expect(toasts[0].action!.label).toBe('Retry');
  });

  it('shows network error without retry when no callback provided', () => {
    showApiErrorToast(new TypeError('Failed to fetch'));
    const toasts = useToastStore.getState().toasts;
    expect(toasts[0].title).toBe('Connection error');
    expect(toasts[0].action).toBeUndefined();
  });

  it('falls back to raw message when error code is unknown', () => {
    const error = Object.assign(new Error('Something specific'), { code: 'UNKNOWN_CODE_XYZ' });
    showApiErrorToast(error);
    const toasts = useToastStore.getState().toasts;
    expect(toasts[0].message).toBe('Something specific');
  });
});

describe('withErrorToast', () => {
  beforeEach(() => {
    useToastStore.setState({ toasts: [] });
    _clearRecentToasts();
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
