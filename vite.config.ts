import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'path'

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
            // Cache Supabase API calls with network-first strategy
            urlPattern: /^https:\/\/.*\.supabase\.co\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'supabase-cache',
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 60 * 60 * 24 // 24 hours
              }
            }
          },
          {
            // Cache images with cache-first strategy
            urlPattern: /\.(?:png|jpg|jpeg|svg|gif|webp)$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'images-cache',
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 60 * 60 * 24 * 30 // 30 days
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
         * - Supabase (large, independent)
         * - Excel/PDF (dynamically imported, heavy)
         * - OCR (tesseract.js, heavy)
         * - Charts (recharts, dynamically imported)
         */
        manualChunks: (id) => {
          if (id.includes('node_modules')) {
            // Supabase - large and independent
            if (id.includes('@supabase')) {
              return 'vendor-supabase'
            }
            
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
        ecma: 2022
      },
      mangle: {
        safari10: false // No Safari 10 support needed
      },
      format: {
        ecma: 2022
      }
    }
  },
  server: {
    port: 5173,
    host: '0.0.0.0',
    strictPort: false,
    cors: true,
    hmr: {
      overlay: true
    }
  },
  preview: {
    port: 4173,
    host: '0.0.0.0'
  }
})
