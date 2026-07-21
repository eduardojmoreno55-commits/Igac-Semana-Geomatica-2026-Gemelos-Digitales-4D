export interface Datastream {
  datastreamId: number;
  datastreamName: string;
  observedProperty: string;
  unitSymbol?: string;
  thingId: number;
}

export interface Position {
  lat: number;
  lon: number;
  alt?: number;
}

export interface Vehicle {
  thingId: number;
  name: string;
  type: string;
  properties: {
    busId?: string;
    circuitId?: string;
    type?: string;
    [key: string]: any;
  };
  position?: Position;
  datastreams: Datastream[];
}

export interface Metric {
  datastreamId: number;
  datastreamName: string;
  observedProperty: string;
  unitSymbol?: string;
  value: number | string;
  phenomenonTime: string;
}

export interface VehicleState {
  thingId: number;
  name: string;
  type: string;
  properties: Record<string, any>;
  position?: Position;
  metrics: Record<number, Metric>;
  lastUpdated?: string;
}

export interface TelemetryHistoryPoint {
  timestamp: string;
  speed: number;
  battery: number;
  temperature: number;
}

export interface ConnectionConfig {
  restUrl: string;
  wsUrl: string;
}

export interface LogEntry {
  id: string;
  timestamp: string;
  busName: string;
  type: 'battery' | 'speed' | 'temperature' | 'location';
  value: string;
}
