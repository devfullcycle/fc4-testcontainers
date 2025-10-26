import { PostgreSqlContainer } from "@testcontainers/postgresql";
import { Client } from "pg";
import fs from "fs";
import { GenericContainer } from "testcontainers";

//#########################################################################################
//por padrão para containers manuais, o testcontainers desincentiva o suporte de volumes
//ver exemplos de volumes no exemplo de Docker Compose
//#########################################################################################

describe("Bind Mount e Copy Files com PostgreSQL", () => {
  it("deve usar Copy Files para script de inicialização (recomendado para CI/CD)", async () => {
    const scriptPath = __dirname + "/init01.sql";

    // Copy Files: funciona com Docker local E remoto
    const container = await new PostgreSqlContainer("postgres:15-alpine")
      .withUsername("testuser")
      .withPassword("testpass")
      .withDatabase("testdb")
      .withCopyFilesToContainer([
        {
          source: scriptPath,
          target: "/docker-entrypoint-initdb.d/init.sql",
        },
      ])
      // .withBindMounts([ // para matar este bind mount, teremos que ter permissão elevada com sudo
      //   {
      //     source: __dirname + '/pgdata', //container ficar preso a estado
      //     target: '/var/lib/postgresql/data',
      //     mode: 'rw',
      //   }
      // ])
      .start();

    const client = new Client({
      connectionString: container.getConnectionUri(),
    });
    await client.connect();

    const result = await client.query("SELECT COUNT(*) as total FROM products");
    expect(parseInt(result.rows[0].total)).toBe(2);

    await client.end();
    await container.stop();
  });

  it("deve usar Bind Mount para desenvolvimento local (não funciona com Docker remoto)", async () => {
    const dir = __dirname;

    // Bind Mount: vincula diretório do host
    // ATENÇÃO: só funciona com Docker local!
    const container = await new PostgreSqlContainer("postgres:15-alpine")
      .withUsername("testuser")
      .withPassword("testpass")
      .withDatabase("testdb")
      .withBindMounts([
        {
          source: dir,
          target: "/docker-entrypoint-initdb.d",
          mode: "ro", //read-only
        },
      ])
      .start();

    const client = new Client({
      connectionString: container.getConnectionUri(),
    });
    await client.connect();

    const result = await client.query("SELECT * FROM categories");
    expect(result.rows).toHaveLength(1);

    await client.end();
    await container.stop();
  });

  it("deve usar tmpfs para performance com dados temporários", async () => {
    // Tmpfs: arquivos em RAM (muito rápido, não persiste)
    const container = await new PostgreSqlContainer("postgres:15-alpine")
      .withUsername("testuser")
      .withPassword("testpass")
      .withDatabase("testdb")
      .withTmpFs({ "/var/lib/postgresql/data": "rw,size=500m" })
      .start();

    const client = new Client({
      connectionString: container.getConnectionUri(),
    });
    await client.connect();

    await client.query(`
      CREATE TEMP TABLE fast_test (id INT, data TEXT);
      INSERT INTO fast_test SELECT generate_series(1, 1000), 'test';
    `);

    const result = await client.query("SELECT COUNT(*) FROM fast_test");
    expect(parseInt(result.rows[0].count)).toBe(1000);

    await client.end();
    await container.stop();
  });

  it("deve usar bind mount para compartilhar storage de arquivos entre containers", async () => {
    // Simula 2 containers acessando um storage compartilhado via bind mount
    // Em ambiente real, seria um NFS, S3, ou outro sistema de armazenamento
    const storageDir = __dirname + "/shared-storage";

    // Garantir que o diretório existe com permissões abertas
    if (fs.existsSync(storageDir)) {
      fs.rmSync(storageDir, { recursive: true });
    }
    fs.mkdirSync(storageDir, { recursive: true });

    const image = await GenericContainer.fromDockerfile(
      __dirname,
      "Dockerfile.appuser"
    )

      .build();

    const container1 = await image
      .withCommand([
        "sh",
        "-c",
        "echo 'Dados compartilhados: 12345' > /storage/file.txt && cat /storage/file.txt",
      ])
      .withBindMounts([
        {
          source: storageDir,
          target: "/storage",
          mode: "rw",
        },
      ])
      .start();

    // Verificar se o arquivo existe antes de continuar
    if (!fs.existsSync(storageDir + "/file.txt")) {
      const files = fs.readdirSync(storageDir);
      throw new Error(`Arquivo não encontrado em ${storageDir}/file.txt. Arquivos encontrados: ${files.join(", ")}`);
    }

    // Container 2: lê e modifica o arquivo
    const container2 = await image
      .withCommand([
        "sh",
        "-c",
        "cat /storage/file.txt && echo ' (Lido pelo Container 2)' >> /storage/file.txt && cat /storage/file.txt",
      ])
      .withBindMounts([
        {
          source: storageDir,
          target: "/storage",
          mode: "rw",
        },
      ])
      .start();


    await sleep(5000);

    // Verificar que os dados foram compartilhados
    const fileContent = fs.readFileSync(storageDir + "/file.txt", "utf-8");
    expect(fileContent).toContain("Dados compartilhados: 12345");
    expect(fileContent).toContain("Lido pelo Container 2");

    await container1.stop();
    await container2.stop();

    //Limpar storage
    fs.rmSync(storageDir, { recursive: true, force: true });
  });
});

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));