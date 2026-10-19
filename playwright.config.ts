import { defineConfig, devices } from '@playwright/test'

export const PROXY = 'http://localhost:8787'

export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:4317',
    locale: 'pt-BR',
    viewport: { width: 1280, height: 780 },
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 780 } } }],
  webServer: {
    // O proxy (Worker) é simulado nos testes interceptando as requisições para PROXY.
    command: 'npx vite build && npx vite preview --port 4317 --strictPort',
    env: { VITE_PROXY_URL: PROXY },
    url: 'http://localhost:4317',
    // Sempre um build novo, para nunca testar um dist antigo com outra configuração.
    reuseExistingServer: false,
    timeout: 120_000,
  },
})
