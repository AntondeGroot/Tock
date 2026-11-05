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

/**
 * Talks to the external chat server via the keezen backend's `/chat/**` proxy — a port
 * of the GWT `GameBoardPresenter` chat wiring. Availability follows the stream: any
 * payload means the server is up (`available` → true); a stream error means it's down
 * (`available` → false). The UI uses `available` to show/hide itself, exactly like GWT.
 */
@Injectable({ providedIn: 'root' })
export class ChatService {
  private readonly http = inject(HttpClient);

  private sessionId: string | null = null;
  private source?: EventSource;

  private readonly _available = signal(false);
  private readonly _raw = signal<WireMessage[]>([]);

  /** True once the chat stream has delivered at least one payload; false while it's down. */
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
    this.source = new EventSource(`${basePath()}/chat/${sessionId}/stream`);
    this.source.onmessage = (e: MessageEvent) => this.ingest(e.data);
    this.source.onerror = () => this._available.set(false);
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
    this.source?.close();
    this.source = undefined;
    this._available.set(false);
  }
}
