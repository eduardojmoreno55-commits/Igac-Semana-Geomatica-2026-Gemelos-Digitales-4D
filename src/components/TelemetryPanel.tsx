import React, { useState, useEffect } from 'react';
import { Gauge, Thermometer, Zap, Activity, Clock, ShieldCheck, TrendingUp, AlertTriangle } from 'lucide-react';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { VehicleState, LogEntry } from '../types/frost';
import { getBatteryColor, getTemperatureColor, getSpeedColor } from '../utils/colorUtils';

interface TelemetryPanelProps {
  selectedBus: VehicleState | null;
  logs: LogEntry[];
}

export const TelemetryPanel: React.FC<TelemetryPanelProps> = ({
  selectedBus,
  logs,
}) => {
  const [history, setHistory] = useState<Array<{ time: string; speed: number; battery: number; temp: number }>>([]);

  // Extract metrics from selected bus
  let speed = 0;
  let battery = 100;
  let temp = 0;

  if (selectedBus) {
    Object.values(selectedBus.metrics).forEach((m) => {
      const name = m.observedProperty.toLowerCase();
      const val = Number(m.value) || 0;
      if (name.includes('bateria') || name.includes('battery')) {
        if (!name.includes('temperatura') && !name.includes('temperature')) {
          battery = val;
        }
      }
      if (name.includes('velocidad') || name.includes('speed')) {
        speed = val;
      }
      if (name.includes('temperatura') || name.includes('temp')) {
        temp = val;
      }
    });
  }

  // Update history timeline when metrics update
  useEffect(() => {
    if (!selectedBus) return;

    const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    setHistory((prev) => {
      const next = [...prev, { time: timeStr, speed, battery, temp }];
      if (next.length > 20) return next.slice(next.length - 20);
      return next;
    });
  }, [speed, battery, temp, selectedBus?.thingId]);

  if (!selectedBus) {
    return (
      <aside className="panel-container telemetry-panel empty" id="telemetry-panel">
        <div className="panel-header">
          <div className="panel-title-wrapper">
            <Activity className="panel-title-icon text-cyan-400" />
            <h2 className="panel-title">Telemetría Avanzada</h2>
          </div>
        </div>
        <div className="empty-telemetry">
          <Gauge className="w-12 h-12 opacity-30 mb-3 text-cyan-400" />
          <p className="text-gray-400">Selecciona un bus del panel o en el mapa 3D para inspeccionar velocidad y temperatura en tiempo real.</p>
        </div>
      </aside>
    );
  }

  const speedColor = getSpeedColor(speed);
  const tempColor = getTemperatureColor(temp);
  const batteryColor = getBatteryColor(battery);

  // Speed Percentage for gauge (0 to 80 km/h)
  const speedGaugePct = Math.min(100, (speed / 80) * 100);
  // Temp Percentage for gauge (0 to 80 °C)
  const tempGaugePct = Math.min(100, (temp / 80) * 100);

  return (
    <aside className="panel-container telemetry-panel" id="telemetry-panel">
      <div className="panel-header">
        <div className="panel-title-wrapper">
          <Activity className="panel-title-icon text-cyan-400" />
          <h2 className="panel-title">Telemetría — {selectedBus.name}</h2>
        </div>
        <span className="bus-id-tag">ID #{selectedBus.thingId}</span>
      </div>

      <div className="telemetry-scroll-content">
        {/* VELOCIDAD & TEMPERATURA GAUGES */}
        <div className="gauges-grid">
          {/* SPEED GAUGE */}
          <div className="gauge-card speed-card">
            <div className="gauge-header">
              <Gauge className="w-4 h-4 text-cyan-400" />
              <span>Velocidad</span>
            </div>

            <div className="gauge-body">
              <div className="circular-gauge-container">
                <svg viewBox="0 0 100 100" className="gauge-svg">
                  <circle
                    cx="50"
                    cy="50"
                    r="40"
                    className="gauge-bg-circle"
                  />
                  <circle
                    cx="50"
                    cy="50"
                    r="40"
                    className="gauge-fill-circle"
                    style={{
                      stroke: speedColor,
                      strokeDasharray: `${(speedGaugePct * 251) / 100} 251`,
                    }}
                  />
                </svg>
                <div className="gauge-center-content">
                  <span className="gauge-value" style={{ color: speedColor }}>
                    {speed.toFixed(1)}
                  </span>
                  <span className="gauge-unit">km/h</span>
                </div>
              </div>
            </div>

            <div className="gauge-footer">
              <span className="gauge-status">Límite urbano: 50 km/h</span>
            </div>
          </div>

          {/* TEMPERATURE GAUGE */}
          <div className="gauge-card temp-card">
            <div className="gauge-header">
              <Thermometer className="w-4 h-4 text-amber-400" />
              <span>Temperatura Batería</span>
            </div>

            <div className="gauge-body">
              <div className="circular-gauge-container">
                <svg viewBox="0 0 100 100" className="gauge-svg">
                  <circle
                    cx="50"
                    cy="50"
                    r="40"
                    className="gauge-bg-circle"
                  />
                  <circle
                    cx="50"
                    cy="50"
                    r="40"
                    className="gauge-fill-circle"
                    style={{
                      stroke: tempColor,
                      strokeDasharray: `${(tempGaugePct * 251) / 100} 251`,
                    }}
                  />
                </svg>
                <div className="gauge-center-content">
                  <span className="gauge-value" style={{ color: tempColor }}>
                    {temp > 0 ? temp.toFixed(1) : '24.0'}
                  </span>
                  <span className="gauge-unit">°C</span>
                </div>
              </div>
            </div>

            <div className="gauge-footer">
              <span className="gauge-status">
                {temp > 50 ? (
                  <span className="text-red-400 font-medium">⚠️ Alta Temperatura</span>
                ) : (
                  <span className="text-emerald-400">Rango Seguro (&lt; 45°C)</span>
                )}
              </span>
            </div>
          </div>
        </div>

        {/* BATTERY LEVEL QUICK CARD */}
        <div className="battery-telemetry-card">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4" style={{ color: batteryColor }} />
              <span className="text-sm font-semibold text-gray-200">Estado de Carga (SoC)</span>
            </div>
            <span className="text-base font-bold" style={{ color: batteryColor }}>
              {battery.toFixed(1)}%
            </span>
          </div>
          <div className="battery-bar-track lg">
            <div
              className="battery-bar-fill"
              style={{
                width: `${battery}%`,
                background: batteryColor,
              }}
            ></div>
          </div>
        </div>

        {/* REAL-TIME TELEMETRY GRAPH */}
        <div className="chart-card">
          <div className="chart-header">
            <TrendingUp className="w-4 h-4 text-emerald-400" />
            <span>Histórico Telemetría en Tiempo Real</span>
          </div>
          <div className="chart-body" style={{ width: '100%', height: 160 }}>
            {history.length > 1 ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={history}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#ffffff15" />
                  <XAxis dataKey="time" stroke="#94a3b8" fontSize={10} tickLine={false} />
                  <YAxis stroke="#94a3b8" fontSize={10} domain={[0, 'auto']} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: 8, color: '#f8fafc' }}
                  />
                  <Line type="monotone" dataKey="speed" name="Velocidad (km/h)" stroke="#06b6d4" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="temp" name="Temperatura (°C)" stroke="#f59e0b" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="battery" name="Batería (%)" stroke={batteryColor} strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="chart-placeholder">
                <Clock className="w-6 h-6 animate-spin opacity-40 mb-1" />
                <span>Capturando muestras en tiempo real por MQTT...</span>
              </div>
            )}
          </div>
        </div>

        {/* LOG TICKER */}
        <div className="logs-card">
          <div className="logs-header">
            <Clock className="w-3.5 h-3.5 text-cyan-400" />
            <span>Eventos y Lecturas Recientes MQTT</span>
          </div>
          <div className="logs-scroll" id="telemetry-log-ticker">
            {logs.length === 0 ? (
              <p className="text-xs text-gray-500 italic p-2">Esperando publicaciones de FROST...</p>
            ) : (
              logs.slice(0, 15).map((log) => (
                <div key={log.id} className="log-item">
                  <span className="log-time">{log.timestamp}</span>
                  <span className="log-bus">{log.busName}</span>
                  <span className={`log-type ${log.type}`}>{log.type}</span>
                  <span className="log-value">{log.value}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </aside>
  );
};
