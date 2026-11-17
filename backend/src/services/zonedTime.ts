// Wall-clock time in IANA zones with nothing but Intl. Dates are "YYYY-MM-DD" and times "HH:MM"
// or "HH:MM:SS".

const hour = 3_600_000;
const formats = new Map<string, Intl.DateTimeFormat>();

const formatIn = (timeZone: string) => {
  const cached = formats.get(timeZone);
  if (cached) return cached;
  const format = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  formats.set(timeZone, format);
  return format;
};

// The zone's wall clock at `ms`, written as if it were UTC.
const wallClock = (ms: number, timeZone: string): number => {
  const parts = Object.fromEntries(
    formatIn(timeZone)
      .formatToParts(ms)
      .map(({ type, value }) => [type, Number(value)])
  );
  return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
};

const offsetAt = (ms: number, timeZone: string) =>
  wallClock(ms, timeZone) - Math.floor(ms / 1000) * 1000;

// The instant that `time` on `date` names in `timeZone`. In a repeated hour (clocks going back) it
// is the earlier of the two; in a skipped hour (clocks going forward) it is moved on by the gap,
// so 02:30 on a spring-forward day is 03:30.
export const instantOf = (date: string, time: string, timeZone: string): Date => {
  const wall = Date.parse(`${date}T${time}Z`);
  const before = offsetAt(wall - 12 * hour, timeZone);
  const after = offsetAt(wall + 12 * hour, timeZone);
  const valid = [wall - before, wall - after].filter((ms) => wallClock(ms, timeZone) === wall);
  return new Date(valid.length > 0 ? Math.min(...valid) : wall - before);
};

// The calendar day an instant falls on in `timeZone`.
export const localDate = (instant: Date, timeZone: string): string =>
  new Date(wallClock(instant.getTime(), timeZone)).toISOString().slice(0, 10);

export const addDays = (date: string, days: number): string =>
  new Date(Date.parse(date) + days * 24 * hour).toISOString().slice(0, 10);

// 0 is Sunday.
export const weekdayOf = (date: string): number => new Date(Date.parse(date)).getUTCDay();
