import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { colors, dateTime, type Plan } from './contracts';
import type { WeatherJob } from './weatherRaster';
import type { LocationFix } from './useLocation';

const latLng = ([lon, lat]: [number, number]): L.LatLngTuple => [lat, lon];

export function RouteMap({
  plan,
  selectedId,
  hour,
  heatmap,
  focusIndex,
  onSelect,
  fitRequest,
  driverPosition,
  locationFix,
  locationStale,
  locationFocus,
}: {
  plan: Plan | null;
  selectedId: string;
  hour: number;
  heatmap: boolean;
  focusIndex: number | null;
  onSelect: (id: string) => void;
  fitRequest: number;
  driverPosition: [number, number] | null;
  locationFix: LocationFix | null;
  locationStale: boolean;
  locationFocus: number;
}) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const boundsRef = useRef<L.LatLngBounds | null>(null);
  const driverRef = useRef<L.Marker | null>(null);
  const gpsMarker = useRef<L.Marker | null>(null);
  const gpsAccuracy = useRef<L.Circle | null>(null);
  const [weatherError, setWeatherError] = useState(false);
  const routeLayers = useRef<
    { id: string; outline: L.Polyline; segments: L.Polyline[]; markers: L.CircleMarker[] }[]
  >([]);
  const weatherHour = useRef(hour);
  const updateWeather = useRef<(() => void) | null>(null);
  useEffect(() => {
    weatherHour.current = hour;
    updateWeather.current?.();
  }, [hour]);
  const clickRef = useRef(onSelect);
  useEffect(() => {
    clickRef.current = onSelect;
  }, [onSelect]);
  useEffect(() => {
    if (!container.current) return;
    const map = L.map(container.current, {
      center: [40.7, -87],
      zoom: 6,
      zoomControl: false,
      preferCanvas: true,
      scrollWheelZoom: false,
    });
    mapRef.current = map;
    L.control.zoom({ position: 'topright' }).addTo(map);
    L.tileLayer(import.meta.env.VITE_TILE_URL ?? 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution:
        import.meta.env.VITE_TILE_ATTRIBUTION ??
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
    }).addTo(map);
    map.createPane('weather');
    map.getPane('weather')!.style.zIndex = '350';
    map.getPane('weather')!.style.pointerEvents = 'none';
    let settle = 0;
    const resize = new ResizeObserver(() => {
      map.invalidateSize({ pan: false });
      window.clearTimeout(settle);
      settle = window.setTimeout(() => {
        if (boundsRef.current)
          map.fitBounds(boundsRef.current, { padding: [40, 40], maxZoom: 11, animate: false });
      }, 120);
    });
    resize.observe(container.current);
    return () => {
      resize.disconnect();
      window.clearTimeout(settle);
      map.remove();
      mapRef.current = null;
      driverRef.current = null;
      gpsMarker.current = null;
      gpsAccuracy.current = null;
    };
  }, []);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !plan) return;
    const bounds = L.latLngBounds(plan.routes.flatMap((r) => r.geometry.coordinates.map(latLng)));
    boundsRef.current = bounds;
    map.fitBounds(bounds, {
      padding: [40, 40],
      maxZoom: 11,
      animate: false,
    });
  }, [plan, fitRequest]);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !plan) return;
    const layer = L.layerGroup().addTo(map);
    routeLayers.current = [];
    for (const route of plan.routes) {
      const outline = L.polyline(route.geometry.coordinates.map(latLng), {
        color: '#ffffff',
        weight: 6,
        opacity: 0.7,
      })
        .addTo(layer)
        .on('click', () => clickRef.current(route.id))
        .bindTooltip(`${route.name} · ${Math.round(route.distance_miles)} mi`);
      const segments = route.segments.map((segment) =>
        L.polyline(segment.coordinates.map(latLng), {
          color: colors[segment.level],
          weight: 3,
          opacity: 0.6,
          interactive: false,
        }).addTo(layer),
      );
      const markers = route.checkpoints.map((p, i) => {
        const tooltip = document.createElement('div');
        const title = document.createElement('strong');
        title.textContent = `${route.name} · checkpoint ${i + 1} · mile ${Math.round(p.mile)} · ${p.risk.label}`;
        const detail = document.createElement('div');
        detail.textContent = `${dateTime(p.eta)} · ${p.weather.wind_mph.toFixed(1)} mph wind`;
        tooltip.append(title, detail);
        return L.circleMarker(latLng(p.coordinate), {
          radius: 2,
          fillColor: colors[p.risk.level],
          color: '#fff',
          weight: 1,
          fillOpacity: 0.7,
        })
          .addTo(layer)
          .bindTooltip(tooltip)
          .on('click', () => clickRef.current(route.id));
      });
      routeLayers.current.push({ id: route.id, outline, segments, markers });
      for (const stop of route.stops ?? []) {
        L.marker(latLng(stop.coordinate), {
          keyboard: false,
          icon: L.divIcon({
            className: 'stop-marker',
            html: stop.kind === 'rest' ? '<span>R</span>' : '<span>B</span>',
            iconSize: [26, 26],
            iconAnchor: [13, 13],
          }),
        })
          .addTo(layer)
          .bindTooltip(
            `${route.name} · Planned ${stop.kind} · ${dateTime(stop.arrival)} to ${dateTime(stop.departure)} · ${stop.risk.label} · parking not verified`,
          );
      }
    }
    for (const [text, point] of [
      ['A', plan.origin.coordinate],
      ['B', plan.destination.coordinate],
    ] as const) {
      L.marker(latLng(point), {
        icon: L.divIcon({
          className: 'endpoint',
          html: `<span>${text}</span>`,
          iconSize: [30, 30],
          iconAnchor: [15, 15],
        }),
        keyboard: false,
      }).addTo(layer);
    }
    return () => {
      layer.remove();
      routeLayers.current = [];
    };
  }, [plan]);
  useEffect(() => {
    for (const group of [...routeLayers.current].sort(
      (a, b) => Number(a.id === selectedId) - Number(b.id === selectedId),
    )) {
      const selected = group.id === selectedId;
      group.outline
        .setStyle({ weight: selected ? 10 : 6, opacity: selected ? 1 : 0.7 })
        .bringToFront();
      group.segments.forEach((segment) =>
        segment.setStyle({ weight: selected ? 5 : 3, opacity: selected ? 1 : 0.6 }).bringToFront(),
      );
      group.markers.forEach((marker, i) =>
        marker
          .setRadius(selected ? (i === focusIndex ? 8 : 4) : 2)
          .setStyle({ weight: selected ? 2 : 1, fillOpacity: selected ? 1 : 0.7 })
          .bringToFront(),
      );
    }
  }, [plan, selectedId, focusIndex]);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !plan || !heatmap) return;
    const canvas = L.DomUtil.create('canvas', 'weather-field', map.getPane('weather'));
    canvas.setAttribute('aria-hidden', 'true');
    const worker = new Worker(new URL('./weather.worker.ts', import.meta.url), { type: 'module' });
    const rgb = colors.map((c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16)));
    worker.postMessage({ corridor: plan.corridor, load: plan.load_lb, rgb });
    let frame = 0,
      serial = 0,
      inFlight = false,
      pending: WeatherJob | null = null,
      viewportVersion = 0,
      sentVersion = 0;
    let currentView: WeatherJob['view'];
    const ctx = canvas.getContext('2d');
    function send() {
      frame = 0;
      if (inFlight || !pending) return;
      const job = pending;
      pending = null;
      inFlight = true;
      sentVersion = viewportVersion;
      worker.postMessage(job);
    }
    function queue(viewChanged = false) {
      if (viewChanged) {
        const size = map!.getSize();
        const scale = Math.max(3, Math.sqrt((size.x * size.y) / 60000));
        const width = Math.ceil(size.x / scale),
          height = Math.ceil(size.y / scale);
        canvas.style.width = `${size.x}px`;
        canvas.style.height = `${size.y}px`;
        L.DomUtil.setPosition(canvas, map!.containerPointToLayerPoint([0, 0]));
        currentView = {
          width,
          height,
          samples: plan!.corridor.map((c) => {
            const p = map!.latLngToContainerPoint(latLng(c.coordinate));
            const edge = map!.latLngToContainerPoint(c.bounds[1]);
            return {
              x: p.x / scale,
              y: p.y / scale,
              radius: Math.max(1, (p.distanceTo(edge) * 2) / scale),
            };
          }),
        };
        viewportVersion++;
      }
      pending = {
        id: ++serial,
        hour: weatherHour.current,
        view: viewChanged ? currentView : pending?.view,
      };
      if (!frame) frame = requestAnimationFrame(send);
    }
    worker.onmessage = ({ data }) => {
      setWeatherError(false);
      inFlight = false;
      if (sentVersion === viewportVersion && ctx) {
        canvas.width = data.width;
        canvas.height = data.height;
        ctx.putImageData(new ImageData(data.pixels, data.width, data.height), 0, 0);
        canvas.style.visibility = 'visible';
        canvas.dataset.hour = String(data.hour);
        canvas.dataset.renderMs = String(data.duration);
      }
      if (pending && !frame) frame = requestAnimationFrame(send);
    };
    worker.onerror = () => {
      canvas.style.visibility = 'hidden';
      canvas.dataset.error = 'Forecast display unavailable';
      setWeatherError(true);
    };
    const redraw = () => queue(true);
    const hide = () => {
      canvas.style.visibility = 'hidden';
    };
    updateWeather.current = () => queue();
    map.on('moveend zoomend resize', redraw);
    map.on('zoomstart', hide);
    queue(true);
    return () => {
      updateWeather.current = null;
      cancelAnimationFrame(frame);
      worker.terminate();
      map.off('moveend zoomend resize', redraw);
      map.off('zoomstart', hide);
      canvas.remove();
    };
  }, [plan, heatmap]);
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!driverPosition) {
      driverRef.current?.remove();
      driverRef.current = null;
      return;
    }
    if (!driverRef.current) {
      driverRef.current = L.marker(latLng(driverPosition), {
        keyboard: false,
        title: 'Simulated driver position',
        zIndexOffset: 1000,
        icon: L.divIcon({
          className: 'driver-marker',
          iconSize: [36, 36],
          iconAnchor: [18, 18],
          html: '<span><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M3 5h11v12H3zM14 9h4l3 4v4h-7"/><circle cx="7" cy="18" r="2"/><circle cx="18" cy="18" r="2"/></svg></span>',
        }),
      })
        .addTo(map)
        .bindTooltip('Estimated position · continuous-driving preview');
    } else driverRef.current.setLatLng(latLng(driverPosition));
    const element = driverRef.current.getElement();
    if (element) element.dataset.coordinate = driverPosition.join(',');
  }, [driverPosition]);
  useEffect(() => {
    const map = mapRef.current;
    const route = plan?.routes.find((r) => r.id === selectedId);
    if (map && route && focusIndex !== null && route.checkpoints[focusIndex])
      map.panTo(latLng(route.checkpoints[focusIndex].coordinate), { animate: false });
  }, [plan, selectedId, focusIndex]);
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!locationFix) {
      gpsMarker.current?.remove();
      gpsAccuracy.current?.remove();
      gpsMarker.current = null;
      gpsAccuracy.current = null;
      return;
    }
    const point = latLng(locationFix.coordinate);
    if (!gpsMarker.current) {
      gpsAccuracy.current = L.circle(point, {
        radius: locationFix.accuracy,
        color: '#225cc7',
        weight: 1,
        fillOpacity: 0.08,
        interactive: false,
      }).addTo(map);
      gpsMarker.current = L.marker(point, {
        keyboard: false,
        zIndexOffset: 1100,
        icon: L.divIcon({
          className: 'gps-marker',
          html: '<span></span>',
          iconSize: [22, 22],
          iconAnchor: [11, 11],
        }),
      })
        .addTo(map)
        .bindTooltip('Device location');
      map.setView(point, Math.max(map.getZoom(), 13), { animate: false });
    }
    gpsMarker.current
      .setLatLng(point)
      .setTooltipContent(
        `${locationStale ? 'Last device fix' : 'Device location'} · ±${Math.round(locationFix.accuracy)} m`,
      );
    gpsAccuracy.current?.setLatLng(point).setRadius(locationFix.accuracy);
    const element = gpsMarker.current.getElement();
    if (element) {
      element.classList.toggle('gps-stale', locationStale);
      element.dataset.coordinate = locationFix.coordinate.join(',');
    }
  }, [locationFix, locationStale]);
  useEffect(() => {
    if (locationFocus && gpsMarker.current)
      mapRef.current?.setView(gpsMarker.current.getLatLng(), 13, { animate: false });
  }, [locationFocus]);
  return (
    <div
      ref={container}
      className="map"
      aria-label="Map of route alternatives and interpolated forecast weather. Open Checkpoints for arrival-time details."
    >
      {heatmap && weatherError && (
        <p className="weather-error" role="status">
          Weather display unavailable. Toggle Weather layer to retry. Route calculations remain
          available.
        </p>
      )}
    </div>
  );
}
