import { useEffect, useState } from 'react';

export function PlanningProgress({ restoring = false }: { restoring?: boolean }) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const started = performance.now();
    const timer = window.setInterval(
      () => setElapsed(Math.floor((performance.now() - started) / 1000)),
      1000,
    );
    return () => window.clearInterval(timer);
  }, []);
  return (
    <div className="planning-progress">
      <div
        className="planning-progress-track"
        role="progressbar"
        aria-label={restoring ? 'Loading saved comparison' : 'Checking routes and forecasts'}
      >
        <span />
      </div>
      <p>
        <span role="status">
          {restoring ? 'Loading saved comparison…' : 'Checking routes and forecasts…'}
        </span>
        <span aria-hidden="true"> {elapsed}s elapsed</span>
      </p>
      <p>
        {restoring
          ? 'Restoring the original results without refreshing weather.'
          : 'Public services can take up to 95 seconds. You can cancel below.'}
      </p>
    </div>
  );
}
