import { type StartedTestContainer } from "testcontainers";
import { PostgreSqlContainer } from "@testcontainers/postgresql";

describe("Obtendo Logs de Containers", () => {
  let container: StartedTestContainer;

  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:16-alpine")
      .withLogConsumer((stream) => {
        stream.on("data", (line) => console.log("[POSTGRES]", line));
        stream.on("err", (line) => console.error("[POSTGRES ERROR]", line));
        stream.on("end", () => console.log("[POSTGRES] Stream ended"));
      })
      .start();
  });

  afterAll(async () => {
    //await container.stop();
  });

  it("deve capturar e exibir logs do container", async () => {
    const logContent = await new Promise<string>(async (resolve) => {
      const msInSec = 1000;
      const tenSecondsAgoMs = new Date().getTime() - 10 * msInSec; // converter em segundos
      const since = tenSecondsAgoMs / msInSec; // unix timestamp em segundos
      const tail = 1000; // últimas 1000 linhas

      const stream = await container.logs();
      //const stream = await container.logs({ since, tail });
      let output = "";

      // Timeout para garantir que não fique travado
      const timeout = setTimeout(() => {
        stream.removeAllListeners();
        resolve(output);
      }, 2000);

      stream
        .on("data", (line) => {
          output += line.toString();
        })
        .on("err", (line) => {
          output += line.toString();
        })
        .on("end", () => {
          clearTimeout(timeout);
          resolve(output);
        });
    });

    console.log("=== Container Logs ===");
    console.log(logContent.substring(0, 500)); // Mostra apenas os primeiros 500 chars
    console.log("=== End Logs ===");

    expect(logContent).toContain("PostgreSQL");
  });
});
