import { plotExperience } from './experience';
import { formatPeriods } from './dates';

export type TimelineSettings = { start: string | null; scale: number; levels: { desktop: number; mobile: number } };
type Position = Parameters<typeof plotExperience>[0][number] & {
  data: { organization: string; role: string; blocks: Record<string, string>; description_short?: string };
};

// UTC avoids visitors' time zones moving a date into the preceding month.
export function monthTimestamp(month: string, offset = 0): number {
  const [year, number] = month.split('-').map(Number);
  const date = new Date(0);
  date.setUTCFullYear(year, number - 1 + offset, 1);
  date.setUTCHours(0, 0, 0, 0);
  return date.getTime();
}

const palette = [
  ['#7e2537', '#c94c44'], ['#225f82', '#83c9ee'], ['#6c4f98', '#c4a7eb'],
  ['#287169', '#7ed5c7'], ['#92621a', '#e8bc72'], ['#455c9b', '#a5b9f4'],
  ['#935326', '#f2b28c'], ['#745966', '#bb6552'],
];

export function careerTimeline<T extends Position>(entries: T[], settings: TimelineSettings, asOf?: string, locale = 'en-US') {
  const plot = plotExperience(entries, asOf);
  const earliest = entries.flatMap(({ data }) => data.periods.map(({ start }) => start)).sort()[0];
  if (settings.start && settings.start > (earliest ?? plot.asOf)) {
    throw new Error('timeline.start must be on or before the earliest role (or the current month when dates are unknown).');
  }
  const firstYear = Math.floor(plot.start / 12).toString().padStart(4, '0');
  const start = settings.start ?? `${firstYear}-01`;
  const to = monthTimestamp(`${Math.floor(plot.end / 12).toString().padStart(4, '0')}-${(plot.end % 12 + 1).toString().padStart(2, '0')}`);
  const ids = entries.map(({ id }) => id).sort();
  const roles = plot.rows.map(({ entry }) => {
    const [light, dark] = palette[ids.indexOf(entry.id) % palette.length];
    return { id: entry.id, organization: entry.data.organization,
      label: entry.data.blocks.organization_short ?? entry.data.organization,
      role: entry.data.role, description: entry.data.blocks.timeline_summary ?? entry.data.description_short ?? '',
      dates: formatPeriods(entry.data.periods, plot.asOf, locale), light, dark };
  });
  const spans = plot.rows.flatMap(({ entry, periods }) => periods.map((period) => ({
    id: entry.id, key: `${entry.id}-${period.start}`, from: monthTimestamp(period.start),
    to: period.planned ? monthTimestamp(period.start) : monthTimestamp(period.end ?? plot.asOf, 1),
    dates: formatPeriods([period], plot.asOf, locale), current: period.current,
    scheduled: period.scheduled, planned: period.planned, category: '',
  }))).sort((a, b) => a.from - b.from || a.to - b.to || a.key.localeCompare(b.key));
  // Interval partitioning: simultaneous roles never cover one another. Reuse a
  // role's previous lane when available, while allowing gaps to remain empty.
  const laneEnds: number[] = [];
  const previousLane = new Map<string, number>();
  for (const span of spans) {
    const previous = previousLane.get(span.id);
    let lane = previous !== undefined && laneEnds[previous] <= span.from
      ? previous : laneEnds.findIndex((end) => end <= span.from);
    if (lane === -1) lane = laneEnds.length;
    span.category = String(lane);
    laneEnds[lane] = Math.max(span.to, span.from + 1);
    previousLane.set(span.id, lane);
  }
  return { from: monthTimestamp(start), to, asOf: plot.asOf, start, locale,
    present: monthTimestamp(plot.asOf, 1), settings, roles, spans,
    lanes: laneEnds.map((_, index) => ({ category: String(index) })), undated: plot.undated };
}

export type CareerChartData = Omit<ReturnType<typeof careerTimeline>, 'undated'>;

export function careerTooltip(role: { organization: string; role: string; description: string }, span: { dates: string; scheduled: boolean; current: boolean }) {
  return [role.organization, role.role, span.dates,
    span.scheduled ? 'Scheduled role' : span.current ? 'Current role' : 'Past role',
    role.description, 'Select to read role details.'].filter(Boolean).join('\n');
}

// Both pointer-independent controls and resize/theme restoration use the same
// clamped viewport math. Six months is the tightest useful view for month data.
export function timelineWindow(start: number, end: number, factor: number, shift = 0, minimum = 0.02) {
  const width = Math.min(1, Math.max(minimum, (end - start) * factor));
  const center = (start + end) / 2 + shift * (end - start);
  const left = Math.max(0, Math.min(1 - width, center - width / 2));
  return { start: left, end: left + width };
}
