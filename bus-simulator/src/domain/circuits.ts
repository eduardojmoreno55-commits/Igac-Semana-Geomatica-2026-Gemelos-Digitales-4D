import type { Circuit } from "./contracts.js";

/**
 * Crea un circuito cuadrado cerrado centrado en un punto. Genera una
 * LineString que forma un loop rectangular: esquina suroeste → sureste →
 * noreste → noroeste → suroeste. Cada lado es 2×`halfSideDeg` de ancho en
 * grados (aproximadamente 250 m a la latitud de Bogotá).
 *
 * @param id Identificador estable en kebab-case.
 * @param name Nombre legible de la zona.
 * @param centerLon Longitud del centro en WGS84.
 * @param centerLat Latitud del centro en WGS84.
 * @param halfSideDeg Semianchura del cuadrado, en grados; por defecto ~250 m.
 * @returns Circuito con geometría de loop cerrado.
 */
function squareLoop(
  id: string,
  name: string,
  centerLon: number,
  centerLat: number,
  halfSideDeg = 0.00112,
): Circuit {
  const sw: [number, number] = [centerLon - halfSideDeg, centerLat - halfSideDeg];
  const se: [number, number] = [centerLon + halfSideDeg, centerLat - halfSideDeg];
  const ne: [number, number] = [centerLon + halfSideDeg, centerLat + halfSideDeg];
  const nw: [number, number] = [centerLon - halfSideDeg, centerLat + halfSideDeg];

  return {
    id,
    name,
    line: {
      type: "Feature",
      properties: { circuitId: id, name },
      geometry: {
        type: "LineString",
        coordinates: [sw, se, ne, nw, sw],
      },
    },
  };
}

/** Catálogo de circuitos asignados a los 4 buses. */
export const CIRCUITS: Circuit[] = [
  squareLoop("chapinero", "Circuito Chapinero", -74.0628, 4.6486),
  squareLoop("candelaria", "Circuito La Candelaria", -74.0758, 4.5981),
  squareLoop("usaquen", "Circuito Usaquén", -74.0307, 4.6946),
  squareLoop("suba", "Circuito Suba", -74.093, 4.742),
];

/**
 * Busca un circuito por ID.
 * @param id Identificador del circuito.
 * @returns El circuito coincidente, o `undefined` si no existe.
 */
export function findCircuit(id: string): Circuit | undefined {
  return CIRCUITS.find((circuit) => circuit.id === id);
}
