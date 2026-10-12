// Visual interpolation only. Route eligibility and ranking remain server-owned.
export type Sample = {
  x: number;
  y: number;
  radius: number;
  wind: number;
  rain: number;
  snow: number;
};

export function interpolateWeather(samples: Sample[], x: number, y: number) {
  let weight = 0,
    wind = 0,
    rain = 0,
    snow = 0,
    nearest = Infinity;
  for (const s of samples) {
    const d2 = (s.x - x) ** 2 + (s.y - y) ** 2;
    const relative = Math.sqrt(d2) / s.radius;
    if (relative > 1) continue;
    nearest = Math.min(nearest, relative);
    if (d2 < 0.000001) return { wind: s.wind, rain: s.rain, snow: s.snow, opacity: 1 };
    const w = (1 - relative) ** 2 / d2;
    weight += w;
    wind += s.wind * w;
    rain += s.rain * w;
    snow += s.snow * w;
  }
  if (!weight) return null;
  return {
    wind: wind / weight,
    rain: rain / weight,
    snow: snow / weight,
    opacity: Math.min(1, (1 - nearest) * 4),
  };
}

export function fieldLevel(wind: number, rain: number, snow: number, load: number) {
  let w = [25, 35, 45, 55].filter((t) => wind >= t).length;
  if (wind >= 45 && load > 30000) w = 4;
  else if (wind >= 35 && load > 40000) w = Math.max(w, 3);
  const r = rain > 1 ? 4 : [0.1, 0.25, 0.5].filter((t) => rain >= t).length;
  const s = snow > 3 ? 4 : [0.5, 1, 2].filter((t) => snow >= t).length;
  return Math.max(w, r, s);
}
