import { DockerComposeEnvironment, Wait } from "testcontainers";
import { Client as PgClient } from "pg";
import { dropDatabase, createDatabase } from "../containers-helpers.js";
import { tryComposeUp } from "../redis-distributed-lock.js";
import path from "path";

describe("Compose Suite 1: Testes de Produtos", () => {
  let pgClient: PgClient;
  let databaseName: string;
  const composeFilePath = path.resolve(__dirname, "compose.yaml"); 

  // Setup global - executa uma vez antes de todos os testes
  beforeAll(async () => {
    console.log("[Compose Suite 1] Iniciando ambiente Docker Compose...");

    // const composeEnvironment = await new DockerComposeEnvironment(
    //   __dirname,
    //   "compose.yaml"
    // )
    //   .withNoRecreate()
    //   .withProfiles("postgres")
    //   .withWaitStrategy("postgres", Wait.forHealthCheck())
    //   .up();

    const composeEnvironment = await tryComposeUp(
      composeFilePath, 
      async () => {
        return new DockerComposeEnvironment(__dirname, "compose.yaml")
          .withNoRecreate()
          .withProfiles("postgres")
          .withWaitStrategy("postgres", Wait.forHealthCheck())
          .up();
      }
    );

    databaseName = "testdb_compose_suite1";
    const postgresContainer = composeEnvironment.getContainer("postgres-1");
    await dropDatabase(postgresContainer, databaseName);
    await createDatabase(postgresContainer, databaseName);

    pgClient = new PgClient({
      host: postgresContainer.getHost(),
      port: postgresContainer.getMappedPort(5432),
      user: "testuser",
      password: "testpass",
      database: databaseName,
    });
    await pgClient.connect();

    // Cria estrutura inicial do banco
    await pgClient.query(`
    CREATE TABLE IF NOT EXISTS products (
      id SERIAL PRIMARY KEY,
      name VARCHAR(100),
      price DECIMAL(10, 2),
      stock INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

    console.log("[Compose Suite 1] Ambiente iniciado e estrutura criada!");
  }, 120000);

  beforeEach(async () => {
    // Limpa dados do PostgreSQL
    await pgClient.query("TRUNCATE TABLE products RESTART IDENTITY CASCADE");
  });

  // Cleanup global - executa uma vez após todos os testes
  afterAll(async () => {
    console.log("[Compose Suite 1] Finalizando ambiente...");
    await pgClient.end();
  });

  it("deve criar um produto", async () => {
    const result = await pgClient.query(
      "INSERT INTO products (name, price, stock) VALUES ($1, $2, $3) RETURNING *",
      ["Laptop", 1299.99, 10]
    );

    expect(result.rows[0].name).toBe("Laptop");
    expect(result.rows[0].price).toBe("1299.99");
    expect(result.rows[0].stock).toBe(10);
  });

  it("deve buscar produto criado", async () => {
    await pgClient.query(
      "INSERT INTO products (name, price, stock) VALUES ($1, $2, $3)",
      ["Mouse", 29.99, 50]
    );

    const result = await pgClient.query(
      "SELECT * FROM products WHERE name = $1",
      ["Mouse"]
    );

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].name).toBe("Mouse");
  });

  it("não deve ter dados de testes anteriores", async () => {
    // Verifica que a limpeza entre testes funcionou
    const result = await pgClient.query(
      "SELECT COUNT(*) as count FROM products"
    );
    expect(parseInt(result.rows[0].count)).toBe(0);
  });

  it("deve atualizar estoque de produto", async () => {
    await pgClient.query(
      "INSERT INTO products (name, price, stock) VALUES ($1, $2, $3)",
      ["Keyboard", 79.99, 20]
    );

    await pgClient.query(
      "UPDATE products SET stock = stock - 5 WHERE name = $1",
      ["Keyboard"]
    );

    const result = await pgClient.query(
      "SELECT stock FROM products WHERE name = $1",
      ["Keyboard"]
    );

    expect(result.rows[0].stock).toBe(15);
  });

  it("deve listar produtos com estoque baixo", async () => {
    await pgClient.query(
      "INSERT INTO products (name, price, stock) VALUES ($1, $2, $3)",
      ["Item A", 10.0, 3]
    );
    await pgClient.query(
      "INSERT INTO products (name, price, stock) VALUES ($1, $2, $3)",
      ["Item B", 20.0, 15]
    );
    await pgClient.query(
      "INSERT INTO products (name, price, stock) VALUES ($1, $2, $3)",
      ["Item C", 30.0, 2]
    );

    const result = await pgClient.query(
      "SELECT * FROM products WHERE stock < 5"
    );

    expect(result.rows).toHaveLength(2);
  });
});
