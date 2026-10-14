import { ArrowLeft, Truck } from 'lucide-react';
import { useEffect, useState } from 'react';

const sections = [
  ['recommendation', 'How the recommendation works'],
  ['thresholds', 'Weather & load thresholds'],
  ['weather', 'Weather updates'],
  ['hos', 'ELD & hours of service'],
  ['departure', 'Before departure'],
] as const;

export function Rules({
  onNavigate,
}: {
  onNavigate: (event: React.MouseEvent<HTMLAnchorElement>) => void;
}) {
  const [contentsOpen, setContentsOpen] = useState(
    () => window.matchMedia('(min-width: 761px)').matches,
  );
  useEffect(() => {
    const media = window.matchMedia('(min-width: 761px)');
    const change = (event: MediaQueryListEvent) => setContentsOpen(event.matches);
    media.addEventListener('change', change);
    return () => media.removeEventListener('change', change);
  }, []);
  return (
    <div className="rules-page">
      <aside className="rules-sidebar" aria-label="Rules navigation">
        <header className="app-header">
          <a className="brand" href="/" onClick={onNavigate} aria-label="Spotter route planner">
            <div className="brand-mark">
              <Truck size={23} aria-hidden="true" />
            </div>
            <span>
              Spotter<span className="brand-suffix"> / Route planner</span>
            </span>
          </a>
        </header>
        <nav className="rules-contents" aria-label="On this page">
          <a className="back-to-planner" href="/" onClick={onNavigate}>
            <ArrowLeft size={16} aria-hidden="true" /> Back to planner
          </a>
          <details
            className="rules-index"
            open={contentsOpen}
            onToggle={(event) => setContentsOpen(event.currentTarget.open)}
          >
            <summary>On this page</summary>
            <div>
              {sections.map(([id, title]) => (
                <a key={id} href={`#${id}`}>
                  {title}
                </a>
              ))}
            </div>
          </details>
        </nav>
      </aside>
      <main className="rules-main" tabIndex={-1}>
        <div className="rules-intro">
          <h1 tabIndex={-1}>Rules</h1>
          <p>
            What the planner checks, how to read the results, and what to confirm before dispatch.
          </p>
        </div>

        <section id="recommendation" aria-labelledby="recommendation-title">
          <h2 id="recommendation-title">How the recommendation works</h2>
          <p>
            Three road routes are compared using forecast conditions at each checkpoint’s estimated
            arrival. The same departure, load, and checkpoint spacing apply to all three.
          </p>
          <ol>
            <li>
              Exclude any route containing a No Travel checkpoint or sampled planned-stop weather.
            </li>
            <li>Prefer fewer Severe miles, then fewer High miles.</li>
            <li>Compare average risk, weighted by miles.</li>
            <li>
              Use total scheduled travel time, including planned breaks and rest, to break remaining
              ties.
            </li>
          </ol>
          <p>
            Each interval takes the worse risk of its two endpoints. Average risk uses an ordinal
            scale from 0 (Low) to 4 (No Travel); it is not an accident probability. Exact ties use a
            stable route order. If every route is excluded, no route is recommended.
          </p>
          <p>
            A recommendation means a lower ranking under this policy, not a guarantee of safe or
            legal passage. The engine uses explicit rules; it is not a trained AI model.
          </p>
          <details>
            <summary>Sampling and evidence limits</summary>
            <p>
              Checkpoints are 10, 25, or 50 miles apart, with both endpoints included. Local hazards
              can fall between samples. Denser checks can detect more variation but do not establish
              road conditions between checkpoints. The worse-endpoint rule can also overestimate a
              hazard’s extent.
            </p>
            <p>
              Automated checks cover threshold boundaries, ranking, missing data, and recorded
              provider replies. They do not establish forecast accuracy, truck suitability, or
              accident outcomes. Missing or invalid provider data causes a planning error instead of
              being treated as Low risk.
            </p>
          </details>
        </section>

        <section id="thresholds" aria-labelledby="thresholds-title">
          <h2 id="thresholds-title">Weather & load thresholds</h2>
          <p>
            These are the assessment’s supplied comparison rules, not FMCSA limits or a vehicle
            stability model. The highest wind, rain, or snow category determines checkpoint risk,
            then the load rules below apply.
          </p>
          <div
            className="rules-table-scroll"
            role="region"
            aria-label="Weather thresholds"
            tabIndex={0}
          >
            <table className="rules-table">
              <caption>Wind in mph · rain and snowfall in inches per hour</caption>
              <thead>
                <tr>
                  <th scope="col">Risk</th>
                  <th scope="col">Wind</th>
                  <th scope="col">Rain</th>
                  <th scope="col">Snow</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ['Low', '<25', '<0.10', '<0.5'],
                  ['Moderate', '25–<35', '0.10–<0.25', '0.5–<1'],
                  ['High', '35–<45', '0.25–<0.50', '1–<2'],
                  ['Severe', '45–<55', '0.50–1.00', '2–3'],
                  ['No Travel', '≥55', '>1.00', '>3'],
                ].map((row, index) => (
                  <tr key={row[0]}>
                    <th scope="row">
                      <span className={`risk-badge risk-${index}`}>{row[0]}</span>
                    </th>
                    {row.slice(1).map((cell, i) => (
                      <td key={i}>{cell}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul>
            <li>Wind 45–&lt;55 mph with load above 30,000 lb: No Travel.</li>
            <li>Wind 35–&lt;45 mph with load above 40,000 lb: at least Severe.</li>
          </ul>
          <p>
            The weight comparisons are strict: exactly 30,000 or 40,000 lb does not trigger its
            respective override. “Load weight” is the cargo input for this policy; it does not check
            gross vehicle weight, axle limits, permits, trailer type, or wind direction. No Travel
            is a planner exclusion, not a verified road closure.
          </p>
        </section>

        <section id="weather" aria-labelledby="weather-title">
          <h2 id="weather-title">Weather updates</h2>
          <p>
            The app connects to{' '}
            <a href="https://open-meteo.com/en/docs" target="_blank" rel="noreferrer">
              Open-Meteo’s forecast API
            </a>{' '}
            when you compare routes. It retrieves hourly wind, rain (including showers), and
            snowfall forecasts. These are model forecasts, not live roadside observations or radar.
          </p>
          <dl className="rules-definitions">
            <div>
              <dt>Retrieval and cache</dt>
              <dd>
                The Weather view shows the oldest retrieval time across forecast batches, not the
                weather model’s issue time. Responses may be reused for up to 10 minutes. An open
                trip does not automatically refresh.
              </dd>
            </div>
            <div>
              <dt>Check again</dt>
              <dd>
                Use Edit trip → Compare routes to request another comparison. Within the cache
                window it may reuse the same forecast. Update departure if it has moved; breaks and
                delays change when you encounter weather.
              </dd>
            </div>
            <div>
              <dt>Saved comparisons</dt>
              <dd>
                Completed trips, routes, checkpoints, and forecast snapshots are saved. Links expire
                after 7 days. The saved link reopens the original comparison without fetching new
                weather. Anyone with the link can view it; there are no user accounts or private
                trip lists. Use Compare routes again to update the forecast and schedule.
              </dd>
            </div>
            <div>
              <dt>Slider and map colors</dt>
              <dd>
                The 0–48 hour slider shows the corridor at one forecast time. Its smooth field
                interpolates sampled conditions for display. It does not recompute the
                recommendation or checkpoint arrival times. Route colors use the separate checkpoint
                forecasts at arrival.
              </dd>
            </div>
            <div>
              <dt>Times and units</dt>
              <dd>
                Departure and displayed times use your device’s time zone, shown with the trip. The
                backend matches forecasts in UTC. Rain and snowfall rates are converted to inches
                per hour; snow is snowfall depth, not accumulated snow on the road.
              </dd>
            </div>
          </dl>
          <details>
            <summary>Drive preview and assumptions</summary>
            <p>
              Simulate drive moves an estimated driver position along the selected road using the
              routing provider’s segment times. Play, pause, seek, reset, and playback speed change
              the preview only. It stops at the destination and pauses when you change routes, open
              Rules, or hide the browser tab.
            </p>
            <p>
              The weather field advances with simulated time, interpolating hourly wind, rain, and
              snowfall before applying the load policy. Conditions at the marker are interpolated
              estimates; the next High-or-worse checkpoint uses the original arrival-based sample.
              Playback makes no new weather requests and does not update the forecast. Using the
              corridor forecast slider exits the drive preview.
            </p>
            <p>
              With standard U.S. breaks & rest enabled, arrivals and playback include a 30-minute
              break before driving beyond 8 cumulative hours and 10 hours off duty before driving
              beyond 11 hours per shift. The truck stays still while forecast time advances. The
              optional continuous-driving view excludes those stops. Neither mode includes loading,
              inspections, parking searches, or live traffic. This is not GPS tracking or a verified
              legal schedule. A No Travel route can be inspected but stays excluded from
              recommendations. Check official road reports and the driver’s duty records before
              acting.
            </p>
          </details>
          <p>
            If a refresh fails, the previous trip remains visible with its original retrieval time.
            It has not been updated. Check official weather warnings and road reports before
            departure and as conditions change.
          </p>
          <details>
            <summary>Device location, appearance, and motion</summary>
            <p>
              Map settings offers Light, Dark, or Auto appearance. Auto uses 8 PM–6 AM in the
              device’s local timezone, not the trip’s departure time. Motion defaults to System,
              which respects the device’s reduced-motion preference. Choose Full animations to
              explicitly enable loading and marker animations, or Reduced motion to disable them.
              Elapsed-time feedback remains visible in every mode. Appearance and motion choices are
              saved in browser storage; trips and device coordinates are not.
            </p>
            <p>
              Device location starts only when you enable it and grant browser permission. The blue
              marker and accuracy circle show the device’s reported fix; they are separate from the
              simulated truck. Internet access alone does not guarantee a location fix. Watching
              pauses when the browser reports offline or you open Rules. Old fixes and errors are
              labelled; Stop device location removes the marker and ends the watch.
            </p>
            <p>
              Location is not sent to the planner API or stored by this app. Your browser may use
              device location services, and map tiles still load for the area you view. GPS does not
              move the forecast clock, reroute the trip, update weather, or supply ELD records.
              Hosted location access requires HTTPS; localhost is supported for local evaluation.
            </p>
          </details>
        </section>

        <section id="hos" aria-labelledby="hos-title">
          <h2 id="hos-title">ELD & hours of service</h2>
          <div className="rules-notice">
            <strong>No ELD is connected. Driver clocks are not checked.</strong>
            <p>
              Trip duration separates driving from planned breaks and rest. The default standard
              U.S. schedule assumes the driver starts immediately after qualifying rest, has the
              full 11-hour driving and 14-hour duty windows available, and has sufficient 60/70-hour
              cycle availability. With no other duty included, each modeled shift stays within those
              windows. Actual prior duty, loading, inspections, exceptions, and traffic are not
              evaluated. Confirm the driver’s ELD records; a 10-hour rest does not reset the weekly
              cycle. Estimated stop coordinates do not identify legal or available truck parking.
              The planner samples weather through each stop and excludes a route if any sampled stop
              weather is No Travel. Stop exposure does not add driven miles.
            </p>
          </div>
          <p>
            The baseline below covers U.S. federal interstate property-carrying operations under the
            general rules. State or intrastate rules, Alaska, Canada, Mexico, and exempt operations
            may differ. Confirm the applicable rules with the carrier.
          </p>
          <dl className="rules-definitions">
            <div>
              <dt>Driving limit</dt>
              <dd>Up to 11 hours of driving after 10 consecutive hours off duty.</dd>
            </div>
            <div>
              <dt>Driving window</dt>
              <dd>
                No driving after the 14th consecutive hour from coming on duty. Ordinary off-duty
                breaks do not pause this window.
              </dd>
            </div>
            <div>
              <dt>Driving break</dt>
              <dd>
                After 8 cumulative driving hours without a qualifying interruption, take at least 30
                consecutive minutes without driving before continuing. Consecutive non-driving duty
                statuses can be combined.
              </dd>
            </div>
            <div>
              <dt>Cycle limit</dt>
              <dd>
                No driving after 60 on-duty hours in 7 consecutive days, or 70 in 8, according to
                the carrier’s operating schedule. A qualifying 34-hour off-duty period can restart
                the cycle.
              </dd>
            </div>
          </dl>
          <p className="rules-source">
            Source:{' '}
            <a
              href="https://www.fmcsa.dot.gov/regulations/hours-service/summary-hours-service-regulations"
              target="_blank"
              rel="noreferrer"
            >
              FMCSA hours-of-service summary
            </a>
            . These are maximum limits, not the driver’s remaining availability.
          </p>
          <details>
            <summary>ELD records and driver review</summary>
            <p>
              In the actual ELD, review duty records, correct inaccuracies, add missing information,
              and certify the completed day. Annotate changes; later edits require recertification.
              Carrier-proposed changes require the driver’s confirmation or rejection, and original
              records must be retained. See{' '}
              <a
                href="https://www.ecfr.gov/current/title-49/subtitle-B/chapter-III/subchapter-B/part-395/subpart-B/section-395.30"
                target="_blank"
                rel="noreferrer"
              >
                49 CFR 395.30
              </a>
              .
            </p>
            <p>
              Automatically recorded driving while the truck is moving cannot simply be changed to
              non-driving time. Review unidentified driving and correct assignment through the ELD’s
              permitted process. See{' '}
              <a
                href="https://eld.fmcsa.dot.gov/FAQ/Topics?name=Recording_HOS_data"
                target="_blank"
                rel="noreferrer"
              >
                FMCSA ELD recording guidance
              </a>
              .
            </p>
            <p>
              Do not use log edits or personal conveyance to make a planned freight schedule fit.
              Personal conveyance is off-duty personal use, not advancing the carrier’s freight. See{' '}
              <a
                href="https://www.fmcsa.dot.gov/regulations/hours-service/personal-conveyance"
                target="_blank"
                rel="noreferrer"
              >
                FMCSA personal-conveyance guidance
              </a>
              .
            </p>
          </details>
          <details>
            <summary>Exceptions and adverse weather</summary>
            <p>
              Short-haul eligibility, sleeper-berth splits, team operations, and other exceptions
              require their own conditions and records. A short trip alone does not establish an
              exemption. This planner neither selects exceptions nor adds driving hours.
            </p>
            <p>
              The adverse-driving-conditions exception can allow up to two additional driving/window
              hours to complete the run or reach safety when qualifying unforeseen conditions
              prevent safe completion. It does not extend the 60/70-hour cycle. See{' '}
              <a
                href="https://www.ecfr.gov/current/title-49/subtitle-B/chapter-III/subchapter-B/part-395/subpart-A/section-395.1"
                target="_blank"
                rel="noreferrer"
              >
                49 CFR 395.1(b)
              </a>
              .
            </p>
            <p>
              Conditions must meet the rule’s “not known, or could not reasonably be known” test for
              the driver before the duty day or driving after qualifying rest, or for the carrier
              before dispatch. A poor forecast is not permission to plan an extension. See{' '}
              <a
                href="https://www.ecfr.gov/current/title-49/subtitle-B/chapter-III/subchapter-B/part-395/subpart-A/section-395.2"
                target="_blank"
                rel="noreferrer"
              >
                49 CFR 395.2
              </a>
              .
            </p>
          </details>
        </section>

        <section id="departure" aria-labelledby="departure-title">
          <h2 id="departure-title">Before departure</h2>
          <ul>
            <li>
              Check the driver’s remaining driving, duty-window, break, and cycle clocks in the ELD.
              Plan legal rest stops and parking with dispatch.
            </li>
            <li>
              Verify truck access, bridge clearances, weight and axle limits, hazmat restrictions,
              closures, permits, and border requirements.{' '}
              <a href="https://project-osrm.org/docs/v5.24.0/api/" target="_blank" rel="noreferrer">
                OSRM
              </a>{' '}
              supplies car-profile routes here; truck restrictions are not validated.
            </li>
            <li>
              Check official weather alerts and state or provincial road advisories. Fog, ice,
              gusts, flooding, visibility, traction, and crosswind exposure are not evaluated by
              these three weather thresholds.
            </li>
            <li>
              Reduce speed in hazardous conditions. Stop when conditions become sufficiently
              dangerous and resume only when safe, as required by{' '}
              <a
                href="https://www.ecfr.gov/current/title-49/subtitle-B/chapter-III/subchapter-B/part-392/subpart-B/section-392.14"
                target="_blank"
                rel="noreferrer"
              >
                49 CFR 392.14
              </a>
              . A Low label does not override conditions on the road.
            </li>
          </ul>
          <p>
            Driver and dispatcher judgment, applicable law, and official restrictions take priority
            over this comparison. Make changes while safely parked.
          </p>
        </section>
        <footer className="rules-footer">
          <p>
            Regulatory references checked 13 October 2026. The linked official sources govern; this
            page is a scoped planning reference, not an ELD or a compliance determination.
          </p>
          <a href="/" onClick={onNavigate}>
            Back to planner
          </a>
        </footer>
      </main>
    </div>
  );
}
