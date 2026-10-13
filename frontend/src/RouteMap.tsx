import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { colors, dateTime, type Plan } from './contracts';
import { fieldLevel, interpolateWeather } from './weatherField';
import { forecastAtHour } from './simulation';
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
  const weatherScale = driverPosition ? 6 : 4;
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
    for (const route of [...plan.routes].sort(
      (a, b) => Number(a.id === selectedId) - Number(b.id === selectedId),
    )) {
      const selected = route.id === selectedId;
      L.polyline(route.geometry.coordinates.map(latLng), {
        color: '#ffffff',
        weight: selected ? 10 : 6,
        opacity: selected ? 1 : 0.7,
      })
        .addTo(layer)
        .on('click', () => clickRef.current(route.id))
        .bindTooltip(`${route.name} · ${Math.round(route.distance_miles)} mi`);
      for (const segment of route.segments)
        L.polyline(segment.coordinates.map(latLng), {
          color: colors[segment.level],
          weight: selected ? 5 : 3,
          opacity: selected ? 1 : 0.6,
          interactive: false,
        }).addTo(layer);
      route.checkpoints.forEach((p, i) => {
        const tooltip = document.createElement('div');
        const title = document.createElement('strong');
        title.textContent = `${route.name} · checkpoint ${i + 1} · mile ${Math.round(p.mile)} · ${p.risk.label}`;
        const detail = document.createElement('div');
        detail.textContent = `${dateTime(p.eta)} · ${p.weather.wind_mph.toFixed(1)} mph wind`;
        tooltip.append(title, detail);
        L.circleMarker(latLng(p.coordinate), {
          radius: selected ? (i === focusIndex ? 8 : 4) : 2,
          fillColor: colors[p.risk.level],
          color: '#fff',
          weight: selected ? 2 : 1,
          fillOpacity: selected ? 1 : 0.7,
        })
          .addTo(layer)
          .bindTooltip(tooltip)
          .on('click', () => clickRef.current(route.id));
      });
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
    };
  }, [plan, selectedId, focusIndex]);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !plan || !heatmap) return;
    const canvas = L.DomUtil.create('canvas', 'weather-field', map.getPane('weather'));
    canvas.setAttribute('aria-hidden', 'true');
    const rgb = colors.map((c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16)));
    function draw() {
      if (!map || !plan) return;
      const size = map.getSize();
      const scale = weatherScale;
      canvas.width = Math.ceil(size.x / scale);
      canvas.height = Math.ceil(size.y / scale);
      canvas.style.width = `${size.x}px`;
      canvas.style.height = `${size.y}px`;
      L.DomUtil.setPosition(canvas, map.containerPointToLayerPoint([0, 0]));
      const samples = plan.corridor.map((c) => {
        const p = map.latLngToContainerPoint(latLng(c.coordinate));
        const edge = map.latLngToContainerPoint(c.bounds[1]);
        const w = forecastAtHour(c.hours, hour);
        return {
          x: p.x / scale,
          y: p.y / scale,
          radius: Math.max(1, (p.distanceTo(edge) * 2) / scale),
          wind: w.wind,
          rain: w.rain,
          snow: w.snow,
        };
      });
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const pixels = ctx.createImageData(canvas.width, canvas.height);
      for (let y = 0; y < canvas.height; y++)
        for (let x = 0; x < canvas.width; x++) {
          const w = interpolateWeather(samples, x, y);
          if (!w) continue;
          const level = fieldLevel(w.wind, w.rain, w.snow, plan.load_lb);
          const offset = (y * canvas.width + x) * 4;
          pixels.data.set(rgb[level], offset);
          pixels.data[offset + 3] = Math.round((level ? 95 : 36) * w.opacity);
        }
      ctx.putImageData(pixels, 0, 0);
      canvas.style.visibility = 'visible';
    }
    const hide = () => {
      canvas.style.visibility = 'hidden';
    };
    map.on('moveend zoomend resize', draw);
    map.on('zoomstart', hide);
    draw();
    return () => {
      map.off('moveend zoomend resize', draw);
      map.off('zoomstart', hide);
      canvas.remove();
    };
  }, [plan, hour, heatmap, weatherScale]);
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
    />
  );
}
