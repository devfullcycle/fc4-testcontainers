//colocar um comando no package.json para iniciar o projeto e levantar o ambiente
import { PostgreSqlContainer } from "@testcontainers/postgresql";
import { RedisContainer } from "@testcontainers/redis";
import { DockerComposeEnvironment, GenericContainer } from "testcontainers";
import * as path from "path";
import { config } from "dotenv";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Carrega variáveis de ambiente do arquivo .env
config({ path: path.resolve(__dirname, ".env") });

// Função para obter variável de ambiente com valor padrão
function getEnv(key, defaultValue) {
  return process.env[key] || defaultValue;
}

async function startDevEnvironment() {
  console.log(
    "🚀 Iniciando ambiente de desenvolvimento com Testcontainers...\n"
  );

  // PostgreSQL
  console.log("📦 Iniciando PostgreSQL...");
  const postgresImage = getEnv("POSTGRES_IMAGE", "postgres:15-alpine");
  const postgresDb = getEnv("POSTGRES_DATABASE", "devdb");
  const postgresUser = getEnv("POSTGRES_USERNAME", "devuser");
  const postgresPassword = getEnv("POSTGRES_PASSWORD", "devpass");

  const postgres = await new PostgreSqlContainer(postgresImage)
    .withDatabase(postgresDb)
    .withUsername(postgresUser)
    .withPassword(postgresPassword)
    .withExposedPorts({
      container: 5432,
      host: parseInt(getEnv("POSTGRES_PORT", "5432")),
    })
    .withReuse()
    .withAutoRemove(false)
    .start();
  console.log(
    `✅ PostgreSQL rodando em: localhost:${postgres.getMappedPort(5432)}`
  );

  // Redis
  console.log("📦 Iniciando Redis...");
  const redisImage = getEnv("REDIS_IMAGE", "redis:7-alpine");
  const redis = await new RedisContainer(redisImage)
    .withExposedPorts({
      container: 6379,
      host: parseInt(getEnv("REDIS_PORT", "6379")),
    })
    .withReuse()
    .withAutoRemove(false)
    .start();
  console.log(`✅ Redis rodando em: localhost:${redis.getMappedPort(6379)}`);

  // MailHog (para testes de email em desenvolvimento)
  console.log("📦 Iniciando MailHog...");
  const mailhogImage = getEnv("MAILHOG_IMAGE", "mailhog/mailhog:latest");
  const mailhog = await new GenericContainer(mailhogImage)
    .withExposedPorts(
      {
        container: 1025,
        host: parseInt(getEnv("MAILHOG_SMTP_PORT", "1025")),
      },
      {
        container: 8025,
        host: parseInt(getEnv("MAILHOG_UI_PORT", "8025")),
      }
    )
    .withReuse()
    .withAutoRemove(false)
    .start();
  console.log(`✅ MailHog SMTP: localhost:${mailhog.getMappedPort(1025)}`);
  console.log(`✅ MailHog UI: http://localhost:${mailhog.getMappedPort(8025)}`);

  // Executa migrations
  console.log("\n📋 Executando migrations...");
  const { Client } = await import("pg");
  const client = new Client({
    host: postgres.getHost(),
    port: postgres.getPort(),
    user: postgres.getUsername(),
    password: postgres.getPassword(),
    database: postgres.getDatabase(),
  });

  await client.connect();

  await client.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      name VARCHAR(100),
      email VARCHAR(100) UNIQUE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS posts (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id),
      title VARCHAR(200),
      content TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Seed de dados de desenvolvimento
  await client.query(`
    INSERT INTO users (name, email) VALUES 
      ('Dev User 1', 'dev1@example.com'),
      ('Dev User 2', 'dev2@example.com')
    ON CONFLICT (email) DO NOTHING;
  `);

  await client.end();
  console.log("✅ Migrations executadas e dados de seed inseridos!");

  console.log("\n🎉 Ambiente de desenvolvimento pronto!");
  console.log("📝 Use as configurações do arquivo .env");
  console.log("\n📚 Configurações carregadas de:");
  console.log(`   - PostgreSQL: ${postgresImage}`);
  console.log(`   - Redis: ${redisImage}`);
  console.log(`   - MailHog: ${mailhogImage}`);
  console.log("\n🛑 Pressione Ctrl+C para parar o ambiente\n");

  return { postgres, redis, mailhog };
}

async function stopDevEnvironment(env) {
  console.log("\n🛑 Parando ambiente de desenvolvimento...");

  await env.postgres.stop();
  console.log("✅ PostgreSQL parado");

  await env.redis.stop();
  console.log("✅ Redis parado");

  await env.mailhog.stop();
  console.log("✅ MailHog parado");

  console.log("\n👋 Ambiente de desenvolvimento encerrado!");
}

// Main execution
(async () => {
  let environment = null;

  try {
    environment = await startDevEnvironment();

    // Mantém o processo rodando
    process.on("SIGINT", async () => {
      if (environment) {
        await stopDevEnvironment(environment);
      }
      process.exit(0);
    });

    process.on("SIGTERM", async () => {
      if (environment) {
        await stopDevEnvironment(environment);
      }
      process.exit(0);
    });

    console.log("⏳ Ambiente rodando... aguardando comandos.");
    
    // Heartbeat a cada 30 segundos para mostrar que está vivo
    setInterval(() => {
      console.log(`💓 ${new Date().toLocaleTimeString()} - Ambiente ativo`);
    }, 30000);

    // Mantém rodando indefinidamente
    await new Promise((resolve) => {
      // Esta promise nunca resolve, mantendo o processo vivo
    });
  } catch (error) {
    console.error("❌ Erro ao iniciar ambiente:", error);
    if (environment) {
      await stopDevEnvironment(environment);
    }
    process.exit(1);
  }
})();


