# Resumen del estándar OGC SensorThings API 1.1

Este documento resume el estándar **OGC SensorThings API Part 1: Sensing 1.1** de forma independiente, con foco en su propósito, modelo de entidades y contratos principales de lectura y escritura.

Referencia oficial:

- https://docs.ogc.org/is/18-088/18-088.html

## 1. Qué es OGC SensorThings API

OGC SensorThings API es un estándar abierto para interoperabilidad IoT orientado a sensores, observaciones y datos geoespaciales.

Su propósito es ofrecer una API uniforme para:

- describir activos, sensores y variables observadas;
- publicar observaciones;
- consultar series temporales e históricos;
- navegar relaciones entre entidades;
- exponer datos mediante una interfaz REST con JSON.

La especificación usa principios de:

- REST;
- JSON;
- OData para rutas y consultas;
- extensiones opcionales como `dataArray`, `batch` y MQTT.

## 2. Idea central del modelo

El estándar separa claramente:

- la entidad física o lógica que existe en el mundo;
- el sensor o proceso que produce datos;
- la variable observada;
- el flujo de observaciones;
- la observación puntual.

Esa separación permite interoperabilidad entre sistemas heterogéneos sin acoplar la API a un fabricante o una estructura propietaria.

## 3. Entidades principales

La parte de sensado del estándar define estas entidades:

- `Thing`
- `Location`
- `HistoricalLocation`
- `Datastream`
- `Sensor`
- `ObservedProperty`
- `Observation`
- `FeatureOfInterest`

## 4. Resumen de cada entidad

### 4.1. `Thing`

Representa el activo, dispositivo, plataforma o sistema IoT.

Propiedades principales:

- `name`
- `description`
- `properties` opcional

Relaciones principales:

- un `Thing` puede tener varias `Locations`;
- un `Thing` puede tener varios `Datastreams`.

Interpretación:

- es la entidad que representa "qué objeto está siendo descrito".

### 4.2. `Location`

Describe una localización asociada a un `Thing`.

Propiedades principales:

- `name`
- `description`
- `encodingType`
- `location`
- `properties` opcional

Uso típico:

- coordenadas GeoJSON de un dispositivo, estación o activo móvil.

### 4.3. `HistoricalLocation`

Modela la relación temporal entre un `Thing` y una o más `Locations`.

Propiedades principales:

- `time`

Relaciones principales:

- enlaza un `Thing` con la o las `Locations` válidas en un instante dado.

Interpretación:

- conserva el historial espacial del activo.

### 4.4. `Sensor`

Describe el instrumento, algoritmo o procedimiento que genera las observaciones.

Propiedades principales:

- `name`
- `description`
- `encodingType`
- `metadata`
- `properties` opcional

Interpretación:

- no es la medición;
- es la descripción del origen de la medición.

### 4.5. `ObservedProperty`

Describe el fenómeno observado.

Propiedades principales:

- `name`
- `definition`
- `description`
- `properties` opcional

Interpretación:

- representa la variable conceptual, por ejemplo temperatura, humedad, velocidad o nivel de ruido.

### 4.6. `Datastream`

Agrupa observaciones homogéneas producidas por un mismo sensor sobre una misma propiedad observada y asociadas a un mismo `Thing`.

Propiedades principales:

- `name`
- `description`
- `unitOfMeasurement`
- `observationType`
- `properties` opcional

Propiedades adicionales relevantes:

- `observedArea`
- `phenomenonTime`
- `resultTime`

Relaciones principales:

- un `Datastream` pertenece a un `Thing`;
- un `Datastream` usa un `Sensor`;
- un `Datastream` observa una `ObservedProperty`;
- un `Datastream` contiene muchas `Observations`.

Interpretación:

- es el canal lógico de observación.

### 4.7. `Observation`

Es la medición concreta en un instante o intervalo.

Propiedades principales:

- `phenomenonTime`
- `result`
- `resultTime`
- `parameters` opcional
- `validTime` opcional
- `resultQuality` opcional

Relaciones principales:

- pertenece a un `Datastream`;
- refiere a un `FeatureOfInterest`.

Interpretación:

- es el dato observado propiamente dicho.

### 4.8. `FeatureOfInterest`

Es el elemento del mundo real sobre el cual recae la observación.

Propiedades principales:

- `name`
- `description`
- `encodingType`
- `feature`
- `properties` opcional

Interpretación:

- no necesariamente coincide con el sensor;
- representa aquello cuya propiedad está siendo observada.

## 5. Relación conceptual entre entidades

La relación más importante del estándar es:

- un `Thing` tiene uno o más `Datastreams`;
- cada `Datastream` se asocia a un solo `Sensor`;
- cada `Datastream` se asocia a una sola `ObservedProperty`;
- cada `Datastream` contiene muchas `Observations`;
- cada `Observation` se refiere a un `FeatureOfInterest`.

En paralelo:

- un `Thing` puede tener una o más `Locations`;
- `HistoricalLocation` registra cómo cambian esas ubicaciones con el tiempo.

## 6. Estructura general de la API

La API usa un `service root` versionado, por ejemplo:

```text
/v1.1
```

Sobre ese root se exponen colecciones de entidades:

```text
/v1.1/Things
/v1.1/Locations
/v1.1/HistoricalLocations
/v1.1/Datastreams
/v1.1/Sensors
/v1.1/ObservedProperties
/v1.1/Observations
/v1.1/FeaturesOfInterest
```

Patrones de ruta principales:

```text
GET /v1.1/{EntitySet}
GET /v1.1/{EntitySet}({id})
GET /v1.1/{EntitySet}({id})/{NavigationProperty}
POST /v1.1/{EntitySet}
PATCH /v1.1/{EntitySet}({id})
DELETE /v1.1/{EntitySet}({id})
```

## 7. Contratos de escritura

## 7.1. Crear una entidad

La creación estándar se hace con:

```http
POST /v1.1/{EntitySet}
Content-Type: application/json
```

El estándar soporta tres patrones:

- crear una entidad sola;
- crear una entidad enlazándola a entidades existentes mediante `@iot.id`;
- crear una entidad junto con entidades relacionadas en un mismo payload, conocido como `deep insert`.

### Ejemplo de creación simple de `Thing`

```json
{
  "name": "station-001",
  "description": "Weather station 001",
  "properties": {
    "vendor": "example"
  }
}
```

### Ejemplo de creación de `Observation` enlazada a un `Datastream`

```json
{
  "Datastream": {
    "@iot.id": 101
  },
  "phenomenonTime": "2026-07-08T15:30:00Z",
  "result": 22.4
}
```

Puntos clave:

- `result` debe ser compatible con el `observationType` del `Datastream`;
- `phenomenonTime` puede omitirse y el servidor puede asignar la hora actual;
- `resultTime` puede omitirse y el servidor puede dejarlo en `null`.

## 7.2. Actualizar una entidad

La actualización estándar se hace con:

```http
PATCH /v1.1/{EntitySet}({id})
Content-Type: application/json
```

Uso:

- modificar propiedades de un recurso ya existente;
- no se usa para insertar observaciones nuevas.

## 7.3. Borrar una entidad

La eliminación estándar se hace con:

```http
DELETE /v1.1/{EntitySet}({id})
```

Uso:

- eliminar recursos y sus relaciones según las reglas del servicio.

## 7.4. Escritura masiva

La especificación define mecanismos adicionales:

- `batch requests` para varias operaciones en una petición;
- `CreateObservations` con `dataArray` para insertar observaciones en lote;
- MQTT para publicación de observaciones en implementaciones que soporten la extensión.

### Ejemplo conceptual de `CreateObservations`

```json
[
  {
    "Datastream": {
      "@iot.id": 101
    },
    "components": [
      "phenomenonTime",
      "result"
    ],
    "dataArray": [
      ["2026-07-08T15:30:00Z", 22.4],
      ["2026-07-08T15:31:00Z", 22.5]
    ]
  }
]
```

## 8. Contratos de lectura

## 8.1. Leer colecciones

```http
GET /v1.1/Things
GET /v1.1/Datastreams
GET /v1.1/Observations
```

Las respuestas de colección se devuelven dentro de la propiedad `value`.

## 8.2. Leer una entidad puntual

```http
GET /v1.1/Things(1)
GET /v1.1/Datastreams(101)
GET /v1.1/Observations(999)
```

## 8.3. Navegar relaciones

```http
GET /v1.1/Things(1)/Datastreams
GET /v1.1/Datastreams(101)/Observations
GET /v1.1/Observations(999)/FeatureOfInterest
```

Este patrón de navegación es una parte central del estándar.

## 8.4. Query options

El estándar adopta opciones tipo OData para controlar lecturas:

- `$expand`
- `$select`
- `$filter`
- `$orderby`
- `$top`
- `$skip`
- `$count`

### Ejemplos

Expandir relaciones:

```http
GET /v1.1/Things?$expand=Locations,Datastreams
```

Ordenar y limitar:

```http
GET /v1.1/Datastreams(101)/Observations?$orderby=phenomenonTime desc&$top=10
```

Filtrar:

```http
GET /v1.1/Observations?$filter=result gt 50
```

Seleccionar propiedades:

```http
GET /v1.1/Things?$select=name,description
```

## 8.5. Paginación

Cuando la colección es grande, el servidor puede devolver resultados parciales y un `nextLink` para continuar.

Esto evita respuestas demasiado pesadas y forma parte del comportamiento estándar.

## 9. Tipos de observación y semántica del resultado

La propiedad `result` de una `Observation` no tiene un tipo único fijo. Su estructura depende del `observationType` definido en el `Datastream`.

Consecuencia:

- la interpretación del valor observado depende del contrato del `Datastream`;
- no se debe asumir que siempre será un número simple.

En muchos casos prácticos se usa:

- `OM_Measurement` para mediciones numéricas con unidad.

## 10. Extensiones relevantes

La especificación incluye extensiones importantes:

- `MultiDatastream`
- `DataArray`
- `Batch Requests`
- MQTT publish/subscribe

### `MultiDatastream`

Permite modelar varias propiedades observadas dentro de una misma estructura extendida.

### `DataArray`

Optimiza transferencia de múltiples observaciones en un formato más compacto.

### `Batch`

Permite ejecutar varias operaciones CRUD en una única petición.

### MQTT

Permite:

- publicar observaciones;
- suscribirse a cambios y notificaciones.

## 11. Principios de interoperabilidad del estándar

Los puntos fuertes del estándar son:

- modelo uniforme para sensores y observaciones;
- independencia frente a plataformas propietarias;
- soporte geoespacial nativo;
- trazabilidad temporal e histórica;
- navegación consistente entre entidades;
- contratos REST legibles y consultables por clientes web.

## 12. Resumen ejecutivo

OGC SensorThings API 1.1 es un estándar REST/JSON para interoperabilidad IoT con orientación geoespacial.

Su núcleo conceptual es:

- `Thing` representa el activo;
- `Location` representa la ubicación;
- `Sensor` describe el origen de la observación;
- `ObservedProperty` describe la variable observada;
- `Datastream` agrupa observaciones homogéneas;
- `Observation` representa la medición puntual;
- `FeatureOfInterest` representa el elemento del mundo real observado.

Desde el punto de vista operativo, el estándar define:

- rutas uniformes para CRUD;
- navegación por relaciones;
- filtros y expansiones tipo OData;
- mecanismos de publicación individual y masiva de observaciones.
