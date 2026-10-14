import { describe, expect, it } from 'vitest';
import type { Plan, Route } from './contracts';
import {
  conditionsAt,
  forecastAtHour,
  hasTiming,
  positionAt,
  drivingAt,
  journeyDuration,
  stopAt,
} from './simulation';

const route = {
  duration_s: 110,
  geometry: {
    type: 'LineString',
    coordinates: [
      [-88, 42],
      [-87, 42],
      [-87, 43],
      [-87, 43],
    ],
  },
  geometry_elapsed_s: [0, 10, 110, 110],
} as Route;

describe('driving preview', () => {
  it('holds the truck during stops, advances the weather clock, and resumes at the same location', () => {
    const scheduled = {
      ...route,
      total_duration_s: 150,
      stops: [{ driving_elapsed_s: 10, start_elapsed_s: 10, end_elapsed_s: 50, duration_s: 40 }],
    } as Route;
    expect(journeyDuration(scheduled)).toBe(150);
    expect(positionAt(scheduled, 10)).toEqual([-87, 42]);
    expect(positionAt(scheduled, 30)).toEqual([-87, 42]);
    expect(positionAt(scheduled, 50)).toEqual([-87, 42]);
    expect(stopAt(scheduled, 30)).toBeDefined();
    expect(stopAt(scheduled, 50)).toBeUndefined();
    expect(drivingAt(scheduled, 100)).toBe(60);
    expect(positionAt(scheduled, 100)).toEqual([-87, 42.5]);
    expect(positionAt(scheduled, 150)).toEqual([-87, 43]);
  });
  it('follows road turns using segment time, not straight endpoint distance', () => {
    expect(positionAt(route, 5)).toEqual([-87.5, 42]);
    expect(positionAt(route, 10)).toEqual([-87, 42]);
    expect(positionAt(route, 60)).toEqual([-87, 42.5]);
  });
  it('keeps exact endpoints and clamps seeks beyond the journey', () => {
    expect(positionAt(route, -10)).toEqual([-88, 42]);
    expect(positionAt(route, 110)).toEqual([-87, 43]);
    expect(positionAt(route, 1000)).toEqual([-87, 43]);
  });
  it('skips zero-duration geometry without producing invalid positions', () => {
    const duplicated = { ...route, geometry_elapsed_s: [0, 0, 110, 110] };
    expect(positionAt(duplicated, 55)).toEqual([-87, 42.5]);
  });
  it('does not invent timing for old, mismatched, or nonmonotonic responses', () => {
    for (const times of [
      undefined,
      [0, 110],
      [0, 100, 90, 110],
      [0, 10, NaN, 110],
      [0, 10, 100, 109],
    ]) {
      const invalid = { ...route, geometry_elapsed_s: times };
      expect(hasTiming(invalid)).toBe(false);
      expect(positionAt(invalid, 10)).toBeNull();
    }
  });
  const hours = Array.from({ length: 49 }, (_, hour) => ({
    wind_mph: 10 + hour * 10,
    rain_in: hour * 0.2,
    snow_in: hour * 0.5,
    forecast_time: '2026-10-13T00:00:00Z',
    level: 0,
  }));
  it('interpolates weather variables before risk classification at fractional hours', () => {
    expect(forecastAtHour(hours, 0.5)).toEqual({ wind: 15, rain: 0.1, snow: 0.25 });
    expect(forecastAtHour(hours, 48).wind).toBe(490);
    expect(forecastAtHour(hours, 48).rain).toBeCloseTo(9.6);
    expect(forecastAtHour(hours, 48).snow).toBe(24);
    const plan = {
      load_lb: 38000,
      corridor: [
        {
          coordinate: [-88, 42],
          bounds: [
            [41.9, -88.1],
            [42.1, -87.9],
          ],
          hours,
        },
      ],
    } as Plan;
    expect(conditionsAt(plan, [-88, 42], 0.5)?.level).toBe(1);
    expect(conditionsAt(plan, [-88, 42], 3.5)?.level).toBe(4);
    expect(conditionsAt(plan, [-100, 42], 0)).toBeNull();
  });
});
