import { effect, ElementRef, signal, Signal } from '@angular/core';

/**
 * The live height, in px, of the element `element` points at — 0 until it is laid out, or where
 * the browser can't measure it (no ResizeObserver, as under jsdom). Call in an injection context.
 */
export function measuredHeight(
  element: Signal<ElementRef<HTMLElement> | undefined>,
): Signal<number> {
  const height = signal(0);
  effect((onCleanup) => {
    const el = element()?.nativeElement;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => height.set(el.offsetHeight));
    observer.observe(el);
    onCleanup(() => observer.disconnect());
  });
  return height.asReadonly();
}
