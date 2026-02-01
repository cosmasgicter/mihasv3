import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

/**
 * Production Vite Configuration
 * 
 * Optimized for:
 * - Critical CSS extraction and inlining (Requirement 1.3)
 * - Code splitting for vendor libraries (Requirement 1.4)
 * - Instant first paint (<500ms FCP target)
 * - Bundle size optimization (<100KB landing page)
 */
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'service-worker.ts',
      injectRegister: false,
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webp}'],
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024
      },
      workbox: {
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/apply\.mihas\.edu\.zm\/api\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-cache',
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 60 * 60 * 24
              }
            }
          },
          {
            urlPattern: /\.(?:png|jpg|jpeg|svg|gif|webp)$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'images-cache',
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 60 * 60 * 24 * 30
              }
            }
          }
        ]
      }
    })
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    target: 'es2020',
    minify: 'terser',
    sourcemap: true,
    chunkSizeWarningLimit: 500,
    // Enable CSS code splitting for better critical CSS extraction
    cssCodeSplit: true,
    // Inline small assets to reduce HTTP requests
    assetsInlineLimit: 4096,
    // Disable compressed size reporting for faster builds
    reportCompressedSize: false,
    rollupOptions: {
      output: {
        /**
         * Manual Chunks Configuration - MINIMAL SAFE APPROACH
         * 
         * Previous strategies caused createContext errors due to chunk loading order.
         * 
         * New Strategy: Only split truly independent heavy libraries that are
         * dynamically imported. Let Vite handle React ecosystem automatically.
         * 
         * This prevents race conditions where React-dependent code loads before React.
         */
        manualChunks: (id) => {
          if (id.includes('node_modules')) {
            // ONLY split heavy libraries that are dynamically imported
            // These have no React dependencies at module initialization
            if (id.includes('xlsx') || id.includes('exceljs')) {
              return 'vendor-excel'
            }
            if (id.includes('jspdf') || id.includes('pdf-lib')) {
              return 'vendor-pdf'
            }
            if (id.includes('tesseract')) {
              return 'vendor-ocr'
            }
            if (id.includes('recharts') || id.includes('d3-')) {
              return 'vendor-charts'
            }
            
            // Framer Motion - separate chunk for animation library
            // This allows pages without animations to load faster
            if (id.includes('framer-motion')) {
              return 'vendor-animation'
            }
            
            // Lucide React icons - separate chunk
            // Tree-shaking is limited with barrel exports, but at least it's not in main bundle
            if (id.includes('lucide-react')) {
              return 'vendor-icons'
            }
            
            // React Router - separate chunk for routing
            if (id.includes('react-router') || id.includes('@remix-run/router')) {
              return 'vendor-router'
            }
            
            // Let Vite handle everything else automatically
            // This ensures proper dependency ordering for React ecosystem
          }
        },
        assetFileNames: (assetInfo) => {
          const info = assetInfo.name.split('.')
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
        passes: 2
      },
      mangle: {
        safari10: true
      }
    }
  },
  server: {
    port: 5173
  }
})