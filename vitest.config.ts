import { defineConfig } from 'vitest/config'

// Separado do vite.config.ts para não carregar o plugin de PWA nos testes.
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'worker/**/*.test.ts'],
    environment: 'node',
    setupFiles: ['./src/test/setup.ts'],
    restoreMocks: true,
  },
})
