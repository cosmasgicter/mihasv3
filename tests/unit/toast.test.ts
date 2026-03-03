import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useToastStore } from '../../src/components/ui/Toast';

describe('Toast Store', () => {
  beforeEach(() => {
    // Reset store between tests
    useToastStore.setState({ toasts: [] });
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('adds a success toast with correct type and title', () => {
    useToastStore.getState().success('Saved');
    const toasts = useToastStore.getState().toasts;
    expect(toasts).toHaveLength(1);
    expect(toasts[0].type).toBe('success');
    expect(toasts[0].title).toBe('Saved');
  });

  it('adds an error toast with correct type and title', () => {
    useToastStore.getState().error('Failed');
    const toasts = useToastStore.getState().toasts;
    expect(toasts).toHaveLength(1);
    expect(toasts[0].type).toBe('error');
    expect(toasts[0].title).toBe('Failed');
  });

  it('adds a warning toast', () => {
    useToastStore.getState().warning('Careful');
    const toasts = useToastStore.getState().toasts;
    expect(toasts).toHaveLength(1);
    expect(toasts[0].type).toBe('warning');
    expect(toasts[0].title).toBe('Careful');
  });

  it('adds an info toast', () => {
    useToastStore.getState().info('FYI');
    const toasts = useToastStore.getState().toasts;
    expect(toasts).toHaveLength(1);
    expect(toasts[0].type).toBe('info');
    expect(toasts[0].title).toBe('FYI');
  });

  it('adds an error toast with retry action via errorWithRetry', () => {
    const retryFn = vi.fn();
    useToastStore.getState().errorWithRetry('Network error', retryFn, 'Please try again');
    const toasts = useToastStore.getState().toasts;
    expect(toasts).toHaveLength(1);
    expect(toasts[0].type).toBe('error');
    expect(toasts[0].title).toBe('Network error');
    expect(toasts[0].message).toBe('Please try again');
    expect(toasts[0].action).toBeDefined();
    expect(toasts[0].action!.label).toBe('Retry');

    // Invoke the retry callback
    toasts[0].action!.onClick();
    expect(retryFn).toHaveBeenCalledOnce();
  });

  it('supports legacy addToast(type, message) signature', () => {
    useToastStore.getState().addToast('error', 'Something broke');
    const toasts = useToastStore.getState().toasts;
    expect(toasts).toHaveLength(1);
    expect(toasts[0].type).toBe('error');
    expect(toasts[0].title).toBe('Something broke');
  });

  it('supports object addToast({ type, title, message }) signature', () => {
    useToastStore.getState().addToast({
      type: 'info',
      title: 'Heads up',
      message: 'Something happened',
    });
    const toasts = useToastStore.getState().toasts;
    expect(toasts).toHaveLength(1);
    expect(toasts[0].type).toBe('info');
    expect(toasts[0].title).toBe('Heads up');
    expect(toasts[0].message).toBe('Something happened');
  });

  it('supports object addToast with action', () => {
    const onClick = vi.fn();
    useToastStore.getState().addToast({
      type: 'error',
      title: 'Failed',
      action: { label: 'Retry', onClick },
    });
    const toasts = useToastStore.getState().toasts;
    expect(toasts[0].action).toBeDefined();
    expect(toasts[0].action!.label).toBe('Retry');
    toasts[0].action!.onClick();
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('removes a toast by id', () => {
    useToastStore.getState().success('One');
    useToastStore.getState().success('Two');
    expect(useToastStore.getState().toasts).toHaveLength(2);

    const firstId = useToastStore.getState().toasts[0].id;
    useToastStore.getState().removeToast(firstId);
    expect(useToastStore.getState().toasts).toHaveLength(1);
    expect(useToastStore.getState().toasts[0].title).toBe('Two');
  });

  it('auto-dismisses success toasts after default duration', () => {
    useToastStore.getState().success('Temporary');
    expect(useToastStore.getState().toasts).toHaveLength(1);

    vi.advanceTimersByTime(5000);
    expect(useToastStore.getState().toasts).toHaveLength(0);
  });

  it('auto-dismisses error toasts after extended duration', () => {
    useToastStore.getState().error('Error');
    expect(useToastStore.getState().toasts).toHaveLength(1);

    // Should still be visible at 5s
    vi.advanceTimersByTime(5000);
    expect(useToastStore.getState().toasts).toHaveLength(1);

    // Should be gone at 8s
    vi.advanceTimersByTime(3000);
    expect(useToastStore.getState().toasts).toHaveLength(0);
  });

  it('generates unique ids for each toast', () => {
    useToastStore.getState().success('A');
    useToastStore.getState().success('B');
    useToastStore.getState().error('C');
    const ids = useToastStore.getState().toasts.map((t) => t.id);
    expect(new Set(ids).size).toBe(3);
  });
});
