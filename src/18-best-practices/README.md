# Testcontainers: Boas Práticas

## 1. ⚠️ Evite usar portas fixas para testes

### Por que evitar:
- Conflitos com processos já em execução na mesma porta
- Problemas em CI/CD com múltiplos pipelines rodando em paralelo
- Dificuldade para paralelizar testes localmente

### ✅ Faça assim:
Use o mapeamento dinâmico de portas do Testcontainers:

```typescript
// ❌ NÃO faça isso
const container = await new GenericContainer("redis:7-alpine")
  .withExposedPorts({container: 6379, host: 6379}) // Porta fixa!
  .start();

// ✅ Faça isso
const container = await new GenericContainer("redis:7-alpine")
  .withExposedPorts(6379)
  .start();

const port = container.getMappedPort(6379); // Porta dinâmica
const host = container.getHost();
```

---

## 2. ⚠️ Evite usar hostname fixo (localhost)

### Problema:
Hardcoding `localhost` funciona apenas com Docker daemon local. Falha com Remote Docker daemon ou Testcontainers Cloud.

### ✅ Faça assim:
```typescript
// ❌ NÃO faça isso
const host = "localhost";
const port = container.getMappedPort(6379);

// ✅ Faça isso
const host = container.getHost(); // Dinâmico!
const port = container.getMappedPort(6379);
```

Isso garante portabilidade total dos seus testes.

---

## 3. ⚠️ Evite nomear containers com nomes fixos

### Problema:
Nomes fixos causam conflitos ao executar múltiplos containers simultaneamente em CI/CD.

```typescript
// ❌ NÃO faça isso
const postgres = await new PostgreSqlContainer("postgres:15-alpine")
  .withName("my-postgres") // Nome fixo!
  .start();
```

### ✅ Faça assim:
Deixe o Testcontainers gerar nomes únicos automaticamente. Não use `withName()` ou `withCreateContainerCmdModifier()` para definir nomes fixos.

---

## 4. ✅ Copie arquivos ao invés de montar volumes

### Problema:
Montar arquivos locais falha com Remote Docker daemon ou Testcontainers Cloud, pois os arquivos não existem no host remoto.

```typescript
// ❌ NÃO faça isso
const postgres = await new PostgreSqlContainer("postgres:15-alpine")
  .withBindMounts([{
    source: "./src/test/resources/schema.sql",
    target: "/docker-entrypoint-initdb.d/01-schema.sql",
    mode: "ro"
  }])
  .start();

// ✅ Faça isso
const postgres = await new PostgreSqlContainer("postgres:15-alpine")
  .withCopyFilesToContainer([{
    source: "./src/test/resources/schema.sql",
    target: "/docker-entrypoint-initdb.d/01-schema.sql"
  }])
  .start();
```

Arquivos copiados funcionam em qualquer ambiente!

---

## 5. ✅ Use a mesma versão de imagem da produção

### Problema:
Usar `latest` introduz instabilidade quando novas versões são lançadas.

```typescript
// ❌ NÃO faça isso
const postgres = await new PostgreSqlContainer("postgres:latest");

// ✅ Faça isso - use a versão específica da produção
const postgres = await new PostgreSqlContainer("postgres:16.2-alpine");
```

Garante que seus testes reflitam o ambiente real de produção.

---

## 6. ✅ Use Docker Compose para múltiplos containers

### Por que usar Docker Compose?

Quando seus testes precisam de múltiplos containers (aplicação + banco de dados + cache + message broker), gerenciar cada container individualmente se torna complexo e propenso a erros. Docker Compose simplifica essa orquestração.

### ✅ Crie um `compose.test.yaml` específico para testes

**Benefícios:**
- ✅ Orquestra múltiplos serviços interdependentes
- ✅ Configura networks e volumes automaticamente
- ✅ Garante ordem de inicialização com `depends_on`
- ✅ Separa configuração de teste da produção
- ✅ Facilita reprodução do ambiente de teste

### Exemplo: `compose.test.yaml`

```yaml
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: testuser
      POSTGRES_PASSWORD: testpass
      POSTGRES_DB: testdb
    ports:
      - "5432" # Porta dinâmica
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U testuser"]
      interval: 5s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    ports:
      - "6379"
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 3s
      retries: 5

  rabbitmq:
    image: rabbitmq:3.12-management-alpine
    environment:
      RABBITMQ_DEFAULT_USER: guest
      RABBITMQ_DEFAULT_PASS: guest
    ports:
      - "5672"
      - "15672"
    healthcheck:
      test: ["CMD", "rabbitmq-diagnostics", "ping"]
      interval: 10s
      timeout: 10s
      retries: 5

  app:
    build:
      context: .
      dockerfile: Dockerfile.test
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
      rabbitmq:
        condition: service_healthy
    environment:
      DATABASE_URL: postgres://testuser:testpass@postgres:5432/testdb
      REDIS_URL: redis://redis:6379
      RABBITMQ_URL: amqp://guest:guest@rabbitmq:5672
    ports:
      - "3000"
```

### 💡 Variação: Desenvolvendo dentro de um container (DooD - Docker-outside-of-Docker)

Quando você está desenvolvendo dentro de um container e precisa rodar Testcontainers, é útil incluir o próprio container de desenvolvimento/testes no mesmo `compose.yaml`, usando profiles para controlar quais serviços sobem:

**Estrutura recomendada com profiles:**

```yaml
services:
  # Container que executa os testes (sobe sem profile ou com profile específico)
  tests:
    build:
      context: .
      args:
        DOCKER_GROUP_ID: ${DOCKER_GROUP_ID:-999}
        USER_ID: ${USER_ID:-1000}
    # Configurações necessárias para Testcontainers funcionar dentro de container
    stop_signal: SIGKILL  # Garante término imediato junto com containers do Testcontainers
    stdin_open: true      # Mantém STDIN aberto (-i)
    tty: true            # Aloca pseudo-terminal (-t)
    volumes:
      - .:/workspace
      - /var/run/docker.sock:/var/run/docker.sock:ro
    environment:
      # Necessário para comunicação com Ryuk em network customizada
      - TESTCONTAINERS_HOST_OVERRIDE=host.docker.internal
    extra_hosts:
      - "host.docker.internal:host-gateway"
    # SEM PROFILE - sobe por padrão com docker compose up

  # Serviços de infraestrutura (sobem apenas quando profile 'infra' é ativado)
  postgres:
    image: postgres:16-alpine
    profiles: ["infra"]  # Só sobe quando docker compose --profile infra up
    environment:
      POSTGRES_USER: testuser
      POSTGRES_PASSWORD: testpass
    ports:
      - "5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U testuser"]
      interval: 5s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    profiles: ["infra"]
    ports:
      - "6379"
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 3s
      retries: 5

  rabbitmq:
    image: rabbitmq:3-management-alpine
    profiles: ["infra"]
    environment:
      RABBITMQ_DEFAULT_USER: guest
      RABBITMQ_DEFAULT_PASS: guest
    ports:
      - "5672"
      - "15672"
    healthcheck:
      test: ["CMD", "rabbitmq-diagnostics", "check_port_connectivity"]
      interval: 10s
      timeout: 10s
      retries: 5
```

**Comandos de uso:**

```bash
# Sobe APENAS o container de testes (Testcontainers gerencia os outros)
docker compose up tests

# Sobe container de testes + todos os serviços de infraestrutura
docker compose --profile infra up

# Entra no container de testes para desenvolvimento
docker compose exec tests bash
```

**Vantagens desta abordagem:**

| Benefício | Descrição |
|-----------|-----------|
| **✅ Flexibilidade** | Container de testes sempre disponível sem precisar de profile |
| **✅ Isolamento** | Testcontainers gerencia containers independentemente |
| **✅ Debugging** | Pode subir infraestrutura manualmente com `--profile infra` para debug |
| **✅ CI/CD** | No CI, só sobe o container de testes e deixa Testcontainers gerenciar o resto |
| **✅ Desenvolvimento local** | No dev local, pode subir toda infra com `--profile infra` para testes manuais |

### 🎯 Estratégia alternativa: Múltiplos profiles para diferentes cenários

Para projetos complexos com diferentes tipos de testes, use profiles segregados:

```yaml
services:
  tests:
    build: .
    volumes:
      - .:/workspace
      - /var/run/docker.sock:/var/run/docker.sock:ro
    environment:
      - TESTCONTAINERS_HOST_OVERRIDE=host.docker.internal
    extra_hosts:
      - "host.docker.internal:host-gateway"
    # SEM PROFILE - sempre disponível

  postgres:
    image: postgres:16-alpine
    profiles: ["postgres", "database", "e2e"]  # Múltiplos profiles
    environment:
      POSTGRES_USER: testuser
      POSTGRES_PASSWORD: testpass
    ports:
      - "5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U testuser"]
      interval: 5s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    profiles: ["redis", "cache", "e2e"]
    ports:
      - "6379"
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 3s
      retries: 5

  rabbitmq:
    image: rabbitmq:3-management-alpine
    profiles: ["rabbitmq", "messaging", "e2e"]
    environment:
      RABBITMQ_DEFAULT_USER: guest
      RABBITMQ_DEFAULT_PASS: guest
    ports:
      - "5672"
      - "15672"
    healthcheck:
      test: ["CMD", "rabbitmq-diagnostics", "check_port_connectivity"]
      interval: 10s
      timeout: 10s
      retries: 5

  keycloak:
    image: quay.io/keycloak/keycloak:23.0
    command: ['start-dev']
    profiles: ["keycloak", "auth", "e2e"]
    environment:
      KC_DB: postgres
      KC_DB_URL: jdbc:postgresql://postgres:5432/keycloak
      KC_DB_USERNAME: testuser
      KC_DB_PASSWORD: testpass
      KEYCLOAK_ADMIN: admin
      KEYCLOAK_ADMIN_PASSWORD: admin
    ports:
      - "8080"
    depends_on:
      postgres:
        condition: service_healthy
    healthcheck:
      test: ['CMD-SHELL', '[ -f /tmp/HealthCheck.java ] || echo "public class HealthCheck { public static void main(String[] args) throws java.lang.Throwable { System.exit(java.net.HttpURLConnection.HTTP_OK == ((java.net.HttpURLConnection)new java.net.URL(args[0]).openConnection()).getResponseCode() ? 0 : 1); } }" > /tmp/HealthCheck.java && java /tmp/HealthCheck.java http://localhost:8080']
      interval: 10s
      timeout: 5s
      retries: 5
```

**Comandos por cenário:**

```bash
# Container de testes isolado
docker compose up tests

# Testes que precisam apenas de banco
docker compose --profile database up

# Testes que precisam de cache
docker compose --profile cache up

# Testes que precisam de autenticação (Keycloak + Postgres)
docker compose --profile auth up

# Suite completa de testes E2E
docker compose --profile e2e up

# Combinação de profiles específicos
docker compose --profile database --profile cache up
```

**Comparação de estratégias:**

| Estratégia | Uso recomendado | Complexidade | Flexibilidade |
|-----------|----------------|--------------|---------------|
| **Profile único (`infra`)** | Projetos simples com poucos serviços | 🟢 Baixa | 🟡 Média |
| **Profiles segregados** | Projetos complexos com diferentes tipos de teste | 🟡 Média | 🟢 Alta |
| **Sem profiles (tudo junto)** | Desenvolvimento local com infraestrutura sempre ativa | 🟢 Baixa | 🔴 Baixa |

### Usando Docker Compose nos testes

```typescript
import { DockerComposeEnvironment, Wait } from "testcontainers";
import path from "path";

describe("Integração completa com Docker Compose", () => {
  let environment: StartedDockerComposeEnvironment;

  beforeAll(async () => {
    const composeFilePath = path.resolve(__dirname);
    const composeFile = "compose.test.yaml";

    environment = await new DockerComposeEnvironment(composeFilePath, composeFile)
      .withWaitStrategy("postgres-1", Wait.forHealthCheck())
      .withWaitStrategy("redis-1", Wait.forHealthCheck())
      .withWaitStrategy("rabbitmq-1", Wait.forHealthCheck())
      .withWaitStrategy("app-1", Wait.forListeningPorts())
      .up();
  }, 60000);

  afterAll(async () => {
    await environment.down();
  });

  it("deve conectar em todos os serviços", async () => {
    const appContainer = environment.getContainer("app-1");
    const appPort = appContainer.getMappedPort(3000);
    const appHost = appContainer.getHost();

    // Testa a aplicação que depende de todos os serviços
    const response = await fetch(`http://${appHost}:${appPort}/health`);
    expect(response.status).toBe(200);

    const health = await response.json();
    expect(health.postgres).toBe("connected");
    expect(health.redis).toBe("connected");
    expect(health.rabbitmq).toBe("connected");
  });
});
```

### Comparação: Containers individuais vs Docker Compose

| Aspecto | Containers Individuais | Docker Compose |
|---------|----------------------|----------------|
| **Complexidade** | 🔴 Alta para múltiplos containers | 🟢 Baixa (arquivo declarativo) |
| **Ordem de inicialização** | 🔴 Manual com `depends_on` lógico | 🟢 Automática com `depends_on` |
| **Networks** | 🔴 Criação manual | 🟢 Automática |
| **Configuração** | 🔴 Espalhada pelo código | 🟢 Centralizada no YAML |
| **Reutilização** | 🟡 Média | 🟢 Alta (mesmo arquivo em dev) |
| **Debugging** | 🔴 Logs separados | 🟢 `docker compose logs` |

### Dica: Use profiles para diferentes cenários

```yaml
services:
  postgres:
    image: postgres:16-alpine
    # sempre ativo

  redis:
    image: redis:7-alpine
    profiles: ["cache"] # Opcional

  elasticsearch:
    image: elasticsearch:8.11.0
    profiles: ["search"] # Opcional
    environment:
      discovery.type: single-node
```

```typescript
// Ativa apenas serviços necessários
const environment = await new DockerComposeEnvironment(composeFilePath, composeFile)
  .withProfiles("cache") // Sobe postgres + redis, mas não elasticsearch
  .up();
```

---

## 7. ✅ Reuso de containers: performance vs isolamento

### Quando reusar containers?

**Usar reuso (`withReuse()`)** quando:
- ✅ Múltiplas suites de teste precisam do mesmo container
- ✅ Testes rodam em paralelo
- ✅ Performance é crítica (economiza tempo de startup)
- ✅ Container pode ser compartilhado com segurança

**Não usar reuso** quando:
- ❌ Cada teste precisa de estado limpo e isolado
- ❌ Testes modificam configurações do container
- ❌ Debugging é mais importante que performance

### Padrão Singleton com beforeAll/afterAll

**Básico - Sem reuso entre arquivos:**
```typescript
describe("PostgreSQL Tests", () => {
  let container: StartedPostgreSqlContainer;
  let pgClient: PoolClient;

  // Inicia UMA VEZ antes de todos os testes
  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:15-alpine")
      .withDatabase("testdb")
      .start();

    pgClient = await createClient(container);
    await pgClient.query("CREATE TABLE users (...)");
  });

  // Limpa dados ENTRE testes para garantir isolamento
  beforeEach(async () => {
    await pgClient.query("TRUNCATE TABLE users");
  });

  // Limpa UMA VEZ após todos os testes
  afterAll(async () => {
    await pgClient.end();
    await container.stop(); // Para o container quando não há reuso
  });

  it("teste 1", async () => {
    // Usa o mesmo container e tabela limpa
  });

  it("teste 2", async () => {
    // Usa o mesmo container e tabela limpa
  });
});
```

### Reuso Avançado - Compartilhado entre múltiplos arquivos

**Arquivo helper (`containers-helpers.ts`):**
```typescript
export function createReusablePostgresContainer() {
  return new PostgreSqlContainer("postgres:15-alpine")
    .withUsername("testuser")
    .withPassword("testpass")
    .withReuse() // ⭐ Habilita reuso
    .withName("reusable-postgres-container") // Nome fixo evita criar múltiplos
    .withAutoRemove(false); // Não remove automaticamente
}

export async function tryStartContainer<T>(fn: () => Promise<T>): Promise<T> {
  do {
    try {
      return await fn();
    } catch (e) {
      const error = e as Error;
      // Se container já existe, aguarda e tenta novamente
      if (error.message.includes("is already in use by container")) {
        console.log("Container já em execução, reutilizando...");
        await sleep(500);
        continue;
      }
      throw e;
    }
  } while (true);
}

export async function createDatabase(container: StartedPostgreSqlContainer, dbName: string) {
  await container.exec([
    "psql", "-U", "testuser", "-d", "postgres",
    "-c", `CREATE DATABASE "${dbName}";`
  ]);
}

export async function dropDatabase(container: StartedPostgreSqlContainer, dbName: string) {
  await container.exec([
    "psql", "-U", "testuser", "-d", "postgres",
    "-c", `DROP DATABASE IF EXISTS "${dbName}";`
  ]);
}
```

**Suite de testes 1 (`products.test.ts`):**
```typescript
import { createReusablePostgresContainer, tryStartContainer, createDatabase } from "./containers-helpers";

describe("Suite 1: Produtos", () => {
  let postgresContainer: StartedPostgreSqlContainer;
  let pgClient: PgClient;
  const databaseName = "testdb_suite1"; // Database específica da suite

  beforeAll(async () => {
    // Tenta iniciar container (ou reutiliza se já existir)
    postgresContainer = await tryStartContainer(() =>
      createReusablePostgresContainer().start()
    );

    // Cria database isolada para esta suite
    await dropDatabase(postgresContainer, databaseName); // Limpa se existir
    await createDatabase(postgresContainer, databaseName);

    pgClient = new PgClient({
      host: postgresContainer.getHost(),
      port: postgresContainer.getPort(),
      user: postgresContainer.getUsername(),
      password: postgresContainer.getPassword(),
      database: databaseName, // ⭐ Database isolada
    });
    await pgClient.connect();

    await pgClient.query("CREATE TABLE products (...)");
  });

  beforeEach(async () => {
    // Limpa dados entre testes
    await pgClient.query("TRUNCATE TABLE products RESTART IDENTITY CASCADE");
  });

  afterAll(async () => {
    await pgClient.end();
    // ⚠️ NÃO para o container se usar reuso + testes paralelos
    // await postgresContainer.stop();
  });

  it("deve criar produto", async () => {
    // Testa usando database isolada
  });
});
```

**Suite de testes 2 (`customers.test.ts`):**
```typescript
import { createReusablePostgresContainer, tryStartContainer, createDatabase } from "./containers-helpers";

describe("Suite 2: Clientes", () => {
  let postgresContainer: StartedPostgreSqlContainer;
  let pgClient: PgClient;
  const databaseName = "testdb_suite2"; // Database diferente!

  beforeAll(async () => {
    // Reutiliza o MESMO container, mas cria database separada
    postgresContainer = await tryStartContainer(() =>
      createReusablePostgresContainer().start()
    );

    await dropDatabase(postgresContainer, databaseName);
    await createDatabase(postgresContainer, databaseName);

    pgClient = new PgClient({
      host: postgresContainer.getHost(),
      port: postgresContainer.getPort(),
      user: postgresContainer.getUsername(),
      password: postgresContainer.getPassword(),
      database: databaseName, // ⭐ Database isolada diferente da Suite 1
    });
    await pgClient.connect();

    await pgClient.query("CREATE TABLE customers (...)");
  });

  beforeEach(async () => {
    await pgClient.query("TRUNCATE TABLE customers RESTART IDENTITY CASCADE");
  });

  afterAll(async () => {
    await pgClient.end();
    // ⚠️ NÃO para o container
  });

  it("deve criar cliente", async () => {
    // Testa em completo isolamento da Suite 1
  });
});
```

### Estratégias de isolamento com reuso

| Estratégia | Isolamento | Performance | Complexidade |
|-----------|-----------|-------------|--------------|
| **Sem reuso** | 🟢 Alto | 🔴 Baixa | 🟢 Simples |
| **Reuso + databases separadas** | 🟢 Alto | 🟢 Alta | 🟡 Média |
| **Reuso + TRUNCATE** | 🟡 Médio | 🟢 Alta | 🟢 Simples |
| **Reuso + schemas separados** | 🟢 Alto | 🟢 Alta | 🔴 Complexa |

### Boas práticas com reuso:

1. **✅ Use `beforeAll`** para iniciar containers uma única vez
2. **✅ Use `beforeEach`** para limpar dados entre testes (TRUNCATE)
3. **✅ Use `afterAll`** para fechar conexões
4. **⚠️ NÃO chame `container.stop()`** no `afterAll` quando usar reuso + testes paralelos
5. **✅ Crie databases separadas** por suite quando usar reuso entre arquivos
6. **✅ Use `tryStartContainer()`** para lidar com race conditions em testes paralelos
7. **✅ Use `withName()`** para evitar criar múltiplos containers por engano

### Reuso com Docker Compose

Docker Compose também suporta reuso com `withNoRecreate()`, permitindo compartilhar ambientes completos entre múltiplas suites de teste:

**compose.yaml com profiles:**
```yaml
services:
  postgres:
    image: postgres:15-alpine
    profiles:
      - postgres
      - myapp
      - e2e
    environment:
      POSTGRES_USER: testuser
      POSTGRES_PASSWORD: testpass
    ports:
      - 5432
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U testuser"]
      interval: 5s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    profiles:
      - redis
      - myapp
      - e2e
    ports:
      - 6379
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 3s
      retries: 5

  rabbitmq:
    image: rabbitmq:3-management-alpine
    profiles:
      - rabbitmq
      - myapp
      - e2e
    environment:
      RABBITMQ_DEFAULT_USER: guest
      RABBITMQ_DEFAULT_PASS: guest
    ports:
      - 5672
      - 15672
    healthcheck:
      test: rabbitmq-diagnostics -q ping
      interval: 10s
      timeout: 10s
      retries: 5
```

**Distributed Lock para sincronizar inicialização:**
```typescript
// redis-distributed-lock.ts
import Redlock from "redlock";
import * as Redis from "ioredis";

export async function tryComposeUp(
  composeFilePath: string,
  initializeFn: () => Promise<StartedDockerComposeEnvironment>
): Promise<StartedDockerComposeEnvironment> {
  const baseKey = `compose:${composeFilePath}`;
  const redisClient = await getSharedRedisClient();
  const redlock = await getRedlockClient();
  
  let lock: any = null;

  try {
    // Adquire lock distribuído (3 min TTL)
    lock = await redlock.acquire([`${baseKey}:lock`], 180000);
    
    // Marca como "starting" e executa
    await redisClient.set(`${baseKey}:state`, "starting", "EX", 180);
    console.log(`[Compose Lock] Lock adquirido! Iniciando docker-compose...`);

    const result = await initializeFn();
    
    // Marca como "started"
    await redisClient.set(`${baseKey}:state`, "started", "EX", 180);
    return result;
  } catch (error) {
    await redisClient.set(`${baseKey}:state`, "failed", "EX", 180);
    throw error;
  } finally {
    if (lock) {
      await redlock.release(lock);
      console.log(`[Compose Lock] Lock liberado`);
    }
  }
}
```

**Suite de teste usando reuso com Compose:**
```typescript
import { DockerComposeEnvironment, Wait } from "testcontainers";
import { tryComposeUp } from "../redis-distributed-lock.js";

describe("Compose Suite 1: Produtos", () => {
  let pgClient: PgClient;
  const databaseName = "testdb_compose_suite1";
  const composeFilePath = path.resolve(__dirname, "compose.yaml");

  beforeAll(async () => {
    // Sincroniza com distributed lock para evitar race conditions
    const composeEnvironment = await tryComposeUp(
      composeFilePath,
      async () => {
        return new DockerComposeEnvironment(__dirname, "compose.yaml")
          .withNoRecreate() // ⭐ Habilita reuso do compose
          .withProfiles("postgres")
          .withWaitStrategy("postgres", Wait.forHealthCheck())
          .up();
      }
    );

    // Cria database isolada para esta suite
    const postgresContainer = composeEnvironment.getContainer("postgres-1");
    await dropDatabase(postgresContainer, databaseName);
    await createDatabase(postgresContainer, databaseName);

    pgClient = new PgClient({
      host: postgresContainer.getHost(),
      port: postgresContainer.getMappedPort(5432),
      user: "testuser",
      password: "testpass",
      database: databaseName, // ⭐ Database isolada
    });
    await pgClient.connect();
    await pgClient.query("CREATE TABLE products (...)");
  }, 120000);

  beforeEach(async () => {
    await pgClient.query("TRUNCATE TABLE products RESTART IDENTITY CASCADE");
  });

  afterAll(async () => {
    await pgClient.end();
    // ⚠️ NÃO chama .down() quando usa reuso
  });

  it("deve criar produto", async () => {
    const result = await pgClient.query(
      "INSERT INTO products (name, price, stock) VALUES ($1, $2, $3) RETURNING *",
      ["Laptop", 1299.99, 10]
    );
    expect(result.rows[0].name).toBe("Laptop");
  });
});
```

**Benefícios do reuso com Compose:**
- ✅ Múltiplas suites compartilham o mesmo ambiente
- ✅ Economiza tempo de startup significativamente
- ✅ Profiles permitem ativar apenas serviços necessários
- ✅ Distributed lock evita race conditions
- ✅ Databases separadas garantem isolamento entre suites

**Quando usar reuso com Compose:**
- ✅ Ambiente complexo com múltiplos serviços interdependentes
- ✅ Testes paralelos que podem compartilhar infraestrutura
- ✅ Suites de teste que precisam do mesmo stack
- ❌ NÃO usar se cada suite precisa de configurações diferentes dos serviços

---

## 8. ✅ Limite recursos e aplique segurança aos containers

### Por que limitar recursos?

Containers sem limites podem consumir toda memória/CPU do host, causando instabilidade nos testes e no CI/CD. Aplicar restrições de segurança segue o princípio do menor privilégio.

### ✅ Limitação de recursos

```typescript
import { PostgreSqlContainer } from "@testcontainers/postgresql";

const container = await new PostgreSqlContainer("postgres:15-alpine")
  .withDatabase("testdb")
  .withResourcesQuota({
    memory: 0.5, // ~512MB RAM (em GB)
    cpu: 1.0     // 1 CPU completa
  })
  .withTmpFs({
    // Armazena dados em memória para melhor performance em testes
    '/var/lib/postgresql/data': 'rw,noexec,nosuid,size=256m'
  })
  .start();
```

**Benefícios:**
- ✅ Previne consumo excessivo de recursos
- ✅ Testes mais previsíveis e consistentes
- ✅ Melhor isolamento entre containers
- ✅ Tmpfs acelera I/O de disco em testes

### ✅ Segurança com Capabilities

**Princípio do menor privilégio:** Remova todas capabilities e adicione apenas as necessárias.

```typescript
const container = await new PostgreSqlContainer("postgres:15-alpine")
  .withDatabase("testdb")
  .withResourcesQuota({ memory: 0.5, cpu: 1.0 })
  .withTmpFs({
    '/var/lib/postgresql/data': 'rw,noexec,nosuid,size=256m'
  })
  // Remove TODAS as capabilities
  .withDroppedCapabilities('ALL')
  // Adiciona apenas as necessárias para PostgreSQL
  .withAddedCapabilities('CHOWN', 'FOWNER', 'SETGID', 'SETUID', 'DAC_OVERRIDE')
  .start();
```

**Teste de validação de capabilities:**
```typescript
it('deve validar que apenas capabilities necessárias estão presentes', async () => {
  // Tenta executar operação que requer NET_ADMIN (não adicionada)
  const result = await container.exec([
    'sh', '-c',
    'ip link add dummy0 type dummy 2>&1 || echo "NET_ADMIN_NOT_AVAILABLE"'
  ]);
  
  // Deve falhar pois NET_ADMIN não foi adicionada
  expect(result.output).toContain('NET_ADMIN_NOT_AVAILABLE');
});
```

### Capabilities comuns por serviço

| Serviço | Capabilities Necessárias |
|---------|-------------------------|
| **PostgreSQL** | CHOWN, FOWNER, SETGID, SETUID, DAC_OVERRIDE |
| **MySQL** | CHOWN, FOWNER, SETGID, SETUID, DAC_OVERRIDE |
| **Redis** | SETGID, SETUID |
| **Nginx** | CHOWN, SETGID, SETUID, NET_BIND_SERVICE |
| **MongoDB** | CHOWN, FOWNER, SETGID, SETUID |

### Exemplo com capability específica

Quando necessário adicionar uma capability específica:

```typescript
const container = await new PostgreSqlContainer("postgres:16-alpine")
  .withAddedCapabilities('NET_ADMIN') // Adiciona apenas o necessário
  .start();

// Valida que a capability está disponível
const result = await container.exec([
  'sh', '-c',
  `
  if ip link add dummy0 type dummy 2>/dev/null; then
    echo "SUCCESS: Has NET_ADMIN capability"
    ip link delete dummy0
  else
    echo "ERROR: No NET_ADMIN capability"
  fi
  `
]);

expect(result.output).toContain('SUCCESS: Has NET_ADMIN capability');
```

### Verificar tmpfs montado

```typescript
it('deve verificar que tmpfs está montado corretamente', async () => {
  const execResult = await container.exec(['df', '-h']);
  
  expect(execResult.exitCode).toBe(0);
  // tmpfs deve aparecer na saída
  expect(execResult.output).toContain('tmpfs');
});
```

### Boas práticas de segurança:

1. **✅ Sempre limite memória e CPU** para evitar consumo excessivo
2. **✅ Use tmpfs** para dados temporários (melhor performance)
3. **✅ Drop ALL capabilities** e adicione apenas as necessárias
4. **✅ Use `noexec` e `nosuid`** em tmpfs para prevenir execução de binários
5. **✅ Teste as capabilities** para garantir que a segurança foi aplicada
6. **⚠️ Documente** quais capabilities cada serviço precisa

---

## 9. ✅ Use a integração do seu framework

Frameworks como Spring Boot, Quarkus e Micronaut têm integração nativa com Testcontainers:

- **Spring Boot:** [Testcontainers support](https://www.atomicjar.com/2023/05/spring-boot-3-1-0-testcontainers-for-testing-and-local-development/)
- **Quarkus:** [DevServices](https://www.atomicjar.com/2023/08/joyful-quarkus-application-development-using-testcontainers-desktop/)
- **Micronaut:** [TestResources](https://testcontainers.com/guides/testing-micronaut-kafka-listener-using-testcontainers/)

Use essas integrações ao invés de configurar manualmente.

---

## 10. 🤔 Módulos específicos vs GenericContainer: quando usar cada um?

### Prefira módulos oficiais quando:
✅ O módulo está atualizado e bem mantido  
✅ Atende completamente suas necessidades  
✅ Fornece métodos convenientes (ex: `getConnectionUri()`)  
✅ Implementa defaults sensatos e wait strategies corretas

### Use GenericContainer quando:
✅ Módulo de terceiros está desatualizado  
✅ Precisa de configurações muito específicas  
✅ O módulo não atende suas necessidades  
✅ Quer controle total sobre o container  
✅ Está testando uma tecnologia sem módulo oficial

### Exemplo com módulo oficial (PostgreSQL):
```typescript
// ✅ Simples e direto com módulo oficial
import { PostgreSqlContainer } from "@testcontainers/postgresql";

const postgres = await new PostgreSqlContainer("postgres:15-alpine").start();
const connectionUri = postgres.getConnectionUri(); // Conveniente!
const port = postgres.getPort();
```

### Exemplo com GenericContainer (quando necessário):
```typescript
// ✅ Controle total com GenericContainer
import { GenericContainer, Wait } from "testcontainers";

const postgres = await new GenericContainer("postgres:15-alpine")
  .withExposedPorts(5432)
  .withEnvironment({
    POSTGRES_USER: "custom_user",
    POSTGRES_PASSWORD: "custom_pass",
    POSTGRES_DB: "custom_db",
    POSTGRES_INITDB_ARGS: "-E UTF8 --locale=en_US.UTF-8" // Config específica!
  })
  .withWaitStrategy(
    Wait.forLogMessage(/.*database system is ready.*/, 2)
      .withStartupTimeout(60000)
  )
  .withCopyFilesToContainer([{
    source: "./custom-init.sql",
    target: "/docker-entrypoint-initdb.d/init.sql"
  }])
  .withCommand(["postgres", "-c", "max_connections=200"]) // Comando customizado
  .start();

const connectionUri = `postgresql://${postgres.getHost()}:${postgres.getMappedPort(5432)}/custom_db`;
```

### Módulos populares disponíveis:
- **Databases:** PostgreSQL, MySQL, MongoDB, Redis, Cassandra, Neo4j, InfluxDB
- **Message Brokers:** Kafka, RabbitMQ, Pulsar, NATS
- **Search:** Elasticsearch, OpenSearch, Solr
- **Storage:** MinIO, Azurite, LocalStack (AWS)
- **Others:** Nginx, WireMock, Vault, Keycloak

📚 [Catálogo completo de módulos](https://testcontainers.com/modules/)

### Dica: Crie seu próprio módulo customizado

Se usar `GenericContainer` repetidamente com a mesma configuração, crie uma classe wrapper:

```typescript
export class CustomPostgresContainer extends PostgreSqlContainer {
  constructor(image = "postgres:15-alpine") {
    super(image);
    this.withDatabase("myapp_db")
        .withUsername("myapp_user")
        .withPassword("myapp_pass")
        .withCommand(["postgres", "-c", "max_connections=200"])
        .withCopyFilesToContainer([{
          source: "./schema.sql",
          target: "/docker-entrypoint-initdb.d/01-schema.sql"
        }]);
  }
}

// Uso simplificado
const postgres = await new CustomPostgresContainer().start();
```

---

## 11. ✅ Use WaitStrategies para verificar se o container está pronto

### Problema:
Usar `sleep()` é impreciso e pode causar testes instáveis.

```typescript
// ❌ NÃO faça isso
const container = await new GenericContainer("myapp:latest")
  .withExposedPorts(9090)
  .start();

await new Promise(resolve => setTimeout(resolve, 2000)); // ❌ Sleep fixo!

// ✅ Faça isso
import { Wait } from "testcontainers";

const container = await new GenericContainer("myapp:latest")
  .withExposedPorts(9090)
  .withWaitStrategy(
    Wait.forLogMessage(/.*Ready to accept connections.*/, 1)
  )
  .start();
```

### WaitStrategies disponíveis:
- `Wait.forLogMessage()` - Espera por mensagem específica nos logs
- `Wait.forHealthCheck()` - Espera healthcheck passar
- `Wait.forHttp()` - Espera endpoint HTTP responder
- `Wait.forListeningPorts()` - Espera portas estarem abertas (padrão)

**Nota:** Se não configurar nenhuma WaitStrategy, o Testcontainers verifica automaticamente a conectividade de todas as portas expostas.

---

## 12. ✅ Organize seus testes com boas práticas de programação

### 🏭 Use Container Factories

Centralize a criação de containers em factories para evitar duplicação e facilitar manutenção:

```typescript
// containers/postgres-factory.ts
import { PostgreSqlContainer, StartedPostgreSqlContainer } from "@testcontainers/postgresql";

export class PostgresContainerFactory {
  static create(options?: {
    database?: string;
    username?: string;
    password?: string;
    withReuse?: boolean;
  }) {
    const container = new PostgreSqlContainer("postgres:16-alpine")
      .withDatabase(options?.database || "testdb")
      .withUsername(options?.username || "testuser")
      .withPassword(options?.password || "testpass")
      .withResourcesQuota({ memory: 0.5, cpu: 1.0 })
      .withTmpFs({
        '/var/lib/postgresql/data': 'rw,noexec,nosuid,size=256m'
      });

    if (options?.withReuse) {
      container
        .withReuse()
        .withName("reusable-postgres-test")
        .withAutoRemove(false);
    }

    return container;
  }

  static async createAndStart(options?: Parameters<typeof this.create>[0]) {
    const container = this.create(options);
    return await container.start();
  }
}

// Uso nos testes
describe("Meus testes", () => {
  let container: StartedPostgreSqlContainer;

  beforeAll(async () => {
    container = await PostgresContainerFactory.createAndStart({
      database: "produtos_db",
      withReuse: true
    });
  });
});
```

### 🏗️ Use Test Data Builders

Organize a criação de dados de teste com o padrão Builder:

```typescript
// builders/user-builder.ts
export class UserBuilder {
  private user: {
    name: string;
    email: string;
    age?: number;
    role?: string;
  };

  constructor() {
    // Valores default sensatos
    this.user = {
      name: "John Doe",
      email: "john@example.com",
      age: 30,
      role: "user"
    };
  }

  withName(name: string): this {
    this.user.name = name;
    return this;
  }

  withEmail(email: string): this {
    this.user.email = email;
    return this;
  }

  withAge(age: number): this {
    this.user.age = age;
    return this;
  }

  asAdmin(): this {
    this.user.role = "admin";
    return this;
  }

  build() {
    return { ...this.user };
  }

  async buildAndInsert(client: PgClient) {
    const user = this.build();
    const result = await client.query(
      'INSERT INTO users (name, email, age, role) VALUES ($1, $2, $3, $4) RETURNING *',
      [user.name, user.email, user.age, user.role]
    );
    return result.rows[0];
  }
}

// Uso nos testes
describe("User Service", () => {
  it("deve criar usuário admin", async () => {
    const admin = await new UserBuilder()
      .withName("Admin User")
      .withEmail("admin@example.com")
      .asAdmin()
      .buildAndInsert(pgClient);

    expect(admin.role).toBe("admin");
  });

  it("deve criar usuário comum com idade específica", async () => {
    const user = await new UserBuilder()
      .withAge(25)
      .buildAndInsert(pgClient);

    expect(user.age).toBe(25);
    expect(user.role).toBe("user"); // valor default
  });
});
```

### 🔄 Use hooks do framework corretamente

**beforeAll/afterAll** - Setup e teardown global (uma vez por suite):

```typescript
describe("Product Tests", () => {
  let container: StartedPostgreSqlContainer;
  let pgClient: PgClient;

  // ✅ Inicializa recursos pesados UMA VEZ
  beforeAll(async () => {
    // Inicia container
    container = await PostgresContainerFactory.createAndStart();
    
    // Cria cliente
    pgClient = new PgClient({
      connectionString: container.getConnectionUri()
    });
    await pgClient.connect();

    // Cria estrutura do banco
    await pgClient.query(`
      CREATE TABLE products (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100),
        price DECIMAL(10, 2),
        stock INTEGER DEFAULT 0
      )
    `);
  }, 60000); // Timeout maior para startup

  // ✅ Limpa recursos UMA VEZ ao final
  afterAll(async () => {
    await pgClient?.end();
    
    await container.stop();
  });
});
```

**beforeEach/afterEach** - Setup e cleanup entre testes:

```typescript
describe("Product Tests", () => {
  // ... beforeAll aqui

  // ✅ Limpa dados ENTRE cada teste
  beforeEach(async () => {
    await pgClient.query("TRUNCATE TABLE products RESTART IDENTITY CASCADE");
  });

  // ✅ Opcional: cleanup adicional se necessário
  afterEach(async () => {
    // Limpa cache, reseta mocks, etc
  });

  it("teste 1", async () => {
    // Tabela começa vazia
    const product = await new ProductBuilder()
      .withName("Laptop")
      .withPrice(1299.99)
      .buildAndInsert(pgClient);

    expect(product.name).toBe("Laptop");
  });

  it("teste 2", async () => {
    // Tabela começa vazia novamente (isolamento)
    const result = await pgClient.query("SELECT COUNT(*) as count FROM products");
    expect(parseInt(result.rows[0].count)).toBe(0);
  });
});
```

### 🎯 Padrão completo: Factory + Builder + Hooks

```typescript
// containers/database-factory.ts
export class DatabaseFactory {
  private static instance: StartedPostgreSqlContainer | null = null;

  static async getOrCreateContainer() {
    if (!this.instance) {
      this.instance = await PostgresContainerFactory.createAndStart({
        withReuse: true
      });
    }
    return this.instance;
  }
}

// helpers/test-helpers.ts
export class TestHelpers {
  static async setupDatabase(pgClient: PgClient) {
    await pgClient.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100),
        email VARCHAR(100) UNIQUE,
        age INTEGER,
        role VARCHAR(50),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
  }

  static async cleanDatabase(pgClient: PgClient) {
    await pgClient.query("TRUNCATE TABLE users RESTART IDENTITY CASCADE");
  }
}

// tests/user-service.test.ts
describe("User Service Integration Tests", () => {
  let container: StartedPostgreSqlContainer;
  let pgClient: PgClient;

  beforeAll(async () => {
    // Factory centraliza criação
    container = await DatabaseFactory.getOrCreateContainer();
    
    pgClient = new PgClient({
      connectionString: container.getConnectionUri()
    });
    await pgClient.connect();

    // Helper organiza setup
    await TestHelpers.setupDatabase(pgClient);
  }, 60000);

  beforeEach(async () => {
    // Helper organiza limpeza
    await TestHelpers.cleanDatabase(pgClient);
  });

  afterAll(async () => {
    await pgClient.end();
  });

  it("deve criar múltiplos usuários com builder", async () => {
    // Builder facilita criação de dados de teste
    const admin = await new UserBuilder()
      .withName("Admin")
      .asAdmin()
      .buildAndInsert(pgClient);

    const user1 = await new UserBuilder()
      .withName("User 1")
      .withAge(25)
      .buildAndInsert(pgClient);

    const user2 = await new UserBuilder()
      .withName("User 2")
      .withAge(30)
      .buildAndInsert(pgClient);

    const result = await pgClient.query("SELECT COUNT(*) as count FROM users");
    expect(parseInt(result.rows[0].count)).toBe(3);
  });

  it("deve buscar usuários por role", async () => {
    await new UserBuilder().asAdmin().buildAndInsert(pgClient);
    await new UserBuilder().buildAndInsert(pgClient);

    const result = await pgClient.query("SELECT * FROM users WHERE role = $1", ["admin"]);
    expect(result.rows).toHaveLength(1);
  });
});
```

### 📋 Checklist de boas práticas de programação

| Padrão | Benefício | Quando usar |
|--------|-----------|-------------|
| **Container Factory** | Centraliza configuração, evita duplicação | Sempre que usar mesmos containers em múltiplos testes |
| **Test Data Builder** | Facilita criação de dados, melhora legibilidade | Quando testes precisam de dados complexos ou variados |
| **beforeAll** | Inicializa recursos pesados uma vez | Containers, conexões DB, estrutura de tabelas |
| **afterAll** | Limpa recursos globais | Fechar conexões, parar containers (se não usar reuso) |
| **beforeEach** | Garante isolamento entre testes | TRUNCATE de tabelas, reset de estado |
| **afterEach** | Cleanup adicional se necessário | Limpar cache, resetar mocks, logs |
| **Helper classes** | Organiza lógica comum | Setup de schemas, queries repetitivas |
| **Singleton pattern** | Reutiliza instâncias pesadas | Containers compartilhados entre suites |

### ⚠️ Antipadrões a evitar

```typescript
// ❌ NÃO faça isso - duplicação de código
describe("Test 1", () => {
  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:16-alpine")
      .withDatabase("testdb")
      .withUsername("testuser")
      .withPassword("testpass")
      .start();
  });
});

describe("Test 2", () => {
  beforeAll(async () => {
    // Mesma configuração repetida!
    container = await new PostgreSqlContainer("postgres:16-alpine")
      .withDatabase("testdb")
      .withUsername("testuser")
      .withPassword("testpass")
      .start();
  });
});

// ❌ NÃO faça isso - dados hardcoded em cada teste
it("teste 1", async () => {
  await pgClient.query(
    "INSERT INTO users (name, email, age, role) VALUES ($1, $2, $3, $4)",
    ["John", "john@example.com", 30, "user"]
  );
});

it("teste 2", async () => {
  // Mesmos dados repetidos!
  await pgClient.query(
    "INSERT INTO users (name, email, age, role) VALUES ($1, $2, $3, $4)",
    ["Jane", "jane@example.com", 25, "user"]
  );
});

// ❌ NÃO faça isso - sem isolamento entre testes
describe("Tests sem beforeEach", () => {
  it("teste 1", async () => {
    await pgClient.query("INSERT INTO users (name) VALUES ('User1')");
    const result = await pgClient.query("SELECT COUNT(*) FROM users");
    expect(result.rows[0].count).toBe(1); // Passa
  });

  it("teste 2", async () => {
    await pgClient.query("INSERT INTO users (name) VALUES ('User2')");
    const result = await pgClient.query("SELECT COUNT(*) FROM users");
    expect(result.rows[0].count).toBe(1); // ❌ FALHA! Conta 2 por causa do teste 1
  });
});
```

### ✅ Boas práticas resumidas

1. **✅ Use factories** para centralizar criação de containers
2. **✅ Use builders** para criar dados de teste de forma declarativa
3. **✅ Use beforeAll** para recursos pesados (containers, schemas)
4. **✅ Use beforeEach** para garantir isolamento (TRUNCATE)
5. **✅ Use afterAll** para cleanup global (conexões, containers)
6. **✅ Use helpers** para organizar lógica comum
7. **✅ Nomeie bem** seus testes e funções auxiliares
8. **✅ Documente** configurações específicas em comentários

---

## Resumo das Boas Práticas

| ❌ Não faça | ✅ Faça |
|------------|---------|
| Portas fixas | Portas dinâmicas com `getMappedPort()` |
| `localhost` hardcoded | `container.getHost()` |
| Nomes de container fixos | Deixe o Testcontainers gerar |
| Montar arquivos locais | Copiar arquivos com `withCopyFilesToContainer()` |
| Imagem `latest` | Versão específica (ex: `postgres:16.2`) |
| Containers individuais para múltiplos serviços | Docker Compose com `compose.test.yaml` |
| Sem limitação de recursos | `withResourcesQuota()` e `withTmpFs()` |
| Todas capabilities habilitadas | `withDroppedCapabilities('ALL')` + adicionar necessárias |
| `sleep()` para esperar | `WaitStrategy` apropriada |
| `GenericContainer` sempre | Módulos específicos quando disponíveis |

---
