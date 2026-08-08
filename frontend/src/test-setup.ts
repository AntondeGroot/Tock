// Global test setup, executed before every spec file.
//
// jsdom does not implement HTMLMediaElement playback, so any code that calls
// audio.play()/pause()/load() (e.g. SoundService) floods the test output with
// "Error: Not implemented: HTMLMediaElement.prototype.play" noise. Stub the
// playback methods so the tests exercise the surrounding logic quietly.
const noop = (): void => {
  /* jsdom media stub */
};
Object.defineProperties(HTMLMediaElement.prototype, {
  play: { configurable: true, value: () => Promise.resolve() },
  pause: { configurable: true, value: noop },
  load: { configurable: true, value: noop },
});

// jsdom has no matchMedia either, so any component that watches a layout breakpoint (the board
// picks where to put the 7-split controls that way) would fail to construct. Report "no match" —
// the desktop layout — and accept listeners, so specs render the same layout every run.
if (!window.matchMedia) {
  window.matchMedia = (query: string): MediaQueryList =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: noop,
      removeEventListener: noop,
      addListener: noop, // deprecated, but part of the interface
      removeListener: noop,
      dispatchEvent: () => false,
    }) as MediaQueryList;
}
