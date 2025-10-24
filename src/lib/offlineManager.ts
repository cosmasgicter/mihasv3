export class OfflineManager {
  private static OFFLINE_QUEUE_KEY = 'offline_queue'
  private static SYNC_STATUS_KEY = 'sync_status'

  static isOnline(): boolean {
    return navigator.onLine
  }

  static async queueRequest(request: { url: string; method: string; body?: any; headers?: any }) {
    const queue = this.getQueue()
    queue.push({ ...request, timestamp: Date.now(), id: crypto.randomUUID() })
    localStorage.setItem(this.OFFLINE_QUEUE_KEY, JSON.stringify(queue))
  }

  static getQueue(): any[] {
    try {
      return JSON.parse(localStorage.getItem(this.OFFLINE_QUEUE_KEY) || '[]')
    } catch {
      return []
    }
  }

  static clearQueue() {
    localStorage.removeItem(this.OFFLINE_QUEUE_KEY)
  }

  static async syncQueue(): Promise<{ success: number; failed: number }> {
    if (!this.isOnline()) return { success: 0, failed: 0 }

    const queue = this.getQueue()
    let success = 0
    let failed = 0

    for (const req of queue) {
      try {
        await fetch(req.url, {
          method: req.method,
          headers: req.headers,
          body: req.body ? JSON.stringify(req.body) : undefined
        })
        success++
      } catch {
        failed++
      }
    }

    if (failed === 0) this.clearQueue()
    return { success, failed }
  }

  static setSyncStatus(status: 'syncing' | 'synced' | 'failed') {
    localStorage.setItem(this.SYNC_STATUS_KEY, status)
  }

  static getSyncStatus(): string {
    return localStorage.getItem(this.SYNC_STATUS_KEY) || 'synced'
  }
}
