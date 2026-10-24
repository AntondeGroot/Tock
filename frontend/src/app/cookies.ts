const ONE_YEAR_IN_SECONDS = 60 * 60 * 24 * 365;

/** The value of the cookie `name`, or null when it isn't set. */
export function readCookie(name: string): string | null {
  const match = new RegExp('(?:^|; )' + name + '=([^;]*)').exec(document.cookie);
  return match ? decodeURIComponent(match[1]) : null;
}

/**
 * Remembers `value` under `name` for a year, on the whole host (path=/), like the language
 * cookie — so it holds whichever game the player opens next.
 */
export function writeCookie(name: string, value: string): void {
  document.cookie = `${name}=${encodeURIComponent(value)};path=/;max-age=${ONE_YEAR_IN_SECONDS}`;
}
