import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

const devServerPort = Number(process.env.VITE_DEV_SERVER_PORT) || 5173

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
    port: devServerPort,
    host: '0.0.0.0', // Bind to all interfaces for network access
    strictPort: false,
    cors: true
  },
  preview: {
    port: 4173,
    host: '0.0.0.0'
  }
})
