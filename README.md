# Testcontainers - Exemplos

Este repositório contém exemplos práticos de uso do Testcontainers com Node.js desenvolvido durante o curso Full Cycle 4.0.

## Professor

<a href="https://github.com/argentinaluiz">
    <img src="https://avatars.githubusercontent.com/u/4926329?v=4?s=100" width="100px;" alt=""/>
    <br />
    <sub>
        <b>Luiz Carlos</b>
    </sub>
</a>

---

## Slides

- [Slides do curso](./slides.pdf)

## Quadro Branco

- [Quadro Branco](./quadro-branco.png)

---

## 📋 Pré-requisitos

- Docker
- Node.js v24+
- npm

## 🚀 Instalação

```bash
npm install
```

## 📚 Exemplos

### Exemplos 01 a 06 (Redis, PostgreSQL, LocalStack, etc)

Executar todos os testes:
```bash
npm run test
```

Executar um teste específico:
```bash
npm run test src/01-redis-example.test.ts
npm run test src/02-redis-multiplos-containers.test.ts
npm run test src/03-host-and-port.test.ts
npm run test src/04-wait-strategies.test.ts
npm run test src/05-postgresql-module.test.ts
npm run test src/06-localstack-module.test.ts
```

### Exemplo 07 - Playwright (Simple)

**Abordagem**: Copia os testes para dentro do container e executa tudo lá.

Instalar dependências do projeto:
```bash
cd src/07-playwright-module/example-project-simple
npm install
cd ../../..
```

Executar o teste (de fora do projeto):
```bash
npm run test src/07-playwright-module/playwright-simple.test.ts
```

### Exemplo 07 - Playwright (Advanced)

**Abordagem**: Testes executam localmente, conectam-se ao Playwright Server no container via WebSocket.

Instalar dependências:
```bash
cd src/07-playwright-module/example-project-advanced
npm install
```

Executar a aplicação (em um terminal):
```bash
npm start
```

Executar os testes (em outro terminal):
```bash
npm test
```

### Exemplo 08 - WireMock Module

**Abordagem**: Mock de APIs HTTP com WireMock para simular serviços externos.

Executar os testes:
```bash
npm run test src/08-wiremock-module.test.ts
```

### Exemplo 09 - Security and Resources

**Abordagem**: Demonstra limitação de recursos (CPU/memória) e restrições de segurança (capabilities).

Executar os testes:
```bash
npm run test src/09-security-and-resources.test.ts
```

### Exemplo 10 - Networks

**Abordagem**: Comunicação entre containers usando redes customizadas e `host.docker.internal`.

Executar os testes:
```bash
npm run test src/10-networks.test.ts
```

### Exemplo 11 - Volumes and Bind Mount

**Abordagem**: Demonstra diferentes estratégias de compartilhamento de arquivos (Copy Files, Bind Mount, Tmpfs).

Executar os testes:
```bash
npm run test src/11-volumes-and-bind-mount/11-volumes-and-bind-mount.test.ts
```

### Exemplo 12 - Docker Compose

**Abordagem**: Orquestração de múltiplos containers usando Docker Compose.

Executar os testes:
```bash
npm run test src/12-docker-compose/12-docker-compose.test.ts
```

### Exemplo 13 - Docker Compose Profiles

**Abordagem**: Uso de profiles para controlar quais serviços sobem em diferentes cenários de teste.

Executar testes individuais por profile:
```bash
# Apenas PostgreSQL
npm run test src/13-docker-compose-profiles/postgres.test.ts

# Apenas Redis
npm run test src/13-docker-compose-profiles/redis.test.ts

# Apenas RabbitMQ
npm run test src/13-docker-compose-profiles/rabbitmq.test.ts

# Apenas Keycloak (requer PostgreSQL)
npm run test src/13-docker-compose-profiles/keycloak.test.ts

# MyApp - todos os serviços (Postgres + Redis + RabbitMQ + Keycloak)
npm run test src/13-docker-compose-profiles/myapp.test.ts

# E2E - suite completa incluindo Playwright
npm run test src/13-docker-compose-profiles/e2e.test.ts
```

### Exemplo 14 - Reuse Basic

**Abordagem**: Reuso básico de containers entre testes usando `withReuse()`.

Executar os testes (observe o ganho de performance):
```bash
npm run test src/14-reuse-basic/01-postgresql.test.ts
npm run test src/14-reuse-basic/02-postgresql.test.ts
```

### Exemplo 15 - Reuse Advanced

**Abordagem**: Reuso avançado com múltiplas suites compartilhando containers, usando databases isoladas e distributed locks.

#### Sem Docker Compose:
```bash
npm run test src/15-reuse-advanced/without-compose/container-with-reuse-1.test.ts
npm run test src/15-reuse-advanced/without-compose/container-with-reuse-2.test.ts
```

#### Com Docker Compose:
```bash
npm run test src/15-reuse-advanced/with-compose/container-with-reuse-compose-1.test.ts
npm run test src/15-reuse-advanced/with-compose/container-with-reuse-compose-2.test.ts
```

### Exemplo 16 - Docker Outside of Docker (DooD)

**Abordagem**: Executar Testcontainers dentro de um container (desenvolvimento em container).

Entrar no ambiente de desenvolvimento:
```bash
cd src/16-docker-outside-of-docker

# Desktop (com acesso direto ao Docker daemon local)
docker compose -f compose.desktop.yaml up

# CI (ambiente isolado)
docker compose -f compose.ci.yaml up

# Ou usando o compose.yaml padrão
docker compose up
```

Dentro do container, executar os testes:
```bash
npm test
# ou
npm run test:without-compose
npm run test:with-compose
```

### Exemplo 17 - Dev Environment

**Abordagem**: Usa Testcontainers para levantar ambiente de desenvolvimento completo (PostgreSQL, Redis, MailHog).

Iniciar o ambiente de desenvolvimento:
```bash
cd src/17-dev-environment
node 17-dev-environment.js
```

O ambiente ficará rodando até você pressionar `Ctrl+C`.

Configurações carregadas do arquivo `.env` (se existir).

### Exemplo 18 - Best Practices

**Abordagem**: Documentação completa de boas práticas ao usar Testcontainers.

Ler a documentação:
```bash
cat src/18-best-practices/README.md
```

### Exemplo 19 - Debugging and Troubleshooting

**Abordagem**: Técnicas de debug e troubleshooting de containers em testes.

Executar os testes de debugging:
```bash
# Captura e análise de logs
npm run test src/19-debugging-and-troubleshooting/01-container-logs.test.ts

# Inspeção de containers
npm run test src/19-debugging-and-troubleshooting/02-container-inspection.test.ts

# Debugging de rede
npm run test src/19-debugging-and-troubleshooting/03-network-debugging.test.ts

# Troubleshooting de timeouts
npm run test src/19-debugging-and-troubleshooting/04-timeout-troubleshooting.test.ts

# Debugging de performance
npm run test src/19-debugging-and-troubleshooting/05-performance-debugging.test.ts
```

Executar script de debug helper:
```bash
npx tsx src/19-debugging-and-troubleshooting/debug.ts
```

## 📖 Comparações e Diferenças

### Playwright Simple vs Advanced

| Aspecto | Simple | Advanced |
|---------|--------|----------|
| **Testes** | Copiados para o container | Executam localmente |
| **Browsers** | Dentro do container | Dentro do container (remoto) |
| **Conexão** | Tudo no container | WebSocket para container |
| **Executor** | Vitest (externo) | Playwright Test (interno) |
| **Reports** | Copiados do container | Gerados localmente |

### Copy Files vs Bind Mount vs Tmpfs

| Aspecto | Copy Files | Bind Mount | Tmpfs |
|---------|-----------|------------|-------|
| **Portabilidade** | ✅ Funciona em Docker remoto | ❌ Apenas Docker local | ✅ Funciona em qualquer lugar |
| **Performance** | 🟡 Média | 🟢 Alta | 🟢 Muito alta |
| **Persistência** | ✅ Sim | ✅ Sim | ❌ Apenas em memória |
| **Uso recomendado** | Scripts de inicialização | Desenvolvimento local | Dados temporários |

### Reuso: Basic vs Advanced

| Aspecto | Basic | Advanced |
|---------|-------|----------|
| **Complexidade** | 🟢 Baixa | 🟡 Média |
| **Isolamento** | 🟡 Médio (TRUNCATE) | 🟢 Alto (databases separadas) |
| **Suites múltiplas** | ❌ Não recomendado | ✅ Sim, com distributed locks |
| **Performance** | 🟢 Boa | 🟢 Excelente |
| **Uso recomendado** | Testes simples em uma suite | Múltiplas suites paralelas |

## 🛠️ Estrutura do Projeto

```
testcontainers/
├── src/
│   ├── 01-redis-example.test.ts                        # Redis básico
│   ├── 02-redis-multiplos-containers.test.ts           # Múltiplos containers Redis
│   ├── 03-host-and-port.test.ts                        # Host e port dinâmicos
│   ├── 04-wait-strategies.test.ts                      # Estratégias de espera
│   ├── 05-postgresql-module.test.ts                    # Módulo PostgreSQL
│   ├── 06-localstack-module.test.ts                    # Módulo LocalStack (AWS)
│   ├── 07-playwright-module/
│   │   ├── example-project-simple/                     # Testes dentro do container
│   │   ├── example-project-advanced/                   # Testes conectam via WebSocket
│   │   └── playwright-simple.test.ts
│   ├── 08-wiremock-module.test.ts                      # Mock de APIs HTTP
│   ├── 09-security-and-resources.test.ts               # Segurança e limitação de recursos
│   ├── 10-networks.test.ts                             # Redes e comunicação entre containers
│   ├── 11-volumes-and-bind-mount/
│   │   ├── 11-volumes-and-bind-mount.test.ts          # Copy Files, Bind Mount, Tmpfs
│   │   ├── Dockerfile.appuser
│   │   ├── init01.sql
│   │   └── init02.sql
│   ├── 12-docker-compose/
│   │   ├── 12-docker-compose.test.ts                   # Docker Compose básico
│   │   └── compose.yaml
│   ├── 13-docker-compose-profiles/
│   │   ├── compose.yaml                                # Compose com profiles
│   │   ├── postgres.test.ts                            # Profile: postgres
│   │   ├── redis.test.ts                               # Profile: redis
│   │   ├── rabbitmq.test.ts                            # Profile: rabbitmq
│   │   ├── keycloak.test.ts                            # Profile: keycloak
│   │   ├── myapp.test.ts                               # Profile: myapp (completo)
│   │   └── e2e.test.ts                                 # Profile: e2e (com Playwright)
│   ├── 14-reuse-basic/
│   │   ├── 01-postgresql.test.ts                       # Reuso básico - parte 1
│   │   └── 02-postgresql.test.ts                       # Reuso básico - parte 2
│   ├── 15-reuse-advanced/
│   │   ├── containers-helpers.ts                       # Helpers para reuso
│   │   ├── redis-distributed-lock.ts                   # Distributed lock
│   │   ├── without-compose/
│   │   │   ├── container-with-reuse-1.test.ts         # Reuso avançado sem Compose - parte 1
│   │   │   └── container-with-reuse-2.test.ts         # Reuso avançado sem Compose - parte 2
│   │   └── with-compose/
│   │       ├── compose.yaml
│   │       ├── container-with-reuse-compose-1.test.ts # Reuso avançado com Compose - parte 1
│   │       └── container-with-reuse-compose-2.test.ts # Reuso avançado com Compose - parte 2
│   ├── 16-docker-outside-of-docker/
│   │   ├── Dockerfile                                  # Container para executar testes
│   │   ├── compose.yaml                                # Compose padrão
│   │   ├── compose.desktop.yaml                        # Compose para Docker Desktop
│   │   ├── compose.ci.yaml                             # Compose para CI/CD
│   │   ├── package.json
│   │   ├── vitest.config.ts
│   │   └── src/
│   │       ├── containers-helpers.ts
│   │       ├── redis-distributed-lock.ts
│   │       ├── without-compose/                        # Testes sem Compose
│   │       └── with-compose/                           # Testes com Compose
│   ├── 17-dev-environment/
│   │   └── 17-dev-environment.js                       # Ambiente de desenvolvimento completo
│   ├── 18-best-practices/
│   │   └── README.md                                   # Documentação de boas práticas
│   ├── 19-debugging-and-troubleshooting/
│   │   ├── 01-container-logs.test.ts                   # Captura e análise de logs
│   │   ├── 02-container-inspection.test.ts             # Inspeção de containers
│   │   ├── 03-network-debugging.test.ts                # Debugging de rede
│   │   ├── 04-timeout-troubleshooting.test.ts          # Troubleshooting de timeouts
│   │   ├── 05-performance-debugging.test.ts            # Debugging de performance
│   │   └── debug.ts                                    # Script helper de debug
│   └── wiremock-mappings/
│       └── users-api.json                              # Mapping do WireMock
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── testcontainers-prune.sh                             # Script de limpeza
└── README.md
```
