import { CloudSun, Layers } from 'lucide-react';
import { dateTime, labels, colors, type Plan } from './contracts';
import { useForecastActions, useForecastState } from './forecastContext';

export function ForecastPanel({
  plan,
  sidebarView,
  heatmap,
  setHeatmap,
  navigate,
}: {
  plan: Plan | null;
  sidebarView: 'routes' | 'weather';
  heatmap: boolean;
  setHeatmap: React.Dispatch<React.SetStateAction<boolean>>;
  navigate: (event: React.MouseEvent<HTMLAnchorElement>) => void;
}) {
  const { hour, simulation } = useForecastState();
  const { setHour, setSimulation } = useForecastActions();
  const fieldHour = simulation.visible ? simulation.elapsed / 3600 : hour;
  return (
    <section
      className="forecast-panel"
      hidden={!plan || sidebarView !== 'weather'}
      aria-label="Corridor forecast"
    >
      <div className="forecast-heading">
        <div>
          <CloudSun size={20} aria-hidden="true" />
          <strong>Corridor forecast</strong>
        </div>
        <label className="layer-toggle">
          <input
            type="checkbox"
            checked={heatmap}
            onChange={(e) => setHeatmap(e.target.checked)}
            disabled={!plan}
          />
          <Layers size={15} aria-hidden="true" /> Weather layer
        </label>
      </div>
      <div className="forecast-time">
        <span>
          {plan
            ? dateTime(new Date(Date.parse(plan.departure) + fieldHour * 3600000).toISOString())
            : 'Forecast starts at departure'}
        </span>
        <strong>+{Number(fieldHour.toFixed(1))}h</strong>
      </div>
      <input
        aria-label="Forecast hour after departure"
        className="forecast-slider"
        type="range"
        min="0"
        max="48"
        step="0.1"
        value={Number(fieldHour.toFixed(1))}
        onChange={(e) => {
          setHour(Number(e.target.value));
          setSimulation((current) => ({ ...current, visible: false, playing: false }));
        }}
        disabled={!plan}
        aria-valuetext={`${Number(fieldHour.toFixed(1))} hours after departure`}
      />
      <div className="slider-labels">
        <span>Departure</span>
        <span>+12h</span>
        <span>+24h</span>
        <span>+36h</span>
        <span>+48h</span>
      </div>
      <div className="legend" aria-label="Risk legend">
        {labels.map((label, i) => (
          <span key={label}>
            <i style={{ backgroundColor: colors[i] }} />
            {label}
          </span>
        ))}
      </div>
      {plan && (
        <div className="forecast-freshness">
          <strong>Forecast retrieved</strong>
          <span>
            {plan.sources.forecast_retrieved_at
              ? dateTime(plan.sources.forecast_retrieved_at)
              : 'Timestamp unavailable'}
          </span>
          <p>
            Oldest retrieval across weather batches. This is not the model issue time. Cached for up
            to 10 minutes; displayed trips do not refresh automatically.
          </p>
        </div>
      )}
      <p className="weather-rules-link">
        <a href="/rules#weather" onClick={navigate}>
          Weather updates & map guide
        </a>
      </p>
      <p className="forecast-source">
        <a href="https://open-meteo.com/" target="_blank" rel="noreferrer">
          Open-Meteo
        </a>{' '}
        · interpolated hourly forecast
      </p>
    </section>
  );
}
