import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  resolve: {
    alias: {
      common: path.resolve(__dirname, 'src/common'),
      share: path.resolve(__dirname, 'src/share'),
    },
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: ['src/common/**/*.ts', 'src/main/lib/**/*.ts'],
      exclude: ['src/**/*.d.ts'],
    },
  },
})
