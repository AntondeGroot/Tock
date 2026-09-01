import { Component, inject } from '@angular/core';
import { Translations } from '../../../../i18n/translations.service';
import { MoveRejection } from './move-rejection.service';

/**
 * "You can't make that move" popup, ported from the GWT MoveRejectedPopup. A
 * compact centred box; any click dismisses it. The message is supplied by the
 * board via the MoveRejection service; the title/close-hint come from i18n.
 */
@Component({
  selector: 'app-move-rejected',
  templateUrl: './move-rejected.html',
  styleUrl: './move-rejected.scss',
})
export class MoveRejected {
  protected readonly i18n = inject(Translations);
  protected readonly rejection = inject(MoveRejection);
}
