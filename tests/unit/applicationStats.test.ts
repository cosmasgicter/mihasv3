// @vitest-environment node
/**
 * Unit tests for computeApplicationStats
 *
 * Validates Requirements 19.1, 19.2, 19.3, 19.4, 19.5
 */
import { describe, it, expect } from 'vitest';
import { computeApplicationStats } from '../../src/lib/applicationStats';

describe('computeApplicationStats', () => {
  it('counts in-progress applications (draft + submitted)', () => {
    const apps = [
      { status: 'draft' },
      { status: 'submitted' },
      { status: 'approved' },
    ];
    const stats = computeApplicationStats(apps);
    expect(stats.inProgress).toBe(2);
  });

  it('counts completed applications (approved + rejected + waitlisted)', () => {
    const apps = [
      { status: 'approved' },
      { status: 'rejected' },
      { status: 'waitlisted' },
      { status: 'draft' },
    ];
    const stats = computeApplicationStats(apps);
    expect(stats.completed).toBe(3);
  });

  it('returns total count of all applications', () => {
    const apps = [
      { status: 'draft' },
      { status: 'under_review' },
      { status: 'approved' },
    ];
    const stats = computeApplicationStats(apps);
    expect(stats.total).toBe(3);
  });

  it('returns all zeros for empty array (Req 19.4)', () => {
    const stats = computeApplicationStats([]);
    expect(stats.inProgress).toBe(0);
    expect(stats.completed).toBe(0);
    expect(stats.total).toBe(0);
  });

  it('handles statuses that are neither in-progress nor completed', () => {
    const apps = [
      { status: 'under_review' },
      { status: 'interview_scheduled' },
    ];
    const stats = computeApplicationStats(apps);
    expect(stats.inProgress).toBe(0);
    expect(stats.completed).toBe(0);
    expect(stats.total).toBe(2);
  });

  it('handles mixed statuses correctly', () => {
    const apps = [
      { status: 'draft' },
      { status: 'submitted' },
      { status: 'under_review' },
      { status: 'approved' },
      { status: 'rejected' },
      { status: 'waitlisted' },
    ];
    const stats = computeApplicationStats(apps);
    expect(stats.inProgress).toBe(2);
    expect(stats.completed).toBe(3);
    expect(stats.total).toBe(6);
  });
});
