import { fieldLevel, type Sample } from './weatherField';
import type { Plan } from './contracts';
import { forecastAtHour } from './simulation';

// Cache spatial weights once per viewport. Changing time only mixes weather values.
export function spatialSupport(
  samples: Pick<Sample, 'x' | 'y' | 'radius'>[],
  width: number,
  height: number,
) {
  const offsets = new Uint32Array(width * height + 1);
  const opacity = new Float64Array(width * height);
  const totals = new Float64Array(width * height);
  const indices: number[] = [],
    weights: number[] = [];
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const pixel = y * width + x;
      offsets[pixel] = indices.length;
      let nearest = Infinity,
        total = 0;
      for (let i = 0; i < samples.length; i++) {
        const s = samples[i],
          d2 = (s.x - x) ** 2 + (s.y - y) ** 2;
        const relative = Math.sqrt(d2) / s.radius;
        if (relative > 1) continue;
        nearest = Math.min(nearest, relative);
        if (d2 < 0.000001) {
          indices.length = weights.length = offsets[pixel];
          indices.push(i);
          weights.push(1);
          total = 1;
          nearest = 0;
          break;
        }
        const w = (1 - relative) ** 2 / d2;
        indices.push(i);
        weights.push(w);
        total += w;
      }
      if (total) {
        opacity[pixel] = Math.min(1, (1 - nearest) * 4);
        totals[pixel] = total;
      }
    }
  offsets[width * height] = indices.length;
  return {
    offsets,
    opacity,
    totals,
    indices: new Uint16Array(indices),
    weights: new Float64Array(weights),
  };
}

export function rasterize(
  support: ReturnType<typeof spatialSupport>,
  weather: { wind: number; rain: number; snow: number }[],
  load: number,
  rgb: number[][],
) {
  const pixels = new Uint8ClampedArray(support.opacity.length * 4);
  for (let p = 0; p < support.opacity.length; p++) {
    if (!support.opacity[p]) continue;
    let wind = 0,
      rain = 0,
      snow = 0;
    for (let i = support.offsets[p]; i < support.offsets[p + 1]; i++) {
      const w = weather[support.indices[i]],
        weight = support.weights[i];
      wind += w.wind * weight;
      rain += w.rain * weight;
      snow += w.snow * weight;
    }
    const total = support.totals[p];
    const level = fieldLevel(wind / total, rain / total, snow / total, load);
    pixels.set(rgb[level], p * 4);
    pixels[p * 4 + 3] = Math.round((level ? 95 : 36) * support.opacity[p]);
  }
  return pixels;
}

export type WeatherView = {
  width: number;
  height: number;
  samples: Pick<Sample, 'x' | 'y' | 'radius'>[];
};
export type WeatherJob = { id: number; view?: WeatherView; hour: number };
export type WeatherInit = { corridor: Plan['corridor']; load: number; rgb: number[][] };
export { forecastAtHour };
