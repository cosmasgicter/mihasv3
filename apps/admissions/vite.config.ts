import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import fs from 'node:fs/promises'

/**
 * Build-time validation for required VITE_* environment variables.
 * Fails the production build when any required variable is missing.
 * In development mode it only warns so local dev isn't blocked.
 *
 * Validates: Requirement 25.5
 */
function envValidationPlugin(): Plugin {
  return {
    name: 'vite-plugin-env-validation',
    configResolved(config) {
      const isProd = config.command === 'build'
      const required: string[] = isProd
        ? [
            'VITE_API_BASE_URL',
            'VITE_APP_BASE_URL',
            'VITE_APP_VERSION',
            'VITE_GLITCHTIP_DSN',
          ]
        : []
      const requiredAlternatives: string[][] = isProd
        ? [['VITE_SITE_URL', 'VITE_APP_BASE_URL']]
        : []

      const recommended: string[] = []
      const getEnvValue = (key: string) => config.env[key] ?? process.env[key]
      const missing = required.filter((v) => {
        const value = getEnvValue(v)
        return !value || value.trim().length === 0
      })
      const missingRecommended = recommended.filter((v) => {
        const value = getEnvValue(v)
        return !value || value.trim().length === 0
      })
      const missingAlternativeGroups = requiredAlternatives.filter((keys) =>
        !keys.some((key) => {
          const value = getEnvValue(key)
          return value && value.trim().length > 0
        }),
      )

      if (missing.length > 0 || missingAlternativeGroups.length > 0) {
        const missingAlternativeLabels = missingAlternativeGroups.map((keys) => keys.join(' or '))
        const msg = `Missing required VITE_* environment variables: ${[
          ...missing,
          ...missingAlternativeLabels,
        ].join(', ')}`
        if (isProd) {
          throw new Error(`[env-validation] ${msg}`)
        }
        console.warn(`⚠️  [env-validation] ${msg}`)
      }

      if (missingRecommended.length > 0) {
        console.warn(
          `ℹ️  [env-validation] Recommended VITE_* variables not set: ${missingRecommended.join(', ')}. Defaults will be used.`,
        )
      }
    },
  }
}

function normalizeProxyTarget(value: string): string {
  return value.replace(/\/$/, '').replace(/\/api\/v1$/, '')
}

/**
 * Post-build HTML finaliser.
 *
 * Lesson learned from the May 2026 perf regression:
 *
 *   The previous version of this plugin wired critters and injected
 *   45 modulepreload hints for the entire marketing dep graph. In
 *   production on mobile, this made things WORSE — first paint
 *   regressed from 15 s to 30 s, Lighthouse dropped 97 → 88 — because:
 *
 *     1. Critters with `preload: 'swap'` emitted a render-blocking
 *        `<link rel="stylesheet" onload="this.rel='stylesheet'">` (the
 *        onload swap is a no-op when rel is already 'stylesheet'), and
 *        a duplicate copy of the same stylesheet tag. Inlined only
 *        ~1 KB of CSS while adding the duplicate request overhead.
 *
 *     2. 45 modulepreload hints saturated the browser's concurrent
 *        fetch budget and forced the main thread to parse + compile
 *        every module before React could even mount. On mid-range
 *        Android the CPU cost alone was >10 s.
 *
 * Current approach — minimal and measured:
 *   - No critters. The full index.css ships as a single
 *     `<link rel="stylesheet">` and Vite's default loader is fine.
 *     (If we revisit critical CSS later, we'll use a more conservative
 *     inlining strategy and verify every metric before shipping.)
 *   - Exactly ONE modulepreload hint for the LandingPage chunk, so
 *     the browser starts fetching it in parallel with the entry JS
 *     instead of waiting for React to discover the lazy() import.
 *     Vite's own modulePreload handles transitive deps of the entry
 *     chunk; we do not need to replicate that graph by hand.
 *
 * If this still isn't fast enough after deploy, the next step is
 * Phase B (prerender marketing routes) — a one-shot architectural
 * change — not more handwritten preload tweaks.
 */
function finaliseHtmlPlugin(): Plugin {
  return {
    name: 'mihas-finalise-html',
    apply: 'build',
    enforce: 'post',
    async closeBundle() {
      const distDir = path.resolve(__dirname, 'dist')
      const htmlPath = path.join(distDir, 'index.html')
      const manifestPath = path.join(distDir, '.vite', 'manifest.json')

      let html: string
      try {
        html = await fs.readFile(htmlPath, 'utf8')
      } catch {
        return
      }

      // Find the LandingPage chunk in the manifest and emit a single
      // modulepreload hint for it. The manifest key pattern is either
      // `src/pages/LandingPage.tsx` (expected) or a synthesised
      // `_LandingPage-<hash>.js` key when the chunk is also imported
      // from other places; handle both.
      let manifest: Record<string, { file: string; src?: string; isEntry?: boolean; isDynamicEntry?: boolean }> = {}
      try {
        const raw = await fs.readFile(manifestPath, 'utf8')
        manifest = JSON.parse(raw)
      } catch {
        await fs.writeFile(htmlPath, html, 'utf8')
        return
      }

      const landingEntry = Object.values(manifest).find((entry) => {
        const basename = entry.file.split('/').pop() ?? ''
        return /^LandingPage-/.test(basename)
      })

      if (landingEntry) {
        const hint = `<link rel="modulepreload" crossorigin href="/${landingEntry.file}" />`
        html = html.replace(/<\/head>/, `${hint}</head>`)
        // eslint-disable-next-line no-console
        console.log(
          `\u001b[32m✓\u001b[0m finalise-html: preload hint for LandingPage (${landingEntry.file})`,
        )
      }

      await fs.writeFile(htmlPath, html, 'utf8')
    },
  }
}

/**
 * Vite Configuration for Bun + Vercel
 *
 * Simplified configuration optimized for:
 * - Bun runtime compatibility (Requirement 2.4)
 * - Code splitting for vendor libraries (Requirement 12.4, 12.5)
 * - Performance targets: FCP <1.5s, LCP <2.5s, bundle <500KB (Requirement 12.1-12.3)
 */
export default defineConfig(({ mode, command }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const devApiProxyTarget = normalizeProxyTarget(
    env.VITE_DEV_API_PROXY_TARGET ||
    env.VITE_API_BASE_URL ||
    `http://127.0.0.1:${env.VITE_DEV_API_PORT || '3001'}`
  )

  return {
    plugins: [
      envValidationPlugin(),
      react(),
      // Single post-build plugin: inline critical CSS via critters,
      // then inject modulepreload hints for marketing-route chunks.
      // Ordering is handled inside the plugin (see finaliseHtmlPlugin).
      finaliseHtmlPlugin(),
    ],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
    define: {
      // Required for some libraries that expect global
      global: 'globalThis',
    },
    build: {
      target: 'es2022', // Modern browsers - Bun native support
      minify: 'terser',
      sourcemap: false,
      chunkSizeWarningLimit: 650,
      modulePreload: { polyfill: false }, // No polyfills for modern browsers
      cssCodeSplit: true,
      assetsInlineLimit: 0, // Emit all assets as separate files — eliminates data: URIs in CSP
      reportCompressedSize: false,
      // Needed by finaliseHtmlPlugin to map source paths to hashed chunk
      // filenames. Vite emits .vite/manifest.json.
      manifest: true,
      rollupOptions: {
        output: {
          onlyExplicitManualChunks: true,
          /**
           * Manual Chunks - Minimal Safe Approach
           *
           * Only split truly independent heavy libraries. Let Vite
           * handle React ecosystem automatically to prevent
           * createContext errors.
           */
          manualChunks: (id) => {
            if (id.includes('node_modules')) {
              // PDF libraries — dynamically imported
              if (id.includes('/jspdf/') || id.includes('/jspdf-autotable/') || id.includes('/pdf-lib/')) {
                return 'vendor-pdf'
              }

              // OCR — tesseract.js, dynamically imported
              if (id.includes('/tesseract.js/')) {
                return 'vendor-ocr'
              }

              // Charts — recharts, dynamically imported
              if (id.includes('/recharts/') || id.includes('/d3-')) {
                return 'vendor-charts'
              }
            }
          },
          assetFileNames: (assetInfo) => {
            const info = assetInfo.name?.split('.') || []
            const ext = info[info.length - 1] ?? ''
            if (/png|jpe?g|svg|gif|tiff|bmp|ico/i.test(ext)) {
              return `assets/images/[name]-[hash][extname]`
            }
            return `assets/[name]-[hash][extname]`
          },
          chunkFileNames: 'assets/js/[name]-[hash].js',
          entryFileNames: 'assets/js/[name]-[hash].js',
        },
      },
      terserOptions: {
        compress: {
          drop_console: true,
          drop_debugger: true,
          pure_funcs: ['console.log', 'console.info', 'console.debug'],
          passes: 2,
          ecma: 2020,
        },
        mangle: {
          safari10: false,
        },
        format: {
          ecma: 2020,
        },
      },
    },
    server: {
      port: 5173,
      host: '0.0.0.0',
      strictPort: false,
      cors: true,
      proxy: command === 'serve' ? {
        '/api': {
          target: devApiProxyTarget,
          changeOrigin: true,
          secure: false,
          cookieDomainRewrite: '',
        },
      } : undefined,
      hmr: {
        overlay: true,
      },
    },
    preview: {
      port: 4173,
      host: '0.0.0.0',
    },
  }
})
