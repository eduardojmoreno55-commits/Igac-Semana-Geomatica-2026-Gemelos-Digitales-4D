import mqtt, { MqttClient } from 'mqtt';
import { Vehicle, Datastream, VehicleState, Metric, Position, ConnectionConfig } from '../types/frost';

export function getDefaultConfig(): ConnectionConfig {
  const isBrowser = typeof window !== 'undefined';
  const hostname = isBrowser ? window.location.hostname : 'localhost';

  if (hostname.includes('.app.github.dev')) {
    // We are running inside GitHub Codespaces forwarded domains
    const restHost = hostname.replace(/-\d+\.app\.github\.dev/, '-8080.app.github.dev');
    const wsHost = hostname.replace(/-\d+\.app\.github\.dev/, '-9876.app.github.dev');
    return {
      restUrl: `https://${restHost}/FROST-Server/v1.1`,
      wsUrl: `wss://${wsHost}/mqtt`,
    };
  }

  return {
    restUrl: 'http://localhost:8080/FROST-Server/v1.1',
    wsUrl: 'ws://localhost:9876/mqtt',
  };
}

export interface FrostClientCallbacks {
  onStateUpdate: (vehicles: Map<number, VehicleState>) => void;
  onConnectionChange: (status: { rest: boolean; mqtt: boolean; error?: string }) => void;
  onLogMessage?: (log: { busName: string; type: 'battery' | 'speed' | 'temperature' | 'location'; value: string }) => void;
}

export class FrostClient {
  private config: ConnectionConfig;
  private callbacks: FrostClientCallbacks;
  private mqttClient: MqttClient | null = null;
  private vehicles: Map<number, VehicleState> = new Map();
  private byDatastream: Map<number, { bus: VehicleState; datastream: Datastream }> = new Map();
  private busByLocationName: Map<string, VehicleState> = new Map();
  private isConnectedREST = false;
  private isConnectedMQTT = false;

  constructor(config: ConnectionConfig, callbacks: FrostClientCallbacks) {
    this.config = config;
    this.callbacks = callbacks;
  }

  public updateConfig(newConfig: ConnectionConfig) {
    this.config = newConfig;
    this.disconnect();
    this.init();
  }

  public async init() {
    try {
      this.callbacks.onConnectionChange({ rest: false, mqtt: false });
      
      // 1. Fetch catalog via REST
      const rawDatastreams = await this.fetchCatalog();
      this.isConnectedREST = true;

      // 2. Group into Vehicles
      const vehicleMap = new Map<number, VehicleState>();
      this.byDatastream.clear();
      this.busByLocationName.clear();

      for (const ds of rawDatastreams) {
        const thing = ds.Thing;
        if (!thing) continue;

        const thingId = thing['@iot.id'];
        let busState = vehicleMap.get(thingId);

        if (!busState) {
          let pos: Position | undefined;
          if (thing.Locations && thing.Locations.length > 0 && thing.Locations[0].location) {
            const coords = thing.Locations[0].location.coordinates;
            if (coords && coords.length >= 2) {
              pos = { lon: coords[0], lat: coords[1], alt: coords[2] || 0 };
            }
          }

          busState = {
            thingId,
            name: thing.name || `Bus ${thingId}`,
            type: thing.properties?.type || 'electric-bus',
            properties: thing.properties || {},
            position: pos,
            metrics: {},
            lastUpdated: new Date().toISOString(),
          };
          vehicleMap.set(thingId, busState);
          this.busByLocationName.set(busState.name + ' - ubicacion', busState);
        }

        const datastreamObj: Datastream = {
          datastreamId: ds['@iot.id'],
          datastreamName: ds.name || '',
          observedProperty: ds.ObservedProperty?.name || '',
          unitSymbol: ds.unitOfMeasurement?.symbol || '',
          thingId,
        };

        this.byDatastream.set(datastreamObj.datastreamId, {
          bus: busState,
          datastream: datastreamObj,
        });
      }

      this.vehicles = vehicleMap;

      // 3. Fetch latest initial observation for each datastream
      await this.fetchInitialObservations();

      this.callbacks.onConnectionChange({ rest: true, mqtt: false });
      this.callbacks.onStateUpdate(new Map(this.vehicles));

      // 4. Connect MQTT WebSocket
      this.connectMQTT();
    } catch (err: any) {
      console.error('FROST Client initialization error:', err);
      this.callbacks.onConnectionChange({
        rest: this.isConnectedREST,
        mqtt: false,
        error: err.message || 'Error conectando con servidor FROST',
      });
    }
  }

  private async fetchCatalog(): Promise<any[]> {
    let url: string | null = `${this.config.restUrl}/Datastreams?$select=@iot.id,name,unitOfMeasurement&$expand=Thing($select=@iot.id,name,properties;$expand=Locations($select=location)),ObservedProperty($select=name)&$top=200`;
    const datastreams: any[] = [];

    while (url) {
      const response: Response = await fetch(url, {
        headers: { 'Accept': 'application/json' },
      });

      if (!response.ok) {
        throw new Error(`FROST REST Error HTTP ${response.status}: ${response.statusText}`);
      }

      const data: any = await response.json();
      if (data.value && Array.isArray(data.value)) {
        datastreams.push(...data.value);
      }
      url = data['@iot.nextLink'] || null;
    }

    return datastreams;
  }

  private async fetchInitialObservations() {
    const promises: Promise<void>[] = [];

    for (const [dsId, context] of this.byDatastream.entries()) {
      const obsUrl = `${this.config.restUrl}/Datastreams(${dsId})/Observations?$orderby=phenomenonTime%20desc&$top=1`;
      const p = fetch(obsUrl)
        .then(res => res.ok ? res.json() : null)
        .then(data => {
          if (data && data.value && data.value.length > 0) {
            const obs = data.value[0];
            const busState = this.vehicles.get(context.bus.thingId);
            if (busState) {
              busState.metrics[dsId] = {
                datastreamId: dsId,
                datastreamName: context.datastream.datastreamName,
                observedProperty: context.datastream.observedProperty,
                unitSymbol: context.datastream.unitSymbol,
                value: obs.result,
                phenomenonTime: obs.phenomenonTime,
              };
              busState.lastUpdated = obs.phenomenonTime;
            }
          }
        })
        .catch(err => console.warn(`Error al obtener observación inicial para Datastream ${dsId}:`, err));

      promises.push(p);
    }

    await Promise.all(promises);
  }

  private connectMQTT() {
    if (this.mqttClient) {
      this.mqttClient.end(true);
    }

    const clientId = 'browser-bus-dashboard-' + Math.random().toString(36).substring(2, 9);
    console.log(`Conectando a MQTT WebSocket: ${this.config.wsUrl} con clientId: ${clientId}`);

    try {
      this.mqttClient = mqtt.connect(this.config.wsUrl, {
        clientId,
        reconnectPeriod: 3000,
        connectTimeout: 10000,
      });

      this.mqttClient.on('connect', () => {
        console.log('Conectado exitosamente a FROST MQTT-WebSocket!');
        this.isConnectedMQTT = true;
        this.callbacks.onConnectionChange({ rest: true, mqtt: true });

        // Subscribe to Datastreams Observations
        for (const dsId of this.byDatastream.keys()) {
          this.mqttClient?.subscribe(`v1.1/Datastreams(${dsId})/Observations`);
        }

        // Subscribe to Locations collection
        this.mqttClient?.subscribe('v1.1/Locations');
      });

      this.mqttClient.on('message', (topic, payload) => {
        this.handleMqttMessage(topic, payload);
      });

      this.mqttClient.on('error', (err) => {
        console.error('Error en conexión MQTT WebSocket:', err);
        this.isConnectedMQTT = false;
        this.callbacks.onConnectionChange({ rest: this.isConnectedREST, mqtt: false, error: err.message });
      });

      this.mqttClient.on('close', () => {
        this.isConnectedMQTT = false;
        this.callbacks.onConnectionChange({ rest: this.isConnectedREST, mqtt: false });
      });
    } catch (err: any) {
      console.error('Error al instanciar cliente MQTT:', err);
    }
  }

  private handleMqttMessage(topic: string, payload: Buffer) {
    // 1. Check if Observation topic
    const obsMatch = topic.match(/Datastreams\((\d+)\)\/Observations$/);
    if (obsMatch) {
      const datastreamId = Number(obsMatch[1]);
      const context = this.byDatastream.get(datastreamId);
      if (!context) return;

      try {
        const obs = JSON.parse(payload.toString());
        const busState = this.vehicles.get(context.bus.thingId);
        if (!busState) return;

        const updatedMetrics = { ...busState.metrics };
        updatedMetrics[datastreamId] = {
          datastreamId,
          datastreamName: context.datastream.datastreamName,
          observedProperty: context.datastream.observedProperty,
          unitSymbol: context.datastream.unitSymbol,
          value: obs.result,
          phenomenonTime: obs.phenomenonTime,
        };

        const nextBusState: VehicleState = {
          ...busState,
          metrics: updatedMetrics,
          lastUpdated: obs.phenomenonTime || new Date().toISOString(),
        };

        this.vehicles.set(nextBusState.thingId, nextBusState);

        // Logging callback
        if (this.callbacks.onLogMessage) {
          let type: 'battery' | 'speed' | 'temperature' = 'battery';
          const propName = context.datastream.observedProperty.toLowerCase();
          if (propName.includes('velocidad') || propName.includes('speed')) type = 'speed';
          else if (propName.includes('temperatura') || propName.includes('temp')) type = 'temperature';
          
          this.callbacks.onLogMessage({
            busName: nextBusState.name,
            type,
            value: `${obs.result} ${context.datastream.unitSymbol || ''}`,
          });
        }

        this.callbacks.onStateUpdate(new Map(this.vehicles));
      } catch (e) {
        console.warn('Payload MQTT Observation inválido:', e);
      }
      return;
    }

    // 2. Check if Locations collection topic
    if (topic === 'v1.1/Locations') {
      try {
        const locMsg = JSON.parse(payload.toString());
        const busState = this.busByLocationName.get(locMsg.name);
        if (!busState) return;

        if (locMsg.location && locMsg.location.coordinates && locMsg.location.coordinates.length >= 2) {
          const [lon, lat, alt] = locMsg.location.coordinates;
          const nextBusState: VehicleState = {
            ...busState,
            position: { lon, lat, alt: alt || 0 },
            lastUpdated: new Date().toISOString(),
          };

          this.vehicles.set(nextBusState.thingId, nextBusState);

          if (this.callbacks.onLogMessage) {
            this.callbacks.onLogMessage({
              busName: nextBusState.name,
              type: 'location',
              value: `${lat.toFixed(5)}, ${lon.toFixed(5)}`,
            });
          }

          this.callbacks.onStateUpdate(new Map(this.vehicles));
        }
      } catch (e) {
        console.warn('Payload MQTT Locations inválido:', e);
      }
    }
  }

  public disconnect() {
    if (this.mqttClient) {
      this.mqttClient.end(true);
      this.mqttClient = null;
    }
    this.isConnectedMQTT = false;
    this.isConnectedREST = false;
  }
}
