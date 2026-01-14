/**
 * Plugin Architecture Type Definitions
 * Defines the core types for the MIHAS plugin system
 */

export interface PluginMetadata {
  id: string
  name: string
  version: string
  description: string
  author: string
  homepage?: string
  repository?: string
  license: string
  keywords: string[]
  dependencies?: Record<string, string>
  peerDependencies?: Record<string, string>
  mihasVersion: string
  createdAt: Date
  updatedAt: Date
}

export interface PluginPermissions {
  // Database access permissions
  database?: {
    read?: string[] // Table names or '*' for all
    write?: string[] // Table names or '*' for all
    execute?: string[] // Function names or '*' for all
  }
  
  // API access permissions
  api?: {
    internal?: string[] // Internal API endpoints
    external?: string[] // External API domains
  }
  
  // File system permissions
  filesystem?: {
    read?: string[] // File paths or patterns
    write?: string[] // File paths or patterns
  }
  
  // UI permissions
  ui?: {
    pages?: string[] // Page routes the plugin can modify
    components?: string[] // Component types the plugin can extend
    hooks?: string[] // React hooks the plugin can use
  }
  
  // System permissions
  system?: {
    notifications?: boolean
    analytics?: boolean
    storage?: boolean
    network?: boolean
  }
}

export interface PluginConfig {
  enabled: boolean
  permissions: PluginPermissions
  settings?: Record<string, any>
  environment?: 'development' | 'staging' | 'production'
  autoStart?: boolean
  priority?: number // Loading order priority
}

export interface PluginHooks {
  // Lifecycle hooks
  onInstall?: () => Promise<void>
  onUninstall?: () => Promise<void>
  onEnable?: () => Promise<void>
  onDisable?: () => Promise<void>
  onUpdate?: (oldVersion: string, newVersion: string) => Promise<void>
  
  // Application hooks
  onApplicationSubmit?: (applicationData: any) => Promise<any>
  onApplicationReview?: (applicationId: string, reviewData: any) => Promise<any>
  onEligibilityCheck?: (studentData: any) => Promise<any>
  onNotificationSend?: (notification: any) => Promise<any>
  
  // UI hooks
  onPageLoad?: (pageName: string, pageData: any) => Promise<any>
  onComponentRender?: (componentName: string, props: any) => Promise<any>
  
  // System hooks
  onSystemStart?: () => Promise<void>
  onSystemShutdown?: () => Promise<void>
  onError?: (error: Error, context: any) => Promise<void>
}

export interface PluginAPI {
  // Core system access
  database: {
    query: (sql: string, params?: any[]) => Promise<any>
    insert: (table: string, data: any) => Promise<any>
    update: (table: string, id: string, data: any) => Promise<any>
    delete: (table: string, id: string) => Promise<void>
  }
  
  // Notification system
  notifications: {
    send: (type: string, recipient: string, message: any) => Promise<void>
    schedule: (type: string, recipient: string, message: any, scheduledAt: Date) => Promise<void>
  }
  
  // Analytics system
  analytics: {
    track: (event: string, properties?: any) => Promise<void>
    identify: (userId: string, traits?: any) => Promise<void>
  }
  
  // Storage system
  storage: {
    get: (key: string) => Promise<any>
    set: (key: string, value: any) => Promise<void>
    delete: (key: string) => Promise<void>
  }
  
  // UI system
  ui: {
    registerComponent: (name: string, component: any) => void
    registerPage: (route: string, component: any) => void
    showToast: (message: string, type?: 'success' | 'error' | 'warning' | 'info') => void
  }
  
  // Utility functions
  utils: {
    logger: {
      info: (message: string, meta?: any) => void
      warn: (message: string, meta?: any) => void
      error: (message: string, meta?: any) => void
      debug: (message: string, meta?: any) => void
    }
    crypto: {
      hash: (data: string) => string
      encrypt: (data: string, key: string) => string
      decrypt: (data: string, key: string) => string
    }
    validation: {
      validateEmail: (email: string) => boolean
      validatePhone: (phone: string) => boolean
      sanitizeInput: (input: string) => string
    }
  }
}

export interface Plugin {
  metadata: PluginMetadata
  config: PluginConfig
  hooks: PluginHooks
  
  // Plugin initialization
  initialize: (api: PluginAPI) => Promise<void>
  
  // Plugin cleanup
  cleanup: () => Promise<void>
  
  // Health check
  healthCheck: () => Promise<boolean>
}

export interface PluginManifest {
  metadata: PluginMetadata
  permissions: PluginPermissions
  entryPoint: string // Main plugin file
  assets?: string[] // Additional files
  dependencies?: string[] // Other plugins this depends on
}

export interface PluginRegistry {
  plugins: Map<string, Plugin>
  manifests: Map<string, PluginManifest>
  configs: Map<string, PluginConfig>
}

export interface PluginExecutionContext {
  pluginId: string
  permissions: PluginPermissions
  api: PluginAPI
  sandbox: PluginSandbox
  startTime: Date
  timeout?: number
}

export interface PluginSandbox {
  // Execution limits
  memoryLimit: number // MB
  timeLimit: number // seconds
  cpuLimit: number // percentage
  
  // Security restrictions
  allowedDomains: string[]
  blockedAPIs: string[]
  
  // Resource monitoring
  memoryUsage: number
  cpuUsage: number
  executionTime: number
}

export class PluginError extends Error {
  public readonly pluginId: string
  public readonly code: string
  public readonly severity: 'low' | 'medium' | 'high' | 'critical'
  public readonly context?: any

  constructor(
    message: string,
    options: {
      pluginId: string
      code: string
      severity: 'low' | 'medium' | 'high' | 'critical'
      context?: any
    }
  ) {
    super(message)
    this.name = 'PluginError'
    this.pluginId = options.pluginId
    this.code = options.code
    this.severity = options.severity
    this.context = options.context

    // Maintains proper stack trace for where our error was thrown (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, PluginError)
    }
  }
}

export interface PluginEvent {
  type: string
  pluginId: string
  timestamp: Date
  data?: any
}

export interface PluginInstallOptions {
  source: 'local' | 'registry' | 'url'
  path?: string
  url?: string
  version?: string
  force?: boolean
  skipDependencies?: boolean
}

export interface PluginUpdateOptions {
  version?: string
  force?: boolean
  backup?: boolean
}

export interface PluginSearchResult {
  metadata: PluginMetadata
  downloadUrl: string
  verified: boolean
  rating: number
  downloads: number
}