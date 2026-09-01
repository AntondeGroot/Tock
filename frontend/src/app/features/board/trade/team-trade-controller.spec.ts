import { signal } from '@angular/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Card as CardModel, GameStatePush } from '../../../api';
import { TeamTradeController } from './team-trade-controller';

const card = (uuid: number, value: number): CardModel => ({ uuid, suit: 0, value });
const players = () => [
  { id: 'me', name: 'Me', teamId: 1 },
  { id: 'mate', name: 'Mate', teamId: 1 },
];
// A translate stub that echoes the key + any args, so assertions read clearly.
const t = (key: string, ...args: (string | number)[]) =>
  args.length ? `${key}(${args.join(',')})` : key;

describe('TeamTradeController', () => {
  // Real signals so the controller's computeds invalidate exactly as they do in the board.
  const state = signal<GameStatePush | undefined>(undefined);
  const hand = signal<CardModel[]>([]);
  let onSwap: ReturnType<typeof vi.fn>;
  let sendRequest: ReturnType<typeof vi.fn>;
  let notify: ReturnType<typeof vi.fn>;
  let ctl: TeamTradeController;

  const build = (viewerId: string) =>
    new TeamTradeController(
      () => state(),
      () => hand(),
      viewerId,
      onSwap as never,
      sendRequest as never,
      notify as never,
      t as never,
    );

  beforeEach(() => {
    onSwap = vi.fn();
    sendRequest = vi.fn();
    notify = vi.fn();
    hand.set([]);
    state.set(undefined);
    ctl = build('me');
  });

  // The whole rule (team game, trade option, no pending trade, teammate + cards, and — the key
  // fix — hasn't played a card this round) lives in the backend; the button just mirrors its flag.
  describe('canAsk mirrors the backend canRequestTrade flag', () => {
    it('is true only when the backend says the player may request a trade', () => {
      state.set({ canRequestTrade: true } as GameStatePush);
      expect(ctl.canAsk()).toBe(true);

      state.set({ canRequestTrade: false } as GameStatePush);
      expect(ctl.canAsk()).toBe(false);

      state.set(undefined);
      expect(ctl.canAsk()).toBe(false);
    });
  });

  it('names the other party from the viewer’s perspective', () => {
    state.set({
      players: players(),
      trade: { requesterId: 'me', teammateId: 'mate' },
    } as GameStatePush);
    expect(ctl.otherName()).toBe('Mate');
    expect(build('mate').otherName()).toBe('Me');
  });

  it('asks the teammate the moment the button is pressed', () => {
    // Nothing is staged locally: pressing a button labelled "ask" sends the ask, and the picker
    // then opens off the pending trade coming back over SSE.
    expect(sendRequest).not.toHaveBeenCalled();
    ctl.ask();
    expect(sendRequest).toHaveBeenCalledTimes(1);
  });

  // Drive a resolving trade: first push has the trade pending (baseline), the second has it gone.
  const resolveTrade = (c: TeamTradeController, endHand: CardModel[], startHand = [card(1, 5)]) => {
    state.set({
      players: players(),
      trade: { requesterId: 'me', teammateId: 'mate' },
    } as GameStatePush);
    hand.set(startHand);
    c.reactToOutcome(); // baseline: remembers the pending trade + hand
    state.set({ players: players() } as GameStatePush); // trade resolved
    hand.set(endHand);
    c.reactToOutcome();
  };

  describe('reactToOutcome', () => {
    it('accepted (requester): animates the swap and shows the received-card banner', () => {
      resolveTrade(ctl, [card(2, 1)]); // gave #1, got an Ace (#2)
      expect(onSwap).toHaveBeenCalledWith('mate', card(2, 1), card(1, 5));
      expect(notify).toHaveBeenCalledWith('tradeGotTitle', 'tradeGotAceMessage(Mate)');
    });

    it('rejected (requester): no swap, shows the rejected banner (hand unchanged)', () => {
      resolveTrade(ctl, [card(1, 5)]); // hand identical → nothing given/received
      expect(onSwap).not.toHaveBeenCalled();
      expect(notify).toHaveBeenCalledWith('tradeRejectedTitle', 'tradeRejectedMessage(Mate)');
    });

    it('cancelled by me: silent (no swap, no banner)', () => {
      ctl.cancelledByMe();
      resolveTrade(ctl, [card(2, 13)]);
      expect(onSwap).not.toHaveBeenCalled();
      expect(notify).not.toHaveBeenCalled();
    });

    it('teammate side: animates the swap but shows no banner (only the requester is told)', () => {
      const mate = build('mate');
      resolveTrade(mate, [card(2, 13)]); // teammate gave #1, got a King (#2)
      expect(onSwap).toHaveBeenCalledWith('me', card(2, 13), card(1, 5));
      expect(notify).not.toHaveBeenCalled();
    });
  });
});
