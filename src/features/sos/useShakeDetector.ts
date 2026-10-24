import { useEffect, useRef, useState } from 'react';
import { Accelerometer } from 'expo-sensors';

export type ShakeInfo = { peaks: number; maxG: number; at: number };

// Starting values: UNTESTED. Tune on real devices using app/spike-shake.tsx.
export const SHAKE_CONFIG = { thresholdG: 2.2, requiredPeaks: 4, windowMs: 1500, cooldownMs: 5000, intervalMs: 50 };

type Options = {
  enabled: boolean;
  onShake: (info: ShakeInfo) => void;
  thresholdG?: number;
  requiredPeaks?: number;
  windowMs?: number;
  cooldownMs?: number;
  intervalMs?: number;
};

export function useShakeDetector({
  enabled,
  onShake,
  thresholdG = SHAKE_CONFIG.thresholdG,
  requiredPeaks = SHAKE_CONFIG.requiredPeaks,
  windowMs = SHAKE_CONFIG.windowMs,
  cooldownMs = SHAKE_CONFIG.cooldownMs,
  intervalMs = SHAKE_CONFIG.intervalMs,
}: Options) {
  const peaks = useRef<number[]>([]);
  const maxG = useRef(0);
  const lastTrigger = useRef(0);
  const lastUi = useRef(0);
  const onShakeRef = useRef(onShake);
  onShakeRef.current = onShake;
  const [magnitude, setMagnitude] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    Accelerometer.setUpdateInterval(intervalMs);

    const sub = Accelerometer.addListener(({ x, y, z }) => {
      const g = Math.sqrt(x * x + y * y + z * z);
      const now = Date.now();

      if (now - lastUi.current > 200) {
        lastUi.current = now;
        setMagnitude(g);
      }

      if (g > thresholdG) {
        const last = peaks.current[peaks.current.length - 1];
        if (last === undefined || now - last > 100) peaks.current.push(now);
        maxG.current = Math.max(maxG.current, g);
      }

      peaks.current = peaks.current.filter((t) => now - t <= windowMs);

      if (peaks.current.length >= requiredPeaks && now - lastTrigger.current > cooldownMs) {
        lastTrigger.current = now;
        onShakeRef.current({ peaks: peaks.current.length, maxG: maxG.current, at: now });
        peaks.current = [];
        maxG.current = 0;
      }
    });

    return () => sub.remove();
  }, [enabled, thresholdG, requiredPeaks, windowMs, cooldownMs, intervalMs]);

  return { magnitude };
}
