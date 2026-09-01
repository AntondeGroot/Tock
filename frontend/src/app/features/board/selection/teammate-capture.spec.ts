import { Pawn as ApiPawn, Player } from '../../../api';
import { teammateCaptureKeys, teammateCaptureTiles } from './teammate-capture';

// 4-player team game: seats 0 & 2 = team 0, seats 1 & 3 = team 1.
const TEAMS: Record<string, number> = { '0': 0, '2': 0, '1': 1, '3': 1 };
const teamOf = (id: string) => TEAMS[id] ?? null;

describe('teammateCaptureKeys', () => {
  it('flags a preview tile holding a teammate’s pawn', () => {
    // mover is player 0 (team 0); player 2 (team 0) sits on a previewed tile
    const preview = new Set(['track:5']);
    const occupants = [{ key: 'track:5', ownerId: '2' }];
    expect([...teammateCaptureKeys(preview, occupants, teamOf, '0')]).toEqual(['track:5']);
  });

  // Cases that flag nothing: the mover previews landing on 'track:5' (team 0 = player 0).
  it.each([
    { why: 'capturing an opponent', occupants: [{ key: 'track:5', ownerId: '1' }], team: teamOf },
    { why: 'the mover’s own pawn', occupants: [{ key: 'track:5', ownerId: '0' }], team: teamOf },
    {
      why: 'a teammate not on a previewed tile',
      occupants: [{ key: 'track:9', ownerId: '2' }],
      team: teamOf,
    },
    {
      why: 'the mover has no team (teams off)',
      occupants: [{ key: 'track:5', ownerId: '2' }],
      team: () => null,
    },
  ])('does not flag $why', ({ occupants, team }) => {
    const preview = new Set(['track:5']);
    expect(teammateCaptureKeys(preview, occupants, team, '0').size).toBe(0);
  });

  it('flags multiple teammate tiles and leaves opponents alone', () => {
    const preview = new Set(['track:5', 'track:8', 'track:11']);
    const occupants = [
      { key: 'track:5', ownerId: '2' }, // teammate → flag
      { key: 'track:8', ownerId: '3' }, // opponent → no
      { key: 'track:11', ownerId: '2' }, // teammate → flag
    ];
    expect([...teammateCaptureKeys(preview, occupants, teamOf, '0')].sort()).toEqual([
      'track:11',
      'track:5',
    ]);
  });
});

describe('teammateCaptureTiles (board projection)', () => {
  const players: Player[] = [
    { id: '0', name: 'A', teamId: 0 },
    { id: '1', name: 'B', teamId: 1 },
    { id: '2', name: 'C', teamId: 0 },
  ];
  const pawnAt = (ownerId: string, tilePlayerId: string, tileNr: number): ApiPawn => ({
    playerId: ownerId,
    pawnId: { playerId: ownerId, pawnNr: 0 },
    currentTileId: { playerId: tilePlayerId, tileNr },
    nestTileId: { playerId: ownerId, tileNr: -1 },
  });

  it('flags previewed tiles landing on a teammate, not opponents', () => {
    const preview = new Set(['track:5', 'track:8']);
    const pawns = [pawnAt('2', 'track', 5), pawnAt('1', 'track', 8)];
    expect([...teammateCaptureTiles(preview, pawns, players, '0')]).toEqual(['track:5']);
  });

  it('is empty without a viewer', () => {
    expect(teammateCaptureTiles(new Set(['track:5']), [], players, null).size).toBe(0);
  });
});
