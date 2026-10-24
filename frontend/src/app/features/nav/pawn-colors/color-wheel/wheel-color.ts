/** How far out (as a share of the radius) the colours are at their purest. */
const PURE_AT = 0.55;
const CENTRE_LIGHTNESS = 95;
const PURE_LIGHTNESS = 50;
const RIM_LIGHTNESS = 18;
const SATURATION = 90;

export type Rgb = [red: number, green: number, blue: number];

/**
 * The colour at a point of the wheel, as offsets from its centre in units of the radius (the rim
 * is at distance 1). The hue runs around the wheel; from the centre out the colour runs from
 * near-white through its purest to dark, so light, bright and dark shades are all one tap away.
 * Null outside the wheel.
 */
export function wheelRgb(x: number, y: number): Rgb | null {
  const distance = Math.hypot(x, y);
  if (distance > 1) return null;
  const hue = ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
  return hslToRgb(hue, SATURATION, lightnessAt(distance));
}

/** The same colour as `#rrggbb`, the form the pawns are painted with. */
export function wheelColor(x: number, y: number): string | null {
  const rgb = wheelRgb(x, y);
  return rgb && '#' + rgb.map((channel) => channel.toString(16).padStart(2, '0')).join('');
}

function lightnessAt(distance: number): number {
  if (distance <= PURE_AT) {
    return CENTRE_LIGHTNESS - (CENTRE_LIGHTNESS - PURE_LIGHTNESS) * (distance / PURE_AT);
  }
  const outward = (distance - PURE_AT) / (1 - PURE_AT);
  return PURE_LIGHTNESS - (PURE_LIGHTNESS - RIM_LIGHTNESS) * outward;
}

/** The standard HSL → RGB conversion (hue in degrees, saturation and lightness in percent). */
function hslToRgb(hue: number, saturation: number, lightness: number): Rgb {
  const s = saturation / 100;
  const l = lightness / 100;
  const chroma = s * Math.min(l, 1 - l);
  const channel = (n: number): number => {
    const k = (n + hue / 30) % 12;
    return Math.round(255 * (l - chroma * Math.max(-1, Math.min(k - 3, 9 - k, 1))));
  };
  return [channel(0), channel(8), channel(4)];
}
