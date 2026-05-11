// Minimal ambient declaration for `critters` so vite.config.ts type-checks.
// The package ships types at `src/index.d.ts` but its `package.json`
// "exports" field doesn't expose them under the "import" condition, so
// TypeScript can't resolve the real declarations. We only use
// `new Critters(options).process(html)` here; the full type isn't needed.
declare module 'critters' {
  export interface CrittersOptions {
    path?: string
    publicPath?: string
    external?: boolean
    inlineThreshold?: number
    minimumExternalSize?: number
    pruneSource?: boolean
    mergeStylesheets?: boolean
    additionalStylesheets?: string[]
    preload?: 'body' | 'media' | 'swap' | 'js' | 'js-lazy'
    noscriptFallback?: boolean
    inlineFonts?: boolean
    preloadFonts?: boolean
    fonts?: boolean
    keyframes?: string
    compress?: boolean
    logLevel?: 'info' | 'warn' | 'error' | 'trace' | 'debug' | 'silent'
    reduceInlineStyles?: boolean
  }
  export default class Critters {
    constructor(options?: CrittersOptions)
    process(html: string): Promise<string>
  }
}
