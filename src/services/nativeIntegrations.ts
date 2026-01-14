/**
 * Native Device Integrations Service
 * Provides access to native device features for PWA
 * Requirements: 9.5 - Implement native device integrations where possible
 */

interface ContactInfo {
  name?: string
  email?: string
  tel?: string
}

interface GeolocationPosition {
  latitude: number
  longitude: number
  accuracy: number
  altitude?: number
  altitudeAccuracy?: number
  heading?: number
  speed?: number
}

interface DeviceInfo {
  platform: string
  userAgent: string
  language: string
  online: boolean
  cookieEnabled: boolean
  doNotTrack: string | null
  maxTouchPoints: number
  hardwareConcurrency: number
  deviceMemory?: number
  connection?: {
    effectiveType: string
    downlink: number
    rtt: number
    saveData: boolean
  }
}

class NativeIntegrations {
  /**
   * Check if Web Share API is supported
   */
  canShare(): boolean {
    return 'share' in navigator
  }

  /**
   * Share content using native share sheet
   */
  async share(data: {
    title?: string
    text?: string
    url?: string
    files?: File[]
  }): Promise<boolean> {
    if (!this.canShare()) {
      return false
    }

    try {
      await navigator.share(data)
      return true
    } catch (error) {
      if ((error as Error).name !== 'AbortError') {
        console.error('Share failed:', error)
      }
      return false
    }
  }

  /**
   * Check if Clipboard API is supported
   */
  canUseClipboard(): boolean {
    return 'clipboard' in navigator && window.isSecureContext
  }

  /**
   * Copy text to clipboard
   */
  async copyToClipboard(text: string): Promise<boolean> {
    if (!this.canUseClipboard()) {
      // Fallback to old method
      return this.fallbackCopyToClipboard(text)
    }

    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch (error) {
      console.error('Copy to clipboard failed:', error)
      return this.fallbackCopyToClipboard(text)
    }
  }

  /**
   * Read text from clipboard
   */
  async readFromClipboard(): Promise<string | null> {
    if (!this.canUseClipboard()) {
      return null
    }

    try {
      const text = await navigator.clipboard.readText()
      return text
    } catch (error) {
      console.error('Read from clipboard failed:', error)
      return null
    }
  }

  /**
   * Fallback clipboard copy method
   */
  private fallbackCopyToClipboard(text: string): boolean {
    const textArea = document.createElement('textarea')
    textArea.value = text
    textArea.style.position = 'fixed'
    textArea.style.left = '-999999px'
    textArea.style.top = '-999999px'
    document.body.appendChild(textArea)
    textArea.focus()
    textArea.select()

    try {
      const successful = document.execCommand('copy')
      document.body.removeChild(textArea)
      return successful
    } catch (error) {
      console.error('Fallback copy failed:', error)
      document.body.removeChild(textArea)
      return false
    }
  }

  /**
   * Check if Geolocation API is supported
   */
  canUseGeolocation(): boolean {
    return 'geolocation' in navigator
  }

  /**
   * Get current position
   */
  async getCurrentPosition(): Promise<GeolocationPosition | null> {
    if (!this.canUseGeolocation()) {
      return null
    }

    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          resolve({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy,
            altitude: position.coords.altitude || undefined,
            altitudeAccuracy: position.coords.altitudeAccuracy || undefined,
            heading: position.coords.heading || undefined,
            speed: position.coords.speed || undefined
          })
        },
        (error) => {
          console.error('Geolocation error:', error)
          resolve(null)
        },
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 0
        }
      )
    })
  }

  /**
   * Check if Contact Picker API is supported
   */
  canPickContacts(): boolean {
    return 'contacts' in navigator && 'ContactsManager' in window
  }

  /**
   * Pick contacts from device
   */
  async pickContacts(properties: string[] = ['name', 'email', 'tel']): Promise<ContactInfo[]> {
    if (!this.canPickContacts()) {
      return []
    }

    try {
      const contacts = await (navigator as any).contacts.select(properties, { multiple: true })
      return contacts.map((contact: any) => ({
        name: contact.name?.[0],
        email: contact.email?.[0],
        tel: contact.tel?.[0]
      }))
    } catch (error) {
      console.error('Contact picker error:', error)
      return []
    }
  }

  /**
   * Check if Vibration API is supported
   */
  canVibrate(): boolean {
    return 'vibrate' in navigator
  }

  /**
   * Vibrate device
   */
  vibrate(pattern: number | number[]): boolean {
    if (!this.canVibrate()) {
      return false
    }

    try {
      navigator.vibrate(pattern)
      return true
    } catch (error) {
      console.error('Vibration error:', error)
      return false
    }
  }

  /**
   * Check if Screen Wake Lock API is supported
   */
  canUseWakeLock(): boolean {
    return 'wakeLock' in navigator
  }

  /**
   * Request screen wake lock
   */
  async requestWakeLock(): Promise<any | null> {
    if (!this.canUseWakeLock()) {
      return null
    }

    try {
      const wakeLock = await (navigator as any).wakeLock.request('screen')
      return wakeLock
    } catch (error) {
      console.error('Wake lock error:', error)
      return null
    }
  }

  /**
   * Check if File System Access API is supported
   */
  canAccessFileSystem(): boolean {
    return 'showOpenFilePicker' in window
  }

  /**
   * Open file picker
   */
  async pickFile(options: {
    multiple?: boolean
    types?: Array<{
      description: string
      accept: Record<string, string[]>
    }>
  } = {}): Promise<File[]> {
    if (!this.canAccessFileSystem()) {
      // Fallback to input element
      return this.fallbackFilePicker(options)
    }

    try {
      const handles = await (window as any).showOpenFilePicker({
        multiple: options.multiple || false,
        types: options.types
      })

      const files: File[] = []
      for (const handle of handles) {
        const file = await handle.getFile()
        files.push(file)
      }

      return files
    } catch (error) {
      if ((error as Error).name !== 'AbortError') {
        console.error('File picker error:', error)
      }
      return []
    }
  }

  /**
   * Fallback file picker using input element
   */
  private fallbackFilePicker(options: {
    multiple?: boolean
    types?: Array<{
      description: string
      accept: Record<string, string[]>
    }>
  }): Promise<File[]> {
    return new Promise((resolve) => {
      const input = document.createElement('input')
      input.type = 'file'
      input.multiple = options.multiple || false
      
      if (options.types) {
        const accept = options.types
          .flatMap(type => Object.values(type.accept).flat())
          .join(',')
        input.accept = accept
      }

      input.onchange = () => {
        const files = Array.from(input.files || [])
        resolve(files)
      }

      input.click()
    })
  }

  /**
   * Check if Badging API is supported
   */
  canUseBadge(): boolean {
    return 'setAppBadge' in navigator
  }

  /**
   * Set app badge count
   */
  async setBadge(count?: number): Promise<boolean> {
    if (!this.canUseBadge()) {
      return false
    }

    try {
      if (count !== undefined && count > 0) {
        await (navigator as any).setAppBadge(count)
      } else {
        await (navigator as any).clearAppBadge()
      }
      return true
    } catch (error) {
      console.error('Badge error:', error)
      return false
    }
  }

  /**
   * Get device information
   */
  getDeviceInfo(): DeviceInfo {
    const nav = navigator as any

    return {
      platform: navigator.platform,
      userAgent: navigator.userAgent,
      language: navigator.language,
      online: navigator.onLine,
      cookieEnabled: navigator.cookieEnabled,
      doNotTrack: navigator.doNotTrack,
      maxTouchPoints: navigator.maxTouchPoints,
      hardwareConcurrency: navigator.hardwareConcurrency,
      deviceMemory: nav.deviceMemory,
      connection: nav.connection ? {
        effectiveType: nav.connection.effectiveType,
        downlink: nav.connection.downlink,
        rtt: nav.connection.rtt,
        saveData: nav.connection.saveData
      } : undefined
    }
  }

  /**
   * Check if device is mobile
   */
  isMobile(): boolean {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
  }

  /**
   * Check if device is iOS
   */
  isIOS(): boolean {
    return /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream
  }

  /**
   * Check if device is Android
   */
  isAndroid(): boolean {
    return /Android/.test(navigator.userAgent)
  }

  /**
   * Check if running in standalone mode (installed PWA)
   */
  isStandalone(): boolean {
    return window.matchMedia('(display-mode: standalone)').matches ||
           (window.navigator as any).standalone === true ||
           document.referrer.includes('android-app://')
  }

  /**
   * Request fullscreen mode
   */
  async requestFullscreen(element: HTMLElement = document.documentElement): Promise<boolean> {
    try {
      if (element.requestFullscreen) {
        await element.requestFullscreen()
        return true
      }
      return false
    } catch (error) {
      console.error('Fullscreen error:', error)
      return false
    }
  }

  /**
   * Exit fullscreen mode
   */
  async exitFullscreen(): Promise<boolean> {
    try {
      if (document.exitFullscreen) {
        await document.exitFullscreen()
        return true
      }
      return false
    } catch (error) {
      console.error('Exit fullscreen error:', error)
      return false
    }
  }

  /**
   * Check if in fullscreen mode
   */
  isFullscreen(): boolean {
    return !!document.fullscreenElement
  }
}

export const nativeIntegrations = new NativeIntegrations()
