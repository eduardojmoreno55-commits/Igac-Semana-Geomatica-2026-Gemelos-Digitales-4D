import { along, length } from "@turf/turf";
import type { LineStringFeature } from "../domain/contracts.js";

/**
 * Envuelve un circuito GeoJSON con utilidades de interpolación espacial
 * (vía @turf/turf) para mapear un progreso 0..1 a una coordenada sobre la ruta.
 */
export class CircuitGeometry {
  private readonly lengthMeters: number;

  /** @param line Geometría del circuito (loop cerrado: primer punto == último). */
  public constructor(private readonly line: LineStringFeature) {
    this.lengthMeters = length(line as never, { units: "meters" });
  }

  /** @returns Longitud total del circuito en metros. */
  public totalLengthMeters(): number {
    return this.lengthMeters;
  }

  /**
   * Calcula la coordenada sobre el circuito en un progreso dado (0=inicio, 1=fin).
   * @param progress Avance normalizado sobre el circuito; se limita a [0, 1].
   * @returns Coordenada `[lon, lat]` interpolada a esa distancia del circuito.
   */
  public pointAtProgress(progress: number): [number, number] {
    const distance = clamp01(progress) * this.lengthMeters;
    const point = along(this.line as never, distance, { units: "meters" });
    const [lon, lat] = point.geometry.coordinates;
    return [lon ?? 0, lat ?? 0];
  }
}

/** Limita un progreso al intervalo válido [0, 1]. */
function clamp01(value: number): number {
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}
