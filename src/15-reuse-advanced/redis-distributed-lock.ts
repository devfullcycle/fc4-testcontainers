//@ts-ignore redlock não tem tipagem oficial
import Redlock from "redlock";
import * as Redis from "ioredis"; //ioredis
import { RedisContainer, StartedRedisContainer } from "@testcontainers/redis";
import type { StartedDockerComposeEnvironment } from "testcontainers";
import { tryStartContainer } from "./containers-helpers.js";

// ==================== REDIS CONTAINER ====================

let sharedRedisContainer: StartedRedisContainer | null = null;

async function getReusableRedisContainer(): Promise<StartedRedisContainer> {
  if (sharedRedisContainer) {
    return sharedRedisContainer;
  }

  return tryStartContainer(async () => {
    sharedRedisContainer = await new RedisContainer("redis:7-alpine")
      .withReuse()
      .withName("redis-testcontainers-lock")
      .withAutoRemove(false)
      .start();

    console.log("[Redis] Container Redis iniciado para distributed locking");
    return sharedRedisContainer;
  });
}

// ==================== REDIS CLIENT ====================

let sharedRedisClient: Redis.Redis | null = null;

async function getSharedRedisClient(): Promise<Redis.Redis> {
  if (sharedRedisClient && sharedRedisClient.status === "ready") {
    return sharedRedisClient;
  }

  const redisContainer = await getReusableRedisContainer();
  sharedRedisClient = new Redis.Redis({
    host: redisContainer.getHost(),
    port: redisContainer.getMappedPort(6379),
    maxRetriesPerRequest: null, // Necessário para Redlock funcionar
  });

  return sharedRedisClient;
}

async function getRedlockClient(): Promise<Redlock> {
  const redisClient = await getSharedRedisClient();
  return new Redlock([redisClient], {
    driftFactor: 0.01,
    retryCount: 240, // 240 tentativas para adquirir o lock
    retryDelay: 250, // 250ms entre retentativas
    retryJitter: 0, // máximo de 0ms de variação aleatória
  }); //lock = 60 segundos
}

/**
 * Wrapper que encapsula a lógica de lock distribuído para docker-compose
 * 
 * O primeiro teste a chegar adquire o lock, inicia o compose e marca como "started"
 * Os demais testes aguardam o lock ser liberado para que possam adquirir
 * 
 * O lock é automaticamente liberado ao final da função (no finally)
 * TTL de 3 minutos garante que se um teste falhar, o lock expira automaticamente
 *
 * @param composeFilePath - caminho absoluto do compose.yaml
 * @param initializeFn - função que inicializa o compose e seus dependentes
 * @returns instância do StartedDockerComposeEnvironment
 *
 * @example
 * const composeEnvironment = await tryComposeUp(
 *   composeFilePath,
 *   async () => {
 *     return await new DockerComposeEnvironment(__dirname, "compose.yaml")
 *       .withNoRecreate()
 *       .withProfiles("postgres")
 *       .withWaitStrategy("postgres", Wait.forHealthCheck())
 *       .up();
 *   }
 * );
 */
export async function tryComposeUp(
  composeFilePath: string,
  initializeFn: () => Promise<StartedDockerComposeEnvironment>
): Promise<StartedDockerComposeEnvironment> {
  const baseKey = `compose:${composeFilePath}`;

  const redisClient = await getSharedRedisClient();
  const redlock = await getRedlockClient();

  let lock: any = null;

  try {
    console.log(
      `[Compose Lock] Tentando adquirir lock para: ${composeFilePath}`
    );
    lock = await redlock.acquire([`${baseKey}:lock`], 180000); // 3 minutos TTL (docker-compose pode demorar)

    // Se conseguiu o lock, marca como "starting" e executa
    await redisClient.set(`${baseKey}:state`, "starting", "EX", 180);
    console.log(
      `[Compose Lock] Lock adquirido! Iniciando docker-compose...`
    );

    // Executa a função de inicialização
    const result = await initializeFn();

    // Marca como "started"
    await redisClient.set(`${baseKey}:state`, "started", "EX", 180);
    console.log(`[Compose Lock] Docker-compose iniciado com sucesso`);

    // Retorna a instância e a função para liberar o lock
    return result;
  } catch (error) {
    console.error(
      `[Compose Lock] Erro ao adquirir lock ou inicializar:`,
      error
    );
    // Marca como "failed" para que outros testes saibam que houve problema
    await redisClient.set(`${baseKey}:state`, "failed", "EX", 180);
    throw error;
  } finally { 
    // Libera o lock se foi adquirido
    if (lock) {
      try {
        await redlock.release(lock);
        console.log(`[Compose Lock] Lock liberado para: ${composeFilePath}`);
      } catch (error) {
        console.error(`[Compose Lock] Erro ao liberar lock:`, error);
      }
    }
  }
}