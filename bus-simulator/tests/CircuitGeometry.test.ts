import { describe, expect, it } from "vitest";
import { CircuitGeometry } from "../src/app/CircuitGeometry.js";
import { CIRCUITS } from "../src/domain/circuits.js";

describe("CircuitGeometry", () => {
  const circuit = CIRCUITS[0]!;
  const geometry = new CircuitGeometry(circuit.line);

  it("tiene una longitud positiva, coherente con un loop de ~1km", () => {
    expect(geometry.totalLengthMeters()).toBeGreaterThan(500);
    expect(geometry.totalLengthMeters()).toBeLessThan(2000);
  });

  it("progreso 0 coincide con el punto de partida del circuito", () => {
    const start = circuit.line.geometry.coordinates[0]!;
    const [lon, lat] = geometry.pointAtProgress(0);
    expect(lon).toBeCloseTo(start[0], 4);
    expect(lat).toBeCloseTo(start[1], 4);
  });

  it("progreso 1 vuelve al punto de partida (loop cerrado)", () => {
    const start = circuit.line.geometry.coordinates[0]!;
    const [lon, lat] = geometry.pointAtProgress(1);
    expect(lon).toBeCloseTo(start[0], 3);
    expect(lat).toBeCloseTo(start[1], 3);
  });

  it("progreso intermedio se ubica dentro del bounding box del circuito", () => {
    const lons = circuit.line.geometry.coordinates.map((c) => c[0]);
    const lats = circuit.line.geometry.coordinates.map((c) => c[1]);
    const [lon, lat] = geometry.pointAtProgress(0.35);
    expect(lon).toBeGreaterThanOrEqual(Math.min(...lons) - 1e-6);
    expect(lon).toBeLessThanOrEqual(Math.max(...lons) + 1e-6);
    expect(lat).toBeGreaterThanOrEqual(Math.min(...lats) - 1e-6);
    expect(lat).toBeLessThanOrEqual(Math.max(...lats) + 1e-6);
  });
});
