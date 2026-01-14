/**
 * Plugin System Integration
 * Initializes and manages the plugin system for MIHAS
 */

import { initializePluginSystem, getPluginManager } from './plugins'
import { logger } from './logger'

let isInitialized = false

/**
 * Initialize the plugin system for the MIHAS application
 */
export async function initializeMIHASPluginSystem(): Promise<void> {
  if (isInitialized) {
    logger.warn('Plugin system already initialized')
    return
  }

  try {
    logger.info('Initializing MIHAS Plugin System')
    
    // Initialize the core plugin system
    await initializePluginSystem()
    
    // Set up global event listeners for plugin integration
    setupPluginEventListeners()
    
    // Register built-in plugins if any
    await registerBuiltInPlugins()
    
    isInitialized = true
    logger.info('MIHAS Plugin System initialized successfully')
  } catch (error) {
    logger.error('Failed to initialize MIHAS Plugin System', { error })
    throw error
  }
}

/**
 * Set up event listeners for plugin integration with the main application
 */
function setupPluginEventListeners(): void {
  const pluginManager = getPluginManager()
  
  // Listen for plugin UI registrations
  if (typeof window !== 'undefined') {
    window.addEventListener('plugin:component:registered', (event: any) => {
      const { pluginId, name, component } = event.detail
      logger.info('Plugin component registered', { pluginId, name })
      
      // Integrate with the main UI system
      // This would depend on your specific UI framework
    })
    
    window.addEventListener('plugin:page:registered', (event: any) => {
      const { pluginId, route, component } = event.detail
      logger.info('Plugin page registered', { pluginId, route })
      
      // Integrate with the router
      // This would depend on your specific routing system
    })
    
    window.addEventListener('plugin:toast', (event: any) => {
      const { pluginId, message, type } = event.detail
      logger.info('Plugin toast requested', { pluginId, message, type })
      
      // Show toast using your toast system
      // This would integrate with your notification/toast system
    })
  }
  
  // Listen for plugin lifecycle events
  pluginManager.addEventListener('plugin:installed', (event) => {
    logger.info('Plugin installed', { pluginId: event.pluginId })
    
    // Notify administrators
    // This could send notifications to admin users
  })
  
  pluginManager.addEventListener('plugin:enabled', (event) => {
    logger.info('Plugin enabled', { pluginId: event.pluginId })
    
    // Update UI to reflect plugin availability
    // This could refresh navigation menus, etc.
  })
  
  pluginManager.addEventListener('plugin:disabled', (event) => {
    logger.info('Plugin disabled', { pluginId: event.pluginId })
    
    // Update UI to hide plugin features
    // This could remove navigation items, etc.
  })
  
  pluginManager.addEventListener('plugin:error', (event) => {
    logger.error('Plugin error occurred', { 
      pluginId: event.pluginId, 
      error: event.data 
    })
    
    // Handle plugin errors gracefully
    // This could disable the plugin or show user notifications
  })
}

/**
 * Register built-in plugins that come with MIHAS
 */
async function registerBuiltInPlugins(): Promise<void> {
  const pluginManager = getPluginManager()
  
  try {
    // Example: Register the notification enhancer plugin
    // In a real implementation, you might load these from a configuration file
    
    logger.info('Registering built-in plugins')
    
    // Built-in plugins would be registered here
    // For now, this is just a placeholder
    
    logger.info('Built-in plugins registered successfully')
  } catch (error) {
    logger.error('Failed to register built-in plugins', { error })
    // Don't throw here - built-in plugin failures shouldn't prevent system startup
  }
}

/**
 * Shutdown the plugin system
 */
export async function shutdownMIHASPluginSystem(): Promise<void> {
  if (!isInitialized) {
    return
  }

  try {
    logger.info('Shutting down MIHAS Plugin System')
    
    const pluginManager = getPluginManager()
    await pluginManager.shutdown()
    
    isInitialized = false
    logger.info('MIHAS Plugin System shutdown complete')
  } catch (error) {
    logger.error('Error during plugin system shutdown', { error })
    throw error
  }
}

/**
 * Check if plugin system is initialized
 */
export function isPluginSystemInitialized(): boolean {
  return isInitialized
}

/**
 * Get plugin manager instance (only if initialized)
 */
export function getMIHASPluginManager() {
  if (!isInitialized) {
    throw new Error('Plugin system not initialized. Call initializeMIHASPluginSystem() first.')
  }
  
  return getPluginManager()
}

/**
 * Plugin system utilities for the MIHAS application
 */
export const MIHASPluginUtils = {
  /**
   * Check if a specific plugin is available and enabled
   */
  isPluginAvailable(pluginId: string): boolean {
    if (!isInitialized) return false
    
    try {
      const pluginManager = getPluginManager()
      return pluginManager.isPluginEnabled(pluginId)
    } catch (error) {
      logger.error('Failed to check plugin availability', { pluginId, error })
      return false
    }
  },

  /**
   * Execute a plugin hook safely
   */
  async executePluginHook(hookName: string, data?: any): Promise<void> {
    if (!isInitialized) return
    
    try {
      const pluginManager = getPluginManager()
      const enabledPlugins = pluginManager.getEnabledPlugins()
      
      for (const plugin of enabledPlugins) {
        try {
          // This would execute the hook on each enabled plugin
          // Implementation depends on how hooks are stored and executed
          logger.debug('Executing plugin hook', { 
            pluginId: plugin.metadata.id, 
            hookName 
          })
        } catch (error) {
          logger.error('Plugin hook execution failed', { 
            pluginId: plugin.metadata.id, 
            hookName, 
            error 
          })
          // Continue with other plugins even if one fails
        }
      }
    } catch (error) {
      logger.error('Failed to execute plugin hooks', { hookName, error })
    }
  },

  /**
   * Get plugin statistics
   */
  getPluginStats() {
    if (!isInitialized) {
      return {
        total: 0,
        enabled: 0,
        disabled: 0
      }
    }
    
    try {
      const pluginManager = getPluginManager()
      const allPlugins = pluginManager.getInstalledPlugins()
      const enabledPlugins = pluginManager.getEnabledPlugins()
      
      return {
        total: allPlugins.length,
        enabled: enabledPlugins.length,
        disabled: allPlugins.length - enabledPlugins.length
      }
    } catch (error) {
      logger.error('Failed to get plugin stats', { error })
      return {
        total: 0,
        enabled: 0,
        disabled: 0
      }
    }
  }
}