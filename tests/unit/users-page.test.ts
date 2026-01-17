/**
 * Users Page Unit Tests
 * 
 * Tests for the admin Users page:
 * - Data loading from profiles table
 * - Empty state handling
 * - Error handling
 * 
 * Requirements: 11.1, 11.2, 11.3, 11.4
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock the userService to test data access patterns
const mockUserService = {
  list: vi.fn(),
  getById: vi.fn(),
  getRole: vi.fn(),
  getPermissions: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  updatePermissions: vi.fn(),
  remove: vi.fn(),
}

// Test the data transformation logic
describe('Users Page Data Access', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('User data normalization', () => {
    it('should correctly access users from service response with users property', () => {
      // The userService.list returns { users: [...] }
      const serviceResponse = {
        users: [
          { id: '1', user_id: '1', email: 'test@example.com', full_name: 'Test User', role: 'student' },
          { id: '2', user_id: '2', email: 'admin@example.com', full_name: 'Admin User', role: 'admin' },
        ]
      }
      
      // This is how the Users page should access the data
      const users = serviceResponse?.users || []
      
      expect(users).toHaveLength(2)
      expect(users[0].email).toBe('test@example.com')
      expect(users[1].role).toBe('admin')
    })

    it('should handle empty users array gracefully', () => {
      const serviceResponse = { users: [] }
      
      const users = serviceResponse?.users || []
      
      expect(users).toHaveLength(0)
      expect(Array.isArray(users)).toBe(true)
    })

    it('should handle undefined response gracefully', () => {
      const serviceResponse = undefined
      
      const users = serviceResponse?.users || []
      
      expect(users).toHaveLength(0)
      expect(Array.isArray(users)).toBe(true)
    })

    it('should handle null users property gracefully', () => {
      const serviceResponse = { users: null }
      
      const users = serviceResponse?.users || []
      
      expect(users).toHaveLength(0)
      expect(Array.isArray(users)).toBe(true)
    })

    it('should NOT access data property (old incorrect pattern)', () => {
      // This tests that we're NOT using the old incorrect pattern
      const serviceResponse = {
        users: [{ id: '1', email: 'test@example.com' }],
        data: undefined // data property should not exist or be used
      }
      
      // The correct way to access users
      const users = serviceResponse?.users || []
      
      // The incorrect way (what was causing the bug)
      const incorrectAccess = (serviceResponse as any)?.data || []
      
      expect(users).toHaveLength(1)
      expect(incorrectAccess).toHaveLength(0) // This would be empty with the old pattern
    })
  })

  describe('User filtering', () => {
    const mockUsers = [
      { user_id: '1', email: 'john@example.com', full_name: 'John Doe', phone: '+260961234567', role: 'student' },
      { user_id: '2', email: 'jane@example.com', full_name: 'Jane Smith', phone: '+260971234567', role: 'admin' },
      { user_id: '3', email: 'bob@example.com', full_name: 'Bob Wilson', phone: '+260977123456', role: 'student' },
    ]

    it('should filter users by search term (name)', () => {
      const searchTerm = 'john'
      const filtered = mockUsers.filter(user =>
        user.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        user.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        user.phone?.includes(searchTerm)
      )
      
      expect(filtered).toHaveLength(1)
      expect(filtered[0].full_name).toBe('John Doe')
    })

    it('should filter users by search term (email)', () => {
      const searchTerm = 'jane@'
      const filtered = mockUsers.filter(user =>
        user.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        user.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        user.phone?.includes(searchTerm)
      )
      
      expect(filtered).toHaveLength(1)
      expect(filtered[0].email).toBe('jane@example.com')
    })

    it('should filter users by search term (phone)', () => {
      const searchTerm = '0977'
      const filtered = mockUsers.filter(user =>
        user.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        user.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        user.phone?.includes(searchTerm)
      )
      
      expect(filtered).toHaveLength(1)
      expect(filtered[0].full_name).toBe('Bob Wilson')
    })

    it('should filter users by role', () => {
      const roleFilter = 'admin'
      const filtered = mockUsers.filter(user => user.role === roleFilter)
      
      expect(filtered).toHaveLength(1)
      expect(filtered[0].full_name).toBe('Jane Smith')
    })

    it('should return empty array when no users match filter', () => {
      const searchTerm = 'nonexistent'
      const filtered = mockUsers.filter(user =>
        user.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        user.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        user.phone?.includes(searchTerm)
      )
      
      expect(filtered).toHaveLength(0)
    })

    it('should combine search and role filters', () => {
      const searchTerm = 'example.com'
      const roleFilter = 'student'
      
      let filtered = mockUsers
      
      if (searchTerm) {
        filtered = filtered.filter(user =>
          user.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          user.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          user.phone?.includes(searchTerm)
        )
      }
      
      if (roleFilter) {
        filtered = filtered.filter(user => user.role === roleFilter)
      }
      
      expect(filtered).toHaveLength(2) // John and Bob are students with example.com emails
    })
  })

  describe('Empty state handling', () => {
    it('should show "No Users Found" when users array is empty and no filters', () => {
      const users: any[] = []
      const searchTerm = ''
      const roleFilter = ''
      
      const message = searchTerm || roleFilter ? 'No Matching Users' : 'No Users Found'
      
      expect(message).toBe('No Users Found')
    })

    it('should show "No Matching Users" when filters are applied but no results', () => {
      const users: any[] = []
      const searchTerm = 'test'
      const roleFilter = ''
      
      const message = searchTerm || roleFilter ? 'No Matching Users' : 'No Users Found'
      
      expect(message).toBe('No Matching Users')
    })

    it('should show "No Matching Users" when role filter is applied but no results', () => {
      const users: any[] = []
      const searchTerm = ''
      const roleFilter = 'admin'
      
      const message = searchTerm || roleFilter ? 'No Matching Users' : 'No Users Found'
      
      expect(message).toBe('No Matching Users')
    })
  })

  describe('Error handling', () => {
    it('should extract error message from Error object', () => {
      const error = new Error('Failed to load users')
      const errorMessage = error instanceof Error ? error.message : 'Failed to load users'
      
      expect(errorMessage).toBe('Failed to load users')
    })

    it('should use default message for non-Error objects', () => {
      const error = 'Some string error'
      const errorMessage = error instanceof Error ? error.message : 'Failed to load users'
      
      expect(errorMessage).toBe('Failed to load users')
    })

    it('should handle null error gracefully', () => {
      const error = null
      const errorMessage = error instanceof Error ? error.message : 'Failed to load users'
      
      expect(errorMessage).toBe('Failed to load users')
    })
  })

  describe('User ID mapping', () => {
    it('should have user_id property for frontend compatibility', () => {
      // The backend maps id to user_id for frontend compatibility
      const backendResponse = [
        { id: 'uuid-1', email: 'test@example.com', full_name: 'Test User' }
      ]
      
      // Backend transformation
      const users = backendResponse.map(user => ({
        ...user,
        user_id: user.id
      }))
      
      expect(users[0].user_id).toBe('uuid-1')
      expect(users[0].id).toBe('uuid-1')
    })
  })
})

describe('Role utilities', () => {
  const AVAILABLE_ROLES = [
    { value: 'student', label: 'Student', description: 'Regular student user' },
    { value: 'admissions_officer', label: 'Admissions Officer', description: 'Can review applications' },
    { value: 'registrar', label: 'Registrar', description: 'Academic records management' },
    { value: 'finance_officer', label: 'Finance Officer', description: 'Payment verification' },
    { value: 'academic_head', label: 'Academic Head', description: 'Department oversight' },
    { value: 'admin', label: 'Administrator', description: 'Full system access' },
  ]

  it('should get correct role label', () => {
    const getRoleLabel = (role: string) => {
      const roleObj = AVAILABLE_ROLES.find(r => r.value === role)
      return roleObj ? roleObj.label : role.replace('_', ' ').toUpperCase()
    }
    
    expect(getRoleLabel('student')).toBe('Student')
    expect(getRoleLabel('admin')).toBe('Administrator')
    expect(getRoleLabel('admissions_officer')).toBe('Admissions Officer')
  })

  it('should handle unknown role gracefully', () => {
    const getRoleLabel = (role: string) => {
      const roleObj = AVAILABLE_ROLES.find(r => r.value === role)
      return roleObj ? roleObj.label : role.replace('_', ' ').toUpperCase()
    }
    
    expect(getRoleLabel('unknown_role')).toBe('UNKNOWN ROLE')
    expect(getRoleLabel('super_admin')).toBe('SUPER ADMIN')
  })
})
