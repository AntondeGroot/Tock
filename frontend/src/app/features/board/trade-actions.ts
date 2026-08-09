import { Card as CardModel, TradeAction, TradeService } from '../../api';

/**
 * Post one team card-trade action (ask, offer, accept, decline, withdraw).
 *
 * Fire-and-forget by design: the authoritative outcome — the swap, the cleared trade, the other
 * side's view of it — arrives over SSE, so there is nothing to roll back locally if the call
 * fails. Shared by the board (which sends the ask) and the trade panel (everything else).
 */
export function postTradeAction(
  tradeService: TradeService,
  sessionId: string | null | undefined,
  playerId: string | null | undefined,
  action: TradeAction.ActionEnum,
  card?: CardModel,
): void {
  if (!sessionId || !playerId) return;
  tradeService.teamTrade(sessionId, { action, playerId, card }).subscribe({
    error: () => {
      /* the SSE push is the source of truth; a failed action simply changes nothing */
    },
  });
}
