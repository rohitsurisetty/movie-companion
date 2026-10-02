/**
 * Shared formatting helpers used across chat screens.
 */

/**
 * Parse a backend timestamp. Chat timestamps are UTC but some are written
 * without an offset (Python `datetime.utcnow().isoformat()`), and JS reads an
 * offset-less date-time as LOCAL time — every chat time was skewed by the
 * device's UTC offset ("5h ago" for a message just sent in India).
 */
export function parseServerDate(value?: string | number | Date | null): Date {
  if (value instanceof Date) return value;
  if (typeof value === 'number') return new Date(value);
  if (!value) return new Date(NaN);
  const s = String(value).trim().replace(/(\.\d{3})\d+/, '$1');
  const hasTime = /\d{2}:\d{2}/.test(s);
  const hasZone = /([zZ]|[+-]\d{2}:?\d{2})$/.test(s);
  return new Date(hasTime && !hasZone ? `${s.replace(' ', 'T')}Z` : s);
}

export function formatTime(dateString?: string): string {
  if (!dateString) return '';
  const date = parseServerDate(dateString);
  if (isNaN(date.getTime())) return '';
  const now = new Date();
  const diff = now.getTime() - date.getTime();

  if (diff < 60000) return 'now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h`;
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

export function formatHourMinute(dateStr: string): string {
  try {
    const date = parseServerDate(dateStr);
    if (isNaN(date.getTime())) return '';
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

export function formatDateOrToday(dateStr: string): string {
  try {
    const date = parseServerDate(dateStr);
    if (isNaN(date.getTime())) return '';
    const today = new Date();
    if (date.toDateString() === today.toDateString()) {
      return 'Today';
    }
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  } catch {
    return '';
  }
}
