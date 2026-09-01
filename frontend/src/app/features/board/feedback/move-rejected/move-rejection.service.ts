import { Injectable, signal } from '@angular/core';

/**
 * Holds the current move-rejection message (or null when hidden). The board sets
 * it when the server rejects a move; the MoveRejected popup (mounted at the app
 * root) renders it. A tiny service so the two are decoupled.
 */
@Injectable({ providedIn: 'root' })
export class MoveRejection {
  readonly message = signal<string | null>(null);

  show(message: string): void {
    this.message.set(message);
  }

  close(): void {
    this.message.set(null);
  }
}
