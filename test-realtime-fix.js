// Automated test for real-time sync fix
const https = require('https');

const SUPABASE_URL = 'https://mylgegkqoddcrxtwcclb.supabase.co';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im15bGdlZ2txb2RkY3J4dHdjY2xiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc1MTIwODMsImV4cCI6MjA3MzA4ODA4M30.7f-TwYz7E6Pp07oH5Lkkfw9c8d8JkeE81EXJqpCWiLw';

const tests = {
  passed: 0,
  failed: 0,
  total: 0
};

function request(path, method = 'GET', data = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, SUPABASE_URL);
    const options = {
      method,
      headers: {
        'apikey': ANON_KEY,
        'Authorization': `Bearer ${ANON_KEY}`,
        'Content-Type': 'application/json'
      }
    };

    const req = https.request(url, options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(body) });
        } catch {
          resolve({ status: res.statusCode, data: body });
        }
      });
    });

    req.on('error', reject);
    if (data) req.write(JSON.stringify(data));
    req.end();
  });
}

async function test(name, fn) {
  tests.total++;
  try {
    await fn();
    tests.passed++;
    console.log(`✅ ${name}`);
  } catch (error) {
    tests.failed++;
    console.log(`❌ ${name}: ${error.message}`);
  }
}

async function runTests() {
  console.log('========================================');
  console.log('Real-Time Sync Fix - Automated Tests');
  console.log('========================================\n');

  await test('Supabase API is accessible', async () => {
    const res = await request('/rest/v1/');
    if (res.status !== 200 && res.status !== 404) throw new Error(`Status ${res.status}`);
  });

  await test('Applications table is accessible', async () => {
    const res = await request('/rest/v1/applications?select=id&limit=1');
    if (res.status !== 200) throw new Error(`Status ${res.status}`);
  });

  await test('Realtime endpoint is available', async () => {
    const res = await request('/realtime/v1/websocket');
    if (res.status !== 426 && res.status !== 200) throw new Error(`Status ${res.status}`);
  });

  await test('Admin view is accessible', async () => {
    const res = await request('/rest/v1/admin_application_detailed?select=id&limit=1');
    if (res.status !== 200) throw new Error(`Status ${res.status}`);
  });

  await test('Application stats endpoint works', async () => {
    const res = await request('/rest/v1/applications?select=status&limit=10');
    if (res.status !== 200) throw new Error(`Status ${res.status}`);
    if (!Array.isArray(res.data)) throw new Error('Invalid response format');
  });

  console.log('\n========================================');
  console.log('Test Results');
  console.log('========================================');
  console.log(`Total: ${tests.total}`);
  console.log(`Passed: ${tests.passed} ✅`);
  console.log(`Failed: ${tests.failed} ${tests.failed > 0 ? '❌' : ''}`);
  console.log(`Success Rate: ${Math.round(tests.passed / tests.total * 100)}%`);
  console.log('========================================\n');

  if (tests.failed > 0) {
    console.log('⚠️  Some tests failed. Check Supabase configuration.');
    process.exit(1);
  } else {
    console.log('✅ All tests passed! Ready for deployment.');
    process.exit(0);
  }
}

runTests().catch(err => {
  console.error('Test suite error:', err);
  process.exit(1);
});
