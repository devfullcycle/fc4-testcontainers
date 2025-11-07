import { StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { Client as PgClient } from "pg";
import {
  createDatabase,
  createReusablePostgresContainer,
  dropDatabase,
  tryStartContainer,
} from "../containers-helpers.js";

describe("Suite 2: Testes de Clientes", () => {
  // Variáveis globais para containers reutilizáveis
  let postgresContainer: StartedPostgreSqlContainer;
  let pgClient: PgClient;
  let databaseName: string;

  beforeAll(async () => {
    console.log("[Suite 2] Iniciando container PostgreSQL...");

    // Inicia PostgreSQL uma vez
    //postgresContainer = await createReusablePostgresContainer().start();

    postgresContainer = await tryStartContainer(() =>
      createReusablePostgresContainer().start()
    );

    databaseName = "testdb_suite2";
    await dropDatabase(postgresContainer, databaseName);
    await createDatabase(postgresContainer, databaseName);

    // Cria conexões
    pgClient = new PgClient({
      host: postgresContainer.getHost(),
      port: postgresContainer.getPort(),
      user: postgresContainer.getUsername(),
      password: postgresContainer.getPassword(),
      database: postgresContainer.getDatabase(),
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

    console.log("[Suite 2] Container iniciado e estrutura criada!");
  }, 60000);

  beforeEach(async () => {
    // Limpa dados do PostgreSQL antes de cada teste
    await pgClient.query("TRUNCATE TABLE customers RESTART IDENTITY CASCADE");
  });

  // Cleanup global - executa uma vez após todos os testes
  afterAll(async () => {
    console.log("[Suite 2] Finalizando container...");
    await pgClient.end();
    // se os testes rodam em paralelo + reutilizam o container, não devemos parar o container aqui
    // se os testes não rodam em paralelo, ok, podemos parar, outra suite vai iniciar o container, mas podemos perder performance
    //await postgresContainer.stop();
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
