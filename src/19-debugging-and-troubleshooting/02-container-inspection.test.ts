import { GenericContainer, type StartedTestContainer } from "testcontainers";

describe("Inspeção de Container", () => {
  let container: StartedTestContainer;

  beforeAll(async () => {
    container = await new GenericContainer("nginx:alpine")
      .withExposedPorts(80)
      .start();
  });

  afterAll(async () => {
    await container.stop();
  });

  it("deve inspecionar configurações do container", async () => {
    const containerId = container.getId();
    const host = container.getHost();
    const port = container.getMappedPort(80);

    console.log("=== Container Info ===");
    console.log("ID:", containerId);
    console.log("Host:", host);
    console.log("Port:", port);
    console.log("Name:", container.getName());

    // Executa comando dentro do container para debug
    const execResult = await container.exec(["nginx", "-v"]);
    console.log("Nginx version:", execResult.output);

    expect(containerId).toBeDefined();
    expect(port).toBeGreaterThan(0);
  });

  it("deve verificar variáveis de ambiente", async () => {
    const envResult = await container.exec(["printenv"]);
    console.log("Environment variables:", envResult.output);
  });
});
