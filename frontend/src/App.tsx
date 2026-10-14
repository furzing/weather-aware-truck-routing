import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  Check,
  ChevronDown,
  Clock3,
  ClipboardList,
  CloudSun,
  LoaderCircle,
  Route as RouteIcon,
  ShieldAlert,
  Truck,
  SlidersHorizontal,
  Wind,
  X,
} from 'lucide-react';
import { CitySearch } from './CitySearch';
import { ForecastMap, ForecastMapTools, DrivePreview, SimulationLauncher } from './ForecastViews';
import { ForecastPanel } from './ForecastPanel';
import { ForecastClock } from './ForecastClock';
import { useForecastActions } from './forecastContext';
import { Rules } from './Rules';
import { CheckpointDrawer } from './CheckpointDrawer';
import { hasTiming, journeyDuration } from './simulation';
import { useAppearance } from './useAppearance';
import { useMotion } from './useMotion';
import { useLocation } from './useLocation';
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
  return (
    <ForecastClock>
      <Planner />
    </ForecastClock>
  );
}

function Planner() {
  const clock = useForecastActions();
  const [page, setPage] = useState(() =>
    window.location.pathname.startsWith('/rules') ? 'rules' : 'planner',
  );
  const { appearance, setAppearance } = useAppearance();
  const { motion, setMotion } = useMotion();
  const location = useLocation(page === 'planner');
  const [locationFocus, setLocationFocus] = useState(0);
  useEffect(() => {
    const onPopState = () => {
      clock.pause();
      setPage(window.location.pathname.startsWith('/rules') ? 'rules' : 'planner');
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [clock]);
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
    const tripId = plan?.trip_id ?? restoreId;
    if (tripId) url.searchParams.set('trip', tripId);
    window.history.pushState(null, '', url.pathname + url.search + url.hash);
    clock.pause();
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
  const [restoreId] = useState(() => new URLSearchParams(window.location.search).get('trip'));
  const [busy, setBusy] = useState(!!restoreId);
  const [restoring, setRestoring] = useState(!!restoreId);
  const [error, setError] = useState('');
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
  useEffect(() => {
    clock.configure(route ? journeyDuration(route) : 0, page === 'planner');
  }, [clock, route, page]);
  useEffect(() => {
    if (!restoreId) return;
    const request = new AbortController();
    controller.current = request;
    const timeout = window.setTimeout(() => request.abort('timeout'), 15000);
    async function restore() {
      try {
        if (
          !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(restoreId!)
        )
          throw new Error('This saved comparison link is invalid. Compare a new trip.');
        const response = await fetch(`/api/plans/${restoreId}`, { signal: request.signal });
        const parsed = planSchema.safeParse(await responseBody(response));
        if (!parsed.success)
          throw new Error(
            'The saved comparison contains incomplete route data. Compare a new trip.',
          );
        const saved = parsed.data;
        if (request.signal.aborted) return;
        const restoredOrigin = {
          name: saved.origin.name,
          longitude: saved.origin.coordinate[0],
          latitude: saved.origin.coordinate[1],
        };
        const restoredDestination = {
          name: saved.destination.name,
          longitude: saved.destination.coordinate[0],
          latitude: saved.destination.coordinate[1],
        };
        const date = new Date(saved.departure);
        const localDeparture = new Date(date.getTime() - date.getTimezoneOffset() * 60000)
          .toISOString()
          .slice(0, 16);
        setOrigin(restoredOrigin);
        setDestination(restoredDestination);
        setDeparture(localDeparture);
        setWeight(String(saved.load_lb));
        setSpacing(saved.spacing_miles);
        setScheduleBreaks(saved.schedule_breaks ?? true);
        setPlannedInputs(
          JSON.stringify({
            origin: restoredOrigin,
            destination: restoredDestination,
            departure: localDeparture,
            weight: String(saved.load_lb),
            spacing: saved.spacing_miles,
            scheduleBreaks: saved.schedule_breaks ?? true,
          }),
        );
        setPlan(saved);
        if (saved.trip_id) {
          const url = new URL(window.location.href);
          url.searchParams.set('trip', saved.trip_id);
          window.history.replaceState(null, '', url.pathname + url.search + url.hash);
        }
        setSelectedId(saved.recommended_id ?? saved.routes[0].id);
        setEditingTrip(false);
        setMobilePanel(false);
        clock.reset();
      } catch (failure) {
        if (request.signal.reason === 'unmount') return;
        setError(
          request.signal.aborted
            ? 'Loading the saved comparison stopped. Compare a new trip or reopen the link.'
            : failure instanceof Error
              ? failure.message
              : 'Saved comparison could not be loaded.',
        );
      } finally {
        window.clearTimeout(timeout);
        if (request.signal.reason !== 'unmount') {
          setBusy(false);
          setRestoring(false);
        }
      }
    }
    void restore();
    return () => {
      request.abort('unmount');
      window.clearTimeout(timeout);
    };
  }, [restoreId, clock]);

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

  const selectRoute = useCallback(
    (id: string) => {
      setSelectedId(id);
      setFocusIndex(null);
      clock.rewind();
      if (window.matchMedia('(max-width: 760px)').matches) {
        setMobilePanel(false);
        window.requestAnimationFrame(() =>
          document.querySelector<HTMLButtonElement>('.mobile-routes')?.focus(),
        );
      }
    },
    [clock, setSelectedId, setFocusIndex, setMobilePanel],
  );
  function openMobileView(view: 'routes' | 'weather') {
    setSidebarView(view);
    setEditingTrip(false);
    setMobilePanel(!(mobilePanel && sidebarView === view && !editingTrip));
    setCheckpointsOpen(false);
    clock.hide();
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
    clock.hide();
  }
  function startSimulation() {
    clock.start();
    setHeatmap(true);
    setMobilePanel(false);
    setCheckpointsOpen(false);
    setFocusIndex(null);
  }
  function toggleCheckpoints() {
    setCheckpointsOpen(!checkpointsOpen);
    setMobilePanel(false);
    clock.hide();
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
    clock.pause();
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
      if (parsed.data.trip_id) {
        const url = new URL(window.location.href);
        url.searchParams.set('trip', parsed.data.trip_id);
        window.history.replaceState(null, '', url.pathname + url.search + url.hash);
      }
      setEditingTrip(false);
      setMobilePanel(false);
      setSelectedId(parsed.data.recommended_id ?? parsed.data.routes[0].id);
      clock.reset();
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
  }, [route, focusIndex, setFocusIndex]);

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
                    <p className="field-message">
                      Completed comparisons get a saved link that expires after 7 days. Anyone with
                      the link can view the trip and its original forecast.
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
                    {busy && <PlanningProgress restoring={restoring} />}
                    <button type="submit" className="primary-button" disabled={busy}>
                      {busy ? (
                        <>
                          <LoaderCircle className="spinner" size={18} aria-hidden="true" />
                          {restoring ? 'Loading saved comparison…' : 'Checking routes & weather…'}
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
                        {restoring ? 'Cancel loading' : 'Cancel planning'}
                      </button>
                    )}
                  </div>
                  <span className="sr-only" role="status">
                    {busy
                      ? restoring
                        ? 'Loading the original saved comparison.'
                        : 'Checking three routes and weather at each arrival time.'
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
                  {plan.trip_id && plan.expires_at && (
                    <p className="driving-note">
                      <a href={`/?trip=${plan.trip_id}`}>Reopen saved comparison</a> · available
                      until {dateTime(plan.expires_at)}. Anyone with the link can view this trip.
                      Reopening preserves the original forecast; compare again to update it.
                    </p>
                  )}
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
            <ForecastPanel
              plan={plan}
              sidebarView={sidebarView}
              heatmap={heatmap}
              setHeatmap={setHeatmap}
              navigate={navigate}
            />
            <p className="sidebar-warning">
              Planning estimate only. Check truck restrictions and official road advisories before
              travel.
            </p>
          </div>
        </aside>
        <div className="workspace">
          <section className="map-section" aria-label="Trip map">
            <ForecastMap
              plan={plan}
              selectedId={selectedId}
              heatmap={heatmap}
              focusIndex={focusIndex}
              onSelect={selectRoute}
              fitRequest={fitRequest}
              locationFix={location.fix}
              locationStale={location.stale || !location.online || !!location.error}
              locationFocus={locationFocus}
            />
            <ForecastMapTools
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
              onNavigate={navigate}
            />
          </section>
          <DrivePreview plan={plan} route={route} />
          <div className="map-toolbar">
            <span>
              {route
                ? `${route.name} · ${duration(journeyDuration(route))} trip · ${Math.round(route.distance_miles)} mi`
                : 'Compare a trip to see routes and weather'}
            </span>
            <div>
              <SimulationLauncher
                disabled={!route || !hasTiming(route) || dirty || busy}
                onStart={startSimulation}
              />
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
