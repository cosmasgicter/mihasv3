import { chromium, FullConfig } from '@playwright/test';
import * as dotenv from 'dotenv';

// Load test environment variables
dotenv.config({ path: '.env.test' });

async function globalSetup(config: FullConfig) {
  console.log('🚀 MIHAS Production Test Suite - Global Setup');
  console.log('==============================================');
  console.log(`🌐 Production URL: ***REMOVED***`);
  console.log(`📊 TestMonitor: https://beanola.testmonitor.com`);
  console.log(`🔐 Using Production Credentials`);
  console.log('');

  // Verify production environment is accessible
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  try {
    console.log('🔍 Verifying production environment...');
    const response = await page.goto('***REMOVED***');
    
    if (response?.status() === 200) {
      console.log('✅ Production environment is accessible');
    } else {
      console.log(`⚠️  Production environment returned status: ${response?.status()}`);
    }
    
    // Check if health endpoint is available
    try {
      const healthResponse = await page.request.get('***REMOVED***/api/health');
      if (healthResponse.status() === 200) {
        console.log('✅ Production API health check passed');
      } else {
        console.log(`⚠️  Production API health check returned: ${healthResponse.status()}`);
      }
    } catch (error) {
      console.log('⚠️  Production API health check failed');
    }
    
  } catch (error) {
    console.log('❌ Failed to access production environment');
    console.log('Error:', error);
  } finally {
    await browser.close();
  }

  console.log('');
  console.log('🎯 Starting test execution...');
  console.log('📈 All results will be automatically sent to TestMonitor');
  console.log('');
}

export default globalSetup;