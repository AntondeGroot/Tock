import { Component, inject, OnInit, signal } from '@angular/core';
import { Translations } from '../../../i18n/translations.service';
import { resolveGameSession } from '../../../session';
import { CardHints } from '../card-hints.service';

/**
 * "Do you still need the card hints?" — asked once, as the player enters their third game. Either
 * answer is final: it is saved like the Settings switch, so the question doesn't come back.
 */
@Component({
  selector: 'app-hints-question',
  templateUrl: './hints-question.html',
  styleUrl: './hints-question.scss',
})
export class HintsQuestion implements OnInit {
  protected readonly i18n = inject(Translations);
  private readonly hints = inject(CardHints);
  protected readonly asking = signal(false);

  ngOnInit(): void {
    const { sessionId } = resolveGameSession();
    if (sessionId) this.asking.set(this.hints.enterGame(sessionId));
  }

  protected answer(keepHints: boolean): void {
    this.hints.setVisible(keepHints);
    this.asking.set(false);
  }
}
