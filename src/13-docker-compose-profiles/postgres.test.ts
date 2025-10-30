import { 
  DockerComposeEnvironment, 
  StartedDockerComposeEnvironment,
  Wait 
} from 'testcontainers';
import { Client } from 'pg';

describe('Docker Compose Profile: PostgreSQL', () => {
  let environment: StartedDockerComposeEnvironment;

  beforeAll(async () => {
    const composeFilePath = __dirname;
    const composeFile = 'compose.yaml';

    environment = await new DockerComposeEnvironment(composeFilePath, composeFile)
      .withProfiles('postgres')
      .withWaitStrategy('postgres', Wait.forHealthCheck())
      .up();
  }, 120000); // 2 minutos de timeout

  afterAll(async () => {
    await environment.down();
  });

  it('deve ter o PostgreSQL rodando', () => {
    const postgres = environment.getContainer('postgres-1');
    expect(postgres).toBeDefined();
  });

  it('deve conectar ao PostgreSQL', async () => {
    const postgresContainer = environment.getContainer('postgres-1');
    
    const client = new Client({
      host: postgresContainer.getHost(),
      port: postgresContainer.getMappedPort(5432),
      user: 'testuser',
      password: 'testpass',
      database: 'postgres',
    });

    await client.connect();
    const result = await client.query('SELECT 1 as result');
    expect(result.rows[0].result).toBe(1);
    await client.end();
  });

  it('deve ter criado os databases do init.sql', async () => {
    const postgresContainer = environment.getContainer('postgres-1');
    
    const client = new Client({
      host: postgresContainer.getHost(),
      port: postgresContainer.getMappedPort(5432),
      user: 'testuser',
      password: 'testpass',
      database: 'postgres',
    });

    await client.connect();
    
    const result = await client.query(
      "SELECT datname FROM pg_database WHERE datname IN ('keycloak', 'myapp')"
    );
    
    expect(result.rows).toHaveLength(2);
    expect(result.rows.map(row => row.datname)).toEqual(
      expect.arrayContaining(['keycloak', 'myapp'])
    );
    
    await client.end();
  });

  it('deve criar tabela e inserir dados', async () => {
    const postgresContainer = environment.getContainer('postgres-1');
    
    const client = new Client({
      host: postgresContainer.getHost(),
      port: postgresContainer.getMappedPort(5432),
      user: 'testuser',
      password: 'testpass',
      database: 'myapp',
    });

    await client.connect();
    
    // Cria tabela
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100),
        email VARCHAR(100) UNIQUE
      )
    `);

    // Insere dados
    await client.query(
      'INSERT INTO users (name, email) VALUES ($1, $2)',
      ['Alice', 'alice@example.com']
    );

    // Busca dados
    const result = await client.query('SELECT * FROM users WHERE email = $1', [
      'alice@example.com',
    ]);

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].name).toBe('Alice');
    
    await client.end();
  });

  it('deve executar queries com joins', async () => {
    const postgresContainer = environment.getContainer('postgres-1');
    
    const client = new Client({
      host: postgresContainer.getHost(),
      port: postgresContainer.getMappedPort(5432),
      user: 'testuser',
      password: 'testpass',
      database: 'myapp',
    });

    await client.connect();
    
    // Cria tabelas
    await client.query(`
      CREATE TABLE IF NOT EXISTS products (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100),
        price DECIMAL(10, 2)
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS orders (
        id SERIAL PRIMARY KEY,
        product_id INTEGER REFERENCES products(id),
        quantity INTEGER
      )
    `);

    // Insere dados
    await client.query(
      'INSERT INTO products (name, price) VALUES ($1, $2)',
      ['Laptop', 1299.99]
    );

    const productResult = await client.query(
      'SELECT id FROM products WHERE name = $1',
      ['Laptop']
    );
    const productId = productResult.rows[0].id;

    await client.query(
      'INSERT INTO orders (product_id, quantity) VALUES ($1, $2)',
      [productId, 2]
    );

    // Executa JOIN
    const result = await client.query(`
      SELECT p.name, p.price, o.quantity
      FROM orders o
      JOIN products p ON o.product_id = p.id
      WHERE p.name = $1
    `, ['Laptop']);

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].name).toBe('Laptop');
    expect(result.rows[0].quantity).toBe(2);
    
    await client.end();
  });
});
