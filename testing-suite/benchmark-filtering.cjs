const { performance } = require('perf_hooks');

// Mock Application data generator
function generateApplications(count) {
  const statuses = ['draft', 'submitted', 'under_review', 'approved', 'rejected'];
  const paymentStatuses = ['pending_review', 'verified', 'rejected', null];

  return Array.from({ length: count }, (_, i) => ({
    id: `app-${i}`,
    status: statuses[Math.floor(Math.random() * statuses.length)],
    payment_status: paymentStatuses[Math.floor(Math.random() * paymentStatuses.length)],
    // ... other fields not needed for this benchmark
  }));
}

// The logic to benchmark
function runFiltering(applications, hasDraft) {
  // Original logic
  const draftApplications = applications.filter(app => app.status === 'draft');
  const submittedApplications = applications.filter(app => app.status !== 'draft');
  const hasLocalDraftOnly = hasDraft && draftApplications.length === 0;
  const totalDraftCount = draftApplications.length + (hasLocalDraftOnly ? 1 : 0);

  const hasPendingPayment = applications.some(app =>
    app.status !== 'draft' && (
      app.payment_status === null ||
      app.payment_status === 'pending_review' ||
      app.payment_status !== 'verified'
    )
  );

  return { draftApplications, submittedApplications, totalDraftCount, hasPendingPayment };
}

async function runBenchmark() {
  console.log('Starting Dashboard Filtering Benchmark...');

  const APPLICATION_COUNTS = [100, 1000, 10000];
  const ITERATIONS = 10000;

  for (const count of APPLICATION_COUNTS) {
    console.log(`\nGenerating ${count} applications...`);
    const applications = generateApplications(count);
    const hasDraft = true;

    // Warmup
    runFiltering(applications, hasDraft);

    // Benchmark
    const start = performance.now();
    for (let i = 0; i < ITERATIONS; i++) {
      runFiltering(applications, hasDraft);
    }
    const end = performance.now();
    const duration = end - start;
    const avgPerOp = duration / ITERATIONS;

    console.log(`Processed ${count} applications x ${ITERATIONS} iterations`);
    console.log(`Total time: ${duration.toFixed(2)}ms`);
    console.log(`Average time per render: ${avgPerOp.toFixed(4)}ms`);
    console.log(`Est. cost for 60fps frame: ${(avgPerOp / 16.67 * 100).toFixed(2)}% of frame budget`);
  }
}

runBenchmark();
