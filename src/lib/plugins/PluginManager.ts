/**
 * Plugin Manager
 * Core plugin management system for MIHAS
 */

import { 
  Plugin, 
  PluginManifest, 
  PluginConfig, 
  PluginRegistry, 
  PluginError, 
  PluginEvent,
  PluginInstallOptions,
  PluginUpdateOptions,
  PluginExecutionContext,
  PluginAPI
} from '../../types/plugins'
import { PluginSandbox } from './PluginSandbox'
import { PluginAPIProvider } from './PluginAPIProvider'
import { PluginValidator } from './PluginValidator'
import { logger } from '../logger'

export class PluginManager {
  private registry: PluginRegistry
  private sandbox: PluginSandbox
  private apiProvider: PluginAPIProvider
  private validator: PluginValidator
  private eventListeners: Map<string, ((event: PluginEvent) => void)[]>
  private isInitialized: boolean = false

  constructor() {
    this.registry = {
      plugins: new Map(),
      manifests: new Map(),
      configs: new Map()
    }
    this.sandbox = new PluginSandbox()
    this.apiProvider = new PluginAPIProvider()
    this.validator = new PluginValidator()
    this.eventListeners = new Map()
  }

  /**
   * Initialize the plugin manager
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return
    }

    try {
      logger.info('Initializing Plugin Manager')
      
      // Initialize sandbox
      await this.sandbox.initialize()
      
      // Initialize API provider
      await this.apiProvider.initialize()
      
      // Load installed plugins
      await this.loadInstalledPlugins()
      
      // Auto-start enabled plugins
      await this.autoStartPlugins()
      
      this.isInitialized = true
      this.emitEvent('manager:initialized', 'system', {})
      
      logger.info('Plugin Manager initialized successfully')
    } catch (error) {
      logger.error('Failed to initialize Plugin Manager', { error })
      throw new PluginError('Failed to initialize Plugin Manager', {
        pluginId: 'system',
        code: 'MANAGER_INIT_FAILED',
        severity: 'critical'
      })
    }
  }

  /**
   * Install a plugin
   */
  async installPlugin(options: PluginInstallOptions): Promise<void> {
    try {
      logger.info('Installing plugin', { options })
      
      // Download/load plugin manifest
      const manifest = await this.loadPluginManifest(options)
      
      // Validate plugin
      await this.validator.validatePlugin(manifest)
      
      // Check dependencies
      if (!options.skipDependencies) {
        await this.checkDependencies(manifest)
      }
      
      // Install plugin files
      await this.installPluginFiles(manifest, options)
      
      // Register plugin
      this.registry.manifests.set(manifest.metadata.id, manifest)
      
      // Create default config
      const defaultConfig: PluginConfig = {
        enabled: false,
        permissions: manifest.permissions,
        autoStart: false,
        priority: 0
      }
      this.registry.configs.set(manifest.metadata.id, defaultConfig)
      
      // Run install hook if plugin is loaded
      const plugin = this.registry.plugins.get(manifest.metadata.id)
      if (plugin && plugin.hooks.onInstall) {
        await this.executePluginHook(manifest.metadata.id, 'onInstall')
      }
      
      this.emitEvent('plugin:installed', manifest.metadata.id, { manifest })
      logger.info('Plugin installed successfully', { pluginId: manifest.metadata.id })
      
    } catch (error) {
      logger.error('Failed to install plugin', { error, options })
      throw error
    }
  }

  /**
   * Uninstall a plugin
   */
  async uninstallPlugin(pluginId: string): Promise<void> {
    try {
      logger.info('Uninstalling plugin', { pluginId })
      
      // Check if plugin exists
      if (!this.registry.manifests.has(pluginId)) {
        throw new PluginError(`Plugin ${pluginId} not found`, {
          pluginId,
          code: 'PLUGIN_NOT_FOUND',
          severity: 'medium'
        })
      }
      
      // Disable plugin if enabled
      if (this.isPluginEnabled(pluginId)) {
        await this.disablePlugin(pluginId)
      }
      
      // Run uninstall hook
      const plugin = this.registry.plugins.get(pluginId)
      if (plugin && plugin.hooks.onUninstall) {
        await this.executePluginHook(pluginId, 'onUninstall')
      }
      
      // Remove plugin files
      await this.removePluginFiles(pluginId)
      
      // Remove from registry
      this.registry.plugins.delete(pluginId)
      this.registry.manifests.delete(pluginId)
      this.registry.configs.delete(pluginId)
      
      this.emitEvent('plugin:uninstalled', pluginId, {})
      logger.info('Plugin uninstalled successfully', { pluginId })
      
    } catch (error) {
      logger.error('Failed to uninstall plugin', { error, pluginId })
      throw error
    }
  }

  /**
   * Enable a plugin
   */
  async enablePlugin(pluginId: string): Promise<void> {
    try {
      logger.info('Enabling plugin', { pluginId })
      
      const config = this.registry.configs.get(pluginId)
      if (!config) {
        throw new PluginError(`Plugin ${pluginId} not found`, {
          pluginId,
          code: 'PLUGIN_NOT_FOUND',
          severity: 'medium'
        })
      }
      
      if (config.enabled) {
        logger.warn('Plugin already enabled', { pluginId })
        return
      }
      
      // Load plugin if not loaded
      if (!this.registry.plugins.has(pluginId)) {
        await this.loadPlugin(pluginId)
      }
      
      // Initialize plugin
      const plugin = this.registry.plugins.get(pluginId)!
      const api = this.apiProvider.createAPI(pluginId, config.permissions)
      await plugin.initialize(api)
      
      // Run enable hook
      if (plugin.hooks.onEnable) {
        await this.executePluginHook(pluginId, 'onEnable')
      }
      
      // Update config
      config.enabled = true
      this.registry.configs.set(pluginId, config)
      
      this.emitEvent('plugin:enabled', pluginId, {})
      logger.info('Plugin enabled successfully', { pluginId })
      
    } catch (error) {
      logger.error('Failed to enable plugin', { error, pluginId })
      throw error
    }
  }

  /**
   * Disable a plugin
   */
  async disablePlugin(pluginId: string): Promise<void> {
    try {
      logger.info('Disabling plugin', { pluginId })
      
      const config = this.registry.configs.get(pluginId)
      if (!config) {
        throw new PluginError(`Plugin ${pluginId} not found`, {
          pluginId,
          code: 'PLUGIN_NOT_FOUND',
          severity: 'medium'
        })
      }
      
      if (!config.enabled) {
        logger.warn('Plugin already disabled', { pluginId })
        return
      }
      
      // Run disable hook
      const plugin = this.registry.plugins.get(pluginId)
      if (plugin && plugin.hooks.onDisable) {
        await this.executePluginHook(pluginId, 'onDisable')
      }
      
      // Cleanup plugin
      if (plugin) {
        await plugin.cleanup()
      }
      
      // Update config
      config.enabled = false
      this.registry.configs.set(pluginId, config)
      
      this.emitEvent('plugin:disabled', pluginId, {})
      logger.info('Plugin disabled successfully', { pluginId })
      
    } catch (error) {
      logger.error('Failed to disable plugin', { error, pluginId })
      throw error
    }
  }

  /**
   * Update a plugin
   */
  async updatePlugin(pluginId: string, options: PluginUpdateOptions): Promise<void> {
    try {
      logger.info('Updating plugin', { pluginId, options })
      
      const currentManifest = this.registry.manifests.get(pluginId)
      if (!currentManifest) {
        throw new PluginError(`Plugin ${pluginId} not found`, {
          pluginId,
          code: 'PLUGIN_NOT_FOUND',
          severity: 'medium'
        })
      }
      
      // Backup current version if requested
      if (options.backup) {
        await this.backupPlugin(pluginId)
      }
      
      // Download new version
      const newManifest = await this.downloadPluginUpdate(pluginId, options.version)
      
      // Validate new version
      await this.validator.validatePlugin(newManifest)
      
      // Run update hook
      const plugin = this.registry.plugins.get(pluginId)
      if (plugin && plugin.hooks.onUpdate) {
        await this.executePluginHook(pluginId, 'onUpdate', [
          currentManifest.metadata.version,
          newManifest.metadata.version
        ])
      }
      
      // Update plugin files
      await this.updatePluginFiles(pluginId, newManifest)
      
      // Update registry
      this.registry.manifests.set(pluginId, newManifest)
      
      // Reload plugin if enabled
      if (this.isPluginEnabled(pluginId)) {
        await this.disablePlugin(pluginId)
        await this.enablePlugin(pluginId)
      }
      
      this.emitEvent('plugin:updated', pluginId, { 
        oldVersion: currentManifest.metadata.version,
        newVersion: newManifest.metadata.version
      })
      logger.info('Plugin updated successfully', { pluginId })
      
    } catch (error) {
      logger.error('Failed to update plugin', { error, pluginId, options })
      throw error
    }
  }

  /**
   * Get list of installed plugins
   */
  getInstalledPlugins(): PluginManifest[] {
    return Array.from(this.registry.manifests.values())
  }

  /**
   * Get list of enabled plugins
   */
  getEnabledPlugins(): PluginManifest[] {
    return Array.from(this.registry.manifests.values()).filter(manifest => 
      this.isPluginEnabled(manifest.metadata.id)
    )
  }

  /**
   * Check if plugin is enabled
   */
  isPluginEnabled(pluginId: string): boolean {
    const config = this.registry.configs.get(pluginId)
    return config?.enabled || false
  }

  /**
   * Get plugin configuration
   */
  getPluginConfig(pluginId: string): PluginConfig | undefined {
    return this.registry.configs.get(pluginId)
  }

  /**
   * Update plugin configuration
   */
  async updatePluginConfig(pluginId: string, config: Partial<PluginConfig>): Promise<void> {
    const currentConfig = this.registry.configs.get(pluginId)
    if (!currentConfig) {
      throw new PluginError(`Plugin ${pluginId} not found`, {
        pluginId,
        code: 'PLUGIN_NOT_FOUND',
        severity: 'medium'
      })
    }
    
    const newConfig = { ...currentConfig, ...config }
    this.registry.configs.set(pluginId, newConfig)
    
    this.emitEvent('plugin:config_updated', pluginId, { config: newConfig })
  }

  /**
   * Execute plugin hook safely
   */
  private async executePluginHook(pluginId: string, hookName: string, args: any[] = []): Promise<any> {
    const plugin = this.registry.plugins.get(pluginId)
    const config = this.registry.configs.get(pluginId)
    
    if (!plugin || !config) {
      return
    }
    
    const hook = (plugin.hooks as any)[hookName]
    if (!hook || typeof hook !== 'function') {
      return
    }
    
    try {
      const context: PluginExecutionContext = {
        pluginId,
        permissions: config.permissions,
        api: this.apiProvider.createAPI(pluginId, config.permissions),
        sandbox: this.sandbox.createSandbox(pluginId),
        startTime: new Date(),
        timeout: 30000 // 30 seconds default timeout
      }
      
      return await this.sandbox.executeInSandbox(context, () => hook.apply(plugin, args))
    } catch (error) {
      logger.error('Plugin hook execution failed', { pluginId, hookName, error })
      throw new PluginError(`Hook ${hookName} failed in plugin ${pluginId}`, {
        pluginId,
        code: 'HOOK_EXECUTION_FAILED',
        severity: 'medium',
        context: { hookName, args }
      })
    }
  }

  /**
   * Load installed plugins from storage
   */
  private async loadInstalledPlugins(): Promise<void> {
    // Implementation would load from file system or database
    // For now, this is a placeholder
    logger.info('Loading installed plugins')
  }

  /**
   * Auto-start enabled plugins
   */
  private async autoStartPlugins(): Promise<void> {
    const enabledPlugins = this.getEnabledPlugins()
      .filter(manifest => {
        const config = this.registry.configs.get(manifest.metadata.id)
        return config?.autoStart
      })
      .sort((a, b) => {
        const configA = this.registry.configs.get(a.metadata.id)!
        const configB = this.registry.configs.get(b.metadata.id)!
        return (configB.priority || 0) - (configA.priority || 0)
      })
    
    for (const manifest of enabledPlugins) {
      try {
        await this.enablePlugin(manifest.metadata.id)
      } catch (error) {
        logger.error('Failed to auto-start plugin', { 
          pluginId: manifest.metadata.id, 
          error 
        })
      }
    }
  }

  /**
   * Load plugin manifest from various sources
   */
  private async loadPluginManifest(options: PluginInstallOptions): Promise<PluginManifest> {
    // Implementation would handle different sources (local, registry, URL)
    // For now, this is a placeholder
    throw new Error('Not implemented')
  }

  /**
   * Check plugin dependencies
   */
  private async checkDependencies(manifest: PluginManifest): Promise<void> {
    if (!manifest.dependencies) {
      return
    }
    
    for (const dependencyId of manifest.dependencies) {
      if (!this.registry.manifests.has(dependencyId)) {
        throw new PluginError(`Missing dependency: ${dependencyId}`, {
          pluginId: manifest.metadata.id,
          code: 'MISSING_DEPENDENCY',
          severity: 'high'
        })
      }
    }
  }

  /**
   * Install plugin files
   */
  private async installPluginFiles(manifest: PluginManifest, options: PluginInstallOptions): Promise<void> {
    // Implementation would handle file installation
    // For now, this is a placeholder
    logger.info('Installing plugin files', { pluginId: manifest.metadata.id })
  }

  /**
   * Remove plugin files
   */
  private async removePluginFiles(pluginId: string): Promise<void> {
    // Implementation would handle file removal
    // For now, this is a placeholder
    logger.info('Removing plugin files', { pluginId })
  }

  /**
   * Load a plugin
   */
  private async loadPlugin(pluginId: string): Promise<void> {
    // Implementation would dynamically load plugin code
    // For now, this is a placeholder
    logger.info('Loading plugin', { pluginId })
  }

  /**
   * Backup plugin
   */
  private async backupPlugin(pluginId: string): Promise<void> {
    // Implementation would create plugin backup
    // For now, this is a placeholder
    logger.info('Backing up plugin', { pluginId })
  }

  /**
   * Download plugin update
   */
  private async downloadPluginUpdate(pluginId: string, version?: string): Promise<PluginManifest> {
    // Implementation would download plugin update
    // For now, this is a placeholder
    throw new Error('Not implemented')
  }

  /**
   * Update plugin files
   */
  private async updatePluginFiles(pluginId: string, manifest: PluginManifest): Promise<void> {
    // Implementation would update plugin files
    // For now, this is a placeholder
    logger.info('Updating plugin files', { pluginId })
  }

  /**
   * Emit plugin event
   */
  private emitEvent(type: string, pluginId: string, data: any): void {
    const event: PluginEvent = {
      type,
      pluginId,
      timestamp: new Date(),
      data
    }
    
    const listeners = this.eventListeners.get(type) || []
    listeners.forEach(listener => {
      try {
        listener(event)
      } catch (error) {
        logger.error('Plugin event listener failed', { type, pluginId, error })
      }
    })
  }

  /**
   * Add event listener
   */
  addEventListener(type: string, listener: (event: PluginEvent) => void): void {
    if (!this.eventListeners.has(type)) {
      this.eventListeners.set(type, [])
    }
    this.eventListeners.get(type)!.push(listener)
  }

  /**
   * Remove event listener
   */
  removeEventListener(type: string, listener: (event: PluginEvent) => void): void {
    const listeners = this.eventListeners.get(type)
    if (listeners) {
      const index = listeners.indexOf(listener)
      if (index > -1) {
        listeners.splice(index, 1)
      }
    }
  }

  /**
   * Shutdown plugin manager
   */
  async shutdown(): Promise<void> {
    logger.info('Shutting down Plugin Manager')
    
    // Disable all enabled plugins
    const enabledPlugins = this.getEnabledPlugins()
    for (const manifest of enabledPlugins) {
      try {
        await this.disablePlugin(manifest.metadata.id)
      } catch (error) {
        logger.error('Failed to disable plugin during shutdown', { 
          pluginId: manifest.metadata.id, 
          error 
        })
      }
    }
    
    // Cleanup sandbox
    await this.sandbox.cleanup()
    
    this.isInitialized = false
    this.emitEvent('manager:shutdown', 'system', {})
  }
}