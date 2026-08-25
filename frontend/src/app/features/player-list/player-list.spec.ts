import { beforeEach, describe, expect, it } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { PlayerList } from './player-list';
import { GameStore } from '../../game-store';
import { Player } from '../../api';

type P = Partial<Player> & { teamId?: number | string };
const player = (over: P): Player =>
  ({
    id: 'x',
    name: 'X',
    color: '#123456',
    isActive: true,
    isPlaying: false,
    place: -1,
    playerInt: 0,
    ...over,
  }) as Player;

describe('PlayerList (scoreboard)', () => {
  let fixture: ComponentFixture<PlayerList>;
  let store: GameStore;
  const chips = (): HTMLElement[] => Array.from(fixture.nativeElement.querySelectorAll('.chip'));
  const names = (): string[] =>
    chips().map((c) => c.querySelector('.chip__name')!.textContent!.trim());

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [PlayerList] }).compileComponents();
    fixture = TestBed.createComponent(PlayerList);
    store = TestBed.inject(GameStore);
  });

  it('renders nothing with no players', () => {
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.roster')).toBeNull();
  });

  it('renders one chip per player in seat/turn order', () => {
    store.players.set([
      player({ id: 'b', name: 'bob', playerInt: 1 }),
      player({ id: 'a', name: 'alice', playerInt: 0 }),
    ]);
    fixture.detectChanges();

    expect(names()).toEqual(['alice', 'bob']); // sorted by playerInt
    expect(chips()[0].querySelector('.chip__initial')?.textContent).toBe('A');
  });

  it('marks the player on turn with the gold dot (and no medal)', () => {
    store.players.set([player({ id: 'a', name: 'alice', isPlaying: true })]);
    fixture.detectChanges();

    expect(chips()[0].classList.contains('chip--turn')).toBe(true);
    expect(chips()[0].querySelector('.chip__dot')).not.toBeNull();
  });

  it('shows a medal for finished players instead of the dot', () => {
    store.players.set([player({ id: 'a', name: 'won', place: 1 })]);
    fixture.detectChanges();

    expect(chips()[0].querySelector('.chip__medal')?.textContent).toBe('🥇');
    expect(chips()[0].querySelector('.chip__dot')).toBeNull();
  });

  it('dims and strikes through a player who has left', () => {
    store.players.set([player({ id: 'a', name: 'gone', isActive: false })]);
    fixture.detectChanges();

    expect(chips()[0].classList.contains('chip--inactive')).toBe(true);
  });

  it('solo game: no team tags and no team summary', () => {
    store.players.set([
      player({ id: 'a', name: 'alice', playerInt: 0 }),
      player({ id: 'b', name: 'bob', playerInt: 1 }),
    ]);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.tag')).toBeNull();
    expect(fixture.nativeElement.querySelector('.roster__teams')).toBeNull();
  });

  it('team game: tags every chip and lists the partnerships', () => {
    store.players.set([
      player({ id: 'a', name: 'Aria', playerInt: 0, teamId: 0 }),
      player({ id: 'b', name: 'Bram', playerInt: 1, teamId: 1 }),
      player({ id: 'c', name: 'Cato', playerInt: 2, teamId: 0 }),
      player({ id: 'd', name: 'Dex', playerInt: 3, teamId: 1 }),
    ]);
    fixture.detectChanges();

    // tags follow turn order: A B A B
    expect(chips().map((c) => c.querySelector('.tag')?.textContent)).toEqual(['A', 'B', 'A', 'B']);

    const lines = Array.from(fixture.nativeElement.querySelectorAll('.team-line')) as HTMLElement[];
    expect(lines.length).toBe(2);
    const line = (el: HTMLElement) => ({
      lbl: el.querySelector('.team-line__lbl')!.textContent!.trim(),
      who: el.querySelector('.team-line__who')!.textContent!.trim(),
    });
    expect(line(lines[0])).toEqual({ lbl: 'Team A:', who: 'Aria & Cato' });
    expect(line(lines[1])).toEqual({ lbl: 'Team B:', who: 'Bram & Dex' });
  });

  // A widened two-player board seats empty placeholders between the players to stretch the track.
  // They own board, not a chair: the scoreboard is a list of people, and a nameless colourless
  // entry there would read as a player who has not connected yet.
  it('leaves the empty seats of a widened board out of the roster', () => {
    store.players.set([
      player({ id: 'a', name: 'alice', playerInt: 0 }),
      player({ id: 'empty-seat-p1', name: '', playerInt: 1, placeholder: true }),
      player({ id: 'b', name: 'bob', playerInt: 2 }),
      player({ id: 'empty-seat-p3', name: '', playerInt: 3, placeholder: true }),
    ]);
    fixture.detectChanges();

    expect(names()).toEqual(['alice', 'bob']);
  });
});
