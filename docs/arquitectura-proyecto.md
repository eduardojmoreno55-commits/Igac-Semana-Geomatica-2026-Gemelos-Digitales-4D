# Arquitectura del proyecto

El proyecto está compuesto por servicios ejecutándose en Docker Compose y un
frontend web desarrollado por los participantes del taller. El frontend consulta
**directamente** a FROST-Server: no existe ninguna capa intermedia (gateway) entre
ambos.

```mermaid
flowchart LR
    subgraph HOST["Máquina anfitriona"]
        FRONT["Frontend del participante<br/>Aplicación web (ej. Vite localhost:5173)<br/>No incluido en Docker Compose"]
    end

    subgraph DOCKER["Docker Compose"]
        DB[("PostgreSQL + PostGIS<br/>Puerto 5432")]

        FROST["FROST-Server<br/>REST SensorThings API<br/>Puerto 8080"]
        MQTT["Broker MQTT de FROST<br/>TCP 1883<br/>WebSocket 9876/mqtt"]

        SIM["Simulador de buses<br/>Panel y API de estado<br/>Puerto 3003"]
    end

    DB -->|Persistencia| FROST

    SIM -->|REST: crea observaciones y mueve Locations| FROST
    FROST -->|Publica observaciones y ubicaciones| MQTT

    FRONT -->|REST: catálogo y estado inicial| FROST
    FRONT -->|MQTT sobre WebSocket: telemetría y posición| MQTT

    classDef frontend fill:#1976d2,color:#fff,stroke:#0d47a1
    classDef frost fill:#e65100,color:#fff,stroke:#bf360c
    classDef infra fill:#616161,color:#fff,stroke:#212121
    classDef simulator fill:#7b1fa2,color:#fff,stroke:#4a148c

    class FRONT frontend
    class FROST,MQTT frost
    class DB infra
    class SIM simulator
```

## Flujo de datos

1. El simulador de buses genera telemetría de los 4 buses eléctricos y la registra en FROST mediante REST: en cada ciclo publica observaciones de velocidad, batería y temperatura, y reasigna una `Location` nueva por bus.
2. FROST persiste los datos en PostgreSQL/PostGIS y publica los cambios en MQTT (observaciones y ubicaciones).
3. El frontend consume FROST **directamente**, sin intermediarios: REST para el catálogo y el estado inicial, y MQTT sobre WebSocket para lo continuo — telemetría (`Datastreams(<id>)/Observations`) y posición (colección `v1.1/Locations`).

## Puertos principales

| Servicio | Puerto | Uso |
|---|---:|---|
| Frontend | `5173` | Aplicación web del participante (ej. Vite); no está en Docker Compose |
| Simulador de buses | `3003` | Panel web y estado en `GET /api/status` |
| FROST REST | `8080` | API SensorThings `/FROST-Server/v1.1` |
| FROST MQTT | `1883` | MQTT TCP para servicios internos |
| FROST MQTT-WebSocket | `9876` | MQTT para navegadores en `/mqtt` |
| PostgreSQL/PostGIS | `5432` | Persistencia de FROST |

Las conexiones directas del navegador a FROST utilizan REST en el puerto `8080`
y MQTT sobre WebSocket en `ws://localhost:9876/mqtt`. El puerto MQTT TCP `1883`
se utiliza para las conexiones internas de Docker y no para el navegador.
