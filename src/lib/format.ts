// Date helpers. The database returns dates as yyyy-mm-dd and times as HH:MM:SS.

const DAY = 24 * 60 * 60 * 1000;

/** Parse a yyyy-mm-dd string as a local date (avoids UTC off-by-one). */
export function parseDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function toIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function toTime(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function timeToDate(time: string, base = new Date()): Date {
  const [h, m] = time.split(':').map(Number);
  const d = new Date(base);
  d.setHours(h, m, 0, 0);
  return d;
}

export function shortTime(time: string) {
  return time.slice(0, 5);
}

export function todayIso() {
  return toIsoDate(new Date());
}

export function daysUntil(iso: string): number {
  const today = parseDate(todayIso());
  return Math.round((parseDate(iso).getTime() - today.getTime()) / DAY);
}

export function longDate(iso: string) {
  return parseDate(iso).toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
}

export function mediumDate(iso: string) {
  return parseDate(iso).toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

export function fullDate(iso: string) {
  return parseDate(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function dayMonth(iso: string) {
  const d = parseDate(iso);
  return {
    day: String(d.getDate()),
    month: d.toLocaleDateString('en-GB', { month: 'short' }).toUpperCase(),
    weekday: d.toLocaleDateString('en-GB', { weekday: 'short' }),
  };
}

export function relativeDay(iso: string) {
  const n = daysUntil(iso);
  if (n === 0) return 'Today';
  if (n === 1) return 'Tomorrow';
  if (n === -1) return 'Yesterday';
  if (n > 1 && n < 7) return `In ${n} days`;
  if (n < -1 && n > -7) return `${-n} days ago`;
  return mediumDate(iso);
}

export function initials(first: string, surname: string) {
  return `${first.trim().charAt(0)}${surname.trim().charAt(0)}`.toUpperCase();
}

export function fullName(p: { first_name: string; surname: string } | null | undefined) {
  return p ? `${p.first_name} ${p.surname}` : 'Unknown player';
}

export function formatForm(form: number | null | undefined) {
  return form == null ? '–' : Number(form).toFixed(3);
}

export function opponentLabel(f: { is_home: boolean; opponent_name: string }) {
  return `${f.is_home ? 'vs' : '@'} ${f.opponent_name}`;
}

/** 500 → "£5", 550 → "£5.50". */
export function formatPence(pence: number | null | undefined) {
  if (pence == null) return '–';
  const pounds = pence / 100;
  return `£${Number.isInteger(pounds) ? pounds : pounds.toFixed(2)}`;
}

/** "5", "5.5", "£5.50" → 550. Returns null for blank, NaN for anything else. */
export function parsePounds(text: string): number | null {
  const t = text.trim().replace(/^£/, '');
  if (t === '') return null;
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return Number.NaN;
  return Math.round(Number(t) * 100);
}
