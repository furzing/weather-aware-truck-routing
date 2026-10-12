import { Pause, Play, RotateCcw, X } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { conditionsAt, positionAt, type Simulation } from './simulation';
import { dateTime, duration, labels, type Plan, type Route } from './contracts';

export function SimulationControls({
  plan,
  route,
  state,
  onChange,
  onClose,
}: {
  plan: Plan;
  route: Route;
  state: Simulation;
  onChange: (next: Simulation) => void;
  onClose: () => void;
}) {
  const playButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    playButton.current?.focus({ preventScroll: true });
  }, []);
  const coordinate = positionAt(route, state.elapsed);
  const weather = coordinate ? conditionsAt(plan, coordinate, state.elapsed / 3600) : null;
  const arrived = state.elapsed >= route.duration_s;
  const next = arrived
    ? undefined
    : route.checkpoints.find((point) => point.elapsed_s >= state.elapsed && point.risk.level >= 2);
  const at = new Date(Date.parse(plan.departure) + state.elapsed * 1000).toISOString();
  return (
    <section className="simulation-panel" aria-label="Drive simulation">
      <div className="simulation-topline">
        <strong>
          Drive preview <span>· {route.name}</span>
        </strong>
        <span>{dateTime(at)}</span>
        <button
          type="button"
          className="icon-button"
          aria-label="Close simulation"
          onClick={onClose}
        >
          <X size={18} />
        </button>
      </div>
      <div className="simulation-controls">
        <button
          type="button"
          className="simulation-play"
          ref={playButton}
          aria-label={
            state.playing ? 'Pause simulation' : arrived ? 'Replay simulation' : 'Play simulation'
          }
          onClick={() =>
            onChange({ ...state, playing: !state.playing, elapsed: arrived ? 0 : state.elapsed })
          }
        >
          {state.playing ? <Pause size={18} /> : <Play size={18} />}
        </button>
        <input
          aria-label="Simulated driving time"
          type="range"
          min={0}
          max={Math.ceil(route.duration_s)}
          step={1}
          value={arrived ? Math.ceil(route.duration_s) : Math.round(state.elapsed)}
          aria-valuetext={`${duration(state.elapsed)} of ${duration(route.duration_s)}`}
          onChange={(event) =>
            onChange({
              ...state,
              elapsed: Math.min(route.duration_s, Number(event.target.value)),
              playing: false,
            })
          }
        />
        <span className="simulation-elapsed">
          {duration(state.elapsed)} / {duration(route.duration_s)}
        </span>
        <label className="simulation-speed">
          <span className="sr-only">Simulation speed</span>
          <select
            value={state.rate}
            onChange={(event) => onChange({ ...state, rate: Number(event.target.value) })}
          >
            <option value={360}>1h / 10s</option>
            <option value={720}>1h / 5s</option>
            <option value={1800}>1h / 2s</option>
          </select>
        </label>
        <button
          className="icon-button"
          type="button"
          aria-label="Reset simulation"
          onClick={() => onChange({ ...state, elapsed: 0, playing: false })}
        >
          <RotateCcw size={17} />
        </button>
      </div>
      <div className="simulation-conditions">
        <span>
          {arrived ? 'Estimated arrival' : 'Estimated conditions'}
          {weather ? (
            <>
              {' '}
              <span className={`risk-badge risk-${weather.level}`}>{labels[weather.level]}</span> ·
              Wind {weather.wind.toFixed(1)} mph · Rain {weather.rain.toFixed(2)} · Snow{' '}
              {weather.snow.toFixed(2)} in/hr
            </>
          ) : (
            ' · Outside sampled forecast coverage'
          )}
        </span>
        {!route.summary.eligible ? (
          <span className="simulation-excluded">
            No Travel on this route; excluded from recommendations.
          </span>
        ) : next ? (
          <span>
            Next {next.risk.label} checkpoint: mile {Math.round(next.mile)} · {dateTime(next.eta)}
          </span>
        ) : (
          <span>No High-or-worse samples ahead.</span>
        )}
        {weather && weather.level >= 2 && (
          <span>Check road reports; reduce speed or stop as conditions require.</span>
        )}
        {route.duration_s > 11 * 3600 ? (
          <span>Over the standard U.S. 11-hour allowance: plan rest or driver changes.</span>
        ) : route.duration_s > 8 * 3600 ? (
          <span>Over 8 hours driving: review break timing against duty records.</span>
        ) : null}
      </div>
      <p className="simulation-disclaimer">Estimate · no rest/traffic · not live tracking.</p>
    </section>
  );
}
