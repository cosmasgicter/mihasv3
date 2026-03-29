import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'path'

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
      // Variables that MUST be set for a production build
      const required: string[] = [
        // Currently all VITE_* vars have fallbacks, but this list
        // is the single place to add mandatory ones in the future.
      ]

      // Variables that SHOULD be set — warn if missing
      const recommended: string[] = [
        'VITE_APP_VERSION',
        'VITE_APP_BASE_URL',
      ]

      const isProd = config.command === 'build'
      const missing = required.filter(
        (v) => !process.env[v] || process.env[v]!.trim().length === 0,
      )
      const missingRecommended = recommended.filter(
        (v) => !process.env[v] || process.env[v]!.trim().length === 0,
      )

      if (missing.length > 0) {
        const msg = `Missing required VITE_* environment variables: ${missing.join(', ')}`
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

/**
 * Vite Configuration for Bun + Vercel
 * 
 * Simplified configuration optimized for:
 * - Bun runtime compatibility (Requirement 2.4)
 * - PWA offline support for Zambian connections (Requirement 9.7)
 * - Code splitting for vendor libraries (Requirement 12.4, 12.5)
 * - Performance targets: FCP <1.5s, LCP <2.5s, bundle <500KB (Requirement 12.1-12.3)
 * 
 * Removed:
 * - Cloudflare-specific settings
 * - Complex chunk splitting that caused createContext errors
 */
export default defineConfig(({ mode, command }) => {
  const env = loadEnv(mode, process.cwd(), '')

  return {
    plugins: [
      envValidationPlugin(),
      react(),
      VitePWA({
        registerType: 'prompt',
        strategies: 'injectManifest',
        srcDir: 'src',
        filename: 'service-worker.ts',
        injectRegister: false,
        injectManifest: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg,webp}'],
          // Reduced from 10MB to 3MB after bundle splitting (R15/P-1)
          maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        },
      })
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
      sourcemap: false, // Disable for production builds
      chunkSizeWarningLimit: 500,
      modulePreload: { polyfill: false }, // No polyfills for modern browsers
      cssCodeSplit: true,
      assetsInlineLimit: 4096, // Inline assets <4KB as base64
      reportCompressedSize: false, // Faster builds
      rollupOptions: {
        output: {
        /**
         * Manual Chunks - Minimal Safe Approach
         * 
         * Only split truly independent heavy libraries.
         * Let Vite handle React ecosystem automatically to prevent createContext errors.
         * 
         * Vendor chunks for:
         * - Excel/PDF (dynamically imported, heavy)
         * - OCR (tesseract.js, heavy)
         * - Charts (recharts, dynamically imported)
         */
        manualChunks: (id) => {
          if (id.includes('node_modules')) {
            // Excel libraries - dynamically imported
            if (id.includes('xlsx') || id.includes('exceljs')) {
              return 'vendor-excel'
            }
            
            // PDF libraries - dynamically imported
            if (id.includes('jspdf') || id.includes('pdf-lib')) {
              return 'vendor-pdf'
            }
            
            // OCR - tesseract.js (heavy, dynamically imported)
            if (id.includes('tesseract')) {
              return 'vendor-ocr'
            }
            
            // Charts - recharts (dynamically imported)
            if (id.includes('recharts') || id.includes('d3-')) {
              return 'vendor-charts'
            }
            
            // Let Vite handle React, forms, routing automatically
            // This ensures proper dependency ordering
          }
        },
        assetFileNames: (assetInfo) => {
          const info = assetInfo.name?.split('.') || []
          const ext = info[info.length - 1]
          if (/png|jpe?g|svg|gif|tiff|bmp|ico/i.test(ext)) {
            return `assets/images/[name]-[hash][extname]`
          }
          return `assets/[name]-[hash][extname]`
        },
        chunkFileNames: 'assets/js/[name]-[hash].js',
        entryFileNames: 'assets/js/[name]-[hash].js',
        }
      },
      terserOptions: {
        compress: {
          drop_console: true,
          drop_debugger: true,
          pure_funcs: ['console.log', 'console.info', 'console.debug'],
          passes: 2,
          ecma: 2020
        },
        mangle: {
          safari10: false // No Safari 10 support needed
        },
        format: {
          ecma: 2020
        }
      }
    },
    server: {
      port: 5173,
      host: '0.0.0.0',
      strictPort: false,
      cors: true,
      proxy: command === 'serve' ? {
        '/api': {
          target: env.VITE_DEV_API_PROXY_TARGET || `http://127.0.0.1:${env.VITE_DEV_API_PORT || '3001'}`,
          changeOrigin: true,
          secure: false,
        }
      } : undefined,
      hmr: {
        overlay: true
      }
    },
    preview: {
      port: 4173,
      host: '0.0.0.0'
    }
  }
})
