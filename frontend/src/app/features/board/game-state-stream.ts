import { GameStatePush } from '../../api';

/** How long a stream the browser gave up on waits before it opens again. */
const DEFAULT_RECONNECT_MS = 2000;

/** The optional settings of a {@link GameStateStream}, named, so a caller sets only what it needs. */
export interface GameStateStreamOptions {
  /**
   * Fires on each (re)connect, so the caller can drop any per-stream baseline: the reconnect
   * snapshot must not be mistaken for a new move or deal.
   */
  onReconnect?: () => void;
  /** How long to wait before re-opening a stream the browser gave up on. */
  reconnectMs?: number;
  /** Fires once when the server says the game is gone; the stream has stopped for good by then. */
  onEnded?: () => void;
}

/**
 * Manages the game-state SSE connection: it opens an `EventSource`, parses each `gamestate` event
 * into a {@link GameStatePush} for the caller, and — because the server sends a fresh personalized
 * snapshot on every (re)subscribe — re-establishes the stream after a short backoff if the browser
 * gives up on it (readyState CLOSED). Without that resync a dropped stream leaves a STALE board
 * that then rejects moves as "not your turn" (ported from the GWT presenter's onError resync).
 * The one end it accepts is a `gameended` event: then the game is gone, and it stops for good.
 *
 * Pure transport: the caller supplies the URL and handles the domain diffing in {@link onState};
 * see {@link GameStateStreamOptions} for the optional settings.
 */
export class GameStateStream {
  private source?: EventSource;
  private reconnectTimer?: ReturnType<typeof setTimeout>;
  private stopped = false;

  constructor(
    private readonly url: string,
    private readonly onState: (push: GameStatePush) => void,
    private readonly options: GameStateStreamOptions = {},
  ) {}

  /** Open the stream (idempotent re-open); a CLOSED stream auto-reconnects after the backoff. */
  start(): void {
    if (this.stopped) return;
    this.source?.close();
    this.options.onReconnect?.();

    const es = new EventSource(this.url);
    this.source = es;
    es.addEventListener('gamestate', (event: MessageEvent) =>
      this.onState(JSON.parse(event.data) as GameStatePush),
    );
    // The game is gone: the stream that ends next would look like a drop, so stop for good first.
    es.addEventListener('gameended', () => {
      this.stop();
      this.options.onEnded?.();
    });
    es.onerror = () => {
      // CONNECTING → the browser is auto-retrying, leave it. CLOSED → it gave up, so re-open.
      if (es.readyState === EventSource.CLOSED) {
        clearTimeout(this.reconnectTimer);
        this.reconnectTimer = setTimeout(
          () => this.start(),
          this.options.reconnectMs ?? DEFAULT_RECONNECT_MS,
        );
      }
    };
  }

  /** Close the stream for good (on teardown, or once the game has ended) — no further reconnects. */
  stop(): void {
    this.stopped = true;
    clearTimeout(this.reconnectTimer);
    this.source?.close();
  }
}
