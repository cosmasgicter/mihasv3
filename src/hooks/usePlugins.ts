/**
 * React Hook for Plugin Management
 * Provides React integration for the plugin system
 */

import { useState, useEffect, useCallback } from 'react'
import { 
  getPluginManager, 
  PluginManifest, 
  PluginConfig, 
  PluginEvent,
  PluginSearchResult,
  PluginInstallOptions,
  PluginUpdateOptions
} from '../lib/plugins'
import { logger } from '../lib/logger'

export interface UsePluginsReturn {
  // State
  plugins: PluginManifest[]
  enabledPlugins: PluginManifest[]
  isLoading: boolean
  error: string | null
  
  // Actions
  installPlugin: (options: PluginInstallOptions) => Promise<void>
  uninstallPlugin: (pluginId: string) => Promise<void>
  enablePlugin: (pluginId: string) => Promise<void>
  disablePlugin: (pluginId: string) => Promise<void>
  updatePlugin: (pluginId: string, options?: PluginUpdateOptions) => Promise<void>
  updatePluginConfig: (pluginId: string, config: Partial<PluginConfig>) => Promise<void>
  
  // Queries
  searchPlugins: (query: string, filters?: any) => Promise<PluginSearchResult[]>
  getPluginConfig: (pluginId: string) => PluginConfig | undefined
  isPluginEnabled: (pluginId: string) => boolean
  
  // Utilities
  refreshPlugins: () => Promise<void>
}

export function usePlugins(): UsePluginsReturn {
  const [plugins, setPlugins] = useState<PluginManifest[]>([])
  const [enabledPlugins, setEnabledPlugins] = useState<PluginManifest[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const pluginManager = getPluginManager()

  /**
   * Load plugins from manager
   */
  const loadPlugins = useCallback(async () => {
    try {
      setIsLoading(true)
      setError(null)
      
      const installedPlugins = pluginManager.getInstalledPlugins()
      const enabledPluginsList = pluginManager.getEnabledPlugins()
      
      setPlugins(installedPlugins)
      setEnabledPlugins(enabledPluginsList)
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load plugins'
      setError(errorMessage)
      logger.error('Failed to load plugins in hook', { error: err })
    } finally {
      setIsLoading(false)
    }
  }, [pluginManager])

  /**
   * Install a plugin
   */
  const installPlugin = useCallback(async (options: PluginInstallOptions) => {
    try {
      setIsLoading(true)
      setError(null)
      
      await pluginManager.installPlugin(options)
      await loadPlugins()
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to install plugin'
      setError(errorMessage)
      throw err
    } finally {
      setIsLoading(false)
    }
  }, [pluginManager, loadPlugins])

  /**
   * Uninstall a plugin
   */
  const uninstallPlugin = useCallback(async (pluginId: string) => {
    try {
      setIsLoading(true)
      setError(null)
      
      await pluginManager.uninstallPlugin(pluginId)
      await loadPlugins()
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to uninstall plugin'
      setError(errorMessage)
      throw err
    } finally {
      setIsLoading(false)
    }
  }, [pluginManager, loadPlugins])

  /**
   * Enable a plugin
   */
  const enablePlugin = useCallback(async (pluginId: string) => {
    try {
      setError(null)
      
      await pluginManager.enablePlugin(pluginId)
      await loadPlugins()
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to enable plugin'
      setError(errorMessage)
      throw err
    }
  }, [pluginManager, loadPlugins])

  /**
   * Disable a plugin
   */
  const disablePlugin = useCallback(async (pluginId: string) => {
    try {
      setError(null)
      
      await pluginManager.disablePlugin(pluginId)
      await loadPlugins()
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to disable plugin'
      setError(errorMessage)
      throw err
    }
  }, [pluginManager, loadPlugins])

  /**
   * Update a plugin
   */
  const updatePlugin = useCallback(async (pluginId: string, options: PluginUpdateOptions = {}) => {
    try {
      setIsLoading(true)
      setError(null)
      
      await pluginManager.updatePlugin(pluginId, options)
      await loadPlugins()
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to update plugin'
      setError(errorMessage)
      throw err
    } finally {
      setIsLoading(false)
    }
  }, [pluginManager, loadPlugins])

  /**
   * Update plugin configuration
   */
  const updatePluginConfig = useCallback(async (pluginId: string, config: Partial<PluginConfig>) => {
    try {
      setError(null)
      
      await pluginManager.updatePluginConfig(pluginId, config)
      await loadPlugins()
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to update plugin config'
      setError(errorMessage)
      throw err
    }
  }, [pluginManager, loadPlugins])

  /**
   * Search for plugins
   */
  const searchPlugins = useCallback(async (query: string, filters?: any): Promise<PluginSearchResult[]> => {
    try {
      // This would use the PluginRegistry to search
      // For now, return empty array as placeholder
      return []
    } catch (err) {
      logger.error('Failed to search plugins', { query, filters, error: err })
      return []
    }
  }, [])

  /**
   * Get plugin configuration
   */
  const getPluginConfig = useCallback((pluginId: string): PluginConfig | undefined => {
    return pluginManager.getPluginConfig(pluginId)
  }, [pluginManager])

  /**
   * Check if plugin is enabled
   */
  const isPluginEnabled = useCallback((pluginId: string): boolean => {
    return pluginManager.isPluginEnabled(pluginId)
  }, [pluginManager])

  /**
   * Refresh plugins list
   */
  const refreshPlugins = useCallback(async () => {
    await loadPlugins()
  }, [loadPlugins])

  // Set up event listeners
  useEffect(() => {
    const handlePluginEvent = (event: PluginEvent) => {
      // Refresh plugins on relevant events
      if (event.type.includes('installed') || 
          event.type.includes('uninstalled') || 
          event.type.includes('enabled') || 
          event.type.includes('disabled')) {
        loadPlugins()
      }
    }

    // Add event listeners
    pluginManager.addEventListener('plugin:installed', handlePluginEvent)
    pluginManager.addEventListener('plugin:uninstalled', handlePluginEvent)
    pluginManager.addEventListener('plugin:enabled', handlePluginEvent)
    pluginManager.addEventListener('plugin:disabled', handlePluginEvent)
    pluginManager.addEventListener('plugin:updated', handlePluginEvent)

    return () => {
      // Remove event listeners
      pluginManager.removeEventListener('plugin:installed', handlePluginEvent)
      pluginManager.removeEventListener('plugin:uninstalled', handlePluginEvent)
      pluginManager.removeEventListener('plugin:enabled', handlePluginEvent)
      pluginManager.removeEventListener('plugin:disabled', handlePluginEvent)
      pluginManager.removeEventListener('plugin:updated', handlePluginEvent)
    }
  }, [pluginManager, loadPlugins])

  // Load plugins on mount
  useEffect(() => {
    loadPlugins()
  }, [loadPlugins])

  return {
    plugins,
    enabledPlugins,
    isLoading,
    error,
    installPlugin,
    uninstallPlugin,
    enablePlugin,
    disablePlugin,
    updatePlugin,
    updatePluginConfig,
    searchPlugins,
    getPluginConfig,
    isPluginEnabled,
    refreshPlugins
  }
}

/**
 * Hook for plugin development and testing
 */
export function usePluginDevelopment() {
  const [devPlugins, setDevPlugins] = useState<Map<string, any>>(new Map())
  
  const registerDevPlugin = useCallback((pluginId: string, plugin: any) => {
    setDevPlugins(prev => new Map(prev).set(pluginId, plugin))
  }, [])
  
  const unregisterDevPlugin = useCallback((pluginId: string) => {
    setDevPlugins(prev => {
      const newMap = new Map(prev)
      newMap.delete(pluginId)
      return newMap
    })
  }, [])
  
  const getDevPlugin = useCallback((pluginId: string) => {
    return devPlugins.get(pluginId)
  }, [devPlugins])
  
  return {
    devPlugins: Array.from(devPlugins.entries()),
    registerDevPlugin,
    unregisterDevPlugin,
    getDevPlugin
  }
}