import { 
  DockerComposeEnvironment, 
  StartedDockerComposeEnvironment,
  Wait 
} from 'testcontainers';
import { Client as PgClient } from 'pg';

describe('Docker Compose Profile: Keycloak', () => {
  let environment: StartedDockerComposeEnvironment;

  beforeAll(async () => {
    const composeFilePath = __dirname;
    const composeFile = 'compose.yaml';

    environment = await new DockerComposeEnvironment(composeFilePath, composeFile)
      .withProfiles('keycloak')
      .withWaitStrategy('postgres-1', Wait.forHealthCheck())
      .withWaitStrategy('keycloak-1', Wait.forHealthCheck())
      .up();
  }, 120000); // 2 minutos de timeout

  afterAll(async () => {
    //await environment.down();
  });

  it('deve ter o PostgreSQL rodando', () => {
    const postgres = environment.getContainer('postgres-1');
    expect(postgres).toBeDefined();
  });

  it('deve ter o Keycloak rodando', () => {
    const keycloak = environment.getContainer('keycloak-1');
    expect(keycloak).toBeDefined();
  });

  it('deve conectar ao PostgreSQL', async () => {
    const postgres = environment.getContainer('postgres-1');
    
    const client = new PgClient({
      host: postgres.getHost(),
      port: postgres.getMappedPort(5432),
      user: 'testuser',
      password: 'testpass',
      database: 'keycloak',
    });

    await client.connect();
    const result = await client.query('SELECT 1 as value');
    expect(result.rows[0].value).toBe(1);
    await client.end();
  });

  it('deve ter a database keycloak criada', async () => {
    const postgres = environment.getContainer('postgres-1');
    
    const client = new PgClient({
      host: postgres.getHost(),
      port: postgres.getMappedPort(5432),
      user: 'testuser',
      password: 'testpass',
      database: 'keycloak',
    });

    await client.connect();
    const result = await client.query(
      "SELECT datname FROM pg_database WHERE datname = 'keycloak'"
    );
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].datname).toBe('keycloak');
    await client.end();
  });

  it('deve acessar a página de boas-vindas do Keycloak', async () => {
    const keycloak = environment.getContainer('keycloak-1');
    const keycloakPort = keycloak.getMappedPort(8080);
    const keycloakHost = keycloak.getHost();

    const response = await fetch(`http://${keycloakHost}:${keycloakPort}/`);
    expect(response.status).toBe(200);
    
    const html = await response.text();
    expect(html).toContain('Keycloak');
  });

  it('deve acessar o console de administração do Keycloak', async () => {
    const keycloak = environment.getContainer('keycloak-1');
    const keycloakPort = keycloak.getMappedPort(8080);
    const keycloakHost = keycloak.getHost();

    // Tenta acessar a página de admin (deve redirecionar para login)
    const response = await fetch(`http://${keycloakHost}:${keycloakPort}/admin/`, {
      redirect: 'manual'
    });
    
    // Deve redirecionar para a página de login ou retornar 200
    expect([200, 302, 303, 307, 308]).toContain(response.status);
  });

  it('deve obter informações do realm master', async () => {
    const keycloak = environment.getContainer('keycloak-1');
    const keycloakPort = keycloak.getMappedPort(8080);
    const keycloakHost = keycloak.getHost();

    // Acessa o endpoint de descoberta do OpenID Connect do realm master
    const response = await fetch(
      `http://${keycloakHost}:${keycloakPort}/realms/master/.well-known/openid-configuration`
    );
    
    expect(response.status).toBe(200);
    
    const config = await response.json();
    
    // Verifica propriedades essenciais do OpenID Connect
    expect(config.issuer).toContain('/realms/master');
    expect(config.authorization_endpoint).toBeDefined();
    expect(config.token_endpoint).toBeDefined();
    expect(config.userinfo_endpoint).toBeDefined();
    expect(config.jwks_uri).toBeDefined();
    
    console.log(`✅ Realm master configurado em: ${config.issuer}`);
  });
});
