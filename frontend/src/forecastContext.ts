import { createContext, useContext } from 'react';
import type { Simulation } from './simulation';

export type State = { hour: number; simulation: Simulation };
export type Actions = {
  setHour: React.Dispatch<React.SetStateAction<number>>;
  setSimulation: React.Dispatch<React.SetStateAction<Simulation>>;
  configure: (duration: number, active: boolean) => void;
  pause: () => void;
  hide: () => void;
  reset: () => void;
  rewind: () => void;
  start: () => void;
};
export const StateContext = createContext<State | null>(null);
export const ActionsContext = createContext<Actions | null>(null);
export const VisibilityContext = createContext(false);

export function useForecastState() {
  const state = useContext(StateContext);
  if (!state) throw new Error('Forecast state requires ForecastClock.');
  return state;
}
export function useForecastActions() {
  const actions = useContext(ActionsContext);
  if (!actions) throw new Error('Forecast actions require ForecastClock.');
  return actions;
}
export function useSimulationVisible() {
  return useContext(VisibilityContext);
}
