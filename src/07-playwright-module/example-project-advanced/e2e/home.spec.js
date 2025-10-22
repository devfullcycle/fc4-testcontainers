import { test as base, expect } from "@playwright/test";
import { GenericContainer, Wait } from "testcontainers";

// Extend base test com setup/teardown do container
const test = base.extend({
  page: async ({}, use) => {
    let playwrightContainer;
    let remoteBrowser;
    let context;
    let page;

    try {
      console.log("🚀 Starting Playwright container for this test...");

      const PLAYWRIGHT_VERSION = "1.56.1";

      playwrightContainer = await new GenericContainer(
        `mcr.microsoft.com/playwright:v${PLAYWRIGHT_VERSION}-jammy`
      )
        .withCommand(["npx", "playwright", "run-server", "--port", "3001"])
        .withExposedPorts(3001)
        .withExtraHosts([
          { host: "host.docker.internal", ipAddress: "host-gateway" },
        ])
        .withWaitStrategy(Wait.forLogMessage("Listening on"))
        .start();

      const host = playwrightContainer.getHost();
      const port = playwrightContainer.getMappedPort(3001);
      const wsEndpoint = `ws://${host}:${port}`;

      console.log(`✅ Connected to Playwright server: ${wsEndpoint}`);

      // Conecta ao browser remoto
      const { chromium } = await import("playwright");
      remoteBrowser = await chromium.connect(wsEndpoint);
      context = await remoteBrowser.newContext();
      page = await context.newPage();

      await use(page);

      // Cleanup
      await page.close();
      await context.close();
      await remoteBrowser.close();
      await playwrightContainer.stop();

      console.log("🛑 Playwright container stopped");
    } catch (error) {
      console.error("Error in test setup/teardown:", error);
      if (playwrightContainer) {
        await playwrightContainer.stop();
      }
      throw error;
    }
  },
});

test.describe("Home Page", () => {
  test("should display welcome message", async ({ page }) => {
    await page.goto("http://host.docker.internal:3000/");

    await expect(page).toHaveTitle("Home Page");
    await expect(page.locator("h1")).toHaveText("Welcome to Express App");
    await expect(page.locator("p")).toContainText(
      "simple Express.js application"
    );
  });

  test("should navigate to about page", async ({ page }) => {
    await page.goto("http://host.docker.internal:3000/");

    await page.click("text=Go to About");
    await expect(page).toHaveURL("http://host.docker.internal:3000/about");
    await expect(page.locator("h1")).toHaveText("About Us");
  });
});
