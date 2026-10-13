import { useEffect, useState } from 'react';

export type LocationFix = { coordinate: [number, number]; accuracy: number; timestamp: number };
export function useLocation(activePage: boolean) {
  const [enabled, setEnabled] = useState(false);
  const [online, setOnline] = useState(() => navigator.onLine);
  const [fix, setFix] = useState<LocationFix | null>(null);
  const [error, setError] = useState('');
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);
  useEffect(() => {
    if (!enabled || !online || !activePage || !navigator.geolocation || !window.isSecureContext)
      return;
    let active = true;
    const watch = navigator.geolocation.watchPosition(
      (position) => {
        if (!active) return;
        const { longitude, latitude, accuracy } = position.coords;
        if (
          !Number.isFinite(longitude) ||
          Math.abs(longitude) > 180 ||
          !Number.isFinite(latitude) ||
          Math.abs(latitude) > 90 ||
          !Number.isFinite(accuracy) ||
          accuracy < 0 ||
          !Number.isFinite(position.timestamp)
        ) {
          setError('The device returned an invalid location.');
          return;
        }
        setFix({ coordinate: [longitude, latitude], accuracy, timestamp: position.timestamp });
        setError('');
        setNow(Date.now());
      },
      (failure) => {
        if (!active) return;
        setError(
          failure.code === 1
            ? 'Location permission denied. Enable it in browser settings to retry.'
            : failure.code === 3
              ? 'Location timed out. Waiting for another fix.'
              : 'Device location unavailable. Waiting for another fix.',
        );
        if (failure.code === 1) setEnabled(false);
      },
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 15000 },
    );
    const timer = window.setInterval(() => setNow(Date.now()), 10000);
    return () => {
      active = false;
      navigator.geolocation.clearWatch(watch);
      window.clearInterval(timer);
    };
  }, [enabled, online, activePage]);
  function toggle() {
    setError('');
    setFix(null);
    if (!navigator.geolocation || !window.isSecureContext) {
      setError('Location requires a supported browser on HTTPS or localhost.');
      return;
    }
    setEnabled((previous) => !previous);
  }
  const stale = !!fix && now - fix.timestamp > 60000;
  const status =
    (enabled && !online ? 'Location paused · browser offline' : error) ||
    (!enabled
      ? 'Location off'
      : !online
        ? 'Location paused · browser offline'
        : stale
          ? 'Location fix is over 1 minute old'
          : fix
            ? `Device location · ±${Math.round(fix.accuracy)} m`
            : 'Waiting for device location…');
  return { enabled, online, fix: enabled ? fix : null, stale, error, status, toggle };
}
