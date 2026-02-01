import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'path'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'service-worker.ts',
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
    target: 'es2022', // Modern browsers only - removes polyfills
    minify: 'terser',
    sourcemap: false,
    chunkSizeWarningLimit: 500,
    modulePreload: { polyfill: false }, // No polyfills for modern browsers
    rollupOptions: {
      output: {
        /**
         * Manual Chunks - MINIMAL SAFE APPROACH
         * 
         * Only split truly independent heavy libraries.
         * Let Vite handle React ecosystem automatically to prevent createContext errors.
         */
        manualChunks: (id) => {
          if (id.includes('node_modules')) {
            // ONLY split heavy libraries that are dynamically imported
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
            
            // Let Vite handle everything else automatically
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
        passes: 2,
        ecma: 2020 // Modern syntax
      },
      mangle: {
        safari10: false // No Safari 10 support needed
      },
      format: {
        ecma: 2020
      }
    },
    cssCodeSplit: true,
    assetsInlineLimit: 4096,
    reportCompressedSize: false
  },
  server: {
    port: 5173
  }
})
