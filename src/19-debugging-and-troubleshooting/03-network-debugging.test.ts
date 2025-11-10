import { GenericContainer, type StartedTestContainer } from "testcontainers";
import { Debug } from "./debug.js";

describe("Network Debugging", () => {
  let container: StartedTestContainer;

  beforeAll(async () => {
    container = await new GenericContainer("redis:7-alpine")
      .withExposedPorts(6379)
      .start();
  });

  afterAll(async () => {
    await container.stop();
  });

  it("deve verificar conectividade de rede", async () => {
    const result = await Debug.network.testContainerConnection(
      container,
      6379
    );

    expect(result.isReachable).toBe(true);
    expect(result.port).toBeGreaterThan(0);
  });

  it("deve listar interfaces de rede do container", async () => {
    const interfaces = await Debug.network.getNetworkInterfaces(container);

    expect(interfaces).toContain("eth0");
    expect(interfaces).toContain("lo");
  });

  it("deve diagnosticar problemas de rede", async () => {
    await Debug.network.diagnoseNetworkIssue(container, 6379);
    // Não deve lançar erro e deve mostrar informações de diagnóstico
  });
});
