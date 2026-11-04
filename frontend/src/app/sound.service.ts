import { Injectable, signal } from '@angular/core';
import { basePath } from './base-path';

export type SoundName =
  | 'buttonClick'
  | 'pawnOnBoard'
  | 'pawnKilled'
  | 'pawnHome'
  | 'turnChange'
  | 'medalAwarded'
  | 'chatMessage';

// The same clips the GWT client used, now bundled in the Angular app (public/assets/audio).
const FILES: Record<SoundName, string> = {
  buttonClick: 'zapsplat_multimedia_button_click_bright_001_92098.mp3',
  pawnOnBoard: 'master_of_dreams_8_bit_arcade_up_3_012.mp3',
  pawnKilled: 'zapsplat_multimedia_game_sound_classic_arcade_negative_lose_life_die_etc_113889.mp3',
  pawnHome: 'zapsplat_multimedia_game_sound_fanfare_trumpets_simple_positive_109639.mp3',
  turnChange: 'zapsplat_vehicles_car_cabin_light_buttom_press_on_002_113419.mp3',
  medalAwarded:
    'zapsplat_multimedia_game_sound_fanfare_trumpets_staccato_finish_complete_109640.mp3',
  chatMessage: 'zapsplat_multimedia_pop_up_pop_002_91296.mp3',
};
// Per-sound base volume — the arcade "up" is loud, so the GWT played it at 0.1. Scaled by the
// user's master volume.
const BASE_VOLUME: Partial<Record<SoundName, number>> = { pawnOnBoard: 0.1 };

const STORAGE_KEY = 'keezen.volume';

/**
 * The game's sound effects (ported from the GWT AudioPlayer), behind a master volume the player
 * controls (0 = muted → 1 = full, remembered across sessions). One preloaded HTMLAudioElement per
 * effect, base-href aware. Playback failures — e.g. the browser's autoplay policy before the first
 * user gesture — are swallowed, as in the GWT.
 */
@Injectable({ providedIn: 'root' })
export class SoundService {
  /** Master volume, 0..1. */
  readonly volume = signal(loadVolume());
  private lastAudible = this.volume() > 0 ? this.volume() : 1;
  private readonly audio = new Map<SoundName, HTMLAudioElement>();

  constructor() {
    const base = basePath();
    for (const name of Object.keys(FILES) as SoundName[]) {
      const el = new Audio(`${base}/assets/audio/${FILES[name]}`);
      el.preload = 'auto';
      this.audio.set(name, el);
    }
  }

  setVolume(value: number): void {
    const v = Math.min(1, Math.max(0, value));
    this.volume.set(v);
    if (v > 0) this.lastAudible = v;
    saveVolume(v);
  }

  /** Toggle between muted and the last audible level (the speaker glyph). */
  toggleMute(): void {
    this.setVolume(this.volume() > 0 ? 0 : this.lastAudible);
  }

  play(name: SoundName, delayMs = 0): void {
    const master = this.volume();
    if (master <= 0) return;
    const el = this.audio.get(name);
    if (!el) return;
    const run = () => {
      el.currentTime = 0;
      el.volume = (BASE_VOLUME[name] ?? 1) * master;
      void el.play().catch(() => {
        /* autoplay may be blocked until the first interaction */
      });
    };
    if (delayMs > 0) setTimeout(run, delayMs);
    else run();
  }
}

function loadVolume(): number {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const n = raw == null ? 1 : Number(raw);
    return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 1;
  } catch {
    return 1;
  }
}

function saveVolume(v: number): void {
  try {
    localStorage.setItem(STORAGE_KEY, String(v));
  } catch {
    /* ignore (private mode / no storage) */
  }
}
