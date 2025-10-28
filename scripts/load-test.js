#!/usr/bin/env node
/**
 * Simple load testing script for MIHAS V3
 * Tests concurrent users and API response times
 */

import https from 'https';
import http from 'http';

const config = {
  baseUrl: process.env.TEST_URL || 'http://localhost:5173',
  concurrentUsers: parseInt(process.env.CONCURRENT_USERS) || 50,
  requestsPerUser: parseInt(process.env.REQUESTS_PER_USER) || 10,
  endpoints: [
    { path: '/', method: 'GET', name: 'Landing Page' },
    { path: '/auth/signin', method: 'GET', name: 'Sign In Page' },
    { path: '/track-application', method: 'GET', name: 'Application Tracker' },
  ]
};

const stats = {
  total: 0,
  success: 0,
  failed: 0,
  times: []
};

function makeRequest(endpoint) {
  return new Promise((resolve) => {
    const url = new URL(endpoint.path, config.baseUrl);
    const client = url.protocol === 'https:' ? https : http;
    const start = Date.now();

    const req = client.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        const time = Date.now() - start;
        stats.times.push(time);
        stats.total++;
        if (res.statusCode >= 200 && res.statusCode < 400) {
          stats.success++;
        } else {
          stats.failed++;
        }
        resolve({ status: res.statusCode, time });
      });
    });

    req.on('error', () => {
      stats.total++;
      stats.failed++;
      resolve({ status: 0, time: Date.now() - start });
    });

    req.setTimeout(10000, () => {
      req.destroy();
      stats.total++;
      stats.failed++;
      resolve({ status: 0, time: 10000 });
    });
  });
}

async function runUser(userId) {
  for (let i = 0; i < config.requestsPerUser; i++) {
    const endpoint = config.endpoints[i % config.endpoints.length];
    await makeRequest(endpoint);
  }
}

async function runLoadTest() {
  console.log('🚀 MIHAS V3 Load Test');
  console.log(`URL: ${config.baseUrl}`);
  console.log(`Concurrent Users: ${config.concurrentUsers}`);
  console.log(`Requests per User: ${config.requestsPerUser}`);
  console.log(`Total Requests: ${config.concurrentUsers * config.requestsPerUser}\n`);

  const startTime = Date.now();
  const users = Array.from({ length: config.concurrentUsers }, (_, i) => runUser(i));
  await Promise.all(users);
  const duration = (Date.now() - startTime) / 1000;

  const avgTime = stats.times.reduce((a, b) => a + b, 0) / stats.times.length;
  const minTime = Math.min(...stats.times);
  const maxTime = Math.max(...stats.times);
  const p95 = stats.times.sort((a, b) => a - b)[Math.floor(stats.times.length * 0.95)];

  console.log('\n📊 Results:');
  console.log(`Total Requests: ${stats.total}`);
  console.log(`Successful: ${stats.success} (${((stats.success/stats.total)*100).toFixed(1)}%)`);
  console.log(`Failed: ${stats.failed} (${((stats.failed/stats.total)*100).toFixed(1)}%)`);
  console.log(`Duration: ${duration.toFixed(2)}s`);
  console.log(`Requests/sec: ${(stats.total/duration).toFixed(2)}`);
  console.log(`\nResponse Times:`);
  console.log(`  Min: ${minTime}ms`);
  console.log(`  Avg: ${avgTime.toFixed(0)}ms`);
  console.log(`  Max: ${maxTime}ms`);
  console.log(`  P95: ${p95}ms`);

  if (stats.failed / stats.total > 0.05) {
    console.log('\n⚠️  Warning: >5% failure rate');
    process.exit(1);
  }
  if (avgTime > 2000) {
    console.log('\n⚠️  Warning: Average response time >2s');
    process.exit(1);
  }
  console.log('\n✅ Load test passed');
}

runLoadTest().catch(console.error);
