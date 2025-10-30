import { 
  DockerComposeEnvironment, 
  StartedDockerComposeEnvironment,
  Wait 
} from 'testcontainers';
import amqp from 'amqplib';

describe('Docker Compose Profile: RabbitMQ', () => {
  let environment: StartedDockerComposeEnvironment;

  beforeAll(async () => {
    const composeFilePath = __dirname;
    const composeFile = 'compose.yaml';

    environment = await new DockerComposeEnvironment(composeFilePath, composeFile)
      .withProfiles('rabbitmq')
      .withWaitStrategy('rabbitmq-1', Wait.forHealthCheck())
      .up();
  }, 120000); // 2 minutos de timeout

  afterAll(async () => {
    await environment.down();
  });

  it('deve ter o RabbitMQ rodando', () => {
    const rabbitmq = environment.getContainer('rabbitmq-1');
    expect(rabbitmq).toBeDefined();
  });

  it('deve ter as portas do RabbitMQ acessíveis', () => {
    const rabbitmq = environment.getContainer('rabbitmq-1');
    
    const amqpPort = rabbitmq.getMappedPort(5672);
    const managementPort = rabbitmq.getMappedPort(15672);

    expect(amqpPort).toBeGreaterThan(0);
    expect(managementPort).toBeGreaterThan(0);
  });

  it('deve conectar ao RabbitMQ e enviar/receber mensagem', async () => {
    const rabbitmq = environment.getContainer('rabbitmq-1');
    const amqpUrl = `amqp://guest:guest@${rabbitmq.getHost()}:${rabbitmq.getMappedPort(5672)}`;

    // Conecta ao RabbitMQ
    const connection = await amqp.connect(amqpUrl);
    const channel = await connection.createChannel();

    const queue = 'test_queue';
    const message = 'Hello RabbitMQ!';

    // Declara a fila
    await channel.assertQueue(queue, { durable: false });

    // Envia mensagem
    channel.sendToQueue(queue, Buffer.from(message));
    console.log(`Mensagem enviada: ${message}`);

    // Recebe mensagem
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
  },10000);

  it('deve publicar e consumir mensagens de uma exchange', async () => {
    const rabbitmq = environment.getContainer('rabbitmq-1');
    const amqpUrl = `amqp://guest:guest@${rabbitmq.getHost()}:${rabbitmq.getMappedPort(5672)}`;

    const connection = await amqp.connect(amqpUrl);
    const channel = await connection.createChannel();

    const exchange = 'test_exchange';
    const routingKey = 'test.routing.key';
    const message = 'Test message via exchange';

    // Declara exchange do tipo 'direct'
    await channel.assertExchange(exchange, 'direct', { durable: false });

    // Declara fila
    const q = await channel.assertQueue('', { exclusive: true });

    // Faz bind da fila à exchange
    await channel.bindQueue(q.queue, exchange, routingKey);

    // Publica mensagem
    channel.publish(exchange, routingKey, Buffer.from(message));
    console.log(`Mensagem publicada na exchange: ${message}`);

    // Consome mensagem
    const receivedMessage = await new Promise<string>((resolve) => {
      channel.consume(q.queue, (msg) => {
        if (msg !== null) {
          resolve(msg.content.toString());
          channel.ack(msg);
        }
      }, { noAck: false });
    });

    expect(receivedMessage).toBe(message);

    await channel.close();
    await connection.close();
  },10000);
});
