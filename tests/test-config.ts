export const testConfig = {
  // Base URLs for different environments
  baseUrls: {
    local: 'http://localhost:5173',
    staging: 'https://staging.mihas.edu.zm',
    production: 'https://application.mihas.edu.zm'
  },
  
  // API endpoints
  apiEndpoints: {
    health: '/health',
    auth: {
      login: '/auth-login',
      register: '/auth-register',
      resetPassword: '/auth-reset-password'
    },
    applications: '/applications',
    catalog: {
      programs: '/catalog-programs',
      intakes: '/catalog-intakes',
      subjects: '/catalog-subjects'
    },
    admin: {
      dashboard: '/admin-dashboard',
      users: '/admin-users',
      auditLog: '/admin-audit-log-stats'
    }
  },
  
  // Test data
  testUsers: {
    student: {
      email: 'student@test.com',
      password: 'TestPassword123!',
      role: 'student'
    },
    admin: {
      email: 'admin@test.com',
      password: 'AdminPassword123!',
      role: 'admin'
    }
  },
  
  // Viewport sizes for responsive testing
  viewports: {
    mobile: { width: 375, height: 667 },
    tablet: { width: 768, height: 1024 },
    desktop: { width: 1280, height: 720 },
    large: { width: 1920, height: 1080 }
  },
  
  // Performance thresholds
  performance: {
    pageLoadTime: 3000,
    apiResponseTime: 2000,
    bundleSize: 1024 * 1024, // 1MB
    imageSize: 500 * 1024 // 500KB
  },
  
  // Security test patterns
  security: {
    xssPayloads: [
      '<script>alert("XSS")</script>',
      '<img src="x" onerror="alert(1)">',
      'javascript:alert(1)'
    ],
    sqlPayloads: [
      "'; DROP TABLE users; --",
      "' OR '1'='1",
      "1; DELETE FROM applications"
    ]
  }
}