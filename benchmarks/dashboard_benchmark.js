import { onRequestGet } from '../functions/admin/dashboard.js';
import { supabaseAdminClient } from '../functions/_lib/supabaseClient.js';

// Mock request and context
const request = {
  method: 'GET',
  headers: {
    get: (key) => {
      if (key === 'Authorization') return 'Bearer mock_token';
      return null;
    }
  }
};

const context = { request };

// Mock getUserFromRequest since we don't have a valid token
// We need to override the import, but since we are in ES modules, that's hard.
// Instead, we can try to rely on the fact that if the token is invalid, it returns 401.
// But we want to test the DB performance, so we need to bypass auth or have a valid token.

// Or we can just benchmark the specific query logic by copying it here.
// This is probably better to isolate the query performance.

async function runBenchmark() {
  console.log('Starting benchmark...');
  const start = performance.now();

  const now = new Date();
  const today = now.toISOString().split('T')[0];
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

  // Baseline implementation
  const [allApps, recentApps] = await Promise.all([
    supabaseAdminClient.from('applications').select('status, created_at'),
    supabaseAdminClient.from('applications').select('id, application_number, full_name, status, program, created_at').order('created_at', { ascending: false }).limit(5)
  ]);

  const apps = allApps.data || [];
  const totalCount = apps.length;
  const draftCount = apps.filter(a => a.status === 'draft').length;
  const submittedCount = apps.filter(a => a.status === 'submitted').length;
  const underReviewCount = apps.filter(a => a.status === 'under_review').length;
  const approvedCount = apps.filter(a => a.status === 'approved').length;
  const rejectedCount = apps.filter(a => a.status === 'rejected').length;
  const todayCount = apps.filter(a => a.created_at && a.created_at.startsWith(today)).length;
  const weekCount = apps.filter(a => a.created_at && a.created_at >= weekAgo).length;

  const monthCount = apps.filter(a => a.created_at && a.created_at >= monthAgo).length;

  const end = performance.now();
  console.log(`Baseline execution time: ${(end - start).toFixed(2)}ms`);
  console.log('Counts:', {
    total: totalCount,
    draft: draftCount,
    submitted: submittedCount,
    approved: approvedCount,
    rejected: rejectedCount
  });
}

runBenchmark().catch(console.error);
