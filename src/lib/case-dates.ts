type DateRange = { start: string; end: string };

function daysInMonth(year: number, month: number): number {
  if (month === 2) return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

// An uncertain date represents a whole month or year, never an invented day.
export function caseDateRange(value: string): DateRange | undefined {
  if (!/^\d{4}(?:-\d{2}(?:-\d{2})?)?$/.test(value)) return undefined;
  const [year, month, day] = value.split('-').map(Number);
  if (year < 1 || (month !== undefined && (month < 1 || month > 12))) return undefined;
  if (day !== undefined && (day < 1 || day > daysInMonth(year, month))) return undefined;
  if (month === undefined) return { start: `${value}-01-01`, end: `${value}-12-31` };
  if (day === undefined) return { start: `${value}-01`, end: `${value}-${daysInMonth(year, month)}` };
  return { start: value, end: value };
}

export function isCaseDate(value: string): boolean {
  return caseDateRange(value) !== undefined;
}

export function formatCaseDate(value: string | null | undefined): string {
  if (!value) return 'Not recorded';
  const range = caseDateRange(value);
  if (!range) return value;
  if (value.length === 4) return value;
  const options: Intl.DateTimeFormatOptions = { month: 'short', year: 'numeric', timeZone: 'UTC' };
  if (value.length === 10) options.day = 'numeric';
  return new Intl.DateTimeFormat('en-US', options).format(new Date(`${range.start}T12:00:00Z`));
}
