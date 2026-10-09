/** Local calendar date as YYYY-MM-DD (the user's day, not UTC). */
export function toLocalDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Parse YYYY-MM-DD as a local date. Returns null for invalid input. */
export function parseLocalDate(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const [, y, m, d] = match.map(Number);
  const date = new Date(y!, m! - 1, d!);
  return date.getFullYear() === y && date.getMonth() === m! - 1 && date.getDate() === d ? date : null;
}

export function addDays(value: string, days: number): string {
  const date = parseLocalDate(value) ?? new Date();
  date.setDate(date.getDate() + days);
  return toLocalDate(date);
}

export function today(): string {
  return toLocalDate(new Date());
}
