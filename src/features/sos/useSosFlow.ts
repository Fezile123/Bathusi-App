import { useCallback, useEffect, useRef, useState } from 'react';
import { getSettings } from '../../lib/settings';
import { SosOutcome, SosTrigger, sendSos } from './sosService';
import * as Crypto from 'expo-crypto';

export type SosPhase = 'countdown' | 'sending' | 'done' | 'cancelled';

/** Countdown -> send. Cancel is possible only during the countdown. Duplicate starts are ignored. */
export function useSosFlow(trigger: SosTrigger = 'button') {
  const [phase, setPhase] = useState<SosPhase>('countdown');
  const [secondsLeft, setSecondsLeft] = useState(getSettings().countdownSeconds);
  const [outcome, setOutcome] = useState<SosOutcome | null>(null);
  const started = useRef(false);
  const cancelled = useRef(false);

  const send = useCallback(async () => {
    if (started.current) return;
    started.current = true;
    setPhase('sending');
    const result = await sendSos(Crypto.randomUUID(), trigger);
    setOutcome(result);
    setPhase('done');
  }, [trigger]);

  useEffect(() => {
    if (phase !== 'countdown') return;
    if (secondsLeft <= 0) {
      if (!cancelled.current) send();
      return;
    }
    const t = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [phase, secondsLeft, send]);

  const cancel = useCallback(() => {
    if (started.current) return; // too late: already sending
    cancelled.current = true;
    setPhase('cancelled');
  }, []);

  const sendNow = useCallback(() => {
    if (!cancelled.current) send();
  }, [send]);

  return { phase, secondsLeft, outcome, cancel, sendNow };
}
