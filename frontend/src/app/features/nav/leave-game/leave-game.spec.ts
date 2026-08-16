import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';

import { LeaveGame } from './leave-game';
import { provideApi } from '../../../api';

/**
 * The browser Back button is guarded on the History API (there is no router): the component pushes
 * a sentinel entry, and a popstate re-pushes it and opens the same confirm dialog as the Leave
 * button. These specs drive popstate directly — jsdom fires no real navigations.
 */
describe('LeaveGame back guard', () => {
  async function createInGame() {
    document.cookie = 'sessionid=s1';
    document.cookie = 'playerid=1';
    await TestBed.configureTestingModule({
      imports: [LeaveGame],
      providers: [provideHttpClient(), provideApi('')],
    }).compileComponents();

    const fixture = TestBed.createComponent(LeaveGame);
    fixture.detectChanges(); // runs ngOnInit, arming the guard
    return fixture;
  }

  async function createOutOfGame() {
    document.cookie = 'sessionid=; max-age=0';
    document.cookie = 'playerid=; max-age=0';
    await TestBed.configureTestingModule({
      imports: [LeaveGame],
      providers: [provideHttpClient(), provideApi('')],
    }).compileComponents();

    const fixture = TestBed.createComponent(LeaveGame);
    fixture.detectChanges();
    return fixture;
  }

  afterEach(() => {
    document.cookie = 'sessionid=; max-age=0';
    document.cookie = 'playerid=; max-age=0';
  });

  // Back must not silently drop the player out of a running game: it asks first, and the page it
  // was about to leave stays put (a fresh history entry replaces the one Back consumed).
  it('opens the confirm dialog and stays on the page when Back is pressed', async () => {
    const fixture = await createInGame();
    const component = fixture.componentInstance as unknown as { confirming: () => boolean };
    const lengthBeforeBack = history.length;

    window.dispatchEvent(new PopStateEvent('popstate'));
    fixture.detectChanges();

    expect(component.confirming()).toBe(true);
    expect(history.length).toBe(lengthBeforeBack + 1); // guard re-armed, so we did not navigate
  });

  // Saying "no" must not spend the guard: a player who cancels is still in the game, so the next
  // Back has to ask again rather than let them straight out.
  it('asks again on the next Back after the dialog is cancelled', async () => {
    const fixture = await createInGame();
    const component = fixture.componentInstance as unknown as {
      confirming: () => boolean;
      cancel: () => void;
    };

    window.dispatchEvent(new PopStateEvent('popstate'));
    fixture.detectChanges();
    component.cancel();
    fixture.detectChanges();
    expect(component.confirming()).toBe(false);

    const lengthBeforeSecondBack = history.length;
    window.dispatchEvent(new PopStateEvent('popstate'));
    fixture.detectChanges();

    expect(component.confirming()).toBe(true);
    expect(history.length).toBe(lengthBeforeSecondBack + 1); // re-armed again, still on the page
  });

  // The same component renders on pages with no game to leave (no session cookies, so no Leave
  // button either). There Back is ordinary navigation and must not be trapped — nothing is pushed
  // on arrival, and a popstate neither blocks the exit nor pops a dialog about a game you are not in.
  it('leaves Back alone when there is no game to leave', async () => {
    const fixture = await createOutOfGame();
    const component = fixture.componentInstance as unknown as { confirming: () => boolean };
    const lengthOnArrival = history.length;

    window.dispatchEvent(new PopStateEvent('popstate'));
    fixture.detectChanges();

    expect(component.confirming()).toBe(false);
    expect(history.length).toBe(lengthOnArrival); // no sentinel pushed, on arrival or on Back
  });
});
