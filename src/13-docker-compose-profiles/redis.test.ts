import { 
  DockerComposeEnvironment, 
  StartedDockerComposeEnvironment,
  Wait 
} from 'testcontainers';
import { createClient } from 'redis';

describe('Docker Compose Profile: Redis', () => {
  let environment: StartedDockerComposeEnvironment;

  beforeAll(async () => {
    const composeFilePath = __dirname;
    const composeFile = 'compose.yaml';

    environment = await new DockerComposeEnvironment(composeFilePath, composeFile)
      .withProfiles('redis')
      .withWaitStrategy('redis-1', Wait.forHealthCheck())
      .up();
  }, 120000); // 2 minutos de timeout

  afterAll(async () => {
    await environment.down();
  });

  it('deve ter o Redis rodando', () => {
    const redis = environment.getContainer('redis-1');
    expect(redis).toBeDefined();
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

  it('deve armazenar e recuperar múltiplas chaves', async () => {
    const redisContainer = environment.getContainer('redis-1');
    
    const redisClient = createClient({
      url: `redis://${redisContainer.getHost()}:${redisContainer.getMappedPort(6379)}`
    });

    await redisClient.connect();
    
    // Armazena múltiplas chaves
    await redisClient.mSet({
      'key1': 'value1',
      'key2': 'value2',
      'key3': 'value3'
    });

    // Recupera múltiplas chaves
    const values = await redisClient.mGet(['key1', 'key2', 'key3']);
    
    expect(values).toEqual(['value1', 'value2', 'value3']);
    
    await redisClient.quit();
  });

  it('deve executar comandos de hash', async () => {
    const redisContainer = environment.getContainer('redis-1');
    
    const redisClient = createClient({
      url: `redis://${redisContainer.getHost()}:${redisContainer.getMappedPort(6379)}`
    });

    await redisClient.connect();
    
    // Armazena hash
    await redisClient.hSet('user:1000', {
      name: 'John Doe',
      email: 'john@example.com',
      age: '30'
    });

    // Recupera campos do hash
    const name = await redisClient.hGet('user:1000', 'name');
    const email = await redisClient.hGet('user:1000', 'email');
    
    expect(name).toBe('John Doe');
    expect(email).toBe('john@example.com');
    
    await redisClient.quit();
  });
});
