import {
  PostgreSqlContainer,
  StartedPostgreSqlContainer,
} from "@testcontainers/postgresql";
import { Pool, type PoolClient } from "pg";

describe("PostgreSQL 2", () => {
  let container: StartedPostgreSqlContainer;
  let pgPool: Pool;
  let pgClient: PoolClient;

  beforeAll(async () => {
    // Inicia o container PostgreSQL
    container = await new PostgreSqlContainer("postgres:15-alpine")
      .withDatabase("testdb")
      .withUsername("testuser")
      .withPassword("testpass")
      .withReuse()
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
      CREATE TABLE IF NOT EXISTS products (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        price DECIMAL(10, 2) NOT NULL,
        description TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
  });

  beforeEach(async () => {
    await pgClient.query("TRUNCATE TABLE products");
  })

  afterAll(async () => {
    await pgClient.release();
    await pgPool.end();
    //await container.stop(); // Reuso do container, então não paramos aqui
  });

  it("deve inserir um produto no banco", async () => {
    const result = await pgClient.query(
      "INSERT INTO products (name, price, description) VALUES ($1, $2, $3) RETURNING *",
      ["Notebook", 2500.00, "Notebook high-end"]
    );

    expect(result.rows[0]).toMatchObject({
      name: "Notebook",
      price: "2500.00",
    });
    expect(result.rows[0].id).toBeDefined();
  });

  it("deve buscar produtos do banco", async () => {
    await pgClient.query(
      "INSERT INTO products (name, price, description) VALUES ($1, $2, $3)",
      ["Mouse", 50.00, "Mouse gamer"]
    );

    const result = await pgClient.query(
      "SELECT * FROM products WHERE name = $1",
      ["Mouse"]
    );

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].name).toBe("Mouse");
  });

  it("deve atualizar um produto", async () => {
    const insertResult = await pgClient.query(
      "INSERT INTO products (name, price, description) VALUES ($1, $2, $3) RETURNING id",
      ["Teclado", 150.00, "Teclado mecânico"]
    );
    const productId = insertResult.rows[0].id;

    await pgClient.query("UPDATE products SET price = $1 WHERE id = $2", [
      200.00,
      productId,
    ]);

    const result = await pgClient.query("SELECT * FROM products WHERE id = $1", [
      productId,
    ]);
    expect(result.rows[0].price).toBe("200.00");
  });

  it("deve deletar um produto", async () => {
    const insertResult = await pgClient.query(
      "INSERT INTO products (name, price, description) VALUES ($1, $2, $3) RETURNING id",
      ["Monitor", 800.00, "Monitor 4K"]
    );
    const productId = insertResult.rows[0].id;

    await pgClient.query("DELETE FROM products WHERE id = $1", [productId]);

    const result = await pgClient.query("SELECT * FROM products WHERE id = $1", [
      productId,
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
