import type { Plan, Route } from './contracts';
import { fieldLevel, interpolateWeather } from './weatherField';

type Coordinate = [number, number];
export type Simulation = { visible: boolean; playing: boolean; elapsed: number; rate: number };
export const initialSimulation: Simulation = {
  visible: false,
  playing: false,
  elapsed: 0,
  rate: 720,
};

const timingCache = new WeakMap<Route, boolean>();
export function journeyDuration(route: Route) {
  return route.total_duration_s ?? route.duration_s;
}
export function stopAt(route: Route, seconds: number) {
  return route.stops?.find(
    (stop) => seconds >= stop.start_elapsed_s && seconds < stop.end_elapsed_s,
  );
}
export function drivingAt(route: Route, seconds: number) {
  let driving = seconds;
  for (const stop of route.stops ?? []) {
    if (seconds < stop.start_elapsed_s) break;
    if (seconds < stop.end_elapsed_s) return stop.driving_elapsed_s;
    driving -= stop.duration_s;
  }
  return Math.max(0, Math.min(route.duration_s, driving));
}
export function hasTiming(route: Route) {
  const known = timingCache.get(route);
  if (known !== undefined) return known;
  if (!(route.duration_s > 0 && route.duration_s <= 48 * 3600)) return false;
  const times = route.geometry_elapsed_s;
  const valid =
    !!times &&
    times.length === route.geometry.coordinates.length &&
    times.length >= 2 &&
    times[0] === 0 &&
    Math.abs(times[times.length - 1] - route.duration_s) < 0.01 &&
    times.every((time, i) => Number.isFinite(time) && time >= 0 && (!i || time >= times[i - 1]));
  const result = valid && journeyDuration(route) <= 48 * 3600;
  timingCache.set(route, result);
  return result;
}

export function positionAt(route: Route, seconds: number): Coordinate | null {
  if (!hasTiming(route)) return null;
  const points = route.geometry.coordinates;
  const times = route.geometry_elapsed_s!;
  const elapsed = drivingAt(route, seconds);
  if (elapsed === 0) return points[0];
  if (elapsed >= route.duration_s) return points[points.length - 1];
  let left = 0,
    right = times.length - 1;
  while (left + 1 < right) {
    const middle = (left + right) >>> 1;
    if (times[middle] <= elapsed) left = middle;
    else right = middle;
  }
  const fraction = (elapsed - times[left]) / (times[right] - times[left]);
  return [0, 1].map(
    (axis) => points[left][axis] + (points[right][axis] - points[left][axis]) * fraction,
  ) as Coordinate;
}

export function forecastAtHour(hours: Plan['corridor'][number]['hours'], hour: number) {
  const bounded = Math.max(0, Math.min(48, hour));
  const lower = Math.floor(bounded),
    upper = Math.ceil(bounded),
    fraction = bounded - lower;
  const mix = (a: number, b: number) => a + (b - a) * fraction;
  return {
    wind: mix(hours[lower].wind_mph, hours[upper].wind_mph),
    rain: mix(hours[lower].rain_in, hours[upper].rain_in),
    snow: mix(hours[lower].snow_in, hours[upper].snow_in),
  };
}

// Web Mercator, matching Leaflet's spatial weighting up to a common scale/translation.
function project([longitude, latitude]: Coordinate): Coordinate {
  const radians = Math.PI / 180;
  return [
    longitude * radians * 6378137,
    Math.log(Math.tan(Math.PI / 4 + (latitude * radians) / 2)) * 6378137,
  ];
}

export function conditionsAt(plan: Plan, coordinate: Coordinate, hour: number) {
  const [x, y] = project(coordinate);
  const samples = plan.corridor.map((cell) => {
    const [cx, cy] = project(cell.coordinate);
    const [ex, ey] = project([cell.bounds[1][1], cell.bounds[1][0]]);
    return {
      x: cx,
      y: cy,
      radius: 2 * Math.hypot(cx - ex, cy - ey),
      ...forecastAtHour(cell.hours, hour),
    };
  });
  const weather = interpolateWeather(samples, x, y);
  return weather
    ? { ...weather, level: fieldLevel(weather.wind, weather.rain, weather.snow, plan.load_lb) }
    : null;
}
