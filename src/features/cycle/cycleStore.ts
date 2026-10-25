import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import * as Crypto from 'expo-crypto';
import { getJson, setJson, removeKeys } from '../../lib/storage';
import { addDays, toIso } from './cycleMath';

// Cycle data stays ON THIS DEVICE only (data minimisation). It is never sent to Supabase.
const K_LOGS = 'cycle_logs_v1';
const K_SYMPTOMS = 'cycle_symptoms_v1';

export type CycleLog = { id: string; startDate: string };
export type SymptomLog = { id: string; date: string; symptom: string; severity: 1 | 2 | 3 };

export function useCycleData() {
  const [logs, setLogs] = useState<CycleLog[]>([]);
  const [symptoms, setSymptoms] = useState<SymptomLog[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLogs(await getJson<CycleLog[]>(K_LOGS, []));
    setSymptoms(await getJson<SymptomLog[]>(K_SYMPTOMS, []));
    setLoading(false);
  }, []);

  // Reload whenever the screen gains focus so every tab sees the latest logs.
  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload]),
  );

  const logPeriodStart = useCallback(
    async (dateIso: string) => {
      const current = await getJson<CycleLog[]>(K_LOGS, []);
      if (current.some((l) => l.startDate === dateIso)) return false;
      const next = [...current, { id: Crypto.randomUUID(), startDate: dateIso }].sort((a, b) =>
        a.startDate.localeCompare(b.startDate),
      );
      await setJson(K_LOGS, next);
      setLogs(next);
      return true;
    },
    [],
  );

  const addSymptom = useCallback(async (symptom: string, severity: 1 | 2 | 3 = 2) => {
    const current = await getJson<SymptomLog[]>(K_SYMPTOMS, []);
    const next = [...current, { id: Crypto.randomUUID(), date: toIso(new Date()), symptom, severity }];
    await setJson(K_SYMPTOMS, next);
    setSymptoms(next);
  }, []);

  /** Replaces today's symptom list with exactly `names` (empty list clears today). */
  const saveTodaySymptoms = useCallback(async (names: string[]) => {
    const today = toIso(new Date());
    const current = await getJson<SymptomLog[]>(K_SYMPTOMS, []);
    const kept = current.filter((s) => s.date !== today);
    const added = names.map((symptom) => ({ id: Crypto.randomUUID(), date: today, symptom, severity: 2 as const }));
    const next = [...kept, ...added];
    await setJson(K_SYMPTOMS, next);
    setSymptoms(next);
  }, []);

  const clearAll = useCallback(async () => {
    await removeKeys([K_LOGS, K_SYMPTOMS]);
    setLogs([]);
    setSymptoms([]);
  }, []);

  /** Fictional data for demos only: Day 14 of a 28-day cycle. */
  const loadDemoData = useCallback(async () => {
    const today = new Date();
    const starts = [-13 - 84, -13 - 56, -13 - 28, -13].map((n) => toIso(addDays(today, n)));
    const demo = starts.map((s) => ({ id: Crypto.randomUUID(), startDate: s }));
    await setJson(K_LOGS, demo);
    setLogs(demo);
  }, []);

  return { logs, symptoms, loading, reload, logPeriodStart, addSymptom, saveTodaySymptoms, clearAll, loadDemoData };
}
