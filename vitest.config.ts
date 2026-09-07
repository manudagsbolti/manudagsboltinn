import { defineConfig } from 'vitest/config'

export default defineConfig({
  // Tests never load local cloud credentials or the production PWA plugins.
  envDir: false,
  test: {
    environment: 'node',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.ts'],
    clearMocks: true,
  },
})
