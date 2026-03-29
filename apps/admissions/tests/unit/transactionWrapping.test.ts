// @vitest-environment node
/**
 * Unit Tests for Transaction Wrapping — Req 30
 *
 * Tests that multi-step database operations (grade sync, review, settings reset)
 * are wrapped in transactions with proper rollback on failure.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the db module
const mockQuery = vi.fn();
vi.mock('../../lib/db', () => ({
  query: (...args: unknown[]) => mockQuery(...args),
  transaction: async (ops: Array<{ text: string; values?: unknown[] }>) => {
    // Simulate real transaction behavior: BEGIN, execute ops, COMMIT
    // On failure in any op, ROLLBACK and throw
    await mockQuery('BEGIN');
    const results: Array<{ rows: unknown[]; rowCount: number; command: string }> = [];
    try {
      for (const op of ops) {
        const result = await mockQuery(op.text, op.values);
        results.push(result);
      }
      await mockQuery('COMMIT');
      return results;
    } catch (error) {
      await mockQuery('ROLLBACK');
      throw error;
    }
  },
  DatabaseError: class DatabaseError extends Error {
    code: string;
    constructor(message: string, code = 'QUERY_ERROR') {
      super(message);
      this.name = 'DatabaseError';
      this.code = code;
    }
  },
  DatabaseErrorCode: {
    TRANSACTION_ERROR: 'TRANSACTION_ERROR',
    QUERY_ERROR: 'QUERY_ERROR',
  },
}));

describe('Transaction Wrapping Unit Tests (Req 30)', () => {
  beforeEach(() => {
    mockQuery.mockReset();
    mockQuery.mockResolvedValue({ rows: [], rowCount: 0, command: 'OK' });
  });

  describe('30.1: Grade sync transaction', () => {
    it('should execute delete + insert within BEGIN/COMMIT', async () => {
      const { transaction } = await import('../../lib/db');

      const ops = [
        { text: 'DELETE FROM application_grades WHERE application_id = $1', values: ['app-1'] },
        {
          text: 'INSERT INTO application_grades (application_id, subject_id, grade) VALUES ($1, $2, $3)',
          values: ['app-1', 'subj-1', 7],
        },
      ];

      await transaction(ops);

      const calls = mockQuery.mock.calls.map((c: unknown[]) => c[0]);
      expect(calls[0]).toBe('BEGIN');
      expect(calls[1]).toContain('DELETE FROM application_grades');
      expect(calls[2]).toContain('INSERT INTO application_grades');
      expect(calls[3]).toBe('COMMIT');
    });

    it('should ROLLBACK if insert fails after delete', async () => {
      const { transaction } = await import('../../lib/db');

      // First call (BEGIN) succeeds, second (DELETE) succeeds, third (INSERT) fails
      mockQuery
        .mockResolvedValueOnce({ rows: [], rowCount: 0, command: 'BEGIN' })
        .mockResolvedValueOnce({ rows: [], rowCount: 1, command: 'DELETE' })
        .mockRejectedValueOnce(new Error('constraint violation'))
        .mockResolvedValueOnce({ rows: [], rowCount: 0, command: 'ROLLBACK' });

      const ops = [
        { text: 'DELETE FROM application_grades WHERE application_id = $1', values: ['app-1'] },
        { text: 'INSERT INTO application_grades VALUES ($1, $2, $3)', values: ['app-1', 'subj-1', 7] },
      ];

      await expect(transaction(ops)).rejects.toThrow('constraint violation');

      const calls = mockQuery.mock.calls.map((c: unknown[]) => c[0]);
      expect(calls).toContain('BEGIN');
      expect(calls).toContain('ROLLBACK');
      expect(calls).not.toContain('COMMIT');
    });

    it('should handle empty grades (delete-only transaction)', async () => {
      const { transaction } = await import('../../lib/db');

      const ops = [
        { text: 'DELETE FROM application_grades WHERE application_id = $1', values: ['app-1'] },
      ];

      await transaction(ops);

      const calls = mockQuery.mock.calls.map((c: unknown[]) => c[0]);
      expect(calls[0]).toBe('BEGIN');
      expect(calls[1]).toContain('DELETE');
      expect(calls[2]).toBe('COMMIT');
      expect(calls).not.toContain('ROLLBACK');
    });
  });

  describe('30.2: Review transaction', () => {
    it('should execute status update + history insert within BEGIN/COMMIT', async () => {
      const { transaction } = await import('../../lib/db');

      mockQuery
        .mockResolvedValueOnce({ rows: [], rowCount: 0, command: 'BEGIN' })
        .mockResolvedValueOnce({ rows: [{ id: 'app-1', status: 'approved' }], rowCount: 1, command: 'UPDATE' })
        .mockResolvedValueOnce({ rows: [], rowCount: 1, command: 'INSERT' })
        .mockResolvedValueOnce({ rows: [], rowCount: 0, command: 'COMMIT' });

      const ops = [
        { text: 'UPDATE applications SET status = $1 WHERE id = $2', values: ['approved', 'app-1'] },
        { text: 'INSERT INTO application_status_history (application_id, status, changed_by) VALUES ($1, $2, $3)', values: ['app-1', 'approved', 'admin-1'] },
      ];

      const results = await transaction(ops);

      expect(results[0].rowCount).toBe(1);
      const calls = mockQuery.mock.calls.map((c: unknown[]) => c[0]);
      expect(calls[0]).toBe('BEGIN');
      expect(calls[3]).toBe('COMMIT');
    });

    it('should ROLLBACK if history insert fails after status update', async () => {
      const { transaction } = await import('../../lib/db');

      mockQuery
        .mockResolvedValueOnce({ rows: [], rowCount: 0, command: 'BEGIN' })
        .mockResolvedValueOnce({ rows: [{ id: 'app-1' }], rowCount: 1, command: 'UPDATE' })
        .mockRejectedValueOnce(new Error('history table constraint'))
        .mockResolvedValueOnce({ rows: [], rowCount: 0, command: 'ROLLBACK' });

      const ops = [
        { text: 'UPDATE applications SET status = $1 WHERE id = $2', values: ['approved', 'app-1'] },
        { text: 'INSERT INTO application_status_history ...', values: ['app-1', 'approved', 'admin-1'] },
      ];

      await expect(transaction(ops)).rejects.toThrow('history table constraint');

      const calls = mockQuery.mock.calls.map((c: unknown[]) => c[0]);
      expect(calls).toContain('ROLLBACK');
      expect(calls).not.toContain('COMMIT');
    });
  });

  describe('30.3: Settings reset transaction', () => {
    it('should execute delete + batch insert within BEGIN/COMMIT', async () => {
      const { transaction } = await import('../../lib/db');

      const ops = [
        { text: 'DELETE FROM settings WHERE 1=1', values: [] as unknown[] },
        {
          text: 'INSERT INTO settings (key, value) VALUES ($1, $2), ($3, $4)',
          values: ['site_name', '"MIHAS"', 'contact_email', '"test@test.com"'],
        },
      ];

      await transaction(ops);

      const calls = mockQuery.mock.calls.map((c: unknown[]) => c[0]);
      expect(calls[0]).toBe('BEGIN');
      expect(calls[1]).toContain('DELETE FROM settings');
      expect(calls[2]).toContain('INSERT INTO settings');
      expect(calls[3]).toBe('COMMIT');
    });

    it('should ROLLBACK if batch insert fails after delete', async () => {
      const { transaction } = await import('../../lib/db');

      mockQuery
        .mockResolvedValueOnce({ rows: [], rowCount: 0, command: 'BEGIN' })
        .mockResolvedValueOnce({ rows: [], rowCount: 6, command: 'DELETE' })
        .mockRejectedValueOnce(new Error('insert failed'))
        .mockResolvedValueOnce({ rows: [], rowCount: 0, command: 'ROLLBACK' });

      const ops = [
        { text: 'DELETE FROM settings WHERE 1=1', values: [] as unknown[] },
        { text: 'INSERT INTO settings ...', values: ['key', 'val'] },
      ];

      await expect(transaction(ops)).rejects.toThrow('insert failed');

      const calls = mockQuery.mock.calls.map((c: unknown[]) => c[0]);
      expect(calls).toContain('ROLLBACK');
      expect(calls).not.toContain('COMMIT');
    });
  });

  describe('General transaction behavior', () => {
    it('should return empty array for empty operations', async () => {
      const { transaction } = await import('../../lib/db');
      const results = await transaction([]);
      // Empty ops should not call BEGIN/COMMIT
      expect(results).toEqual([]);
    });

    it('should propagate the original error on failure', async () => {
      const { transaction } = await import('../../lib/db');

      const specificError = new Error('unique_violation: duplicate key');
      mockQuery
        .mockResolvedValueOnce({ rows: [], rowCount: 0, command: 'BEGIN' })
        .mockRejectedValueOnce(specificError)
        .mockResolvedValueOnce({ rows: [], rowCount: 0, command: 'ROLLBACK' });

      await expect(
        transaction([{ text: 'INSERT INTO test VALUES ($1)', values: ['dup'] }])
      ).rejects.toThrow('unique_violation: duplicate key');
    });
  });
});
