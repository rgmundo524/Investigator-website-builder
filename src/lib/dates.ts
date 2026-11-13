export function formatMonth(value: string, locale = 'en-US'): string {
  const [year, month] = value.split('-').map(Number);
  return new Intl.DateTimeFormat(locale, { month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(year, month - 1, 1)));
}

export function formatDate(value: string, locale = 'en-US'): string {
  return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(`${value}T00:00:00Z`));
}

export function formatPeriods(periods: { start: string; end: string | null }[], asOf = new Date().toISOString().slice(0, 7), locale = 'en-US'): string {
  return [...periods].sort((a, b) => a.start.localeCompare(b.start)).map(({ start, end }) => {
    if (start > asOf) return end ? `Scheduled ${formatMonth(start, locale)} to ${formatMonth(end, locale)}` : `Starts ${formatMonth(start, locale)}`;
    return `${formatMonth(start, locale)} to ${end ? formatMonth(end, locale) : 'Present'}`;
  }).join('; ');
}
