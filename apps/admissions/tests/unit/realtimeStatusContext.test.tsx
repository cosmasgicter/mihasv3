/**
 * Unit tests for RealtimeStatusContext
 * 
 * Verifies:
 * - Context provides correct typed status values ('connected' | 'reconnecting' | 'disconnected')
 * - Status updates correctly from SSE events
 * - Default values when used outside provider
 * 
 * @requirements 5.5
 */

import React, { useState, useEffect } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import {
  RealtimeStatusProvider,
  useRealtimeStatus,
  dispatchSSEStatus,
} from '@/contexts/RealtimeStatusContext';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

describe('RealtimeStatusContext', () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(() => {
    vi.useFakeTimers();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.useRealTimers();
  });

  /** Helper component that renders status values */
  function StatusDisplay() {
    const { status, isConnected, isReconnecting } = useRealtimeStatus();
    return (
      <div>
        <span data-testid="status">{status}</span>
        <span data-testid="connected">{String(isConnected)}</span>
        <span data-testid="reconnecting">{String(isReconnecting)}</span>
      </div>
    );
  }

  function getTestId(id: string): string {
    return container.querySelector(`[data-testid="${id}"]`)?.textContent ?? '';
  }

  it('should provide default disconnected status', () => {
    act(() => {
      root.render(
        <RealtimeStatusProvider>
          <StatusDisplay />
        </RealtimeStatusProvider>
      );
    });

    expect(getTestId('status')).toBe('disconnected');
    expect(getTestId('connected')).toBe('false');
    expect(getTestId('reconnecting')).toBe('false');
  });

  it('should return default values when used outside provider', () => {
    act(() => {
      root.render(<StatusDisplay />);
    });

    expect(getTestId('status')).toBe('disconnected');
    expect(getTestId('connected')).toBe('false');
    expect(getTestId('reconnecting')).toBe('false');
  });

  it('should update to connected status on SSE connected event', () => {
    act(() => {
      root.render(
        <RealtimeStatusProvider>
          <StatusDisplay />
        </RealtimeStatusProvider>
      );
    });

    act(() => {
      dispatchSSEStatus({ connected: true, status: 'connected' });
      // Advance past debounce timer (300ms)
      vi.advanceTimersByTime(350);
    });

    expect(getTestId('status')).toBe('connected');
    expect(getTestId('connected')).toBe('true');
    expect(getTestId('reconnecting')).toBe('false');
  });

  it('should update to reconnecting status on SSE connecting event', () => {
    act(() => {
      root.render(
        <RealtimeStatusProvider>
          <StatusDisplay />
        </RealtimeStatusProvider>
      );
    });

    act(() => {
      dispatchSSEStatus({ connected: false, status: 'connecting' });
      vi.advanceTimersByTime(350);
    });

    expect(getTestId('status')).toBe('reconnecting');
    expect(getTestId('connected')).toBe('false');
    expect(getTestId('reconnecting')).toBe('true');
  });

  it('should update to disconnected on SSE disconnected event', () => {
    act(() => {
      root.render(
        <RealtimeStatusProvider>
          <StatusDisplay />
        </RealtimeStatusProvider>
      );
    });

    // First connect
    act(() => {
      dispatchSSEStatus({ connected: true, status: 'connected' });
      vi.advanceTimersByTime(350);
    });
    expect(getTestId('status')).toBe('connected');

    // Then disconnect
    act(() => {
      dispatchSSEStatus({ connected: false, status: 'disconnected' });
      vi.advanceTimersByTime(350);
    });

    expect(getTestId('status')).toBe('disconnected');
    expect(getTestId('connected')).toBe('false');
  });

  it('should map error status to disconnected', () => {
    act(() => {
      root.render(
        <RealtimeStatusProvider>
          <StatusDisplay />
        </RealtimeStatusProvider>
      );
    });

    act(() => {
      dispatchSSEStatus({ connected: false, status: 'error' });
      vi.advanceTimersByTime(350);
    });

    expect(getTestId('status')).toBe('disconnected');
    expect(getTestId('connected')).toBe('false');
  });

  it('should only expose valid RealtimeConnectionStatus values', () => {
    const validStatuses = ['connected', 'reconnecting', 'disconnected'];

    act(() => {
      root.render(
        <RealtimeStatusProvider>
          <StatusDisplay />
        </RealtimeStatusProvider>
      );
    });

    expect(validStatuses).toContain(getTestId('status'));
  });
});
