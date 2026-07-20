import type { OperationalStatus } from "../domain/contracts.js";

/** Rangos de referencia para la síntesis de telemetría. */
const RANGES = {
  /** Amplitud del ruido de velocidad, en km/h. */
  speedNoise: 2,
  /** Temperatura base de batería en reposo, en °C. */
  batteryTempBase: 25,
  /** Grados adicionales por cada punto porcentual de batería consumida. */
  batteryTempPerDrainedPct: 0.5,
  /** Enfriamiento durante la parada de recarga, en °C. */
  chargingCooldown: 10,
  /** Amplitud del ruido de temperatura, en °C. */
  batteryTempNoise: 1,
} as const;

/** Reglas de alerta (ver docs/propuesta_taller.md, sección 9). */
const THRESHOLDS = {
  batteryCritical: 20,
  batteryWarning: 40,
  tempCritical: 75,
  tempWarning: 60,
} as const;

/**
 * Genera velocidad, batería, temperatura de batería y estado operativo de un
 * bus a partir del progreso de su circuito. Toda la aleatoriedad pasa por un
 * RNG inyectable para permitir pruebas deterministas; las rampas de batería
 * son puras (sin RNG).
 */
export class TelemetryGenerator {
  /**
   * @param rng Generador inyectable que devuelve valores en el intervalo [0, 1).
   */
  public constructor(private readonly rng: () => number = Math.random) {}

  /**
   * @param dwelling Si el bus está detenido en la parada de recarga.
   * @param circuitLengthMeters Longitud total del circuito, en metros.
   * @param lapDurationMs Duración nominal de una vuelta, en milisegundos.
   * @returns Velocidad sintética en km/h; `0` mientras el bus está en recarga.
   */
  public speedKmh(dwelling: boolean, circuitLengthMeters: number, lapDurationMs: number): number {
    if (dwelling) {
      return 0;
    }
    const avgSpeedKmh = (circuitLengthMeters / 1000) / (lapDurationMs / 3_600_000);
    const noise = (this.rng() - 0.5) * 2 * RANGES.speedNoise;
    return round1(Math.max(0, avgSpeedKmh + noise));
  }

  /**
   * Drena la batería linealmente durante la vuelta (100% -> `floorPct`) y la
   * recarga con una rampa acelerada durante la parada (`floorPct` -> 100%),
   * simétrica a StormController.rampPrecipitation del simulador de inundaciones.
   * @param lapProgress Progreso 0..1 de la vuelta en curso.
   * @param dwelling Si el bus está en la parada de recarga.
   * @param dwellProgress Progreso 0..1 de la recarga en curso.
   * @param floorPct Nivel mínimo de batería al completar la vuelta.
   * @returns Nivel de batería sintético, en porcentaje.
   */
  public battery(
    lapProgress: number,
    dwelling: boolean,
    dwellProgress: number,
    floorPct: number,
  ): number {
    if (dwelling) {
      const eased = Math.pow(clamp01(dwellProgress), 0.5);
      return round1(floorPct + (100 - floorPct) * eased);
    }
    return round1(100 - (100 - floorPct) * clamp01(lapProgress));
  }

  /**
   * @param batteryPct Nivel de batería actual, en porcentaje.
   * @param dwelling Si el bus está en la parada de recarga (se enfría).
   * @returns Temperatura de batería sintética, en °C.
   */
  public batteryTemperature(batteryPct: number, dwelling: boolean): number {
    const drained = 100 - batteryPct;
    const base = RANGES.batteryTempBase + drained * RANGES.batteryTempPerDrainedPct;
    const cooled = dwelling ? base - RANGES.chargingCooldown : base;
    const noise = (this.rng() - 0.5) * 2 * RANGES.batteryTempNoise;
    return round1(Math.max(20, cooled + noise));
  }

  /**
   * Aplica las reglas de negocio para derivar el estado operativo de un bus
   * desde el nivel de batería, temperatura y fase. Adiciona el estado CHARGING
   * para la parada de recarga (no forma parte de las reglas originales, que solo
   * cubrían buses en movimiento).
   * @param batteryPct Nivel de batería, en porcentaje.
   * @param batteryTemperature Temperatura de batería, en °C.
   * @param dwelling Si el bus está en la parada de recarga.
   * @returns Estado operativo derivado (NORMAL, WARNING, CRITICAL, o CHARGING).
   */
  public status(batteryPct: number, batteryTemperature: number, dwelling: boolean): OperationalStatus {
    if (dwelling) {
      return "CHARGING";
    }
    if (batteryPct < THRESHOLDS.batteryCritical || batteryTemperature > THRESHOLDS.tempCritical) {
      return "CRITICAL";
    }
    if (batteryPct <= THRESHOLDS.batteryWarning || batteryTemperature >= THRESHOLDS.tempWarning) {
      return "WARNING";
    }
    return "NORMAL";
  }
}

/** Limita un valor al intervalo [0, 1]. */
function clamp01(value: number): number {
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

/** Redondea una lectura a una cifra decimal para el payload de FROST. */
function round1(value: number): number {
  return Math.round(value * 10) / 10;
}
