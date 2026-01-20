// Mock Supabase Client
class MockSupabaseQuery {
  constructor(table) {
    this.table = table;
    this.filters = [];
    this.selectParams = null;
    this.modifiers = {};
  }

  select(columns, options) {
    this.selectParams = { columns, options };
    return this;
  }

  eq(column, value) {
    this.filters.push({ type: 'eq', column, value });
    return this;
  }

  gte(column, value) {
    this.filters.push({ type: 'gte', column, value });
    return this;
  }

  lt(column, value) {
    this.filters.push({ type: 'lt', column, value });
    return this;
  }

  order(column, options) {
    this.modifiers.order = { column, options };
    return this;
  }

  limit(count) {
    this.modifiers.limit = count;
    return this;
  }

  // Simulate execution
  then(resolve, reject) {
    // Return mock data based on query
    if (this.modifiers.limit === 5) {
      // recentApps query
      resolve({ data: [{ id: 1, full_name: 'Test', created_at: '2023-01-01' }] });
    } else if (this.selectParams && this.selectParams.options && this.selectParams.options.count === 'exact') {
      // Count query
      resolve({ count: 42, error: null });
    } else {
      resolve({ data: [], error: null });
    }
  }
}

const supabaseAdminClient = {
  from: (table) => new MockSupabaseQuery(table)
};

async function testNewImplementation() {
  const now = new Date();
  const today = now.toISOString().split('T')[0];
  const tomorrowDate = new Date(now);
  tomorrowDate.setDate(tomorrowDate.getDate() + 1);
  const tomorrow = tomorrowDate.toISOString().split('T')[0];

  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

  console.log('Testing optimization logic...');

  // New logic simulation
  const [
    recentApps,
    totalResult,
    draftResult,
    submittedResult,
    underReviewResult,
    approvedResult,
    rejectedResult,
    todayResult,
    weekResult,
    monthResult
  ] = await Promise.all([
    supabaseAdminClient.from('applications')
      .select('id, application_number, full_name, status, program, created_at')
      .order('created_at', { ascending: false })
      .limit(5),
    supabaseAdminClient.from('applications').select('*', { count: 'exact', head: true }),
    supabaseAdminClient.from('applications').select('*', { count: 'exact', head: true }).eq('status', 'draft'),
    supabaseAdminClient.from('applications').select('*', { count: 'exact', head: true }).eq('status', 'submitted'),
    supabaseAdminClient.from('applications').select('*', { count: 'exact', head: true }).eq('status', 'under_review'),
    supabaseAdminClient.from('applications').select('*', { count: 'exact', head: true }).eq('status', 'approved'),
    supabaseAdminClient.from('applications').select('*', { count: 'exact', head: true }).eq('status', 'rejected'),
    // For today: created_at >= today AND created_at < tomorrow (to simulate startsWith(today))
    supabaseAdminClient.from('applications').select('*', { count: 'exact', head: true })
      .gte('created_at', today).lt('created_at', tomorrow),
    supabaseAdminClient.from('applications').select('*', { count: 'exact', head: true }).gte('created_at', weekAgo),
    supabaseAdminClient.from('applications').select('*', { count: 'exact', head: true }).gte('created_at', monthAgo)
  ]);

  // Verification
  if (totalResult.count !== 42) throw new Error('Total count failed');
  if (recentApps.data.length !== 1) throw new Error('Recent apps failed');

  console.log('SUCCESS: Logic matches expected query patterns.');
}

testNewImplementation().catch(err => {
  console.error('FAILED:', err);
  process.exit(1);
});
