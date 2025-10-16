import { GenericContainer } from "testcontainers";
import { createClient } from "redis";

test("deve armazenar e recuperar dados do Redis usando Testcontainers", async () => {
  // Cria e inicia um container Redis
  const setupStart = performance.now();
  const container = await new GenericContainer("redis:7-alpine")
    .withExposedPorts(6379)
    .start();
  console.log(
    `⏱️  Container iniciado em: ${(performance.now() - setupStart).toFixed(
      2
    )}ms`
  );

  // Conecta ao Redis
  const startTest = performance.now();
  const url = `redis://${container.getHost()}:${container.getMappedPort(6379)}`;
  console.log(`Conectando ao Redis em: ${url}`);
  const redisClient = createClient({
    url,
  });
  await redisClient.connect();

  await redisClient.set("minha-chave", "meu-valor");

  // Recupera o valor
  const valor = await redisClient.get("minha-chave");

  // Verifica se o valor recuperado está correto
  expect(valor).toBe("meu-valor");

  // Cleanup
  await redisClient.quit();
  console.log(
    `⏱️  Teste executado em: ${(performance.now() - startTest).toFixed(2)}ms`
  );

  const cleanupStart = performance.now();
  // Para o container e remove o container
  await container.stop();
  //Para debugging, usar a variável de ambiente TESTCONTAINERS_RYUK_DISABLED=true
  //await container.stop({ remove: false });
  console.log(
    `⏱️  Cleanup completo em: ${(performance.now() - cleanupStart).toFixed(
      2
    )}ms`
  );
});
