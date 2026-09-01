import { TranslationKey } from '../../../i18n/keys';

// Cards that do something special (Ace, Four, Seven, Jack, Queen, King): they get a gold highlight
// in the hand and a hint/suggestion when hovered or selected (ported from the GWT GameBoardView).
const SPECIAL_CARD_VALUES = new Set([1, 4, 7, 11, 12, 13]);

const HINT_KEYS: Record<number, TranslationKey> = {
  1: 'hintAce',
  4: 'hintFour',
  7: 'hintSeven',
  11: 'hintJack',
  12: 'hintQueen',
  13: 'hintKing',
};

/** Whether a card value is "special" — gets the gold highlight in the hand and a hint. */
export function isSpecialCard(value: number): boolean {
  return SPECIAL_CARD_VALUES.has(value);
}

/** The i18n hint key for a special card value, or undefined for a plain card (no hint). */
export function hintKeyFor(value: number | null | undefined): TranslationKey | undefined {
  return value == null ? undefined : HINT_KEYS[value];
}
