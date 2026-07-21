import React, { useEffect, useRef, useState } from 'react';
import * as Cesium from 'cesium';
import 'cesium/Build/Cesium/Widgets/widgets.css';
import { VehicleState } from '../types/frost';
import { getBatteryColor } from '../utils/colorUtils';
import { Camera, Compass, Layers, Maximize2, Shield, Eye, ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';

const CESIUM_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiI3MDlhZTgyYi0yYThlLTQwZjMtYTJjOS1kNWI1NTUzZDllMjUiLCJpZCI6MjQ2MzkyLCJpYXQiOjE3MjgyOTk0MTZ9.t_U2w7IepkCqkfUfKEevoDSJPIZeBUBdEmTXkP8kaf8';
const ADELANTO_S = 7;

interface Cesium3DViewProps {
  vehicles: VehicleState[];
  selectedThingId: number | null;
  onSelectBus: (thingId: number) => void;
}

export const Cesium3DView: React.FC<Cesium3DViewProps> = ({
  vehicles,
  selectedThingId,
  onSelectBus,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<Cesium.Viewer | null>(null);
  
  // Store sampled properties & entities per thingId
  const entitiesMapRef = useRef<Map<number, {
    entity: Cesium.Entity;
    sampledPos: Cesium.SampledPositionProperty;
    lastLon?: number;
    lastLat?: number;
  }>>(new Map());

  const [isTrackedMode, setIsTrackedMode] = useState(false);
  const [mapStyle, setMapStyle] = useState<'3d' | '2d'>('3d');
  const [isLoaded, setIsLoaded] = useState(false);

  // 1. Initialize Cesium Viewer
  useEffect(() => {
    if (!containerRef.current || viewerRef.current) return;

    Cesium.Ion.defaultAccessToken = CESIUM_TOKEN;

    let viewer: Cesium.Viewer;
    try {
      viewer = new Cesium.Viewer(containerRef.current, {
        terrainProvider: undefined, // Default terrain or create world terrain below
        animation: false,
        timeline: false,
        baseLayerPicker: false,
        navigationHelpButton: false,
        sceneModePicker: false,
        geocoder: false,
        homeButton: false,
        fullscreenButton: false,
        selectionIndicator: false,
        infoBox: false,
      });

      // Enable terrain if possible
      Cesium.createWorldTerrainAsync()
        .then((terrainProvider) => {
          if (viewer && !viewer.isDestroyed()) {
            viewer.terrainProvider = terrainProvider;
          }
        })
        .catch((err) => console.warn('Could not load Cesium World Terrain, falling back to ellipsoid:', err));

      viewer.clock.shouldAnimate = true;

      // Initial Camera positioning over Bogotá
      viewer.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(-74.0721, 4.6500, 12000), // Bogotá center view
        orientation: {
          heading: Cesium.Math.toRadians(0),
          pitch: Cesium.Math.toRadians(-45),
          roll: 0.0,
        },
        duration: 0,
      });

      // Handle Entity Click Selection
      const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
      handler.setInputAction((click: any) => {
        const pickedObject = viewer.scene.pick(click.position);
        if (Cesium.defined(pickedObject) && pickedObject.id && pickedObject.id.properties) {
          const thingId = pickedObject.id.properties.thingId?.getValue();
          if (thingId) {
            onSelectBus(thingId);
          }
        }
      }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

      viewerRef.current = viewer;
      setIsLoaded(true);
    } catch (err) {
      console.error('Error initializing Cesium Viewer:', err);
    }

    return () => {
      if (viewerRef.current && !viewerRef.current.isDestroyed()) {
        viewerRef.current.destroy();
        viewerRef.current = null;
      }
    };
  }, []);

  // 2. Sync Vehicles entities with Cesium Viewer
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || !isLoaded) return;

    vehicles.forEach((bus) => {
      let record = entitiesMapRef.current.get(bus.thingId);

      // Extract metrics for badge label
      let batteryVal = 100;
      let speedVal = 0;
      Object.values(bus.metrics).forEach((m) => {
        const name = m.observedProperty.toLowerCase();
        const val = Number(m.value) || 0;
        if (name.includes('bateria') || name.includes('battery')) {
          if (!name.includes('temperatura') && !name.includes('temperature')) batteryVal = val;
        }
        if (name.includes('velocidad') || name.includes('speed')) speedVal = val;
      });

      const batteryColorHex = getBatteryColor(batteryVal);
      const cesiumColor = Cesium.Color.fromCssColorString(batteryColorHex);

      // If entity doesn't exist yet, create it
      if (!record) {
        const sampledPos = new Cesium.SampledPositionProperty();
        sampledPos.setInterpolationOptions({ interpolationDegree: 1 });
        sampledPos.forwardExtrapolationType = Cesium.ExtrapolationType.HOLD;
        sampledPos.backwardExtrapolationType = Cesium.ExtrapolationType.HOLD;

        // Set initial position if available
        if (bus.position) {
          const cuando = Cesium.JulianDate.now();
          sampledPos.addSample(
            cuando,
            Cesium.Cartesian3.fromDegrees(bus.position.lon, bus.position.lat, bus.position.alt || 0)
          );
        }

        const entity = viewer.entities.add({
          name: bus.name,
          properties: new Cesium.PropertyBag({ thingId: bus.thingId }),
          position: sampledPos,
          orientation: new Cesium.VelocityOrientationProperty(sampledPos),
          model: {
            uri: '/assets/VW_T1_Panel_Van_Low_Poly.glb',
            minimumPixelSize: 64,
            heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
          },
          label: {
            text: `${bus.name.split(' - ')[0]}\n🔋 ${batteryVal.toFixed(0)}% | ⚡ ${speedVal.toFixed(0)} km/h`,
            font: 'bold 12px Inter, system-ui, sans-serif',
            style: Cesium.LabelStyle.FILL_AND_OUTLINE,
            outlineWidth: 4,
            outlineColor: Cesium.Color.BLACK,
            fillColor: cesiumColor,
            verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
            pixelOffset: new Cesium.Cartesian2(0, -45),
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
            backgroundColor: Cesium.Color.fromCssColorString('#0f172ae6'),
            showBackground: true,
            backgroundPadding: new Cesium.Cartesian2(8, 5),
          },
        });

        record = {
          entity,
          sampledPos,
          lastLon: bus.position?.lon,
          lastLat: bus.position?.lat,
        };
        entitiesMapRef.current.set(bus.thingId, record);
      } else {
        // Update label text & color
        if (record.entity.label) {
          record.entity.label.text = new Cesium.ConstantProperty(
            `${bus.name.split(' - ')[0]}\n🔋 ${batteryVal.toFixed(0)}% | ⚡ ${speedVal.toFixed(0)} km/h`
          );
          record.entity.label.fillColor = new Cesium.ConstantProperty(cesiumColor);
        }

        // Add new sample if location has changed
        if (bus.position) {
          if (record.lastLon !== bus.position.lon || record.lastLat !== bus.position.lat) {
            const cuando = Cesium.JulianDate.addSeconds(
              Cesium.JulianDate.now(),
              ADELANTO_S,
              new Cesium.JulianDate()
            );
            record.sampledPos.addSample(
              cuando,
              Cesium.Cartesian3.fromDegrees(bus.position.lon, bus.position.lat, bus.position.alt || 0)
            );
            record.lastLon = bus.position.lon;
            record.lastLat = bus.position.lat;
          }
        }
      }
    });
  }, [vehicles, isLoaded]);

  // 3. Handle Selected Bus Camera Tracking
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || !selectedThingId) return;

    const record = entitiesMapRef.current.get(selectedThingId);
    if (!record) return;

    if (isTrackedMode) {
      viewer.trackedEntity = record.entity;
    } else {
      viewer.trackedEntity = undefined;
      viewer.flyTo(record.entity, {
        duration: 1.5,
        offset: new Cesium.HeadingPitchRange(
          Cesium.Math.toRadians(0),
          Cesium.Math.toRadians(-35),
          600
        ),
      });
    }
  }, [selectedThingId, isTrackedMode]);

  // Camera Controls
  const handleResetCamera = () => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    viewer.trackedEntity = undefined;
    setIsTrackedMode(false);
    viewer.flyTo(viewer.entities, {
      duration: 1.8,
      offset: new Cesium.HeadingPitchRange(0, Cesium.Math.toRadians(-45), 14000),
    });
  };

  const handleZoomIn = () => {
    viewerRef.current?.camera.zoomIn(300);
  };

  const handleZoomOut = () => {
    viewerRef.current?.camera.zoomOut(300);
  };

  const handleToggle2D3D = () => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    if (mapStyle === '3d') {
      viewer.scene.morphTo2D(1.0);
      setMapStyle('2d');
    } else {
      viewer.scene.morphTo3D(1.0);
      setMapStyle('3d');
    }
  };

  return (
    <main className="cesium-viewport-container" id="cesium-3d-view">
      <div ref={containerRef} className="cesium-canvas-holder" />

      {/* OVERLAY MAP CONTROLS */}
      <div className="map-overlay-controls">
        <div className="control-group">
          <button
            className="map-btn"
            onClick={handleResetCamera}
            title="Vista General de Bogotá"
            id="btn-map-overview"
          >
            <RotateCcw className="w-4 h-4" />
            <span>Vista General</span>
          </button>

          {selectedThingId && (
            <button
              className={`map-btn ${isTrackedMode ? 'active' : ''}`}
              onClick={() => setIsTrackedMode(!isTrackedMode)}
              title="Alternar seguimiento continuo de la cámara en 3D"
              id="btn-toggle-camera-track"
            >
              <Eye className="w-4 h-4" />
              <span>{isTrackedMode ? 'Siguiendo Bus 3D' : 'Seguir Cámara'}</span>
            </button>
          )}

          <button
            className="map-btn"
            onClick={handleToggle2D3D}
            title="Cambiar perspectiva 2D / 3D"
            id="btn-toggle-2d3d"
          >
            <Layers className="w-4 h-4" />
            <span>{mapStyle === '3d' ? 'Modo 3D' : 'Modo 2D'}</span>
          </button>
        </div>

        <div className="control-group zoom-group">
          <button className="map-btn icon-only" onClick={handleZoomIn} title="Acercar">
            <ZoomIn className="w-4 h-4" />
          </button>
          <button className="map-btn icon-only" onClick={handleZoomOut} title="Alejar">
            <ZoomOut className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* 3D CARTOGRAPHY LEGEND BADGE */}
      <div className="cartography-legend">
        <div className="legend-header">
          <Compass className="w-4 h-4 text-cyan-400" />
          <span>Cartografía Urbana 4D</span>
        </div>
        <p className="legend-sub">Interpolación de movimiento en tiempo real (SampledPosition + glTF 3D Model)</p>
      </div>
    </main>
  );
};
