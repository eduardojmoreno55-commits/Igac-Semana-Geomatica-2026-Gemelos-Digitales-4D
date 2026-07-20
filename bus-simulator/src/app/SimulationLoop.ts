import type { BusRuntime, Logger, ObservationInput } from "../domain/contracts.js";
import type { FrostClient } from "../infrastructure/FrostClient.js";
import type { CircuitGeometry } from "./CircuitGeometry.js";
import type { RouteController } from "./RouteController.js";
import type { TelemetryGenerator } from "./TelemetryGenerator.js";

/**
 * Bucle base de simulacion: en cada tick calcula la posición de cada bus
 * sobre su circuito (o su punto de recarga), crea una Location nueva y
 * reasigna el Thing a ella (para que FROST genere HistoricalLocations), y
 * publica una observación de velocidad, batería y temperatura de batería.
 */
export class SimulationLoop {
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  /**
   * @param runtimes Buses y IDs de Location/Datastream ya resueltos en FROST.
   * @param circuitGeometries Geometría de cada circuito, indexada por circuitId.
   * @param route Controlador que decide la fase (circulando/recargando) y el progreso de cada bus.
   * @param generator Generador de valores de telemetría.
   * @param frost Cliente REST usado para mover Locations y publicar observaciones.
   * @param logger Registrador de inicio y fallos parciales.
   * @param tickMs Intervalo entre ciclos de publicación en milisegundos.
   * @param lapDurationMs Duración nominal de una vuelta, usada para derivar la velocidad promedio.
   */
  public constructor(
    private readonly runtimes: BusRuntime[],
    private readonly circuitGeometries: Map<string, CircuitGeometry>,
    private readonly route: RouteController,
    private readonly generator: TelemetryGenerator,
    private readonly frost: FrostClient,
    private readonly logger: Logger,
    private readonly tickMs: number,
    private readonly lapDurationMs: number,
    private readonly batteryFloorPct: number,
  ) {}

  /** @returns IDs de todos los buses disponibles para el panel. */
  public allBusIds(): string[] {
    return this.runtimes.map((runtime) => runtime.bus.id);
  }

  /** Inicia un único temporizador de publicación; llamadas repetidas no duplican ciclos. */
  public start(): void {
    if (this.timer !== null) {
      return;
    }
    this.timer = setInterval(() => {
      void this.tick();
    }, this.tickMs);
    this.logger.info("Bucle de simulacion iniciado", {
      buses: this.runtimes.length,
      tickMs: this.tickMs,
    });
  }

  /** Detiene el temporizador; es seguro llamar aunque ya esté detenido. */
  public stop(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /**
   * Calcula posición y telemetría de cada bus y las publica en paralelo.
   * Si FROST tarda más que el intervalo, descarta el ciclo solapado para evitar
   * concurrencia ilimitada; un fallo individual no impide publicar los demás.
   */
  private async tick(): Promise<void> {
    if (this.running) {
      return;
    }
    this.running = true;

    const phenomenonTime = new Date().toISOString();
    const observations: ObservationInput[] = [];
    const locationUpdates: Array<Promise<void>> = [];

    for (const runtime of this.runtimes) {
      const { bus, thingId, datastreamIds } = runtime;
      const geometry = this.circuitGeometries.get(bus.circuitId);
      if (!geometry) {
        this.logger.warn("Circuito desconocido para bus", { bus: bus.id, circuitId: bus.circuitId });
        continue;
      }

      const dwelling = this.route.isDwelling(bus.id);
      const lapProgress = this.route.progress(bus.id);
      const dwellProgress = this.route.dwellProgress(bus.id);
      const [lon, lat] = geometry.pointAtProgress(dwelling ? 1 : lapProgress);

      const speed = this.generator.speedKmh(dwelling, geometry.totalLengthMeters(), this.lapDurationMs);
      const battery = this.generator.battery(lapProgress, dwelling, dwellProgress, this.batteryFloorPct);
      const batteryTemperature = this.generator.batteryTemperature(battery, dwelling);

      locationUpdates.push(
        this.frost
          .createLocation(`${bus.name} - ubicacion`, `Ubicacion en vivo de ${bus.name}`, [lon, lat, 0])
          .then((locationId) => this.frost.moveThing(thingId, locationId)),
      );
      observations.push(
        { datastreamId: datastreamIds.speed, result: speed, phenomenonTime },
        { datastreamId: datastreamIds.battery, result: battery, phenomenonTime },
        { datastreamId: datastreamIds.batteryTemperature, result: batteryTemperature, phenomenonTime },
      );
    }

    const results = await Promise.allSettled([
      ...locationUpdates,
      ...observations.map((observation) => this.frost.postObservation(observation)),
    ]);

    const failed = results.filter((result) => result.status === "rejected");
    if (failed.length > 0) {
      this.logger.warn("Fallaron publicaciones en el tick", {
        failed: failed.length,
        total: results.length,
        sample:
          failed[0]?.status === "rejected" ? String(failed[0].reason).slice(0, 200) : undefined,
      });
    }

    this.running = false;
  }
}
