import { StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { Client as PgClient } from "pg";
import {
  createDatabase,
  createReusablePostgresContainer,
  dropDatabase,
  tryStartContainer,
} from "../containers-helpers.js";

describe("Suite 1: Testes de Produtos", () => {
  let postgresContainer: StartedPostgreSqlContainer;
  let pgClient: PgClient;
  let databaseName: string;

  beforeAll(async () => {
    console.log("[Suite 1] Iniciando container PostgreSQL...");

    // Inicia PostgreSQL uma vez
    //postgresContainer = await createReusablePostgresContainer().start();

    postgresContainer = await tryStartContainer(() =>
        createReusablePostgresContainer().start()
    );

    databaseName = "testdb_suite1";
    await dropDatabase(postgresContainer, databaseName);
    await createDatabase(postgresContainer, databaseName);

    // Cria conexões
    pgClient = new PgClient({
      host: postgresContainer.getHost(),
      port: postgresContainer.getPort(),
      user: postgresContainer.getUsername(),
      password: postgresContainer.getPassword(),
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

    console.log("[Suite 1] Container iniciado e estrutura criada!");
    console.log('[Suite 1] Postgres running in '+ postgresContainer.getConnectionUri())
  }, 60000);

  // Limpeza entre testes - garante isolamento
  beforeEach(async () => {
    // Limpa dados do PostgreSQL
    await pgClient.query("TRUNCATE TABLE products RESTART IDENTITY CASCADE");
  });

  // Cleanup global - executa uma vez após todos os testes
  afterAll(async () => {
    console.log("[Suite 1] Finalizando container...");
    await pgClient.end();
    // se os testes rodam em paralelo + reutilizam o container, não devemos parar o container aqui
    // se os testes não rodam em paralelo, ok, podemos parar, outra suite vai iniciar o container, mas podemos perder performance
    //await postgresContainer.stop();
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
