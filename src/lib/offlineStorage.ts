import { NewOfflineQueueItem, OfflineQueueItem, OfflineRecordType } from '@/types/offline'
import { getSecureId } from './security'

class OfflineStorageManager {
  private dbName = 'mihas-offline-db'
  private version = 1
  private db: IDBDatabase | null = null

  async init(): Promise<void> {
    return new Promise((resolve) => {
      try {
        const request = indexedDB.open(this.dbName, this.version)

        request.onupgradeneeded = (event) => {
          const db = (event.target as IDBOpenDBRequest).result
          
          // Create offline data store
          if (!db.objectStoreNames.contains('offlineData')) {
            const store = db.createObjectStore('offlineData', { keyPath: 'id' })
            store.createIndex('type', 'type', { unique: false })
            store.createIndex('userId', 'userId', { unique: false })
            store.createIndex('timestamp', 'timestamp', { unique: false })
          }
        }

        request.onerror = () => {
          // Silently handle IndexedDB errors
          resolve()
        }
        
        request.onsuccess = () => {
          this.db = request.result
          resolve()
        }
      } catch {
        // Silently handle any initialization errors
        resolve()
      }
    })
  }

  async store<TType extends OfflineRecordType>(data: NewOfflineQueueItem<TType>): Promise<string> {
    if (!this.db) throw new Error('Database not initialized')

    const id = `${data.type}_${Date.now()}_${getSecureId()}`
    const offlineData: OfflineQueueItem<TType> = {
      ...data,
      id,
      timestamp: Date.now()
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['offlineData'], 'readwrite')
      const store = transaction.objectStore('offlineData')
      const request = store.add(offlineData)
      
      request.onerror = () => reject(request.error)
      request.onsuccess = () => resolve(id)
    })
  }

  async getAll(userId?: string): Promise<OfflineQueueItem[]> {
    if (!this.db) return []

    return new Promise((resolve) => {
      try {
        const transaction = this.db!.transaction(['offlineData'], 'readonly')
        const store = transaction.objectStore('offlineData')
        
        let request: IDBRequest
        if (userId) {
          const index = store.index('userId')
          request = index.getAll(userId)
        } else {
          request = store.getAll()
        }
        
        request.onerror = () => resolve([])
        request.onsuccess = () => resolve(request.result)
      } catch {
        resolve([])
      }
    })
  }

  async remove(id: string): Promise<void> {
    if (!this.db) throw new Error('Database not initialized')

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['offlineData'], 'readwrite')
      const store = transaction.objectStore('offlineData')
      const request = store.delete(id)
      
      request.onerror = () => reject(request.error)
      request.onsuccess = () => resolve()
    })
  }

  async clear(userId?: string): Promise<void> {
    if (!this.db) throw new Error('Database not initialized')
    
    if (userId) {
      const data = await this.getAll(userId)
      for (const item of data) {
        await this.remove(item.id)
      }
    } else {
      return new Promise((resolve, reject) => {
        const transaction = this.db!.transaction(['offlineData'], 'readwrite')
        const store = transaction.objectStore('offlineData')
        const request = store.clear()
        
        request.onerror = () => reject(request.error)
        request.onsuccess = () => resolve()
      })
    }
  }
}

export const offlineStorage = new OfflineStorageManager()