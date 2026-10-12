import { describe, expect, it } from 'vitest';
import { duration, planSchema, responseBody } from './contracts';

describe('user-facing contracts', () => {
  it('rounds driving time without displaying 60 minutes', () => {
    expect(duration(3599)).toBe('1h 00m');
    expect(duration(4500)).toBe('1h 15m');
  });
  it('rejects incomplete route results rather than rendering success', () => {
    expect(planSchema.safeParse({ routes: [], recommended_id: 'route-1' }).success).toBe(false);
  });
  it('preserves actionable API errors', async () => {
    const response = new Response(
      JSON.stringify({ error: { message: 'Choose a departure in the next 72 hours.' } }),
      { status: 400 },
    );
    await expect(responseBody(response)).rejects.toThrow('next 72 hours');
  });
  it('handles a non-JSON gateway failure', async () => {
    await expect(responseBody(new Response('<html>502</html>', { status: 502 }))).rejects.toThrow(
      'unreadable',
    );
  });
});
