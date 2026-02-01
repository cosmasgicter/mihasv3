// @ts-nocheck
/**
 * Plugin System Entry Point
 * Main exports for the MIHAS plugin architecture
 */

export { PluginManager } from './PluginManager'
export { PluginSandbox } from './PluginSandbox'
export { PluginAPIProvider } from './PluginAPIProvider'
export { PluginValidator } from './PluginValidator'
export { PluginRegistry } from './PluginRegistry'

// Re-export types
export type {
  Plugin,
  PluginMetadata,
  PluginPermissions,
  PluginConfig,
  PluginManifest,
  PluginRegistry as IPluginRegistry,
  PluginAPI,
  PluginHooks,
  PluginExecutionContext,
  PluginSandbox as IPluginSandbox,
  PluginError,
  PluginEvent,
  PluginInstallOptions,
  PluginUpdateOptions,
  PluginSearchResult
} from '../../types/plugins'

// Create singleton instance
let pluginManagerInstance: PluginManager | null = null

/**
 * Get the global plugin manager instance
 */
export function getPluginManager(): PluginManager {
  if (!pluginManagerInstance) {
    pluginManagerInstance = new PluginManager()
  }
  return pluginManagerInstance
}

/**
 * Initialize the plugin system
 */
export async function initializePluginSystem(): Promise<void> {
  const manager = getPluginManager()
  await manager.initialize()
}

/**
 * Shutdown the plugin system
 */
export async function shutdownPluginSystem(): Promise<void> {
  if (pluginManagerInstance) {
    await pluginManagerInstance.shutdown()
    pluginManagerInstance = null
  }
}

/**
 * Plugin system utilities
 */
export const PluginUtils = {
  /**
   * Create a basic plugin template
   */
  createPluginTemplate(id: string, name: string, author: string): PluginManifest {
    return {
      metadata: {
        id,
        name,
        version: '1.0.0',
        description: `${name} plugin for MIHAS`,
        author,
        license: 'MIT',
        keywords: [],
        mihasVersion: '3.0.0',
        createdAt: new Date(),
        updatedAt: new Date()
      },
      permissions: {
        system: {
          notifications: false,
          analytics: false,
          storage: false,
          network: false
        }
      },
      entryPoint: 'index.js'
    }
  },

  /**
   * Validate plugin ID format
   */
  isValidPluginId(id: string): boolean {
    return /^[a-z0-9-]+$/.test(id) && id.length >= 3 && id.length <= 50
  },

  /**
   * Generate plugin namespace
   */
  generateNamespace(pluginId: string, resource: string): string {
    return `plugin:${pluginId}:${resource}`
  },

  /**
   * Parse plugin namespace
   */
  parseNamespace(namespace: string): { pluginId: string; resource: string } | null {
    const match = namespace.match(/^plugin:([a-z0-9-]+):(.+)$/)
    if (!match) return null
    
    return {
      pluginId: match[1],
      resource: match[2]
    }
  }
}

/**
 * Plugin development helpers
 */
export const PluginDev = {
  /**
   * Create a development plugin instance
   */
  createDevPlugin(manifest: PluginManifest, hooks: PluginHooks): Plugin {
    return {
      metadata: manifest.metadata,
      config: {
        enabled: true,
        permissions: manifest.permissions,
        autoStart: false,
        priority: 0
      },
      hooks,
      
      async initialize(api: PluginAPI) {
        console.log(`[Dev Plugin] Initializing ${manifest.metadata.name}`)
        if (hooks.onEnable) {
          await hooks.onEnable()
        }
      },
      
      async cleanup() {
        console.log(`[Dev Plugin] Cleaning up ${manifest.metadata.name}`)
        if (hooks.onDisable) {
          await hooks.onDisable()
        }
      },
      
      async healthCheck() {
        return true
      }
    }
  },

  /**
   * Mock plugin API for testing
   */
  createMockAPI(pluginId: string): PluginAPI {
    return {
      database: {
        query: async () => ({ data: [], error: null }),
        insert: async () => ({ data: {}, error: null }),
        update: async () => ({ data: {}, error: null }),
        delete: async () => {}
      },
      notifications: {
        send: async () => {},
        schedule: async () => {}
      },
      analytics: {
        track: async () => {},
        identify: async () => {}
      },
      storage: {
        get: async () => null,
        set: async () => {},
        delete: async () => {}
      },
      ui: {
        registerComponent: () => {},
        registerPage: () => {},
        showToast: () => {}
      },
      utils: {
        logger: {
          info: (msg, meta) => console.log(`[${pluginId}] ${msg}`, meta),
          warn: (msg, meta) => console.warn(`[${pluginId}] ${msg}`, meta),
          error: (msg, meta) => console.error(`[${pluginId}] ${msg}`, meta),
          debug: (msg, meta) => console.debug(`[${pluginId}] ${msg}`, meta)
        },
        crypto: {
          hash: (data) => btoa(data),
          encrypt: (data, key) => btoa(data + key),
          decrypt: (data, key) => atob(data).replace(key, '')
        },
        validation: {
          validateEmail: (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email),
          validatePhone: (phone) => /^\+?[\d\s\-\(\)]+$/.test(phone),
          sanitizeInput: (input) => input.replace(/[<>"']/g, '').trim()
        }
      }
    }
  }
}