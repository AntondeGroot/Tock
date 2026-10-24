import { beforeEach, describe, expect, it } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Settings } from './settings';

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
});
