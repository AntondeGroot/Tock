import { beforeEach, describe, expect, it, onTestFinished } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Settings } from './settings';
import { CardHints } from '../../card-hints/card-hints.service';

describe('Settings', () => {
  let fixture: ComponentFixture<Settings>;
  const element = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const openSettings = () => {
    element().querySelector<HTMLButtonElement>('.settingsButton')!.click();
    fixture.detectChanges();
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [Settings] }).compileComponents();
    fixture = TestBed.createComponent(Settings);
    fixture.detectChanges();
  });

  // Volume and language moved off the header into a dialog behind the cog, so the header has room
  // for the title on a phone. Until the cog is clicked neither control is on the page; after, both.
  it('shows the volume and language controls only once the cog is clicked', () => {
    // GIVEN the settings are closed
    expect(element().querySelector('app-volume-slider')).toBeNull();
    expect(element().querySelector('app-language-selector')).toBeNull();

    // WHEN the cog is clicked
    openSettings();

    // THEN both controls are in the dialog
    const dialog = element().querySelector('.settings-dialog')!;
    expect(dialog.querySelector('app-volume-slider')).not.toBeNull();
    expect(dialog.querySelector('app-language-selector')).not.toBeNull();
  });

  // The dialog closes the ways the rules modal does — the dark backdrop, Escape — plus its Close
  // button. A click INSIDE the dialog must not close it: that is where the slider is being dragged
  // and the language picked.
  it('closes from the backdrop, Escape and Close, but not from a click inside the dialog', () => {
    const isOpen = () => element().querySelector('.settings-dialog') !== null;
    const closeWith = (close: () => void) => {
      openSettings();
      close();
      fixture.detectChanges();
    };

    closeWith(() => element().querySelector<HTMLElement>('.settings-dialog')!.click());
    expect(isOpen()).toBe(true);

    closeWith(() => element().querySelector<HTMLElement>('.settings-overlay')!.click());
    expect(isOpen()).toBe(false);

    closeWith(() =>
      element()
        .querySelector('.settings-overlay')!
        .dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })),
    );
    expect(isOpen()).toBe(false);

    closeWith(() => element().querySelector<HTMLButtonElement>('.settings-close')!.click());
    expect(isOpen()).toBe(false);
  });

  // The switch is how a player turns the hints off (or back on) for good. It has to show the
  // current state — a screen reader reads aria-checked — and a tap flips the real setting.
  it('shows whether card hints are on, and a tap turns them off and on again', () => {
    onTestFinished(() => {
      document.cookie = 'cardHints=; path=/; max-age=0';
      document.cookie = 'cardHintsDecided=; path=/; max-age=0';
    });
    const hints = TestBed.inject(CardHints);
    openSettings();
    const hintSwitch = element().querySelector<HTMLButtonElement>('.settings-switch')!;
    const tap = () => {
      hintSwitch.click();
      fixture.detectChanges();
    };
    expect(hintSwitch.getAttribute('aria-checked')).toBe('true');

    tap();
    expect(hints.visible()).toBe(false);
    expect(hintSwitch.getAttribute('aria-checked')).toBe('false');

    tap();
    expect(hints.visible()).toBe(true);
    expect(hintSwitch.getAttribute('aria-checked')).toBe('true');
  });

  // The colour screen lives inside the settings dialog. "Done" is the one way out a player needs:
  // it closes everything, back to the game. And whoever opens Settings next — maybe for the volume —
  // must find the settings themselves, not the colour screen they last left.
  it('opens the pawn colours from "Change", closes on "Done", and reopens on the settings', () => {
    const click = (selector: string) => {
      element().querySelector<HTMLButtonElement>(selector)!.click();
      fixture.detectChanges();
    };

    openSettings();
    click('.settings-change');
    expect(element().querySelector('app-pawn-colors')).not.toBeNull();

    click('.colors-done');
    expect(element().querySelector('.settings-dialog')).toBeNull();

    openSettings();
    expect(element().querySelector('app-pawn-colors')).toBeNull();
    expect(element().querySelector('app-volume-slider')).not.toBeNull();
  });
});
