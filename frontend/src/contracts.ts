import { z } from 'zod';

export const labels = ['Low', 'Moderate', 'High', 'Severe', 'No Travel'] as const;
export const colors = ['#207258', '#a66a09', '#d25b23', '#b12f42', '#622a70'] as const;
const coordinate = z.tuple([z.number(), z.number()]);
const level = z.number().int().min(0).max(4);
const weather = z.object({
  wind_mph: z.number(),
  rain_in: z.number(),
  snow_in: z.number(),
  forecast_time: z.string(),
});
const risk = z.object({ level, label: z.enum(labels), reasons: z.array(z.string()) });
const checkpoint = z.object({
  mile: z.number(),
  coordinate,
  elapsed_s: z.number(),
  eta: z.string(),
  weather,
  risk,
});
const stop = z.object({
  kind: z.enum(['break', 'rest']),
  driving_elapsed_s: z.number(),
  start_elapsed_s: z.number(),
  end_elapsed_s: z.number(),
  duration_s: z.number(),
  coordinate,
  mile: z.number(),
  arrival: z.string(),
  departure: z.string(),
  weather,
  risk,
});
const route = z.object({
  id: z.string(),
  name: z.string(),
  via_note: z.string(),
  geometry: z.object({ type: z.literal('LineString'), coordinates: z.array(coordinate) }),
  geometry_elapsed_s: z.array(z.number().finite().nonnegative()).optional(),
  segments: z.array(z.object({ coordinates: z.array(coordinate), level })),
  distance_miles: z.number(),
  duration_s: z.number(),
  total_duration_s: z.number().optional(),
  stop_duration_s: z.number().optional(),
  stops: z.array(stop).optional(),
  arrival: z.string(),
  checkpoints: z.array(checkpoint),
  summary: z.object({
    risk_miles: z.record(z.enum(labels), z.number()),
    average_risk: z.number(),
    max_risk: level,
    eligible: z.boolean(),
    duration_s: z.number(),
  }),
});
export const placeSchema = z.object({
  name: z.string(),
  longitude: z.number(),
  latitude: z.number(),
});
export const placesSchema = z.object({ places: z.array(placeSchema) });
export const planSchema = z.object({
  trip_id: z.uuid().optional(),
  expires_at: z.iso.datetime({ offset: true }).optional(),
  routes: z.array(route).length(3),
  recommended_id: z.string().nullable(),
  recommendation_reason: z.string(),
  generated_at: z.string(),
  corridor: z.array(
    z.object({
      coordinate,
      bounds: z.tuple([coordinate, coordinate]),
      hours: z.array(weather.extend({ level })).length(49),
    }),
  ),
  forecast_hours: z.array(z.string()).length(49),
  departure: z.string(),
  origin: z.object({ name: z.string(), coordinate }),
  destination: z.object({ name: z.string(), coordinate }),
  load_lb: z.number(),
  spacing_miles: z.number(),
  schedule_breaks: z.boolean().optional(),
  sources: z.object({
    routing: z.string(),
    weather: z.string(),
    forecast_locations: z.number(),
    forecast_retrieved_at: z.string().nullable(),
    forecast_latest_retrieved_at: z.string().nullable(),
    forecast_cached_batches: z.number(),
  }),
  warnings: z.array(z.string()),
});
export type Place = z.infer<typeof placeSchema>;
export type Plan = z.infer<typeof planSchema>;
export type Route = z.infer<typeof route>;
export type Checkpoint = z.infer<typeof checkpoint>;

export function duration(seconds: number) {
  const minutes = Math.round(seconds / 60);
  return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, '0')}m`;
}
const dateTimeFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  timeZoneName: 'short',
});
export function dateTime(value: string) {
  return dateTimeFormatter.format(new Date(value));
}
export async function responseBody(response: Response): Promise<unknown> {
  let data: unknown;
  try {
    data = await response.json();
  } catch {
    throw new Error('The planner returned an unreadable response. Please retry.');
  }
  if (!response.ok) {
    const problem = z.object({ error: z.object({ message: z.string() }) }).safeParse(data);
    throw new Error(
      problem.success ? problem.data.error.message : 'The planner is unavailable. Please retry.',
    );
  }
  return data;
}
