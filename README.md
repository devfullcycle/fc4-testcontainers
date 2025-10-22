# Testcontainers - Exemplos

Este repositório contém exemplos práticos de uso do Testcontainers com Node.js.

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

## 📖 Diferenças entre Playwright Simple e Advanced

| Aspecto | Simple | Advanced |
|---------|--------|----------|
| **Testes** | Copiados para o container | Executam localmente |
| **Browsers** | Dentro do container | Dentro do container (remoto) |
| **Conexão** | Tudo no container | WebSocket para container |
| **Executor** | Vitest (externo) | Playwright Test (interno) |
| **Reports** | Copiados do container | Gerados localmente |

## 🛠️ Estrutura do Projeto

```
testcontainers/
├── src/
│   ├── 01-redis-example.test.ts
│   ├── 02-redis-multiplos-containers.test.ts
│   ├── 03-host-and-port.test.ts
│   ├── 04-wait-strategies.test.ts
│   ├── 05-postgresql-module.test.ts
│   ├── 06-localstack-module.test.ts
│   └── 07-playwright-module/
│       ├── example-project-simple/    # Testes dentro do container
│       ├── example-project-advanced/  # Testes conectam via WebSocket
│       └── playwright-simple.test.ts
├── package.json
└── README.md
```
