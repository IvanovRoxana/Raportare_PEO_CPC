export type DayClusterInput = string | {
  date: string;
  hours?: number;
};

type NormalizedDayClusterEntry = {
  date: string;
  day: number;
  hours?: number;
};

export function formatDayCluster(input: DayClusterInput[], monthName: string, year: number) {
  const entries = normalizeDayClusterInput(input);
  if (entries.length === 0) return '';

  const allHaveHours = entries.every((entry) => typeof entry.hours === 'number');
  const uniqueHours = [...new Set(entries.map((entry) => entry.hours))];
  const daysText = formatDayList(entries.map((entry) => entry.day));

  if (!allHaveHours) {
    return `în ${daysText} ${monthName} ${year}`;
  }

  if (entries.length === 1) {
    const entry = entries[0];
    return `în data de ${entry.day} ${monthName} ${year}, ${formatHours(entry.hours ?? 0)}`;
  }

  if (uniqueHours.length === 1) {
    return `în zilele de ${daysText} ${monthName} ${year}, câte ${formatHours(uniqueHours[0] ?? 0)} pe zi`;
  }

  return `în zilele de ${daysText} ${monthName} ${year}, cu următoarea distribuție: ${entries
    .map((entry) => `${entry.day} ${monthName}: ${formatHours(entry.hours ?? 0)}`)
    .join('; ')}`;
}

export function normalizeDayClusterInput(input: DayClusterInput[]): NormalizedDayClusterEntry[] {
  const byDate = new Map<string, NormalizedDayClusterEntry>();

  for (const item of input) {
    const date = typeof item === 'string' ? item : item.date;
    if (!date) continue;
    const day = parseDay(date);
    if (!Number.isFinite(day)) continue;
    const hours = typeof item === 'string' ? undefined : normalizeHours(item.hours);
    const existing = byDate.get(date);
    if (existing) {
      byDate.set(date, {
        date,
        day,
        hours: typeof existing.hours === 'number' || typeof hours === 'number'
          ? roundHours((existing.hours ?? 0) + (hours ?? 0))
          : undefined,
      });
      continue;
    }
    byDate.set(date, { date, day, hours });
  }

  return [...byDate.values()].sort((first, second) => first.date.localeCompare(second.date));
}

function parseDay(date: string) {
  const match = date.match(/(?:^\d{4}-\d{2}-|\b)(\d{1,2})$/);
  if (match) return Number(match[1]);
  const parsed = new Date(date);
  return Number.isNaN(parsed.getTime()) ? Number.NaN : parsed.getDate();
}

function normalizeHours(value?: number) {
  const hours = Number(value);
  return Number.isFinite(hours) ? roundHours(hours) : undefined;
}

function formatDayList(days: number[]) {
  const clusters = clusterConsecutiveDays([...new Set(days)].sort((first, second) => first - second));
  return joinRomanianList(clusters.map((cluster) => {
    if (cluster.length === 1) return String(cluster[0]);
    return `${cluster[0]}-${cluster[cluster.length - 1]}`;
  }));
}

function clusterConsecutiveDays(days: number[]) {
  const clusters: number[][] = [];
  let current: number[] = [];

  for (const day of days) {
    const previous = current[current.length - 1];
    if (current.length === 0 || day === previous + 1) {
      current.push(day);
      continue;
    }
    clusters.push(current);
    current = [day];
  }

  if (current.length > 0) clusters.push(current);
  return clusters;
}

function joinRomanianList(items: string[]) {
  if (items.length <= 1) return items[0] ?? '';
  if (items.length === 2) return `${items[0]} și ${items[1]}`;
  return `${items.slice(0, -1).join(', ')} și ${items[items.length - 1]}`;
}

function formatHours(hours: number) {
  const rounded = roundHours(hours);
  if (rounded === 1) return 'o oră';
  if (Number.isInteger(rounded)) return `${rounded} ore`;
  return `${String(rounded).replace('.', ',')} ore`;
}

function roundHours(value: number) {
  return Math.round(value * 100) / 100;
}
