import { Play } from 'lucide-react';
import type { ComponentProps } from 'react';
import { RouteMap } from './RouteMap';
import { MapTools } from './MapTools';
import { SimulationControls } from './SimulationControls';
import { useForecastActions, useForecastState, useSimulationVisible } from './forecastContext';
import { positionAt } from './simulation';
import type { Plan, Route } from './contracts';

export function ForecastMap(
  props: Omit<ComponentProps<typeof RouteMap>, 'hour' | 'driverPosition'>,
) {
  const { hour, simulation } = useForecastState();
  const route = props.plan?.routes.find((r) => r.id === props.selectedId);
  return (
    <RouteMap
      {...props}
      hour={simulation.visible ? simulation.elapsed / 3600 : hour}
      driverPosition={simulation.visible && route ? positionAt(route, simulation.elapsed) : null}
    />
  );
}

export function ForecastMapTools(props: Omit<ComponentProps<typeof MapTools>, 'simulating'>) {
  const visible = useSimulationVisible();
  return <MapTools {...props} simulating={visible} />;
}

export function SimulationLauncher({
  disabled,
  onStart,
}: {
  disabled: boolean;
  onStart: () => void;
}) {
  const visible = useSimulationVisible();
  if (visible) return null;
  return (
    <button
      type="button"
      className="simulate-button"
      disabled={disabled}
      aria-expanded={false}
      onClick={onStart}
    >
      <Play size={15} aria-hidden="true" /> Simulate drive
    </button>
  );
}

export function DrivePreview({ plan, route }: { plan: Plan | null; route: Route | undefined }) {
  const { simulation } = useForecastState();
  const actions = useForecastActions();
  if (!simulation.visible || !plan || !route) return null;
  return (
    <SimulationControls
      plan={plan}
      route={route}
      state={simulation}
      onChange={actions.setSimulation}
      onClose={() => {
        actions.hide();
        actions.setHour(Math.min(48, Math.floor(simulation.elapsed / 3600)));
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
  );
}
