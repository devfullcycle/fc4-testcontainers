import { GenericContainer, type StartedTestContainer } from 'testcontainers';
import { createClient, type RedisClientType } from 'redis';
import { Pool } from 'pg';

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// ========== FUNÇÕES AUXILIARES ==========
async function criarPostgresContainer(): Promise<{ container: StartedTestContainer; pool: Pool }> {
  const container = await new GenericContainer('postgres:15-alpine')
    .withEnvironment({
      POSTGRES_PASSWORD: 'test123',
      POSTGRES_DB: 'testdb',
    })
    .withExposedPorts(5432)
    //.withExposedPorts({container: 5432, host: 5432}) // binding manual da porta
    .start();
  
  console.log(`PostgreSQL container iniciado em: ${container.getHost()}:${container.getMappedPort(5432)}`);

  const pool = new Pool({
    host: container.getHost(),
    port: container.getMappedPort(5432),
    database: 'testdb',
    user: 'postgres',
    password: 'test123',
  });
  await sleep(2000); // Espera o banco estar pronto
  return { container, pool };
}

async function criarRedisContainer(): Promise<{ container: StartedTestContainer; client: RedisClientType }> {
  const container = await new GenericContainer('redis:7-alpine')
    .withExposedPorts(6379)
    .start();

  console.log(`Redis container iniciado em: ${container.getHost()}:${container.getMappedPort(6379)}`);

  const client = createClient({
    url: `redis://${container.getHost()}:${container.getMappedPort(6379)}`,
  }) as RedisClientType;
  await client.connect();
  await sleep(2000); // Espera o banco estar pronto
  return { container, client };
}

describe('PostgreSQL e Redis', () => {
  // ========== TESTES POSTGRESQL ==========

  test.concurrent('deve conseguir criar uma tabela e inserir dados no PostgreSQL', async () => {
    const { container: postgresContainer, pool: pgPool } = await criarPostgresContainer();

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
          'INSERT INTO users (name, email) VALUES ($1, $2)',
          ['João Silva', 'joao@example.com']
        );

        // Verifica se o registro foi inserido
        const result = await client.query('SELECT * FROM users WHERE name = $1', ['João Silva']);

        expect(result.rows).toHaveLength(1);
        expect(result.rows[0].name).toBe('João Silva');
        expect(result.rows[0].email).toBe('joao@example.com');
      } finally {
        client.release();
      }
    } finally {
      await pgPool.end();
      await postgresContainer.stop();
    }
  });

  test.concurrent('deve conseguir armazenar e recuperar dados no PostgreSQL', async () => {
    const { container: postgresContainer, pool: pgPool } = await criarPostgresContainer();

    try {
      const client = await pgPool.connect();

      try {
        // Garante que a tabela existe
        await client.query(`
          CREATE TABLE IF NOT EXISTS products (
            id SERIAL PRIMARY KEY,
            name VARCHAR(100) NOT NULL,
            price DECIMAL(10, 2) NOT NULL
          )
        `);

        // Insere um produto
        await client.query(
          'INSERT INTO products (name, price) VALUES ($1, $2)',
          ['Notebook', 2500.50]
        );

        // Verifica se o produto foi inserido
        const result = await client.query('SELECT * FROM products WHERE name = $1', ['Notebook']);

        expect(result.rows).toHaveLength(1);
        expect(result.rows[0].name).toBe('Notebook');
        expect(result.rows[0].price).toBe('2500.50');
      } finally {
        client.release();
      }
    } finally {
      await pgPool.end();
      await postgresContainer.stop();
    }
  });

  // ========== TESTES REDIS ==========
  test.concurrent('deve conseguir fazer PING e PONG com Redis', async () => {
    const { container: redisContainer, client: redisClient } = await criarRedisContainer();

    try {
      // Testa comando PING
      const pong = await redisClient.ping();
      expect(pong).toBe('PONG');

      // Verifica que está conectado
      expect(redisClient.isOpen).toBe(true);
    } finally {
      await redisClient.quit();
      await redisContainer.stop();
    }
  });

  test.concurrent('deve conseguir armazenar e recuperar valores no Redis', async () => {
    const { container: redisContainer, client: redisClient } = await criarRedisContainer();

    try {
      // SET
      await redisClient.set('produto-key', 'Smartphone');

      // GET
      const value = await redisClient.get('produto-key');

      expect(value).toBe('Smartphone');

      // DELETE
      const deleted = await redisClient.del('produto-key');
      expect(deleted).toBe(1);
    } finally {
      await redisClient.quit();
      await redisContainer.stop();
    }
  });
});