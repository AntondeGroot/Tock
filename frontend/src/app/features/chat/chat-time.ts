const MINUTES_PER_DAY = 24 * 60;
const CLOCK_TIME = /^([01]?\d|2[0-3]):([0-5]\d)$/;

const twoDigits = (value: number) => String(value).padStart(2, '0');

/**
 * The chat server stamps a message with only the UTC clock time ("14:30"), which `new Date` cannot
 * read, so this shifts it to the viewer's time zone by hand. There is no date to look up the offset
 * for, so it uses today's: a message from before a clock change shows an hour off, which only
 * matters for a chat left open across that change.
 *
 * @param offsetMinutes UTC minus local, as `Date.getTimezoneOffset` gives it.
 * @return the local time as "HH:mm", or the text unchanged when it is not a clock time.
 */
export function utcClockToLocal(
  utcClock: string,
  offsetMinutes = new Date().getTimezoneOffset(),
): string {
  const match = CLOCK_TIME.exec(utcClock);
  if (!match) return utcClock;
  const utcMinutes = Number(match[1]) * 60 + Number(match[2]);
  const localMinutes = (utcMinutes - offsetMinutes + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  return `${twoDigits(Math.floor(localMinutes / 60))}:${twoDigits(localMinutes % 60)}`;
}
