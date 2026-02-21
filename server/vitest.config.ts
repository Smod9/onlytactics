import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@/config/env': path.resolve(__dirname, 'src/config/serverEnv'),
      '@/db': path.resolve(__dirname, 'src/db'),
      '@/auth': path.resolve(__dirname, 'src/auth'),
    },
  },
})
