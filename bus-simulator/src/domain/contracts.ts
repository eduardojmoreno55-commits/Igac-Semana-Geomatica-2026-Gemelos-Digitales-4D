/**
 * Contrato minimo de logger para mantener reemplazable la infraestructura.
 * Mismo contrato que simulator/src/domain/contracts.ts para consistencia.
 */
export interface Logger {
  /** Registra un mensaje informativo. */
  info(message: string, context?: Record<string, unknown>): void;
  /** Registra una condición recuperable o inesperada. */
  warn(message: string, context?: Record<string, unknown>): void;
  /** Registra un error de la aplicación. */
  error(message: string, context?: Record<string, unknown>): void;
}

/** Geometría GeoJSON mínima que necesita el simulador (evita depender del paquete "geojson"). */
export interface LineStringFeature {
  type: "Feature";
  properties: Record<string, unknown>;
  geometry: {
    type: "LineString";
    /** Pares [lon, lat] en WGS84, primer y último punto iguales (loop cerrado). */
    coordinates: [number, number][];
  };
}

/** Circuito recorrido por uno o más buses. */
export interface Circuit {
  /** Identificador estable, en kebab-case (ej. "chapinero"). */
  id: string;
  /** Nombre legible del circuito/zona. */
  name: string;
  /** Geometría del loop. */
  line: LineStringFeature;
}

/** Variable observada por un bus. Cada una corresponde a un Datastream en FROST-Server. */
export type Variable = "speed" | "battery" | "batteryTemperature";

/** Estado operativo derivado, expuesto al frontend para colorear el activo. */
export type OperationalStatus = "NORMAL" | "WARNING" | "CRITICAL" | "CHARGING";

/** Bus eléctrico de la flota simulada. */
export interface Bus {
  /** Identificador estable, en kebab-case (ej. "bus-001"). */
  id: string;
  /** Nombre legible del bus. */
  name: string;
  /** Circuito que recorre. */
  circuitId: string;
  /** Desfase de arranque en milisegundos, para escalonar vueltas y recargas entre buses. */
  startOffsetMs: number;
}

/** Bus ya sembrado en FROST con el ID de su Thing y sus tres Datastreams. */
export interface BusRuntime {
  /** Metadatos estáticos del bus. */
  bus: Bus;
  /** ID del Thing en FROST, usado para reasignar su Location en cada tick. */
  thingId: number;
  /** IDs asignados por FROST, indexados por variable observada. */
  datastreamIds: Record<Variable, number>;
}

/** Observacion lista para enviar a FROST. */
export interface ObservationInput {
  /** ID del Datastream al que pertenece la lectura. */
  datastreamId: number;
  /** Resultado numérico en la unidad declarada por el Datastream. */
  result: number;
  /** Instante del fenómeno en formato ISO 8601, normalmente UTC. */
  phenomenonTime: string;
}
