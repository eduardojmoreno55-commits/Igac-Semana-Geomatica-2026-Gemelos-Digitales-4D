# CesiumJS: un modelo 3D que se mueve y se orienta

Guía breve y genérica para mostrar un objeto 3D en CesiumJS, moverlo suavemente cuando llegan coordenadas nuevas y hacer que apunte en el sentido de su desplazamiento.

Es agnóstica de dónde vienen los datos: solo asume que **cada cierto tiempo llega una coordenada nueva `[lon, lat]`** de tu activo (por REST, MQTT, WebSocket, lo que sea; para el caso del taller ver `guia-integracion-frost.md`).

## 1. El modelo 3D

CesiumJS carga modelos en formato glTF binario (`.glb`). En este repo está el modelo de una van Volkswagen:

~~~text
assets/VW_T1_Panel_Van_Low_Poly.glb
~~~

Solo necesitas que ese `.glb` sea accesible por una URL desde el navegador (servirlo como archivo estático).

## 2. Mostrar el modelo en el mapa

Un modelo en Cesium es una **Entity** con la propiedad `model`:

~~~js
import * as Cesium from 'cesium'

Cesium.Ion.defaultAccessToken = 'TU_TOKEN_DE_CESIUM_ION'

const viewer = new Cesium.Viewer('cesiumContainer', {
  terrain: await Cesium.Terrain.fromWorldTerrain(),
})

const entity = viewer.entities.add({
  position: Cesium.Cartesian3.fromDegrees(-74.0628, 4.6486, 0),
  model: {
    uri: '/assets/VW_T1_Panel_Van_Low_Poly.glb',
    minimumPixelSize: 48,                                 // se ve aunque la cámara esté lejos
    heightReference: Cesium.HeightReference.CLAMP_TO_GROUND, // lo pega al terreno
  },
})
~~~

Dos ajustes clave:

- **`minimumPixelSize`**: sin esto, el modelo real (unos metros) desaparece al alejar la cámara.
- **`heightReference: CLAMP_TO_GROUND`**: si tu coordenada trae altura `0` (sobre el elipsoide) pero el terreno está a cientos o miles de metros, el modelo queda **enterrado**. Pegarlo al terreno lo resuelve sin necesidad de conocer la altura real.

## 3. Moverlo de forma fluida (no a saltos)

El error típico es **reemplazar** la posición en cada dato nuevo: el modelo "teletransporta" a saltos.

La forma correcta es una **`SampledPositionProperty`**: le vas agregando muestras `(tiempo, coordenada)` y Cesium **interpola** el camino intermedio mientras avanza el reloj del visor.

~~~js
const sampled = new Cesium.SampledPositionProperty()
sampled.setInterpolationOptions({ interpolationDegree: 1 }) // interpolación lineal
sampled.forwardExtrapolationType = Cesium.ExtrapolationType.HOLD  // si falta un dato, se queda quieto
sampled.backwardExtrapolationType = Cesium.ExtrapolationType.HOLD

// La entity usa esta propiedad como posición:
const entity = viewer.entities.add({ position: sampled, model: { /* ... */ } })

// ¡Importante! sin esto el reloj no avanza y nada interpola:
viewer.clock.shouldAnimate = true
~~~

### El detalle no obvio: adelantar cada muestra en el tiempo

El reloj del visor corre en tiempo real. Si etiquetas cada muestra con "ahora", el reloj casi siempre queda **por delante** de tu última muestra, cae en la zona de extrapolación `HOLD` (velocidad cero) y **no interpola** → se ve congelado o a saltos.

La solución: etiquetar cada muestra **unos segundos en el futuro**, para que "ahora" siempre caiga *entre* dos muestras reales. Ese adelanto debe ser **mayor o igual al intervalo entre datos** (si te llega una coordenada cada 6 s, usa ~7 s). El costo es mostrar la posición con ese pequeño retraso fijo — imperceptible para un vehículo urbano.

~~~js
const ADELANTO_S = 7 // >= intervalo entre coordenadas

function tiempoDeMuestra() {
  return Cesium.JulianDate.addSeconds(Cesium.JulianDate.now(), ADELANTO_S, new Cesium.JulianDate())
}
~~~

## 4. Orientarlo en el sentido del movimiento

Una vez que la posición es una `SampledPositionProperty`, orientar el modelo hacia donde avanza **sale gratis** con `VelocityOrientationProperty`: calcula el rumbo a partir de la derivada de la posición (hacia dónde se mueve).

~~~js
const entity = viewer.entities.add({
  position: sampled,
  orientation: new Cesium.VelocityOrientationProperty(sampled), // ← mira hacia el movimiento
  model: { uri: '/assets/VW_T1_Panel_Van_Low_Poly.glb', minimumPixelSize: 48 },
})
~~~

> Si tu modelo aparece de perfil o de espaldas al avanzar, es que su "frente" no está sobre el eje que Cesium asume (+X). No es un error de rumbo: es la convención de ejes del `.glb`. Se corrige componiendo un quaternion de giro fijo (p. ej. 90° o 180° en heading) sobre la orientación; ajusta el ángulo una vez, mirando el resultado.

## 5. Ejemplo completo mínimo

~~~js
import * as Cesium from 'cesium'

Cesium.Ion.defaultAccessToken = 'TU_TOKEN'

const viewer = new Cesium.Viewer('cesiumContainer', {
  terrain: await Cesium.Terrain.fromWorldTerrain(),
})
viewer.clock.shouldAnimate = true

const ADELANTO_S = 7

// 1) Posición interpolable
const sampled = new Cesium.SampledPositionProperty()
sampled.setInterpolationOptions({ interpolationDegree: 1 })
sampled.forwardExtrapolationType = Cesium.ExtrapolationType.HOLD
sampled.backwardExtrapolationType = Cesium.ExtrapolationType.HOLD

// 2) Entity: modelo + orientación por velocidad
viewer.entities.add({
  position: sampled,
  orientation: new Cesium.VelocityOrientationProperty(sampled),
  model: {
    uri: '/assets/VW_T1_Panel_Van_Low_Poly.glb',
    minimumPixelSize: 48,
    heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
  },
})

// 3) Llama a esto cada vez que llega una coordenada nueva:
function actualizarPosicion(lon, lat, alt = 0) {
  const cuando = Cesium.JulianDate.addSeconds(Cesium.JulianDate.now(), ADELANTO_S, new Cesium.JulianDate())
  sampled.addSample(cuando, Cesium.Cartesian3.fromDegrees(lon, lat, alt))
}
~~~

### Errores comunes

- **El modelo no aparece / está bajo tierra** → falta `heightReference: CLAMP_TO_GROUND` (o la altura no coincide con el terreno).
- **Se mueve a saltos** → estás reemplazando la posición en vez de usar `SampledPositionProperty` + `addSample`.
- **No se mueve nada** → falta `viewer.clock.shouldAnimate = true`, o etiquetaste las muestras con "ahora" sin el adelanto (Sección 3).
- **Avanza pero mira hacia el lado equivocado** → offset de ejes del `.glb` (Sección 4).
- **Desaparece al alejar la cámara** → falta `minimumPixelSize`.

## Referencias

- [CesiumJS — SampledPositionProperty](https://cesium.com/learn/cesiumjs/ref-doc/SampledPositionProperty.html)
- [CesiumJS — VelocityOrientationProperty](https://cesium.com/learn/cesiumjs/ref-doc/VelocityOrientationProperty.html)
- [CesiumJS — ModelGraphics](https://cesium.com/learn/cesiumjs/ref-doc/ModelGraphics.html)
