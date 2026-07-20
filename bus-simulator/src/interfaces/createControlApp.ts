import Fastify, { type FastifyInstance } from "fastify";
import type { RouteController } from "../app/RouteController.js";
import type { SimulationLoop } from "../app/SimulationLoop.js";
import { CONTROL_PANEL_HTML } from "./controlPanelHtml.js";

/**
 * Panel de control HTTP (Fastify): sirve la página de control y expone el
 * estado de cada bus. A diferencia del simulador de inundaciones, no hay
 * disparador manual — el ciclo circuito/recarga es automático y continuo —
 * así que el panel es de solo lectura.
 *
 * Rutas expuestas:
 * - `GET /`: HTML embebido del panel.
 * - `GET /api/status`: fase, progreso y tiempo restante de cada bus.
 *
 * @param route Estado y ciclo de vida del circuito de cada bus.
 * @param loop Catálogo de buses disponibles.
 * @param lapDurationMs Duración de vuelta, expuesta como referencia visual.
 * @returns Instancia Fastify lista para escuchar en un puerto.
 */
export function createControlApp(
  route: RouteController,
  loop: SimulationLoop,
  lapDurationMs: number,
): FastifyInstance {
  const app = Fastify({ logger: false });

  /** Entrega el HTML autónomo del panel, sin depender de archivos estáticos. */
  app.get("/", (_request, reply) => {
    reply.type("text/html").send(CONTROL_PANEL_HTML);
  });

  /** Entrega el estado de cada bus para el panel y para clientes de automatización. */
  app.get("/api/status", () => {
    return {
      lapDurationMs,
      buses: loop.allBusIds().map((busId) => route.status(busId)),
    };
  });

  return app;
}
