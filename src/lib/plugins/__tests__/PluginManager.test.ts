/**
 * Plugin Manager Tests
 * Unit tests for the plugin management system
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { PluginManager } from '../PluginManager'
import { PluginManifest, PluginConfig } from '../../../types/plugins'

// Mock dependencies
vi.mock('../../logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn()
  }
}))

vi.mock('../PluginSandbox', () => ({
  PluginSandbox: vi.fn().mockImplementation(() => ({
    initialize: vi.fn().mockResolvedValue(undefined),
    createSandbox: vi.fn().mockReturnValue({
      memoryLimit: 50,
      timeLimit: 30,
      cpuLimit: 10,
      allowedDomains: ['api.mihas.edu.zm'],
      blockedAPIs: ['eval'],
      memoryUsage: 0,
      cpuUsage: 0,
      executionTime: 0
    }),
    executeInSandbox: vi.fn().mockImplementation((context, fn) => fn()),
    cleanup: vi.fn().mockResolvedValue(undefined)
  }))
}))

vi.mock('../PluginAPIProvider', () => ({
  PluginAPIProvider: vi.fn().mockImplementation(() => ({
    initialize: vi.fn().mockResolvedValue(undefined),
    createAPI: vi.fn().mockReturnValue({
      database: {
        query: vi.fn(),
        insert: vi.fn(),
        update: vi.fn(),
        delete: vi.fn()
      },
      notifications: {
        send: vi.fn(),
        schedule: vi.fn()
      },
      analytics: {
        track: vi.fn(),
        identify: vi.fn()
      },
      storage: {
        get: vi.fn(),
        set: vi.fn(),
        delete: vi.fn()
      },
      ui: {
        registerComponent: vi.fn(),
        registerPage: vi.fn(),
        showToast: vi.fn()
      },
      utils: {
        logger: {
          info: vi.fn(),
          warn: vi.fn(),
          error: vi.fn(),
          debug: vi.fn()
        },
        crypto: {
          hash: vi.fn(),
          encrypt: vi.fn(),
          decrypt: vi.fn()
        },
        validation: {
          validateEmail: vi.fn(),
          validatePhone: vi.fn(),
          sanitizeInput: vi.fn()
        }
      }
    })
  }))
}))

vi.mock('../PluginValidator', () => ({
  PluginValidator: vi.fn().mockImplementation(() => ({
    validatePlugin: vi.fn().mockResolvedValue(undefined)
  }))
}))

describe('PluginManager', () => {
  let pluginManager: PluginManager
  let mockManifest: PluginManifest

  beforeEach(() => {
    pluginManager = new PluginManager()
    
    mockManifest = {
      metadata: {
        id: 'test-plugin',
        name: 'Test Plugin',
        version: '1.0.0',
        description: 'A test plugin',
        author: 'Test Author',
        license: 'MIT',
        keywords: ['test'],
        mihasVersion: '3.0.0',
        createdAt: new Date(),
        updatedAt: new Date()
      },
      permissions: {
        system: {
          notifications: true,
          analytics: false,
          storage: true,
          network: false
        }
      },
      entryPoint: 'index.js'
    }
  })

  describe('initialization', () => {
    it('should initialize successfully', async () => {
      await expect(pluginManager.initialize()).resolves.not.toThrow()
    })

    it('should not initialize twice', async () => {
      await pluginManager.initialize()
      await expect(pluginManager.initialize()).resolves.not.toThrow()
    })
  })

  describe('plugin management', () => {
    beforeEach(async () => {
      await pluginManager.initialize()
    })

    it('should start with no plugins', () => {
      expect(pluginManager.getInstalledPlugins()).toHaveLength(0)
      expect(pluginManager.getEnabledPlugins()).toHaveLength(0)
    })

    it('should check plugin enabled status', () => {
      expect(pluginManager.isPluginEnabled('non-existent')).toBe(false)
    })

    it('should return undefined for non-existent plugin config', () => {
      expect(pluginManager.getPluginConfig('non-existent')).toBeUndefined()
    })
  })

  describe('plugin configuration', () => {
    beforeEach(async () => {
      await pluginManager.initialize()
    })

    it('should update plugin config for existing plugin', async () => {
      // First we need to simulate having a plugin installed
      const mockConfig: PluginConfig = {
        enabled: false,
        permissions: mockManifest.permissions,
        autoStart: false,
        priority: 0
      }

      // Manually add to registry for testing
      ;(pluginManager as any).registry.configs.set('test-plugin', mockConfig)

      const newConfig = { autoStart: true, priority: 5 }
      await pluginManager.updatePluginConfig('test-plugin', newConfig)

      const updatedConfig = pluginManager.getPluginConfig('test-plugin')
      expect(updatedConfig?.autoStart).toBe(true)
      expect(updatedConfig?.priority).toBe(5)
    })

    it('should throw error for non-existent plugin config update', async () => {
      await expect(
        pluginManager.updatePluginConfig('non-existent', { autoStart: true })
      ).rejects.toThrow('Plugin non-existent not found')
    })
  })

  describe('event system', () => {
    beforeEach(async () => {
      await pluginManager.initialize()
    })

    it('should add and remove event listeners', () => {
      const listener = vi.fn()
      
      pluginManager.addEventListener('test-event', listener)
      pluginManager.removeEventListener('test-event', listener)
      
      // Emit event to verify listener was removed
      ;(pluginManager as any).emitEvent('test-event', 'test-plugin', {})
      expect(listener).not.toHaveBeenCalled()
    })

    it('should handle listener errors gracefully', () => {
      const faultyListener = vi.fn().mockImplementation(() => {
        throw new Error('Listener error')
      })
      
      pluginManager.addEventListener('test-event', faultyListener)
      
      // Should not throw when emitting event
      expect(() => {
        ;(pluginManager as any).emitEvent('test-event', 'test-plugin', {})
      }).not.toThrow()
      
      expect(faultyListener).toHaveBeenCalled()
    })
  })

  describe('shutdown', () => {
    it('should shutdown gracefully', async () => {
      await pluginManager.initialize()
      await expect(pluginManager.shutdown()).resolves.not.toThrow()
    })

    it('should shutdown without initialization', async () => {
      await expect(pluginManager.shutdown()).resolves.not.toThrow()
    })
  })
})

describe('PluginManager Error Handling', () => {
  let pluginManager: PluginManager

  beforeEach(() => {
    pluginManager = new PluginManager()
  })

  it('should handle sandbox initialization failure', async () => {
    // Mock sandbox to throw error
    const mockSandbox = {
      initialize: vi.fn().mockRejectedValue(new Error('Sandbox init failed')),
      createSandbox: vi.fn(),
      executeInSandbox: vi.fn(),
      cleanup: vi.fn()
    }
    
    ;(pluginManager as any).sandbox = mockSandbox

    await expect(pluginManager.initialize()).rejects.toThrow()
  })

  it('should handle API provider initialization failure', async () => {
    // Mock API provider to throw error
    const mockAPIProvider = {
      initialize: vi.fn().mockRejectedValue(new Error('API provider init failed')),
      createAPI: vi.fn()
    }
    
    ;(pluginManager as any).apiProvider = mockAPIProvider

    await expect(pluginManager.initialize()).rejects.toThrow()
  })
})