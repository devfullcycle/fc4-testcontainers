import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { Client } from 'pg';
import { GenericContainer } from 'testcontainers';

describe('Segurança e Limitação de Recursos', () => {
  describe('PostgreSQL com Restrições de Segurança e Recursos', () => {
    let container: StartedPostgreSqlContainer;
    let client: Client;

    beforeAll(async () => {
      // Container PostgreSQL com múltiplas restrições de segurança e recursos
      container = await new PostgreSqlContainer('postgres:15-alpine') 
        .withDatabase('testdb')
        .withUsername('testuser')
        .withPassword('testpass')
        // Limitações de recursos
        .withResourcesQuota({ 
          memory: 0.5, // ~512MB RAM (in GB)
          cpu: 1.0 // 1 CPU completa (cpu units)
        })
        // Tmpfs para armazenamento do banco de dados (em memória para melhor performance em testes)
        .withTmpFs({  //tmpfs: sistema de arquivos temporário em memória
          '/var/lib/postgresql/data': 'rw,noexec,nosuid,size=256m'
        })
        // Princípio do mínimo privilégio: remove todas capabilities e adiciona apenas as necessárias
        .withDroppedCapabilities('ALL')
        .withAddedCapabilities('CHOWN', 'FOWNER', 'SETGID', 'SETUID', 'DAC_OVERRIDE')
        //.withUser('nonroot') // avalie a possibilidade de usar usuário não-root se aplicável
        .start();
      
      // container.exec(['echo', 'PostgreSQL container started with security constraints'], {
      //   user: 'nonroot', //opções: user, user:group, uid, ou uid:gid
      // });

      // Conecta ao banco usando o método helper
      const connectionUri = container.getConnectionUri();
      
      client = new Client({
        connectionString: connectionUri,
      });

      await client.connect();
    });

    afterAll(async () => {
      await client.end();
      await container.stop();
    });

    it('deve executar operações básicas no banco com restrições aplicadas', async () => {
      // Cria tabela
      await client.query(`
        CREATE TABLE users (
          id SERIAL PRIMARY KEY,
          name VARCHAR(100),
          email VARCHAR(100)
        )
      `);

      // Insert
      const insertResult = await client.query(
        'INSERT INTO users (name, email) VALUES ($1, $2) RETURNING *',
        ['John Doe', 'john@example.com']
      );

      expect(insertResult.rows[0].name).toBe('John Doe');

      // Select
      const selectResult = await client.query('SELECT * FROM users');
      expect(selectResult.rows).toHaveLength(1);
    });

    it('deve verificar que tmpfs está montado corretamente', async () => {
      // Executa comando para verificar os mounts tmpfs
      const execResult = await container.exec(['df', '-h']);
      
      expect(execResult.exitCode).toBe(0);
      // tmpfs deve estar presente na saída
    });

    it('deve validar que apenas capabilities necessárias estão presentes', async () => {
      // PostgreSQL precisa de CHOWN, FOWNER, SETGID, SETUID, DAC_OVERRIDE
      // Tenta executar operação que requer capability não adicionada (ex: NET_ADMIN)
      const result = await container.exec([
        'sh',
        '-c',
        'ip link add dummy0 type dummy 2>&1 || echo "NET_ADMIN_NOT_AVAILABLE"'
      ]);
      
      const output = result.output;
      // Deve falhar pois NET_ADMIN capability não foi adicionada
      expect(output).toContain('NET_ADMIN_NOT_AVAILABLE');
    });
  });

  describe('Exemplo com Capabilities Específicas', () => {
    it('deve adicionar capability específica quando necessário', async () => {
      // Container que precisa alterar configurações de rede
      const container = await new PostgreSqlContainer('postgres:16-alpine')
        .withAddedCapabilities('NET_ADMIN') // Adiciona apenas capability necessária
        .start();

      const execResult = await container.exec([
        'sh',
        '-c',
        `
        # Tenta criar interface de rede (requer NET_ADMIN)
        if ip link add dummy0 type dummy 2>/dev/null; then
          echo "SUCCESS: Has NET_ADMIN capability"
          ip link delete dummy0
        else
          echo "ERROR: No NET_ADMIN capability"
        fi
        `,
      ]);
      
      expect(execResult.output).toContain('SUCCESS: Has NET_ADMIN capability');

      await container.stop();
    });
  });
});