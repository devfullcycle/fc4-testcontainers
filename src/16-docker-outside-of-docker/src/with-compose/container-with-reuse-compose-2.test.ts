import { DockerComposeEnvironment, Wait } from "testcontainers";
import { Client as PgClient } from "pg";
import { dropDatabase, createDatabase } from "../containers-helpers.js";
import { tryComposeUp } from "../redis-distributed-lock.js";
import path from "path";

describe("Compose Suite 2: Testes de Clientes", () => {
  let pgClient: PgClient;
  let databaseName: string;
  const composeFilePath = path.resolve(__dirname, "compose.yaml");

  // Setup global - executa uma vez antes de todos os testes
  beforeAll(async () => {
    console.log("[Compose Suite 2] Iniciando ambiente Docker Compose...");

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

    databaseName = "testdb_compose_suite2";
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
    CREATE TABLE IF NOT EXISTS customers (
      id SERIAL PRIMARY KEY,
      name VARCHAR(100),
      email VARCHAR(100) UNIQUE,
      city VARCHAR(50),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

    console.log("[Compose Suite 2] Ambiente iniciado e estrutura criada!");
  }, 120000);

  // Limpeza entre testes - garante isolamento
  beforeEach(async () => {
    // Limpa dados do PostgreSQL
    await pgClient.query("TRUNCATE TABLE customers RESTART IDENTITY CASCADE");
  });

  // Cleanup global - executa uma vez após todos os testes
  afterAll(async () => {
    console.log("[Compose Suite 2] Finalizando ambiente...");
    await pgClient.end();
  });

  it("deve criar um cliente", async () => {
    const result = await pgClient.query(
      "INSERT INTO customers (name, email, city) VALUES ($1, $2, $3) RETURNING *",
      ["John Doe", "john@example.com", "New York"]
    );

    expect(result.rows[0].name).toBe("John Doe");
    expect(result.rows[0].city).toBe("New York");
  });

  it("deve buscar cliente por email", async () => {
    await pgClient.query(
      "INSERT INTO customers (name, email, city) VALUES ($1, $2, $3)",
      ["Jane Smith", "jane@example.com", "Los Angeles"]
    );

    const result = await pgClient.query(
      "SELECT * FROM customers WHERE email = $1",
      ["jane@example.com"]
    );

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].name).toBe("Jane Smith");
  });

  it("não deve ter dados de testes anteriores", async () => {
    // Verifica que a limpeza entre testes funcionou
    const result = await pgClient.query(
      "SELECT COUNT(*) as count FROM customers"
    );
    expect(parseInt(result.rows[0].count)).toBe(0);
  });

  it("deve listar clientes por cidade", async () => {
    await pgClient.query(
      "INSERT INTO customers (name, email, city) VALUES ($1, $2, $3)",
      ["Alice", "alice@example.com", "Miami"]
    );
    await pgClient.query(
      "INSERT INTO customers (name, email, city) VALUES ($1, $2, $3)",
      ["Bob", "bob@example.com", "Miami"]
    );
    await pgClient.query(
      "INSERT INTO customers (name, email, city) VALUES ($1, $2, $3)",
      ["Charlie", "charlie@example.com", "Chicago"]
    );

    const result = await pgClient.query(
      "SELECT * FROM customers WHERE city = $1",
      ["Miami"]
    );

    expect(result.rows).toHaveLength(2);
  });
});
