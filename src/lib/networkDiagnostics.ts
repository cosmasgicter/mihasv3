/**
 * Network Diagnostics Utility
 * Helps diagnose and handle network connectivity issues
 */

import { supabase } from './supabase'

export class NetworkDiagnostics {
  private static instance: NetworkDiagnostics
  private connectionStatus: 'online' | 'offline' | 'slow' = 'online'
  
  static getInstance(): NetworkDiagnostics {
    if (!NetworkDiagnostics.instance) {
      NetworkDiagnostics.instance = new NetworkDiagnostics()
    }
    return NetworkDiagnostics.instance
  }
  
  async testConnection(): Promise<{ status: 'online' | 'offline' | 'slow', latency?: number }> {
    const start = Date.now()
    
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 5000)

    try {
      // Use a same-origin health check so the browser receives proper CORS headers
      const response = await fetch('/api/test', {
        method: 'GET',
        signal: controller.signal
      })

      const latency = Date.now() - start

      if (response.status >= 200 && response.status < 300) {
        this.connectionStatus = latency > 3000 ? 'slow' : 'online'
        return { status: this.connectionStatus, latency }
      } else {
        this.connectionStatus = 'offline'
        return { status: 'offline' }
      }
    } catch (error) {
      this.connectionStatus = 'offline'
      return { status: 'offline' }
    } finally {
      clearTimeout(timeoutId)
    }
  }
  
  getConnectionStatus() {
    return this.connectionStatus
  }
  
  async testSupabaseConnection(): Promise<{ status: 'online' | 'offline' | 'error', error?: string }> {
    try {
      const { data, error } = await supabase.from('institutions').select('count').limit(1)
      
      if (error) {
        return { status: 'error', error: error.message }
      }
      
      return { status: 'online' }
    } catch (error) {
      return { status: 'offline', error: error instanceof Error ? error.message : 'Unknown error' }
    }
  }
  
  async waitForConnection(maxWait = 10000): Promise<boolean> {
    const start = Date.now()
    
    while (Date.now() - start < maxWait) {
      const result = await this.testConnection()
      if (result.status === 'online') {
        return true
      }
      await new Promise(resolve => setTimeout(resolve, 1000))
    }
    
    return false
  }
}

export const networkDiagnostics = NetworkDiagnostics.getInstance()
