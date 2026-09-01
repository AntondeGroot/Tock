import { Injectable, signal } from '@angular/core';

export interface Notice {
  title: string;
  message: string;
}

/**
 * A one-shot, self-dismissing announcement banner (title + message) shown at the app root.
 * Used for the team hand-off ("you can play your teammate's pawns") and for team card-trade
 * outcomes ("your teammate gave you a King" / "…could not give you an Ace or King"). A tiny
 * service so producers and the popup are decoupled, mirroring MoveRejection.
 */
@Injectable({ providedIn: 'root' })
export class TeamHandoff {
  readonly notice = signal<Notice | null>(null);

  show(title: string, message: string): void {
    this.notice.set({ title, message });
  }

  close(): void {
    this.notice.set(null);
  }
}
