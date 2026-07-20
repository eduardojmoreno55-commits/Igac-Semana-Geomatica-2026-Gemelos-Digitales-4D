# Arquitectura del Simulador de Buses Eléctricos

## Descripción General

El simulador es un backend Node.js/TypeScript que modela el movimiento de 4 buses eléctricos en circuitos cerrados de Bogotá, publicando telemetría en tiempo real a un servidor FROST-Server (OGC SensorThings API v1.1). La arquitectura utiliza capas separadas (domain, app, infrastructure, interfaces) y sigue patrones de inyección de dependencias y reloj inyectable para facilitar pruebas.

## Estructura de Carpetas y Capas

```
src/
├── domain/              # Contratos y modelos de negocio
│   ├── contracts.ts     # Interfaces: Bus, Circuit, BusRuntime, Variable, etc.
│   ├── buses.ts         # Catálogo de 4 buses (bus-001 a bus-004)
│   └── circuits.ts      # Catálogo de 4 circuitos (Chapinero, Candelaria, Usaquén, Suba)
│
├── app/                 # Lógica de aplicación (sin depender de frameworks)
│   ├── CircuitGeometry.ts        # Interpolación espacial con @turf/turf
│   ├── RouteController.ts        # Estado del ciclo circuito→recarga de cada bus
│   ├── TelemetryGenerator.ts     # Síntesis de velocidad, batería, temperatura
│   ├── SimulationLoop.ts         # Bucle base: tick cada BASE_TICK_MS
│   └── CatalogBootstrap.ts       # Siembra idempotente en FROST-Server
│
├── infrastructure/      # Implementaciones concretas (bases de datos, APIs, logging)
│   ├── FrostClient.ts           # Cliente REST para SensorThings API v1.1
│   └── ConsoleLogger.ts         # Logger estructurado sobre consola
│
├── interfaces/          # Controladores HTTP y puntos de entrada
│   ├── createControlApp.ts      # Panel HTTP (Fastify) de solo lectura
│   └── controlPanelHtml.ts      # HTML embebido del panel
│
├── config/
│   └── loadConfig.ts            # Carga y valida variables de entorno
│
└── index.ts             # Punto de entrada principal (composición, orquestación)
```

## Responsabilidades por Capas

### 1. **Domain** (`src/domain/`)

Define el modelo de negocio sin depender de tecnología específica.

- **`contracts.ts`**: Contrato mínimo
  - `Logger`: interfaz de logging reemplazable
  - `LineStringFeature`, `Circuit`: geometría GeoJSON del circuito
  - `Bus`: metadatos del bus (id, nombre, circuito, desfase de arranque)
  - `Variable`: tipo discriminado ("speed" | "battery" | "batteryTemperature")
  - `OperationalStatus`: estado derivado ("NORMAL" | "WARNING" | "CRITICAL" | "CHARGING")
  - `BusRuntime`: bus compilado con IDs de Thing y Datastreams de FROST

- **`buses.ts`**: Catálogo de flota (4 buses)
  - Desfases de arranque escalonados: 0s, 30s, 60s, 90s → no sincronizan en recarga

- **`circuits.ts`**: Catálogo de zonas geográficas (4 circuitos)
  - Loops cuadrados de ~1 km (dimensionados para recorrerse en 2 min a ~30 km/h)
  - Centros aproximados en Bogotá (Chapinero, Candelaria, Usaquén, Suba)
  - Notar: coordenadas ilustrativas, no siguen calles reales (extensión futura: OSM/Overpass)

### 2. **App** (`src/app/`)

Lógica de simulación y orquestación. Sin dependencias de frameworks HTTP o bases de datos concretas.

- **`CircuitGeometry.ts`**: Wrapper de @turf/turf
  - **Constructor**: calcula longitud total del loop (en metros) una sola vez
  - **`totalLengthMeters()`**: expone longitud para cálculos de velocidad
  - **`pointAtProgress(0..1)`**: interpola coordenada [lon, lat] a un progreso normalizado
  - Usa `along()` para muestreo de punto a distancia; limita progreso a [0,1] con `clamp01()`

- **`RouteController.ts`**: Máquina de estados determinista, sin timers
  - **Patrón**: cada bus registra su "origen de reloj" (ahora - startOffsetMs) una sola vez
  - **`register(busId, startOffsetMs)`**: inicializa el origen
  - **`isDwelling(busId)`**: ¿está el bus en parada de recarga?
  - **`progress(busId)`**: progreso 0..1 de la vuelta actual (1 durante recarga)
  - **`dwellProgress(busId)`**: progreso 0..1 de la recarga (0 durante vuelta)
  - **`status(busId)`**: retorna `RouteStatus` con fase, progreso y tiempo restante
  - **`cyclePosition(busId)` (privado)**: aritmética modular sobre tiempo: `((ahora - origen) % cicloTotal)`
  - Reloj inyectable (`now()`) facilita pruebas sin esperar tiempo real

- **`TelemetryGenerator.ts`**: Síntesis de lecturas (determinista si se fija el RNG)
  - **Constantes**: `RANGES` (ruido, temperatura base, etc.) y `THRESHOLDS` (umbrales de alerta)
  - **`speedKmh(dwelling, circuitLength, lapDuration)`**: 0 en recarga, ruido en vuelta
  - **`battery(lapProgress, dwelling, dwellProgress, floorPct)`**: drenaje lineal en vuelta, rampa acelerada en recarga
  - **`batteryTemperature(batteryPct, dwelling)`**: correlación con drenaje + ruido
  - **`status(batteryPct, temp, dwelling)`**: aplica reglas de negocio (NORMAL/WARNING/CRITICAL/CHARGING)
  - RNG inyectable para pruebas deterministas

- **`SimulationLoop.ts`**: Orquestador principal, bucle base
  - **Periodo**: configurable (`BASE_TICK_MS`, default 2000 ms, ajustable a 6000 en docker-compose)
  - **Por cada tick**:
    1. Para cada bus: calcula posición sobre circuito (`geometry.pointAtProgress()`)
    2. Crea `Location` nueva en FROST con esa coordenada
    3. Reasigna el Thing a esa Location (dispara `HistoricalLocations` automáticamente en FROST)
    4. Publica 3 Observations (velocidad, batería, temperatura)
  - **Patrón de HistoricalLocations**: mutar geometría in-place NO dispara histórico; cambiar relación Thing→Location SÍ
  - **Concurrencia**: `Promise.allSettled()` evita bloqueos; ticks solapados se descartan con flag `this.running`
  - Logging de fallos parciales (si FROST tarda mucho, algunos buses pueden fallar)

- **`CatalogBootstrap.ts`**: Siembra idempotente en FROST
  - **`run(buses, circuitsById)`**: por cada bus, crea o reutiliza Thing + Location inicial + 3 Datastreams
  - **Idempotencia**: busca Thing por nombre; si existe y tiene 3 Datastreams + ≥1 Location → reutiliza IDs
  - **Deep insert**: payload anidado con Thing→Location→Datastreams→Sensor→ObservedProperty
  - **`buildBusBody(bus, circuit)`** (función): construye el payload; cada Datastream tiene:
    - `name` estable: `${busId}-speed`, `${busId}-battery`, `${busId}-battery-temperature`
    - `Sensor`: tacómetro simulado, BMS simulado, termómetro simulado
    - `ObservedProperty`: definiciones QUDT y Wikipedia
  - Retorna `BusRuntime[]` con `thingId` (no locationId) y `datastreamIds` mapeados por variable

### 3. **Infrastructure** (`src/infrastructure/`)

Implementaciones concretas de protocolos y servicios externos.

- **`FrostClient.ts`**: Cliente REST minimalista para OGC SensorThings v1.1
  - Sin dependencias HTTP externas; usa `fetch` global de Node.js
  - **`findThingByName(name)`**: query con $filter y $expand, retorna objeto FrostThing
  - **`createThing(body)`**: POST deep insert, sin ID de retorno (se reutiliza más adelante)
  - **`postObservation(datastreamId, result, phenomenonTime)`**: POST a /Observations
  - **`createLocation(name, description, [lon, lat, alt])`**: POST a /Locations, extrae `@iot.id` del header `Location`
  - **`moveThing(thingId, locationId)`**: PATCH /Things(id) reasignando `Locations: [{@iot.id: locationId}]`
  - **`isReachable()`**: GET a raíz sin propagar error (startup espera con retry)
  - Métodos privados: `getJson()`, `post()`, `patch()`, `postAndGetId()` (extrae ID de header Location)

- **`ConsoleLogger.ts`**: Logger estructurado sobre stdout
  - Implementa contrato `Logger`
  - Formatea como `[LEVEL] mensaje { JSON de contexto }` → apto para parseo por ELK/Splunk

### 4. **Interfaces** (`src/interfaces/`)

Controladores HTTP y puntos de entrada de usuario.

- **`createControlApp.ts`**: Fastify app de solo lectura
  - **`GET /`**: sirve HTML embebido del panel de control
  - **`GET /api/status`**: retorna `{ lapDurationMs, buses: [{ busId, phase, phaseProgress, remainingMs }] }`
  - Actualización en vivo desde cliente JavaScript cada 1 segundo

- **`controlPanelHtml.ts`**: HTML + CSS + JavaScript embebido
  - Tabla con estado de cada bus: id, fase (Circulando/Cargando), progreso %, tiempo restante
  - Script que hace poll a `/api/status` y renderiza badges coloreados
  - Incluye explicación de ciclo y duración de vuelta

### 5. **Config** (`src/config/`)

Carga y validación de configuración desde variables de entorno.

- **`loadConfig.ts`**: retorna `AppConfig`
  - `FROST_URL` (default: http://localhost:8080/FROST-Server/v1.1)
  - `PORT` (default: 3003)
  - `BASE_TICK_MS` (default: 2000 ms, ajustable a 6000 para entornos de producción)
  - `LAP_DURATION_MS` (default: 120000 = 2 min)
  - `DWELL_DURATION_MS` (default: 7000 = 7 seg)
  - `BATTERY_FLOOR_PCT` (default: 15%)
  - `LOG_LEVEL` (default: "info", informativo)
  - Función privada `parseIntEnv()` valida números; lanza error si no son válidos

### 6. **Entrada Principal** (`src/index.ts`)

Orquestación y composición root.

- **`waitForFrost(frost, logger)`**: retry loop (30 intentos, 2s entre intentos) hasta que FROST responda
- **`main()`**:
  1. Carga config y logger
  2. Crea cliente FROST y espera disponibilidad
  3. Siembra catálogo (CatalogBootstrap) → obtiene `BusRuntime[]`
  4. Construye geometrías de circuitos (CircuitGeometry map)
  5. Instancia RouteController y registra cada bus con su desfase de arranque
  6. Instancia TelemetryGenerator (RNG determinista o real)
  7. Instancia SimulationLoop (el motor de la simulación)
  8. Levanta panel de control HTTP (Fastify) en puerto 3003
  9. Configura manejadores de señal (SIGINT, SIGTERM) para apagado ordenado
  10. Logs de confirmación con panel URL, cantidad de buses, duraciones
- **`sleep(ms)`**: utility para pausa no bloqueante

## Flujo de Datos

```
Ciclo en cada tick de SimulationLoop:

1. RouteController.progress(busId)
   ↓
2. CircuitGeometry.pointAtProgress(progress) → [lon, lat]
   ↓
3. TelemetryGenerator.speedKmh(), .battery(), .batteryTemperature()
   ↓
4. FrostClient.createLocation(coords) → locationId
   ↓
5. FrostClient.moveThing(thingId, locationId)
   ↓
6. FrostClient.postObservation(datastream, value) × 3
   ↓
7. FROST-Server registra:
   - Locations: nueva fila por tick
   - HistoricalLocations: nueva entrada cada vez que el Thing cambia de Location
   - Observations: 3 nuevas por tick (speed, battery, temp)
   
Resultado: dashboard en localhost:3003 actualiza estado cada 1s via GET /api/status
```

## Patrones de Diseño

### 1. **Inyección de Dependencias**
- Constructores reciben dependen cias (logger, cliente FROST, generador RNG, reloj)
- Facilita testing sin mock frameworks complejos

### 2. **Reloj Inyectable**
- `RouteController.constructor()` acepta función `now` (default: `Date.now`)
- Tests pueden inyectar reloj fijo y avanzar manualmente
- Determinismo en pruebas sin `setTimeout`

### 3. **RNG Inyectable**
- `TelemetryGenerator.constructor()` acepta función `rng` (default: `Math.random`)
- Pruebas inyectan RNG determinista para valores predecibles

### 4. **Siembra Idempotente**
- `CatalogBootstrap` busca Things por nombre antes de crear
- Reutiliza IDs si existen con estructura completa
- Reboot del simulador no duplica entidades en FROST

### 5. **Limpieza de Promesas**
- `SimulationLoop.tick()` usa `Promise.allSettled()` para no fallar si un bus tiene error de FROST
- Flag `this.running` previene ticks solapados si FROST es lento
- Logging de fallos parciales

### 6. **Ciclo Determinista sin Timers**
- `RouteController` usa aritmética modular, no setTimeout interno
- Cada bus "sabe" su fase solo del tiempo transcurrido desde su origen
- Facilita pruebas y escalabilidad (no hay timers por bus)

## Dependencias Principales

- **`@turf/turf`**: interpolación espacial (along, length)
- **`fastify`**: servidor HTTP
- **`dotenv`**: carga de variables de entorno
- **Node.js 24 LTS**: fetch global, módulos ES2023

## Configuración de Compilación

- **TypeScript**: strict mode, ES2023 target
- **vitest**: framework de tests
- **Dockerfile**: multi-stage, Node 24 LTS, puerto 3003 expuesto

## Notas de Implementación Crítica

### HistoricalLocations en FROST-Server
FROST **solo** genera `HistoricalLocations` automáticamente cuando **cambia la relación Thing→Location**. Mutar la geometría de una Location existente in-place (PATCH /Locations(id)) **no** dispara ese mecanismo. Por eso:

```
Incorrecto:  POST /Locations → id1
             PATCH /Locations(id1) con nuevas coordenadas  ← HIST_LOCATIONS NO crece

Correcto:    POST /Locations → id1
             POST /Locations → id2  ← nuevo
             PATCH /Things(busId) Locations: [id2]  ← relación cambia
             ← FROST dispara HIST_LOCATIONS automáticamente
```

Cada tick crea una Location nueva y reasigna el Thing para que el histórico se acumule.

### Extensiones Futuras
- Circuitos reales desde OSM/Overpass Query Language
- Ocupación de buses (variable adicional)
- Estado de puertas (variable adicional)
- Presión de neumáticos (variable adicional)
- WebSocket para dashboard en tiempo real (en lugar de polling HTTP)
- Persistencia de históricos en base de datos local
