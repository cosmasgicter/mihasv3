import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'src/test/',
        '**/*.d.ts',
        '**/*.config.*',
        'dist/'
      ]
    },
    reporters: [
      'default',
      ['junit', { outputFile: 'coverage/junit.xml' }]
    ]
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src')
    }
  }
})