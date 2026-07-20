import "dotenv/config";

/** Configuracion de ejecucion cargada desde variables de entorno. */
export interface AppConfig {
  /** URL base de la API REST de FROST-Server (SensorThings v1.1). */
  frostUrl: string;
  /** Puerto del panel de control HTTP. */
  port: number;
  /** Periodo del bucle base de publicacion, en milisegundos. */
  baseTickMs: number;
  /** Duracion de una vuelta completa al circuito, en milisegundos. */
  lapDurationMs: number;
  /** Duracion de la parada de recarga al completar la vuelta, en milisegundos. */
  dwellDurationMs: number;
  /** Nivel minimo de bateria al completar la vuelta, en porcentaje. */
  batteryFloorPct: number;
  /** Nivel solicitado al logger (actualmente informativo; se conserva en la configuración). */
  logLevel: string;
}

/**
 * Convierte una variable de entorno a entero o usa un valor predeterminado.
 *
 * @param name Nombre de la variable, usado también en el mensaje de error.
 * @param value Valor recibido desde `process.env`.
 * @param fallback Valor que se usa cuando la variable no está definida.
 * @returns El valor entero configurado.
 * @throws {Error} Si el valor definido no es un entero válido.
 */
function parseIntEnv(name: string, value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? String(fallback), 10);

  if (Number.isNaN(parsed)) {
    throw new Error(`${name} debe ser un entero valido`);
  }

  return parsed;
}

/**
 * Carga y valida la configuracion de la aplicacion.
 * @returns Configuración normalizada, con URL sin slash final y números enteros.
 * @throws {Error} Si una variable numérica definida no es válida.
 */
export function loadConfig(): AppConfig {
  return {
    frostUrl: (process.env.FROST_URL ?? "http://localhost:8080/FROST-Server/v1.1").replace(
      /\/$/,
      "",
    ),
    port: parseIntEnv("PORT", process.env.PORT, 3003),
    baseTickMs: parseIntEnv("BASE_TICK_MS", process.env.BASE_TICK_MS, 2000),
    lapDurationMs: parseIntEnv("LAP_DURATION_MS", process.env.LAP_DURATION_MS, 120000),
    dwellDurationMs: parseIntEnv("DWELL_DURATION_MS", process.env.DWELL_DURATION_MS, 7000),
    batteryFloorPct: parseIntEnv("BATTERY_FLOOR_PCT", process.env.BATTERY_FLOOR_PCT, 15),
    logLevel: process.env.LOG_LEVEL ?? "info",
  };
}
