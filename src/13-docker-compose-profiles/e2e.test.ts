import {
  DockerComposeEnvironment,
  StartedDockerComposeEnvironment,
  Wait,
} from "testcontainers";
import path from "path";
import { spawn, ChildProcess } from "child_process";
import {
  chromium,
  expect,
  type Browser,
  type BrowserContext,
  type Page,
} from "@playwright/test";

describe("Docker Compose Profile: E2E (End-to-End) com Playwright", () => {
  let environment: StartedDockerComposeEnvironment;
  let appProcess: ChildProcess;
  let browser: Browser;
  let context: BrowserContext;
  let page: Page;

  beforeAll(async () => {
    const startTime = performance.now();
    console.log("🚀 Iniciando setup do ambiente E2E...");

    const composeFilePath = __dirname;
    const composeFile = "compose.yaml";

    // Sobe todos os serviços do profile e2e
    const composeStartTime = performance.now();
    environment = await new DockerComposeEnvironment(
      composeFilePath,
      composeFile
    )
      .withProfiles("e2e")
      .withWaitStrategy("postgres", Wait.forHealthCheck())
      .withWaitStrategy("keycloak", Wait.forHealthCheck())
      .withWaitStrategy("redis", Wait.forHealthCheck())
      .withWaitStrategy("rabbitmq", Wait.forHealthCheck())
      .withWaitStrategy(
        "playwright",
        Wait.forLogMessage("Listening on ws://localhost:3001/")
      )
      .up();
    console.log(
      `⏱️  Docker Compose up: ${(
        (performance.now() - composeStartTime) /
        1000
      ).toFixed(2)}s`
    );

    // Obtém informações dos containers
    const postgres = environment.getContainer("postgres-1");
    const redis = environment.getContainer("redis-1");
    const rabbitmq = environment.getContainer("rabbitmq-1");
    const keycloak = environment.getContainer("keycloak-1");
    const playwrightContainer = environment.getContainer("playwright-1");

    // Configura variáveis de ambiente para a aplicação
    const env = {
      ...process.env,
      PORT: "3000",
      REDIS_URL: `redis://${redis.getHost()}:${redis.getMappedPort(6379)}`,
      POSTGRES_HOST: postgres.getHost(),
      POSTGRES_PORT: postgres.getMappedPort(5432).toString(),
      POSTGRES_USER: "testuser",
      POSTGRES_PASSWORD: "testpass",
      POSTGRES_DB: "myapp",
      RABBITMQ_URL: `amqp://guest:guest@${rabbitmq.getHost()}:${rabbitmq.getMappedPort(
        5672
      )}`,
      KEYCLOAK_URL: `http://${keycloak.getHost()}:${keycloak.getMappedPort(
        8080
      )}`,
    };

    // Inicia a aplicação Node.js
    const appStartTime = performance.now();
    const appFile = path.join(__dirname, "app.js");

    appProcess = spawn("node", [appFile], {
      env,
      stdio: "pipe",
    });

    appProcess.stdout?.on("data", (data) => {
      console.log(`[APP] ${data.toString().trim()}`);
    });

    appProcess.stderr?.on("data", (data) => {
      console.error(`[APP ERROR] ${data.toString().trim()}`);
    });

    // Aguarda a aplicação iniciar
    await new Promise((resolve) => setTimeout(resolve, 3000));
    console.log(
      `⏱️  Aplicação Node.js iniciada: ${(
        (performance.now() - appStartTime) /
        1000
      ).toFixed(2)}s`
    );

    // Conecta ao Playwright server rodando no container
    const playwrightStartTime = performance.now();
    const playwrightHost = playwrightContainer.getHost();
    const playwrightPort = playwrightContainer.getMappedPort(3001);
    const wsEndpoint = `ws://${playwrightHost}:${playwrightPort}`;

    console.log(`🎭 Conectando ao Playwright server: ${wsEndpoint}`);

    browser = await chromium.connect(wsEndpoint);
    context = await browser.newContext({});
    page = await context.newPage();
    console.log(
      `⏱️  Playwright conectado: ${(
        (performance.now() - playwrightStartTime) /
        1000
      ).toFixed(2)}s`
    );

    console.log(
      `⏱️  ✅ Setup total: ${((performance.now() - startTime) / 1000).toFixed(
        2
      )}s`
    );
  }, 240000); // 4 minutos de timeout

  afterAll(async () => {
    // Fecha o Playwright
    if (page) await page.close();
    if (context) await context.close();
    if (browser) await browser.close();

    // Mata o processo da aplicação
    if (appProcess) {
      appProcess.kill("SIGTERM");
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    // Derruba os containers
    await environment.down();
  });

  it("deve executar testes E2E com Playwright no modo servidor", async () => {
    const testStartTime = performance.now();
    console.log("🧪 Iniciando testes E2E...");

    // Navega para a home page
    await page.goto("http://host.docker.internal:3000/");

    // Verifica o título
    await expect(page).toHaveTitle("E2E App - Home");

    // Verifica o heading
    const heading = page.locator("h1");
    await expect(heading).toHaveText("Welcome to E2E App");

    // Verifica que o contador de views está presente
    const countElement = page.locator("#count");
    await expect(countElement).toBeVisible();

    // O contador deve ser um número maior que 0
    const countText = await countElement.textContent();
    const count = parseInt(countText || "0");
    expect(count).toBeGreaterThan(0);

    console.log(`✅ Home page carregada com ${count} views`);

    // Navega para a página About
    await page.click("text=About");
    await expect(page).toHaveURL("http://host.docker.internal:3000/about");
    await expect(page.locator("h1")).toHaveText("About This App");

    // Verifica que todos os serviços estão mencionados
    await expect(page.locator("text=Redis for caching")).toBeVisible();
    await expect(page.locator("text=PostgreSQL for persistence")).toBeVisible();
    await expect(page.locator("text=RabbitMQ for messaging")).toBeVisible();
    await expect(
      page.locator("text=Keycloak for authentication")
    ).toBeVisible();

    console.log("✅ About page carregada com todas as integrações");

    // Navega para a página de Stats
    await page.click("text=Stats");
    await expect(page).toHaveURL("http://host.docker.internal:3000/stats");
    await expect(page.locator("h1")).toHaveText("Statistics");

    // Verifica que as estatísticas estão sendo exibidas
    await expect(page.locator("text=Redis View Count:")).toBeVisible();
    await expect(page.locator("text=Database Records:")).toBeVisible();

    console.log("✅ Stats page carregada com dados do Redis e PostgreSQL");

    // Testa a API de health do Keycloak
    const keycloakHealthResponse = await page.request.get(
      "http://host.docker.internal:3000/api/keycloak-health"
    );
    expect(keycloakHealthResponse.ok()).toBeTruthy();

    const keycloakHealth = await keycloakHealthResponse.json();
    expect(keycloakHealth.keycloak.healthy).toBe(true);
    expect(keycloakHealth.keycloak.status).toBe(200);

    console.log("✅ Keycloak health verificado via API");

    // Testa a API de health geral
    const healthResponse = await page.request.get(
      "http://host.docker.internal:3000/api/health"
    );
    expect(healthResponse.ok()).toBeTruthy();

    const health = await healthResponse.json();
    expect(health.redis).toBe(true);
    expect(health.postgres).toBe(true);
    expect(health.rabbitmq).toBe(true);

    console.log("✅ Health check de todos os serviços passou");

    // Volta para home e verifica que o contador incrementou
    await page.click("text=Home");
    await page.reload();

    const newCountText = await countElement.textContent();
    const newCount = parseInt(newCountText || "0");
    expect(newCount).toBeGreaterThan(count);

    console.log(`✅ Contador incrementou de ${count} para ${newCount}`);
    console.log("🎉 Teste E2E completo com sucesso!");
    console.log(
      `⏱️  ✅ Tempo total do teste: ${(
        (performance.now() - testStartTime) /
        1000
      ).toFixed(2)}s`
    );
  });
});
