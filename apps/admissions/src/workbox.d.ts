declare module 'workbox-precaching' {
  export function cleanupOutdatedCaches(): void
  export function matchPrecache(url: string): Promise<Response | undefined>
  export function precacheAndRoute(entries: Array<unknown>): void
}

declare module 'workbox-core' {
  export function clientsClaim(): void
}

declare module 'workbox-routing' {
  export function registerRoute(matcher: unknown, handler: unknown, method?: string): void
  export function setCatchHandler(handler: unknown): void
}

declare module 'workbox-strategies' {
  export class NetworkFirst {
    constructor(options?: Record<string, unknown>)
    handle(options: Record<string, unknown>): Promise<Response>
  }

  export class NetworkOnly {
    constructor(options?: Record<string, unknown>)
  }

  export class StaleWhileRevalidate {
    constructor(options?: Record<string, unknown>)
  }
}

declare module 'workbox-expiration' {
  export class ExpirationPlugin {
    constructor(options?: Record<string, unknown>)
  }
}

declare module 'workbox-cacheable-response' {
  export class CacheableResponsePlugin {
    constructor(options?: Record<string, unknown>)
  }
}
