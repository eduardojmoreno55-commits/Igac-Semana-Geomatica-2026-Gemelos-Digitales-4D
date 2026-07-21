import React from 'react';
import { Bus, Zap, Gauge, Thermometer, Wifi, WifiOff, Settings, RefreshCw, Activity } from 'lucide-react';
import { VehicleState } from '../types/frost';
import { getBatteryColor } from '../utils/colorUtils';

interface HeaderProps {
  vehicles: VehicleState[];
  connectionStatus: { rest: boolean; mqtt: boolean; error?: string };
  onOpenSettings: () => void;
  onRefresh: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  vehicles,
  connectionStatus,
  onOpenSettings,
  onRefresh,
}) => {
  // Compute aggregate stats
  const totalBuses = vehicles.length;
  
  let totalBattery = 0;
  let batteryCount = 0;
  let totalSpeed = 0;
  let speedCount = 0;
  let maxTemp = 0;

  vehicles.forEach((bus) => {
    Object.values(bus.metrics).forEach((m) => {
      const name = m.observedProperty.toLowerCase();
      const val = Number(m.value) || 0;
      if (name.includes('bateria') || name.includes('battery')) {
        totalBattery += val;
        batteryCount++;
      } else if (name.includes('velocidad') || name.includes('speed')) {
        totalSpeed += val;
        speedCount++;
      } else if (name.includes('temperatura') || name.includes('temp')) {
        if (val > maxTemp) maxTemp = val;
      }
    });
  });

  const avgBattery = batteryCount > 0 ? Math.round(totalBattery / batteryCount) : 0;
  const avgSpeed = speedCount > 0 ? (totalSpeed / speedCount).toFixed(1) : '0';

  return (
    <header className="header-container" id="app-header">
      <div className="header-left">
        <div className="brand-badge">
          <Bus className="brand-icon" />
          <span className="brand-text">IGAC 2026</span>
        </div>
        <div className="header-titles">
          <h1 className="main-title">Gemelo Digital 4D — Buses Eléctricos</h1>
          <p className="sub-title">Monitoreo Urbano en Tiempo Real • FROST Server (OGC SensorThings)</p>
        </div>
      </div>

      <div className="header-stats">
        <div className="stat-card">
          <div className="stat-icon-wrapper blue">
            <Bus className="w-4 h-4" />
          </div>
          <div className="stat-content">
            <span className="stat-label">Buses Activos</span>
            <span className="stat-value">{totalBuses}</span>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon-wrapper green" style={{ color: getBatteryColor(avgBattery) }}>
            <Zap className="w-4 h-4" />
          </div>
          <div className="stat-content">
            <span className="stat-label">Batería Promedio</span>
            <span className="stat-value" style={{ color: getBatteryColor(avgBattery) }}>
              {avgBattery}%
            </span>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon-wrapper cyan">
            <Gauge className="w-4 h-4" />
          </div>
          <div className="stat-content">
            <span className="stat-label">Velocidad Promedio</span>
            <span className="stat-value">{avgSpeed} <small>km/h</small></span>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon-wrapper orange">
            <Thermometer className="w-4 h-4" />
          </div>
          <div className="stat-content">
            <span className="stat-label">Temp. Máxima</span>
            <span className="stat-value">{maxTemp > 0 ? `${maxTemp.toFixed(1)}°C` : 'N/A'}</span>
          </div>
        </div>
      </div>

      <div className="header-right">
        <div className="connection-badges">
          <div
            className={`status-pill ${connectionStatus.rest ? 'online' : 'offline'}`}
            title={connectionStatus.rest ? 'FROST REST API Conectado' : 'FROST REST API Desconectado'}
          >
            <span className="pulse-dot"></span>
            <span className="status-name">REST</span>
          </div>

          <div
            className={`status-pill ${connectionStatus.mqtt ? 'online-mqtt' : 'offline'}`}
            title={connectionStatus.mqtt ? 'FROST MQTT WebSocket en vivo' : 'FROST MQTT Desconectado'}
          >
            <span className="pulse-dot mqtt"></span>
            <span className="status-name">MQTT 4D</span>
          </div>
        </div>

        <div className="action-buttons">
          <button
            className="btn-icon"
            onClick={onRefresh}
            title="Recargar catálogo REST"
            id="btn-refresh-catalog"
          >
            <RefreshCw className="w-4 h-4" />
          </button>

          <button
            className="btn-settings"
            onClick={onOpenSettings}
            id="btn-open-settings"
          >
            <Settings className="w-4 h-4" />
            <span>Conexión</span>
          </button>
        </div>
      </div>
    </header>
  );
};
