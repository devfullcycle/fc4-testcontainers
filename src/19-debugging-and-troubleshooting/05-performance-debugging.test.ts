import { describe, it, expect } from "vitest";
import { GenericContainer } from "testcontainers";
import { Debug } from "./debug.js";

describe("Performance Debugging", () => {
  it("deve medir tempo de startup com wrapper", async () => {
    const { container, metrics } = await Debug.performance.measureStartup(
      new GenericContainer("alpine:3.19").withCommand(["sleep", "30"]),
      ["echo", "test"]
    );

    Debug.performance.printMetrics(metrics);

    await container.stop();

    expect(metrics.startup).toBeLessThan(20000); // Deve iniciar em menos de 20s
  });

  it("deve medir operações individuais", async () => {
    const { result: container, duration: startupDuration } =
      await Debug.performance.measureWithCallback("Container Startup", async () => {
        return await new GenericContainer("redis:7-alpine")
          .withExposedPorts(6379)
          .start();
      });

    expect(startupDuration).toBeLessThan(15000);

    const { duration: execDuration } = await Debug.performance.measureWithCallback(
      "Redis PING",
      async () => {
        return await container.exec(["redis-cli", "ping"]);
      }
    );

    expect(execDuration).toBeLessThan(1000);

    await container.stop();
  });
});
