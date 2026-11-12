import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GameStateStream } from './game-state-stream';
import { GameStatePush } from '../../api';

// jsdom has no EventSource, so drive the stream with a controllable fake.
class FakeEventSource {
  static readonly CLOSED = 2;
  static readonly instances: FakeEventSource[] = [];
  readyState = 0; // CONNECTING
  onerror: (() => void) | null = null;
  closed = false;
  private readonly listeners: Record<string, ((e: MessageEvent) => void)[]> = {};

  constructor(readonly url: string) {
    FakeEventSource.instances.push(this);
  }
  addEventListener(type: string, cb: (e: MessageEvent) => void): void {
    this.listeners[type] ??= [];
    this.listeners[type].push(cb);
  }
  close(): void {
    this.closed = true;
    this.readyState = FakeEventSource.CLOSED;
  }
  /** Test helper: deliver a server event. */
  emit(type: string, data: unknown): void {
    (this.listeners[type] ?? []).forEach((cb) =>
      cb({ data: JSON.stringify(data) } as MessageEvent),
    );
  }
  /** Test helper: simulate a transport error at a given readyState. */
  fail(readyState: number): void {
    this.readyState = readyState;
    this.onerror?.();
  }
}

const push = (currentPlayerId: string): GameStatePush => ({ currentPlayerId }) as GameStatePush;

describe('GameStateStream', () => {
  const URL = 'https://x/stream';
  let originalES: unknown;

  const env = globalThis as Record<string, unknown>;

  beforeEach(() => {
    FakeEventSource.instances.length = 0;
    originalES = env['EventSource'];
    env['EventSource'] = FakeEventSource;
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    env['EventSource'] = originalES;
  });

  const last = () => FakeEventSource.instances.at(-1)!;

  it('opens the stream and parses each gamestate event into a push', () => {
    const seen: GameStatePush[] = [];
    new GameStateStream(URL, (p) => seen.push(p)).start();

    expect(FakeEventSource.instances).toHaveLength(1);
    expect(last().url).toBe(URL);

    last().emit('gamestate', push('p1'));
    last().emit('gamestate', push('p2'));
    expect(seen.map((s) => s.currentPlayerId)).toEqual(['p1', 'p2']);
  });

  it('fires onReconnect on each (re)connect so the caller can drop its baseline', () => {
    const onReconnect = vi.fn();
    const stream = new GameStateStream(URL, vi.fn(), { onReconnect, reconnectMs: 2000 });
    stream.start();
    expect(onReconnect).toHaveBeenCalledTimes(1);

    last().fail(FakeEventSource.CLOSED); // dropped → schedules a reconnect
    vi.advanceTimersByTime(2000);
    expect(FakeEventSource.instances).toHaveLength(2);
    expect(onReconnect).toHaveBeenCalledTimes(2);
  });

  it('reconnects only when the stream is CLOSED, not while the browser is retrying', () => {
    new GameStateStream(URL, vi.fn(), { reconnectMs: 2000 }).start();

    last().fail(0); // CONNECTING — browser auto-retries, we leave it
    vi.advanceTimersByTime(5000);
    expect(FakeEventSource.instances).toHaveLength(1);
  });

  // The server sends gameended just before it ends the stream of a game that is gone. The end
  // itself looks like a dropped connection, so without this the board would reconnect forever.
  it('closes for good on gameended, so the end of the stream does not reconnect it', () => {
    new GameStateStream(URL, vi.fn(), { reconnectMs: 2000 }).start();
    const source = last();

    source.emit('gameended', {});
    expect(source.closed).toBe(true);

    source.fail(FakeEventSource.CLOSED); // the server then ends the stream
    vi.advanceTimersByTime(5000);
    expect(FakeEventSource.instances).toHaveLength(1);
  });

  it('closes the source and does not reconnect after stop()', () => {
    const stream = new GameStateStream(URL, vi.fn(), { reconnectMs: 2000 });
    stream.start();
    const first = last();

    first.fail(FakeEventSource.CLOSED); // schedule a reconnect...
    stream.stop(); // ...then tear down before it fires
    expect(first.closed).toBe(true);

    vi.advanceTimersByTime(5000);
    expect(FakeEventSource.instances).toHaveLength(1); // no reconnect happened

    stream.start(); // start() after stop is a no-op
    expect(FakeEventSource.instances).toHaveLength(1);
  });
});
