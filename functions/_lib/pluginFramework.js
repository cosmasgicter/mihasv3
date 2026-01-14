/**
 * Plugin Architecture Framework
 * Provides modular component system for extensions with security controls
 */

import { supabaseAdminClient } from './supabaseClient.js';
import { AuditLogger } from './auditLogger.js';
import { integrationAuditTrail } from './secureIntegration.js';

/**
 * Plugin Registry - Manages plugin discovery and lifecycle
 */
export class PluginRegistry {
  constructor() {
    this.supabase = supabaseAdminClient;
    this.auditLogger = new AuditLogger(this.supabase);
    this.plugins = new Map();
    this.hooks = new Map();
    this.sandboxes = new Map();
  }

  /**
   * Register a plugin
   */
  async registerPlugin(pluginConfig) {
    const {
      name,
      version,
      description,
      author,
      permissions = [],
      hooks = [],
      endpoints = [],
      dependencies = [],
      manifest
    } = pluginConfig;

    try {
      // Validate plugin configuration
      this.validatePluginConfig(pluginConfig);

      // Check security permissions
      const securityCheck = await this.performSecurityCheck(pluginConfig);
      if (!securityCheck.approved) {
        throw new Error(`Security check failed: ${securityCheck.reason}`);
      }

      // Store plugin in database
      const { data: plugin, error } = await this.supabase
        .from('plugins')
        .insert({
          name,
          version,
          description,
          author,
          permissions,
          hooks,
          endpoints,
          dependencies,
          manifest,
          status: 'registered',
          security_hash: securityCheck.hash
        })
        .select()
        .single();

      if (error) throw error;

      // Create plugin sandbox
      const sandbox = await this.createPluginSandbox(plugin);
      this.sandboxes.set(plugin.id, sandbox);

      // Register plugin hooks
      for (const hook of hooks) {
        this.registerHook(plugin.id, hook);
      }

      // Store in memory registry
      this.plugins.set(name, {
        ...plugin,
        sandbox,
        loaded: false,
        instance: null
      });

      await integrationAuditTrail.logActivity({
        integration_name: 'plugin_system',
        action: 'plugin_registered',
        metadata: { plugin_name: name, version, author }
      });

      return plugin;

    } catch (error) {
      throw new Error(`Plugin registration failed: ${error.message}`);
    }
  }

  /**
   * Load and activate a plugin
   */
  async loadPlugin(pluginName) {
    try {
      const pluginData = this.plugins.get(pluginName);
      if (!pluginData) {
        throw new Error('Plugin not found');
      }

      if (pluginData.loaded) {
        return pluginData.instance;
      }

      // Security check before loading
      const securityCheck = await this.verifyPluginSecurity(pluginData);
      if (!securityCheck.valid) {
        throw new Error(`Security verification failed: ${securityCheck.reason}`);
      }

      // Load plugin dependencies
      for (const dependency of pluginData.dependencies) {
        await this.loadPlugin(dependency);
      }

      // Create plugin instance in sandbox
      const instance = await this.createPluginInstance(pluginData);
      
      // Initialize plugin
      if (instance.initialize) {
        await instance.initialize(this.createPluginContext(pluginData));
      }

      // Update plugin status
      await this.supabase
        .from('plugins')
        .update({ 
          status: 'active',
          loaded_at: new Date().toISOString()
        })
        .eq('id', pluginData.id);

      pluginData.loaded = true;
      pluginData.instance = instance;

      await integrationAuditTrail.logActivity({
        integration_name: 'plugin_system',
        action: 'plugin_loaded',
        metadata: { plugin_name: pluginName }
      });

      return instance;

    } catch (error) {
      throw new Error(`Plugin loading failed: ${error.message}`);
    }
  }

  /**
   * Unload a plugin
   */
  async unloadPlugin(pluginName) {
    try {
      const pluginData = this.plugins.get(pluginName);
      if (!pluginData || !pluginData.loaded) {
        return;
      }

      // Call plugin cleanup
      if (pluginData.instance.cleanup) {
        await pluginData.instance.cleanup();
      }

      // Remove hooks
      for (const hook of pluginData.hooks) {
        this.unregisterHook(pluginData.id, hook);
      }

      // Destroy sandbox
      if (this.sandboxes.has(pluginData.id)) {
        await this.destroyPluginSandbox(pluginData.id);
        this.sandboxes.delete(pluginData.id);
      }

      // Update status
      await this.supabase
        .from('plugins')
        .update({ 
          status: 'inactive',
          unloaded_at: new Date().toISOString()
        })
        .eq('id', pluginData.id);

      pluginData.loaded = false;
      pluginData.instance = null;

      await integrationAuditTrail.logActivity({
        integration_name: 'plugin_system',
        action: 'plugin_unloaded',
        metadata: { plugin_name: pluginName }
      });

    } catch (error) {
      throw new Error(`Plugin unloading failed: ${error.message}`);
    }
  }

  /**
   * Execute plugin hook
   */
  async executeHook(hookName, context = {}) {
    const hookPlugins = this.hooks.get(hookName) || [];
    const results = [];

    for (const pluginId of hookPlugins) {
      try {
        const plugin = Array.from(this.plugins.values())
          .find(p => p.id === pluginId);

        if (plugin && plugin.loaded && plugin.instance) {
          const hookMethod = plugin.instance[hookName];
          if (typeof hookMethod === 'function') {
            const result = await hookMethod(context);
            results.push({ pluginId, result });
          }
        }
      } catch (error) {
        console.error(`Hook execution failed for plugin ${pluginId}:`, error);
        results.push({ pluginId, error: error.message });
      }
    }

    return results;
  }

  /**
   * Validate plugin configuration
   */
  validatePluginConfig(config) {
    const required = ['name', 'version', 'description', 'author'];
    for (const field of required) {
      if (!config[field]) {
        throw new Error(`Missing required field: ${field}`);
      }
    }

    // Validate version format
    if (!/^\d+\.\d+\.\d+$/.test(config.version)) {
      throw new Error('Invalid version format. Use semantic versioning (x.y.z)');
    }

    // Validate permissions
    const validPermissions = [
      'read_applications',
      'write_applications',
      'read_users',
      'write_users',
      'send_notifications',
      'access_database',
      'make_http_requests',
      'file_system_access'
    ];

    for (const permission of config.permissions || []) {
      if (!validPermissions.includes(permission)) {
        throw new Error(`Invalid permission: ${permission}`);
      }
    }
  }

  /**
   * Perform security check on plugin
   */
  async performSecurityCheck(config) {
    try {
      // Check for dangerous permissions
      const dangerousPermissions = ['file_system_access', 'access_database'];
      const hasDangerousPerms = config.permissions?.some(p => 
        dangerousPermissions.includes(p)
      );

      if (hasDangerousPerms) {
        // Require additional verification for dangerous permissions
        return {
          approved: false,
          reason: 'Plugin requires dangerous permissions - manual approval needed'
        };
      }

      // Generate security hash
      const crypto = require('crypto');
      const hash = crypto
        .createHash('sha256')
        .update(JSON.stringify(config))
        .digest('hex');

      return {
        approved: true,
        hash
      };

    } catch (error) {
      return {
        approved: false,
        reason: error.message
      };
    }
  }

  /**
   * Verify plugin security before loading
   */
  async verifyPluginSecurity(pluginData) {
    try {
      // Check if plugin has been tampered with
      const currentHash = require('crypto')
        .createHash('sha256')
        .update(JSON.stringify(pluginData.manifest))
        .digest('hex');

      if (currentHash !== pluginData.security_hash) {
        return {
          valid: false,
          reason: 'Plugin manifest has been modified'
        };
      }

      // Check plugin status
      if (pluginData.status === 'blocked') {
        return {
          valid: false,
          reason: 'Plugin has been blocked by administrator'
        };
      }

      return { valid: true };

    } catch (error) {
      return {
        valid: false,
        reason: error.message
      };
    }
  }

  /**
   * Create plugin sandbox environment
   */
  async createPluginSandbox(plugin) {
    const sandbox = {
      id: plugin.id,
      name: plugin.name,
      permissions: plugin.permissions,
      context: {},
      resources: new Map(),
      limits: {
        memory: 50 * 1024 * 1024, // 50MB
        cpu_time: 5000, // 5 seconds
        network_requests: 100,
        database_queries: 50
      },
      usage: {
        memory: 0,
        cpu_time: 0,
        network_requests: 0,
        database_queries: 0
      }
    };

    return sandbox;
  }

  /**
   * Create plugin instance with restricted API
   */
  async createPluginInstance(pluginData) {
    const sandbox = this.sandboxes.get(pluginData.id);
    
    // Create restricted API based on permissions
    const api = this.createRestrictedAPI(pluginData.permissions, sandbox);
    
    // Plugin instance template
    const instance = {
      name: pluginData.name,
      version: pluginData.version,
      api,
      
      // Plugin lifecycle methods (to be implemented by plugin)
      initialize: null,
      cleanup: null,
      
      // Hook methods (to be implemented by plugin)
      ...pluginData.hooks.reduce((acc, hook) => {
        acc[hook] = null;
        return acc;
      }, {})
    };

    return instance;
  }

  /**
   * Create restricted API for plugin
   */
  createRestrictedAPI(permissions, sandbox) {
    const api = {};

    // Database access
    if (permissions.includes('read_applications')) {
      api.getApplications = async (filters = {}) => {
        sandbox.usage.database_queries++;
        if (sandbox.usage.database_queries > sandbox.limits.database_queries) {
          throw new Error('Database query limit exceeded');
        }
        
        const { data, error } = await this.supabase
          .from('applications')
          .select('*')
          .limit(100); // Always limit results
        
        if (error) throw error;
        return data;
      };
    }

    // Notification access
    if (permissions.includes('send_notifications')) {
      api.sendNotification = async (userId, notification) => {
        const { data, error } = await this.supabase
          .from('in_app_notifications')
          .insert({
            user_id: userId,
            title: notification.title,
            content: notification.content,
            type: notification.type || 'info',
            metadata: { source: 'plugin', plugin_id: sandbox.id }
          });
        
        if (error) throw error;
        return data;
      };
    }

    // HTTP requests
    if (permissions.includes('make_http_requests')) {
      api.httpRequest = async (url, options = {}) => {
        sandbox.usage.network_requests++;
        if (sandbox.usage.network_requests > sandbox.limits.network_requests) {
          throw new Error('Network request limit exceeded');
        }

        // Restrict to HTTPS only
        if (!url.startsWith('https://')) {
          throw new Error('Only HTTPS requests are allowed');
        }

        const response = await fetch(url, {
          ...options,
          timeout: 10000 // 10 second timeout
        });

        return {
          status: response.status,
          headers: Object.fromEntries(response.headers.entries()),
          data: await response.json()
        };
      };
    }

    // Logging
    api.log = (level, message, metadata = {}) => {
      console.log(`[Plugin:${sandbox.name}] ${level.toUpperCase()}: ${message}`, metadata);
    };

    return api;
  }

  /**
   * Create plugin context
   */
  createPluginContext(pluginData) {
    return {
      plugin: {
        id: pluginData.id,
        name: pluginData.name,
        version: pluginData.version
      },
      system: {
        version: '1.0',
        environment: process.env.NODE_ENV || 'development'
      }
    };
  }

  /**
   * Register plugin hook
   */
  registerHook(pluginId, hookName) {
    if (!this.hooks.has(hookName)) {
      this.hooks.set(hookName, []);
    }
    this.hooks.get(hookName).push(pluginId);
  }

  /**
   * Unregister plugin hook
   */
  unregisterHook(pluginId, hookName) {
    if (this.hooks.has(hookName)) {
      const plugins = this.hooks.get(hookName);
      const index = plugins.indexOf(pluginId);
      if (index > -1) {
        plugins.splice(index, 1);
      }
    }
  }

  /**
   * Destroy plugin sandbox
   */
  async destroyPluginSandbox(pluginId) {
    const sandbox = this.sandboxes.get(pluginId);
    if (sandbox) {
      // Clean up resources
      sandbox.resources.clear();
      sandbox.context = {};
    }
  }

  /**
   * List all plugins
   */
  async listPlugins(filters = {}) {
    let query = this.supabase
      .from('plugins')
      .select('*');

    if (filters.status) {
      query = query.eq('status', filters.status);
    }

    const { data: plugins, error } = await query
      .order('created_at', { ascending: false });

    if (error) throw error;
    return plugins;
  }

  /**
   * Get plugin details
   */
  async getPlugin(pluginId) {
    const { data: plugin, error } = await this.supabase
      .from('plugins')
      .select('*')
      .eq('id', pluginId)
      .single();

    if (error) throw error;
    return plugin;
  }

  /**
   * Update plugin status
   */
  async updatePluginStatus(pluginId, status) {
    const { data, error } = await this.supabase
      .from('plugins')
      .update({ status })
      .eq('id', pluginId)
      .select()
      .single();

    if (error) throw error;

    await integrationAuditTrail.logActivity({
      integration_name: 'plugin_system',
      action: 'plugin_status_updated',
      metadata: { plugin_id: pluginId, new_status: status }
    });

    return data;
  }
}

/**
 * Plugin Manager - High-level plugin management interface
 */
export class PluginManager {
  constructor() {
    this.registry = new PluginRegistry();
    this.initialized = false;
  }

  /**
   * Initialize plugin system
   */
  async initialize() {
    if (this.initialized) return;

    try {
      // Load all active plugins
      const plugins = await this.registry.listPlugins({ status: 'active' });
      
      for (const plugin of plugins) {
        try {
          await this.registry.loadPlugin(plugin.name);
        } catch (error) {
          console.error(`Failed to load plugin ${plugin.name}:`, error);
        }
      }

      this.initialized = true;

    } catch (error) {
      throw new Error(`Plugin system initialization failed: ${error.message}`);
    }
  }

  /**
   * Install plugin from manifest
   */
  async installPlugin(manifest) {
    try {
      const plugin = await this.registry.registerPlugin(manifest);
      await this.registry.loadPlugin(plugin.name);
      return plugin;
    } catch (error) {
      throw new Error(`Plugin installation failed: ${error.message}`);
    }
  }

  /**
   * Uninstall plugin
   */
  async uninstallPlugin(pluginName) {
    try {
      await this.registry.unloadPlugin(pluginName);
      
      // Remove from database
      const { error } = await this.registry.supabase
        .from('plugins')
        .delete()
        .eq('name', pluginName);

      if (error) throw error;

      await integrationAuditTrail.logActivity({
        integration_name: 'plugin_system',
        action: 'plugin_uninstalled',
        metadata: { plugin_name: plugin