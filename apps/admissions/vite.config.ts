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
 * Runs as a single `closeBundle` handler so we can guarantee ordering
 * between critical-CSS inlining and modulepreload injection. Running
 * these as separate plugins with `enforce: 'post'` isn't reliable —
 * Vite doesn't guarantee stable closeBundle ordering between them, and
 * critters' htmlparser2 pipeline silently drops `<link rel="modulepreload">`
 * tags it doesn't recognise.
 *
 * Steps, in order:
 *   1. Read dist/index.html.
 *   2. Run critters to extract & inline above-the-fold CSS, then
 *      rewrite the main stylesheet link to load deferred. Cuts
 *      render-blocking CSS round-trip for the first paint.
 *   3. Splice <link rel="modulepreload"> tags for marketing-route
 *      chunks just before </head>. This parallelises the
 *      entry → LandingPage chunk fetch — the dominant contributor to
 *      the 15 s cold-start on 3G in the May 2026 baseline.
 *   4. Write the final HTML back.
 */
function finaliseHtmlPlugin(): Plugin {
  // Matches the lazy() imports in src/App.tsx for the public/marketing surface.
  const TARGET_ROUTES = new Set([
    'src/pages/LandingPage.tsx',
    'src/pages/ContactPage.tsx',
    'src/pages/TermsPage.tsx',
    'src/pages/PrivacyPage.tsx',
    'src/pages/NotFoundPage.tsx',
  ])
  // Plus the LandingPageSections lazy import inside LandingPage itself.
  const TARGET_SECTIONS = new Set([
    'src/components/landing/LandingPageSections.tsx',
  ])

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

      // --- Step 2: inline critical CSS via critters ---
      try {
        const { default: Critters } = await import('critters')
        const critters = new Critters({
          path: distDir,
          publicPath: '/',
          external: true,
          inlineFonts: false,
          preloadFonts: false,
          pruneSource: false,
          compress: true,
          mergeStylesheets: false,
          preload: 'swap',
          logLevel: 'warn',
        })
        html = await critters.process(html)
        const inlinedMatch = /<style[^>]*>([\s\S]*?)<\/style>/m.exec(html)
        const inlinedKb = Math.round(
          (inlinedMatch ? Buffer.byteLength(inlinedMatch[1]!) : 0) / 1024,
        )
        // eslint-disable-next-line no-console
        console.log(
          `\u001b[32m✓\u001b[0m finalise-html: inlined ~${inlinedKb} KB of critical CSS`,
        )
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn(
          `⚠ finalise-html: critical-CSS inlining skipped — ${(err as Error).message}`,
        )
      }

      // --- Step 3: inject modulepreload hints for marketing chunks ---
      let manifest: Record<string, { file: string; src?: string; isEntry?: boolean }> = {}
      try {
        const raw = await fs.readFile(manifestPath, 'utf8')
        manifest = JSON.parse(raw)
      } catch {
        // No manifest — skip hints silently. The build will still work,
        // just without the modulepreload optimisation.
      }

      const hints: string[] = []
      const addedFiles = new Set<string>()
      // Target files by manifest key (source path) OR file-basename prefix.
      // LandingPage's manifest entry sometimes lacks a `src` field because
      // it's pulled in as a dependency of multiple chunks; fall back to
      // matching the output filename so we never miss it.
      const TARGET_BASENAMES = /^(LandingPage|ContactPage|TermsPage|PrivacyPage|NotFoundPage|LandingPageSections)-/

      // Build quick lookups:
      //   byKey   — manifest key → entry
      //   byFile  — output file path → entry
      const byKey = new Map(Object.entries(manifest))
      const byFile = new Map(
        Object.entries(manifest).map(([k, v]) => [v.file, { key: k, ...v }]),
      )

      /**
       * Walk an entry's direct + transitive imports, adding each emitted
       * JS file to `addedFiles`. Vite's own modulePreload only handles
       * chunks imported from the HTML entry — lazy chunks like
       * LandingPage are responsible for loading their own deps, which
       * creates a round-trip waterfall. Preloading everything the
       * LandingPage needs collapses that waterfall.
       */
      const walk = (key: string | undefined, depth = 0): void => {
        if (!key || depth > 8 || addedFiles.has(key)) return
        const entry = byKey.get(key)
        if (!entry) return
        addedFiles.add(key)
        if (entry.file && entry.file.endsWith('.js')) {
          hints.push(
            `<link rel="modulepreload" crossorigin href="/${entry.file}" />`,
          )
        }
        const imports = (entry as unknown as { imports?: string[] }).imports ?? []
        for (const dep of imports) {
          // imports can be manifest keys (src/pages/*.tsx) or raw filenames
          // (index.html, _LandingPage-hash.js). Try both.
          if (byKey.has(dep)) {
            walk(dep, depth + 1)
          } else {
            const matchByFile = byFile.get(dep)
            if (matchByFile) walk(matchByFile.key, depth + 1)
          }
        }
      }

      for (const [key, entry] of Object.entries(manifest)) {
        const matchesByKey = TARGET_ROUTES.has(key) || TARGET_SECTIONS.has(key)
        const basename = entry.file.split('/').pop() ?? ''
        const matchesByFile = TARGET_BASENAMES.test(basename)
        if (matchesByKey || matchesByFile) {
          walk(key)
        }
      }

      if (hints.length > 0) {
        html = html.replace(/<\/head>/, `${hints.join('')}</head>`)
        // eslint-disable-next-line no-console
        console.log(
          `\u001b[32m✓\u001b[0m finalise-html: added ${hints.length} modulepreload hint(s)`,
        )
      }

      // --- Step 4: write back ---
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
