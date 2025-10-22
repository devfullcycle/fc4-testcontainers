import { test as base, expect } from '@playwright/test';
import { GenericContainer, Wait } from 'testcontainers';

// Extend base test com setup/teardown do container
const test = base.extend({
  page: async ({}, use) => {
    let playwrightContainer;
    let remoteBrowser;
    let context;
    let page;

    try {
      console.log('🚀 Starting Playwright container for this test...');
      
      const PLAYWRIGHT_VERSION = '1.56.1';
      
      playwrightContainer = await new GenericContainer(
        `mcr.microsoft.com/playwright:v${PLAYWRIGHT_VERSION}-jammy`
      )
        .withCommand(['npx', 'playwright', 'run-server', '--port', '3001'])
        .withExposedPorts(3001)
        .withExtraHosts([{ host: 'host.docker.internal', ipAddress: 'host-gateway' }])
        .withWaitStrategy(Wait.forLogMessage('Listening on'))
        .start();

      const host = playwrightContainer.getHost();
      const port = playwrightContainer.getMappedPort(3001);
      const wsEndpoint = `ws://${host}:${port}`;

      console.log(`✅ Connected to Playwright server: ${wsEndpoint}`);

      // Conecta ao browser remoto
      const { chromium } = await import('playwright');
      remoteBrowser = await chromium.connect(wsEndpoint);
      context = await remoteBrowser.newContext();
      page = await context.newPage();

      await use(page);

      // Cleanup
      await page.close();
      await context.close();
      await remoteBrowser.close();
      await playwrightContainer.stop();
      
      console.log('🛑 Playwright container stopped');
    } catch (error) {
      console.error('Error in test setup/teardown:', error);
      if (playwrightContainer) {
        await playwrightContainer.stop();
      }
      throw error;
    }
  },
});

test.describe('API Endpoints', () => {
  test('should return hello message from API', async ({ page }) => {
    // Usa page.request que compartilha o contexto
    const response = await page.request.get('http://host.docker.internal:3000/api/hello');
    
    expect(response.ok()).toBeTruthy();
    expect(response.status()).toBe(200);
    
    const data = await response.json();
    expect(data).toEqual({ message: 'Hello from API!' });
  });
});
