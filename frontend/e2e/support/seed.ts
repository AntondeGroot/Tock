import { APIRequestContext } from '@playwright/test';

// Replicates the GWT ApiUtil / ApiCallsHelper seeding layer over HTTP, so a
// Playwright test can set up backend game state exactly like the Selenium ITs did.
// `api` is a Playwright APIRequestContext whose baseURL points at the backend
// (E2E_API_URL, default http://localhost:4200) — NOT the ng-serve UI.

export interface SeededGame {
  sessionId: string;
  /** playerIds in join order (index 0 == player 0, etc.). */
  playerIds: string[];
}

/** POST /games → add N players → /test/start-game. Additive: creates a new session. */
export async function createGame(
  api: APIRequestContext,
  maxPlayers: number,
  gameOptions?: Record<string, unknown>,
): Promise<SeededGame> {
  const created = await api.post('/games', {
    data: { roomName: `e2e-${Date.now()}`, maxPlayers, ...(gameOptions ? { gameOptions } : {}) },
  });
  const { sessionId } = (await created.json()) as { sessionId: string };

  for (let i = 0; i < maxPlayers; i++) {
    // The Player schema requires both id and name (GWT sent Player(id, name)).
    await api.post(`/games/${sessionId}/players`, {
      data: { id: `player${i}`, name: `player${i}` },
    });
  }
  await api.post(`/test/start-game/${sessionId}`);

  const players = (await (await api.get(`/games/${sessionId}/players`)).json()) as {
    id: string;
  }[];
  return { sessionId, playerIds: players.map((p) => p.id) };
}

/** POST /test/set-pawn/{session}/{player}/{pawnNr}/{sectionOwner}/{tileNr}. */
export async function setPawn(
  api: APIRequestContext,
  sessionId: string,
  playerId: string,
  pawnNr: number,
  sectionOwnerId: string,
  tileNr: number,
): Promise<void> {
  await api.post(`/test/set-pawn/${sessionId}/${playerId}/${pawnNr}/${sectionOwnerId}/${tileNr}`);
}

/** POST /test/set-only-card/{session}/{player}/{value} — make it the player's only card. */
export async function setOnlyCard(
  api: APIRequestContext,
  sessionId: string,
  playerId: string,
  cardValue: number,
): Promise<void> {
  await api.post(`/test/set-only-card/${sessionId}/${playerId}/${cardValue}`);
}

/**
 * POST /test/set-hand/{session}/{player}/{values} — replace the player's whole hand with exactly
 * these card values, dropping the dealt one without piling it. The deck is shuffled server-side,
 * so this is what makes a rendered hand reproducible. Values must be distinct (the uuid is the
 * value); suits are assigned by the backend.
 */
export async function setHand(
  api: APIRequestContext,
  sessionId: string,
  playerId: string,
  cardValues: number[],
): Promise<void> {
  await api.post(`/test/set-hand/${sessionId}/${playerId}/${cardValues.join(',')}`);
}

/**
 * POST /test/set-card/{session}/{player}/{value}. NOTE: this *replaces* the player's
 * first card with one of `cardValue` — it does not append, so the hand size is
 * unchanged (see `CardsDeck.giveCardToPlayerForTesting`). To reduce a hand to a single
 * known card, use `setOnlyCard` instead.
 */
export async function setCard(
  api: APIRequestContext,
  sessionId: string,
  playerId: string,
  cardValue: number,
): Promise<void> {
  await api.post(`/test/set-card/${sessionId}/${playerId}/${cardValue}`);
}

/** GET /cards/{session}/{player} — the player's real hand, uuids and suits as the server holds it. */
export async function getHand(
  api: APIRequestContext,
  sessionId: string,
  playerId: string,
): Promise<{ uuid: number; suit: number; value: number }[]> {
  const response = await api.get(`/cards/${sessionId}/${playerId}`);
  return (await response.json()) as { uuid: number; suit: number; value: number }[];
}

/**
 * POST /trade/{session} — a team card-trade action. REQUEST offers `card` and asks the teammate
 * for a King or Ace; ACCEPT hands one back. The card must be one the player actually holds, so
 * pass one straight from {@link getHand}.
 */
export async function teamTrade(
  api: APIRequestContext,
  sessionId: string,
  playerId: string,
  action: 'REQUEST' | 'ACCEPT' | 'REJECT' | 'CANCEL',
  card?: { uuid: number; suit: number; value: number },
): Promise<void> {
  await api.post(`/trade/${sessionId}`, { data: { action, playerId, ...(card ? { card } : {}) } });
}

/**
 * POST /moves/{session}/{player} — play a move straight through the API, the way
 * the GWT `ApiCallsHelper.makeMove` drove opponent moves. `move` carries the card
 * and pawn(s); the server validates and infers the move type.
 */
export async function makeMove(
  api: APIRequestContext,
  sessionId: string,
  playerId: string,
  move: {
    cardId: number;
    pawn1Id?: { playerId: string; pawnNr: number };
    pawn2Id?: { playerId: string; pawnNr: number };
    stepsPawn1?: number;
    stepsPawn2?: number;
  },
): Promise<void> {
  await api.post(`/moves/${sessionId}/${playerId}`, { data: { playerId, ...move } });
}
