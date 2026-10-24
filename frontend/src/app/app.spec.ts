import { TestBed } from '@angular/core/testing';
import { App } from './app';
import { Translations } from './i18n/translations.service';

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it('renders the localized game name in the title bar', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    // The title bar shows the localized game name (e.g. Tock/Keezen/Dog), not a
    // hardcoded string — so it tracks whatever the current locale resolves to.
    const expected = TestBed.inject(Translations).t('gameName');
    expect(compiled.querySelector('h1')?.textContent?.trim()).toBe(expected);
  });

  // Volume and language used to sit in the header (desktop) and the footer (mobile). They now live
  // only in the settings dialog, so the page itself carries just the rules and the cog.
  it('keeps volume and language out of the header and footer, behind the settings cog', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;

    expect(compiled.querySelector('app-volume-slider')).toBeNull();
    expect(compiled.querySelector('app-language-selector')).toBeNull();
    expect(compiled.querySelector('.footer-nav app-game-rules')).not.toBeNull();
    expect(compiled.querySelector('.footer-nav app-settings')).not.toBeNull();
  });
});
