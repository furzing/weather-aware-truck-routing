import { memo, useId, useRef, useState } from 'react';
import { MapPin, Search } from 'lucide-react';
import { placesSchema, responseBody, type Place } from './contracts';

function CitySearchComponent({
  label,
  value,
  onChange,
}: {
  label: string;
  value: Place | null;
  onChange: (place: Place | null) => void;
}) {
  const id = useId();
  const [text, setText] = useState(value?.name ?? '');
  const [results, setResults] = useState<Place[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const request = useRef<AbortController | null>(null);
  const [active, setActive] = useState(-1);
  async function search() {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    setError('');
    setResults([]);
    setActive(-1);
    try {
      const response = await fetch(`/api/places?q=${encodeURIComponent(text.trim())}`, {
        signal: controller.signal,
      });
      const parsed = placesSchema.safeParse(await responseBody(response));
      if (!parsed.success) throw new Error('City search returned incomplete data. Please retry.');
      if (!controller.signal.aborted) {
        setResults(parsed.data.places);
        if (!parsed.data.places.length)
          setError('No cities found. Try a nearby city or a postal code.');
      }
    } catch (e) {
      if (!controller.signal.aborted)
        setError(e instanceof Error ? e.message : 'City search failed.');
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  }
  function choose(place: Place) {
    onChange(place);
    setText(place.name);
    setResults([]);
    setActive(-1);
  }
  return (
    <div className="city-search">
      <label htmlFor={id}>{label}</label>
      <div className="input-with-icon">
        <MapPin size={17} aria-hidden="true" />
        <input
          id={id}
          value={text}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={results.length > 0}
          aria-controls={`${id}-results`}
          aria-activedescendant={active >= 0 ? `${id}-${active}` : undefined}
          autoComplete="off"
          maxLength={100}
          placeholder="City or postal code"
          aria-describedby={error ? `${id}-error` : undefined}
          onChange={(e) => {
            request.current?.abort();
            setBusy(false);
            setText(e.target.value);
            onChange(null);
            setResults([]);
            setError('');
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              setResults([]);
              setActive(-1);
            }
            if (e.key === 'ArrowDown' && results.length) {
              e.preventDefault();
              setActive((active + 1) % results.length);
            }
            if (e.key === 'ArrowUp' && results.length) {
              e.preventDefault();
              setActive((active - 1 + results.length) % results.length);
            }
            if (e.key === 'Enter') {
              e.preventDefault();
              if (active >= 0 && results[active]) choose(results[active]);
              else if (text.trim().length >= 2) void search();
            }
          }}
        />
        <button
          type="button"
          className="search-button"
          aria-label={`Search ${label.toLowerCase()}`}
          disabled={busy || text.trim().length < 2}
          onClick={() => void search()}
        >
          <Search size={17} aria-hidden="true" />
        </button>
      </div>
      {busy && (
        <p className="field-message" role="status">
          Finding cities…
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="field-error" role="alert">
          {error}
        </p>
      )}
      {results.length > 0 && (
        <ul
          id={`${id}-results`}
          role="listbox"
          aria-label={`${label} cities`}
          className="city-results"
        >
          {results.map((place, i) => (
            <li
              key={`${place.longitude}:${place.latitude}`}
              id={`${id}-${i}`}
              role="option"
              aria-selected={active === i}
              onMouseDown={(e) => e.preventDefault()}
            >
              <button
                type="button"
                tabIndex={-1}
                className={active === i ? 'active' : ''}
                onClick={() => choose(place)}
              >
                {place.name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export const CitySearch = memo(CitySearchComponent);
