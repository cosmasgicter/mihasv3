/**
 * Lighthouse Performance Audit Script
 * 
 * Runs Lighthouse audit on key pages and verifies scores meet requirements
 * Requirement: Lighthouse score > 90
 */

import lighthouse from 'lighthouse';
import * as chromeLauncher from 'chrome-launcher';
import fs from 'fs';
import path from 'path';

const PAGES_TO_AUDIT = [
  { url: 'http://localhost:5173/', name: 'Home' },
  { url: 'http://localhost:5173/track', name: 'Track Application' },
  { url: 'http://localhost:5173/programs', name: 'Programs' },
  { url: 'http://localhost:5173/about', name: 'About' }
];

const REQUIRED_SCORE = 90;

async function runLighthouse(url, name) {
  console.log(`\n🔍 Running Lighthouse audit for: ${name}`);
  console.log(`   URL: ${url}`);

  const chrome = await chromeLauncher.launch({ chromeFlags: ['--headless'] });
  
  const options = {
    logLevel: 'info',
    output: 'json',
    onlyCategories: ['performance'],
    port: chrome.port,
    throttling: {
      rttMs: 40,
      throughputKbps: 10 * 1024,
      cpuSlowdownMultiplier: 1
    }
  };

  try {
    const runnerResult = await lighthouse(url, options);
    await chrome.kill();

    const { lhr } = runnerResult;
    const performanceScore = lhr.categories.performance.score * 100;

    // Extract key metrics
    const metrics = {
      score: performanceScore,
      fcp: lhr.audits['first-contentful-paint'].numericValue,
      lcp: lhr.audits['largest-contentful-paint'].numericValue,
      tti: lhr.audits['interactive'].numericValue,
      si: lhr.audits['speed-index'].numericValue,
      tbt: lhr.audits['total-blocking-time'].numericValue,
      cls: lhr.audits['cumulative-layout-shift'].numericValue
    };

    return {
      name,
      url,
      ...metrics,
      passed: performanceScore >= REQUIRED_SCORE
    };
  } catch (error) {
    console.error(`❌ Error running Lighthouse for ${name}:`, error.message);
    await chrome.kill();
    return {
      name,
      url,
      error: error.message,
      passed: false
    };
  }
}

async function main() {
  console.log('🚀 Starting Lighthouse Performance Audit');
  console.log(`📊 Required Score: ${REQUIRED_SCORE}`);
  console.log('=' .repeat(60));

  const results = [];

  for (const page of PAGES_TO_AUDIT) {
    const result = await runLighthouse(page.url, page.name);
    results.push(result);

    if (result.error) {
      console.log(`\n❌ ${result.name}: ERROR`);
      console.log(`   ${result.error}`);
    } else {
      const status = result.passed ? '✅' : '❌';
      console.log(`\n${status} ${result.name}: ${result.score.toFixed(1)}/100`);
      console.log(`   First Contentful Paint: ${(result.fcp / 1000).toFixed(2)}s`);
      console.log(`   Largest Contentful Paint: ${(result.lcp / 1000).toFixed(2)}s`);
      console.log(`   Time to Interactive: ${(result.tti / 1000).toFixed(2)}s`);
      console.log(`   Speed Index: ${(result.si / 1000).toFixed(2)}s`);
      console.log(`   Total Blocking Time: ${result.tbt.toFixed(0)}ms`);
      console.log(`   Cumulative Layout Shift: ${result.cls.toFixed(3)}`);
    }
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('📈 SUMMARY');
  console.log('='.repeat(60));

  const passedCount = results.filter(r => r.passed).length;
  const totalCount = results.length;
  const allPassed = passedCount === totalCount;

  results.forEach(result => {
    if (!result.error) {
      const status = result.passed ? '✅' : '❌';
      console.log(`${status} ${result.name}: ${result.score.toFixed(1)}/100`);
    }
  });

  console.log(`\n${passedCount}/${totalCount} pages passed (score >= ${REQUIRED_SCORE})`);

  // Save results to file
  const reportPath = path.join(process.cwd(), 'lighthouse-report.json');
  fs.writeFileSync(reportPath, JSON.stringify(results, null, 2));
  console.log(`\n📄 Full report saved to: ${reportPath}`);

  if (allPassed) {
    console.log('\n🎉 All pages meet the performance requirements!');
    process.exit(0);
  } else {
    console.log('\n⚠️  Some pages did not meet the performance requirements.');
    process.exit(1);
  }
}

// Check if dev server is running
async function checkDevServer() {
  try {
    const response = await fetch('http://localhost:5173/');
    return response.ok;
  } catch (error) {
    return false;
  }
}

// Run the audit
(async () => {
  const serverRunning = await checkDevServer();
  
  if (!serverRunning) {
    console.error('❌ Dev server is not running on http://localhost:5173/');
    console.error('   Please start the dev server with: npm run dev');
    process.exit(1);
  }

  await main();
})();
