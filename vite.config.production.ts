import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'path'

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
            urlPattern: /^https:\/\/.*\.supabase\.co\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'supabase-cache',
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
    sourcemap: false,
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
         * Manual Chunks Configuration
         * 
         * Strategy:
         * 1. Core vendor chunks (react, router) - loaded immediately
         * 2. Feature vendor chunks (supabase, forms) - loaded on demand
         * 3. Heavy vendor chunks (excel, pdf, charts) - lazy loaded
         * 4. Motion chunk - separate for animation features
         * 5. UI components - grouped for caching
         * 
         * Target: Landing page bundle < 100KB (Requirement 1.4)
         */
        manualChunks: (id) => {
          if (id.includes('node_modules')) {
            // Core React - MUST be first, other libraries depend on it
            if (id.includes('react') || id.includes('react-dom')) {
              return 'vendor-react'
            }
            // Router - needed for navigation
            if (id.includes('react-router')) {
              return 'vendor-router'
            }
            // Motion/Framer Motion - separate chunk for animations
            // This allows pages without animations to load faster
            if (id.includes('framer-motion') || id.includes('motion')) {
              return 'vendor-motion'
            }
            // Supabase - backend integration
            if (id.includes('@supabase')) {
              return 'vendor-supabase'
            }
            // Forms - loaded when forms are needed
            if (id.includes('react-hook-form') || id.includes('zod') || id.includes('@hookform')) {
              return 'vendor-form'
            }
            // Radix UI - component primitives
            if (id.includes('@radix-ui')) {
              return 'vendor-radix'
            }
            // TanStack Query - data fetching
            if (id.includes('@tanstack')) {
              return 'vendor-query'
            }
            // Heavy libraries - lazy loaded only when needed
            if (id.includes('xlsx') || id.includes('exceljs')) {
              return 'vendor-excel'
            }
            if (id.includes('jspdf') || id.includes('pdf-lib')) {
              return 'vendor-pdf'
            }
            if (id.includes('recharts')) {
              return 'vendor-charts'
            }
            if (id.includes('tesseract')) {
              return 'vendor-ocr'
            }
            // Date utilities
            if (id.includes('date-fns')) {
              return 'vendor-date'
            }
            // Utility libraries (clsx, tailwind-merge, etc.)
            if (id.includes('clsx') || id.includes('tailwind-merge') || id.includes('class-variance-authority')) {
              return 'vendor-utils'
            }
          }
          
          // Group UI components together for better caching
          if (id.includes('src/components/ui/')) {
            return 'ui-components'
          }
          
          // Group admin components together (lazy loaded)
          if (id.includes('src/components/admin/')) {
            return 'admin-components'
          }
          
          // Group student components together
          if (id.includes('src/components/student/')) {
            return 'student-components'
          }
          
          // Group auth components together
          if (id.includes('src/components/auth/')) {
            return 'auth-components'
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