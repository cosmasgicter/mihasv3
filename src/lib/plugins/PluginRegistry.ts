// @ts-nocheck
/**
 * Plugin Registry
 * Manages plugin discovery, installation, and configuration
 * 
 * @deprecated This module uses the deprecated Supabase stub.
 * TODO: Migrate to API endpoints when plugin registry is reactivated.
 */

import { 
  PluginManifest, 
  PluginConfig, 
  PluginSearchResult, 
  PluginInstallOptions,
  PluginError 
} from '../../types/plugins'
import { logger } from '../logger'
import { supabase } from '../supabase'

export class PluginRegistry {
  private readonly REGISTRY_URL = 'https://apply.mihas.edu.zm/plugins'
  private readonly LOCAL_REGISTRY_TABLE = 'plugin_registry'
  
  constructor() {}

  /**
   * Search for plugins in the registry
   */
  async searchPlugins(query: string, filters?: {
    category?: string
    author?: string
    verified?: boolean
    minRating?: number
  }): Promise<PluginSearchResult[]> {
    try {
      logger.info('Searching plugins', { query, filters })
      
      // Search local registry first
      const localResults = await this.searchLocalRegistry(query, filters)
      
      // Search remote registry if enabled
      const remoteResults = await this.searchRemoteRegistry(query, filters)
      
      // Combine and deduplicate results
      const allResults = [...localResults, ...remoteResults]
      const uniqueResults = this.deduplicateResults(allResults)
      
      // Sort by relevance and rating
      return uniqueResults.sort((a, b) => {
        // Verified plugins first
        if (a.verified !== b.verified) {
          return a.verified ? -1 : 1
        }
        
        // Then by rating
        if (a.rating !== b.rating) {
          return b.rating - a.rating
        }
        
        // Then by downloads
        return b.downloads - a.downloads
      })
    } catch (error) {
      logger.error('Plugin search failed', { query, filters, error })
      throw new PluginError('Failed to search plugins', {
        pluginId: 'registry',
        code: 'SEARCH_FAILED',
        severity: 'medium',
        context: { query, filters }
      })
    }
  }

  /**
   * Get plugin details by ID
   */
  async getPluginDetails(pluginId: string): Promise<PluginSearchResult | null> {
    try {
      logger.info('Getting plugin details', { pluginId })
      
      // Check local registry first
      const { data: localPlugin, error: localError } = await supabase
        .from(this.LOCAL_REGISTRY_TABLE)
        .select('*')
        .eq('plugin_id', pluginId)
        .single()
      
      if (localPlugin && !localError) {
        return this.mapLocalPluginToResult(localPlugin)
      }
      
      // Check remote registry
      const remotePlugin = await this.getRemotePluginDetails(pluginId)
      if (remotePlugin) {
        return remotePlugin
      }
      
      return null
    } catch (error) {
      logger.error('Failed to get plugin details', { pluginId, error })
      throw error
    }
  }

  /**
   * Download plugin manifest
   */
  async downloadPluginManifest(pluginId: string, version?: string): Promise<PluginManifest> {
    try {
      logger.info('Downloading plugin manifest', { pluginId, version })
      
      const pluginDetails = await this.getPluginDetails(pluginId)
      if (!pluginDetails) {
        throw new PluginError(`Plugin ${pluginId} not found in registry`, {
          pluginId,
          code: 'PLUGIN_NOT_FOUND',
          severity: 'high'
        })
      }
      
      // Download manifest from URL
      const manifestUrl = `${pluginDetails.downloadUrl}/manifest.json`
      const response = await fetch(manifestUrl)
      
      if (!response.ok) {
        throw new PluginError(`Failed to download manifest for ${pluginId}`, {
          pluginId,
          code: 'MANIFEST_DOWNLOAD_FAILED',
          severity: 'high'
        })
      }
      
      const manifest: PluginManifest = await response.json()
      
      // Validate manifest structure
      this.validateManifestStructure(manifest)
      
      return manifest
    } catch (error) {
      logger.error('Failed to download plugin manifest', { pluginId, version, error })
      throw error
    }
  }

  /**
   * Register a plugin in the local registry
   */
  async registerPlugin(manifest: PluginManifest, downloadUrl: string): Promise<void> {
    try {
      logger.info('Registering plugin in local registry', { 
        pluginId: manifest.metadata.id 
      })
      
      const { error } = await supabase
        .from(this.LOCAL_REGISTRY_TABLE)
        .upsert({
          plugin_id: manifest.metadata.id,
          name: manifest.metadata.name,
          version: manifest.metadata.version,
          description: manifest.metadata.description,
          author: manifest.metadata.author,
          license: manifest.metadata.license,
          keywords: manifest.metadata.keywords,
          download_url: downloadUrl,
          manifest: manifest,
          verified: false,
          rating: 0,
          downloads: 0,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
      
      if (error) {
        throw new PluginError(`Failed to register plugin ${manifest.metadata.id}`, {
          pluginId: manifest.metadata.id,
          code: 'REGISTRATION_FAILED',
          severity: 'medium',
          context: { error }
        })
      }
      
      logger.info('Plugin registered successfully', { 
        pluginId: manifest.metadata.id 
      })
    } catch (error) {
      logger.error('Failed to register plugin', { 
        pluginId: manifest.metadata.id, 
        error 
      })
      throw error
    }
  }

  /**
   * Unregister a plugin from the local registry
   */
  async unregisterPlugin(pluginId: string): Promise<void> {
    try {
      logger.info('Unregistering plugin from local registry', { pluginId })
      
      const { error } = await supabase
        .from(this.LOCAL_REGISTRY_TABLE)
        .delete()
        .eq('plugin_id', pluginId)
      
      if (error) {
        throw new PluginError(`Failed to unregister plugin ${pluginId}`, {
          pluginId,
          code: 'UNREGISTRATION_FAILED',
          severity: 'medium',
          context: { error }
        })
      }
      
      logger.info('Plugin unregistered successfully', { pluginId })
    } catch (error) {
      logger.error('Failed to unregister plugin', { pluginId, error })
      throw error
    }
  }

  /**
   * Update plugin rating
   */
  async updatePluginRating(pluginId: string, rating: number): Promise<void> {
    try {
      if (rating < 1 || rating > 5) {
        throw new PluginError('Rating must be between 1 and 5', {
          pluginId,
          code: 'INVALID_RATING',
          severity: 'low'
        })
      }
      
      const { error } = await supabase
        .from(this.LOCAL_REGISTRY_TABLE)
        .update({ 
          rating,
          updated_at: new Date().toISOString()
        })
        .eq('plugin_id', pluginId)
      
      if (error) {
        throw new PluginError(`Failed to update rating for plugin ${pluginId}`, {
          pluginId,
          code: 'RATING_UPDATE_FAILED',
          severity: 'low',
          context: { error }
        })
      }
      
      logger.info('Plugin rating updated', { pluginId, rating })
    } catch (error) {
      logger.error('Failed to update plugin rating', { pluginId, rating, error })
      throw error
    }
  }

  /**
   * Increment plugin download count
   */
  async incrementDownloadCount(pluginId: string): Promise<void> {
    try {
      const { error } = await supabase.rpc('increment_plugin_downloads', {
        plugin_id: pluginId
      })
      
      if (error) {
        logger.warn('Failed to increment download count', { pluginId, error })
        // Don't throw error for download count - it's not critical
      }
    } catch (error) {
      logger.warn('Failed to increment download count', { pluginId, error })
    }
  }

  /**
   * Get popular plugins
   */
  async getPopularPlugins(limit: number = 10): Promise<PluginSearchResult[]> {
    try {
      const { data, error } = await supabase
        .from(this.LOCAL_REGISTRY_TABLE)
        .select('*')
        .order('downloads', { ascending: false })
        .order('rating', { ascending: false })
        .limit(limit)
      
      if (error) {
        throw new PluginError('Failed to get popular plugins', {
          pluginId: 'registry',
          code: 'POPULAR_PLUGINS_FAILED',
          severity: 'low',
          context: { error }
        })
      }
      
      return data.map(plugin => this.mapLocalPluginToResult(plugin))
    } catch (error) {
      logger.error('Failed to get popular plugins', { error })
      throw error
    }
  }

  /**
   * Get recently updated plugins
   */
  async getRecentPlugins(limit: number = 10): Promise<PluginSearchResult[]> {
    try {
      const { data, error } = await supabase
        .from(this.LOCAL_REGISTRY_TABLE)
        .select('*')
        .order('updated_at', { ascending: false })
        .limit(limit)
      
      if (error) {
        throw new PluginError('Failed to get recent plugins', {
          pluginId: 'registry',
          code: 'RECENT_PLUGINS_FAILED',
          severity: 'low',
          context: { error }
        })
      }
      
      return data.map(plugin => this.mapLocalPluginToResult(plugin))
    } catch (error) {
      logger.error('Failed to get recent plugins', { error })
      throw error
    }
  }

  /**
   * Search local registry
   */
  private async searchLocalRegistry(
    query: string, 
    filters?: any
  ): Promise<PluginSearchResult[]> {
    let queryBuilder = supabase
      .from(this.LOCAL_REGISTRY_TABLE)
      .select('*')
    
    // Add text search
    if (query) {
      queryBuilder = queryBuilder.or(
        `name.ilike.%${query}%,description.ilike.%${query}%,keywords.cs.{${query}}`
      )
    }
    
    // Add filters
    if (filters?.author) {
      queryBuilder = queryBuilder.eq('author', filters.author)
    }
    
    if (filters?.verified !== undefined) {
      queryBuilder = queryBuilder.eq('verified', filters.verified)
    }
    
    if (filters?.minRating) {
      queryBuilder = queryBuilder.gte('rating', filters.minRating)
    }
    
    const { data, error } = await queryBuilder
    
    if (error) {
      logger.error('Local registry search failed', { error })
      return []
    }
    
    return data.map(plugin => this.mapLocalPluginToResult(plugin))
  }

  /**
   * Search remote registry
   */
  private async searchRemoteRegistry(
    query: string, 
    filters?: any
  ): Promise<PluginSearchResult[]> {
    try {
      const searchParams = new URLSearchParams({
        q: query,
        ...(filters?.category && { category: filters.category }),
        ...(filters?.author && { author: filters.author }),
        ...(filters?.verified !== undefined && { verified: filters.verified.toString() }),
        ...(filters?.minRating && { minRating: filters.minRating.toString() })
      })
      
      const response = await fetch(`${this.REGISTRY_URL}/search?${searchParams}`)
      
      if (!response.ok) {
        logger.warn('Remote registry search failed', { 
          status: response.status,
          statusText: response.statusText 
        })
        return []
      }
      
      const results = await response.json()
      return results.plugins || []
    } catch (error) {
      logger.warn('Remote registry search failed', { error })
      return []
    }
  }

  /**
   * Get remote plugin details
   */
  private async getRemotePluginDetails(pluginId: string): Promise<PluginSearchResult | null> {
    try {
      const response = await fetch(`${this.REGISTRY_URL}/plugins/${pluginId}`)
      
      if (!response.ok) {
        return null
      }
      
      return await response.json()
    } catch (error) {
      logger.warn('Failed to get remote plugin details', { pluginId, error })
      return null
    }
  }

  /**
   * Map local plugin data to search result
   */
  private mapLocalPluginToResult(plugin: any): PluginSearchResult {
    return {
      metadata: {
        id: plugin.plugin_id,
        name: plugin.name,
        version: plugin.version,
        description: plugin.description,
        author: plugin.author,
        license: plugin.license,
        keywords: plugin.keywords || [],
        mihasVersion: plugin.manifest?.metadata?.mihasVersion || '3.0.0',
        createdAt: new Date(plugin.created_at),
        updatedAt: new Date(plugin.updated_at)
      },
      downloadUrl: plugin.download_url,
      verified: plugin.verified || false,
      rating: plugin.rating || 0,
      downloads: plugin.downloads || 0
    }
  }

  /**
   * Deduplicate search results
   */
  private deduplicateResults(results: PluginSearchResult[]): PluginSearchResult[] {
    const seen = new Set<string>()
    return results.filter(result => {
      const key = result.metadata.id
      if (seen.has(key)) {
        return false
      }
      seen.add(key)
      return true
    })
  }

  /**
   * Validate manifest structure
   */
  private validateManifestStructure(manifest: any): void {
    if (!manifest.metadata || !manifest.permissions || !manifest.entryPoint) {
      throw new PluginError('Invalid manifest structure', {
        pluginId: manifest.metadata?.id || 'unknown',
        code: 'INVALID_MANIFEST_STRUCTURE',
        severity: 'high'
      })
    }
  }
}