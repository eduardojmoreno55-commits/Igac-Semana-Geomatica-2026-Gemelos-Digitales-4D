import { loadConfig } from "./config/loadConfig.js";
import type { Logger } from "./domain/contracts.js";
import { CatalogBootstrap } from "./app/CatalogBootstrap.js";
import { CircuitGeometry } from "./app/CircuitGeometry.js";
import { RouteController } from "./app/RouteController.js";
import { SimulationLoop } from "./app/SimulationLoop.js";
import { TelemetryGenerator } from "./app/TelemetryGenerator.js";
import { BUSES } from "./domain/buses.js";
import { CIRCUITS } from "./domain/circuits.js";
import { ConsoleLogger } from "./infrastructure/ConsoleLogger.js";
import { FrostClient } from "./infrastructure/FrostClient.js";
import { createControlApp } from "./interfaces/createControlApp.js";

/** Número máximo de comprobaciones de disponibilidad antes de abortar el arranque. */
const FROST_MAX_RETRIES = 30;
/** Pausa entre comprobaciones de FROST durante el arranque. */
const FROST_RETRY_MS = 2000;

/**
 * Espera a que la API REST de FROST acepte peticiones.
 *
 * @param frost Cliente que consulta la raíz de SensorThings.
 * @param logger Logger para hacer visible el progreso durante el arranque.
 * @throws {Error} Si se agotan los intentos configurados.
 */
async function waitForFrost(frost: FrostClient, logger: Logger): Promise<void> {
  for (let attempt = 1; attempt <= FROST_MAX_RETRIES; attempt += 1) {
    if (await frost.isReachable()) {
      return;
    }
    logger.info("Esperando a FROST-Server...", { attempt, max: FROST_MAX_RETRIES });
    await sleep(FROST_RETRY_MS);
  }
  throw new Error("FROST-Server no respondio tras varios intentos");
}

/**
 * Punto de entrada principal:
 * 1. Carga configuración desde variables de entorno.
 * 2. Espera a que FROST responda.
 * 3. Siembra idempotente del catálogo SensorThings (Things, Locations, Datastreams).
 * 4. Instancia controladores de ruta, generador de telemetría y bucle de simulación.
 * 5. Inicia el bucle de simulación y levanta el panel de control HTTP.
 * 6. Configura manejadores de señal para apagado controlado.
 * @throws {Error} Si FROST no responde, falta configuración requerida, o falla la siembra del catálogo.
 */
async function main(): Promise<void> {
  const config = loadConfig();
  const logger = new ConsoleLogger();
  const frost = new FrostClient(config.frostUrl, logger);

  logger.info("Simulador de buses electricos - Bogota", { frostUrl: config.frostUrl });
  await waitForFrost(frost, logger);

  const circuitsById = new Map(CIRCUITS.map((circuit) => [circuit.id, circuit]));
  const runtimes = await new CatalogBootstrap(frost, logger).run(BUSES, circuitsById);

  const circuitGeometries = new Map(
    CIRCUITS.map((circuit) => [circuit.id, new CircuitGeometry(circuit.line)]),
  );

  const route = new RouteController(config.lapDurationMs, config.dwellDurationMs);
  for (const runtime of runtimes) {
    route.register(runtime.bus.id, runtime.bus.startOffsetMs);
  }

  const generator = new TelemetryGenerator();
  const loop = new SimulationLoop(
    runtimes,
    circuitGeometries,
    route,
    generator,
    frost,
    logger,
    config.baseTickMs,
    config.lapDurationMs,
    config.batteryFloorPct,
  );
  loop.start();

  const app = createControlApp(route, loop, config.lapDurationMs);
  await app.listen({ port: config.port, host: "0.0.0.0" });

  logger.info("Panel de control listo", {
    panel: `http://localhost:${config.port}`,
    buses: runtimes.length,
    lapDuration: `${config.lapDurationMs / 1000}s`,
    dwellDuration: `${config.dwellDurationMs / 1000}s`,
  });

  const shutdown = async (): Promise<void> => {
    logger.info("Cerrando simulador...");
    loop.stop();
    await app.close();
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown());
  process.on("SIGTERM", () => void shutdown());
}

/**
 * Pausa no bloqueante durante la duración indicada.
 * @param ms Milisegundos a esperar.
 * @returns Promise que se resuelve después de la duración.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
