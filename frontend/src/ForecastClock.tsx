import { useEffect, useMemo, useRef, useState } from 'react';
import { initialSimulation } from './simulation';
import { StateContext, ActionsContext, VisibilityContext, type Actions } from './forecastContext';

// Only forecast/map/playback leaves subscribe to the changing clock. Planner
// inputs and route/checkpoint lists consume stable commands, not clock state.
export function ForecastClock({ children }: { children: React.ReactNode }) {
  const [hour, setHour] = useState(0);
  const [simulation, setSimulation] = useState(initialSimulation);
  const configuration = useRef({ duration: 0, active: true });
  const actions = useMemo<Actions>(() => {
    const pause = () =>
      setSimulation((current) => (current.playing ? { ...current, playing: false } : current));
    return {
      setHour,
      setSimulation,
      pause,
      configure: (duration, active) => {
        configuration.current = { duration, active };
        if (!active) pause();
      },
      hide: () => setSimulation((current) => ({ ...current, visible: false, playing: false })),
      reset: () => {
        setHour(0);
        setSimulation(initialSimulation);
      },
      rewind: () => setSimulation((current) => ({ ...current, playing: false, elapsed: 0 })),
      start: () => {
        const { duration, active } = configuration.current;
        if (!active || duration <= 0) return;
        setSimulation((current) => ({
          ...current,
          visible: true,
          playing: true,
          elapsed: current.elapsed >= duration ? 0 : current.elapsed,
        }));
      },
    };
  }, []);
  useEffect(() => {
    if (!simulation.playing) return;
    let frame = 0;
    let previous = performance.now();
    const tick = (now: number) => {
      if (now - previous >= 80) {
        const delta = Math.min(0.25, (now - previous) / 1000) * simulation.rate;
        previous = now;
        setSimulation((current) => {
          if (!current.playing || !configuration.current.active) return current;
          const elapsed = Math.min(configuration.current.duration, current.elapsed + delta);
          return { ...current, elapsed, playing: elapsed < configuration.current.duration };
        });
      }
      frame = window.requestAnimationFrame(tick);
    };
    const hidden = () => {
      if (document.hidden) actions.pause();
    };
    document.addEventListener('visibilitychange', hidden);
    frame = window.requestAnimationFrame(tick);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener('visibilitychange', hidden);
    };
  }, [simulation.playing, simulation.rate, actions]);
  return (
    <ActionsContext value={actions}>
      <VisibilityContext value={simulation.visible}>
        <StateContext value={{ hour, simulation }}>{children}</StateContext>
      </VisibilityContext>
    </ActionsContext>
  );
}
