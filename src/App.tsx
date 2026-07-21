import React, { useState, useEffect, useRef } from 'react';
import { Header } from './components/Header';
import { BusesListPanel } from './components/BusesListPanel';
import { TelemetryPanel } from './components/TelemetryPanel';
import { Cesium3DView } from './components/Cesium3DView';
import { SettingsModal } from './components/SettingsModal';
import { FrostClient, getDefaultConfig } from './utils/frostClient';
import { VehicleState, ConnectionConfig, LogEntry } from './types/frost';

export function App() {
  const [config, setConfig] = useState<ConnectionConfig>(getDefaultConfig());
  const [vehiclesMap, setVehiclesMap] = useState<Map<number, VehicleState>>(new Map());
  const [connectionStatus, setConnectionStatus] = useState<{ rest: boolean; mqtt: boolean; error?: string }>({
    rest: false,
    mqtt: false,
  });
  const [selectedThingId, setSelectedThingId] = useState<number | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);

  const frostClientRef = useRef<FrostClient | null>(null);

  // Initialize FrostClient
  useEffect(() => {
    const client = new FrostClient(config, {
      onStateUpdate: (updatedMap) => {
        setVehiclesMap(new Map(updatedMap));
      },
      onConnectionChange: (status) => {
        setConnectionStatus(status);
      },
      onLogMessage: (log) => {
        const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        const newEntry: LogEntry = {
          id: Math.random().toString(36).substr(2, 9),
          timestamp: timeStr,
          busName: log.busName,
          type: log.type,
          value: log.value,
        };
        setLogs((prev) => [newEntry, ...prev.slice(0, 49)]);
      },
    });

    client.init();
    frostClientRef.current = client;

    return () => {
      client.disconnect();
    };
  }, [config]);

  // Convert vehicles map to array
  const vehiclesList = Array.from(vehiclesMap.values());

  // Auto select first bus if none selected
  useEffect(() => {
    if (vehiclesList.length > 0 && selectedThingId === null) {
      setSelectedThingId(vehiclesList[0].thingId);
    }
  }, [vehiclesList, selectedThingId]);

  const selectedBus = selectedThingId !== null ? vehiclesMap.get(selectedThingId) || null : null;

  const handleRefreshCatalog = () => {
    if (frostClientRef.current) {
      frostClientRef.current.init();
    }
  };

  const handleSaveConfig = (newConfig: ConnectionConfig) => {
    setConfig(newConfig);
  };

  return (
    <div className="app-container" id="gemelo-digital-app">
      <Header
        vehicles={vehiclesList}
        connectionStatus={connectionStatus}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onRefresh={handleRefreshCatalog}
      />

      <div className="dashboard-grid">
        {/* PANEL DE BUSES ACTIVOS CON ESCALA DE COLOR DE BATERÍA (VERDE A ROJO) */}
        <BusesListPanel
          vehicles={vehiclesList}
          selectedThingId={selectedThingId}
          onSelectBus={(thingId) => setSelectedThingId(thingId)}
          onFocusBus3D={(thingId) => setSelectedThingId(thingId)}
        />

        {/* CARTOGRAFÍA URBANA 3D CON CESIUM JS */}
        <Cesium3DView
          vehicles={vehiclesList}
          selectedThingId={selectedThingId}
          onSelectBus={(thingId) => setSelectedThingId(thingId)}
        />

        {/* PANEL DE VELOCIDAD Y TEMPERATURA Y TELEMETRÍA DETALLADA */}
        <TelemetryPanel
          selectedBus={selectedBus}
          logs={logs}
        />
      </div>

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        currentConfig={config}
        onSaveConfig={handleSaveConfig}
      />
    </div>
  );
}

export default App;
