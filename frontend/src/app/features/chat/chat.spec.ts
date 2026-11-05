import { TestBed, ComponentFixture } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatPanel } from './chat';
import { ChatService } from './chat.service';
import { GameStore } from '../../game-store';

class FakeEventSource {
  onmessage: ((e: MessageEvent) => void) | null = null;
  onerror: (() => void) | null = null;
  closed = false;
  constructor(public url: string) {}
  close() {
    this.closed = true;
  }
}

const q = (f: ComponentFixture<ChatPanel>, id: string): HTMLElement | null =>
  f.nativeElement.querySelector(`[data-testid="${id}"]`);

describe('ChatPanel', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    vi.stubGlobal('EventSource', FakeEventSource);
    document.cookie = 'sessionid=room-key';
    document.cookie = 'playerid=0';
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
    // Viewer is player 0 → "Ann"; the panel should send under that name.
    TestBed.inject(GameStore).players.set([
      { id: '0', name: 'Ann' },
      { id: '1', name: 'Bob' },
    ]);
  });

  afterEach(() => {
    http.verify();
    vi.unstubAllGlobals();
    document.cookie = 'sessionid=;max-age=0';
    document.cookie = 'playerid=;max-age=0';
  });

  function render(): ComponentFixture<ChatPanel> {
    const f = TestBed.createComponent(ChatPanel);
    f.detectChanges(); // runs ngOnInit → chat.connect (stubbed stream)
    return f;
  }

  // The phone popup is hidden until it opens, so nothing can be scrolled before that. Without this
  // it always opened at the oldest message, and the player had to scroll down every time.
  it('shows the newest message when the chat is opened', async () => {
    // GIVEN a chat whose messages are too long to fit in the list
    const f = render();
    TestBed.inject(ChatService).ingest('[]');
    await f.whenStable();
    const list = q(f, 'chat-display')!;
    Object.defineProperty(list, 'scrollHeight', { value: 500 });
    list.scrollTop = 0;

    // WHEN the player opens it
    (f.nativeElement.querySelector('.chat-fab') as HTMLElement).click();
    await f.whenStable();

    // THEN the list is scrolled all the way down
    expect(list.scrollTop).toBe(500);
  });

  // With the chat open the list only moves if this does it. A player following the conversation
  // would otherwise have to scroll down for every message that comes in.
  it('brings a new message into view for a player at the newest message', async () => {
    // GIVEN a chat showing its newest message
    const f = render();
    const chat = TestBed.inject(ChatService);
    chat.ingest('[]');
    await f.whenStable();
    const list = q(f, 'chat-display')!;

    // WHEN a message comes in that makes the list taller
    Object.defineProperty(list, 'scrollHeight', { value: 500 });
    chat.ingest(JSON.stringify([{ timestampUTC: '14:30', sender: 'Bob', message: 'hi' }]));
    await f.whenStable();

    // THEN the list follows it down
    expect(list.scrollTop).toBe(500);
  });

  // Following new messages must stop as soon as the player scrolls back, or every message that
  // comes in would throw them out of the history they are reading.
  it('leaves the list where it is while the player reads back through history', async () => {
    // GIVEN a player who has scrolled back to well above the newest message
    const f = render();
    const chat = TestBed.inject(ChatService);
    chat.ingest('[]');
    await f.whenStable();
    const list = q(f, 'chat-display')!;
    Object.defineProperty(list, 'scrollHeight', { value: 500, configurable: true });
    Object.defineProperty(list, 'clientHeight', { value: 100 });
    list.scrollTop = 50;
    list.dispatchEvent(new Event('scroll'));

    // WHEN a message comes in
    Object.defineProperty(list, 'scrollHeight', { value: 520 });
    chat.ingest(JSON.stringify([{ timestampUTC: '14:30', sender: 'Bob', message: 'hi' }]));
    await f.whenStable();

    // THEN they stay where they were reading
    expect(list.scrollTop).toBe(50);
  });

  // Having read back through history last time must not count against the player the next time:
  // opening the chat is meant to show what is new, wherever they left the list.
  it('goes back to the newest message when reopened after reading history', async () => {
    // GIVEN an open chat in which the player has scrolled back
    const f = render();
    TestBed.inject(ChatService).ingest('[]');
    await f.whenStable();
    const button = f.nativeElement.querySelector('.chat-fab') as HTMLElement;
    button.click();
    await f.whenStable();
    const list = q(f, 'chat-display')!;
    Object.defineProperty(list, 'scrollHeight', { value: 500 });
    Object.defineProperty(list, 'clientHeight', { value: 100 });
    list.scrollTop = 50;
    list.dispatchEvent(new Event('scroll'));

    // WHEN they close the chat and open it again
    (f.nativeElement.querySelector('.chat-backdrop') as HTMLElement).click();
    await f.whenStable();
    button.click();
    await f.whenStable();

    // THEN it shows the newest message again
    expect(list.scrollTop).toBe(500);
  });

  it('renders nothing while the chat server is offline', () => {
    const f = render();
    expect(q(f, 'chat-send')).toBeNull();
    expect(q(f, 'chat-input')).toBeNull();
    expect(q(f, 'chat-display')).toBeNull();
  });

  it('shows input, send button and display once the stream is up', () => {
    const f = render();
    TestBed.inject(ChatService).ingest('[]'); // an empty array = server is up
    f.detectChanges();
    expect(q(f, 'chat-send')).not.toBeNull();
    expect(q(f, 'chat-input')).not.toBeNull();
    expect(q(f, 'chat-display')).not.toBeNull();
  });

  it('sends the typed message under the viewer’s name and clears the input', () => {
    const f = render();
    TestBed.inject(ChatService).ingest('[]');
    f.detectChanges();

    const input = q(f, 'chat-input') as HTMLInputElement;
    input.value = 'hello';
    (q(f, 'chat-send') as HTMLButtonElement).click();

    const req = http.expectOne('/chat/room-key');
    expect(req.request.method).toBe('POST');
    expect((req.request.body as { sender: string }).sender).toBe('Ann');
    req.flush({});
    expect(input.value).toBe('');
  });
});
