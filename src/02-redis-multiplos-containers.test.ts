import { GenericContainer, type StartedTestContainer } from 'testcontainers';
import { createClient, type RedisClientType } from 'redis';

describe('Primeiro Container de Teste', () => {
  let container: StartedTestContainer;
  let redisClient: RedisClientType;
  let testStartTime: number;


  beforeAll(async () => {
    const startTime = performance.now();
    
    // Cria e inicia um container Redis
    container = await new GenericContainer('redis:7-alpine')
      .withExposedPorts(6379)
      .start();

    console.log(`Container iniciado no host: ${container.getHost()}`);
    console.log(`Porta mapeada: ${container.getMappedPort(6379)}`);

    // Conecta ao Redis
    redisClient = createClient({
      url: `redis://${container.getHost()}:${container.getMappedPort(6379)}`,
    });
    await redisClient.connect();
    
    console.log(`⏱️  beforeAll completo em: ${(performance.now() - startTime).toFixed(2)}ms\n`);
  });

  beforeEach(() => {
    testStartTime = performance.now();
  });

  afterEach((context) => {
    const duration = performance.now() - testStartTime;
    console.log(`⏱️  "${context.task.name}" executado em: ${duration.toFixed(2)}ms`);
  });

  afterAll(async () => {
    const startTime = performance.now();
    
    // Desconecta do Redis
    await redisClient.quit();
    // Para o container
    await container.stop();
    //Para debugging, usar a variável de ambiente TESTCONTAINERS_RYUK_DISABLED=true
    //await container.stop({ remove: false });
    
    console.log(`\n⏱️  Teardown completo em: ${(performance.now() - startTime).toFixed(2)}ms`);
  });

  test('deve ter um container Redis rodando', () => {
    expect(container).toBeDefined();
    expect(container.getHost()).toBe('localhost');
    expect(container.getMappedPort(6379)).toBeGreaterThan(0);
  });

  test('deve conseguir conectar ao Redis', async () => {
    // Verifica que está conectado
    expect(redisClient.isOpen).toBe(true);
    
    // Testa comando PING
    const pong = await redisClient.ping();
    expect(pong).toBe('PONG');
  });

  test('deve conseguir armazenar e recuperar dados', async () => {
    // SET
    await redisClient.set('test-key', 'test-value');
    
    // GET
    const value = await redisClient.get('test-key');
    expect(value).toBe('test-value');
  });
});