import { describe, it, expect } from "vitest";
import { GenericContainer, Wait } from "testcontainers";
import { Debug } from "./debug.js";

describe("Troubleshooting Timeout Issues", () => {
  it("deve lidar com timeout de startup", async () => {
    const { debugInfo } = await Debug.timeout.measureStartupAttempt(
      () =>
        new GenericContainer("postgres:16-alpine")
          .withExposedPorts(5432)
          .withEnvironment({ POSTGRES_PASSWORD: "test" })
          .withStartupTimeout(5000) // Timeout muito curto propositalmente
          .withWaitStrategy(Wait.forLogMessage("database system is ready", 2))
          .start(),
      5000
    );

    // Se houver debugInfo, significa que deu timeout
    if (debugInfo) {
      Debug.timeout.printTimeoutAnalysis(debugInfo);
      expect(debugInfo.error.message).toContain("timeout");
    }
  }, 15000);

  it("deve iniciar com sucesso quando timeout é adequado", async () => {
    const { container } = await Debug.timeout.measureStartupAttempt(
      () =>
        new GenericContainer("redis:7-alpine")
          .withExposedPorts(6379)
          .withStartupTimeout(30000)
          .start(),
      30000
    );

    expect(container).toBeDefined();
    await container?.stop();
  });
});
