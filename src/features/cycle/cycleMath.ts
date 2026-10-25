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

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const WEEKDAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** "Nov 9" */
export function formatShort(d: Date): string {
  return `${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

/** "Sunday, 25 October" */
export function formatLong(d: Date): string {
  return `${WEEKDAYS[d.getDay()]}, ${d.getDate()} ${MONTHS_LONG[d.getMonth()]}`;
}

export function greetingFor(d: Date): string {
  const h = d.getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

// ---------- phases (for the ring and the summary text) ----------
export type Phase = 'period' | 'follicular' | 'fertile' | 'luteal';

export type PhaseLayout = {
  cycleLength: number;
  periodLength: number;
  ovulationDay: number;   // 1-based cycle day
  fertileStartDay: number;
  fertileEndDay: number;
};

export function phaseLayout(cycleLength: number, periodLength: number): PhaseLayout {
  const ovulationDay = Math.max(periodLength + 2, cycleLength - 13);
  const fertileStartDay = Math.max(periodLength + 1, ovulationDay - 5);
  const fertileEndDay = Math.min(cycleLength, ovulationDay + 1);
  return { cycleLength, periodLength, ovulationDay, fertileStartDay, fertileEndDay };
}

export function phaseForDay(day: number, l: PhaseLayout): Phase {
  if (day <= l.periodLength) return 'period';
  if (day < l.fertileStartDay) return 'follicular';
  if (day <= l.fertileEndDay) return 'fertile';
  return 'luteal';
}

/** Fractions of the ring (sum = 1): period, follicular, fertile, luteal. */
export function ringFractions(l: PhaseLayout): Record<Phase, number> {
  const period = l.periodLength;
  const follicular = Math.max(0, l.fertileStartDay - 1 - l.periodLength);
  const fertile = l.fertileEndDay - l.fertileStartDay + 1;
  const luteal = Math.max(0, l.cycleLength - l.fertileEndDay);
  const total = period + follicular + fertile + luteal;
  return { period: period / total, follicular: follicular / total, fertile: fertile / total, luteal: luteal / total };
}

export type TodaySummary = { phase: Phase; title: string; text: string; badge: string | null };

export function describeToday(p: CyclePrediction): TodaySummary {
  const l = phaseLayout(p.avgCycleLength, p.periodLength);
  const phase = phaseForDay(Math.min(p.cycleDay, l.cycleLength), l);
  const nextPeriod = p.projections.find((x) => x.kind === 'period');
  const days = nextPeriod ? nextPeriod.daysAway : null;

  if (phase === 'period') {
    return { phase, title: 'Period', text: `Estimated day ${p.cycleDay} of about ${l.periodLength} period days.`, badge: null };
  }
  if (phase === 'fertile') {
    const i = p.cycleDay - l.fertileStartDay + 1;
    const n = l.fertileEndDay - l.fertileStartDay + 1;
    const peak = p.cycleDay === l.ovulationDay;
    return {
      phase,
      title: peak ? 'Peak fertility' : 'Fertile window',
      text: peak
        ? 'Ovulation is likely today, and your fertile window ends tomorrow.'
        : `Your estimated fertile window is open (day ${i} of ${n}).`,
      badge: `Fertile window \u2022 day ${i} of ${n}`,
    };
  }
  if (phase === 'follicular') {
    return { phase, title: 'Follicular phase', text: 'Estimated days between your period and your fertile window.', badge: null };
  }
  return {
    phase,
    title: 'Luteal phase',
    text: days !== null ? `Your next period is expected in about ${days} day${days === 1 ? '' : 's'}.` : 'Your next period is expected soon.',
    badge: null,
  };
}
