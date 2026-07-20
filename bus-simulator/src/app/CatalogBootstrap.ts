import type { Bus, BusRuntime, Circuit, Logger, Variable } from "../domain/contracts.js";
import type { FrostDatastream, FrostThing } from "../infrastructure/FrostClient.js";
import { FrostClient } from "../infrastructure/FrostClient.js";

const OM_MEASUREMENT = "http://www.opengis.net/def/observationType/OGC-OM/2.0/OM_Measurement";

/** Sufijo de nombre de Datastream por variable (identidad estable en FROST). */
const DATASTREAM_SUFFIX: Record<Variable, string> = {
  speed: "-speed",
  battery: "-battery",
  batteryTemperature: "-battery-temperature",
};

/**
 * Siembra idempotente del catalogo SensorThings en FROST-Server.
 *
 * Por cada bus garantiza un Thing con Location (posición inicial sobre su
 * circuito) y tres Datastreams (velocidad, batería, temperatura de batería).
 * Si el Thing ya existe con su Location y sus tres Datastreams, reutiliza sus
 * IDs en lugar de duplicar.
 */
export class CatalogBootstrap {
  /**
   * @param frost Cliente que consulta y modifica el catálogo SensorThings.
   * @param logger Logger para informar cuántos buses se crean o reutilizan.
   */
  public constructor(
    private readonly frost: FrostClient,
    private readonly logger: Logger,
  ) {}

  /**
   * Garantiza el catálogo de todos los buses y devuelve los IDs necesarios para publicar.
   *
   * @param buses Buses que se quieren simular.
   * @param circuitsById Circuitos indexados por ID, para ubicar la posición inicial de cada bus.
   * @returns Configuración de ejecución con Location y tres Datastreams por bus.
   * @throws {Error} Si un bus creado no puede leerse de nuevo con su Location y Datastreams.
   */
  public async run(buses: Bus[], circuitsById: Map<string, Circuit>): Promise<BusRuntime[]> {
    const runtimes: BusRuntime[] = [];
    let created = 0;
    let reused = 0;

    for (const bus of buses) {
      const circuit = circuitsById.get(bus.circuitId);
      if (!circuit) {
        throw new Error(`Circuito desconocido para ${bus.name}: ${bus.circuitId}`);
      }

      const existing = await this.frost.findThingByName(bus.name);

      if (existing && this.isComplete(existing)) {
        runtimes.push(this.toRuntime(bus, existing));
        reused += 1;
        continue;
      }

      if (existing) {
        this.logger.warn("Thing existente incompleto; se recrea el catalogo", { bus: bus.name });
      }

      await this.frost.createThing(buildBusBody(bus, circuit));
      const persisted = await this.frost.findThingByName(bus.name);

      if (!persisted || !this.isComplete(persisted)) {
        throw new Error(`No se pudieron leer la Location/Datastreams de ${bus.name} tras crearlo`);
      }

      runtimes.push(this.toRuntime(bus, persisted));
      created += 1;
    }

    this.logger.info("Catalogo listo", { total: runtimes.length, created, reused });
    return runtimes;
  }

  /** Comprueba que existen los tres Datastreams y al menos una Location. */
  private isComplete(thing: FrostThing): boolean {
    const names = thing.Datastreams ?? [];
    const hasDatastreams = (Object.keys(DATASTREAM_SUFFIX) as Variable[]).every((variable) =>
      names.some((ds) => ds.name.endsWith(DATASTREAM_SUFFIX[variable])),
    );
    return hasDatastreams && (thing.Locations ?? []).length > 0;
  }

  /** Traduce la respuesta expandida de FROST al contrato interno del bucle. */
  private toRuntime(bus: Bus, thing: FrostThing): BusRuntime {
    const datastreams = thing.Datastreams ?? [];
    const datastreamIds = {} as Record<Variable, number>;

    for (const variable of Object.keys(DATASTREAM_SUFFIX) as Variable[]) {
      const match = this.findDatastream(datastreams, variable);
      if (!match) {
        throw new Error(`Falta el Datastream de ${variable} en ${bus.name}`);
      }
      datastreamIds[variable] = match["@iot.id"];
    }

    return { bus, thingId: thing["@iot.id"], datastreamIds };
  }

  private findDatastream(
    datastreams: FrostDatastream[],
    variable: Variable,
  ): FrostDatastream | undefined {
    return datastreams.find((ds) => ds.name.endsWith(DATASTREAM_SUFFIX[variable]));
  }
}

/**
 * Construye el deep insert SensorThings para un bus eléctrico: Thing, su
 * Location inicial (primer punto del circuito) y sus tres Datastreams (cada
 * uno con Sensor y ObservedProperty).
 *
 * @param bus Metadatos del bus que se serializarán.
 * @param circuit Circuito asignado, usado para la posición inicial.
 * @returns Payload listo para `POST /Things`.
 */
export function buildBusBody(bus: Bus, circuit: Circuit): unknown {
  const start = circuit.line.geometry.coordinates[0] ?? [0, 0];

  return {
    name: bus.name,
    description: `Bus eléctrico ${bus.name} - circuito ${circuit.name}`,
    properties: {
      type: "electric-bus",
      busId: bus.id,
      circuitId: bus.circuitId,
    },
    Locations: [
      {
        name: `${bus.name} - ubicacion`,
        description: `Ubicacion en vivo de ${bus.name}`,
        encodingType: "application/geo+json",
        location: {
          type: "Point",
          coordinates: [start[0], start[1], 0],
        },
      },
    ],
    Datastreams: [
      {
        name: `${bus.id}${DATASTREAM_SUFFIX.speed}`,
        description: `Velocidad de ${bus.name}`,
        observationType: OM_MEASUREMENT,
        unitOfMeasurement: {
          name: "kilometre per hour",
          symbol: "km/h",
          definition: "http://qudt.org/vocab/unit/KiloM-PER-HR",
        },
        Sensor: {
          name: "tacometro-simulado",
          description: "Tacómetro simulado",
          encodingType: "text/html",
          metadata: "https://www.transmilenio.gov.co/",
        },
        ObservedProperty: {
          name: "Velocidad",
          definition: "http://www.qudt.org/qudt/owl/1.0.0/quantity/Instances.html#Speed",
          description: "Velocidad instantánea del bus",
        },
      },
      {
        name: `${bus.id}${DATASTREAM_SUFFIX.battery}`,
        description: `Nivel de batería de ${bus.name}`,
        observationType: OM_MEASUREMENT,
        unitOfMeasurement: {
          name: "percent",
          symbol: "%",
          definition: "http://qudt.org/vocab/unit/PERCENT",
        },
        Sensor: {
          name: "bms-simulado",
          description: "Battery Management System simulado",
          encodingType: "text/html",
          metadata: "https://www.transmilenio.gov.co/",
        },
        ObservedProperty: {
          name: "Nivel de bateria",
          definition: "https://en.wikipedia.org/wiki/State_of_charge",
          description: "Porcentaje de carga de la bateria",
        },
      },
      {
        name: `${bus.id}${DATASTREAM_SUFFIX.batteryTemperature}`,
        description: `Temperatura de batería de ${bus.name}`,
        observationType: OM_MEASUREMENT,
        unitOfMeasurement: {
          name: "degree Celsius",
          symbol: "degC",
          definition: "http://qudt.org/vocab/unit/DEG_C",
        },
        Sensor: {
          name: "termometro-bateria-simulado",
          description: "Sensor térmico de batería simulado",
          encodingType: "text/html",
          metadata: "https://www.transmilenio.gov.co/",
        },
        ObservedProperty: {
          name: "Temperatura de bateria",
          definition:
            "http://www.qudt.org/qudt/owl/1.0.0/quantity/Instances.html#ThermodynamicTemperature",
          description: "Temperatura de la bateria del bus",
        },
      },
    ],
  };
}
