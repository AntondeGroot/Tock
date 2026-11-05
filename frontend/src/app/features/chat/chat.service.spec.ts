import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatService } from './chat.service';
import { encrypt } from './chat-cipher';

// A stand-in for the browser EventSource so connect() can set up the room (and the
// cipher key) without opening a real network stream in the unit-test environment.
const openedSources: FakeEventSource[] = [];
class FakeEventSource {
  static readonly CLOSED = 2;
  onmessage: ((e: MessageEvent) => void) | null = null;
  onerror: (() => void) | null = null;
  closed = false;
  readyState = 1;
  constructor(public url: string) {
    openedSources.push(this);
  }
  close() {
    this.closed = true;
  }
}

describe('ChatService', () => {
  let service: ChatService;
  let http: HttpTestingController;

  beforeEach(() => {
    vi.stubGlobal('EventSource', FakeEventSource);
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(ChatService);
    http = TestBed.inject(HttpTestingController);
    service.connect('room-key'); // sets the cipher key; no real stream (stubbed)
  });

  afterEach(() => {
    http.verify();
    vi.unstubAllGlobals();
    vi.useRealTimers(); // no-op unless a test installed a fake clock
  });

  it('starts offline until a stream payload arrives', () => {
    expect(service.available()).toBe(false);
  });

  it('a stream payload flips it online and decrypts the messages', () => {
    const wire = [
      { timestampUTC: '2024-01-01T00:00:00Z', sender: 'ann', message: encrypt('hi', 'room-key') },
    ];
    service.ingest(JSON.stringify(wire));

    expect(service.available()).toBe(true);
    const msgs = service.messages();
    expect(msgs).toHaveLength(1);
    expect(msgs[0]).toMatchObject({ sender: 'ann', text: 'hi' });
  });

  it('an empty array still marks the server up (matches GWT)', () => {
    service.ingest('[]');
    expect(service.available()).toBe(true);
    expect(service.messages()).toHaveLength(0);
  });

  it('ignores malformed payloads and stays offline', () => {
    service.ingest('not json');
    expect(service.available()).toBe(false);
    expect(service.messages()).toHaveLength(0);
  });

  // Streams get dropped and reopened all the time: an idle proxy connection, a phone waking up. The
  // reopened stream delivers the messages again a few seconds later. Treating the drop itself as
  // "server down" made the chat vanish and reappear, and wiped the popup and whatever was typed.
  it('stays available when a dropped stream delivers again within the grace period', () => {
    vi.useFakeTimers();

    // GIVEN a chat that is up
    service.ingest('[]');

    // WHEN the stream drops, and the browser reconnects and delivers 3 seconds later
    openedSources.at(-1)?.onerror?.();
    expect(service.available()).toBe(true);
    vi.advanceTimersByTime(3_000);
    service.ingest('[]');

    // THEN the chat stays up, also long after the grace period would have ended
    vi.advanceTimersByTime(60_000);
    expect(service.available()).toBe(true);
  });

  // The countdown belongs to a broken stream, not to silence: a chat nobody is typing in has to stay
  // put. Only a stream that broke and did not deliver again means the chat server is really gone.
  it('hides the chat when a dropped stream has not delivered again after 10 seconds', () => {
    vi.useFakeTimers();

    // GIVEN a chat that is up, where nobody types for an hour
    service.ingest('[]');
    vi.advanceTimersByTime(3_600_000);

    // THEN it is still there, because nothing is wrong with the stream
    expect(service.available()).toBe(true);

    // WHEN the stream drops and nothing arrives, THEN it stays until the 10 seconds have passed
    openedSources.at(-1)?.onerror?.();
    vi.advanceTimersByTime(9_999);
    expect(service.available()).toBe(true);
    vi.advanceTimersByTime(1);
    expect(service.available()).toBe(false);

    // WHEN the server is back and delivers again, THEN the chat returns
    service.ingest('[]');
    expect(service.available()).toBe(true);
  });

  // A browser retries a dropped stream by itself, but gives up for good on some failures, such as
  // an error page from a proxy. Without reopening it the chat stays gone until a page refresh; but
  // opening a second stream next to one the browser is still retrying would double the connection.
  it('reopens a stream the browser gave up on, but leaves one it is retrying alone', () => {
    vi.useFakeTimers();
    const opened = openedSources.length;
    const stream = openedSources.at(-1)!;

    // WHEN the stream drops while the browser is retrying it (CONNECTING)
    stream.readyState = 0;
    stream.onerror?.();
    vi.advanceTimersByTime(60_000);

    // THEN no stream is opened on top of it
    expect(openedSources).toHaveLength(opened);

    // WHEN the browser then gives up on it (CLOSED)
    stream.readyState = FakeEventSource.CLOSED;
    stream.onerror?.();

    // THEN a new stream to the same room opens after 2 seconds, not sooner
    vi.advanceTimersByTime(1_999);
    expect(openedSources).toHaveLength(opened);
    vi.advanceTimersByTime(1);
    expect(openedSources).toHaveLength(opened + 1);
    expect(openedSources.at(-1)?.url).toBe(stream.url);
  });

  // A reopen left pending would open a stream for a game the player has already left.
  it('leaves no timers running after disconnecting, so a closed stream stays closed', () => {
    vi.useFakeTimers();
    const stream = openedSources.at(-1)!;

    // GIVEN a stream the browser gave up on, so a reopen and a hide are both pending
    stream.readyState = FakeEventSource.CLOSED;
    stream.onerror?.();
    expect(vi.getTimerCount()).toBe(2);

    // WHEN the player leaves
    service.disconnect();
    const openedWhenLeaving = openedSources.length;

    // THEN the stream is closed and nothing is left to fire
    expect(stream.closed).toBe(true);
    expect(vi.getTimerCount()).toBe(0);

    // AND it is not reopened later on
    vi.advanceTimersByTime(60_000);
    expect(openedSources).toHaveLength(openedWhenLeaving);
  });

  it('send() posts the encrypted message under the sender', () => {
    service.send('hello', 'ann');
    const req = http.expectOne('/chat/room-key');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ sender: 'ann', message: encrypt('hello', 'room-key') });
    req.flush({});
  });

  it('send() is a no-op for blank input', () => {
    service.send('   ', 'ann');
    http.expectNone('/chat/room-key');
  });
});
