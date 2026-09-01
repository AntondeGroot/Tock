import { Component, effect, inject } from '@angular/core';
import { Board } from './features/board/board';
import { LanguageSelector } from './features/nav/language-selector/language-selector';
import { VolumeSlider } from './features/nav/volume-slider/volume-slider';
import { GameRules } from './features/nav/game-rules/game-rules';
import { LeaveGame } from './features/nav/leave-game/leave-game';
import { MoveRejected } from './features/board/feedback/move-rejected/move-rejected';
import { TeamHandoffPopup } from './features/team-handoff/team-handoff';
import { WinnerBanner } from './features/winner-banner/winner-banner';
import { ChatPanel } from './features/chat/chat';
import { Translations } from './i18n/translations.service';
import { basePath } from './base-path';

@Component({
  selector: 'app-root',
  imports: [
    Board,
    LanguageSelector,
    VolumeSlider,
    GameRules,
    LeaveGame,
    MoveRejected,
    TeamHandoffPopup,
    WinnerBanner,
    ChatPanel,
  ],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  protected readonly i18n = inject(Translations);

  constructor() {
    // SCSS background images can't read <base href> (CSS url() resolves against the
    // stylesheet, not the base href), so publish the mount-prefixed URLs as CSS vars the
    // stylesheets consume — keeps them working under a /keezen deploy and at the root.
    // (The card sprite is a bundler-resolved component asset, so it doesn't need this.)
    const b = basePath();
    const root = document.documentElement.style;
    root.setProperty('--globe-language-image', `url('${b}/globe-language.svg')`);

    // Keep the browser tab title in sync with the localized game name; t() reads
    // the language signal, so this re-runs whenever the language changes.
    effect(() => (document.title = this.i18n.t('gameName')));
  }
}
