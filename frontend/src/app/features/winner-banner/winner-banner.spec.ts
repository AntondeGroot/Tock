import { beforeEach, describe, expect, it } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { WinnerBanner } from './winner-banner';
import { GameStore } from '../../game-store';
import { Player } from '../../api';

describe('WinnerBanner', () => {
  let fixture: ComponentFixture<WinnerBanner>;
  let store: GameStore;
  const banner = () => fixture.nativeElement.querySelector('.winner-banner') as HTMLElement | null;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [WinnerBanner] }).compileComponents();
    fixture = TestBed.createComponent(WinnerBanner);
    store = TestBed.inject(GameStore);
  });

  it('shows nothing when there are no winners', () => {
    store.players.set([{ id: 'p0', name: 'Aria' } as Player]);
    fixture.detectChanges();
    expect(banner()).toBeNull();
  });

  it('announces a new finisher with their medal and name', () => {
    store.players.set([{ id: 'p0', name: 'Aria', color: '#c0392b' } as Player]);
    fixture.detectChanges(); // first push: adopt winners=[] without announcing

    store.winners.set(['p0']);
    fixture.detectChanges();

    expect(banner()).not.toBeNull();
    expect(banner()!.querySelector('.winner-banner__medal')!.textContent).toBe('🥇');
    expect(banner()!.querySelector('.winner-banner__name')!.textContent!.trim()).toBe('Aria');
  });

  it('gives the second finisher the silver medal', () => {
    store.players.set([{ id: 'p0', name: 'Aria' } as Player, { id: 'p1', name: 'Bram' } as Player]);
    fixture.detectChanges();

    store.winners.set(['p0']);
    fixture.detectChanges();
    store.winners.set(['p0', 'p1']);
    fixture.detectChanges();

    expect(banner()!.querySelector('.winner-banner__medal')!.textContent).toBe('🥈');
    expect(banner()!.querySelector('.winner-banner__name')!.textContent!.trim()).toBe('Bram');
  });

  // A team places as a PAIR: the server puts both members on the same standing and adds both ids
  // to `winners` in a single push. So the list jumps by two, and the banner must read the standing
  // off the players' `place` rather than counting ids — and name everyone who just placed.
  /**
   * `seats` players in seat order, paired with the opposite seat as the backend pairs teams
   * (seat i with i + seats/2, so 4 players → 2 teams, 6 → 3, 8 → 4). `places` carries the standing
   * the server has stamped on whoever has finished so far.
   */
  const teamRoster = (seats: number, places: Record<string, number> = {}): Player[] =>
    Array.from(
      { length: seats },
      (_, seat) =>
        ({
          id: `p${seat}`,
          name: `Player ${seat}`,
          playerInt: seat,
          teamId: seat % (seats / 2),
          place: places[`p${seat}`],
        }) as Player,
    );

  const medal = () => banner()!.querySelector('.winner-banner__medal')!.textContent;
  const winnerName = () => banner()!.querySelector('.winner-banner__name')!.textContent!.trim();

  it('announces a whole winning team together, with the gold medal', () => {
    // Seats 0..3 → teams A (0 & 2) and B (1 & 3). Nobody has finished yet.
    store.players.set(teamRoster(4));
    fixture.detectChanges();

    // Team B comes home: the server places BOTH on 1 and pushes both ids at once.
    store.players.set(teamRoster(4, { p1: 1, p3: 1 }));
    store.winners.set(['p1', 'p3']);
    fixture.detectChanges();

    expect(medal(), 'the first team home takes gold, not silver').toBe('🥇');
    expect(winnerName()).toBe('Player 1 + Player 3');
  });

  it('gives the runner-up team the silver medal, naming both members', () => {
    store.players.set(teamRoster(4));
    fixture.detectChanges();

    store.players.set(teamRoster(4, { p1: 1, p3: 1 })); // team B takes first
    store.winners.set(['p1', 'p3']);
    fixture.detectChanges();

    // Team A follows them home: four ids in the list now, but only the SECOND place.
    store.players.set(teamRoster(4, { p1: 1, p3: 1, p0: 2, p2: 2 }));
    store.winners.set(['p1', 'p3', 'p0', 'p2']);
    fixture.detectChanges();

    expect(medal(), 'the second team home takes silver — not a fourth-place badge').toBe('🥈');
    expect(winnerName()).toBe('Player 0 + Player 2');
  });

  it('gives the third team the bronze medal', () => {
    // Six players → three teams: (0,3), (1,4), (2,5).
    store.players.set(teamRoster(6));
    fixture.detectChanges();

    store.players.set(teamRoster(6, { p1: 1, p4: 1 }));
    store.winners.set(['p1', 'p4']);
    fixture.detectChanges();

    store.players.set(teamRoster(6, { p1: 1, p4: 1, p0: 2, p3: 2 }));
    store.winners.set(['p1', 'p4', 'p0', 'p3']);
    fixture.detectChanges();

    // Six ids in the list by now — the standing is third because three TEAMS have placed.
    store.players.set(teamRoster(6, { p1: 1, p4: 1, p0: 2, p3: 2, p2: 3, p5: 3 }));
    store.winners.set(['p1', 'p4', 'p0', 'p3', 'p2', 'p5']);
    fixture.detectChanges();

    expect(medal()).toBe('🥉');
    expect(winnerName()).toBe('Player 2 + Player 5');
  });

  it('shows no medal for the fourth team home, like the roster', () => {
    // Eight players → four teams: (0,4), (1,5), (2,6), (3,7). Only three medals exist, so the
    // last team home is announced without one — matching the medal column in the player list.
    const placed: Record<string, number> = {};
    const winners: string[] = [];
    store.players.set(teamRoster(8));
    fixture.detectChanges();

    [
      ['p1', 'p5'],
      ['p0', 'p4'],
      ['p2', 'p6'],
      ['p3', 'p7'],
    ].forEach((team, i) => {
      team.forEach((id) => {
        placed[id] = i + 1;
        winners.push(id);
      });
      store.players.set(teamRoster(8, placed));
      store.winners.set([...winners]);
      fixture.detectChanges();
    });

    expect(medal(), 'fourth place earns no medal').toBe('');
    expect(winnerName()).toBe('Player 3 + Player 7');
  });

  it('shows no medal for the fourth finisher in a solo game', () => {
    // No teams: everyone places on their own, so the list grows by one id per push and the
    // standing happens to equal its length — the medals must still stop after bronze.
    const soloRoster = (places: Record<string, number> = {}): Player[] =>
      Array.from(
        { length: 5 },
        (_, seat) =>
          ({
            id: `p${seat}`,
            name: `Player ${seat}`,
            playerInt: seat,
            place: places[`p${seat}`],
          }) as Player,
      );
    const placed: Record<string, number> = {};
    const winners: string[] = [];
    store.players.set(soloRoster());
    fixture.detectChanges();

    ['p2', 'p0', 'p4', 'p1'].forEach((id, i) => {
      placed[id] = i + 1;
      winners.push(id);
      store.players.set(soloRoster(placed));
      store.winners.set([...winners]);
      fixture.detectChanges();
    });

    expect(medal(), 'only the top three are medalled').toBe('');
    expect(winnerName(), 'a solo finisher is named alone').toBe('Player 1');
  });

  it('does not replay a banner for winners already present on the first push', () => {
    store.players.set([{ id: 'p0', name: 'Aria' } as Player]);
    store.winners.set(['p0']); // already finished before the component's first render
    fixture.detectChanges();
    expect(banner()).toBeNull();
  });

  // Regression: the store starts empty and the first real state (with an existing
  // winner) arrives a tick later over SSE — joining mid-game must stay silent, and
  // only a *subsequent* finish should announce.
  it('adopts a winner that arrives on the first real push, then announces later ones', () => {
    fixture.detectChanges(); // mounts with an empty store, before any SSE

    store.players.set([{ id: 'p0', name: 'Aria' } as Player, { id: 'p1', name: 'Bram' } as Player]);
    store.winners.set(['p0']); // first real push already has a finisher
    fixture.detectChanges();
    expect(banner(), 'joining a game with a prior winner must not replay it').toBeNull();

    store.winners.set(['p0', 'p1']); // a live finish this session
    fixture.detectChanges();
    expect(banner()).not.toBeNull();
    expect(banner()!.querySelector('.winner-banner__medal')!.textContent).toBe('🥈');
  });
});
