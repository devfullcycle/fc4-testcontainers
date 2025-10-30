import http from 'http';
import { createClient } from 'redis';
import pg from 'pg';
import amqp from 'amqplib';

const { Client: PgClient } = pg;

// Configurações vindas de variáveis de ambiente
const PORT = process.env.PORT || 3000;
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const PG_HOST = process.env.POSTGRES_HOST || 'localhost';
const PG_PORT = process.env.POSTGRES_PORT || 5432;
const PG_USER = process.env.POSTGRES_USER || 'testuser';
const PG_PASSWORD = process.env.POSTGRES_PASSWORD || 'testpass';
const PG_DATABASE = process.env.POSTGRES_DB || 'myapp';
const RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://guest:guest@localhost:5672';
const KEYCLOAK_URL = process.env.KEYCLOAK_URL || 'http://localhost:8080';

// Clientes globais
let redisClient;
let pgClient;
let rabbitConnection;
let rabbitChannel;

// Conecta ao Redis
async function connectRedis() {
  try {
    redisClient = createClient({ url: REDIS_URL });
    redisClient.on('error', (err) => console.error('Redis Error:', err));
    await redisClient.connect();
    console.log('✅ Connected to Redis');
  } catch (error) {
    console.error('❌ Failed to connect to Redis:', error.message);
  }
}

// Conecta ao PostgreSQL
async function connectPostgres() {
  try {
    pgClient = new PgClient({
      host: PG_HOST,
      port: PG_PORT,
      user: PG_USER,
      password: PG_PASSWORD,
      database: PG_DATABASE,
    });
    await pgClient.connect();
    console.log('✅ Connected to PostgreSQL');
    
    // Cria tabela de exemplo
    await pgClient.query(`
      CREATE TABLE IF NOT EXISTS page_views (
        id SERIAL PRIMARY KEY,
        page VARCHAR(255),
        count INTEGER DEFAULT 0,
        last_visit TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
  } catch (error) {
    console.error('❌ Failed to connect to PostgreSQL:', error.message);
  }
}

// Conecta ao RabbitMQ
async function connectRabbitMQ() {
  try {
    rabbitConnection = await amqp.connect(RABBITMQ_URL);
    rabbitChannel = await rabbitConnection.createChannel();
    await rabbitChannel.assertQueue('page_events', { durable: false });
    console.log('✅ Connected to RabbitMQ');
  } catch (error) {
    console.error('❌ Failed to connect to RabbitMQ:', error.message);
  }
}

// Inicializa conexões
await connectRedis();
await connectPostgres();
await connectRabbitMQ();

// Função auxiliar para enviar evento ao RabbitMQ
async function publishEvent(eventType, data) {
  if (rabbitChannel) {
    const event = {
      type: eventType,
      data,
      timestamp: new Date().toISOString()
    };
    rabbitChannel.sendToQueue('page_events', Buffer.from(JSON.stringify(event)));
  }
}

// Servidor HTTP
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');

  try {
    // Home page
    if (url.pathname === '/' && req.method === 'GET') {
      // Incrementa contador no Redis
      let viewCount = 0;
      if (redisClient) {
        viewCount = await redisClient.incr('home_views');
      }

      // Registra no PostgreSQL
      if (pgClient) {
        await pgClient.query(`
          INSERT INTO page_views (page, count) 
          VALUES ('home', 1)
          ON CONFLICT DO NOTHING
        `);
      }

      // Publica evento
      await publishEvent('page_view', { page: 'home', count: viewCount });

      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>E2E App - Home</title>
          </head>
          <body>
            <h1>Welcome to E2E App</h1>
            <p>This page has been viewed <strong id="count">${viewCount}</strong> times</p>
            <nav>
              <a href="/about">About</a> |
              <a href="/stats">Stats</a>
            </nav>
          </body>
        </html>
      `);
      return;
    }

    // About page
    if (url.pathname === '/about' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>E2E App - About</title>
          </head>
          <body>
            <h1>About This App</h1>
            <p>This is a Node.js pure HTTP server integrated with:</p>
            <ul>
              <li>Redis for caching</li>
              <li>PostgreSQL for persistence</li>
              <li>RabbitMQ for messaging</li>
              <li>Keycloak for authentication</li>
            </ul>
            <nav>
              <a href="/">Home</a> |
              <a href="/stats">Stats</a>
            </nav>
          </body>
        </html>
      `);
      return;
    }

    // Stats page - mostra dados do banco
    if (url.pathname === '/stats' && req.method === 'GET') {
      let stats = { redis_views: 0, db_views: 0 };
      
      if (redisClient) {
        const redisCount = await redisClient.get('home_views');
        stats.redis_views = parseInt(redisCount || '0');
      }
      
      if (pgClient) {
        const result = await pgClient.query(
          'SELECT COUNT(*) as total FROM page_views WHERE page = $1',
          ['home']
        );
        stats.db_views = parseInt(result.rows[0].total);
      }

      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>E2E App - Stats</title>
          </head>
          <body>
            <h1>Statistics</h1>
            <ul>
              <li>Redis View Count: <strong>${stats.redis_views}</strong></li>
              <li>Database Records: <strong>${stats.db_views}</strong></li>
            </ul>
            <nav>
              <a href="/">Home</a> |
              <a href="/about">About</a>
            </nav>
          </body>
        </html>
      `);
      return;
    }

    // API endpoint - verifica Keycloak acessibilidade
    if (url.pathname === '/api/keycloak-health' && req.method === 'GET') {
      try {
        const response = await fetch(`${KEYCLOAK_URL}/`);
        const isHealthy = response.status === 200;
        
        res.writeHead(200);
        res.end(JSON.stringify({
          keycloak: {
            url: KEYCLOAK_URL,
            healthy: isHealthy,
            status: response.status
          }
        }));
      } catch (error) {
        res.writeHead(200);
        res.end(JSON.stringify({
          keycloak: {
            url: KEYCLOAK_URL,
            healthy: false,
            error: error.message
          }
        }));
      }
      return;
    }

    // API endpoint - status de todas as conexões
    if (url.pathname === '/api/health' && req.method === 'GET') {
      const health = {
        redis: !!redisClient?.isOpen,
        postgres: !!pgClient,
        rabbitmq: !!rabbitChannel,
        timestamp: new Date().toISOString()
      };
      
      res.writeHead(200);
      res.end(JSON.stringify(health));
      return;
    }

    // 404
    res.writeHead(404, { 'Content-Type': 'text/html' });
    res.end(`
      <!DOCTYPE html>
      <html>
        <head><title>404 - Not Found</title></head>
        <body>
          <h1>404 - Page Not Found</h1>
          <a href="/">Go Home</a>
        </body>
      </html>
    `);
  } catch (error) {
    console.error('Request error:', error);
    res.writeHead(500);
    res.end(JSON.stringify({ error: error.message }));
  }
});

server.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, closing connections...');
  if (redisClient) await redisClient.quit();
  if (pgClient) await pgClient.end();
  if (rabbitConnection) await rabbitConnection.close();
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

export default server;
