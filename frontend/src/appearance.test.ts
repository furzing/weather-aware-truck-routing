import { describe, expect, it } from 'vitest';
import { isNight } from './useAppearance';

describe('optional night schedule', () => {
  it('respects manual overrides and the local 20:00 / 06:00 boundaries', () => {
    for (const [hour, minute, expected] of [
      [19, 59, false],
      [20, 0, true],
      [5, 59, true],
      [6, 0, false],
    ] as const) {
      const date = new Date(2026, 9, 13, hour, minute);
      expect(isNight('auto', date)).toBe(expected);
      expect(isNight('light', date)).toBe(false);
      expect(isNight('dark', date)).toBe(true);
    }
  });
});
