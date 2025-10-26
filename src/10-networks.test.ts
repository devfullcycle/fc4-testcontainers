import {
  GenericContainer,
  Network,
  type StartedTestContainer,
  StartedNetwork,
  Wait,
} from "testcontainers";
import {
  PostgreSqlContainer,
  StartedPostgreSqlContainer,
} from "@testcontainers/postgresql";
import { Client } from "pg";

describe("Gerenciamento de Redes", () => {
  describe("Keycloak com PostgreSQL - Autenticação e Autorização", () => {
    let network: StartedNetwork;
    let postgresContainer: StartedPostgreSqlContainer;
    let keycloakContainer: StartedTestContainer;
    let keycloakUrl: string;

    beforeAll(async () => {
      // Cria uma rede customizada para comunicação entre Keycloak e PostgreSQL
      network = await new Network().start();

      // PostgreSQL - banco de dados do Keycloak (usando módulo PostgreSqlContainer)
      postgresContainer = await new PostgreSqlContainer("postgres:15-alpine")
        .withNetwork(network)
        .withNetworkAliases("postgres")
        .withDatabase("keycloak")
        .withUsername("keycloak")
        .withPassword("keycloak_password")
        .start();

      // Keycloak - servidor de autenticação
      keycloakContainer = await new GenericContainer(
        "quay.io/keycloak/keycloak:23.0"
      )
        .withNetwork(network)
        .withExposedPorts(8080)
        .withEnvironment({
          KC_DB: "postgres",
          KC_DB_URL: `jdbc:postgresql://postgres:5432/keycloak`,
          KC_DB_USERNAME: "keycloak",
          KC_DB_PASSWORD: "keycloak_password",
          KEYCLOAK_ADMIN: "admin",
          KEYCLOAK_ADMIN_PASSWORD: "admin",
        })
        .withCommand(["start-dev"])
        .withWaitStrategy(
          Wait.forLogMessage(/.*Running the server in development mode.*/)
        )
        .withStartupTimeout(120000)
        .start();

      keycloakUrl = `http://${keycloakContainer.getHost()}:${keycloakContainer.getMappedPort(
        8080
      )}`;
    }, 180000); // 3 minutos - Keycloak é pesado para iniciar
 
    afterAll(async () => {
      await keycloakContainer?.stop();
      await postgresContainer?.stop();
      await network?.stop();
    });

    it("deve ter Keycloak e PostgreSQL na mesma rede", () => {
      const networkId = postgresContainer.getNetworkId(network.getName());
      expect(keycloakContainer.getNetworkId(network.getName())).toBe(networkId);
    });

    it("deve acessar console de administração do Keycloak", async () => {
      const response = await fetch(`${keycloakUrl}/admin/master/console/`);
      expect(response.status).toBe(200);
    });

    it("deve obter token de autenticação via OAuth2", async () => {
      const response = await fetch(
        `${keycloakUrl}/realms/master/protocol/openid-connect/token`,
        {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            grant_type: "password",
            client_id: "admin-cli",
            username: "admin",
            password: "admin",
          }),
        }
      );

      expect(response.status).toBe(200);

      const tokenData = await response.json();
      expect(tokenData.access_token).toBeDefined();
      expect(tokenData.token_type).toBe("Bearer");
    });

    it("deve persistir dados do Keycloak no PostgreSQL", async () => {
      const client = new Client({
        connectionString: postgresContainer.getConnectionUri(),
      });
      await client.connect();

      // Verifica que o Keycloak criou suas tabelas no PostgreSQL
      const result = await client.query(`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name LIKE '%'
        LIMIT 5
      `);

      // Keycloak cria muitas tabelas ao iniciar
      expect(result.rows.length).toBeGreaterThan(0);

      await client.end();
    });
  });

  describe("Comunicação com Host usando host.docker.internal", () => {
    let container: StartedTestContainer;
    let hostServerPort: number;
    let hostServer: any;

    beforeAll(async () => {
      // Inicia um servidor HTTP simples no host
      const http = await import("http");

      hostServer = http.createServer((req, res) => {
        if (req.url === "/api/data") {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(
            JSON.stringify({
              message: "Hello from host!",
              timestamp: Date.now(),
            })
          );
        } else {
          res.writeHead(404);
          res.end();
        }
      });

      // Escuta em porta dinâmica
      await new Promise<void>((resolve) => {
        hostServer.listen(0, "0.0.0.0", () => {
          hostServerPort = hostServer.address().port;
          resolve();
        });
      });

      // Container Alpine com curl para testar comunicação com o host
      container = await new GenericContainer("alpine:3.19")
        .withCommand([
          "sh",
          "-c",
          `apk add --no-cache curl && ` +
            `curl -s http://host.docker.internal:${hostServerPort}/api/data`,
        ])
        .withExtraHosts([ // /etc/hosts
          { host: "host.docker.internal", ipAddress: "host-gateway" },
        ])
        .start();
    });

    afterAll(async () => {
      await container?.stop();
      hostServer?.close();
    });

    it("deve container acessar serviço rodando no host via host.docker.internal", async () => {
      const logs = await new Promise<string>(async (resolve, reject) => {
        const stream = await container.logs();
        let output = "";

        stream
          .on("data", (line) => {
            output += line.toString();
          })
          .on("err", (line) => {
            reject(line);
          })
          .on("end", () => {
            resolve(output);
          });
      });

      // Verifica que conseguiu acessar o servidor no host
      expect(logs).toContain("Hello from host!");
      expect(logs).toContain("timestamp");
    });
  });
});
