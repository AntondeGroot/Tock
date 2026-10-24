import { Component, inject, signal } from '@angular/core';
import { Translations } from '../../../i18n/translations.service';
import { VolumeSlider } from '../volume-slider/volume-slider';
import { LanguageSelector } from '../language-selector/language-selector';
import { CardHints } from '../../card-hints/card-hints.service';

/**
 * Settings button + dialog: a cog in the top-right (with a "Settings" label on desktop, the icon
 * alone on mobile) that opens the volume, language and card-hint controls. Like the rules modal, clicking
 * the dark backdrop or pressing Escape closes it; changes apply immediately, so there is nothing
 * to save.
 */
@Component({
  selector: 'app-settings',
  imports: [VolumeSlider, LanguageSelector],
  templateUrl: './settings.html',
  styleUrl: './settings.scss',
})
export class Settings {
  protected readonly i18n = inject(Translations);
  protected readonly hints = inject(CardHints);
  protected readonly open = signal(false);
}
