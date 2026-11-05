import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest';
import { ChatService } from './chat.service';
import { encrypt } from './chat-cipher';

// A stand-in for the browser EventSource so connect() can set up the room (and the
// cipher key) without opening a real network stream in the unit-test environment.
class FakeEventSource {
  onmessage: ((e: MessageEvent) => void) | null = null;
  onerror: (() => void) | null = null;
  closed = false;
  constructor(public url: string) {}
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
  });

  it('starts offline until a stream payload arrives', () => {
    expect(service.available()).toBe(false);
  });

  it('a stream payload flips it online and decrypts the messages', () => {
    const wire = [{ timestampUTC: '14:30', sender: 'ann', message: encrypt('hi', 'room-key') }];
    service.ingest(JSON.stringify(wire));

    expect(service.available()).toBe(true);
    const msgs = service.messages();
    expect(msgs).toHaveLength(1);
    expect(msgs[0]).toMatchObject({ sender: 'ann', text: 'hi' });
  });

  // The bug this guards against: the server stamps messages "14:30" in UTC, `new Date` could not read
  // that, and the raw UTC time was shown without any error. The earlier test sent a full date that
  // the server never sends, so it could not catch it. This one uses the server's real format.
  it('shows a message stamped by the server in the viewer local time', () => {
    // GIVEN a viewer in the Dutch winter, at UTC+1
    const offset = vi.spyOn(Date.prototype, 'getTimezoneOffset').mockReturnValue(-60);
    onTestFinished(() => offset.mockRestore());

    // WHEN a message arrives stamped 14:30 UTC
    const wire = [{ timestampUTC: '14:30', sender: 'ann', message: encrypt('hi', 'room-key') }];
    service.ingest(JSON.stringify(wire));

    // THEN it shows as 15:30
    expect(service.messages()[0].time).toBe('15:30');
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
