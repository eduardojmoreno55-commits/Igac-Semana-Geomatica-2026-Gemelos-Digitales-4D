# Simulador de buses eléctricos → FROST-Server

Pieza de backend del taller **"Gemelos Digitales 4D: buses eléctricos"**.
Simula **4 buses eléctricos** recorriendo **4 circuitos cerrados en Bogotá**
(Chapinero, La Candelaria, Usaquén, Suba) y **inserta directamente en
FROST-Server** vía REST (OGC SensorThings API v1.1) su velocidad, nivel de
batería y temperatura de batería, moviendo la posición del bus en cada tick.

Cada bus completa su circuito en **2 minutos**; al llegar, se detiene unos
segundos en estado `CHARGING` mientras la batería vuelve al 100%, y reinicia
la vuelta — en bucle indefinido, sin intervención manual.

## Flujo

```
Simulador ──POST /v1.1/Locations──────────► FROST (nueva posicion)
          ├─PATCH /v1.1/Things(id)────────► FROST (reasigna el Thing a esa Location)
          └─POST /v1.1/Observations───────► FROST (velocidad/batería/temperatura)
```

## Modelo SensorThings

A diferencia de una estación fija, la posición de un bus **no** es un
`Datastream`: se modela mediante su `Location`. FROST solo genera
`HistoricalLocations` automáticamente cuando **cambia la relación**
Thing→Location — mutar la geometría de una Location existente in-place no
dispara ese histórico (comprobado en vivo). Por eso, en cada tick el
simulador crea una `Location` **nueva** con la posición actual y reasigna el
Thing a ella; así FROST registra el recorrido completo en
`HistoricalLocations`. Cada bus tiene además 3 `Datastreams` reales:
velocidad, batería y temperatura de batería.

## Requisitos

- Node.js ≥ 24
- FROST-Server corriendo (ver `docker-compose.yaml` en la raíz del repo)

## Uso

```bash
cp .env.example .env      # opcional; hay valores por defecto
npm install
npm run dev               # desarrollo (tsx watch)
# o
npm run build && npm start
```

### Docker Compose (entorno del taller)

Desde la raíz del repositorio:

```bash
docker compose up --build
```

El panel de control queda disponible en `http://localhost:3003` y FROST en
`http://localhost:8080/FROST-Server/v1.1`.

Al arrancar:

1. Espera a que FROST responda.
2. **Siembra idempotente:** crea el `Thing` + `Location` inicial + 3
   `Datastream` (velocidad, batería, temperatura de batería) de cada bus si
   no existen; si ya existen, reutiliza sus IDs (no duplica).
3. Inicia el **bucle base**: cada `BASE_TICK_MS` mueve la `Location` de cada
   bus y publica sus 3 observaciones.
4. Levanta el **panel de control** en `http://localhost:<PORT>`.

## Panel de control

| Método | Ruta | Propósito |
|---|---|---|
| `GET` | `/` | Panel web (fase/progreso/tiempo restante/duración de vuelta de cada bus) |
| `GET` | `/api/status` | `{ buses: [{ busId, phase, phaseProgress, remainingMs, lapDurationMs }] }` |

No hay endpoints de disparo manual: el ciclo circuito→recarga es automático.
`lapDurationMs` varía por bus: se deriva de la longitud real de calles de su
circuito (ver `bus-simulator/src/domain/circuits.ts`) y de `TARGET_SPEED_KMH`.

## Variables de entorno

Ver `.env.example`. Claves: `FROST_URL`, `PORT` (3003), `BASE_TICK_MS`
(2000), `TARGET_SPEED_KMH` (28), `DWELL_DURATION_MS` (7000),
`BATTERY_FLOOR_PCT` (15).

## Reglas de estado (referencia para el frontend)

| Estado | Condición | Visualización sugerida |
|---|---|---|
| `NORMAL` | Batería mayor a 40 y temperatura de batería menor a 60 | Verde |
| `WARNING` | Batería entre 20 y 40 o temperatura de batería entre 60 y 75 | Amarillo |
| `CRITICAL` | Batería menor a 20 o temperatura de batería mayor a 75 | Rojo |
| `CHARGING` | Bus detenido en la parada de recarga al completar la vuelta | Azul / parpadeo suave |

## Tests

```bash
npm test
```

Cubren la transición circulando→recargando→circulando de `RouteController`,
las rampas de batería de `TelemetryGenerator` y la interpolación espacial de
`CircuitGeometry`.

## Circuitos

Loops sobre calles reales en cuatro zonas de Bogotá (Chapinero, La Candelaria,
Usaquén, Suba), obtenidos consultando una vez el motor de ruteo OSRM
(basado en OpenStreetMap) y guardados como coordenadas estáticas; ver
`src/domain/circuits.ts` para el detalle y cómo regenerarlos. Sus longitudes
reales varían bastante entre sí (de ~1.9 km a ~7.8 km), por lo que la
duración de vuelta se deriva por bus a partir de `TARGET_SPEED_KMH` en vez de
ser un valor fijo compartido.
