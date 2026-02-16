// @ts-nocheck
/**
 * Plugin API Provider
 * Provides secure API access for plugins
 */

import { PluginAPI, PluginPermissions, PluginError } from '../../types/plugins'
import { apiClient } from '@/services/client'
import { logger } from '../logger'
import { multiChannelNotifications } from '../multiChannelNotifications'
import { analytics } from '../analytics'
import { secureStorage } from '../secureStorage'

export class PluginAPIProvider {
  private isInitialized: boolean = false

  constructor() {}

  /**
   * Initialize the API provider
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return
    }

    try {
      logger.info('Initializing Plugin API Provider')
      this.isInitialized = true
      logger.info('Plugin API Provider initialized successfully')
    } catch (error) {
      logger.error('Failed to initialize Plugin API Provider', { error })
      throw error
    }
  }

  /**
   * Create API instance for a plugin with specific permissions
   */
  createAPI(pluginId: string, permissions: PluginPermissions): PluginAPI {
    return {
      database: this.createDatabaseAPI(pluginId, permissions.database),
      notifications: this.createNotificationsAPI(pluginId, permissions.system?.notifications),
      analytics: this.createAnalyticsAPI(pluginId, permissions.system?.analytics),
      storage: this.createStorageAPI(pluginId, permissions.system?.storage),
      ui: this.createUIAPI(pluginId, permissions.ui),
      utils: this.createUtilsAPI(pluginId)
    }
  }

  /**
   * Create database API with permission checks
   */
  private createDatabaseAPI(pluginId: string, permissions?: PluginPermissions['database']) {
    return {
      query: async (sql: string, params?: any[]) => {
        this.checkDatabasePermission(pluginId, 'execute', sql, permissions)
        
        try {
          const { data, error } = await supabase.rpc('execute_plugin_query', {
            plugin_id: pluginId,
            query: sql,
            parameters: params || []
          })
          
          if (error) {
            throw new PluginError(`Database query failed for plugin ${pluginId}`, {
              pluginId,
              code: 'DATABASE_QUERY_FAILED',
              severity: 'medium',
              context: { sql, error }
            })
          }
          
          return data
        } catch (error) {
          logger.error('Plugin database query failed', { pluginId, sql, error })
          throw error
        }
      },

      insert: async (table: string, data: any) => {
        this.checkDatabasePermission(pluginId, 'write', table, permissions)
        
        try {
          const { data: result, error } = await supabase
            .from(table)
            .insert({
              ...data,
              created_by_plugin: pluginId,
              created_at: new Date().toISOString()
            })
            .select()
          
          if (error) {
            throw new PluginError(`Database insert failed for plugin ${pluginId}`, {
              pluginId,
              code: 'DATABASE_INSERT_FAILED',
              severity: 'medium',
              context: { table, error }
            })
          }
          
          return result
        } catch (error) {
          logger.error('Plugin database insert failed', { pluginId, table, error })
          throw error
        }
      },

      update: async (table: string, id: string, data: any) => {
        this.checkDatabasePermission(pluginId, 'write', table, permissions)
        
        try {
          const { data: result, error } = await supabase
            .from(table)
            .update({
              ...data,
              updated_by_plugin: pluginId,
              updated_at: new Date().toISOString()
            })
            .eq('id', id)
            .select()
          
          if (error) {
            throw new PluginError(`Database update failed for plugin ${pluginId}`, {
              pluginId,
              code: 'DATABASE_UPDATE_FAILED',
              severity: 'medium',
              context: { table, id, error }
            })
          }
          
          return result
        } catch (error) {
          logger.error('Plugin database update failed', { pluginId, table, id, error })
          throw error
        }
      },

      delete: async (table: string, id: string) => {
        this.checkDatabasePermission(pluginId, 'write', table, permissions)
        
        try {
          const { error } = await supabase
            .from(table)
            .delete()
            .eq('id', id)
          
          if (error) {
            throw new PluginError(`Database delete failed for plugin ${pluginId}`, {
              pluginId,
              code: 'DATABASE_DELETE_FAILED',
              severity: 'medium',
              context: { table, id, error }
            })
          }
        } catch (error) {
          logger.error('Plugin database delete failed', { pluginId, table, id, error })
          throw error
        }
      }
    }
  }

  /**
   * Create notifications API
   */
  private createNotificationsAPI(pluginId: string, hasPermission?: boolean) {
    return {
      send: async (type: string, recipient: string, message: any) => {
        if (!hasPermission) {
          throw new PluginError(`Plugin ${pluginId} does not have notification permissions`, {
            pluginId,
            code: 'PERMISSION_DENIED',
            severity: 'medium'
          })
        }
        
        try {
          await multiChannelNotifications.send({
            type,
            recipient,
            message: {
              ...message,
              source: `plugin:${pluginId}`
            }
          })
        } catch (error) {
          logger.error('Plugin notification send failed', { pluginId, type, recipient, error })
          throw error
        }
      },

      schedule: async (type: string, recipient: string, message: any, scheduledAt: Date) => {
        if (!hasPermission) {
          throw new PluginError(`Plugin ${pluginId} does not have notification permissions`, {
            pluginId,
            code: 'PERMISSION_DENIED',
            severity: 'medium'
          })
        }
        
        try {
          await multiChannelNotifications.schedule({
            type,
            recipient,
            message: {
              ...message,
              source: `plugin:${pluginId}`
            },
            scheduledAt
          })
        } catch (error) {
          logger.error('Plugin notification schedule failed', { pluginId, type, recipient, error })
          throw error
        }
      }
    }
  }

  /**
   * Create analytics API
   */
  private createAnalyticsAPI(pluginId: string, hasPermission?: boolean) {
    return {
      track: async (event: string, properties?: any) => {
        if (!hasPermission) {
          throw new PluginError(`Plugin ${pluginId} does not have analytics permissions`, {
            pluginId,
            code: 'PERMISSION_DENIED',
            severity: 'medium'
          })
        }
        
        try {
          await analytics.track(`plugin.${event}`, {
            ...properties,
            pluginId,
            source: 'plugin'
          })
        } catch (error) {
          logger.error('Plugin analytics track failed', { pluginId, event, error })
          throw error
        }
      },

      identify: async (userId: string, traits?: any) => {
        if (!hasPermission) {
          throw new PluginError(`Plugin ${pluginId} does not have analytics permissions`, {
            pluginId,
            code: 'PERMISSION_DENIED',
            severity: 'medium'
          })
        }
        
        try {
          await analytics.identify(userId, {
            ...traits,
            lastPluginInteraction: pluginId
          })
        } catch (error) {
          logger.error('Plugin analytics identify failed', { pluginId, userId, error })
          throw error
        }
      }
    }
  }

  /**
   * Create storage API
   */
  private createStorageAPI(pluginId: string, hasPermission?: boolean) {
    return {
      get: async (key: string) => {
        if (!hasPermission) {
          throw new PluginError(`Plugin ${pluginId} does not have storage permissions`, {
            pluginId,
            code: 'PERMISSION_DENIED',
            severity: 'medium'
          })
        }
        
        const namespacedKey = `plugin:${pluginId}:${key}`
        return await secureStorage.get(namespacedKey)
      },

      set: async (key: string, value: any) => {
        if (!hasPermission) {
          throw new PluginError(`Plugin ${pluginId} does not have storage permissions`, {
            pluginId,
            code: 'PERMISSION_DENIED',
            severity: 'medium'
          })
        }
        
        const namespacedKey = `plugin:${pluginId}:${key}`
        await secureStorage.set(namespacedKey, value)
      },

      delete: async (key: string) => {
        if (!hasPermission) {
          throw new PluginError(`Plugin ${pluginId} does not have storage permissions`, {
            pluginId,
            code: 'PERMISSION_DENIED',
            severity: 'medium'
          })
        }
        
        const namespacedKey = `plugin:${pluginId}:${key}`
        await secureStorage.delete(namespacedKey)
      }
    }
  }

  /**
   * Create UI API
   */
  private createUIAPI(pluginId: string, permissions?: PluginPermissions['ui']) {
    const registeredComponents = new Map<string, any>()
    const registeredPages = new Map<string, any>()

    return {
      registerComponent: (name: string, component: any) => {
        if (!permissions?.components?.includes(name) && !permissions?.components?.includes('*')) {
          throw new PluginError(`Plugin ${pluginId} does not have permission to register component ${name}`, {
            pluginId,
            code: 'PERMISSION_DENIED',
            severity: 'medium'
          })
        }
        
        const namespacedName = `plugin-${pluginId}-${name}`
        registeredComponents.set(namespacedName, component)
        
        // Emit event for UI system to pick up
        window.dispatchEvent(new CustomEvent('plugin:component:registered', {
          detail: { pluginId, name: namespacedName, component }
        }))
      },

      registerPage: (route: string, component: any) => {
        if (!permissions?.pages?.includes(route) && !permissions?.pages?.includes('*')) {
          throw new PluginError(`Plugin ${pluginId} does not have permission to register page ${route}`, {
            pluginId,
            code: 'PERMISSION_DENIED',
            severity: 'medium'
          })
        }
        
        const namespacedRoute = `/plugins/${pluginId}${route}`
        registeredPages.set(namespacedRoute, component)
        
        // Emit event for router to pick up
        window.dispatchEvent(new CustomEvent('plugin:page:registered', {
          detail: { pluginId, route: namespacedRoute, component }
        }))
      },

      showToast: (message: string, type: 'success' | 'error' | 'warning' | 'info' = 'info') => {
        // Emit toast event
        window.dispatchEvent(new CustomEvent('plugin:toast', {
          detail: { 
            pluginId, 
            message: `[${pluginId}] ${message}`, 
            type 
          }
        }))
      }
    }
  }

  /**
   * Create utilities API
   */
  private createUtilsAPI(pluginId: string) {
    return {
      logger: {
        info: (message: string, meta?: any) => {
          logger.info(`[Plugin:${pluginId}] ${message}`, meta)
        },
        warn: (message: string, meta?: any) => {
          logger.warn(`[Plugin:${pluginId}] ${message}`, meta)
        },
        error: (message: string, meta?: any) => {
          logger.error(`[Plugin:${pluginId}] ${message}`, meta)
        },
        debug: (message: string, meta?: any) => {
          logger.debug(`[Plugin:${pluginId}] ${message}`, meta)
        }
      },

      crypto: {
        hash: (data: string) => {
          // Simple hash function for plugins
          let hash = 0
          for (let i = 0; i < data.length; i++) {
            const char = data.charCodeAt(i)
            hash = ((hash << 5) - hash) + char
            hash = hash & hash // Convert to 32-bit integer
          }
          return hash.toString(36)
        },

        encrypt: (data: string, key: string) => {
          // Simple XOR encryption for plugins (not cryptographically secure)
          let result = ''
          for (let i = 0; i < data.length; i++) {
            result += String.fromCharCode(
              data.charCodeAt(i) ^ key.charCodeAt(i % key.length)
            )
          }
          return btoa(result)
        },

        decrypt: (data: string, key: string) => {
          // Simple XOR decryption for plugins
          const decoded = atob(data)
          let result = ''
          for (let i = 0; i < decoded.length; i++) {
            result += String.fromCharCode(
              decoded.charCodeAt(i) ^ key.charCodeAt(i % key.length)
            )
          }
          return result
        }
      },

      validation: {
        validateEmail: (email: string) => {
          const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
          return emailRegex.test(email)
        },

        validatePhone: (phone: string) => {
          const phoneRegex = /^\+?[\d\s\-\(\)]+$/
          return phoneRegex.test(phone) && phone.replace(/\D/g, '').length >= 10
        },

        sanitizeInput: (input: string) => {
          return input
            .replace(/[<>]/g, '') // Remove potential HTML tags
            .replace(/['"]/g, '') // Remove quotes
            .trim()
        }
      }
    }
  }

  /**
   * Check database permission
   */
  private checkDatabasePermission(
    pluginId: string, 
    operation: 'read' | 'write' | 'execute', 
    target: string, 
    permissions?: PluginPermissions['database']
  ): void {
    if (!permissions) {
      throw new PluginError(`Plugin ${pluginId} does not have database permissions`, {
        pluginId,
        code: 'PERMISSION_DENIED',
        severity: 'high'
      })
    }

    const allowedTargets = permissions[operation]
    if (!allowedTargets) {
      throw new PluginError(`Plugin ${pluginId} does not have ${operation} permissions`, {
        pluginId,
        code: 'PERMISSION_DENIED',
        severity: 'high'
      })
    }

    if (!allowedTargets.includes('*') && !allowedTargets.includes(target)) {
      throw new PluginError(`Plugin ${pluginId} does not have ${operation} permission for ${target}`, {
        pluginId,
        code: 'PERMISSION_DENIED',
        severity: 'high'
      })
    }
  }
}