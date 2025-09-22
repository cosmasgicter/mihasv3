import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  define: {
    global: 'globalThis',
  },
  server: {
    port: 5173,
    host: '0.0.0.0', // Bind to all interfaces for network access
    strictPort: true,
    cors: true
  },
  preview: {
    port: 4173,
    host: '0.0.0.0'
  }
})