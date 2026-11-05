import { HttpClient } from '@angular/common/http';
import { Injectable, Signal, computed, inject, signal } from '@angular/core';
import { decrypt, encrypt } from './chat-cipher';
import { utcClockToLocal } from './chat-time';
import { basePath } from '../../base-path';

/** A chat message as it travels on the wire (message text is XOR-obfuscated). */
interface WireMessage {
  timestampUTC: string;
  sender: string;
  message: string;
}

/** A decrypted, display-ready message. */
export interface DisplayMessage {
  time: string;
  sender: string;
  text: string;
}

/** How long a broken stream may take to deliver again before the chat counts as down. */
const OFFLINE_GRACE_MS = 10_000;
/** How soon to reopen a stream the browser has given up on. */
const RECONNECT_MS = 2_000;

/**
 * Talks to the external chat server via the keezen backend's `/chat/**` proxy — a port
 * of the GWT `GameBoardPresenter` chat wiring. Availability follows the stream: any
 * payload means the server is up (`available` → true). A stream error alone does not mean
 * it's down, because streams get dropped and reopened all the time and the reopened one delivers
 * the messages again: only when none arrive within a grace period does `available` go false.
 * The UI uses `available` to show/hide itself, so the chat stays put through a reconnect.
 */
@Injectable({ providedIn: 'root' })
export class ChatService {
  private readonly http = inject(HttpClient);

  private sessionId: string | null = null;
  private source?: EventSource;
  private offlineTimer?: ReturnType<typeof setTimeout>;
  private reconnectTimer?: ReturnType<typeof setTimeout>;

  private readonly _available = signal(false);
  private readonly _raw = signal<WireMessage[]>([]);

  /** True once the chat stream has delivered a payload; false once it has stayed quiet after an error. */
  readonly available = this._available.asReadonly();

  /** The messages, decrypted with the sessionId key and formatted for display. */
  readonly messages: Signal<DisplayMessage[]> = computed(() => {
    const key = this.sessionId ?? '';
    return this._raw().map((m) => ({
      time: utcClockToLocal(m.timestampUTC),
      sender: m.sender,
      text: decrypt(m.message, key),
    }));
  });

  /** Open the chat stream for a session. The sessionId is also the cipher key. */
  connect(sessionId: string): void {
    this.disconnect();
    this.sessionId = sessionId;
    this.openStream(sessionId);
  }

  private openStream(sessionId: string): void {
    const source = new EventSource(`${basePath()}/chat/${sessionId}/stream`);
    this.source = source;
    source.onmessage = (e: MessageEvent) => this.ingest(e.data);
    source.onerror = () => this.onStreamError(source, sessionId);
  }

  private onStreamError(source: EventSource, sessionId: string): void {
    this.offlineTimer ??= setTimeout(() => {
      this.offlineTimer = undefined;
      this._available.set(false);
    }, OFFLINE_GRACE_MS);
    // CONNECTING → the browser is retrying by itself. CLOSED → it gave up, so reopen it ourselves.
    if (source.readyState === EventSource.CLOSED) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = setTimeout(() => this.openStream(sessionId), RECONNECT_MS);
    }
  }

  /** Handle one SSE payload (a JSON array of messages). Any valid array = server is up. */
  ingest(data: string): void {
    let parsed: unknown;
    try {
      parsed = JSON.parse(data);
    } catch {
      return; // ignore malformed frames; stay in the current state
    }
    if (!Array.isArray(parsed)) return;
    this.cancelOfflineTimer();
    this._available.set(true);
    this._raw.set(parsed as WireMessage[]);
  }

  /** Send a message as `sender`. No-op for blank input or before connecting. */
  send(text: string, sender: string): void {
    const trimmed = text.trim();
    if (!trimmed || !this.sessionId) return;
    const body = { sender, message: encrypt(trimmed, this.sessionId) };
    this.http.post(`${basePath()}/chat/${this.sessionId}`, body).subscribe({
      error: () => {
        /* fire-and-forget: errors are non-critical here */
      },
    });
  }

  disconnect(): void {
    this.cancelOfflineTimer();
    clearTimeout(this.reconnectTimer);
    this.source?.close();
    this.source = undefined;
    this._available.set(false);
  }

  private cancelOfflineTimer(): void {
    clearTimeout(this.offlineTimer);
    this.offlineTimer = undefined;
  }
}
