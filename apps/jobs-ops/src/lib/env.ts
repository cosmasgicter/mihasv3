export const env = {
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000',
  demoMode: import.meta.env.VITE_JOBS_OPS_DEMO_MODE === 'true',
}
