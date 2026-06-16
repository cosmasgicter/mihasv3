import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import fs from 'node:fs/promises'
import Critters from 'critters'

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
 * Currently does ONE thing: injects a `modulepreload` hint for the
 * LandingPage chunk so the browser can start fetching the marketing-route
 * code in parallel with the entry bundle.
 *
 * HISTORY (2026-05): an earlier version of this plugin also rewrote the
 * main CSS `<link>` into the `media="print" onload="this.media='all'"`
 * pattern to make it non-render-blocking. That broke production once the
 * admissions CSP was tightened to remove `script-src 'unsafe-inline'`,
 * because inline event-handler attributes (including `onload`) count as
 * inline script under CSP. The browser would download the CSS but never
 * apply it to the screen — leaving the page styled only by the inline
 * preloader. The rewrite has been removed.
 *
 * Critical-CSS inlining (via `critters`) is reintroduced in Phase 1; that
 * approach is CSP-safe because it produces inline `<style>` blocks (allowed
 * by `style-src 'unsafe-inline'`) instead of inline JS.
 *
 * Vite's default emission of `<link rel="stylesheet" crossorigin href=…>`
 * is left untouched here so the page is guaranteed to be styled even if a
 * future plugin in this pipeline misbehaves.
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

      // Find the LandingPage chunk and emit a modulepreload hint.
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
        console.log(
          `\u001b[32m✓\u001b[0m finalise-html: preload hint for LandingPage (${landingEntry.file})`,
        )
      }

      // Inline critical CSS via critters.
      //
      // Critters parses the rendered HTML, walks the linked stylesheet(s),
      // extracts only the rules used by elements in the static HTML, and
      // inlines them as a `<style>` block in `<head>`. With `preload: 'body'`
      // the original `<link rel="stylesheet">` is moved to the end of
      // `<body>` so above-the-fold content paints immediately from the
      // inlined critical CSS while the rest of the stylesheet loads.
      //
      // CSP-safety:
      // - inline `<style>` is allowed by `style-src 'unsafe-inline'`
      //   (already required for Radix UI runtime styles).
      // - NO inline `<script>` and NO inline event handlers are emitted.
      // - This is the only critters preload mode that works under our CSP;
      //   `media`, `swap`, `js`, and `js-lazy` all rely on inline JS.
      //
      // pruneSource is false: the main CSS file remains on disk and the
      // <link> still points to it. Critters only adds critical rules to
      // the inline <style>; it does NOT delete them from the file. This
      // keeps below-the-fold styles, dynamically rendered components,
      // and runtime-injected classes (e.g. Radix portals) covered.
      try {
        const critters = new Critters({
          path: distDir,
          publicPath: '/',
          preload: 'body',
          pruneSource: false,
          mergeStylesheets: true,
          inlineFonts: false,
          fonts: false,
          noscriptFallback: false,
          compress: true,
          logLevel: 'silent',
        })
        const before = html.length
        html = await critters.process(html)
        // critters strips the `crossorigin` attribute when it rewrites the
        // `<link rel="stylesheet">`; add it back so the loaded CSS still
        // matches Vite's emitted asset (which is served with CORS) and
        // matches the cached entry from any preload hints.
        html = html.replace(
          /<link rel="stylesheet"((?:(?!crossorigin)[^>])*?)href="(\/assets\/[^"]+\.css)"([^>]*)>/g,
          (_match, pre, href, post) =>
            `<link rel="stylesheet"${pre}href="${href}"${post} crossorigin>`,
        )
        console.log(
          `\u001b[32m✓\u001b[0m finalise-html: critters inlined critical CSS (HTML ${before} → ${html.length} bytes)`,
        )
      } catch (err) {
        // If critters fails for any reason, fall through with the original
        // HTML. The page is still styled by the regular `<link>` in <head>;
        // we just lose the FCP optimization. This is the safe failure mode
        // — never ship an unstyled page.
        console.warn(
          `\u001b[33m⚠\u001b[0m finalise-html: critters failed, leaving stylesheet untouched:`,
          err instanceof Error ? err.message : err,
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
      // Single post-build plugin: injects a modulepreload hint for the
      // LandingPage chunk. CSS rewrite is deliberately not done here —
      // see finaliseHtmlPlugin docstring for history.
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
      modulePreload: {
        polyfill: false, // No polyfills for modern browsers
        // Strip purely-lazy heavy chunks from the auto-generated
        // <link rel="modulepreload"> set. Vite preloads the dependencies of
        // every dynamically-imported chunk by default, which dragged
        // `vendor-sentry` (~431KB raw / ~70KB gzip) into first paint even though
        // errorReporter is only imported at idle. These chunks are fetched on
        // demand (idle error reporting, on-click PDF export, OCR) and must NOT
        // compete with first paint.
        resolveDependencies: (_filename, deps) =>
          deps.filter(
            (dep) =>
              !dep.includes('vendor-sentry') &&
              !dep.includes('vendor-pdf') &&
              !dep.includes('vendor-react-pdf') &&
              !dep.includes('vendor-ocr'),
          ),
      },
      cssCodeSplit: true,
      assetsInlineLimit: 0, // Emit all assets as separate files — eliminates data: URIs in CSP
      reportCompressedSize: false,
      // Needed by finaliseHtmlPlugin to map source paths to hashed chunk
      // filenames. Vite emits .vite/manifest.json.
      manifest: true,
      rollupOptions: {
        output: {
          // NOTE: `onlyExplicitManualChunks` is intentionally NOT enabled.
          // Enabling it bundled @react-pdf's static deps back into the
          // `render` chunk, creating a `render -> vendor-react-pdf -> render`
          // circular chunk. In the minified build that surfaced as a TDZ
          // ("Cannot access 'l' before initialization") on every PDF
          // generation (slip, receipt, acceptance letter).
          /**
           * Manual Chunks - Minimal Safe Approach
           *
           * Only split truly independent heavy libraries. Let Vite
           * handle React ecosystem automatically to prevent
           * createContext errors.
           */
          manualChunks: (id) => {
            // Vite's __vitePreload helper (virtual module id
            // "\0vite/preload-helper") is used by the entry for EVERY lazy
            // route. If Rollup parks it inside a feature chunk like
            // `vendor-pdf`, the entry then statically imports that chunk —
            // which side-effect-imported `vendor-react-pdf` and forced the
            // entire ~470KB-gzipped PDF engine to be modulepreload-ed on
            // first paint for every visitor. Pin the helper into the eager
            // React chunk so it always stays in the startup graph and the
            // PDF chunks remain truly lazy. This branch MUST be first.
            if (id.includes('vite/preload-helper')) {
              return 'vendor-react'
            }

            if (id.includes('node_modules')) {
              // React core MUST get its own eager chunk. Without this rule
              // Rollup folds react + react-dom + scheduler into the first
              // manual chunk that depends on React — which is
              // `vendor-react-pdf` (@react-pdf/renderer depends on React).
              // That dragged the entire ~470KB-gzipped PDF engine into the
              // entry's static graph, so every visitor `modulepreload`-ed
              // the PDF engine on first paint even when no PDF is ever
              // generated. Pinning React here keeps it eager and lets the
              // PDF chunks stay lazy. Order matters: this branch is first.
              if (
                id.includes('/react/') ||
                id.includes('/react-dom/') ||
                id.includes('/scheduler/') ||
                id.includes('/react/jsx-runtime') ||
                id.includes('/react/jsx-dev-runtime')
              ) {
                return 'vendor-react'
              }

              // PDF libraries — dynamically imported
              if (id.includes('/jspdf/') || id.includes('/jspdf-autotable/') || id.includes('/pdf-lib/')) {
                return 'vendor-pdf'
              }

              // @react-pdf/renderer + its transitive font/layout deps.
              // This bundle is ~470KB gzipped (fontkit metrics tables +
              // pdfkit + a base64-embedded yoga WASM module). Pinning it
              // into its own named chunk means:
              //   1. It only re-downloads when @react-pdf updates, not
              //      when our document templates change.
              //   2. The 1-year `Cache-Control: immutable` set on
              //      `/assets/*` fully applies — repeat PDF generations
              //      after the first never re-download the engine.
              //   3. The chunk has a stable, recognisable name in the
              //      Network tab and bundle analyser.
              if (
                id.includes('/@react-pdf/') ||
                id.includes('/fontkit/') ||
                id.includes('/pdfkit/') ||
                id.includes('/yoga-layout') ||
                id.includes('/restructure/') ||
                id.includes('/dfa/') ||
                id.includes('/unicode-properties/') ||
                id.includes('/unicode-trie/')
              ) {
                return 'vendor-react-pdf'
              }

              // OCR — tesseract.js, dynamically imported
              if (id.includes('/tesseract.js/')) {
                return 'vendor-ocr'
              }

              // Charts — recharts, dynamically imported
              if (id.includes('/recharts/') || id.includes('/d3-')) {
                return 'vendor-charts'
              }

              // Sentry / GlitchTip SDK — only reached through the lazy
              // `errorReporter` + lazy `logger` paths. Pin it into its own
              // chunk so it never folds into `vendor-react` (the eager startup
              // graph). Keeping it isolated means the ~60-80KB SDK is fetched
              // at idle/first-error only, not on first paint for every visitor.
              if (id.includes('/@sentry/') || id.includes('/@sentry-internal/')) {
                return 'vendor-sentry'
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
