import type { Logger, ObservationInput } from "../domain/contracts.js";

/** Datastream tal como lo devuelve FROST al expandir un Thing. */
export interface FrostDatastream {
  /** Identificador numérico asignado por FROST. */
  "@iot.id": number;
  /** Nombre estable usado para distinguir la variable del bus. */
  name: string;
}

/** Location tal como la devuelve FROST al expandir un Thing. */
export interface FrostLocation {
  /** Identificador numérico asignado por FROST. */
  "@iot.id": number;
}

/** Thing con sus Datastreams y Locations expandidos. */
export interface FrostThing {
  /** Identificador numérico asignado por FROST. */
  "@iot.id": number;
  /** Nombre exacto del bus. */
  name: string;
  /** Datastreams incluidos cuando la consulta usa `$expand`. */
  Datastreams?: FrostDatastream[];
  /** Locations incluidas cuando la consulta usa `$expand`. */
  Locations?: FrostLocation[];
}

/**
 * Cliente REST minimo para la API OGC SensorThings v1.1 de FROST-Server.
 * Usa el `fetch` global de Node (>=18); no requiere dependencias HTTP.
 *
 * Incluye métodos adicionales (`createLocation`, `moveThing`) necesarios
 * para Things móviles. FROST solo genera `HistoricalLocations`
 * automáticamente cuando la *relación* Thing→Location cambia (el Thing pasa
 * a apuntar a una Location distinta) — mutar la geometría de una Location
 * existente in-place (p.ej. `PATCH /Locations(id)`) no dispara ese
 * histórico, se comprobó en vivo contra una instancia real. Por eso mover un
 * bus requiere crear una Location nueva y reasignarla al Thing.
 */
export class FrostClient {
  /**
   * @param baseUrl Raíz de SensorThings, incluyendo la versión `/v1.1` y sin slash final.
   * @param logger Logger usado para informar fallos de disponibilidad.
   */
  public constructor(
    private readonly baseUrl: string,
    private readonly logger: Logger,
  ) {}

  /**
   * Busca un Thing por nombre exacto y expande sus Datastreams y Locations.
   *
   * @param name Nombre que se escapa y codifica dentro del filtro OData.
   * @returns El primer Thing coincidente o `null` si la colección está vacía.
   * @throws {Error} Si FROST responde con un estado no exitoso o JSON inválido.
   */
  public async findThingByName(name: string): Promise<FrostThing | null> {
    const filter = encodeURIComponent(`name eq '${name.replace(/'/g, "''")}'`);
    const expand = encodeURIComponent(
      "Datastreams($select=@iot.id,name),Locations($select=@iot.id)",
    );
    const url = `${this.baseUrl}/Things?$filter=${filter}&$expand=${expand}`;
    const body = (await this.getJson(url)) as { value?: FrostThing[] };
    const first = body.value?.[0];
    return first ?? null;
  }

  /**
   * Crea un Thing con deep-insert (Location + Datastreams + Sensor +
   * ObservedProperty en una sola peticion).
   * @param body Payload SensorThings, normalmente un deep insert construido por `CatalogBootstrap`.
   * @throws {Error} Si FROST rechaza la petición.
   */
  public async createThing(body: unknown): Promise<void> {
    await this.post("/Things", body);
  }

  /**
   * Publica una observacion enlazada a un Datastream existente por @iot.id.
   * @param input ID del Datastream, resultado numérico y tiempo del fenómeno.
   * @throws {Error} Si FROST rechaza la observación.
   */
  public async postObservation(input: ObservationInput): Promise<void> {
    await this.post("/Observations", {
      Datastream: { "@iot.id": input.datastreamId },
      phenomenonTime: input.phenomenonTime,
      result: input.result,
    });
  }

  /**
   * Crea una Location nueva (no reutiliza ninguna existente).
   * @param name Nombre de la Location.
   * @param description Descripción de la Location.
   * @param coordinates Punto `[lon, lat, alt]` en WGS84.
   * @returns El `@iot.id` asignado por FROST a la Location creada.
   * @throws {Error} Si FROST rechaza la creación o no devuelve un header `Location` parseable.
   */
  public async createLocation(
    name: string,
    description: string,
    coordinates: [number, number, number],
  ): Promise<number> {
    return this.postAndGetId("/Locations", {
      name,
      description,
      encodingType: "application/geo+json",
      location: { type: "Point", coordinates },
    });
  }

  /**
   * Reasigna la Location activa de un Thing. Al cambiar la relación
   * Thing→Location (no la geometría de una Location existente), FROST
   * genera automáticamente una entrada de `HistoricalLocations` con la
   * Location anterior y el instante del cambio.
   * @param thingId ID del Thing a mover.
   * @param locationId ID de la Location (ya creada) a la que se reasigna.
   * @throws {Error} Si FROST rechaza la actualización.
   */
  public async moveThing(thingId: number, locationId: number): Promise<void> {
    await this.patch(`/Things(${thingId})`, {
      Locations: [{ "@iot.id": locationId }],
    });
  }

  /**
   * Comprueba la raíz de la API sin propagar el error: el arranque decide cuándo reintentar.
   * @returns `true` si FROST responde correctamente; `false` ante red o estado HTTP no exitoso.
   */
  public async isReachable(): Promise<boolean> {
    try {
      await this.getJson(this.baseUrl);
      return true;
    } catch (error) {
      this.logger.warn("FROST no responde todavia", {
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  /** Ejecuta un GET JSON y convierte cualquier respuesta no-2xx en un error descriptivo. */
  private async getJson(url: string): Promise<unknown> {
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
    });

    if (!response.ok) {
      throw new Error(`GET ${url} -> ${response.status} ${await safeText(response)}`);
    }

    return response.json();
  }

  /** Ejecuta un POST JSON relativo a `baseUrl` y acepta cualquier respuesta 2xx. */
  private async post(path: string, body: unknown): Promise<void> {
    const url = `${this.baseUrl}${path}`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`POST ${url} -> ${response.status} ${await safeText(response)}`);
    }
  }

  /**
   * Ejecuta un POST JSON y extrae el `@iot.id` de la entidad creada desde el
   * header `Location` de la respuesta (`.../Entidad(123)`).
   */
  private async postAndGetId(path: string, body: unknown): Promise<number> {
    const url = `${this.baseUrl}${path}`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`POST ${url} -> ${response.status} ${await safeText(response)}`);
    }

    const location = response.headers.get("location");
    const match = location?.match(/\((\d+)\)/);
    if (!match || !match[1]) {
      throw new Error(`POST ${url} no devolvio un header Location con @iot.id parseable: ${location}`);
    }
    return Number(match[1]);
  }

  /** Ejecuta un PATCH JSON relativo a `baseUrl` y acepta cualquier respuesta 2xx. */
  private async patch(path: string, body: unknown): Promise<void> {
    const url = `${this.baseUrl}${path}`;
    const response = await fetch(url, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`PATCH ${url} -> ${response.status} ${await safeText(response)}`);
    }
  }
}

/** Lee una muestra limitada del cuerpo de error sin ocultar fallos secundarios. */
async function safeText(response: Response): Promise<string> {
  try {
    return (await response.text()).slice(0, 500);
  } catch {
    return "";
  }
}
