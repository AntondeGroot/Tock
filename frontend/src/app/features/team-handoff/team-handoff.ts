import { Component, effect, inject } from '@angular/core';
import { TeamHandoff } from './team-handoff.service';

/**
 * A one-shot, self-dismissing wood/gold announcement banner (title + message); click to
 * dismiss early. Content is supplied via the TeamHandoff service (team hand-off, trade
 * outcomes). Mounted once at the app root.
 */
@Component({
  selector: 'app-team-handoff',
  templateUrl: './team-handoff.html',
  styleUrl: './team-handoff.scss',
})
export class TeamHandoffPopup {
  protected readonly handoff = inject(TeamHandoff);
  private timer?: ReturnType<typeof setTimeout>;

  constructor() {
    // Auto-dismiss a few seconds after it appears (re-armed whenever a new notice shows).
    effect(() => {
      const notice = this.handoff.notice();
      clearTimeout(this.timer);
      if (notice) {
        this.timer = setTimeout(() => this.handoff.close(), 5000);
      }
    });
  }
}
