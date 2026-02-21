import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  extractApplicationFromEnvelope,
  useDocumentGeneration,
} from '@/hooks/useDocumentGeneration';
import { generateApplicationSlip } from '@/lib/applicationSlip';
import { generateAcceptanceLetter } from '@/lib/acceptanceLetterGenerator';
import { generatePaymentReceipt } from '@/lib/receiptGenerator';

vi.mock('@/lib/applicationSlip', () => ({
  generateApplicationSlip: vi.fn(async () => new Blob(['slip'])),
}));

vi.mock('@/lib/acceptanceLetterGenerator', () => ({
  generateAcceptanceLetter: vi.fn(async () => new Blob(['acceptance'])),
}));

vi.mock('@/lib/receiptGenerator', () => ({
  generatePaymentReceipt: vi.fn(async () => new Blob(['receipt'])),
}));

type HookApi = ReturnType<typeof useDocumentGeneration>;

const baseApplication = {
  application_number: 'APP-001',
  public_tracking_code: 'TRK-001',
  status: 'approved',
  payment_status: 'verified',
  submitted_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-02T00:00:00.000Z',
  program: 'Computer Science',
  intake: 'Fall',
  institution: 'MIHAS',
  full_name: 'Jane Doe',
  email: 'jane@example.com',
  phone: '+260000000000',
};

async function setupHook() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root: Root = createRoot(container);

  let api: HookApi | null = null;

  function Harness() {
    api = useDocumentGeneration();
    return null;
  }

  await act(async () => {
    root.render(<Harness />);
  });

  return {
    getApi: () => {
      if (!api) {
        throw new Error('Hook API not initialized');
      }
      return api;
    },
    cleanup: async () => {
      await act(async () => {
        root.unmount();
      });
      container.remove();
    },
  };
}

describe('useDocumentGeneration payload handling', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn(() => 'blob:mock-url'),
      revokeObjectURL: vi.fn(),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('extracts application from nested envelope format', () => {
    const app = extractApplicationFromEnvelope(
      { success: true, data: { application: baseApplication } },
      '/api/applications?id=1'
    );

    expect(app).toEqual(baseApplication);
  });

  it('extracts application from legacy root-level format', () => {
    const app = extractApplicationFromEnvelope(
      { application: baseApplication },
      '/api/applications?id=1'
    );

    expect(app).toEqual(baseApplication);
  });

  it('logs endpoint and payload shape for malformed payloads', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    expect(() =>
      extractApplicationFromEnvelope({ success: true, data: {} }, '/api/applications?id=abc')
    ).toThrow('No application data received');

    expect(errorSpy).toHaveBeenCalledWith(
      '[useDocumentGeneration] Malformed payload: missing application object',
      expect.objectContaining({
        endpoint: '/api/applications?id=abc',
        responseShape: expect.objectContaining({
          topLevelKeys: ['success', 'data'],
          dataKeys: [],
          hasApplicationAtRoot: false,
          hasApplicationInData: false,
        }),
      })
    );
  });

  it('validates and generates slip using nested application envelope', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, data: { application: baseApplication } }),
    });

    const { getApi, cleanup } = await setupHook();

    await act(async () => {
      const ok = await getApi().generateDocument('slip', '1');
      expect(ok).toBe(true);
    });

    expect(generateApplicationSlip).toHaveBeenCalledWith(
      expect.objectContaining({
        application_number: 'APP-001',
        public_tracking_code: 'TRK-001',
      })
    );

    await cleanup();
  });

  it('validates and generates acceptance letter using legacy payload envelope', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ application: baseApplication }),
    });

    const { getApi, cleanup } = await setupHook();

    await act(async () => {
      const ok = await getApi().generateDocument('acceptance', '2');
      expect(ok).toBe(true);
    });

    expect(generateAcceptanceLetter).toHaveBeenCalledWith(
      expect.objectContaining({
        applicationNumber: 'APP-001',
        studentName: 'Jane Doe',
      })
    );

    await cleanup();
  });

  it('validates and generates receipt path payload before receipt fetch', async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: { application: baseApplication } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: { receiptNumber: 'RCT-001' } }),
      });

    const { getApi, cleanup } = await setupHook();

    await act(async () => {
      const ok = await getApi().generateDocument('receipt', '3');
      expect(ok).toBe(true);
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('/api/applications?id=3'),
      expect.any(Object)
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('/api/payments?action=receipt&applicationId=3'),
      expect.any(Object)
    );
    expect(generatePaymentReceipt).toHaveBeenCalledWith({ receiptNumber: 'RCT-001' });

    await cleanup();
  });
});
