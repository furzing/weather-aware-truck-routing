import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  Check,
  ChevronDown,
  Clock3,
  ClipboardList,
  CloudSun,
  Layers,
  LoaderCircle,
  Play,
  Route as RouteIcon,
  ShieldAlert,
  Truck,
  SlidersHorizontal,
  Wind,
  X,
} from 'lucide-react';
import { CitySearch } from './CitySearch';
import { RouteMap } from './RouteMap';
import { Rules } from './Rules';
import { CheckpointDrawer } from './CheckpointDrawer';
import { SimulationControls } from './SimulationControls';
import { hasTiming, initialSimulation, positionAt, journeyDuration } from './simulation';
import { useAppearance } from './useAppearance';
import { useMotion } from './useMotion';
import { useLocation } from './useLocation';
import { MapTools } from './MapTools';
import { PlanningProgress } from './PlanningProgress';
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
const deviceTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
function RiskBadge({ level }: { level: number }) {
  return <span className={`risk-badge risk-${level}`}>{labels[level]}</span>;
}

export default function App() {
  const [page, setPage] = useState(() =>
    window.location.pathname.startsWith('/rules') ? 'rules' : 'planner',
  );
  const [simulation, setSimulation] = useState(initialSimulation);
  const { appearance, setAppearance } = useAppearance();
  const { motion, setMotion } = useMotion();
  const location = useLocation(page === 'planner');
  const [locationFocus, setLocationFocus] = useState(0);
  useEffect(() => {
    const onPopState = () => {
      setSimulation((previous) => ({ ...previous, playing: false }));
      setPage(window.location.pathname.startsWith('/rules') ? 'rules' : 'planner');
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);
  useEffect(() => {
    document.title = page === 'rules' ? 'Rules | Spotter route planner' : 'Spotter | Route planner';
    const frame = window.requestAnimationFrame(() => {
      const target =
        page === 'rules'
          ? document.querySelector<HTMLElement>('.rules-intro h1')
          : document.querySelector<HTMLElement>('.app-shell main');
      target?.focus({ preventScroll: true });
      if (page === 'rules' && window.location.hash) {
        document.getElementById(window.location.hash.slice(1))?.scrollIntoView();
      } else window.scrollTo(0, 0);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [page]);

  function navigate(event: React.MouseEvent<HTMLAnchorElement>) {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
      return;
    event.preventDefault();
    const url = new URL(event.currentTarget.href);
    window.history.pushState(null, '', url.pathname + url.hash);
    setSimulation((previous) => ({ ...previous, playing: false }));
    setPage(url.pathname.startsWith('/rules') ? 'rules' : 'planner');
  }
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
  const [scheduleBreaks, setScheduleBreaks] = useState(true);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [selectedId, setSelectedId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [hour, setHour] = useState(0);
  const [heatmap, setHeatmap] = useState(true);
  const [fitRequest, setFitRequest] = useState(0);
  const [editingTrip, setEditingTrip] = useState(true);
  const [sidebarView, setSidebarView] = useState<'routes' | 'weather'>('routes');
  const [checkpointsOpen, setCheckpointsOpen] = useState(false);
  const [mobilePanel, setMobilePanel] = useState(true);
  const [focusIndex, setFocusIndex] = useState<number | null>(null);
  const controller = useRef<AbortController | null>(null);
  const route = plan?.routes.find((r) => r.id === selectedId);
  const timezone = deviceTimezone;
  const currentInputs = JSON.stringify({
    origin,
    destination,
    departure,
    weight,
    spacing,
    scheduleBreaks,
  });
  const [plannedInputs, setPlannedInputs] = useState('');
  const dirty = !!plan && currentInputs !== plannedInputs;
  const driveDuration = route ? journeyDuration(route) : 0;
  const fieldHour = simulation.visible ? simulation.elapsed / 3600 : hour;
  const driverPosition = simulation.visible && route ? positionAt(route, simulation.elapsed) : null;
  useEffect(() => {
    if (!simulation.playing || page !== 'planner') return;
    let frame = 0,
      previous = performance.now();
    const tick = (now: number) => {
      if (now - previous >= 80) {
        const delta = Math.min(0.25, (now - previous) / 1000) * simulation.rate;
        previous = now;
        setSimulation((current) => {
          if (!current.playing) return current;
          const elapsed = Math.min(driveDuration, current.elapsed + delta);
          return { ...current, elapsed, playing: elapsed < driveDuration };
        });
      }
      frame = window.requestAnimationFrame(tick);
    };
    const pauseWhenHidden = () => {
      if (document.hidden) setSimulation((current) => ({ ...current, playing: false }));
    };
    document.addEventListener('visibilitychange', pauseWhenHidden);
    frame = window.requestAnimationFrame(tick);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener('visibilitychange', pauseWhenHidden);
    };
  }, [simulation.playing, simulation.rate, driveDuration, page]);

  function closeCheckpoints() {
    setCheckpointsOpen(false);
    window.requestAnimationFrame(() =>
      document
        .querySelector<HTMLButtonElement>(
          window.matchMedia('(max-width: 760px)').matches
            ? '.mobile-checkpoints'
            : '.map-toolbar .checkpoint-toggle',
        )
        ?.focus(),
    );
  }

  const selectRoute = useCallback((id: string) => {
    setSelectedId(id);
    setFocusIndex(null);
    setSimulation((current) => ({ ...current, playing: false, elapsed: 0 }));
    if (window.matchMedia('(max-width: 760px)').matches) {
      setMobilePanel(false);
      window.requestAnimationFrame(() =>
        document.querySelector<HTMLButtonElement>('.mobile-routes')?.focus(),
      );
    }
  }, []);
  function openMobileView(view: 'routes' | 'weather') {
    setSidebarView(view);
    setEditingTrip(false);
    setMobilePanel(!(mobilePanel && sidebarView === view && !editingTrip));
    setCheckpointsOpen(false);
    setSimulation((current) => ({ ...current, visible: false, playing: false }));
  }
  function closeMobilePanel() {
    setMobilePanel(false);
    window.requestAnimationFrame(() =>
      document.querySelector<HTMLButtonElement>('.mobile-trip-toggle')?.focus(),
    );
  }
  function openTrip() {
    setEditingTrip(true);
    setMobilePanel(!(mobilePanel && editingTrip));
    setCheckpointsOpen(false);
    setSimulation((current) => ({ ...current, visible: false, playing: false }));
  }
  function startSimulation() {
    setSimulation((current) => ({
      ...current,
      visible: true,
      playing: true,
      elapsed: current.elapsed >= driveDuration ? 0 : current.elapsed,
    }));
    setHeatmap(true);
    setMobilePanel(false);
    setCheckpointsOpen(false);
    setFocusIndex(null);
  }
  function toggleCheckpoints() {
    setCheckpointsOpen(!checkpointsOpen);
    setMobilePanel(false);
    setSimulation((current) => ({ ...current, visible: false, playing: false }));
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
    setSimulation((current) => ({ ...current, playing: false }));
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
          schedule_breaks: scheduleBreaks,
        }),
      });
      const parsed = planSchema.safeParse(await responseBody(response));
      if (!parsed.success)
        throw new Error('The planner returned incomplete route data. Please retry.');
      setPlan(parsed.data);
      setEditingTrip(false);
      setMobilePanel(false);
      setSelectedId(parsed.data.recommended_id ?? parsed.data.routes[0].id);
      setHour(0);
      setSimulation(initialSimulation);
      setFocusIndex(null);
      setPlannedInputs(currentInputs);
      if (window.matchMedia('(max-width: 760px)').matches)
        window.requestAnimationFrame(() =>
          document.querySelector<HTMLButtonElement>('.mobile-routes')?.focus(),
        );
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

  // These lists do not change when the forecast clock or simulation advances.
  const routeOptions = useMemo(
    () =>
      plan?.routes.map((r, i) => (
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
            <span>{duration(journeyDuration(r))} trip</span>
            <span>{Math.round(r.distance_miles)} mi</span>
            <RiskBadge level={r.summary.max_risk} />
          </div>
          <div className="route-risk-summary">
            {duration(r.duration_s)} driving · {duration(r.stop_duration_s ?? 0)} stops
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
            {!r.summary.eligible
              ? `${r.summary.risk_miles['No Travel'].toFixed(1)} mi No Travel${r.stops?.some((s) => s.risk.level === 4) ? ' · stop affected' : ''} · excluded`
              : `${r.summary.risk_miles.Severe.toFixed(1)} mi Severe · ${r.summary.risk_miles.High.toFixed(1)} mi High`}
            <br />
            Average risk {r.summary.average_risk.toFixed(2)} / 4
          </div>
          {r.via_note.startsWith('Via') && (
            <span className="via-note">Includes a corridor waypoint</span>
          )}
        </button>
      )),
    [plan, selectedId, selectRoute],
  );
  const checkpointRows = useMemo(() => {
    if (!route) return null;
    return route.checkpoints.map((p, i) => (
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
        <td data-label="ETA">{dateTime(p.eta)}</td>
        <td data-label="Wind">{p.weather.wind_mph.toFixed(1)} mph</td>
        <td data-label="Rain">{p.weather.rain_in.toFixed(2)} in/hr</td>
        <td data-label="Snow">{p.weather.snow_in.toFixed(2)} in/hr</td>
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
    ));
  }, [route, focusIndex]);

  if (page === 'rules') return <Rules onNavigate={navigate} />;

  return (
    <div className="app-shell">
      <main tabIndex={-1} aria-label="Route planner">
        <aside
          className={`sidebar ${mobilePanel ? 'mobile-open' : ''}`}
          aria-label="Trip planning and route comparison"
        >
          <header className="app-header">
            <div className="brand">
              <div className="brand-mark">
                <Truck size={23} aria-hidden="true" />
              </div>
              <span>
                Spotter<span className="brand-suffix"> / Route planner</span>
              </span>
            </div>
          </header>
          <div
            id="planning-panel"
            className={`sidebar-body ${plan && !editingTrip ? 'results-panel' : 'editing-panel'}`}
            onKeyDown={(event) => {
              if (event.key === 'Escape' && window.matchMedia('(max-width: 760px)').matches) {
                event.stopPropagation();
                closeMobilePanel();
              }
            }}
          >
            <div className="mobile-panel-heading">
              <strong>
                {editingTrip
                  ? 'Trip details'
                  : sidebarView === 'routes'
                    ? 'Route options'
                    : 'Corridor forecast'}
              </strong>
              <button
                type="button"
                className="icon-button"
                aria-label="Close planning panel"
                onClick={closeMobilePanel}
              >
                <X size={18} />
              </button>
            </div>
            <nav className="planner-navigation" aria-label="Planner navigation">
              <span aria-current="page">Planner</span>
              <a href="/rules" onClick={navigate}>
                Rules
              </a>
            </nav>
            <section className="trip-section">
              {plan && !editingTrip && (
                <div className="trip-summary">
                  <div>
                    <strong>
                      {plan.origin.name.split(',')[0]} → {plan.destination.name.split(',')[0]}
                    </strong>
                    <span>
                      {dateTime(plan.departure)} · {plan.load_lb.toLocaleString()} lb
                    </span>
                  </div>
                  <button
                    type="button"
                    className="text-button"
                    onClick={() => setEditingTrip(true)}
                  >
                    Edit trip
                  </button>
                </div>
              )}
              <div hidden={!!plan && !editingTrip}>
                <div className="section-heading">
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
                    <label className="schedule-option">
                      <input
                        type="checkbox"
                        checked={scheduleBreaks}
                        onChange={(e) => setScheduleBreaks(e.target.checked)}
                      />
                      <span>Include standard U.S. breaks & rest</span>
                    </label>
                    <p className="field-message schedule-assumption">
                      30 min after 8h driving; 10h rest after 11h. Assumes fresh shift and
                      sufficient cycle hours. No ELD connected.
                    </p>
                  </fieldset>
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
                  <div className="planning-actions">
                    {busy && <PlanningProgress />}
                    <button type="submit" className="primary-button" disabled={busy}>
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
                    {busy && (
                      <button
                        type="button"
                        className="text-button cancel-button"
                        onClick={() => controller.current?.abort()}
                      >
                        Cancel planning
                      </button>
                    )}
                  </div>
                  <span className="sr-only" role="status">
                    {busy
                      ? 'Checking three routes and weather at each arrival time.'
                      : plan
                        ? 'Route comparison ready.'
                        : ''}
                  </span>
                </form>
              </div>
            </section>
            {plan && (
              <nav className="sidebar-views" aria-label="Planning views">
                <button
                  type="button"
                  aria-pressed={sidebarView === 'routes'}
                  onClick={() => setSidebarView('routes')}
                >
                  Routes
                </button>
                <button
                  type="button"
                  aria-pressed={sidebarView === 'weather'}
                  onClick={() => setSidebarView('weather')}
                >
                  Weather
                </button>
              </nav>
            )}
            <section
              className="routes-section"
              hidden={!!plan && sidebarView !== 'routes'}
              aria-labelledby="routes-heading"
            >
              <div className="section-heading routes-heading">
                <h2 id="routes-heading">Route comparison</h2>
                <span>{plan ? '3 options' : 'Awaiting trip'}</span>
              </div>
              {!plan ? (
                <div className="empty-routes">
                  <CloudSun size={31} aria-hidden="true" />
                  <h3>See what’s ahead</h3>
                  <p>
                    Three road routes, checked against the forecast at each checkpoint’s arrival
                    time.
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
                  <div className="route-options">{routeOptions}</div>
                  {!!route?.stops?.length && (
                    <details className="planned-stops">
                      <summary>Planned stops / {route.stops.length}</summary>
                      <ol>
                        {route.stops.map((stop, i) => (
                          <li key={i}>
                            <strong>
                              {stop.kind === 'rest' ? '10-hour rest' : '30-minute break'} · mile{' '}
                              {Math.round(stop.mile)}
                            </strong>
                            <span>
                              {dateTime(stop.arrival)} → {dateTime(stop.departure)}
                            </span>
                            <span>
                              Worst sampled stop weather: <RiskBadge level={stop.risk.level} />
                            </span>
                          </li>
                        ))}
                      </ol>
                      <p>
                        Timing estimates on the road; no truck-parking locations have been verified.
                      </p>
                    </details>
                  )}
                  <p className="recommendation-explanation">{plan.recommendation_reason}</p>
                  <p className="driving-note">
                    {plan.schedule_breaks
                      ? 'Arrivals include planned U.S. breaks and rest, assuming fresh duty clocks. Stop locations are estimates; verify parking and actual ELD records.'
                      : 'Arrival estimates exclude breaks and rest. Driver clocks are not checked.'}{' '}
                    <a href="/rules#hos" onClick={navigate}>
                      ELD & hours of service
                    </a>
                  </p>
                  {route && !plan.schedule_breaks && route.duration_s > 8 * 3600 && (
                    <p className="driving-note" aria-live="polite">
                      {route.duration_s > 11 * 3600
                        ? 'This route exceeds the standard U.S. 11-hour driving allowance for one driver. Schedule qualifying rest or a driver change before using these arrival times.'
                        : 'This route exceeds 8 hours of estimated driving. Check the driver’s break timing against their duty records.'}
                    </p>
                  )}
                </>
              )}
            </section>
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
                    ? dateTime(
                        new Date(Date.parse(plan.departure) + fieldHour * 3600000).toISOString(),
                      )
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
                    Oldest retrieval across weather batches. This is not the model issue time.
                    Cached for up to 10 minutes; displayed trips do not refresh automatically.
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
            <p className="sidebar-warning">
              Planning estimate only. Check truck restrictions and official road advisories before
              travel.
            </p>
          </div>
        </aside>
        <div className="workspace">
          <section className="map-section" aria-label="Trip map">
            <RouteMap
              plan={plan}
              selectedId={selectedId}
              hour={fieldHour}
              heatmap={heatmap}
              focusIndex={focusIndex}
              onSelect={selectRoute}
              fitRequest={fitRequest}
              driverPosition={driverPosition}
              locationFix={location.fix}
              locationStale={location.stale || !location.online || !!location.error}
              locationFocus={locationFocus}
            />
            <MapTools
              motion={motion}
              onMotion={setMotion}
              appearance={appearance}
              onAppearance={setAppearance}
              location={location}
              onCenter={() => setLocationFocus((previous) => previous + 1)}
              onFit={() => {
                setFocusIndex(null);
                setFitRequest((previous) => previous + 1);
              }}
              onSimulate={startSimulation}
              canFit={!!plan}
              canSimulate={!!route && hasTiming(route) && !dirty && !busy}
              simulating={simulation.visible}
              onNavigate={navigate}
            />
          </section>
          {simulation.visible && plan && route && (
            <SimulationControls
              plan={plan}
              route={route}
              state={simulation}
              onChange={setSimulation}
              onClose={() => {
                setSimulation((current) => ({ ...current, visible: false, playing: false }));
                setHour(Math.min(48, Math.floor(simulation.elapsed / 3600)));
                window.requestAnimationFrame(() =>
                  document
                    .querySelector<HTMLButtonElement>(
                      window.matchMedia('(max-width: 760px)').matches
                        ? '.mobile-simulate'
                        : '.map-toolbar .simulate-button',
                    )
                    ?.focus(),
                );
              }}
            />
          )}
          <div className="map-toolbar">
            <span>
              {route
                ? `${route.name} · ${duration(journeyDuration(route))} trip · ${Math.round(route.distance_miles)} mi`
                : 'Compare a trip to see routes and weather'}
            </span>
            <div>
              {!simulation.visible && (
                <button
                  type="button"
                  className="simulate-button"
                  disabled={!route || !hasTiming(route) || dirty || busy}
                  aria-expanded={simulation.visible}
                  onClick={startSimulation}
                >
                  <Play size={15} aria-hidden="true" /> Simulate drive
                </button>
              )}
              <button
                type="button"
                className="text-button"
                onClick={() => {
                  setFocusIndex(null);
                  setFitRequest(fitRequest + 1);
                }}
                disabled={!plan}
              >
                Fit routes
              </button>
              <button
                type="button"
                className="checkpoint-toggle"
                aria-expanded={checkpointsOpen}
                aria-controls="checkpoint-details"
                onClick={toggleCheckpoints}
                disabled={!route}
              >
                Checkpoints{route ? ` (${route.checkpoints.length})` : ''}{' '}
                <ChevronDown size={15} aria-hidden="true" />
              </button>
            </div>
          </div>
          <CheckpointDrawer open={checkpointsOpen} onClose={closeCheckpoints}>
            <div className="checkpoint-heading">
              <div>
                <h2 id="checkpoints-heading">
                  Checkpoints {route && <span> / {route.checkpoints.length}</span>}
                </h2>
                <p>
                  {route
                    ? `${plan?.schedule_breaks ? 'Arrival includes planned breaks & rest' : 'Arrival excludes breaks and rest'} · every ${plan?.spacing_miles} miles · times in ${timezone}`
                    : 'Arrival times and weather appear here after comparing routes.'}
                </p>
              </div>
              {route && (
                <span className="arrival">
                  <Clock3 size={16} aria-hidden="true" /> Est. arrival {dateTime(route.arrival)}
                </span>
              )}
              <button
                type="button"
                className="icon-button"
                aria-label="Hide checkpoints"
                onClick={closeCheckpoints}
              >
                <X size={18} />
              </button>
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
                  <tbody>{checkpointRows}</tbody>
                </table>
              </div>
            ) : (
              <div className="empty-table">
                <RouteIcon size={21} aria-hidden="true" />
                <p>Choose a route to inspect its checkpoints.</p>
              </div>
            )}
          </CheckpointDrawer>
        </div>
        <nav className="mobile-planning-actions" aria-label="Mobile planning views">
          <button
            type="button"
            className="mobile-trip-toggle"
            aria-label={plan ? 'Edit trip' : 'Trip details'}
            aria-pressed={mobilePanel && editingTrip}
            aria-controls="planning-panel"
            onClick={openTrip}
          >
            <SlidersHorizontal size={18} aria-hidden="true" />
            <span>Trip</span>
          </button>
          <button
            type="button"
            className="mobile-routes"
            aria-label="Show routes"
            disabled={!plan}
            aria-pressed={mobilePanel && sidebarView === 'routes' && !editingTrip}
            aria-controls="planning-panel"
            onClick={() => openMobileView('routes')}
          >
            <RouteIcon size={18} aria-hidden="true" />
            <span>Routes</span>
          </button>
          <button
            type="button"
            aria-label="Show weather"
            disabled={!plan}
            aria-pressed={mobilePanel && sidebarView === 'weather' && !editingTrip}
            aria-controls="planning-panel"
            onClick={() => openMobileView('weather')}
          >
            <CloudSun size={18} aria-hidden="true" />
            <span>Weather</span>
          </button>
          <button
            type="button"
            className="mobile-checkpoints checkpoint-toggle"
            aria-label={`Checkpoints${route ? ` (${route.checkpoints.length})` : ''}`}
            disabled={!route}
            aria-expanded={checkpointsOpen}
            aria-controls="checkpoint-details"
            onClick={toggleCheckpoints}
          >
            <ClipboardList size={18} aria-hidden="true" />
            <span>Checkpoints</span>
          </button>
        </nav>
      </main>
    </div>
  );
}
