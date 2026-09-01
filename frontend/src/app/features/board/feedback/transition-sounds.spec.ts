import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GameStatePush, Player } from '../../../api';
import { SoundService } from '../../../sound.service';
import { TransitionSounds } from './transition-sounds';

/** A push in which the first `finished` of the two players already hold a place. */
const push = (finished: number, currentPlayerId = '1'): GameStatePush => ({
  currentPlayerId,
  pawns: [],
  winners: [],
  version: 1,
  players: [
    { id: '1', name: 'me', place: finished > 0 ? 1 : -1 },
    { id: '2', name: 'mate', place: finished > 1 ? 2 : -1 },
  ] satisfies Player[],
});

describe('TransitionSounds', () => {
  const play = vi.fn();
  const sound = { play } as unknown as SoundService;
  /** How long the pawns still need to walk; 0 (the board has settled) unless a test says otherwise. */
  let pawnsRemaining = 0;
  let sounds: TransitionSounds;

  beforeEach(() => {
    play.mockClear();
    pawnsRemaining = 0;
    sounds = new TransitionSounds(sound, { remainingMs: () => pawnsRemaining });
  });

  // The server awards the place in the same push that carries the winning move, so the fanfare
  // would otherwise cheer a pawn that is still crossing the board. With a 7-split the finishing
  // pawn can be the second leg of the move — the win only reads once BOTH legs have landed.
  it('holds the fanfare back until the pawns have finished walking', () => {
    // GIVEN a game in which nobody has finished yet
    sounds.react(push(0));

    // WHEN a player finishes while their pawns are still 1200ms from settling
    pawnsRemaining = 1200;
    sounds.react(push(1));

    // THEN the fanfare is scheduled for the moment the last pawn lands, not for now
    expect(play.mock.calls).toEqual([['medalAwarded', 1200]]);
  });

  // Not every medal arrives behind a move: a reconnect clears the move baseline (see
  // GameStateStream's onOpen), so a place won while the tab was away lands in a snapshot with
  // nothing to animate. The delay tracks the animator rather than being a fixed pause.
  it('plays the fanfare straight away when no move is animating', () => {
    // GIVEN a game in which nobody has finished yet
    sounds.react(push(0));

    // WHEN a player turns out to have finished while the board is standing still
    sounds.react(push(1));

    // THEN the fanfare is not held back at all
    expect(play.mock.calls).toEqual([['medalAwarded', 0]]);
  });

  // The fanfare belongs to the transition, not to the count: whoever joins or reloads mid-game
  // gets a snapshot of the places already awarded, and must not hear the medals they missed.
  it('stays silent on the first push', () => {
    // GIVEN a viewer arriving at a game where a player has already finished
    sounds.react(push(1));

    // THEN nothing is played — that push only sets the baseline to measure the next one against
    expect(play.mock.calls).toEqual([]);
  });

  // The click marks the handover itself, so it is driven by the turn CHANGING — a push that
  // merely repeats the current turn (a trade, a rejected move, a reconnect) must stay quiet.
  it('clicks only when the turn passes to another player', () => {
    // GIVEN a game on player 1's turn
    sounds.react(push(0, '1'));

    // WHEN another push arrives with that same turn
    sounds.react(push(0, '1'));

    // THEN nothing is played — the turn has not moved
    expect(play.mock.calls).toEqual([]);

    // WHEN the turn then passes to player 2
    sounds.react(push(0, '2'));

    // THEN the click sounds, and at once: it announces the server's handover, not an animation
    expect(play.mock.calls).toEqual([['turnChange']]);
  });
});
