// Cycle estimates. These are simple calendar-based ESTIMATES, not medical advice or diagnosis.
// Method: average the gaps between logged period start dates (default 28 days), assume
// ovulation about 14 days before the next period, fertile window = 5 days before to 1 day after.

export const DEFAULT_CYCLE_LENGTH = 28;
export const DEFAULT_PERIOD_LENGTH = 5;
const DAY_MS = 86_400_000;

export function toIso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function fromIso(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

export function diffDays(a: Date, b: Date): number {
  const ua = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
  const ub = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((ub - ua) / DAY_MS);
}

export function averageCycleLength(startsIso: string[]): { length: number; cyclesUsed: number } {
  const starts = [...startsIso].sort().map(fromIso);
  const gaps: number[] = [];
  for (let i = 1; i < starts.length; i++) {
    const g = diffDays(starts[i - 1], starts[i]);
    if (g >= 15 && g <= 60) gaps.push(g); // ignore implausible gaps (missed logs / typos)
  }
  const recent = gaps.slice(-6);
  if (recent.length === 0) return { length: DEFAULT_CYCLE_LENGTH, cyclesUsed: 0 };
  const avg = recent.reduce((a, b) => a + b, 0) / recent.length;
  return { length: Math.round(avg), cyclesUsed: recent.length };
}

export type WindowKind = 'period-logged' | 'period-predicted' | 'fertile';
export type DayWindow = { kind: WindowKind; start: Date; end: Date };

export type Projection = {
  key: string;
  label: string;
  kind: 'period' | 'fertile';
  start: Date;
  end: Date;
  daysAway: number;
};

export type CyclePrediction = {
  isEstimate: true;
  cycleDay: number;
  avgCycleLength: number;
  cyclesUsed: number;
  periodLength: number;
  lastStart: Date;
  fertileNow: boolean;
  projections: Projection[];
  windows: DayWindow[];
};

export function predict(
  startsIso: string[],
  today: Date = new Date(),
  periodLength: number = DEFAULT_PERIOD_LENGTH,
): CyclePrediction | null {
  const starts = [...new Set(startsIso)].sort().map(fromIso);
  const past = starts.filter((s) => diffDays(s, today) >= 0);
  if (past.length === 0) return null;

  const lastStart = past[past.length - 1];
  const { length: avg, cyclesUsed } = averageCycleLength(startsIso);
  const cycleDay = diffDays(lastStart, today) + 1;

  const windows: DayWindow[] = starts.map((s) => ({
    kind: 'period-logged',
    start: s,
    end: addDays(s, periodLength - 1),
  }));

  const projections: Projection[] = [];
  let fertileNow = false;

  for (let k = 0; k <= 4; k++) {
    const cycleStart = addDays(lastStart, avg * k);
    const ovulation = addDays(cycleStart, avg - 14);
    const fStart = addDays(ovulation, -5);
    const fEnd = addDays(ovulation, 1);
    windows.push({ kind: 'fertile', start: fStart, end: fEnd });

    if (k === 0 && diffDays(fStart, today) >= 0 && diffDays(today, fEnd) >= 0) fertileNow = true;

    if (diffDays(today, fEnd) >= 0) {
      projections.push({
        key: `fertile-${k}`,
        label: 'Fertility window',
        kind: 'fertile',
        start: fStart,
        end: fEnd,
        daysAway: Math.max(0, diffDays(today, fStart)),
      });
    }
    if (k >= 1) {
      const pEnd = addDays(cycleStart, periodLength - 1);
      windows.push({ kind: 'period-predicted', start: cycleStart, end: pEnd });
      projections.push({
        key: `period-${k}`,
        label: 'Next predicted period',
        kind: 'period',
        start: cycleStart,
        end: pEnd,
        daysAway: Math.max(0, diffDays(today, cycleStart)),
      });
    }
  }

  projections.sort((a, b) => a.start.getTime() - b.start.getTime());
  return {
    isEstimate: true,
    cycleDay,
    avgCycleLength: avg,
    cyclesUsed,
    periodLength,
    lastStart,
    fertileNow,
    projections: projections.slice(0, 3),
    windows,
  };
}

export type DayClass = 'period-logged' | 'period-predicted' | 'fertile' | null;

export function classifyDay(day: Date, windows: DayWindow[]): DayClass {
  const order: WindowKind[] = ['period-logged', 'period-predicted', 'fertile'];
  for (const kind of order) {
    for (const w of windows) {
      if (w.kind === kind && diffDays(w.start, day) >= 0 && diffDays(day, w.end) >= 0) return kind;
    }
  }
  return null;
}

export function formatShort(d: Date): string {
  return d.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' });
}
