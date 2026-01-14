/**
 * Secure Storage Utility
 * Provides encrypted storage for sensitive plugin data
 */

import { logger } from './logger'

class SecureStorage {
  private readonly STORAGE_PREFIX = 'mihas_secure_'
  private readonly ENCRYPTION_KEY = 'mihas_plugin_storage_key' // In production, this should be from environment

  /**
   * Encrypt data using simple XOR cipher
   * Note: This is a basic implementation. In production, use proper encryption.
   */
  private encrypt(data: string, key: string): string {
    let result = ''
    for (let i = 0; i < data.length; i++) {
      result += String.fromCharCode(
        data.charCodeAt(i) ^ key.charCodeAt(i % key.length)
      )
    }
    return btoa(result)
  }

  /**
   * Decrypt data using simple XOR cipher
   */
  private decrypt(encryptedData: string, key: string): string {
    try {
      const decoded = atob(encryptedData)
      let result = ''
      for (let i = 0; i < decoded.length; i++) {
        result += String.fromCharCode(
          decoded.charCodeAt(i) ^ key.charCodeAt(i % key.length)
        )
      }
      return result
    } catch (error) {
      logger.error('Failed to decrypt data', { error })
      throw new Error('Decryption failed')
    }
  }

  /**
   * Get encrypted value from storage
   */
  async get(key: string): Promise<any> {
    try {
      const storageKey = this.STORAGE_PREFIX + key
      const encryptedData = localStorage.getItem(storageKey)
      
      if (!encryptedData) {
        return null
      }
      
      const decryptedData = this.decrypt(encryptedData, this.ENCRYPTION_KEY)
      return JSON.parse(decryptedData)
    } catch (error) {
      logger.error('Failed to get secure storage value', { key, error })
      return null
    }
  }

  /**
   * Set encrypted value in storage
   */
  async set(key: string, value: any): Promise<void> {
    try {
      const storageKey = this.STORAGE_PREFIX + key
      const jsonData = JSON.stringify(value)
      const encryptedData = this.encrypt(jsonData, this.ENCRYPTION_KEY)
      
      localStorage.setItem(storageKey, encryptedData)
    } catch (error) {
      logger.error('Failed to set secure storage value', { key, error })
      throw error
    }
  }

  /**
   * Delete value from storage
   */
  async delete(key: string): Promise<void> {
    try {
      const storageKey = this.STORAGE_PREFIX + key
      localStorage.removeItem(storageKey)
    } catch (error) {
      logger.error('Failed to delete secure storage value', { key, error })
      throw error
    }
  }

  /**
   * Check if key exists in storage
   */
  async has(key: string): Promise<boolean> {
    try {
      const storageKey = this.STORAGE_PREFIX + key
      return localStorage.getItem(storageKey) !== null
    } catch (error) {
      logger.error('Failed to check secure storage key', { key, error })
      return false
    }
  }

  /**
   * Clear all secure storage data
   */
  async clear(): Promise<void> {
    try {
      const keys = Object.keys(localStorage).filter(key => 
        key.startsWith(this.STORAGE_PREFIX)
      )
      
      for (const key of keys) {
        localStorage.removeItem(key)
      }
    } catch (error) {
      logger.error('Failed to clear secure storage', { error })
      throw error
    }
  }

  /**
   * Get all keys in secure storage
   */
  async keys(): Promise<string[]> {
    try {
      return Object.keys(localStorage)
        .filter(key => key.startsWith(this.STORAGE_PREFIX))
        .map(key => key.substring(this.STORAGE_PREFIX.length))
    } catch (error) {
      logger.error('Failed to get secure storage keys', { error })
      return []
    }
  }

  /**
   * Get storage size in bytes
   */
  getSize(): number {
    try {
      let totalSize = 0
      const keys = Object.keys(localStorage).filter(key => 
        key.startsWith(this.STORAGE_PREFIX)
      )
      
      for (const key of keys) {
        const value = localStorage.getItem(key)
        if (value) {
          totalSize += key.length + value.length
        }
      }
      
      return totalSize
    } catch (error) {
      logger.error('Failed to calculate secure storage size', { error })
      return 0
    }
  }
}

export const secureStorage = new SecureStorage()