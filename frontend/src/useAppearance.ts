import { useEffect, useState } from 'react';

export type Appearance = 'light' | 'dark' | 'auto';
export function isNight(mode: Appearance, date: Date) {
  return mode === 'dark' || (mode === 'auto' && (date.getHours() >= 20 || date.getHours() < 6));
}

export function useAppearance() {
  const [appearance, setAppearance] = useState<Appearance>(() => {
    try {
      const saved = localStorage.getItem('spotter-appearance');
      return saved === 'dark' || saved === 'auto' ? saved : 'light';
    } catch {
      return 'light';
    }
  });
  useEffect(() => {
    const apply = () => {
      const dark = isNight(appearance, new Date());
      document.documentElement.dataset.theme = dark ? 'dark' : 'light';
      document
        .querySelector('meta[name="theme-color"]')
        ?.setAttribute('content', dark ? '#172426' : '#102d2b');
    };
    apply();
    try {
      localStorage.setItem('spotter-appearance', appearance);
    } catch {
      // Appearance still works for this session when browser storage is unavailable.
    }
    const timer = window.setInterval(apply, 30000);
    document.addEventListener('visibilitychange', apply);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', apply);
    };
  }, [appearance]);
  return { appearance, setAppearance };
}
