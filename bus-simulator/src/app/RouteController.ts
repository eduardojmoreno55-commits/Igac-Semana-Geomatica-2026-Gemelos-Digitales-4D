/** Fase actual del ciclo circuito+recarga de un bus. */
export type RoutePhase = "driving" | "charging";

/** Estado serializable de un bus, para el panel de control. */
export interface RouteStatus {
  busId: string;
  phase: RoutePhase;
  /** Progreso 0..1 de la fase activa (vuelta o recarga). */
  phaseProgress: number;
  /** Milisegundos restantes de la fase activa. */
  remainingMs: number;
  /** Duración de vuelta de este bus, en milisegundos (varía según la longitud real de su circuito). */
  lapDurationMs: number;
}

/** Origen de ciclo y duración de vuelta de un bus registrado. */
interface BusCycleState {
  origin: number;
  lapDurationMs: number;
}

/**
 * Controla el ciclo circuito -> recarga -> circuito de cada bus. Igual que
 * StormController (simulator/src/app/StormController.ts), no usa timers
 * propios: cada bus tiene un "origen" de reloj fijo (ahora - desfase de
 * arranque) y la fase se deriva por aritmética modular sobre el tiempo
 * transcurrido. Esto hace que el ciclo se repita indefinidamente sin volver
 * a programar nada.
 *
 * La duración de vuelta es por bus (no un valor compartido): circuitos con
 * calles reales tienen longitudes muy distintas entre sí, así que cada bus
 * recibe su propia duración al registrarse (ver `lapDurationMsForLength` en
 * TelemetryGenerator.ts), derivada de la longitud real de su circuito.
 */
export class RouteController {
  private readonly buses = new Map<string, BusCycleState>();

  /**
   * @param dwellDurationMs Duración de la parada de recarga al completar la vuelta.
   * @param now Reloj inyectable; facilita probar transiciones de fase sin esperar tiempo real.
   */
  public constructor(
    private readonly dwellDurationMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  /**
   * Registra el origen de ciclo y la duración de vuelta de un bus la primera
   * vez que se ve. Llamadas repetidas para el mismo bus no reinician su origen.
   * @param busId Identificador estable del bus.
   * @param startOffsetMs Desfase de arranque para escalonar el ciclo respecto a otros buses.
   * @param lapDurationMs Duración de una vuelta completa al circuito de este bus.
   */
  public register(busId: string, startOffsetMs: number, lapDurationMs: number): void {
    if (!this.buses.has(busId)) {
      this.buses.set(busId, { origin: this.now() - startOffsetMs, lapDurationMs });
    }
  }

  /**
   * @param busId Identificador estable del bus.
   * @returns Duración de vuelta registrada para ese bus.
   */
  public lapDurationMsOf(busId: string): number {
    return this.state(busId).lapDurationMs;
  }

  /**
   * @param busId Identificador estable del bus.
   * @returns `true` si el bus está en la parada de recarga.
   */
  public isDwelling(busId: string): boolean {
    return this.cyclePosition(busId) >= this.state(busId).lapDurationMs;
  }

  /**
   * @param busId Identificador estable del bus.
   * @returns Progreso 0..1 sobre el circuito. Vale `1` mientras el bus está en recarga.
   */
  public progress(busId: string): number {
    const lapDurationMs = this.state(busId).lapDurationMs;
    const pos = this.cyclePosition(busId);
    if (pos >= lapDurationMs) {
      return 1;
    }
    return pos / lapDurationMs;
  }

  /**
   * Progreso de la recarga del bus si está detenido, cero en caso contrario.
   * @param busId Identificador estable del bus.
   * @returns Progreso 0..1 de la recarga. Vale `0` mientras el bus está circulando.
   */
  public dwellProgress(busId: string): number {
    const lapDurationMs = this.state(busId).lapDurationMs;
    const pos = this.cyclePosition(busId);
    if (pos < lapDurationMs) {
      return 0;
    }
    return (pos - lapDurationMs) / this.dwellDurationMs;
  }

  /** @returns Estado serializable de un bus para el panel de control. */
  public status(busId: string): RouteStatus {
    const lapDurationMs = this.state(busId).lapDurationMs;
    const dwelling = this.isDwelling(busId);
    const totalMs = lapDurationMs + this.dwellDurationMs;
    const pos = this.cyclePosition(busId);
    return {
      busId,
      phase: dwelling ? "charging" : "driving",
      phaseProgress: dwelling ? this.dwellProgress(busId) : this.progress(busId),
      remainingMs: dwelling ? totalMs - pos : lapDurationMs - pos,
      lapDurationMs,
    };
  }

  /** Posición dentro del ciclo total (vuelta + recarga), en milisegundos, siempre en [0, totalMs). */
  private cyclePosition(busId: string): number {
    const { origin, lapDurationMs } = this.state(busId);
    const totalMs = lapDurationMs + this.dwellDurationMs;
    const elapsed = this.now() - origin;
    return ((elapsed % totalMs) + totalMs) % totalMs;
  }

  /** @throws {Error} Si el bus no fue registrado previamente. */
  private state(busId: string): BusCycleState {
    const state = this.buses.get(busId);
    if (state === undefined) {
      throw new Error(`Bus no registrado en RouteController: ${busId}`);
    }
    return state;
  }
}
