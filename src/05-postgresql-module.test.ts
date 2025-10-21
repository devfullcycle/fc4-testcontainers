import {
  PostgreSqlContainer,
  StartedPostgreSqlContainer,
} from "@testcontainers/postgresql";
import { Pool, type PoolClient } from "pg";

describe("Integração com PostgreSQL", () => {
  let container: StartedPostgreSqlContainer;
  let pgPool: Pool;
  let pgClient: PoolClient;

  beforeAll(async () => {
    // Inicia o container PostgreSQL
    container = await new PostgreSqlContainer("postgres:15-alpine")
      .withDatabase("testdb")
      .withUsername("testuser")
      .withPassword("testpass")
      .start();

    console.log(`PostgreSQL rodando em: ${container.getConnectionUri()}`);

    // Cria cliente de conexão
    pgPool = new Pool({
      host: container.getHost(),
      port: container.getPort(),
      database: container.getDatabase(),
      user: container.getUsername(),
      password: container.getPassword(),
    });

    pgClient = await pgPool.connect();

    // Cria tabela de exemplo
    await pgClient.query(`
      CREATE TABLE users (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        email VARCHAR(100) UNIQUE NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
  });

  afterAll(async () => {
    await pgClient.release();
    await pgPool.end();
    await container.stop();
  });

  it("deve inserir um usuário no banco", async () => {
    const result = await pgClient.query(
      "INSERT INTO users (name, email) VALUES ($1, $2) RETURNING *",
      ["John Doe", "john@example.com"]
    );

    expect(result.rows[0]).toMatchObject({
      name: "John Doe",
      email: "john@example.com",
    });
    expect(result.rows[0].id).toBeDefined();
  });

  it("deve buscar usuários do banco", async () => {
    await pgClient.query("INSERT INTO users (name, email) VALUES ($1, $2)", [
      "Jane Doe",
      "jane@example.com",
    ]);

    const result = await pgClient.query(
      "SELECT * FROM users WHERE email = $1",
      ["jane@example.com"]
    );

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].name).toBe("Jane Doe");
  });

  it("deve atualizar um usuário", async () => {
    const insertResult = await pgClient.query(
      "INSERT INTO users (name, email) VALUES ($1, $2) RETURNING id",
      ["Bob Smith", "bob@example.com"]
    );
    const userId = insertResult.rows[0].id;

    await pgClient.query("UPDATE users SET name = $1 WHERE id = $2", [
      "Robert Smith",
      userId,
    ]);

    const result = await pgClient.query("SELECT * FROM users WHERE id = $1", [
      userId,
    ]);
    expect(result.rows[0].name).toBe("Robert Smith");
  });

  it("deve deletar um usuário", async () => {
    const insertResult = await pgClient.query(
      "INSERT INTO users (name, email) VALUES ($1, $2) RETURNING id",
      ["Delete Me", "delete@example.com"]
    );
    const userId = insertResult.rows[0].id;

    await pgClient.query("DELETE FROM users WHERE id = $1", [userId]);

    const result = await pgClient.query("SELECT * FROM users WHERE id = $1", [
      userId,
    ]);
    expect(result.rows).toHaveLength(0);
  });

  it("deve obter a connection string correta", () => {
    const connectionString = container.getConnectionUri();
    expect(connectionString).toContain("postgres://");
    expect(connectionString).toContain("testuser");
    expect(connectionString).toContain("testdb");
  });
});
