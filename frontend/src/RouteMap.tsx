import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { colors, dateTime, labels, type Plan } from './contracts';

const latLng = ([lon, lat]: [number, number]): L.LatLngTuple => [lat, lon];

export function RouteMap({
  plan,
  selectedId,
  hour,
  heatmap,
  focusIndex,
  onSelect,
}: {
  plan: Plan | null;
  selectedId: string;
  hour: number;
  heatmap: boolean;
  focusIndex: number | null;
  onSelect: (id: string) => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const boundsRef = useRef<L.LatLngBounds | null>(null);
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
    const resize = new ResizeObserver(() => {
      map.invalidateSize();
      if (boundsRef.current)
        map.fitBounds(boundsRef.current, {
          paddingTopLeft: [40, 110],
          paddingBottomRight: [40, 210],
          animate: false,
        });
    });
    resize.observe(container.current);
    return () => {
      resize.disconnect();
      map.remove();
      mapRef.current = null;
    };
  }, []);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !plan) return;
    const bounds = L.latLngBounds(plan.routes.flatMap((r) => r.geometry.coordinates.map(latLng)));
    boundsRef.current = bounds;
    map.fitBounds(bounds, {
      paddingTopLeft: [45, 100],
      paddingBottomRight: [45, 210],
      animate: false,
    });
  }, [plan]);
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
    const layer = L.layerGroup().addTo(map);
    for (const cell of plan.corridor) {
      const w = cell.hours[hour];
      const tooltip = document.createElement('div');
      tooltip.textContent = `${labels[w.level]} · ${w.wind_mph.toFixed(1)} mph wind · ${w.rain_in.toFixed(2)} in/hr rain · ${w.snow_in.toFixed(2)} in/hr snow`;
      L.rectangle(cell.bounds, {
        pane: 'weather',
        stroke: false,
        fillColor: colors[w.level],
        fillOpacity: w.level ? 0.35 : 0.14,
      })
        .addTo(layer)
        .bindTooltip(tooltip);
    }
    return () => {
      layer.remove();
    };
  }, [plan, hour, heatmap]);
  useEffect(() => {
    const map = mapRef.current;
    const route = plan?.routes.find((r) => r.id === selectedId);
    if (map && route && focusIndex !== null && route.checkpoints[focusIndex])
      map.panTo(latLng(route.checkpoints[focusIndex].coordinate), { animate: false });
  }, [plan, selectedId, focusIndex]);
  return (
    <div
      ref={container}
      className="map"
      aria-label="Map of route alternatives and forecast weather. Checkpoint details are available in the table below."
    />
  );
}
