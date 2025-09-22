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

  public async checkSupabaseConnectivity(): Promise<boolean> {
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
      const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY
      if (!supabaseUrl || !supabaseKey) return false

      const response = await fetch(`${supabaseUrl}/rest/v1/`, {
        method: 'HEAD',
        cache: 'no-cache',
        signal: AbortSignal.timeout(10000),
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`
        }
      })
      return response.ok
    } catch {
      return false
    }
  }
}

export const networkChecker = NetworkChecker.getInstance()