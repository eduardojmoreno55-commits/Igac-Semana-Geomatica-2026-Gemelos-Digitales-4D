import type { Bus } from "./contracts.js";

/**
 * Flota simulada: un bus por circuito, con desfases de arranque distintos
 * (0, 30, 60, 90 s) para que no todos entren en carga (CHARGING) al mismo
 * tiempo — más realista en el dashboard.
 */
export const BUSES: Bus[] = [
  { id: "bus-001", name: "Bus eléctrico 001 - Chapinero", circuitId: "chapinero", startOffsetMs: 0 },
  { id: "bus-002", name: "Bus eléctrico 002 - La Candelaria", circuitId: "candelaria", startOffsetMs: 30_000 },
  { id: "bus-003", name: "Bus eléctrico 003 - Usaquén", circuitId: "usaquen", startOffsetMs: 60_000 },
  { id: "bus-004", name: "Bus eléctrico 004 - Suba", circuitId: "suba", startOffsetMs: 90_000 },
];
