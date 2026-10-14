import { useEffect, useState } from 'react';

export type Motion = 'system' | 'full' | 'reduced';

export function useMotion() {
  const [motion, setMotion] = useState<Motion>(() => {
    try {
      const saved = localStorage.getItem('spotter-motion');
      return saved === 'full' || saved === 'reduced' ? saved : 'system';
    } catch {
      return 'system';
    }
  });
  useEffect(() => {
    document.documentElement.dataset.motion = motion;
    try {
      localStorage.setItem('spotter-motion', motion);
    } catch {
      // The choice still applies for this session without browser storage.
    }
  }, [motion]);
  return { motion, setMotion };
}
