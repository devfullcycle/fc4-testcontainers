import { 
  DockerComposeEnvironment, 
  PullPolicy, 
  StartedDockerComposeEnvironment,
  Wait 
} from 'testcontainers';
import { Client as PgClient } from 'pg';
import { createClient } from 'redis';

describe('Docker Compose com Testcontainers', () => {
  let environment: StartedDockerComposeEnvironment;

  beforeAll(async () => {
    const composeFilePath = __dirname;
    const composeFile = 'compose.yaml';

    environment = await new DockerComposeEnvironment(composeFilePath, composeFile)
      .withBuild() // sempre força rebuild da imagem
      .withPullPolicy(PullPolicy.alwaysPull()) // sempre puxa a imagem mais recente | defaultPolicy() puxa se não existir localmente
      .withNoRecreate() // não recria containers já existentes
      .withWaitStrategy('postgres', Wait.forHealthCheck())
      .withWaitStrategy('redis', Wait.forHealthCheck())
      .withWaitStrategy('rabbitmq', Wait.forHealthCheck())
      //default de WaitStrategy é olhar as portas por 60 segundos (timeout)
      .up(); //up(['postgres, redis, rabbitmq']); // para subir serviços específicos
  }, 120000); // 2 minutos de timeout

  afterAll(async () => {
    //await environment.stop();
    //await environment.down({removeVolumes: false});
    await environment.down();  // docker compose down -v (remover os volumes anonimo + named)
  });

  it('deve ter todos os serviços rodando', () => {
    const postgres = environment.getContainer('postgres-1');
    const redis = environment.getContainer('redis-1');
    const rabbitmq = environment.getContainer('rabbitmq-1');

    expect(postgres).toBeDefined();
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
      database: 'testdb',
    });

    await client.connect();
    const result = await client.query('SELECT 1 as value');
    expect(result.rows[0].value).toBe(1);
    await client.end();
  });

  it('deve conectar ao Redis', async () => {
    const redisContainer = environment.getContainer('redis-1');
    
    const redisClient = createClient({
      url: `redis://${redisContainer.getHost()}:${redisContainer.getMappedPort(6379)}`
    });

    await redisClient.connect();
    await redisClient.set('test-key', 'test-value');
    const value = await redisClient.get('test-key');
    expect(value).toBe('test-value');
    await redisClient.quit();
  });

  it('deve ter o RabbitMQ acessível', () => {
    const rabbitmq = environment.getContainer('rabbitmq-1');
    
    const amqpPort = rabbitmq.getMappedPort(5672);
    const managementPort = rabbitmq.getMappedPort(15672);

    expect(amqpPort).toBeGreaterThan(0);
    expect(managementPort).toBeGreaterThan(0);
  });
});