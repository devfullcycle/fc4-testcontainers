import path from "path";
import { PlaywrightContainer } from "testcontainers-node-playwright";
import fs from "fs";
import { extract as extractTar } from "tar";

describe("Playwright with Testcontainers", () => {
  const runPlaywrightTests = async () => {
    const PLAYWRIGHT_PROJECT_TESTS_TO_RUN_INTO_THE_CONTAINER = path.resolve(
      __dirname,
      'example-project-simple'
    );

    const container = await new PlaywrightContainer(
      "mcr.microsoft.com/playwright:v1.56.1-jammy",
      PLAYWRIGHT_PROJECT_TESTS_TO_RUN_INTO_THE_CONTAINER
    ).start();

    const { output, exitCode } = await container.exec([
      "npx",
      "playwright",
      "test",
      "--reporter=html"
    ]);

    console.log("Playwright output:", output);
    console.log("Exit code:", exitCode);

    // Copia o report do container
    const reportDestination = path.resolve(__dirname, 'example-project-simple');
    
    // Cria a pasta se não existir
    if (!fs.existsSync(reportDestination)) {
      fs.mkdirSync(reportDestination, { recursive: true });
    }
    
    const archiveStream = await container.copyArchiveFromContainer(
      "/playwright/playwright-report"
    );
    
    await new Promise<void>((resolve, reject) => {
      archiveStream.pipe(extractTar({
        cwd: reportDestination,
      }))
        .on('finish', resolve)
        .on('error', reject);
    });

    console.log("✅ Report saved to:", reportDestination);

    await container.stop();

    return { output, exitCode };
  };

  test("should run E2E tests inside container", async () => {
    const { exitCode } = await runPlaywrightTests();
    expect(exitCode).toBe(0);
  }, 240000); // 4 minutos

});
