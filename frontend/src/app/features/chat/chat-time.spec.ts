import { describe, expect, it } from 'vitest';
import { utcClockToLocal } from './chat-time';

describe('utcClockToLocal', () => {
  // The server sends "HH:mm" in UTC, so this is what stops the chat showing the time an hour behind
  // in the Dutch winter and two hours behind in the summer. The offset is UTC minus local, so it is
  // negative for a viewer ahead of UTC: getting that sign wrong would double the error.
  it('shifts the server UTC time to the viewer time zone, in winter and summer', () => {
    // GIVEN a message stamped 14:30 UTC

    // THEN a viewer in the Netherlands in winter (UTC+1) sees 15:30
    expect(utcClockToLocal('14:30', -60)).toBe('15:30');

    // AND in summer (UTC+2) sees 16:30
    expect(utcClockToLocal('14:30', -120)).toBe('16:30');
  });

  // There is no date to carry over into, so the clock simply has to go round: without wrapping, a
  // late message would read "24:30" and an early one in the Americas a negative time.
  it('wraps around midnight in both directions', () => {
    // THEN a viewer at UTC+1 sees a late message just after midnight
    expect(utcClockToLocal('23:30', -60)).toBe('00:30');

    // AND a viewer at UTC-5 sees an early message on the evening before
    expect(utcClockToLocal('00:30', 300)).toBe('19:30');
  });

  // Chat times line up in a column, so they always read as "HH:mm". The zone offset is in minutes,
  // not whole hours, so a half-hour zone has to carry over into the hours as well.
  it('pads hours and minutes to two digits, and handles half-hour time zones', () => {
    // THEN single-digit hours and minutes keep their leading zero
    expect(utcClockToLocal('08:05', -60)).toBe('09:05');

    // AND a viewer at UTC+5:30 sees the minutes roll over into the next hour
    expect(utcClockToLocal('14:30', -330)).toBe('20:00');
  });

  // A stamp this cannot read must not stop the chat or turn into a made-up time: showing the text
  // as it came is at least honest. Numbers that only look like a time count as unreadable too.
  it.each(['2024-01-01T00:00:00Z', 'soon', '', '25:00', '14:75'])(
    'shows %j unchanged, because it is not a clock time',
    (notAClockTime) => {
      expect(utcClockToLocal(notAClockTime, -60)).toBe(notAClockTime);
    },
  );
});
