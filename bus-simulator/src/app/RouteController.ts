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
}

/**
 * Controla el ciclo circuito -> recarga -> circuito de cada bus. Igual que
 * StormController (simulator/src/app/StormController.ts), no usa timers
 * propios: cada bus tiene un "origen" de reloj fijo (ahora - desfase de
 * arranque) y la fase se deriva por aritmética modular sobre el tiempo
 * transcurrido. Esto hace que el ciclo se repita indefinidamente sin volver
 * a programar nada.
 */
export class RouteController {
  private readonly origins = new Map<string, number>();

  /**
   * @param lapDurationMs Duración de una vuelta completa al circuito.
   * @param dwellDurationMs Duración de la parada de recarga al completar la vuelta.
   * @param now Reloj inyectable; facilita probar transiciones de fase sin esperar tiempo real.
   */
  public constructor(
    private readonly lapDurationMs: number,
    private readonly dwellDurationMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  /**
   * Registra el origen de ciclo de un bus la primera vez que se ve. Llamadas
   * repetidas para el mismo bus no reinician su origen.
   * @param busId Identificador estable del bus.
   * @param startOffsetMs Desfase de arranque para escalonar el ciclo respecto a otros buses.
   */
  public register(busId: string, startOffsetMs: number): void {
    if (!this.origins.has(busId)) {
      this.origins.set(busId, this.now() - startOffsetMs);
    }
  }

  /**
   * @param busId Identificador estable del bus.
   * @returns `true` si el bus está en la parada de recarga.
   */
  public isDwelling(busId: string): boolean {
    return this.cyclePosition(busId) >= this.lapDurationMs;
  }

  /**
   * @param busId Identificador estable del bus.
   * @returns Progreso 0..1 sobre el circuito. Vale `1` mientras el bus está en recarga.
   */
  public progress(busId: string): number {
    const pos = this.cyclePosition(busId);
    if (pos >= this.lapDurationMs) {
      return 1;
    }
    return pos / this.lapDurationMs;
  }

  /**
   * Progreso de la recarga del bus si está detenido, cero en caso contrario.
   * @param busId Identificador estable del bus.
   * @returns Progreso 0..1 de la recarga. Vale `0` mientras el bus está circulando.
   */
  public dwellProgress(busId: string): number {
    const pos = this.cyclePosition(busId);
    if (pos < this.lapDurationMs) {
      return 0;
    }
    return (pos - this.lapDurationMs) / this.dwellDurationMs;
  }

  /** @returns Estado serializable de un bus para el panel de control. */
  public status(busId: string): RouteStatus {
    const dwelling = this.isDwelling(busId);
    const totalMs = this.lapDurationMs + this.dwellDurationMs;
    const pos = this.cyclePosition(busId);
    return {
      busId,
      phase: dwelling ? "charging" : "driving",
      phaseProgress: dwelling ? this.dwellProgress(busId) : this.progress(busId),
      remainingMs: dwelling ? totalMs - pos : this.lapDurationMs - pos,
    };
  }

  /** Posición dentro del ciclo total (vuelta + recarga), en milisegundos, siempre en [0, totalMs). */
  private cyclePosition(busId: string): number {
    const origin = this.origins.get(busId);
    if (origin === undefined) {
      throw new Error(`Bus no registrado en RouteController: ${busId}`);
    }
    const totalMs = this.lapDurationMs + this.dwellDurationMs;
    const elapsed = this.now() - origin;
    return ((elapsed % totalMs) + totalMs) % totalMs;
  }
}
