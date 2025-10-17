import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'path'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const isProduction = mode === 'production'
  
  return {
    plugins: [
      react(),
      VitePWA({
        registerType: 'autoUpdate',
        strategies: 'injectManifest',
        srcDir: 'src',
        filename: 'service-worker.ts',
        injectManifest: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
          maximumFileSizeToCacheInBytes: 4 * 1024 * 1024
        },
        devOptions: {
          enabled: false
        },
        includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'masked-icon.svg'],
        manifest: {
          name: 'MIHAS Application System',
          short_name: 'MIHAS',
          description: 'Mukuba Institute of Health and Allied Sciences Application System',
          theme_color: '#1e40af',
          background_color: '#ffffff',
          display: 'standalone',
          start_url: '/',
          icons: [
            {
              src: 'icon.svg',
              sizes: 'any',
              type: 'image/svg+xml',
              purpose: 'any'
            },
            {
              src: 'favicon.ico',
              sizes: '16x16 32x32',
              type: 'image/x-icon'
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
      global: 'globalThis',
    },
    build: {
      target: 'esnext',
      minify: isProduction ? 'terser' : false,
      sourcemap: !isProduction,
      chunkSizeWarningLimit: 1000,
      rollupOptions: {
        output: {
          manualChunks: (id) => {
            if (id.includes('node_modules')) {
              if (id.includes('react') || id.includes('react-dom')) {
                return 'vendor'
              }
              if (id.includes('@supabase')) {
                return 'supabase'
              }
              if (id.includes('framer-motion')) {
                return 'animations'
              }
              if (id.includes('@radix-ui')) {
                return 'ui'
              }
              return 'vendor'
            }
            if (id.includes('src/pages/admin')) {
              return 'admin'
            }
            if (id.includes('src/components/ui')) {
              return 'ui-components'
            }
          }
        }
      },
      terserOptions: isProduction ? {
        compress: {
          drop_console: true,
          drop_debugger: true
        }
      } : undefined
    },
    test: {
      environment: 'jsdom',
      setupFiles: './tests/setupTests.ts',
      include: ['**/*.test.ts', '**/*.test.tsx'],
      exclude: [
        'tests/e2e/**',
        'tests/**/*.spec.ts',
        'tests/**/*.spec.tsx',
        'tests/integration/**',
        'tests/vite.config.test.ts',
        'node_modules/**',
        'dist/**'
      ]
    },
    server: {
      port: 5173,
      host: true,
      proxy: {
        '/api': {
          target: 'http://localhost:8888',
          changeOrigin: true,
          secure: false
        }
      }
    },
    preview: {
      port: 4173,
      host: true
    }
  }
})