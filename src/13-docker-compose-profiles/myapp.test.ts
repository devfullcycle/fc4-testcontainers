import { 
  DockerComposeEnvironment, 
  StartedDockerComposeEnvironment,
  Wait 
} from 'testcontainers';
import { Client as PgClient } from 'pg';
import { createClient } from 'redis';
import amqp from 'amqplib';

describe('Docker Compose Profile: MyApp (Integração completa)', () => {
  let environment: StartedDockerComposeEnvironment;

  beforeAll(async () => {
    const composeFilePath = __dirname;
    const composeFile = 'compose.yaml';

    environment = await new DockerComposeEnvironment(composeFilePath, composeFile)
      .withProfiles('myapp')
      .withWaitStrategy('postgres-1', Wait.forHealthCheck())
      .withWaitStrategy('keycloak-1', Wait.forHealthCheck())
      .withWaitStrategy('redis-1', Wait.forHealthCheck())
      .withWaitStrategy('rabbitmq-1', Wait.forHealthCheck())
      .up();
    
  }, 180000); // 3 minutos de timeout

  afterAll(async () => {
    await environment.down();
  });

  it('deve ter todos os serviços do profile myapp rodando', () => {
    const postgres = environment.getContainer('postgres-1');
    const keycloak = environment.getContainer('keycloak-1');
    const redis = environment.getContainer('redis-1');
    const rabbitmq = environment.getContainer('rabbitmq-1');

    expect(postgres).toBeDefined();
    expect(keycloak).toBeDefined();
    expect(redis).toBeDefined();
    expect(rabbitmq).toBeDefined();
  });

  it('deve conectar ao PostgreSQL', async () => {
    const postgres = environment.getContainer('postgres-1');
    
    const client = new PgClient({
      host: postgres.getHost(),
      port: postgres.getMappedPort(5432),
      user: 'testuser',
      password: 'testpass',
      database: 'myapp',
    });

    await client.connect();
    const result = await client.query('SELECT 1 as value');
    expect(result.rows[0].value).toBe(1);
    await client.end();
  });

  it('deve ter as databases keycloak e myapp criadas', async () => {
    const postgres = environment.getContainer('postgres-1');
    
    const client = new PgClient({
      host: postgres.getHost(),
      port: postgres.getMappedPort(5432),
      user: 'testuser',
      password: 'testpass',
      database: 'myapp',
    });

    await client.connect();
    const result = await client.query(
      "SELECT datname FROM pg_database WHERE datname IN ('keycloak', 'myapp') ORDER BY datname"
    );
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0].datname).toBe('keycloak');
    expect(result.rows[1].datname).toBe('myapp');
    await client.end();
  });

  it('deve conectar ao Keycloak', async () => {
    const keycloak = environment.getContainer('keycloak-1');
    const keycloakPort = keycloak.getMappedPort(8080);
    const keycloakHost = keycloak.getHost();

    const response = await fetch(`http://${keycloakHost}:${keycloakPort}`);
    expect(response.status).toBe(200);
  });

  it('deve conectar ao Redis', async () => {
    const redisContainer = environment.getContainer('redis-1');
    
    const redisClient = createClient({
      url: `redis://${redisContainer.getHost()}:${redisContainer.getMappedPort(6379)}`
    });

    await redisClient.connect();
    await redisClient.set('myapp-key', 'myapp-value');
    const value = await redisClient.get('myapp-key');
    expect(value).toBe('myapp-value');
    await redisClient.quit();
  });

  it('deve conectar ao RabbitMQ', async () => {
    const rabbitmq = environment.getContainer('rabbitmq-1');
    const amqpUrl = `amqp://guest:guest@${rabbitmq.getHost()}:${rabbitmq.getMappedPort(5672)}`;

    const connection = await amqp.connect(amqpUrl);
    const channel = await connection.createChannel();

    const queue = 'myapp_queue';
    const message = 'MyApp message';

    await channel.assertQueue(queue, { durable: false });
    channel.sendToQueue(queue, Buffer.from(message));

    const receivedMessage = await new Promise<string>((resolve) => {
      channel.consume(queue, (msg) => {
        if (msg !== null) {
          resolve(msg.content.toString());
          channel.ack(msg);
        }
      });
    });

    expect(receivedMessage).toBe(message);

    await channel.close();
    await connection.close();
  });

  it('deve simular fluxo completo: salvar no DB, cachear no Redis e notificar via RabbitMQ', async () => {
    // 1. Salvar no PostgreSQL
    const postgres = environment.getContainer('postgres-1');
    const pgClient = new PgClient({
      host: postgres.getHost(),
      port: postgres.getMappedPort(5432),
      user: 'testuser',
      password: 'testpass',
      database: 'myapp',
    });
    
    await pgClient.connect();
    
    // Cria tabela se não existir
    await pgClient.query(`
      CREATE TABLE IF NOT EXISTS events (
        id SERIAL PRIMARY KEY,
        event_type VARCHAR(100),
        data TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    const insertResult = await pgClient.query(
      "INSERT INTO events (event_type, data) VALUES ($1, $2) RETURNING *",
      ['user_created', JSON.stringify({ username: 'john_doe' })]
    );
    
    const eventId = insertResult.rows[0].id;
    expect(eventId).toBeDefined();

    // 2. Cachear no Redis
    const redisContainer = environment.getContainer('redis-1');
    const redisClient = createClient({
      url: `redis://${redisContainer.getHost()}:${redisContainer.getMappedPort(6379)}`
    });
    
    await redisClient.connect();
    await redisClient.set(`event:${eventId}`, JSON.stringify(insertResult.rows[0]));
    const cachedEvent = await redisClient.get(`event:${eventId}`);
    expect(cachedEvent).toBeDefined();
    expect(JSON.parse(cachedEvent!).event_type).toBe('user_created');

    // 3. Notificar via RabbitMQ
    const rabbitmq = environment.getContainer('rabbitmq-1');
    const amqpUrl = `amqp://guest:guest@${rabbitmq.getHost()}:${rabbitmq.getMappedPort(5672)}`;
    
    const connection = await amqp.connect(amqpUrl);
    const channel = await connection.createChannel();
    
    const queue = 'event_notifications';
    await channel.assertQueue(queue, { durable: false });
    
    const notification = {
      eventId,
      type: 'user_created',
      timestamp: new Date().toISOString()
    };
    
    channel.sendToQueue(queue, Buffer.from(JSON.stringify(notification)));
    
    const receivedNotification = await new Promise<string>((resolve) => {
      channel.consume(queue, (msg) => {
        if (msg !== null) {
          resolve(msg.content.toString());
          channel.ack(msg);
        }
      });
    });
    
    expect(JSON.parse(receivedNotification).eventId).toBe(eventId);

    // Cleanup
    await redisClient.quit();
    await channel.close();
    await connection.close();
    await pgClient.end();
  });
});
