import React, { useState } from 'react';
import { X, Server, Wifi, RefreshCw, CheckCircle, AlertTriangle, Link } from 'lucide-react';
import { ConnectionConfig } from '../types/frost';
import { getDefaultConfig } from '../utils/frostClient';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentConfig: ConnectionConfig;
  onSaveConfig: (newConfig: ConnectionConfig) => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  currentConfig,
  onSaveConfig,
}) => {
  const [restUrl, setRestUrl] = useState(currentConfig.restUrl);
  const [wsUrl, setWsUrl] = useState(currentConfig.wsUrl);

  if (!isOpen) return null;

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    onSaveConfig({ restUrl: restUrl.trim(), wsUrl: wsUrl.trim() });
    onClose();
  };

  const handleResetDefaults = () => {
    const defaultConfig = getDefaultConfig();
    setRestUrl(defaultConfig.restUrl);
    setWsUrl(defaultConfig.wsUrl);
  };

  const handleSetCodespaces = () => {
    setRestUrl('https://super-acorn-qvvr7gpxvqjxh45vq-8080.app.github.dev/FROST-Server/v1.1');
    setWsUrl('wss://super-acorn-qvvr7gpxvqjxh45vq-9876.app.github.dev/mqtt');
  };

  const handleSetLocalhost = () => {
    setRestUrl('http://localhost:8080/FROST-Server/v1.1');
    setWsUrl('ws://localhost:9876/mqtt');
  };

  return (
    <div className="modal-backdrop" id="settings-modal-backdrop">
      <div className="modal-container">
        <div className="modal-header">
          <div className="flex items-center gap-2">
            <Server className="w-5 h-5 text-cyan-400" />
            <h3 className="modal-title">Configuración Servidor FROST</h3>
          </div>
          <button className="btn-close" onClick={onClose} id="btn-close-modal">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSave} className="modal-body">
          <p className="modal-desc">
            Ajusta los endpoints REST y WebSocket MQTT de tu servidor FROST desplegado en Docker.
          </p>

          <div className="preset-buttons">
            <button
              type="button"
              className="preset-btn"
              onClick={handleSetCodespaces}
            >
              <Link className="w-3.5 h-3.5 text-emerald-400" />
              <span>Usar URLs Codespaces (.app.github.dev)</span>
            </button>
            <button
              type="button"
              className="preset-btn"
              onClick={handleSetLocalhost}
            >
              <Server className="w-3.5 h-3.5 text-cyan-400" />
              <span>Usar Localhost (Puertos 8080 / 9876)</span>
            </button>
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="input-rest-url">
              Endpoint REST (FROST SensorThings v1.1)
            </label>
            <input
              id="input-rest-url"
              type="text"
              className="form-input"
              value={restUrl}
              onChange={(e) => setRestUrl(e.target.value)}
              placeholder="http://localhost:8080/FROST-Server/v1.1"
              required
            />
            <span className="form-hint">Utilizado para obtener el catálogo inicial de buses y datastreams.</span>
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="input-ws-url">
              Endpoint MQTT sobre WebSocket
            </label>
            <input
              id="input-ws-url"
              type="text"
              className="form-input"
              value={wsUrl}
              onChange={(e) => setWsUrl(e.target.value)}
              placeholder="ws://localhost:9876/mqtt"
              required
            />
            <span className="form-hint">Utilizado para la telemetría en vivo y actualizaciones de ubicación 4D. Ruta /mqtt obligatoria.</span>
          </div>

          <div className="modal-footer">
            <button
              type="button"
              className="btn-secondary"
              onClick={handleResetDefaults}
            >
              <RefreshCw className="w-4 h-4 mr-1 inline" /> Auto-detectar
            </button>

            <button type="submit" className="btn-primary" id="btn-save-settings">
              <CheckCircle className="w-4 h-4 mr-1 inline" /> Guardar y Conectar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
