import { useRef, useState } from 'react';
import {
  ArrowRight,
  Check,
  ChevronDown,
  Clock3,
  CloudSun,
  Layers,
  LoaderCircle,
  Route as RouteIcon,
  ShieldAlert,
  Truck,
  Wind,
} from 'lucide-react';
import { CitySearch } from './CitySearch';
import { RouteMap } from './RouteMap';
import {
  colors,
  dateTime,
  duration,
  labels,
  planSchema,
  responseBody,
  type Place,
  type Plan,
} from './contracts';

function initialDeparture() {
  const date = new Date(Date.now() + 3600_000);
  date.setMinutes(Math.ceil(date.getMinutes() / 15) * 15, 0, 0);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}
function RiskBadge({ level }: { level: number }) {
  return <span className={`risk-badge risk-${level}`}>{labels[level]}</span>;
}

export default function App() {
  const [origin, setOrigin] = useState<Place | null>({
    name: 'Chicago, Illinois, United States',
    longitude: -87.6298,
    latitude: 41.8781,
  });
  const [destination, setDestination] = useState<Place | null>({
    name: 'Detroit, Michigan, United States',
    longitude: -83.0458,
    latitude: 42.3314,
  });
  const [departure, setDeparture] = useState(initialDeparture);
  const [weight, setWeight] = useState('38000');
  const [spacing, setSpacing] = useState(25);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [selectedId, setSelectedId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [hour, setHour] = useState(0);
  const [heatmap, setHeatmap] = useState(true);
  const [focusIndex, setFocusIndex] = useState<number | null>(null);
  const controller = useRef<AbortController | null>(null);
  const route = plan?.routes.find((r) => r.id === selectedId);
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const currentInputs = JSON.stringify({ origin, destination, departure, weight, spacing });
  const [plannedInputs, setPlannedInputs] = useState('');
  const dirty = !!plan && currentInputs !== plannedInputs;

  function selectRoute(id: string) {
    setSelectedId(id);
    setFocusIndex(null);
  }
  async function submit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    if (!origin || !destination) {
      setError('Search for and select both cities before comparing routes.');
      return;
    }
    if (!departure || !Number.isFinite(new Date(departure).getTime())) {
      setError('Choose a valid departure date and time.');
      return;
    }
    const request = new AbortController();
    controller.current = request;
    const timeout = window.setTimeout(() => request.abort('timeout'), 95000);
    setBusy(true);
    try {
      const response = await fetch('/api/plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: request.signal,
        body: JSON.stringify({
          origin: { name: origin.name, coordinate: [origin.longitude, origin.latitude] },
          destination: {
            name: destination.name,
            coordinate: [destination.longitude, destination.latitude],
          },
          departure: new Date(departure).toISOString(),
          load_lb: Number(weight),
          spacing_miles: spacing,
        }),
      });
      const parsed = planSchema.safeParse(await responseBody(response));
      if (!parsed.success)
        throw new Error('The planner returned incomplete route data. Please retry.');
      setPlan(parsed.data);
      setSelectedId(parsed.data.recommended_id ?? parsed.data.routes[0].id);
      setHour(0);
      setFocusIndex(null);
      setPlannedInputs(currentInputs);
    } catch (e) {
      if (request.signal.aborted)
        setError(
          request.signal.reason === 'timeout'
            ? 'Planning took too long. Please retry or choose a shorter trip.'
            : 'Planning cancelled. Your trip inputs are preserved.',
        );
      else setError(e instanceof Error ? e.message : 'Planning failed. Please retry.');
    } finally {
      window.clearTimeout(timeout);
      setBusy(false);
    }
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="brand">
          <div className="brand-mark">
            <Truck size={23} aria-hidden="true" />
          </div>
          <span>
            Spotter<span className="brand-suffix"> / Route planner</span>
          </span>
        </div>
        <span className="assessment-label">Weather-Aware Truck Routing</span>
        <details className="about">
          <summary>
            About this tool <ChevronDown size={15} aria-hidden="true" />
          </summary>
          <div className="about-panel">
            <strong>Plan with weather in view.</strong>
            <p>
              This assessment compares forecast risk using the supplied wind, rain, snow, and load
              rules. It does not certify a route as safe for a truck.
            </p>
            <p>
              Road routes: OSRM car profile. Forecasts: Open-Meteo. Truck clearances, road
              restrictions, traffic, breaks, and hours of service are not included.
            </p>
          </div>
        </details>
      </header>
      <main>
        <aside className="sidebar" aria-label="Trip planning and route comparison">
          <section className="trip-section">
            <div className="section-heading">
              <RouteIcon size={20} aria-hidden="true" />
              <h1>Plan your trip</h1>
            </div>
            <p className="intro">Compare the weather ahead, before you choose a route.</p>
            <form onSubmit={(e) => void submit(e)}>
              <fieldset disabled={busy} className="trip-fields">
                <CitySearch label="Origin" value={origin} onChange={setOrigin} />
                <CitySearch label="Destination" value={destination} onChange={setDestination} />
                <div className="field">
                  <label htmlFor="departure">Departure</label>
                  <input
                    id="departure"
                    type="datetime-local"
                    required
                    value={departure}
                    onChange={(e) => setDeparture(e.target.value)}
                  />
                  <span className="field-message">{timezone} · within the next 72 hours</span>
                </div>
                <div className="form-row">
                  <div className="field">
                    <label htmlFor="load">
                      Load weight <span>(lb)</span>
                    </label>
                    <input
                      id="load"
                      type="number"
                      min="0"
                      max="80000"
                      step="1"
                      required
                      value={weight}
                      onChange={(e) => setWeight(e.target.value)}
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="spacing">Checkpoints</label>
                    <select
                      id="spacing"
                      value={spacing}
                      onChange={(e) => setSpacing(Number(e.target.value))}
                    >
                      <option value={10}>Every 10 mi</option>
                      <option value={25}>Every 25 mi</option>
                      <option value={50}>Every 50 mi</option>
                    </select>
                  </div>
                </div>
                <button type="submit" className="primary-button">
                  {busy ? (
                    <>
                      <LoaderCircle className="spinner" size={18} aria-hidden="true" /> Checking
                      routes & weather…
                    </>
                  ) : (
                    <>
                      Compare routes <ArrowRight size={18} aria-hidden="true" />
                    </>
                  )}
                </button>
              </fieldset>
              {busy && (
                <button
                  type="button"
                  className="text-button cancel-button"
                  onClick={() => controller.current?.abort()}
                >
                  Cancel planning
                </button>
              )}
              {error && (
                <div role="alert" className="error-message">
                  {error}
                </div>
              )}
              {dirty && (
                <p className="changed-message" role="status">
                  Trip inputs changed. Compare again to update the results.
                </p>
              )}
              <span className="sr-only" role="status">
                {busy
                  ? 'Checking three routes and weather at each arrival time.'
                  : plan
                    ? 'Route comparison ready.'
                    : ''}
              </span>
            </form>
          </section>
          <section className="routes-section" aria-labelledby="routes-heading">
            <div className="section-heading routes-heading">
              <h2 id="routes-heading">Route comparison</h2>
              <span>{plan ? '3 options' : 'Awaiting trip'}</span>
            </div>
            {!plan ? (
              <div className="empty-routes">
                <CloudSun size={31} aria-hidden="true" />
                <h3>See what’s ahead</h3>
                <p>
                  Three road routes, checked against the forecast at each checkpoint’s arrival time.
                </p>
                <ul>
                  <li>Wind, rain, and snowfall</li>
                  <li>Load-specific wind restrictions</li>
                  <li>Risk first. Travel time breaks ties.</li>
                </ul>
              </div>
            ) : (
              <>
                {!plan.recommended_id && (
                  <div className="no-travel-message" role="alert">
                    <ShieldAlert size={20} aria-hidden="true" />
                    <div>
                      <strong>No route recommended</strong>
                      <p>
                        All routes contain No Travel conditions. Delay departure and check again.
                      </p>
                    </div>
                  </div>
                )}
                <div className="route-options">
                  {plan.routes.map((r, i) => (
                    <button
                      type="button"
                      className={`route-option ${selectedId === r.id ? 'selected' : ''}`}
                      key={r.id}
                      aria-pressed={selectedId === r.id}
                      onClick={() => selectRoute(r.id)}
                    >
                      <div className="route-option-title">
                        <span className="route-number">{i + 1}</span>
                        <strong>{r.name}</strong>
                        {r.id === plan.recommended_id && (
                          <span className="recommended">
                            <Check size={13} aria-hidden="true" /> Recommended
                          </span>
                        )}
                      </div>
                      <div className="route-stats">
                        <span>{duration(r.duration_s)}</span>
                        <span>{Math.round(r.distance_miles)} mi</span>
                        <RiskBadge level={r.summary.max_risk} />
                      </div>
                      <div className="risk-bar" aria-label={`Risk miles for ${r.name}`}>
                        {labels.map((label, n) => (
                          <span
                            key={label}
                            style={{
                              width: `${(r.summary.risk_miles[label] / r.distance_miles) * 100}%`,
                              backgroundColor: colors[n],
                            }}
                            title={`${label}: ${r.summary.risk_miles[label].toFixed(1)} mi`}
                          />
                        ))}
                      </div>
                      <div className="route-risk-summary">
                        {r.summary.risk_miles['No Travel'] > 0
                          ? `${r.summary.risk_miles['No Travel'].toFixed(1)} mi No Travel · excluded`
                          : `${r.summary.risk_miles.Severe.toFixed(1)} mi Severe · ${r.summary.risk_miles.High.toFixed(1)} mi High`}
                        <br />
                        Average risk {r.summary.average_risk.toFixed(2)} / 4
                      </div>
                      {r.via_note.startsWith('Via') && (
                        <span className="via-note">Includes a corridor waypoint</span>
                      )}
                    </button>
                  ))}
                </div>
                <details className="method">
                  <summary>How the recommendation works</summary>
                  <p>{plan.recommendation_reason}</p>
                  <p>
                    Average risk is weighted by miles, on an ordinal 0–4 scale. Each interval uses
                    the worse of its two checkpoints. It is an estimate, not an accident
                    probability.
                  </p>
                  <p>
                    The forecast slider changes the corridor view. It does not change checkpoint
                    ETAs or recompute this trip.
                  </p>
                </details>
              </>
            )}
          </section>
          <details className="policy">
            <summary>Weather & load thresholds</summary>
            <div className="policy-content">
              <p>The highest wind, rain, or snow risk determines checkpoint risk.</p>
              <table>
                <caption>Thresholds (mph and in/hr)</caption>
                <thead>
                  <tr>
                    <th>Risk</th>
                    <th>Wind</th>
                    <th>Rain</th>
                    <th>Snow</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    ['Low', '<25', '<0.10', '<0.5'],
                    ['Moderate', '25–<35', '0.10–<0.25', '0.5–<1'],
                    ['High', '35–<45', '0.25–<0.50', '1–<2'],
                    ['Severe', '45–<55', '0.50–1.00', '2–3'],
                    ['No Travel', '≥55', '>1.00', '>3'],
                  ].map((row) => (
                    <tr key={row[0]}>
                      {row.map((cell, i) =>
                        i ? <td key={i}>{cell}</td> : <th key={i}>{cell}</th>,
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
              <p>
                45–&lt;55 mph + load &gt;30,000 lb: No Travel.
                <br />
                35–&lt;45 mph + load &gt;40,000 lb: Severe.
              </p>
            </div>
          </details>
        </aside>
        <div className="workspace">
          <section className="map-section" aria-label="Trip map">
            <RouteMap
              plan={plan}
              selectedId={selectedId}
              hour={hour}
              heatmap={heatmap}
              focusIndex={focusIndex}
              onSelect={selectRoute}
            />
            <div className="map-context">
              {route && plan ? (
                <>
                  <div className="map-context-title">
                    <strong>{route.name}</strong>
                    <RiskBadge level={route.summary.max_risk} />
                  </div>
                  <span>
                    {plan.origin.name.split(',')[0]} <ArrowRight size={14} aria-hidden="true" />{' '}
                    {plan.destination.name.split(',')[0]}
                  </span>
                  <div className="map-context-meta">
                    <span>
                      <Clock3 size={14} aria-hidden="true" /> {duration(route.duration_s)}
                    </span>
                    <span>{Math.round(route.distance_miles)} miles</span>
                    <span>{plan.load_lb.toLocaleString()} lb</span>
                  </div>
                </>
              ) : (
                <>
                  <strong>Your route, with the weather ahead</strong>
                  <span>Enter your trip and compare three alternatives.</span>
                </>
              )}
            </div>
            <div className="forecast-panel">
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
                  {plan ? dateTime(plan.forecast_hours[hour]) : 'Forecast starts at departure'}
                </span>
                <strong>+{hour}h</strong>
              </div>
              <input
                aria-label="Forecast hour after departure"
                className="forecast-slider"
                type="range"
                min="0"
                max="48"
                step="1"
                value={hour}
                onChange={(e) => setHour(Number(e.target.value))}
                disabled={!plan}
                aria-valuetext={`${hour} hours after departure`}
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
              <p className="forecast-source">
                Hourly forecast:{' '}
                <a href="https://open-meteo.com/" target="_blank" rel="noreferrer">
                  Open-Meteo
                </a>{' '}
                · sampled grid · cached up to 10 min
              </p>
            </div>
          </section>
          <section className="checkpoints-section" aria-labelledby="checkpoints-heading">
            <div className="checkpoint-heading">
              <div>
                <h2 id="checkpoints-heading">
                  Checkpoints {route && <span> / {route.checkpoints.length}</span>}
                </h2>
                <p>
                  {route
                    ? `Forecast at estimated arrival · every ${plan?.spacing_miles} miles · times in ${timezone}`
                    : 'Arrival times and weather appear here after comparing routes.'}
                </p>
              </div>
              {route && (
                <span className="arrival">
                  <Clock3 size={16} aria-hidden="true" /> Arrival {dateTime(route.arrival)}
                </span>
              )}
            </div>
            {route ? (
              <div className="table-scroll">
                <table className="checkpoint-table">
                  <thead>
                    <tr>
                      <th scope="col">Checkpoint</th>
                      <th scope="col">ETA</th>
                      <th scope="col">
                        <Wind size={14} aria-hidden="true" /> Wind
                      </th>
                      <th scope="col">Rain</th>
                      <th scope="col">Snow</th>
                      <th scope="col">Risk</th>
                    </tr>
                  </thead>
                  <tbody>
                    {route.checkpoints.map((p, i) => (
                      <tr key={i} className={focusIndex === i ? 'focused-row' : ''}>
                        <td>
                          <button
                            type="button"
                            className="checkpoint-link"
                            onClick={() => setFocusIndex(i)}
                            aria-label={`Show checkpoint ${i + 1} at mile ${Math.round(p.mile)} on map`}
                          >
                            {i === 0
                              ? 'Origin'
                              : i === route.checkpoints.length - 1
                                ? 'Destination'
                                : `Mile ${Math.round(p.mile)}`}
                            <ArrowRight size={13} aria-hidden="true" />
                          </button>
                        </td>
                        <td>{dateTime(p.eta)}</td>
                        <td>{p.weather.wind_mph.toFixed(1)} mph</td>
                        <td>{p.weather.rain_in.toFixed(2)} in/hr</td>
                        <td>{p.weather.snow_in.toFixed(2)} in/hr</td>
                        <td>
                          <details className="checkpoint-risk">
                            <summary>
                              <RiskBadge level={p.risk.level} />
                            </summary>
                            <p>
                              {p.risk.reasons.length
                                ? p.risk.reasons.join(' ')
                                : 'All conditions below the Moderate thresholds.'}{' '}
                              Forecast hour: {dateTime(p.weather.forecast_time)}.
                            </p>
                          </details>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="empty-table">
                <RouteIcon size={21} aria-hidden="true" />
                <p>Choose a route to inspect its checkpoints.</p>
              </div>
            )}
          </section>
          <footer className="workspace-footer">
            <ShieldAlert size={15} aria-hidden="true" />
            <span>
              Planning estimate only. Check truck restrictions and official road advisories before
              travel.
            </span>
          </footer>
        </div>
      </main>
    </div>
  );
}
