// Development mode utilities for offline testing

export const isDevelopment = import.meta.env.MODE === 'development'
export const isTestMode = import.meta.env.VITE_TEST_MODE === 'true'

// Mock user for development
export const mockUser = {
  id: 'dev-user-123',
  email: 'dev@mihas.edu.zm',
  user_metadata: {
    full_name: 'Development User'
  }
}

// Mock profile for development
export const mockProfile = {
  id: 'dev-profile-123',
  user_id: 'dev-user-123',
  full_name: 'Development User',
  email: 'dev@mihas.edu.zm',
  phone: '+260 123 456 789',
  role: 'student',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString()
}

// Mock admin user for testing admin features
export const mockAdminUser = {
  id: 'dev-admin-123',
  email: 'admin@mihas.edu.zm',
  user_metadata: {
    full_name: 'Development Admin'
  }
}

export const mockAdminProfile = {
  id: 'dev-admin-profile-123',
  user_id: 'dev-admin-123',
  full_name: 'Development Admin',
  email: 'admin@mihas.edu.zm',
  phone: '+260 987 654 321',
  role: 'admin',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString()
}

export const mockUserRole = {
  id: 'dev-role-123',
  user_id: 'dev-admin-123',
  role: 'admin',
  permissions: ['*'],
  department: null,
  is_active: true
}

// Check if we should use mock data
export const shouldUseMockData = () => {
  return isDevelopment && isTestMode
}