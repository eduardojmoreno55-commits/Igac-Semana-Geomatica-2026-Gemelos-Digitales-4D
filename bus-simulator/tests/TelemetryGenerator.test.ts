import { describe, expect, it } from "vitest";
import { lapDurationMsForLength, TelemetryGenerator } from "../src/app/TelemetryGenerator.js";

describe("TelemetryGenerator", () => {
  it("velocidad es 0 durante la recarga", () => {
    const generator = new TelemetryGenerator(() => 0.5);
    expect(generator.speedKmh(true, 1000, 120_000)).toBe(0);
  });

  it("velocidad promedio deriva de distancia/tiempo del circuito", () => {
    const generator = new TelemetryGenerator(() => 0.5); // ruido centrado en 0
    const speed = generator.speedKmh(false, 1000, 120_000); // 1km en 2min = 30km/h
    expect(speed).toBeCloseTo(30, 0);
  });

  it("la bateria drena linealmente durante la vuelta, de 100% al piso configurado", () => {
    const generator = new TelemetryGenerator();
    expect(generator.battery(0, false, 0, 15)).toBe(100);
    expect(generator.battery(0.5, false, 0, 15)).toBeCloseTo(57.5, 1);
    expect(generator.battery(1, false, 0, 15)).toBe(15);
  });

  it("la bateria se recupera durante la recarga, del piso a 100%", () => {
    const generator = new TelemetryGenerator();
    expect(generator.battery(1, true, 0, 15)).toBe(15);
    expect(generator.battery(1, true, 1, 15)).toBe(100);
  });

  it("aplica las reglas de estado de docs/propuesta_taller.md", () => {
    const generator = new TelemetryGenerator();
    expect(generator.status(100, 30, false)).toBe("NORMAL");
    expect(generator.status(35, 30, false)).toBe("WARNING");
    expect(generator.status(100, 65, false)).toBe("WARNING");
    expect(generator.status(10, 30, false)).toBe("CRITICAL");
    expect(generator.status(100, 80, false)).toBe("CRITICAL");
    expect(generator.status(10, 80, true)).toBe("CHARGING");
  });
});

describe("lapDurationMsForLength", () => {
  it("es la inversa exacta de speedKmh: recorrer la duración derivada da la velocidad objetivo", () => {
    const generator = new TelemetryGenerator(() => 0.5); // ruido centrado en 0
    const lapDurationMs = lapDurationMsForLength(2354, 28);
    const speed = generator.speedKmh(false, 2354, lapDurationMs);
    expect(speed).toBeCloseTo(28, 0);
  });

  it("circuitos más largos producen vueltas más largas a la misma velocidad objetivo", () => {
    const short = lapDurationMsForLength(1950, 28);
    const long = lapDurationMsForLength(7798, 28);
    expect(long).toBeGreaterThan(short);
  });
});
