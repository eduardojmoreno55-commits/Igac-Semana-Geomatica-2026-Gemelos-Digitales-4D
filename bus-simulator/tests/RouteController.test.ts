import { describe, expect, it } from "vitest";
import { RouteController } from "../src/app/RouteController.js";

function controllerWithClock(dwellDurationMs: number) {
  let now = 1_000_000;
  const advance = (ms: number): void => {
    now += ms;
  };
  const route = new RouteController(dwellDurationMs, () => now);
  return { route, advance };
}

describe("RouteController", () => {
  it("arranca circulando con progreso 0", () => {
    const { route } = controllerWithClock(10_000);
    route.register("bus-001", 0, 120_000);
    expect(route.isDwelling("bus-001")).toBe(false);
    expect(route.progress("bus-001")).toBe(0);
  });

  it("progresa linealmente durante la vuelta", () => {
    const { route, advance } = controllerWithClock(10_000);
    route.register("bus-001", 0, 120_000);
    advance(60_000);
    expect(route.progress("bus-001")).toBeCloseTo(0.5, 5);
    expect(route.isDwelling("bus-001")).toBe(false);
  });

  it("entra en recarga al completar la vuelta y progresa la recarga", () => {
    const { route, advance } = controllerWithClock(10_000);
    route.register("bus-001", 0, 120_000);
    advance(125_000); // 120s vuelta + 5s de recarga
    expect(route.isDwelling("bus-001")).toBe(true);
    expect(route.progress("bus-001")).toBe(1);
    expect(route.dwellProgress("bus-001")).toBeCloseTo(0.5, 5);
  });

  it("reinicia la vuelta automaticamente tras completar la recarga, en bucle indefinido", () => {
    const { route, advance } = controllerWithClock(10_000);
    route.register("bus-001", 0, 120_000);
    advance(130_000); // 120s vuelta + 10s recarga = ciclo completo
    expect(route.isDwelling("bus-001")).toBe(false);
    expect(route.progress("bus-001")).toBeCloseTo(0, 5);

    advance(120_000 + 10_000); // un ciclo completo mas
    expect(route.isDwelling("bus-001")).toBe(false);
    expect(route.progress("bus-001")).toBeCloseTo(0, 5);
  });

  it("aplica el desfase de arranque para escalonar buses", () => {
    const { route } = controllerWithClock(10_000);
    route.register("bus-002", 60_000, 120_000);
    expect(route.progress("bus-002")).toBeCloseTo(0.5, 5);
  });

  it("lanza si se consulta un bus no registrado", () => {
    const { route } = controllerWithClock(10_000);
    expect(() => route.progress("desconocido")).toThrow();
  });

  it("cada bus conserva su propia duracion de vuelta", () => {
    const { route, advance } = controllerWithClock(10_000);
    route.register("bus-corto", 0, 60_000);
    route.register("bus-largo", 0, 240_000);
    advance(60_000);
    expect(route.isDwelling("bus-corto")).toBe(true);
    expect(route.progress("bus-largo")).toBeCloseTo(0.25, 5);
    expect(route.lapDurationMsOf("bus-corto")).toBe(60_000);
    expect(route.lapDurationMsOf("bus-largo")).toBe(240_000);
  });
});
