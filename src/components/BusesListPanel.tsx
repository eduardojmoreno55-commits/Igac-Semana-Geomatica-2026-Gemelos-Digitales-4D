import React, { useState } from 'react';
import { Bus, BatteryCharging, Gauge, Thermometer, MapPin, Eye, Search, Filter, ShieldAlert } from 'lucide-react';
import { VehicleState } from '../types/frost';
import { getBatteryColor, getBatteryGradient, getBatteryStatusLabel } from '../utils/colorUtils';

interface BusesListPanelProps {
  vehicles: VehicleState[];
  selectedThingId: number | null;
  onSelectBus: (thingId: number) => void;
  onFocusBus3D: (thingId: number) => void;
}

export const BusesListPanel: React.FC<BusesListPanelProps> = ({
  vehicles,
  selectedThingId,
  onSelectBus,
  onFocusBus3D,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterMode, setFilterMode] = useState<'all' | 'warning'>('all');

  const filteredVehicles = vehicles.filter((bus) => {
    const matchesSearch = bus.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (bus.properties.circuitId && bus.properties.circuitId.toLowerCase().includes(searchTerm.toLowerCase()));
    
    if (!matchesSearch) return false;

    if (filterMode === 'warning') {
      let battery = 100;
      Object.values(bus.metrics).forEach((m) => {
        if (m.observedProperty.toLowerCase().includes('bateria') || m.observedProperty.toLowerCase().includes('battery')) {
          battery = Number(m.value) || 0;
        }
      });
      return battery < 40;
    }

    return true;
  });

  return (
    <aside className="panel-container buses-list-panel" id="buses-active-panel">
      <div className="panel-header">
        <div className="panel-title-wrapper">
          <Bus className="panel-title-icon" />
          <h2 className="panel-title">Buses Activos ({vehicles.length})</h2>
        </div>
        <span className="live-pill">
          <span className="live-dot"></span> EN VIVO
        </span>
      </div>

      <div className="search-filter-box">
        <div className="search-input-wrapper">
          <Search className="search-icon" />
          <input
            type="text"
            placeholder="Buscar por bus o circuito..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="search-input"
            id="bus-search-input"
          />
        </div>

        <div className="filter-chips">
          <button
            className={`chip ${filterMode === 'all' ? 'active' : ''}`}
            onClick={() => setFilterMode('all')}
          >
            Todos ({vehicles.length})
          </button>
          <button
            className={`chip warning ${filterMode === 'warning' ? 'active' : ''}`}
            onClick={() => setFilterMode('warning')}
          >
            <ShieldAlert className="w-3 h-3 mr-1" /> Batería Baja
          </button>
        </div>
      </div>

      <div className="buses-cards-scroll">
        {filteredVehicles.length === 0 ? (
          <div className="empty-state">
            <Bus className="w-8 h-8 opacity-40 mb-2" />
            <p>No se encontraron buses activos.</p>
          </div>
        ) : (
          filteredVehicles.map((bus) => {
            const isSelected = bus.thingId === selectedThingId;

            // Extract metrics
            let batteryVal = 0;
            let speedVal = 0;
            let tempVal = 0;

            Object.values(bus.metrics).forEach((m) => {
              const name = m.observedProperty.toLowerCase();
              const val = Number(m.value) || 0;
              if (name.includes('bateria') || name.includes('battery')) {
                if (!name.includes('temperatura') && !name.includes('temperature')) {
                  batteryVal = val;
                }
              }
              if (name.includes('velocidad') || name.includes('speed')) {
                speedVal = val;
              }
              if (name.includes('temperatura') || name.includes('temp')) {
                tempVal = val;
              }
            });

            const batteryColor = getBatteryColor(batteryVal);
            const statusInfo = getBatteryStatusLabel(batteryVal);

            return (
              <div
                key={bus.thingId}
                className={`bus-card ${isSelected ? 'selected' : ''}`}
                onClick={() => onSelectBus(bus.thingId)}
                id={`bus-card-${bus.thingId}`}
              >
                <div className="bus-card-header">
                  <div className="bus-identity">
                    <div className="bus-badge-icon" style={{ borderColor: batteryColor }}>
                      <Bus style={{ color: batteryColor }} />
                    </div>
                    <div>
                      <h3 className="bus-name">{bus.name}</h3>
                      <span className="circuit-name">
                        Circuito: <strong>{bus.properties.circuitId || bus.properties.busId || 'Urbano'}</strong>
                      </span>
                    </div>
                  </div>

                  <span className={`status-badge ${statusInfo.class}`}>
                    {statusInfo.label}
                  </span>
                </div>

                {/* BATTERY PERCENTAGE COLOR SCALE (VERDE -> ROJO) */}
                <div className="battery-section">
                  <div className="battery-info-header">
                    <span className="battery-label">
                      <BatteryCharging className="w-3.5 h-3.5 mr-1 inline" /> Nivel de Batería
                    </span>
                    <span className="battery-percentage" style={{ color: batteryColor }}>
                      {batteryVal.toFixed(0)}%
                    </span>
                  </div>

                  <div className="battery-bar-track">
                    <div
                      className="battery-bar-fill"
                      style={{
                        width: `${Math.max(4, Math.min(100, batteryVal))}%`,
                        background: getBatteryGradient(batteryVal),
                        boxShadow: `0 0 10px ${batteryColor}80`,
                      }}
                    ></div>
                  </div>
                </div>

                {/* SPEED & TEMP METRICS */}
                <div className="bus-quick-metrics">
                  <div className="quick-metric">
                    <Gauge className="w-3.5 h-3.5 text-cyan-400" />
                    <span>{speedVal.toFixed(1)} km/h</span>
                  </div>

                  <div className="quick-metric">
                    <Thermometer className="w-3.5 h-3.5 text-amber-400" />
                    <span>{tempVal > 0 ? `${tempVal.toFixed(1)} °C` : '--'}</span>
                  </div>

                  {bus.position && (
                    <div className="quick-metric pos">
                      <MapPin className="w-3.5 h-3.5 text-emerald-400" />
                      <span>{bus.position.lat.toFixed(4)}, {bus.position.lon.toFixed(4)}</span>
                    </div>
                  )}
                </div>

                {/* CARD ACTIONS */}
                <div className="bus-card-actions">
                  <button
                    className="btn-card-action primary"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectBus(bus.thingId);
                      onFocusBus3D(bus.thingId);
                    }}
                    title="Centrar y seguir bus en mapa 3D"
                  >
                    <Eye className="w-3.5 h-3.5 mr-1" />
                    Centrar en Mapa 3D
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </aside>
  );
};
