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
 * PRIMARY FIX: Makes the main CSS stylesheet non-render-blocking.
 *
 * Problem: Vite injects `<link rel="stylesheet" href="/assets/index-[hash].css">`
 * into <head>. This 142KB file blocks the browser from painting ANYTHING —
 * including the inline preloader — until it fully downloads. On slow mobile
 * (3G/4G in Zambia), this means 10-30s of white screen.
 *
 * Solution: Transform the CSS link to use the `media="print" onload` pattern.
 * The browser fetches the CSS at high priority but does NOT block rendering.
 * The preloader (with inline styles) paints immediately (~100ms). Once the
 * CSS loads, `onload` flips `media` to "all" and styles apply instantly.
 * A <noscript> fallback ensures CSS still works without JS.
 *
 * Also injects a single modulepreload hint for the LandingPage chunk.
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

      // 1. Make the main CSS non-render-blocking.
      //    Match: <link rel="stylesheet" crossorigin href="/assets/index-HASH.css">
      //    Replace with async pattern + noscript fallback.
      html = html.replace(
        /<link rel="stylesheet" crossorigin href="(\/assets\/index-[^"]+\.css)">/,
        (_, cssHref) => {
          // eslint-disable-next-line no-console
          console.log(`\u001b[32m✓\u001b[0m finalise-html: made CSS non-render-blocking (${cssHref})`)
          return [
            `<link rel="stylesheet" href="${cssHref}" media="print" onload="this.media='all'" crossorigin>`,
            `<noscript><link rel="stylesheet" href="${cssHref}" crossorigin></noscript>`,
          ].join('\n    ')
        },
      )

      // 2. Find the LandingPage chunk and emit a modulepreload hint.
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
