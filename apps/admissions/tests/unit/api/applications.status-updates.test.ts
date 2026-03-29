import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { VercelRequest, VercelResponse } from '@vercel/node';

vi.mock('../../../lib/cors', () => ({
  handleCors: vi.fn(() => false),
}));

vi.mock('../../../lib/auth/middleware', () => ({
  getAuthUser: vi.fn(async () => ({ userId: 'admin-1', role: 'admin' })),
}));

vi.mock('../../../lib/arcjet', () => ({
  withArcjetProtection: (handler: unknown) => handler,
  arcjetProtect: vi.fn(async () => ({ allowed: true })),
}));

vi.mock('../../../lib/realtimeBroker', () => ({
  publishRealtimeEvent: vi.fn(),
}));

vi.mock('../../../lib/auditLogger', () => ({
  logAuditEvent: vi.fn(async () => undefined),
}));

vi.mock('../../../lib/db', () => ({
  query: vi.fn(),
}));

import handler from '../../../api-src/applications';
import { query } from '../../../lib/db';

const mockQuery = vi.mocked(query);

function createReq(overrides: Partial<VercelRequest> = {}): VercelRequest {
  return {
    method: 'PATCH',
    query: { id: 'app-1' },
    headers: {},
    body: { action: 'update_status', status: 'approved', notes: 'ok' },
    ...overrides,
  } as unknown as VercelRequest;
}

function createRes(): VercelResponse & { _status: number; _json: any } {
  const res = {
    _status: 200,
    _json: null,
    status(code: number) {
      this._status = code;
      return this;
    },
    json(payload: any) {
      this._json = payload;
      return this;
    },
    setHeader() {
      return this;
    },
    end() {
      return this;
    },
  };
  return res as unknown as VercelResponse & { _status: number; _json: any };
}

describe('applications status/payment atomic update flows', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('approves application atomically without BEGIN/COMMIT multi-call orchestration', async () => {
    mockQuery
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ id: 'app-1', user_id: 'student-1', payment_status: 'verified', application_number: 'MIHAS000001' }],
        command: 'SELECT',
      } as any)
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ id: 'app-1', status: 'approved' }],
        command: 'SELECT',
      } as any);

    const req = createReq();
    const res = createRes();

    await handler(req, res);

    expect(res._status).toBe(200);
    expect(mockQuery).toHaveBeenCalledTimes(2);

    const sqlCalls = mockQuery.mock.calls.map((c) => String(c[0]));
    expect(sqlCalls.some((sql) => /\bBEGIN\b/i.test(sql))).toBe(false);
    expect(sqlCalls.some((sql) => /\bCOMMIT\b/i.test(sql))).toBe(false);
    expect(sqlCalls[1]).toContain('WITH updated_application AS');
    expect(sqlCalls[1]).toContain('history_insert AS');
    expect(sqlCalls[1]).toContain('notification_insert AS');
  });

  it('returns deterministic 409 body when approve notification insert fails', async () => {
    mockQuery
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ id: 'app-1', user_id: 'student-1', payment_status: 'verified', application_number: 'MIHAS000001' }],
        command: 'SELECT',
      } as any)
      .mockRejectedValueOnce(new Error('insert into notifications failed'));

    const req = createReq();
    const res = createRes();

    await handler(req, res);

    expect(res._status).toBe(409);
    expect(res._json.success).toBe(false);
    expect(res._json.error).toContain('notification persistence');
  });

  it('verifies payment atomically with notification insert', async () => {
    mockQuery
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ id: 'app-1', user_id: 'student-1', payment_status: 'pending_review', application_number: 'MIHAS000001' }],
        command: 'SELECT',
      } as any)
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ id: 'app-1', payment_status: 'verified' }],
        command: 'SELECT',
      } as any);

    const req = createReq({ body: { action: 'update_payment_status', paymentStatus: 'verified' } });
    const res = createRes();

    await handler(req, res);

    expect(res._status).toBe(200);
    const sql = String(mockQuery.mock.calls[1][0]);
    expect(sql).toContain('WITH updated_application AS');
    expect(sql).toContain('notification_insert AS');
  });

  it('rejects payment atomically with notification insert', async () => {
    mockQuery
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ id: 'app-1', user_id: 'student-1', payment_status: 'pending_review', application_number: 'MIHAS000001' }],
        command: 'SELECT',
      } as any)
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ id: 'app-1', payment_status: 'rejected' }],
        command: 'SELECT',
      } as any);

    const req = createReq({ body: { action: 'update_payment_status', paymentStatus: 'rejected' } });
    const res = createRes();

    await handler(req, res);

    expect(res._status).toBe(200);
    expect(res._json.success).toBe(true);
  });

  it('returns deterministic 409 body when payment notification insert fails', async () => {
    mockQuery
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ id: 'app-1', user_id: 'student-1', payment_status: 'pending_review', application_number: 'MIHAS000001' }],
        command: 'SELECT',
      } as any)
      .mockRejectedValueOnce(new Error('notifications insert failed'));

    const req = createReq({ body: { action: 'update_payment_status', paymentStatus: 'verified' } });
    const res = createRes();

    await handler(req, res);

    expect(res._status).toBe(409);
    expect(res._json.success).toBe(false);
    expect(res._json.error).toContain('notification persistence');
  });
});
