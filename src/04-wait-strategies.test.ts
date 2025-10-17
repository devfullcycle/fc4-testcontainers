import {
  GenericContainer,
  type StartedTestContainer,
  Wait,
} from "testcontainers";
import { createClient, type RedisClientType } from "redis";
import { Pool } from "pg";

// ========== FUNÇÕES AUXILIARES ==========
async function criarPostgresContainerComHealthcheck(): Promise<{
  container: StartedTestContainer;
  pool: Pool;
}> {
  const container = await new GenericContainer("postgres:15-alpine")
    .withEnvironment({
      POSTGRES_PASSWORD: "test123",
      POSTGRES_DB: "testdb",
    })
    .withExposedPorts(5432)
    .withHealthCheck({
      test: ["CMD-SHELL", "pg_isready -U postgres"],
      interval: 1000, // interval - tempo entre cada verificação
      timeout: 5000, // timeout - tempo máximo para considerar a verificação como falha
      retries: 5, // retries - número de tentativas antes de considerar o container como não saudável
      startPeriod: 0, // startPeriod - tempo inicial para ignorar falhas (útil para serviços que demoram a iniciar)
    })
    .withWaitStrategy(Wait.forHealthCheck())
    .start();

  const pool = new Pool({
    host: container.getHost(),
    port: container.getMappedPort(5432),
    database: "testdb",
    user: "postgres",
    password: "test123",
  });

  return { container, pool };
}

async function criarRedisContainerComLog(): Promise<{
  container: StartedTestContainer;
  client: RedisClientType;
}> {
  const container = await new GenericContainer("redis:7-alpine")
    .withExposedPorts(6379)
    .withWaitStrategy(
      Wait.forLogMessage("Ready to accept connections").withStartupTimeout(5000)
    )
    .start();

  const client = createClient({
    url: `redis://${container.getHost()}:${container.getMappedPort(6379)}`,
  }) as RedisClientType;
  await client.connect();

  return { container, client };
}

async function criarNginxContainerComHttp(): Promise<StartedTestContainer> {
  const container = await new GenericContainer("nginx:latest")
    .withExposedPorts(80)
    .withWaitStrategy(Wait.forHttp("/", 80).withStartupTimeout(5000))
    .start();

  return container;
}

describe("Wait Strategies: HealthCheck, Log e HTTP", () => {
  // ========== TESTES POSTGRESQL COM HEALTHCHECK ==========
  test.concurrent("PostgreSQL deve estar pronto via healthcheck", async () => {
    const { container: postgresContainer, pool: pgPool } =
      await criarPostgresContainerComHealthcheck();

    try {
      const client = await pgPool.connect();

      try {
        // Verifica conectividade
        const result = await client.query("SELECT NOW()");
        expect(result.rows).toHaveLength(1);
        expect(result.rows[0].now).toBeDefined();
      } finally {
        client.release();
      }
    } finally {
      await pgPool.end();
      await postgresContainer.stop();
    }
  });

  test.concurrent(
    "deve conseguir criar e consultar dados no PostgreSQL",
    async () => {
      const { container: postgresContainer, pool: pgPool } =
        await criarPostgresContainerComHealthcheck();

      try {
        const client = await pgPool.connect();

        try {
          // Cria uma tabela
          await client.query(`
          CREATE TABLE IF NOT EXISTS users (
            id SERIAL PRIMARY KEY,
            name VARCHAR(100) NOT NULL,
            email VARCHAR(100) NOT NULL
          )
        `);

          // Insere um registro
          await client.query(
            "INSERT INTO users (name, email) VALUES ($1, $2)",
            ["Maria Santos", "maria@example.com"]
          );

          // Verifica se o registro foi inserido
          const result = await client.query(
            "SELECT * FROM users WHERE name = $1",
            ["Maria Santos"]
          );

          expect(result.rows).toHaveLength(1);
          expect(result.rows[0].name).toBe("Maria Santos");
          expect(result.rows[0].email).toBe("maria@example.com");
        } finally {
          client.release();
        }
      } finally {
        await pgPool.end();
        await postgresContainer.stop();
      }
    }
  );

  // ========== TESTES REDIS COM LOG ==========
  test.concurrent("Redis deve estar pronto via log message", async () => {
    const { container: redisContainer, client: redisClient } =
      await criarRedisContainerComLog();

    try {
      // Testa comando PING
      const pong = await redisClient.ping();
      expect(pong).toBe("PONG");

      // Verifica que está conectado
      expect(redisClient.isOpen).toBe(true);
    } finally {
      await redisClient.quit();
      await redisContainer.stop();
    }
  });

  test.concurrent(
    "Redis deve conseguir armazenar e recuperar valores",
    async () => {
      const { container: redisContainer, client: redisClient } =
        await criarRedisContainerComLog();

      try {
        // SET
        await redisClient.set("usuario-key", "Pedro");

        // GET
        const value = await redisClient.get("usuario-key");

        expect(value).toBe("Pedro");

        // DEL
        const deleted = await redisClient.del("usuario-key");
        expect(deleted).toBe(1);
      } finally {
        await redisClient.quit();
        await redisContainer.stop();
      }
    }
  );

  // ========== TESTES NGINX COM HTTP ==========
  test.concurrent("Nginx deve estar pronto via HTTP healthcheck", async () => {
    const nginxContainer = await criarNginxContainerComHttp();

    try {
      const url = `http://${nginxContainer.getHost()}:${nginxContainer.getMappedPort(
        80
      )}`;
      const response = await fetch(url);

      expect(response.status).toBe(200);
      expect(response.ok).toBe(true);
    } finally {
      await nginxContainer.stop();
    }
  });

  test.concurrent("Nginx deve responder com HTML válido", async () => {
    const nginxContainer = await criarNginxContainerComHttp();

    try {
      const url = `http://${nginxContainer.getHost()}:${nginxContainer.getMappedPort(
        80
      )}`;
      const response = await fetch(url);
      const html = await response.text();

      expect(html).toContain("nginx");
      expect(html).toContain("<!DOCTYPE html>");
    } finally {
      await nginxContainer.stop();
    }
  });
});
