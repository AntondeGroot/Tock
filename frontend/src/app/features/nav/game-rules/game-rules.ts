import { Component, computed, inject, signal } from '@angular/core';
import { GameStore } from '../../../game-store';
import { Translations } from '../../../i18n/translations.service';
import { TranslationKey } from '../../../i18n/translations';

interface RulesRow {
  card?: string; // the chip label (A, K, 4, 7, J, Q); a rule that isn't about a card has none
  red?: boolean; // red chip vs black
  hint: TranslationKey;
}
interface RulesSection {
  titleKey: TranslationKey;
  rows: RulesRow[];
}

/**
 * Game Rules button + modal, ported from the GWT GameRulesWidget. Clicking the
 * button opens a modal; clicking the dark backdrop closes it (clicks inside the
 * content don't). All text comes from the i18n service, so it follows the
 * current language.
 */
@Component({
  selector: 'app-game-rules',
  templateUrl: './game-rules.html',
  styleUrl: './game-rules.scss',
})
export class GameRules {
  protected readonly i18n = inject(Translations);
  private readonly store = inject(GameStore);
  protected readonly open = signal(false);

  // First, because they decide where any card can take you. The last rule follows the game's
  // exact-move option: by default a blocked pawn turns around, with the option the move is refused.
  private readonly movingSection = computed<RulesSection>(() => ({
    titleKey: 'rulesMoving',
    rows: [
      { hint: 'rulesStartBlocks' },
      { hint: 'rulesFinishNoPassing' },
      { hint: this.store.exactMoveRequired() ? 'rulesExactMoves' : 'rulesBounceBack' },
    ],
  }));

  private readonly cardSections: RulesSection[] = [
    {
      titleKey: 'rulesGettingOnBoard',
      rows: [
        { card: 'A', red: true, hint: 'hintAce' },
        { card: 'K', red: true, hint: 'hintKing' },
      ],
    },
    {
      titleKey: 'rulesSpecialCards',
      rows: [
        { card: '4', red: false, hint: 'hintFour' },
        { card: '7', red: false, hint: 'hintSeven' },
        { card: 'J', red: true, hint: 'hintJack' },
        { card: 'Q', red: true, hint: 'hintQueen' },
      ],
    },
  ];

  protected readonly sections = computed(() => [this.movingSection(), ...this.cardSections]);
}
