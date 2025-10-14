// Global setup to prevent Jest/Vitest matcher conflicts
async function globalSetup() {
  // Clear any existing Jest/Vitest matchers to prevent conflicts
  if (global.expect && global.expect.extend) {
    delete global.expect;
  }
  
  // Ensure clean environment for Playwright
  delete process.env.VITEST;
  delete process.env.JEST_WORKER_ID;
}

export default globalSetup;