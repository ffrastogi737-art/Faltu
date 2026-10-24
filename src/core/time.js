// Local-time helpers. All engine functions take `now` explicitly so they are deterministic in tests.

const pad = (n) => String(n).padStart(2, '0');

export function dayKey(input) {
  const d = new Date(input);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function endOfDay(input) {
  const d = new Date(input);
  d.setHours(23, 59, 59, 999);
  return d.getTime();
}

/** Weeks run Monday–Sunday. */
export function endOfWeek(input) {
  const d = new Date(input);
  const daysToSunday = (7 - d.getDay()) % 7;
  d.setDate(d.getDate() + daysToSunday);
  return endOfDay(d);
}

export function addDays(input, days) {
  const d = new Date(input);
  d.setDate(d.getDate() + days);
  return d.getTime();
}

export function daysBetween(keyA, keyB) {
  const a = new Date(`${keyA}T12:00:00`);
  const b = new Date(`${keyB}T12:00:00`);
  return Math.round((b - a) / 86400000);
}

export function weekKey(input) {
  const d = new Date(input);
  const monday = addDays(d, -((d.getDay() + 6) % 7));
  return dayKey(monday);
}
