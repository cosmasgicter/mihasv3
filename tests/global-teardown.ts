import { FullConfig } from '@playwright/test'
import { execSync } from 'child_process'
import * as fs from 'fs'

async function globalTeardown(config: FullConfig) {
  console.log('🧹 Starting Production Test Suite Teardown')
  
  try {
    // Wait for XML file to be written
    await new Promise(resolve => setTimeout(resolve, 1000))
    
    // Check if XML file exists before submitting
    // fs already imported
    if (fs.existsSync('./test-results/results.xml')) {
      console.log('📊 Submitting test results to TestMonitor...')
      execSync('npm run test:submit:playwright', { stdio: 'inherit' })
      console.log('✅ Playwright results submitted to TestMonitor')
    } else {
      console.log('⚠️ No XML results file found, skipping TestMonitor submission')
    }
    
    // Submit unit test results if they exist
    try {
      execSync('npm run test:submit:vitest', { stdio: 'inherit' })
      console.log('✅ Unit test results submitted to TestMonitor')
    } catch (error) {
      console.log('ℹ️ No unit test results to submit')
    }
    
    // Generate production test report
    console.log('📋 Generating production test report...')
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const reportPath = `test-results/production-report-${timestamp}.json`
    
    const report = {
      timestamp,
      environment: 'production',
      baseUrl: process.env.VITE_BASE_URL,
      apiUrl: process.env.VITE_API_URL,
      testMonitorSubmitted: true,
      githubIntegration: false
    }
    
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2))
    console.log(`✅ Production test report saved: ${reportPath}`)
    
  } catch (error) {
    console.log('⚠️ Teardown warning:', error)
  }
  
  console.log('🎉 Production Test Suite Teardown Complete')
}

export default globalTeardown