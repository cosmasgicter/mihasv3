#!/usr/bin/env node

/**
 * MIHAS Comprehensive Implementation Testing Script
 * Tests both function endpoints AND their implementation logic
 * Uses Supabase MCP for issue resolution
 */

import https from 'https';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const CONFIG = {
  baseUrl: 'https://mihasv3.pages.dev',
  supabaseUrl: 'https://mylgegkqoddcrxtwcclb.supabase.co',
  supabaseKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im15bGdlZ2txb2RkY3J4dHdjY2xiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc1MTIwODMsImV4cCI6MjA3MzA4ODA4M30.7f-TwYz7E6Pp07oH5Lkkfw9c8d8JkeE81EXJqpCWiLw',
  adminCredentials: {
    email: 'cosmas@beanola.com',
    password: 'Beanola2025'
  },
  studentCredentials: {
    email: 'cosmaskanchepa8@gmail.com',
    password: 'TestPassword123!'
  },
  timeout: 30000,
  functionsDir: '/home/cosmas/Documents/Visual Code/mihasv3/functions'
};

// Test results
const testResults = {
  total: 0,
  passed: 0,
  failed: 0,
  skipped: 0,
  functions: {},
  implementations: {},
  startTime: new Date(),
  endTime: null,
  errors: [],
  recommendations: []
};

let adminToken = null;
let studentToken = null;

// Utility functions
function makeRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const requestOptions = {
      hostname: urlObj.hostname,
      port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
      path: urlObj.pathname + urlObj.search,
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'MIHAS-Implementation-Test/1.0',
        ...options.headers
      },
      timeout: CONFIG.timeout
    };

    if (options.body) {
      requestOptions.headers['Content-Length'] = Buffer.byteLength(options.body);
    }

    const req = https.request(requestOptions, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const result = {
            status: res.statusCode,
            headers: res.headers,
            body: data,
            json: null
          };
          
          if (data) {
            try {
              result.json = JSON.parse(data);
            } catch (e) {
              // Not JSON
            }
          }
          
          resolve(result);
        } catch (error) {
          reject(error);
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    if (options.body) {
      req.write(options.body);
    }

    req.end();
  });
}

async function authenticate() {
  console.log('🔐 Authenticating users...');
  
  try {
    // Admin authentication
    const adminAuth = await makeRequest(`${CONFIG.supabaseUrl}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: {
        'apikey': CONFIG.supabaseKey,
        'Authorization': `Bearer ${CONFIG.supabaseKey}`
      },
      body: JSON.stringify({
        email: CONFIG.adminCredentials.email,
        password: CONFIG.adminCredentials.password
      })
    });

    if (adminAuth.json && adminAuth.json.access_token) {
      adminToken = adminAuth.json.access_token;
      console.log('✅ Admin authenticated successfully');
    } else {
      console.log('❌ Admin authentication failed');
      testResults.errors.push({
        type: 'auth_error',
        message: 'Admin authentication failed',
        details: adminAuth.body
      });
    }

    // Student authentication
    try {
      const studentAuth = await makeRequest(`${CONFIG.supabaseUrl}/auth/v1/token?grant_type=password`, {
        method: 'POST',
        headers: {
          'apikey': CONFIG.supabaseKey,
          'Authorization': `Bearer ${CONFIG.supabaseKey}`
        },
        body: JSON.stringify({
          email: CONFIG.studentCredentials.email,
          password: CONFIG.studentCredentials.password
        })
      });

      if (studentAuth.json && studentAuth.json.access_token) {
        studentToken = studentAuth.json.access_token;
        console.log('✅ Student authenticated successfully');
      } else {
        console.log('⚠️ Student authentication failed - will test with admin token');
      }
    } catch (error) {
      console.log('⚠️ Student authentication error - will test with admin token');
    }

  } catch (error) {
    console.error('❌ Authentication error:', error.message);
    testResults.errors.push({
      type: 'auth_error',
      message: error.message
    });
  }
}

// Function discovery
function discoverFunctions() {
  const functions = [];
  
  function scanDirectory(dir, basePath = '') {
    try {
      const items = fs.readdirSync(dir);
      
      for (const item of items) {
        const fullPath = path.join(dir, item);
        const stat = fs.statSync(fullPath);
        
        if (stat.isDirectory() && !item.startsWith('_') && item !== 'node_modules') {
          scanDirectory(fullPath, basePath + '/' + item);
        } else if (stat.isFile() && item.endsWith('.js') && !item.startsWith('_')) {
          const functionPath = basePath + '/' + item.replace('.js', '');
          functions.push({
            path: functionPath,
            filePath: fullPath,
            name: item.replace('.js', ''),
            directory: basePath || '/'
          });
        }
      }
    } catch (error) {
      console.error(`Error scanning directory ${dir}:`, error.message);
    }
  }
  
  scanDirectory(CONFIG.functionsDir);
  return functions;
}

// Implementation analysis
function analyzeImplementation(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    
    const analysis = {
      hasErrorHandling: /try\s*{|catch\s*\(/.test(content),
      hasValidation: /validate|schema|joi|zod/.test(content),
      hasAuthentication: /auth|token|bearer/i.test(content),
      hasLogging: /console\.|logger|log/.test(content),
      hasCORS: /cors|origin|access-control/i.test(content),
      hasRateLimit: /rate.?limit|throttle/.test(content),
      hasSupabase: /supabase|createClient/.test(content),
      hasDatabase: /query|select|insert|update|delete/i.test(content),
      linesOfCode: content.split('\n').length,
      hasComments: /\/\*|\*\/|\/\//.test(content),
      exports: /export|module\.exports/.test(content),
      imports: /import|require/.test(content),
      asyncFunctions: (content.match(/async\s+function|async\s+\(/g) || []).length,
      functions: (content.match(/function\s+\w+|const\s+\w+\s*=\s*\(/g) || []).length
    };
    
    // Quality score
    let qualityScore = 0;
    if (analysis.hasErrorHandling) qualityScore += 20;
    if (analysis.hasValidation) qualityScore += 15;
    if (analysis.hasAuthentication) qualityScore += 15;
    if (analysis.hasLogging) qualityScore += 10;
    if (analysis.hasCORS) qualityScore += 10;
    if (analysis.hasRateLimit) qualityScore += 10;
    if (analysis.hasComments) qualityScore += 10;
    if (analysis.linesOfCode > 10) qualityScore += 10;
    
    analysis.qualityScore = qualityScore;
    analysis.content = content;
    
    return analysis;
  } catch (error) {
    return {
      error: error.message,
      qualityScore: 0
    };
  }
}

// Test individual function
async function testFunction(func) {
  console.log(`\n🧪 Testing: ${func.path}`);
  
  testResults.total++;
  const testStart = new Date();
  
  // Analyze implementation first
  const implementation = analyzeImplementation(func.filePath);
  testResults.implementations[func.path] = implementation;
  
  console.log(`   📊 Quality Score: ${implementation.qualityScore}/100`);
  
  // Test the endpoint
  const testData = {
    path: func.path,
    name: func.name,
    directory: func.directory,
    startTime: testStart,
    implementation: implementation
  };
  
  try {
    // Determine auth requirements
    let headers = {};
    if (implementation.hasAuthentication && adminToken) {
      headers['Authorization'] = `Bearer ${adminToken}`;
    }
    
    // Test GET request
    const url = `${CONFIG.baseUrl}${func.path}`;
    const response = await makeRequest(url, {
      method: 'GET',
      headers
    });
    
    testData.response = {
      status: response.status,
      headers: response.headers,
      hasBody: !!response.body,
      bodyLength: response.body ? response.body.length : 0,
      isJson: !!response.json
    };
    
    if (response.json) {
      testData.responseData = response.json;
    }
    
    // Determine success
    const isSuccess = response.status >= 200 && response.status < 400;
    const isNotFound = response.status === 404;
    const isServerError = response.status >= 500;
    
    if (isSuccess) {
      testData.status = 'passed';
      testResults.passed++;
      console.log(`   ✅ Endpoint works (${response.status})`);
    } else if (isNotFound) {
      testData.status = 'not_found';
      testResults.failed++;
      console.log(`   ❌ Not found (404)`);
      testResults.recommendations.push(`Fix routing for ${func.path}`);
    } else if (isServerError) {
      testData.status = 'server_error';
      testResults.failed++;
      console.log(`   💥 Server error (${response.status})`);
      testResults.recommendations.push(`Fix server error in ${func.path}`);
    } else {
      testData.status = 'failed';
      testResults.failed++;
      console.log(`   ❌ Failed (${response.status})`);
    }
    
    // Test POST if it looks like it should accept POST
    if (implementation.hasValidation || func.path.includes('create') || func.path.includes('update')) {
      try {
        const postResponse = await makeRequest(url, {
          method: 'POST',
          headers: {
            ...headers,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ test: true })
        });
        
        testData.postResponse = {
          status: postResponse.status,
          works: postResponse.status < 500
        };
        
        if (postResponse.status < 500) {
          console.log(`   ✅ POST method supported`);
        }
      } catch (error) {
        console.log(`   ⚠️ POST test failed: ${error.message}`);
      }
    }
    
  } catch (error) {
    testData.status = 'error';
    testData.error = error.message;
    testResults.failed++;
    console.log(`   💥 Error: ${error.message}`);
    testResults.errors.push({
      function: func.path,
      error: error.message,
      timestamp: new Date()
    });
  }
  
  testData.endTime = new Date();
  testData.duration = testData.endTime - testData.startTime;
  testResults.functions[func.path] = testData;
}

// Generate comprehensive report
function generateReport() {
  console.log('\n' + '='.repeat(80));
  console.log('📊 COMPREHENSIVE TEST RESULTS');
  console.log('='.repeat(80));
  
  testResults.endTime = new Date();
  testResults.duration = testResults.endTime - testResults.startTime;
  
  console.log(`⏱️  Total Duration: ${Math.round(testResults.duration / 1000)}s`);
  console.log(`📈 Total Functions: ${testResults.total}`);
  console.log(`✅ Passed: ${testResults.passed}`);
  console.log(`❌ Failed: ${testResults.failed}`);
  console.log(`⏭️  Skipped: ${testResults.skipped}`);
  console.log(`📊 Success Rate: ${Math.round((testResults.passed / testResults.total) * 100)}%`);
  
  // Implementation quality analysis
  const implementations = Object.values(testResults.implementations);
  const avgQuality = implementations.reduce((sum, impl) => sum + (impl.qualityScore || 0), 0) / implementations.length;
  
  console.log(`\n🔧 IMPLEMENTATION ANALYSIS:`);
  console.log(`📊 Average Quality Score: ${Math.round(avgQuality)}/100`);
  console.log(`🛡️  Functions with Error Handling: ${implementations.filter(i => i.hasErrorHandling).length}`);
  console.log(`✅ Functions with Validation: ${implementations.filter(i => i.hasValidation).length}`);
  console.log(`🔐 Functions with Authentication: ${implementations.filter(i => i.hasAuthentication).length}`);
  console.log(`📝 Functions with Logging: ${implementations.filter(i => i.hasLogging).length}`);
  console.log(`🌐 Functions with CORS: ${implementations.filter(i => i.hasCORS).length}`);
  
  // Failed functions
  const failedFunctions = Object.entries(testResults.functions)
    .filter(([_, func]) => func.status !== 'passed')
    .map(([name, func]) => ({ name, ...func }));
  
  if (failedFunctions.length > 0) {
    console.log(`\n❌ FAILED FUNCTIONS (${failedFunctions.length}):`);
    failedFunctions.forEach(func => {
      console.log(`   ${func.name}: ${func.status} - ${func.error || 'Check implementation'}`);
      if (func.implementation && func.implementation.qualityScore < 50) {
        console.log(`     ⚠️ Low quality score: ${func.implementation.qualityScore}/100`);
      }
    });
  }
  
  // High quality functions
  const highQualityFunctions = Object.entries(testResults.functions)
    .filter(([_, func]) => func.implementation && func.implementation.qualityScore >= 80)
    .map(([name, func]) => ({ name, ...func }));
  
  if (highQualityFunctions.length > 0) {
    console.log(`\n⭐ HIGH QUALITY FUNCTIONS (${highQualityFunctions.length}):`);
    highQualityFunctions.forEach(func => {
      console.log(`   ${func.name}: ${func.implementation.qualityScore}/100`);
    });
  }
  
  // Recommendations
  if (testResults.recommendations.length > 0) {
    console.log(`\n🔧 RECOMMENDATIONS:`);
    [...new Set(testResults.recommendations)].forEach((rec, i) => {
      console.log(`   ${i + 1}. ${rec}`);
    });
  }
  
  // Additional recommendations based on analysis
  console.log(`\n💡 IMPROVEMENT SUGGESTIONS:`);
  if (implementations.filter(i => i.hasErrorHandling).length < implementations.length * 0.8) {
    console.log(`   • Add error handling to more functions (currently ${Math.round(implementations.filter(i => i.hasErrorHandling).length / implementations.length * 100)}%)`);
  }
  if (implementations.filter(i => i.hasValidation).length < implementations.length * 0.6) {
    console.log(`   • Add input validation to more functions (currently ${Math.round(implementations.filter(i => i.hasValidation).length / implementations.length * 100)}%)`);
  }
  if (implementations.filter(i => i.hasLogging).length < implementations.length * 0.7) {
    console.log(`   • Add logging to more functions (currently ${Math.round(implementations.filter(i => i.hasLogging).length / implementations.length * 100)}%)`);
  }
  
  // Save detailed report
  const reportPath = path.join(__dirname, '../../archive/test-results/comprehensive-implementation-test-results.json');
  const reportDir = path.dirname(reportPath);
  
  if (!fs.existsSync(reportDir)) {
    fs.mkdirSync(reportDir, { recursive: true });
  }
  
  fs.writeFileSync(reportPath, JSON.stringify(testResults, null, 2));
  console.log(`\n💾 Detailed report saved to: ${reportPath}`);
  
  // Generate summary report
  const summaryPath = path.join(__dirname, '../../archive/test-results/implementation-test-summary.md');
  const summary = generateMarkdownSummary();
  fs.writeFileSync(summaryPath, summary);
  console.log(`📄 Summary report saved to: ${summaryPath}`);
}

function generateMarkdownSummary() {
  const implementations = Object.values(testResults.implementations);
  const avgQuality = implementations.reduce((sum, impl) => sum + (impl.qualityScore || 0), 0) / implementations.length;
  
  return `# MIHAS Implementation Test Summary

## Overview
- **Test Date**: ${testResults.startTime.toISOString()}
- **Duration**: ${Math.round(testResults.duration / 1000)}s
- **Total Functions**: ${testResults.total}
- **Success Rate**: ${Math.round((testResults.passed / testResults.total) * 100)}%

## Results
- ✅ **Passed**: ${testResults.passed}
- ❌ **Failed**: ${testResults.failed}
- ⏭️ **Skipped**: ${testResults.skipped}

## Implementation Quality
- **Average Quality Score**: ${Math.round(avgQuality)}/100
- **Functions with Error Handling**: ${implementations.filter(i => i.hasErrorHandling).length}/${implementations.length}
- **Functions with Validation**: ${implementations.filter(i => i.hasValidation).length}/${implementations.length}
- **Functions with Authentication**: ${implementations.filter(i => i.hasAuthentication).length}/${implementations.length}

## Failed Functions
${Object.entries(testResults.functions)
  .filter(([_, func]) => func.status !== 'passed')
  .map(([name, func]) => `- **${name}**: ${func.status} - ${func.error || 'Implementation issue'}`)
  .join('\n')}

## Recommendations
${testResults.recommendations.map((rec, i) => `${i + 1}. ${rec}`).join('\n')}

## Next Steps
1. Fix failed functions
2. Improve implementation quality scores
3. Add missing error handling and validation
4. Deploy and re-test
`;
}

// Main execution
async function main() {
  console.log('🚀 Starting MIHAS Comprehensive Implementation Testing');
  
  // Discover all functions
  const functions = discoverFunctions();
  console.log(`📊 Discovered ${functions.length} functions`);
  
  // Authenticate
  await authenticate();
  
  console.log('\n' + '='.repeat(80));
  console.log('🧪 TESTING FUNCTIONS AND IMPLEMENTATIONS');
  console.log('='.repeat(80));
  
  // Test each function
  for (const func of functions) {
    await testFunction(func);
    // Small delay to avoid overwhelming the server
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  
  // Generate report
  generateReport();
  
  // Exit with appropriate code
  const hasFailures = testResults.failed > 0;
  const hasLowQuality = Object.values(testResults.implementations).some(impl => impl.qualityScore < 50);
  
  if (hasFailures || hasLowQuality) {
    console.log('\n⚠️ Issues found - review report and fix before deployment');
    process.exit(1);
  } else {
    console.log('\n✅ All tests passed - ready for deployment');
    process.exit(0);
  }
}

// Handle process signals
process.on('SIGINT', () => {
  console.log('\n⚠️ Test interrupted by user');
  testResults.endTime = new Date();
  generateReport();
  process.exit(1);
});

// Run the tests
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error('💥 Test suite failed:', error);
    process.exit(1);
  });
}

export { main, testResults, CONFIG };