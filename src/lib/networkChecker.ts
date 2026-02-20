export class NetworkChecker {
  private static instance: NetworkChecker
  private isOnline: boolean = navigator.onLine
  private listeners: Array<(online: boolean) => void> = []

  private constructor() {
    this.setupEventListeners()
  }

  static getInstance(): NetworkChecker {
    if (!NetworkChecker.instance) {
      NetworkChecker.instance = new NetworkChecker()
    }
    return NetworkChecker.instance
  }

  private setupEventListeners() {
    window.addEventListener('online', () => {
      this.isOnline = true
      this.notifyListeners(true)
    })

    window.addEventListener('offline', () => {
      this.isOnline = false
      this.notifyListeners(false)
    })
  }

  private notifyListeners(online: boolean) {
    this.listeners.forEach(listener => listener(online))
  }

  public getStatus(): boolean {
    return this.isOnline
  }

  public addListener(callback: (online: boolean) => void) {
    this.listeners.push(callback)
  }

  public removeListener(callback: (online: boolean) => void) {
    this.listeners = this.listeners.filter(listener => listener !== callback)
  }

  public async checkConnectivity(): Promise<boolean> {
    try {
      // Try to fetch a small resource from the same origin
      const response = await fetch('/favicon.ico', {
        method: 'HEAD',
        cache: 'no-cache',
        signal: AbortSignal.timeout(5000)
      })
      return response.ok
    } catch {
      return false
    }
  }

}

export const networkChecker = NetworkChecker.getInstance()