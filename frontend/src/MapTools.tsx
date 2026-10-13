import { LocateFixed, Moon, Settings2, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { Appearance } from './useAppearance';
import type { useLocation } from './useLocation';

export function MapTools({
  appearance,
  onAppearance,
  location,
  onCenter,
}: {
  appearance: Appearance;
  onAppearance: (value: Appearance) => void;
  location: ReturnType<typeof useLocation>;
  onCenter: () => void;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);
  function close() {
    setOpen(false);
    trigger.current?.focus();
  }
  return (
    <div
      className="map-tools"
      ref={root}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && open) {
          event.stopPropagation();
          close();
        }
      }}
    >
      <div className="map-tool-buttons">
        <button
          type="button"
          className="icon-button"
          aria-label="Map settings"
          aria-expanded={open}
          aria-controls="map-settings"
          ref={trigger}
          onClick={() => setOpen(!open)}
        >
          <Settings2 size={19} aria-hidden="true" />
        </button>
        <button
          type="button"
          className="icon-button location-toggle"
          aria-label={location.enabled ? 'Stop device location' : 'Enable device location'}
          aria-pressed={location.enabled}
          title={location.status}
          onClick={location.toggle}
        >
          <LocateFixed size={19} aria-hidden="true" />
        </button>
      </div>
      <section id="map-settings" className="map-settings" aria-label="Map settings" hidden={!open}>
        <div>
          <strong>Map settings</strong>
          <button
            type="button"
            className="icon-button"
            aria-label="Close map settings"
            onClick={close}
          >
            <X size={17} />
          </button>
        </div>
        <label htmlFor="appearance">
          <Moon size={16} aria-hidden="true" /> Appearance
        </label>
        <select
          id="appearance"
          value={appearance}
          onChange={(event) => onAppearance(event.target.value as Appearance)}
        >
          <option value="light">Light</option>
          <option value="dark">Dark</option>
          <option value="auto">Auto · by local time</option>
        </select>
        <p>Auto uses night mode from 8 PM to 6 AM on this device.</p>
        <strong>Device location</strong>
        <p>{location.status}</p>
        {location.fix && (
          <button type="button" className="secondary-button" onClick={onCenter}>
            Center on location
          </button>
        )}
        <p>
          Permission required. Location is not sent to the planner API or stored. It does not
          reroute or update weather.
        </p>
      </section>
      {(location.enabled || location.error) && (
        <p className="location-status" role="status">
          {location.status}
        </p>
      )}
    </div>
  );
}
