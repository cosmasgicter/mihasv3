const { performance } = require('perf_hooks');

const SIZE = 5000;
// Use a large enough size to make the difference measurable and significant.
// In a real offline scenario, 5000 requests is a heavy load (e.g. collecting data all day),
// but it highlights the O(N log N) vs O(N) difference.

const mapOrdered = new Map();
let now = Date.now();

// Populate map with requests in chronological order
for (let i = 0; i < SIZE; i++) {
  // Ensure strict timestamp increase
  now += 1;
  const req = {
    id: `req_${now}_${i}`,
    timestamp: now,
    retryCount: 0,
    maxRetries: 3
  };
  mapOrdered.set(req.id, req);
}

// Method 1: Current implementation (Filter + Sort)
function measureCurrent() {
  const start = performance.now();
  const requests = Array.from(mapOrdered.values())
    .filter(r => r.retryCount < r.maxRetries)
    .sort((a, b) => a.timestamp - b.timestamp);
  const end = performance.now();
  return { time: end - start, count: requests.length };
}

// Method 2: Optimized (Filter only)
function measureOptimized() {
  const start = performance.now();
  const requests = Array.from(mapOrdered.values())
    .filter(r => r.retryCount < r.maxRetries);
  const end = performance.now();
  return { time: end - start, count: requests.length };
}

console.log('Benchmarking Queue Sorting Optimization');
console.log('Queue Size:', SIZE);

// Warmup
for(let i=0; i<10; i++) {
  measureCurrent();
  measureOptimized();
}

const iterations = 1000;
let totalCurrent = 0;
let totalOptimized = 0;

for(let i=0; i<iterations; i++) {
  totalCurrent += measureCurrent().time;
  totalOptimized += measureOptimized().time;
}

const avgCurrent = totalCurrent / iterations;
const avgOptimized = totalOptimized / iterations;

console.log(`\nResults (average of ${iterations} iterations):`);
console.log(`Current (Sort):    ${avgCurrent.toFixed(4)} ms`);
console.log(`Optimized (No Sort): ${avgOptimized.toFixed(4)} ms`);
console.log(`Improvement:       ${((avgCurrent - avgOptimized) / avgCurrent * 100).toFixed(2)}%`);
console.log(`Speedup:           ${(avgCurrent / avgOptimized).toFixed(2)}x`);
