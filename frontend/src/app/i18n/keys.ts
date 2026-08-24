// Shared i18n types: the locale codes, the set of translation keys, and the
// selectable languages. Each locale file (locales/*.ts) types its dictionary as
// `Record<TranslationKey, string>`, so the compiler enforces every key is present.

export type Locale = 'de' | 'en' | 'fr' | 'nl' | 'nb';

/** Selectable languages, in the GWT enum's order, with their display names. */
export const LANGUAGES: { code: Locale; name: string }[] = [
  { code: 'de', name: 'Deutsch' },
  { code: 'en', name: 'English' },
  { code: 'fr', name: 'Français' },
  { code: 'nl', name: 'Nederlands' },
  { code: 'nb', name: 'Norsk' },
];

export type TranslationKey =
  | 'gameName'
  | 'playCard'
  | 'forfeit'
  | 'leaveGame'
  | 'send'
  | 'pawn1'
  | 'pawn2'
  | 'confirmLeaveGame'
  | 'confirmLeaveYes'
  | 'confirmLeaveNo'
  | 'playerFinished'
  | 'canvasNotSupported'
  | 'hintAce'
  | 'hintFour'
  | 'hintSeven'
  | 'hintJack'
  | 'hintQueen'
  | 'hintKing'
  | 'rulesButton'
  | 'rulesTitle'
  | 'rulesGettingOnBoard'
  | 'rulesSpecialCards'
  | 'rulesClickToClose'
  | 'moveRejectedTitle'
  | 'moveRejectedGeneric'
  | 'moveRejectedNotYourTurn'
  | 'moveRejectedInvalidSelection'
  | 'moveRejectedDontHaveCard'
  | 'moveRejectedWrongCardForMove'
  | 'moveRejectedPawnOnNest'
  | 'moveRejectedPawnNotOnNest'
  | 'moveRejectedPawnNotOnBoard'
  | 'moveRejectedNotYourPawn'
  | 'moveRejectedDestinationOccupiedByOwnPawn'
  | 'moveRejectedDestinationBlocked'
  | 'moveRejectedStartTileOccupied'
  | 'moveRejectedCannotPassStartTile'
  | 'moveRejectedCannotSwitchOpponentOnOwnStart'
  | 'moveRejectedCannotSwitchOwnPawns'
  | 'moveRejectedMustMoveExactSteps'
  | 'moveRejectedPawnClosedInFinish'
  | 'moveRejectedSplitNeedsTwoOwnPawns'
  | 'moveRejectedSplitStepsNotSeven'
  | 'moveRejectedMustFinishOwnPawnsFirst'
  | 'moveRejectedCannotMoveOutOfFinish'
  | 'teamHandoffTitle'
  | 'teamHandoffMessage'
  | 'tradeAskButton'
  | 'tradeClose'
  | 'tradePickTitle'
  | 'tradePickedSub'
  | 'tradeCountdown'
  | 'tradeCancel'
  | 'tradeRespondTitle'
  | 'tradeRespondSub'
  | 'tradeRespondWaiting'
  | 'tradeDecline'
  | 'tradeGive'
  | 'tradeGotTitle'
  | 'tradeGotAceMessage'
  | 'tradeGotKingMessage'
  | 'tradeRejectedTitle'
  | 'tradeRejectedMessage';

/** A full set of strings for one language. */
export type Dictionary = Record<TranslationKey, string>;
