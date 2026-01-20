// Simulation of memory overhead for large datasets

function generateMockData(count) {
  const statuses = ['draft', 'submitted', 'under_review', 'approved', 'rejected'];
  const data = [];
  const now = new Date();

  for (let i = 0; i < count; i++) {
    const date = new Date(now.getTime() - Math.random() * 60 * 24 * 60 * 60 * 1000);
    data.push({
      status: statuses[Math.floor(Math.random() * statuses.length)],
      created_at: date.toISOString()
    });
  }
  return data;
}

function processInMemory(apps) {
  const now = new Date();
  const today = now.toISOString().split('T')[0];
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const totalCount = apps.length;
  const draftCount = apps.filter(a => a.status === 'draft').length;
  const submittedCount = apps.filter(a => a.status === 'submitted').length;
  const underReviewCount = apps.filter(a => a.status === 'under_review').length;
  const approvedCount = apps.filter(a => a.status === 'approved').length;
  const rejectedCount = apps.filter(a => a.status === 'rejected').length;
  const todayCount = apps.filter(a => a.created_at && a.created_at.startsWith(today)).length;
  const weekCount = apps.filter(a => a.created_at && a.created_at >= weekAgo).length;
  const monthCount = apps.filter(a => a.created_at && a.created_at >= monthAgo).length;

  return { totalCount, draftCount, approvedCount };
}

console.log('Generating 100,000 records...');
const data = generateMockData(100000);
console.log('Data generated. Memory usage:', process.memoryUsage().heapUsed / 1024 / 1024, 'MB');

console.log('Processing in memory...');
const start = performance.now();
processInMemory(data);
const end = performance.now();

console.log(`In-memory processing time: ${(end - start).toFixed(2)}ms`);
console.log('With database aggregation, this processing time would be near 0ms on the application server,');
console.log('and would transfer drastically less data (JSON for 100k rows vs just a few integers).');
