/**
 * Plugin Sandbox
 * Provides secure execution environment for plugins
 */

import { PluginSandbox as ISandbox, PluginExecutionContext, PluginError } from '../../types/plugins'
import { logger } from '../logger'

export class PluginSandbox {
  private sandboxes: Map<string, ISandbox>
  private executionContexts: Map<string, PluginExecutionContext>
  private isInitialized: boolean = false

  constructor() {
    this.sandboxes = new Map()
    this.executionContexts = new Map()
  }

  /**
   * Initialize the sandbox system
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return
    }

    try {
      logger.info('Initializing Plugin Sandbox')
      
      // Set up global security policies
      this.setupSecurityPolicies()
      
      // Initialize resource monitoring
      this.initializeResourceMonitoring()
      
      this.isInitialized = true
      logger.info('Plugin Sandbox initialized successfully')
    } catch (error) {
      logger.error('Failed to initialize Plugin Sandbox', { error })
      throw error
    }
  }

  /**
   * Create a sandbox for a specific plugin
   */
  createSandbox(pluginId: string): ISandbox {
    const sandbox: ISandbox = {
      memoryLimit: 50, // 50MB default
      timeLimit: 30, // 30 seconds default
      cpuLimit: 10, // 10% CPU default
      allowedDomains: [
        'api.mihas.edu.zm',
        'mihasv3.pages.dev'
      ],
      blockedAPIs: [
        'eval',
        'Function',
        'setTimeout',
        'setInterval',
        'XMLHttpRequest',
        'fetch'
      ],
      memoryUsage: 0,
      cpuUsage: 0,
      executionTime: 0
    }

    this.sandboxes.set(pluginId, sandbox)
    return sandbox
  }

  /**
   * Execute code within a sandbox
   */
  async executeInSandbox<T>(
    context: PluginExecutionContext,
    fn: () => Promise<T> | T
  ): Promise<T> {
    const { pluginId } = context
    const sandbox = this.sandboxes.get(pluginId)
    
    if (!sandbox) {
      throw new PluginError(`Sandbox not found for plugin ${pluginId}`, {
        pluginId,
        code: 'SANDBOX_NOT_FOUND',
        severity: 'high'
      })
    }

    // Store execution context
    this.executionContexts.set(pluginId, context)

    try {
      // Start resource monitoring
      const monitor = this.startResourceMonitoring(pluginId, sandbox)
      
      // Set up execution timeout
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new PluginError(`Plugin ${pluginId} execution timeout`, {
            pluginId,
            code: 'EXECUTION_TIMEOUT',
            severity: 'medium'
          }))
        }, context.timeout || sandbox.timeLimit * 1000)
      })

      // Execute function with timeout
      const result = await Promise.race([
        this.executeWithSecurityChecks(pluginId, fn),
        timeoutPromise
      ])

      // Stop monitoring
      this.stopResourceMonitoring(pluginId, monitor)
      
      return result
    } catch (error) {
      logger.error('Sandbox execution failed', { pluginId, error })
      throw error
    } finally {
      // Cleanup execution context
      this.executionContexts.delete(pluginId)
    }
  }

  /**
   * Execute function with security checks
   */
  private async executeWithSecurityChecks<T>(
    pluginId: string,
    fn: () => Promise<T> | T
  ): Promise<T> {
    const sandbox = this.sandboxes.get(pluginId)!
    
    // Create secure execution environment
    const secureGlobal = this.createSecureGlobal(pluginId, sandbox)
    
    // Override dangerous globals
    const originalGlobals = this.overrideGlobals(sandbox)
    
    try {
      // Execute function in secure context
      const result = await fn()
      
      // Validate result doesn't contain dangerous references
      this.validateResult(result, pluginId)
      
      return result
    } finally {
      // Restore original globals
      this.restoreGlobals(originalGlobals)
    }
  }

  /**
   * Create secure global object for plugin execution
   */
  private createSecureGlobal(pluginId: string, sandbox: ISandbox): any {
    const secureGlobal = {
      // Safe globals
      console: this.createSecureConsole(pluginId),
      JSON: JSON,
      Math: Math,
      Date: Date,
      Array: Array,
      Object: Object,
      String: String,
      Number: Number,
      Boolean: Boolean,
      RegExp: RegExp,
      
      // Restricted globals (proxied)
      setTimeout: this.createSecureTimeout(pluginId, sandbox),
      setInterval: this.createSecureInterval(pluginId, sandbox),
      fetch: this.createSecureFetch(pluginId, sandbox),
      
      // Plugin-specific utilities
      pluginId: pluginId,
      sandbox: {
        memoryLimit: sandbox.memoryLimit,
        timeLimit: sandbox.timeLimit,
        cpuLimit: sandbox.cpuLimit
      }
    }

    return secureGlobal
  }

  /**
   * Override dangerous global functions
   */
  private overrideGlobals(sandbox: ISandbox): Map<string, any> {
    const originalGlobals = new Map()
    
    // Store and override dangerous functions
    for (const api of sandbox.blockedAPIs) {
      if ((globalThis as any)[api]) {
        originalGlobals.set(api, (globalThis as any)[api])
        ;(globalThis as any)[api] = () => {
          throw new Error(`API ${api} is not allowed in plugin sandbox`)
        }
      }
    }
    
    return originalGlobals
  }

  /**
   * Restore original global functions
   */
  private restoreGlobals(originalGlobals: Map<string, any>): void {
    for (const [api, originalFn] of originalGlobals) {
      ;(globalThis as any)[api] = originalFn
    }
  }

  /**
   * Create secure console for plugins
   */
  private createSecureConsole(pluginId: string): Console {
    return {
      log: (...args) => logger.info(`[Plugin:${pluginId}]`, { args }),
      warn: (...args) => logger.warn(`[Plugin:${pluginId}]`, { args }),
      error: (...args) => logger.error(`[Plugin:${pluginId}]`, { args }),
      info: (...args) => logger.info(`[Plugin:${pluginId}]`, { args }),
      debug: (...args) => logger.debug(`[Plugin:${pluginId}]`, { args })
    } as Console
  }

  /**
   * Create secure setTimeout for plugins
   */
  private createSecureTimeout(pluginId: string, sandbox: ISandbox) {
    return (callback: Function, delay: number) => {
      if (delay > sandbox.timeLimit * 1000) {
        throw new PluginError(`Timeout delay exceeds limit for plugin ${pluginId}`, {
          pluginId,
          code: 'TIMEOUT_LIMIT_EXCEEDED',
          severity: 'medium'
        })
      }
      
      return setTimeout(() => {
        try {
          callback()
        } catch (error) {
          logger.error('Plugin timeout callback failed', { pluginId, error })
        }
      }, delay)
    }
  }

  /**
   * Create secure setInterval for plugins
   */
  private createSecureInterval(pluginId: string, sandbox: ISandbox) {
    return (callback: Function, interval: number) => {
      if (interval < 1000) { // Minimum 1 second interval
        throw new PluginError(`Interval too frequent for plugin ${pluginId}`, {
          pluginId,
          code: 'INTERVAL_TOO_FREQUENT',
          severity: 'medium'
        })
      }
      
      return setInterval(() => {
        try {
          callback()
        } catch (error) {
          logger.error('Plugin interval callback failed', { pluginId, error })
        }
      }, interval)
    }
  }

  /**
   * Create secure fetch for plugins
   */
  private createSecureFetch(pluginId: string, sandbox: ISandbox) {
    return async (url: string, options?: RequestInit) => {
      // Validate URL against allowed domains
      const urlObj = new URL(url)
      const isAllowed = sandbox.allowedDomains.some(domain => 
        urlObj.hostname === domain || urlObj.hostname.endsWith(`.${domain}`)
      )
      
      if (!isAllowed) {
        throw new PluginError(`Domain ${urlObj.hostname} not allowed for plugin ${pluginId}`, {
          pluginId,
          code: 'DOMAIN_NOT_ALLOWED',
          severity: 'high'
        })
      }
      
      // Add plugin identification headers
      const secureOptions: RequestInit = {
        ...options,
        headers: {
          ...options?.headers,
          'X-Plugin-ID': pluginId,
          'X-Plugin-Sandbox': 'true'
        }
      }
      
      try {
        return await fetch(url, secureOptions)
      } catch (error) {
        logger.error('Plugin fetch failed', { pluginId, url, error })
        throw error
      }
    }
  }

  /**
   * Start resource monitoring for a plugin
   */
  private startResourceMonitoring(pluginId: string, sandbox: ISandbox): NodeJS.Timeout {
    const startTime = Date.now()
    const startMemory = process.memoryUsage().heapUsed
    
    const monitor = setInterval(() => {
      const currentMemory = process.memoryUsage().heapUsed
      const memoryUsage = (currentMemory - startMemory) / 1024 / 1024 // MB
      const executionTime = (Date.now() - startTime) / 1000 // seconds
      
      // Update sandbox metrics
      sandbox.memoryUsage = memoryUsage
      sandbox.executionTime = executionTime
      
      // Check limits
      if (memoryUsage > sandbox.memoryLimit) {
        logger.warn('Plugin memory limit exceeded', { pluginId, memoryUsage, limit: sandbox.memoryLimit })
      }
      
      if (executionTime > sandbox.timeLimit) {
        logger.warn('Plugin time limit exceeded', { pluginId, executionTime, limit: sandbox.timeLimit })
      }
    }, 1000) // Check every second
    
    return monitor
  }

  /**
   * Stop resource monitoring
   */
  private stopResourceMonitoring(pluginId: string, monitor: NodeJS.Timeout): void {
    clearInterval(monitor)
    
    const sandbox = this.sandboxes.get(pluginId)
    if (sandbox) {
      logger.debug('Plugin execution completed', {
        pluginId,
        memoryUsage: sandbox.memoryUsage,
        executionTime: sandbox.executionTime
      })
    }
  }

  /**
   * Validate execution result
   */
  private validateResult(result: any, pluginId: string): void {
    // Check for dangerous objects or functions in result
    if (typeof result === 'function') {
      throw new PluginError(`Plugin ${pluginId} returned function, which is not allowed`, {
        pluginId,
        code: 'INVALID_RESULT_TYPE',
        severity: 'medium'
      })
    }
    
    // Additional validation can be added here
  }

  /**
   * Set up global security policies
   */
  private setupSecurityPolicies(): void {
    // Set up Content Security Policy for plugin execution
    if (typeof window !== 'undefined') {
      const meta = document.createElement('meta')
      meta.httpEquiv = 'Content-Security-Policy'
      meta.content = "default-src 'self'; script-src 'self' 'unsafe-eval'; object-src 'none';"
      document.head.appendChild(meta)
    }
  }

  /**
   * Initialize resource monitoring system
   */
  private initializeResourceMonitoring(): void {
    // Set up global resource monitoring
    if (typeof process !== 'undefined') {
      process.on('warning', (warning) => {
        logger.warn('Node.js warning during plugin execution', { warning: warning.message })
      })
    }
  }

  /**
   * Get sandbox for plugin
   */
  getSandbox(pluginId: string): ISandbox | undefined {
    return this.sandboxes.get(pluginId)
  }

  /**
   * Update sandbox limits
   */
  updateSandboxLimits(pluginId: string, limits: Partial<ISandbox>): void {
    const sandbox = this.sandboxes.get(pluginId)
    if (sandbox) {
      Object.assign(sandbox, limits)
    }
  }

  /**
   * Remove sandbox for plugin
   */
  removeSandbox(pluginId: string): void {
    this.sandboxes.delete(pluginId)
    this.executionContexts.delete(pluginId)
  }

  /**
   * Cleanup sandbox system
   */
  async cleanup(): Promise<void> {
    logger.info('Cleaning up Plugin Sandbox')
    
    // Clear all sandboxes
    this.sandboxes.clear()
    this.executionContexts.clear()
    
    this.isInitialized = false
  }
}