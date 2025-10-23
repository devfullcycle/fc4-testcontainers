import axios, { type AxiosInstance } from 'axios';
// @ts-ignore - Pacote sem tipos TypeScript
import { WireMockContainer } from '@wiremock/wiremock-testcontainers-node';
import { GenericContainer, type StartedTestContainer } from 'testcontainers';

describe('Mock de APIs HTTP com WireMock', () => {
  let container: StartedTestContainer;
  let wiremockUrl: string;
  let client: AxiosInstance;
  let adminClient: AxiosInstance;

  beforeAll(async () => {
    // Cria arquivo de mapping para stub inicial
    const mappingDir = __dirname + '/wiremock-mappings';

    // Inicia container WireMock com mapping
    container = await new WireMockContainer()
      .withMapping(`${mappingDir}/users-api.json`)
      .withExposedPorts(8080)
      .start();

    const host = container.getHost();
    const port = container.getMappedPort(8080);
    wiremockUrl = `http://${host}:${port}`;
    
    client = axios.create({ baseURL: wiremockUrl });
    adminClient = axios.create({ baseURL: `${wiremockUrl}/__admin` });
  });

  afterAll(async () => {
    await container.stop();
  });

  it('deve carregar stub de arquivo de mapping', async () => {
    const response = await client.get('/api/users');

    expect(response.status).toBe(200);
    expect(response.data.users).toHaveLength(2);
    expect(response.data.users[0].name).toBe('Alice');
  });

  it('deve criar stub dinamicamente via Admin API', async () => {
    // Cria stub para endpoint específico
    await adminClient.post('/mappings', {
      request: {
        method: 'GET',
        url: '/api/users/1',
      },
      response: {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
        },
        jsonBody: {
          id: 1,
          name: 'Alice',
          email: 'alice@example.com',
        },
      },
    });

    const response = await client.get('/api/users/1');

    expect(response.status).toBe(200);
    expect(response.data).toEqual({
      id: 1,
      name: 'Alice',
      email: 'alice@example.com',
    });
  });

  it('deve simular erro 404 quando recurso não existe', async () => {
    await adminClient.post('/mappings', {
      request: {
        method: 'GET',
        url: '/api/users/999',
      },
      response: {
        status: 404,
        jsonBody: {
          error: 'User not found',
        },
      },
    });

    try {
      await client.get('/api/users/999');
      throw new Error('Deveria ter lançado erro');
    } catch (error: any) {
      expect(error.response.status).toBe(404);
      expect(error.response.data.error).toBe('User not found');
    }
  });

  it('deve simular latência de rede', async () => {
    await adminClient.post('/mappings', {
      request: {
        method: 'GET',
        url: '/api/slow',
      },
      response: {
        status: 200,
        fixedDelayMilliseconds: 1000,
        jsonBody: { message: 'Response demorada' },
      },
    });

    const start = Date.now();
    const response = await client.get('/api/slow');
    const elapsed = Date.now() - start;

    expect(response.status).toBe(200);
    expect(elapsed).toBeGreaterThanOrEqual(1000);
  });

  it('deve fazer matching baseado em query parameters', async () => {
    await adminClient.post('/mappings', {
      request: {
        method: 'GET',
        urlPath: '/api/search',
        queryParameters: {
          q: {
            equalTo: 'testcontainers',
          },
        },
      },
      response: {
        status: 200,
        jsonBody: {
          results: ['WireMock', 'Docker', 'Testcontainers'],
          total: 3,
        },
      },
    });

    const response = await client.get('/api/search', {
      params: { q: 'testcontainers' },
    });

    expect(response.status).toBe(200);
    expect(response.data.total).toBe(3);
  });

  it('deve validar headers na requisição', async () => {
    await adminClient.post('/mappings', {
      request: {
        method: 'POST',
        url: '/api/protected',
        headers: {
          Authorization: {
            matches: 'Bearer .*',
          },
        },
      },
      response: {
        status: 200,
        jsonBody: { message: 'Authenticated' },
      },
    });

    const response = await client.post(
      '/api/protected',
      {},
      {
        headers: {
          Authorization: 'Bearer token-123',
        },
      }
    );

    expect(response.status).toBe(200);
    expect(response.data.message).toBe('Authenticated');
  });

  it('deve validar body JSON com JSONPath', async () => {
    await adminClient.post('/mappings', {
      request: {
        method: 'POST',
        url: '/api/users',
        bodyPatterns: [
          {
            matchesJsonPath: '$.name',
          },
          {
            matchesJsonPath: '$.email',
          },
        ],
      },
      response: {
        status: 201,
        headers: {
          'Content-Type': 'application/json',
        },
        jsonBody: {
          id: 3,
          message: 'User created',
        },
      },
    });

    const response = await client.post('/api/users', {
      name: 'Charlie',
      email: 'charlie@example.com',
    });

    expect(response.status).toBe(201);
    expect(response.data.id).toBe(3);
  });

  it('deve verificar quantas vezes endpoint foi chamado', async () => {
    await adminClient.post('/mappings', {
      request: {
        method: 'POST',
        url: '/api/events',
      },
      response: {
        status: 201,
      },
    });

    // Faz múltiplas requisições
    await client.post('/api/events', { type: 'user_login' });
    await client.post('/api/events', { type: 'user_logout' });

    // Verifica contagem de chamadas
    const verifyResponse = await adminClient.post('/requests/count', {
      method: 'POST',
      url: '/api/events',
    });

    expect(verifyResponse.data.count).toBe(2);
  });
}, 60000);