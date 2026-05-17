// @vitest-environment node
/**
 * Unit tests for computeApplicationStats
 *
 * Validates Requirements 19.1, 19.2, 19.3, 19.4, 19.5
 */
import { describe, it, expect } from 'vitest';
import { computeApplicationStats } from '../../src/lib/applicationStats';

describe('computeApplicationStats', () => {
  it('counts in-progress applications across the current lifecycle', () => {
    const apps = [
      { status: 'draft' },
      { status: 'submitted' },
      { status: 'under_review' },
      { status: 'conditionally_approved' },
      { status: 'waitlisted' },
      { status: 'approved' },
    ];
    const stats = computeApplicationStats(apps);
    expect(stats.inProgress).toBe(5);
  });

  it('counts terminal applications across the current lifecycle', () => {
    const apps = [
      { status: 'approved' },
      { status: 'rejected' },
      { status: 'enrolled' },
      { status: 'withdrawn' },
      { status: 'expired' },
      { status: 'enrollment_expired' },
      { status: 'draft' },
    ];
    const stats = computeApplicationStats(apps);
    expect(stats.completed).toBe(6);
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

  it('leaves unknown future statuses uncategorized', () => {
    const apps = [
      { status: 'interview_scheduled' },
    ];
    const stats = computeApplicationStats(apps);
    expect(stats.inProgress).toBe(0);
    expect(stats.completed).toBe(0);
    expect(stats.total).toBe(1);
  });

  it('handles mixed current lifecycle statuses correctly', () => {
    const apps = [
      { status: 'draft' },
      { status: 'submitted' },
      { status: 'under_review' },
      { status: 'conditionally_approved' },
      { status: 'waitlisted' },
      { status: 'approved' },
      { status: 'enrolled' },
      { status: 'rejected' },
    ];
    const stats = computeApplicationStats(apps);
    expect(stats.inProgress).toBe(5);
    expect(stats.completed).toBe(3);
    expect(stats.total).toBe(8);
  });
});
