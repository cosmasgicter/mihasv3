// Vitest global setup — polyfill browser APIs jsdom does not provide.
// Loaded automatically via vitest.config.ts → test.setupFiles.

// 1. matchMedia: jsdom returns undefined. Components reading
//    `prefers-reduced-motion`, `prefers-color-scheme`, viewport breakpoints,
//    etc. will throw `TypeError: window.matchMedia is not a function`
//    without this stub.
if (typeof window !== 'undefined' && typeof window.matchMedia !== 'function') {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: (query: string): MediaQueryList => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => undefined, // legacy
      removeListener: () => undefined, // legacy
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      dispatchEvent: () => false,
    }),
  })
}

// 2. ResizeObserver: jsdom has no implementation. Components using
//    layout effects with size observation (charts, virtualized tables)
//    rely on this stub during unit tests.
if (typeof globalThis.ResizeObserver === 'undefined') {
  class ResizeObserverStub {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  }
  ;(globalThis as unknown as { ResizeObserver: typeof ResizeObserverStub }).ResizeObserver = ResizeObserverStub
}

// 3. IntersectionObserver: same story for visibility-driven UI.
if (typeof globalThis.IntersectionObserver === 'undefined') {
  class IntersectionObserverStub {
    readonly root: Element | null = null
    readonly rootMargin: string = ''
    readonly thresholds: ReadonlyArray<number> = []
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
    takeRecords(): IntersectionObserverEntry[] { return [] }
  }
  ;(globalThis as unknown as { IntersectionObserver: typeof IntersectionObserverStub }).IntersectionObserver = IntersectionObserverStub
}
