import type { StartedTestContainer } from "testcontainers";
import { GenericContainer } from "testcontainers";

// Tipos exportados
export interface NetworkTestResult {
  isReachable: boolean;
  host: string;
  port: number;
  error?: string;
}

export interface PerformanceMetrics {
  imageReady: number;
  startup: number;
  exec?: number | undefined;
  total: number;
}

export interface TimeoutDebugInfo {
  elapsed: number;
  error: Error;
  timeout: number;
}

/**
 * Ferramentas de inspeção de containers
 */
class InspectionTools {
  async inspectContainer(
    container: StartedTestContainer,
    config?: { since?: number; tail?: number }
  ) {
    console.log("\n=== Container Inspection ===");
    console.log("ID:", container.getId());
    console.log("Name:", container.getName());
    console.log("Host:", container.getHost());

    try {
      const logContent = await new Promise<string>(async (resolve) => {
        const stream = await container.logs(config);
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

      console.log("\n=== Last 20 lines of logs ===");
      const lines = logContent.split("\n").slice(-20);
      lines.forEach((line) => console.log(line));
    } catch (error) {
      console.error("Failed to get logs:", error);
    }
  }
}

/**
 * Ferramentas de debugging de rede
 */
class NetworkTools {
  async testTCPConnection(
    host: string,
    port: number,
    timeout: number = 5000
  ): Promise<NetworkTestResult> {
    console.log(`Testing connection to ${host}:${port}`);

    const net = await import("net");

    const isReachable = await new Promise<boolean>((resolve) => {
      const socket = new net.Socket();

      socket.setTimeout(timeout);
      socket.on("connect", () => {
        console.log("✅ Connection successful!");
        socket.destroy();
        resolve(true);
      });
      socket.on("timeout", () => {
        console.log("❌ Connection timeout");
        socket.destroy();
        resolve(false);
      });
      socket.on("error", (err) => {
        console.log("❌ Connection error:", err.message);
        socket.destroy();
        resolve(false);
      });

      socket.connect(port, host);
    });

    return {
      isReachable,
      host,
      port,
    };
  }

  async testContainerConnection(
    container: StartedTestContainer,
    internalPort: number,
    timeout?: number
  ): Promise<NetworkTestResult> {
    const host = container.getHost();
    const port = container.getMappedPort(internalPort);

    return this.testTCPConnection(host, port, timeout);
  }

  async getNetworkInterfaces(container: StartedTestContainer): Promise<string> {
    const result = await container.exec(["ip", "addr"]);
    console.log("Network interfaces:", result.output);
    return result.output;
  }

  async diagnoseNetworkIssue(
    container: StartedTestContainer,
    internalPort: number
  ): Promise<void> {
    console.log("\n=== Network Diagnostics ===");

    const result = await this.testContainerConnection(container, internalPort);

    if (!result.isReachable) {
      console.log("\n💡 Troubleshooting suggestions:");
      console.log("  1. Check if service is running inside container");
      console.log("  2. Verify port mapping is correct");
      console.log("  3. Check wait strategy configuration");
      console.log("  4. Review container logs for startup errors");
      console.log("  5. Test with: docker exec -it <container> <test-command>");

      await this.getNetworkInterfaces(container);
    }
  }

  async diagnoseConnectionIssue(
    container: StartedTestContainer,
    port: number
  ): Promise<void> {
    await this.diagnoseNetworkIssue(container, port);
  }
}

/**
 * Ferramentas de monitoramento de performance
 */
class PerformanceTools {
  async measureStartup(
    containerBuilder: GenericContainer,
    execCommand?: string[]
  ): Promise<{ container: StartedTestContainer; metrics: PerformanceMetrics }> {
    const measurements: Record<string, number> = {};

    // Mede pull da imagem (se necessário)
    const pullStart = Date.now();
    const builder = containerBuilder;
    measurements.imageReady = Date.now() - pullStart;

    // Mede startup do container
    const startupStart = Date.now();
    const container = await builder.start();
    measurements.startup = Date.now() - startupStart;

    // Mede tempo de exec (se comando fornecido)
    if (execCommand) {
      const execStart = Date.now();
      await container.exec(execCommand);
      measurements.exec = Date.now() - execStart;
    }

    const total = Object.values(measurements).reduce((a, b) => a + b, 0);

    return {
      container,
      metrics: {
        imageReady: measurements.imageReady,
        startup: measurements.startup,
        exec: measurements.exec,
        total,
      },
    };
  }

  printMetrics(metrics: PerformanceMetrics): void {
    console.log("=== Performance Metrics ===");
    console.log("Image ready:", metrics.imageReady, "ms");
    console.log("Startup time:", metrics.startup, "ms");
    if (metrics.exec !== undefined) {
      console.log("Exec time:", metrics.exec, "ms");
    }
    console.log("Total:", metrics.total, "ms");
  }

  async measureWithCallback<T>(
    label: string,
    callback: () => Promise<T>
  ): Promise<{ result: T; duration: number }> {
    const start = Date.now();
    const result = await callback();
    const duration = Date.now() - start;

    console.log(`[${label}] took ${duration}ms`);

    return { result, duration };
  }
}

/**
 * Ferramentas de debugging de timeout
 */
class TimeoutTools {
  async measureStartupAttempt(
    startCallback: () => Promise<StartedTestContainer>,
    expectedTimeout: number
  ): Promise<{
    container?: StartedTestContainer;
    debugInfo?: TimeoutDebugInfo;
  }> {
    const startTime = Date.now();

    try {
      const container = await startCallback();
      const elapsed = Date.now() - startTime;

      console.log("✅ Container started successfully");
      console.log("Startup time:", elapsed, "ms");

      return { container };
    } catch (error: any) {
      const elapsed = Date.now() - startTime;

      const debugInfo: TimeoutDebugInfo = {
        elapsed,
        error,
        timeout: expectedTimeout,
      };

      console.log("=== Timeout Debug Info ===");
      console.log("Elapsed time:", elapsed, "ms");
      console.log("Expected timeout:", expectedTimeout, "ms");
      console.log("Error:", error.message);
      console.log("\n💡 Suggestions:");
      console.log("  - Increase timeout value");
      console.log("  - Adjust wait strategy");
      console.log("  - Check container logs");
      console.log("  - Verify image availability");

      return { debugInfo };
    }
  }

  printTimeoutAnalysis(debugInfo: TimeoutDebugInfo): void {
    console.log("\n=== Timeout Analysis ===");
    console.log("Timeout occurred:", debugInfo.elapsed >= debugInfo.timeout);
    console.log("Time spent:", debugInfo.elapsed, "ms");
    console.log("Timeout limit:", debugInfo.timeout, "ms");
    console.log(
      "Percentage:",
      ((debugInfo.elapsed / debugInfo.timeout) * 100).toFixed(2),
      "%"
    );
  }
}

/**
 * Classe principal de debugging centralizada
 *
 * @example
 * // Network debugging
 * await Debug.network.testContainerConnection(container, 6379);
 *
 * // Performance monitoring
 * const { metrics } = await Debug.performance.measureStartup(containerBuilder);
 *
 * // Timeout debugging
 * const { debugInfo } = await Debug.timeout.measureStartupAttempt(() => container.start(), 5000);
 *
 * // Container inspection
 * await Debug.inspect.inspectContainer(container);
 */
export class Debug {
  static readonly inspect = new InspectionTools();
  static readonly network = new NetworkTools();
  static readonly performance = new PerformanceTools();
  static readonly timeout = new TimeoutTools();

  static enableDebugLogging() {
    // Habilita logs detalhados do Testcontainers
    process.env.DEBUG = "testcontainers*";
  }
}

// Aliases para compatibilidade com código existente
export const TestcontainersDebug = Debug;
export const NetworkDebugger = Debug.network;
export const PerformanceMonitor = Debug.performance;
export const TimeoutDebugger = Debug.timeout;
