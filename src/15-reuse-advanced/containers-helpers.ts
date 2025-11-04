import {
  PostgreSqlContainer,
  StartedPostgreSqlContainer,
} from "@testcontainers/postgresql";
import type { StartedGenericContainer } from "testcontainers/build/generic-container/started-generic-container.js";

// ==================== POSTGRES CONTAINER ====================

export function createReusablePostgresContainer() {
  return (
    new PostgreSqlContainer("postgres:15-alpine")
      .withUsername("testuser")
      .withPassword("testpass")
      .withReuse()
      //estratégia para forçar o inicio de apenas 1 container
      //mesmo que múltiplos testes tentem iniciar o container ao mesmo tempo, apenas 1 será iniciado
      //num cenário que não existe nenhum container criado, se várias suites tentarem criar o container, mesmo com o withReuse()
      //vários containers serão criados
      .withName("reusable-postgres-container") //pode usar um nome do projeto + nome da ferramenta
      .withAutoRemove(false)
  );
}

export async function createDatabase(
  postgresContainer: StartedGenericContainer | StartedPostgreSqlContainer,
  databaseName: string
) {
  const result = await postgresContainer.exec([
    "psql",
    "-U",
    "testuser",
    "-d",
    "postgres",
    "-c",
    `CREATE DATABASE "${databaseName}";`,
  ]);
  if (result.exitCode !== 0 && !result.stderr.includes("already exists")) {
    throw new Error(
      `Failed to create database ${databaseName}: ${result.stderr}`
    );
  }
}

export async function dropDatabase(
  postgresContainer: StartedGenericContainer | StartedPostgreSqlContainer,
  databaseName: string
) {
  const result = await postgresContainer.exec([
    "psql",
    "-U",
    "testuser",
    "-d",
    "postgres",
    "-c",
    `DROP DATABASE IF EXISTS "${databaseName}";`,
  ]);
  if (result.exitCode !== 0) {
    throw new Error(
      `Failed to drop database ${databaseName}: ${result.stderr}`
    );
  }
}

export async function tryStartContainer<T>(fn: () => Promise<T>): Promise<T> {
  do {
    try {
      return await fn();
    } catch (e) {
      const error = e as Error;
      if (
        error.message.includes("is already in use by container") ||
        error.message.includes("container already started")
      ) {
        console.log(
          "Container já estava em execução, reutilizando o container existente."
        );
        await sleep(500);
        continue;
      }
      throw e;
    }
  } while (true);
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
