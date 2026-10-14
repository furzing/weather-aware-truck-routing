import { describe, it, expect } from 'vitest';
import { spatialSupport, rasterize } from './weatherRaster';
import { interpolateWeather, fieldLevel } from './weatherField';

describe('cached spatial forecast rendering', () => {
  it('matches direct interpolation, exact samples, outside support, and each time frame', () => {
    const samples = [
      { x: 0, y: 0, radius: 8 },
      { x: 5, y: 3, radius: 6 },
      { x: 8, y: 8, radius: 2 },
    ];
    const support = spatialSupport(samples, 14, 12);
    const rgb = [
      [1, 2, 3],
      [11, 12, 13],
      [21, 22, 23],
      [31, 32, 33],
      [41, 42, 43],
    ];
    for (let hour = 0; hour <= 48; hour++) {
      const weather = samples.map((_, i) => ({
        wind: hour * 1.3 + i * 8,
        rain: hour * 0.013 + i * 0.1,
        snow: hour * 0.05,
      }));
      const pixels = rasterize(support, weather, 38000, rgb);
      for (let y = 0; y < 12; y++)
        for (let x = 0; x < 14; x++) {
          const direct = interpolateWeather(
            samples.map((s, i) => ({ ...s, ...weather[i] })),
            x,
            y,
          );
          const actual = [...pixels.slice((y * 14 + x) * 4, (y * 14 + x) * 4 + 4)];
          if (!direct || !direct.opacity) {
            expect(actual).toEqual([0, 0, 0, 0]);
            continue;
          }
          const level = fieldLevel(direct.wind, direct.rain, direct.snow, 38000);
          expect(actual).toEqual([...rgb[level], Math.round((level ? 95 : 36) * direct.opacity)]);
        }
    }
  });
});
