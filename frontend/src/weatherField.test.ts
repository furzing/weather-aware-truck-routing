import { describe, expect, it } from 'vitest';
import { fieldLevel, interpolateWeather, type Sample } from './weatherField';
import scenarios from '../../backend/routing/fixtures/scenarios.json';

const sample: Sample = { x: 0, y: 0, radius: 20, wind: 60, rain: 0.5, snow: 1 };
describe('forecast field display', () => {
  it('agrees with the same independent route scenarios used to check the server', () => {
    for (const scenario of scenarios)
      scenario.routes.forEach((route, i) => {
        const [, , wind, rain, snow] = route;
        expect(fieldLevel(wind, rain, snow, scenario.load), scenario.name).toBe(scenario.levels[i]);
      });
  });
  it('preserves the exact weather at a sample, including hazardous wind', () => {
    expect(interpolateWeather([sample], 0, 0)).toEqual({
      wind: 60,
      rain: 0.5,
      snow: 1,
      opacity: 1,
    });
    expect(fieldLevel(60, 0.5, 1, 0)).toBe(4);
  });
  it('does not paint outside supported samples', () => {
    expect(interpolateWeather([sample], 100, 100)).toBeNull();
  });
  it('interpolates physical variables symmetrically rather than averaging risk labels', () => {
    const value = interpolateWeather(
      [
        { ...sample, x: -5, wind: 20 },
        { ...sample, x: 5, wind: 40 },
      ],
      0,
      0,
    );
    expect(value?.wind).toBeCloseTo(30);
    expect(value?.rain).toBeCloseTo(0.5);
  });
  it('uses strict load and precipitation boundaries in the display policy', () => {
    for (const [wind, rain, snow, load, expected] of [
      [24.99, 0, 0, 0, 0],
      [25, 0, 0, 0, 1],
      [35, 0, 0, 40000, 2],
      [35, 0, 0, 40001, 3],
      [45, 0, 0, 30000, 3],
      [45, 0, 0, 30001, 4],
      [55, 0, 0, 0, 4],
      [0, 0.25, 0, 0, 2],
      [0, 0.5, 0, 0, 3],
      [0, 1, 0, 0, 3],
      [0, 1.001, 0, 0, 4],
      [0, 0, 1, 0, 2],
      [0, 0, 3, 0, 3],
      [0, 0, 3.001, 0, 4],
    ])
      expect(fieldLevel(wind, rain, snow, load)).toBe(expected);
  });
});
