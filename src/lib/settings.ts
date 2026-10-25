import { useEffect, useState } from 'react';
import { getJson, setJson } from './storage';

export type Settings = {
  sosArmed: boolean;        // shake gesture on/off (default ON; only arms once a contact exists)
  autoPurge: boolean;       // remove local evidence copy after VERIFIED upload
  countdownSeconds: number; // cancel window before an alert is sent
};

const KEY = 'settings_v1';
const defaults: Settings = { sosArmed: true, autoPurge: true, countdownSeconds: 10 };

let cache: Settings = defaults;
let loaded = false;
const listeners = new Set<(s: Settings) => void>();

export async function loadSettings(): Promise<Settings> {
  cache = { ...defaults, ...(await getJson<Partial<Settings>>(KEY, {})) };
  loaded = true;
  listeners.forEach((l) => l(cache));
  return cache;
}

export function getSettings(): Settings {
  return cache;
}

export async function updateSettings(patch: Partial<Settings>): Promise<void> {
  cache = { ...cache, ...patch };
  await setJson(KEY, cache);
  listeners.forEach((l) => l(cache));
}

export function useSettings(): Settings {
  const [s, setS] = useState<Settings>(cache);
  useEffect(() => {
    listeners.add(setS);
    if (!loaded) loadSettings();
    else setS(cache);
    return () => {
      listeners.delete(setS);
    };
  }, []);
  return s;
}
