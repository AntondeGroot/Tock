import {
  Component,
  ElementRef,
  OnDestroy,
  OnInit,
  afterRenderEffect,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { ChatService } from './chat.service';
import { GameStore } from '../../game-store';
import { resolveGameSession } from '../../session';

/** This close to the end of the messages still counts as reading the latest one. */
const AT_BOTTOM_TOLERANCE_PX = 20;

/**
 * In-game chat, ported from the GWT board's chat widget. It shows only while the chat
 * server is reachable (`ChatService.available`): no server, no chat UI.
 *
 * Desktop: an always-open panel just above the footer. Mobile: it collapses (like the GWT
 * mobile layout) into a floating chat button with an unread-count badge; tapping it opens the
 * panel as a popup over the board and clears the badge.
 */
@Component({
  selector: 'app-chat',
  templateUrl: './chat.html',
  styleUrl: './chat.scss',
})
export class ChatPanel implements OnInit, OnDestroy {
  protected readonly chat = inject(ChatService);
  private readonly store = inject(GameStore);
  private readonly session = resolveGameSession();

  /** Mobile popup open/closed (ignored on desktop, where the panel is always shown). */
  protected readonly open = signal(false);
  /** Messages the viewer has already seen — everything present when chat first loads counts as
   *  seen, so history never shows as unread (matches the GWT badge). */
  private readonly seenCount = signal(0);
  private seenInitialized = false;

  private readonly display = viewChild<ElementRef<HTMLElement>>('display');
  /** Whether the viewer is at the newest message; false while they scroll back through history. */
  private followsLatest = true;

  /** Unread badge count for the mobile chat button. */
  protected readonly unread = computed(() =>
    Math.max(0, this.chat.messages().length - this.seenCount()),
  );

  constructor() {
    effect(() => {
      const total = this.chat.messages().length;
      // Baseline existing history the first time it loads.
      if (!this.seenInitialized && total > 0) {
        this.seenCount.set(total);
        this.seenInitialized = true;
      }
      // While the popup is open, keep everything marked seen so the badge stays cleared.
      if (this.open()) this.seenCount.set(total);
    });
    // After rendering: the new message has to be in the list to scroll to it, and the phone popup
    // is hidden until it opens, so a list that is not showing yet has nothing to scroll.
    afterRenderEffect(() => {
      this.chat.messages();
      this.open();
      const list = this.display()?.nativeElement;
      if (list && this.followsLatest) list.scrollTop = list.scrollHeight;
    });
  }

  /** The viewer's display name — falls back to their id, then a generic label. */
  private readonly sender = computed(() => {
    const me = this.store.players().find((p) => p.id === this.session.playerId);
    return me?.name ?? this.session.playerId ?? 'anon';
  });

  ngOnInit(): void {
    if (this.session.sessionId) this.chat.connect(this.session.sessionId);
  }

  ngOnDestroy(): void {
    this.chat.disconnect();
  }

  protected toggle(): void {
    this.followsLatest = true; // opening always starts at the newest message
    this.open.update((o) => !o);
  }

  /** Scrolling back to read history must not get interrupted by the next message coming in. */
  protected noteScroll(list: HTMLElement): void {
    const distanceToEnd = list.scrollHeight - list.scrollTop - list.clientHeight;
    this.followsLatest = distanceToEnd <= AT_BOTTOM_TOLERANCE_PX;
  }

  protected close(): void {
    this.open.set(false);
  }

  protected send(input: HTMLInputElement): void {
    this.chat.send(input.value, this.sender());
    input.value = '';
  }
}
