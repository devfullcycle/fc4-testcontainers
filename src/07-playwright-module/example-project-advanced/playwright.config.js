import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false, // Desabilita paralelização pois cada teste cria seu container
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1, // Um worker por vez devido aos containers
  reporter: 'html',
  timeout: 120000, // Timeout maior devido ao tempo de setup do container
  use: {
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  //os testes são auto-suficientes e não usam webServer
  // A aplicação deve estar rodando manualmente em http://localhost:3000
});
