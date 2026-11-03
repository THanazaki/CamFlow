import { resolve } from 'node:path'

import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: { '@': resolve(import.meta.dirname, 'src') },
  },
  test: {
    environment: 'node',
    // fake-indexeddb を読み込んで IndexedDB をグローバルに生やす
    setupFiles: ['./src/lib/sync/__tests__/setup.ts'],
    include: ['src/**/*.test.ts'],
  },
})
