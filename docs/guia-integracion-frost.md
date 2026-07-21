# Integración de FROST desde un navegador web

Esta guía describe cómo consultar buses eléctricos en FROST y recibir su telemetría y posición en tiempo real desde una aplicación web.

La implementación es independiente del framework y puede utilizarse con cualquier tecnología que se ejecute en un navegador.

## 1. Arquitectura

~~~text
Navegador
  ├─ HTTP/REST ──────────────► FROST-Server   (catálogo y estado inicial, una sola vez)
  └─ MQTT sobre WebSocket ──► FROST-Server   (telemetría y posición en tiempo real)
~~~

URLs del taller:

| Servicio | URL | Uso |
|---|---|---|
| REST de FROST | <code>http://localhost:8080/FROST-Server/v1.1</code> | Catálogo y estado inicial (una sola vez) |
| MQTT-WebSocket | <code>ws://localhost:9876/mqtt</code> | Telemetría **y posición** en tiempo real |

MQTT cubre toda la actualización continua. La telemetría (velocidad, batería, temperatura) llega por los topics de Observations de cada Datastream; la posición llega por el topic de **colección** `v1.1/Locations`, ya que el simulador mueve cada bus creando una `Location` nueva y reasignándola al `Thing` (ver Sección 8). REST solo se usa una vez, al arrancar.

Un navegador no puede utilizar directamente <code>mqtt://localhost:1883</code>, porque esa URL usa MQTT sobre TCP. Para JavaScript en el navegador se debe utilizar MQTT sobre WebSocket:

~~~text
ws://localhost:9876/mqtt
~~~

La ruta <code>/mqtt</code> forma parte de la URL y es obligatoria.

## 2. Flujo de implementación

~~~text
1. Consultar el catálogo de Datastreams mediante REST (incluye la posición inicial de cada bus).
2. Agrupar los Datastreams por bus.
3. Crear un índice datastreamId → bus.
4. Consultar la última observación de cada Datastream.
5. Conectar MQTT.js a FROST-WebSocket.
6. Suscribirse a los topics de Observations de cada Datastream y a la colección Locations.
7. Procesar las observaciones y los cambios de posición nuevos.
8. Actualizar la métrica, la posición o el estado del bus según el topic.
9. Reconectar si la conexión se pierde.
10. Cerrar la conexión al abandonar la aplicación.
~~~

## 3. Catálogo mediante REST

El catálogo se obtiene consultando los Datastreams con su Thing, ubicación y propiedad observada:

~~~http
GET http://localhost:8080/FROST-Server/v1.1/Datastreams?$select=@iot.id,name,unitOfMeasurement&$expand=Thing($select=@iot.id,name,properties;$expand=Locations($select=location)),ObservedProperty($select=name)&$top=200
~~~

Respuesta simplificada:

~~~json
{
  "value": [
    {
      "@iot.id": 44,
      "name": "bus-001-battery",
      "unitOfMeasurement": { "symbol": "%" },
      "ObservedProperty": { "name": "Nivel de batería" },
      "Thing": {
        "@iot.id": 15,
        "name": "Bus eléctrico 001 - Chapinero",
        "properties": {
          "type": "electric-bus",
          "busId": "bus-001"
        },
        "Locations": [
          {
            "location": {
              "type": "Point",
              "coordinates": [-74.0628, 4.6486, 0]
            }
          }
        ]
      }
    }
  ]
}
~~~

### Paginación

FROST puede devolver el enlace <code>@iot.nextLink</code>. El cliente debe continuar consultando hasta que no exista:

~~~js
let url = catalogUrl
const datastreams = []

while (url) {
  const response = await fetch(url)

  if (!response.ok) {
    throw new Error('FROST respondió ' + response.status)
  }

  const page = await response.json()
  datastreams.push(...(page.value || []))
  url = page['@iot.nextLink'] || null
}
~~~

### Ubicación

Las coordenadas GeoJSON de SensorThings utilizan el orden:

~~~text
[longitud, latitud, altura]
~~~

## 4. Contratos de datos

Los siguientes contratos son independientes del lenguaje o framework.

### Datastream

~~~ts
{
  datastreamId: number
  datastreamName: string
  observedProperty: string
  unitSymbol?: string
  thingId: number
}
~~~

### Vehicle

~~~ts
{
  thingId: number
  name: string
  type: string
  properties: Record<string, unknown>
  position?: {
    lat: number
    lon: number
    alt?: number
  }
  datastreams: Datastream[]
}
~~~

`position` llega inicialmente con el catálogo (Sección 3) y se actualiza en vivo por MQTT (Sección 8).

### Observation

~~~ts
{
  result: unknown
  phenomenonTime: string
}
~~~

### Metric y VehicleState

~~~ts
{
  datastreamId: number
  datastreamName: string
  observedProperty: string
  unitSymbol?: string
  value: unknown
  phenomenonTime: string
}

{
  thingId: number
  name: string
  type: string
  properties: Record<string, unknown>
  position?: Position
  metrics: Record<number, Metric>
  lastUpdated: string
}
~~~

## 5. Índice Datastream → bus

Los mensajes MQTT identifican el Datastream mediante el topic, pero no necesariamente contienen el nombre del bus, la ubicación o la unidad.

Después de cargar el catálogo, crear un índice:

~~~js
const byDatastream = new Map()

for (const bus of buses) {
  for (const datastream of bus.datastreams) {
    byDatastream.set(datastream.datastreamId, {
      bus,
      datastream,
    })
  }
}
~~~

## 6. Estado inicial mediante REST

Para obtener la última observación de un Datastream:

~~~http
GET http://localhost:8080/FROST-Server/v1.1/Datastreams(44)/Observations?$orderby=phenomenonTime%20desc&$top=1
~~~

Respuesta:

~~~json
{
  "value": [
    {
      "result": 68,
      "phenomenonTime": "2026-07-15T21:30:00Z"
    }
  ]
}
~~~

El cliente debe asociar el resultado con la metadata del Datastream y agregarlo a su bus.

## 7. MQTT.js en el navegador

MQTT.js es una librería JavaScript compatible con navegadores y conexiones MQTT sobre WebSocket.

Instálala con el gestor de paquetes de tu proyecto:

~~~bash
npm install mqtt
~~~

Conexión:

~~~js
import mqtt from 'mqtt'

const client = mqtt.connect('ws://localhost:9876/mqtt', {
  clientId: 'browser-client-' + crypto.randomUUID(),
  reconnectPeriod: 3000,
})
~~~

El <code>clientId</code> debe ser diferente para cada pestaña o cliente conectado.

## 8. Suscripción a topics

Hay que suscribirse a dos clases de topic. Ambos son **concretos** — FROST no entrega mensajes a comodines (`+`/`#`).

**Telemetría** — un topic por Datastream:

~~~text
v1.1/Datastreams(<datastreamId>)/Observations
~~~

**Posición** — el topic de **colección** de ubicaciones (uno solo para toda la flota):

~~~text
v1.1/Locations
~~~

> **Por qué la colección y no `Things(<id>)/Locations`.** El simulador mueve cada bus creando una `Location` nueva y reasignándola al `Thing`. Se podría pensar en suscribirse a `v1.1/Things(<thingId>)/Locations` (una por bus), pero ese sub-topic es **poco confiable bajo carga**: con varios buses moviéndose casi a la vez, FROST entrega solo una fracción de esos mensajes (medido: ~14%). El topic de colección `v1.1/Locations`, en cambio, entrega el 100% de las creaciones de Location de forma confiable, y su payload es la entidad `Location` completa con las coordenadas. (Nota de infraestructura: además conviene subir `mqtt.SubscribeMessageQueueSize` en FROST — ver `docker-compose.yaml` — para que la cola de notificaciones no descarte eventos en las ráfagas de cada tick.)

Suscripción:

~~~js
client.on('connect', () => {
  for (const bus of buses) {
    for (const datastream of bus.datastreams) {
      client.subscribe('v1.1/Datastreams(' + datastream.datastreamId + ')/Observations')
    }
  }
  client.subscribe('v1.1/Locations')
})
~~~

No se deben asumir IDs fijos, porque FROST puede asignar IDs diferentes al utilizar otra base de datos.

## 9. Procesamiento de mensajes

Los dos tipos de topic traen payloads distintos:

**Observations** — payload "pelado", solo el resultado y su instante:

~~~json
{
  "result": 63.8,
  "phenomenonTime": "2026-07-15T21:30:00Z"
}
~~~

**Locations** (colección) — payload completo, la entidad `Location` entera. No incluye a qué `Thing` pertenece, pero el `name` embebe el nombre del bus (el simulador la nombra `"<nombre del Thing> - ubicacion"`), de donde se deriva el bus:

~~~json
{
  "@iot.id": 3944,
  "name": "Bus eléctrico 001 - Chapinero - ubicacion",
  "description": "Ubicacion en vivo de Bus eléctrico 001 - Chapinero",
  "encodingType": "application/geo+json",
  "location": {
    "type": "Point",
    "coordinates": [-74.065167, 4.649652, 0]
  }
}
~~~

Antes de conectar, construir un índice nombre-de-Location → bus a partir del catálogo:

~~~js
const busByLocationName = new Map()
for (const bus of buses) {
  busByLocationName.set(bus.name + ' - ubicacion', bus)
}
~~~

El handler distingue el topic antes de decidir qué actualizar:

~~~js
client.on('message', (topic, payload) => {
  const observationMatch = topic.match(/Datastreams\((\d+)\)\/Observations$/)
  if (observationMatch) {
    handleObservation(Number(observationMatch[1]), payload)
    return
  }

  if (topic === 'v1.1/Locations') {
    handleLocation(payload)
  }
})

function handleObservation(datastreamId, payload) {
  const context = byDatastream.get(datastreamId)
  if (!context) return

  let observation
  try {
    observation = JSON.parse(payload.toString())
  } catch {
    console.warn('Payload MQTT inválido en Observations')
    return
  }

  const previous = stateByVehicle.get(context.bus.thingId)
  const next = {
    ...previous,
    metrics: { ...previous.metrics },
  }

  next.metrics[datastreamId] = {
    datastreamId,
    datastreamName: context.datastream.datastreamName,
    observedProperty: context.datastream.observedProperty,
    unitSymbol: context.datastream.unitSymbol,
    value: observation.result,
    phenomenonTime: observation.phenomenonTime,
  }

  next.lastUpdated = observation.phenomenonTime
  stateByVehicle.set(next.thingId, next)
  render(next)
}

function handleLocation(payload) {
  let message
  try {
    message = JSON.parse(payload.toString())
  } catch {
    console.warn('Payload MQTT inválido en Locations')
    return
  }

  const bus = busByLocationName.get(message.name)
  if (!bus) return // Location de otra fuente, no de nuestros buses

  const [lon, lat, alt] = message.location.coordinates
  const previous = stateByVehicle.get(bus.thingId)
  const next = { ...previous, position: { lon, lat, alt } }
  stateByVehicle.set(bus.thingId, next)
  render(next)
}
~~~

La copia de <code>metrics</code> en <code>handleObservation</code> es importante: una observación de velocidad no debe eliminar el nivel de batería ni la temperatura de batería del mismo bus. `handleLocation` en cambio reemplaza `position` por completo — es un único punto, no un mapa de métricas.

## 10. Eventos y ciclo de vida

~~~js
client.on('connect', () => console.log('Conectado a FROST MQTT'))
client.on('reconnect', () => console.log('Reconectando a FROST MQTT'))
client.on('close', () => console.log('Conexión MQTT cerrada'))
client.on('error', (error) => console.error('Error MQTT', error))
~~~

Cuando la aplicación se cierre o el componente que administra la conexión sea destruido:

~~~js
client.end(true)
~~~

MQTT.js puede volver a conectarse automáticamente con <code>reconnectPeriod</code> mayor que cero. Las suscripciones deben ser idempotentes para no registrarlas varias veces.

## 11. CORS y seguridad del navegador

FROST debe permitir el origen desde el cual se sirve la aplicación web:

~~~yaml
- http_cors_enable=true
- http_cors_allowed_origins=*
~~~

Para producción es preferible reemplazar <code>*</code> por el origen concreto de la aplicación.

Si la aplicación se sirve mediante HTTPS, MQTT debe utilizar WebSocket seguro:

~~~text
wss://dominio-frost/mqtt
~~~

Un navegador bloqueará una conexión <code>ws://</code> desde una página <code>https://</code> por contenido mixto.

Las credenciales incluidas en código JavaScript son visibles para el usuario. No se deben incluir secretos administrativos en una aplicación web pública.

## 12. Fiabilidad de las notificaciones MQTT en FROST

FROST encola internamente los eventos de cambio de entidad antes de publicarlos por MQTT. Con la configuración por defecto (`mqtt.SubscribeMessageQueueSize=10`), una ráfaga de cambios simultáneos (varios buses publicando posición + telemetría en el mismo instante) puede desbordar la cola, y FROST **descarta** los eventos sobrantes, registrando en su log:

~~~text
WARN MqttManager - EntityChangedevent discarded because message queue is full 10!
Increase mqtt.SubscribeMessageQueueSize and/or mqtt.SubscribeThreadPoolSize.
~~~

Por eso el `docker-compose.yaml` del taller sube esos valores:

~~~yaml
- mqtt_SubscribeMessageQueueSize=2000
- mqtt_SubscribeThreadPoolSize=20
~~~

Con esto desaparecen los descartes. Aun así, la elección del topic importa (Sección 8): el topic de colección `v1.1/Locations` es confiable incluso con la cola por defecto, mientras que el sub-topic por Thing `Things(<id>)/Locations` no lo es.

## 13. Pruebas

Verificar que FROST esté ejecutándose:

~~~bash
docker compose ps
~~~

Verificar REST:

~~~bash
curl 'http://localhost:8080/FROST-Server/v1.1/Datastreams?$top=2'
~~~

Verificar MQTT-WebSocket:

~~~bash
nc -vz localhost 9876
~~~

Verificar que el simulador de buses esté publicando telemetría automáticamente:

~~~bash
curl http://localhost:3003/api/status
~~~

El ciclo circuito→recarga de `bus-simulator` es automático: no existe un endpoint para activar telemetría manualmente. Basta con confirmar que los 4 buses aparecen con fase y progreso avanzando entre consultas sucesivas.

Verificar que la posición llega por MQTT en la colección `v1.1/Locations`, desde la consola del navegador con MQTT.js ya cargado en la página:

~~~js
const probe = mqtt.connect('ws://localhost:9876/mqtt', { clientId: 'probe-' + Date.now() })
probe.on('connect', () => probe.subscribe('v1.1/Locations'))
probe.on('message', (topic, payload) => console.log(topic, payload.toString()))
~~~

Debe imprimir un mensaje con la entidad `Location` completa por cada bus cada vez que se mueven (cada `BASE_TICK_MS`, 6 s por defecto → ~4 mensajes cada 6 s con 4 buses).

La validación completa debe confirmar:

- El catálogo REST se carga, incluida la posición inicial de cada bus.
- Se construye el índice de Datastreams.
- La última observación aparece en el estado inicial.
- MQTT.js conecta a <code>/mqtt</code>.
- Los topics de Datastreams reciben observaciones.
- La colección `v1.1/Locations` recibe los cambios de posición.
- Las métricas se actualizan sin perder valores anteriores.
- La reconexión vuelve a recibir datos.

## 14. Referencias

- [Documentación de FROST-Server](https://fraunhoferiosb.github.io/FROST-Server/)
- [Configuración (settings) de FROST-Server](https://fraunhoferiosb.github.io/FROST-Server/settings/settings.html)
- [Uso de MQTT desde JavaScript en FROST](https://fraunhoferiosb.github.io/FROST-Server/sensorthingsapi/requestingData/STA-mqtt-javascript.html)
- [MQTT.js](https://github.com/mqttjs/MQTT.js/)
