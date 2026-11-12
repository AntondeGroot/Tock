import { GameStatePush } from '../../api';

/**
 * Manages the game-state SSE connection: it opens an `EventSource`, parses each `gamestate` event
 * into a {@link GameStatePush} for the caller, and — because the server sends a fresh personalized
 * snapshot on every (re)subscribe — re-establishes the stream after a short backoff if the browser
 * gives up on it (readyState CLOSED). Without that resync a dropped stream leaves a STALE board
 * that then rejects moves as "not your turn" (ported from the GWT presenter's onError resync).
 * The one end it accepts is a `gameended` event: then the game is gone, and it stops for good.
 *
 * Pure transport: the caller supplies the URL and handles the domain diffing in {@link onState};
 * {@link onReconnect} fires on each (re)connect so it can drop any per-stream baseline (so the
 * reconnect snapshot isn't mistaken for a new move/deal).
 */
export class GameStateStream {
  private source?: EventSource;
  private reconnectTimer?: ReturnType<typeof setTimeout>;
  private stopped = false;

  constructor(
    private readonly url: string,
    private readonly onState: (push: GameStatePush) => void,
    private readonly onReconnect?: () => void,
    private readonly reconnectMs = 2000,
  ) {}

  /** Open the stream (idempotent re-open); a CLOSED stream auto-reconnects after the backoff. */
  start(): void {
    if (this.stopped) return;
    this.source?.close();
    this.onReconnect?.();

    const es = new EventSource(this.url);
    this.source = es;
    es.addEventListener('gamestate', (event: MessageEvent) =>
      this.onState(JSON.parse(event.data) as GameStatePush),
    );
    // The game is gone: the stream that ends next would look like a drop, so stop for good first.
    es.addEventListener('gameended', () => this.stop());
    es.onerror = () => {
      // CONNECTING → the browser is auto-retrying, leave it. CLOSED → it gave up, so re-open.
      if (es.readyState === EventSource.CLOSED) {
        clearTimeout(this.reconnectTimer);
        this.reconnectTimer = setTimeout(() => this.start(), this.reconnectMs);
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
