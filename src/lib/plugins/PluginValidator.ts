/**
 * Plugin Validator
 * Validates plugin manifests and security requirements
 */

import { PluginManifest, PluginMetadata, PluginPermissions, PluginError } from '../../types/plugins'
import { logger } from '../logger'

export class PluginValidator {
  private readonly REQUIRED_METADATA_FIELDS = [
    'id', 'name', 'version', 'description', 'author', 'license', 'mihasVersion'
  ]
  
  private readonly ALLOWED_LICENSES = [
    'MIT', 'Apache-2.0', 'GPL-3.0', 'BSD-3-Clause', 'ISC', 'LGPL-2.1'
  ]
  
  private readonly DANGEROUS_PERMISSIONS = [
    'database.write.*',
    'filesystem.write.*',
    'system.network'
  ]

  constructor() {}

  /**
   * Validate a plugin manifest
   */
  async validatePlugin(manifest: PluginManifest): Promise<void> {
    try {
      logger.info('Validating plugin', { pluginId: manifest.metadata.id })
      
      // Validate metadata
      this.validateMetadata(manifest.metadata)
      
      // Validate permissions
      this.validatePermissions(manifest.permissions)
      
      // Validate entry point
      this.validateEntryPoint(manifest.entryPoint)
      
      // Validate dependencies
      if (manifest.dependencies) {
        this.validateDependencies(manifest.dependencies)
      }
      
      // Security validation
      await this.validateSecurity(manifest)
      
      logger.info('Plugin validation successful', { pluginId: manifest.metadata.id })
    } catch (error) {
      logger.error('Plugin validation failed', { 
        pluginId: manifest.metadata.id, 
        error 
      })
      throw error
    }
  }

  /**
   * Validate plugin metadata
   */
  private validateMetadata(metadata: PluginMetadata): void {
    // Check required fields
    for (const field of this.REQUIRED_METADATA_FIELDS) {
      if (!metadata[field as keyof PluginMetadata]) {
        throw new PluginError(`Missing required metadata field: ${field}`, {
          pluginId: metadata.id || 'unknown',
          code: 'INVALID_METADATA',
          severity: 'high'
        })
      }
    }

    // Validate ID format
    if (!/^[a-z0-9-]+$/.test(metadata.id)) {
      throw new PluginError('Plugin ID must contain only lowercase letters, numbers, and hyphens', {
        pluginId: metadata.id,
        code: 'INVALID_PLUGIN_ID',
        severity: 'high'
      })
    }

    // Validate version format (semver)
    if (!/^\d+\.\d+\.\d+(-[a-zA-Z0-9-]+)?$/.test(metadata.version)) {
      throw new PluginError('Plugin version must follow semantic versioning (e.g., 1.0.0)', {
        pluginId: metadata.id,
        code: 'INVALID_VERSION',
        severity: 'high'
      })
    }

    // Validate license
    if (!this.ALLOWED_LICENSES.includes(metadata.license)) {
      throw new PluginError(`License ${metadata.license} is not allowed. Allowed licenses: ${this.ALLOWED_LICENSES.join(', ')}`, {
        pluginId: metadata.id,
        code: 'INVALID_LICENSE',
        severity: 'medium'
      })
    }

    // Validate MIHAS version compatibility
    if (!this.isVersionCompatible(metadata.mihasVersion)) {
      throw new PluginError(`Plugin requires MIHAS version ${metadata.mihasVersion}, but current version is not compatible`, {
        pluginId: metadata.id,
        code: 'VERSION_INCOMPATIBLE',
        severity: 'high'
      })
    }

    // Validate description length
    if (metadata.description.length < 10 || metadata.description.length > 500) {
      throw new PluginError('Plugin description must be between 10 and 500 characters', {
        pluginId: metadata.id,
        code: 'INVALID_DESCRIPTION',
        severity: 'low'
      })
    }

    // Validate keywords
    if (metadata.keywords && metadata.keywords.length > 10) {
      throw new PluginError('Plugin cannot have more than 10 keywords', {
        pluginId: metadata.id,
        code: 'TOO_MANY_KEYWORDS',
        severity: 'low'
      })
    }
  }

  /**
   * Validate plugin permissions
   */
  private validatePermissions(permissions: PluginPermissions): void {
    // Check for dangerous permission combinations
    const requestedPermissions = this.flattenPermissions(permissions)
    const dangerousRequested = requestedPermissions.filter(perm => 
      this.DANGEROUS_PERMISSIONS.some(dangerous => 
        perm.includes(dangerous.replace('*', ''))
      )
    )

    if (dangerousRequested.length > 0) {
      logger.warn('Plugin requests dangerous permissions', { 
        permissions: dangerousRequested 
      })
    }

    // Validate database permissions
    if (permissions.database) {
      this.validateDatabasePermissions(permissions.database)
    }

    // Validate API permissions
    if (permissions.api) {
      this.validateAPIPermissions(permissions.api)
    }

    // Validate filesystem permissions
    if (permissions.filesystem) {
      this.validateFilesystemPermissions(permissions.filesystem)
    }

    // Validate UI permissions
    if (permissions.ui) {
      this.validateUIPermissions(permissions.ui)
    }
  }

  /**
   * Validate database permissions
   */
  private validateDatabasePermissions(dbPerms: NonNullable<PluginPermissions['database']>): void {
    const allowedTables = [
      'applications', 'users', 'notifications', 'analytics_events',
      'plugin_data', 'plugin_settings'
    ]

    // Check read permissions
    if (dbPerms.read) {
      for (const table of dbPerms.read) {
        if (table !== '*' && !allowedTables.includes(table)) {
          throw new PluginError(`Database read access to table '${table}' is not allowed`, {
            pluginId: 'unknown',
            code: 'INVALID_DB_PERMISSION',
            severity: 'high'
          })
        }
      }
    }

    // Check write permissions (more restrictive)
    if (dbPerms.write) {
      const allowedWriteTables = ['plugin_data', 'plugin_settings', 'analytics_events']
      for (const table of dbPerms.write) {
        if (table !== '*' && !allowedWriteTables.includes(table)) {
          throw new PluginError(`Database write access to table '${table}' is not allowed`, {
            pluginId: 'unknown',
            code: 'INVALID_DB_PERMISSION',
            severity: 'high'
          })
        }
      }
    }

    // Check execute permissions
    if (dbPerms.execute) {
      const allowedFunctions = ['get_application_data', 'update_plugin_settings']
      for (const func of dbPerms.execute) {
        if (func !== '*' && !allowedFunctions.includes(func)) {
          throw new PluginError(`Database execute access to function '${func}' is not allowed`, {
            pluginId: 'unknown',
            code: 'INVALID_DB_PERMISSION',
            severity: 'high'
          })
        }
      }
    }
  }

  /**
   * Validate API permissions
   */
  private validateAPIPermissions(apiPerms: NonNullable<PluginPermissions['api']>): void {
    // Check internal API permissions
    if (apiPerms.internal) {
      const allowedEndpoints = [
        '/api/applications', '/api/notifications', '/api/analytics',
        '/api/users/profile', '/api/plugins'
      ]
      
      for (const endpoint of apiPerms.internal) {
        if (!allowedEndpoints.some(allowed => endpoint.startsWith(allowed))) {
          throw new PluginError(`Internal API access to '${endpoint}' is not allowed`, {
            pluginId: 'unknown',
            code: 'INVALID_API_PERMISSION',
            severity: 'high'
          })
        }
      }
    }

    // Check external API permissions
    if (apiPerms.external) {
      const allowedDomains = [
        'api.mihas.edu.zm', 'apply.mihas.edu.zm', 'hpcz.org.zm',
        'gnc.org.zm', 'ecz.org.zm'
      ]
      
      for (const domain of apiPerms.external) {
        if (!allowedDomains.includes(domain)) {
          throw new PluginError(`External API access to '${domain}' is not allowed`, {
            pluginId: 'unknown',
            code: 'INVALID_API_PERMISSION',
            severity: 'medium'
          })
        }
      }
    }
  }

  /**
   * Validate filesystem permissions
   */
  private validateFilesystemPermissions(fsPerms: NonNullable<PluginPermissions['filesystem']>): void {
    const allowedPaths = [
      '/tmp/plugins', '/var/plugins', './plugins/data'
    ]

    // Check read permissions
    if (fsPerms.read) {
      for (const path of fsPerms.read) {
        if (!allowedPaths.some(allowed => path.startsWith(allowed))) {
          throw new PluginError(`Filesystem read access to '${path}' is not allowed`, {
            pluginId: 'unknown',
            code: 'INVALID_FS_PERMISSION',
            severity: 'high'
          })
        }
      }
    }

    // Check write permissions (more restrictive)
    if (fsPerms.write) {
      const allowedWritePaths = ['/tmp/plugins', './plugins/data']
      for (const path of fsPerms.write) {
        if (!allowedWritePaths.some(allowed => path.startsWith(allowed))) {
          throw new PluginError(`Filesystem write access to '${path}' is not allowed`, {
            pluginId: 'unknown',
            code: 'INVALID_FS_PERMISSION',
            severity: 'high'
          })
        }
      }
    }
  }

  /**
   * Validate UI permissions
   */
  private validateUIPermissions(uiPerms: NonNullable<PluginPermissions['ui']>): void {
    // Check page permissions
    if (uiPerms.pages) {
      const restrictedPages = ['/admin/system', '/admin/security', '/admin/plugins']
      for (const page of uiPerms.pages) {
        if (page !== '*' && restrictedPages.includes(page)) {
          throw new PluginError(`UI access to page '${page}' is not allowed`, {
            pluginId: 'unknown',
            code: 'INVALID_UI_PERMISSION',
            severity: 'medium'
          })
        }
      }
    }

    // Check component permissions
    if (uiPerms.components) {
      const restrictedComponents = ['AdminPanel', 'SecuritySettings', 'SystemConfig']
      for (const component of uiPerms.components) {
        if (component !== '*' && restrictedComponents.includes(component)) {
          throw new PluginError(`UI access to component '${component}' is not allowed`, {
            pluginId: 'unknown',
            code: 'INVALID_UI_PERMISSION',
            severity: 'medium'
          })
        }
      }
    }
  }

  /**
   * Validate entry point
   */
  private validateEntryPoint(entryPoint: string): void {
    // Check file extension
    if (!entryPoint.endsWith('.js') && !entryPoint.endsWith('.ts')) {
      throw new PluginError('Entry point must be a JavaScript or TypeScript file', {
        pluginId: 'unknown',
        code: 'INVALID_ENTRY_POINT',
        severity: 'high'
      })
    }

    // Check for path traversal
    if (entryPoint.includes('..') || entryPoint.includes('~')) {
      throw new PluginError('Entry point cannot contain path traversal sequences', {
        pluginId: 'unknown',
        code: 'INVALID_ENTRY_POINT',
        severity: 'high'
      })
    }

    // Check length
    if (entryPoint.length > 255) {
      throw new PluginError('Entry point path is too long', {
        pluginId: 'unknown',
        code: 'INVALID_ENTRY_POINT',
        severity: 'medium'
      })
    }
  }

  /**
   * Validate dependencies
   */
  private validateDependencies(dependencies: string[]): void {
    // Check dependency count
    if (dependencies.length > 20) {
      throw new PluginError('Plugin cannot have more than 20 dependencies', {
        pluginId: 'unknown',
        code: 'TOO_MANY_DEPENDENCIES',
        severity: 'medium'
      })
    }

    // Check for circular dependencies (basic check)
    const uniqueDeps = new Set(dependencies)
    if (uniqueDeps.size !== dependencies.length) {
      throw new PluginError('Plugin has duplicate dependencies', {
        pluginId: 'unknown',
        code: 'DUPLICATE_DEPENDENCIES',
        severity: 'low'
      })
    }

    // Validate dependency IDs
    for (const dep of dependencies) {
      if (!/^[a-z0-9-]+$/.test(dep)) {
        throw new PluginError(`Invalid dependency ID: ${dep}`, {
          pluginId: 'unknown',
          code: 'INVALID_DEPENDENCY_ID',
          severity: 'medium'
        })
      }
    }
  }

  /**
   * Validate security requirements
   */
  private async validateSecurity(manifest: PluginManifest): Promise<void> {
    // Check for known malicious patterns
    const maliciousPatterns = [
      'eval(', 'Function(', 'document.write', 'innerHTML =',
      'crypto.subtle', 'localStorage.', 'sessionStorage.'
    ]

    // This would normally scan the actual plugin code
    // For now, we'll do basic manifest validation
    
    // Check if plugin requests excessive permissions
    const permissionCount = this.countPermissions(manifest.permissions)
    if (permissionCount > 10) {
      logger.warn('Plugin requests many permissions', { 
        pluginId: manifest.metadata.id,
        permissionCount 
      })
    }

    // Check for suspicious metadata
    if (manifest.metadata.description.toLowerCase().includes('admin') && 
        manifest.permissions.ui?.pages?.includes('*')) {
      logger.warn('Plugin with admin-related description requests broad UI access', {
        pluginId: manifest.metadata.id
      })
    }
  }

  /**
   * Check version compatibility
   */
  private isVersionCompatible(requiredVersion: string): boolean {
    // Simple version check - in production, this would be more sophisticated
    const currentVersion = '3.0.0' // MIHAS version
    const [reqMajor, reqMinor] = requiredVersion.split('.').map(Number)
    const [curMajor, curMinor] = currentVersion.split('.').map(Number)
    
    // Major version must match, minor version must be <= current
    return reqMajor === curMajor && reqMinor <= curMinor
  }

  /**
   * Flatten permissions for analysis
   */
  private flattenPermissions(permissions: PluginPermissions): string[] {
    const flattened: string[] = []
    
    if (permissions.database) {
      if (permissions.database.read) {
        flattened.push(...permissions.database.read.map(t => `database.read.${t}`))
      }
      if (permissions.database.write) {
        flattened.push(...permissions.database.write.map(t => `database.write.${t}`))
      }
      if (permissions.database.execute) {
        flattened.push(...permissions.database.execute.map(f => `database.execute.${f}`))
      }
    }
    
    if (permissions.api) {
      if (permissions.api.internal) {
        flattened.push(...permissions.api.internal.map(e => `api.internal.${e}`))
      }
      if (permissions.api.external) {
        flattened.push(...permissions.api.external.map(d => `api.external.${d}`))
      }
    }
    
    if (permissions.filesystem) {
      if (permissions.filesystem.read) {
        flattened.push(...permissions.filesystem.read.map(p => `filesystem.read.${p}`))
      }
      if (permissions.filesystem.write) {
        flattened.push(...permissions.filesystem.write.map(p => `filesystem.write.${p}`))
      }
    }
    
    if (permissions.ui) {
      if (permissions.ui.pages) {
        flattened.push(...permissions.ui.pages.map(p => `ui.pages.${p}`))
      }
      if (permissions.ui.components) {
        flattened.push(...permissions.ui.components.map(c => `ui.components.${c}`))
      }
    }
    
    if (permissions.system) {
      Object.entries(permissions.system).forEach(([key, value]) => {
        if (value) flattened.push(`system.${key}`)
      })
    }
    
    return flattened
  }

  /**
   * Count total permissions
   */
  private countPermissions(permissions: PluginPermissions): number {
    return this.flattenPermissions(permissions).length
  }
}