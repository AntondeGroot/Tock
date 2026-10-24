import { afterNextRender, Component, ElementRef, output, viewChild } from '@angular/core';
import { wheelColor, wheelRgb } from './wheel-color';

/**
 * A big round colour picker. A tap picks the colour under the finger, and dragging keeps picking,
 * so the pawn changes along with the finger. The wheel is painted from the same function that
 * reads a tap (wheel-color.ts), so the colour picked is exactly the colour shown there.
 */
@Component({
  selector: 'app-color-wheel',
  templateUrl: './color-wheel.html',
  styleUrl: './color-wheel.scss',
})
export class ColorWheel {
  readonly picked = output<string>();

  private readonly canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('wheel');
  private dragging = false;

  constructor() {
    afterNextRender(() => this.paint());
  }

  protected press(event: PointerEvent): void {
    this.dragging = true;
    this.canvas().nativeElement.setPointerCapture?.(event.pointerId);
    this.pickAt(event);
  }

  protected drag(event: PointerEvent): void {
    if (this.dragging) this.pickAt(event);
  }

  protected release(): void {
    this.dragging = false;
  }

  private pickAt(event: PointerEvent): void {
    const box = this.canvas().nativeElement.getBoundingClientRect();
    const radius = box.width / 2;
    const color = wheelColor(
      (event.clientX - box.left - radius) / radius,
      (event.clientY - box.top - radius) / radius,
    );
    if (color) this.picked.emit(color);
  }

  /** Paints every pixel of the wheel; pixels outside it stay transparent. */
  private paint(): void {
    const canvas = this.canvas().nativeElement;
    const context = canvas.getContext('2d');
    if (!context) return;

    const size = Math.round(canvas.clientWidth * window.devicePixelRatio) || 1;
    canvas.width = canvas.height = size;
    const image = context.createImageData(size, size);
    const radius = size / 2;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const rgb = wheelRgb((x + 0.5 - radius) / radius, (y + 0.5 - radius) / radius);
        if (!rgb) continue;
        image.data.set([...rgb, 255], (y * size + x) * 4);
      }
    }
    context.putImageData(image, 0, 0);
  }
}
