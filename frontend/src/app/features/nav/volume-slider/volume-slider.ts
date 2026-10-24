import { Component, computed, inject } from '@angular/core';
import { SoundService } from '../../../sound.service';

/**
 * A brass fader in a wooden pill — the game's master-volume control, in the settings dialog.
 * The speaker glyph (which toggles mute) grows sound-waves as the volume rises; the carved groove
 * fills with gold up to the thumb.
 */
@Component({
  selector: 'app-volume-slider',
  templateUrl: './volume-slider.html',
  styleUrl: './volume-slider.scss',
})
export class VolumeSlider {
  protected readonly sound = inject(SoundService);

  /** Gold-fill percentage of the groove. */
  protected readonly pct = computed(() => Math.round(this.sound.volume() * 100));

  /** Which speaker glyph to show. */
  protected readonly level = computed(() => {
    const v = this.sound.volume();
    if (v === 0) return 'muted';
    return v < 0.5 ? 'low' : 'high';
  });

  protected onInput(value: string): void {
    this.sound.setVolume(Number(value));
  }

  protected toggleMute(): void {
    this.sound.toggleMute();
  }
}
