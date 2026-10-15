// Draws docs/architecture.svg — the library's public API as a UML class diagram — from the data in
// architecture.data.mjs. Change the picture there and rerun; never edit the SVG by hand.
//
//   node projects/card-table/docs/architecture.mjs           writes the SVG
//   node projects/card-table/docs/architecture.mjs --check   fails if the SVG is out of date
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { CLASSES, NOTES, RELATIONS } from './architecture.data.mjs';

const WIDTH = 1110;
const HEIGHT = 960;

const COLOURS = {
  background: '#ffffff',
  fill: '#f3f6fb',
  stroke: '#4a6fa5',
  note: { fill: '#fff8dc', stroke: '#b59a3c' },
  text: '#1d2733',
  muted: '#4b5866',
  line: '#4b5866',
};

const SANS = 'Helvetica, Arial, sans-serif';
const MONO = 'SFMono-Regular, Menlo, Consolas, monospace';
// Widths a line of text takes, for sizing boxes around it: generous, so no font overflows.
const MONO_CHAR = 7.4; // 12px monospace
const NAME_CHAR = 9.5; // 15px bold sans
const NOTE_CHAR = 6.6; // 12px sans
const LINE = 17; // one member per line
const PAD = 12;

const escape = (text) =>
  text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

function text(x, y, content, { size = 12, font = MONO, anchor = 'start', style = '', fill } = {}) {
  const extra = [
    anchor === 'start' ? '' : `text-anchor="${anchor}"`,
    style.includes('bold') ? 'font-weight="bold"' : '',
    style.includes('italic') ? 'font-style="italic"' : '',
  ].filter(Boolean);
  const attrs = [`x="${x}"`, `y="${y}"`, `font-family="${font}"`, `font-size="${size}"`];
  attrs.push(`fill="${fill ?? COLOURS.text}"`, ...extra);
  return `<text ${attrs.join(' ')}>${escape(content)}</text>`;
}

// ── Classes ─────────────────────────────────────────────────────────────────────────────────────

/** A class's box: its size, and the y of each compartment, worked out from what it holds. */
function measure(cls) {
  const members = [...(cls.attributes ?? []), ...(cls.operations ?? [])];
  const width = Math.max(
    cls.name.length * NAME_CHAR,
    ...[cls.selector ?? '', ...members].map((line) => line.length * MONO_CHAR),
  );
  const header = cls.selector ? 62 : 46;
  const compartment = (lines) => (lines?.length ? lines.length * LINE + 2 * 6 : 0);
  const attributesAt = cls.y + header;
  const operationsAt = attributesAt + compartment(cls.attributes);
  const height = operationsAt + compartment(cls.operations) - cls.y;
  return { ...cls, w: Math.ceil(width + 2 * PAD), h: height, attributesAt, operationsAt };
}

const BOXES = Object.fromEntries(Object.entries(CLASSES).map(([id, cls]) => [id, measure(cls)]));

function compartment(box, top, lines) {
  if (!lines?.length) return [];
  const { x, w } = box;
  const rule = `<line x1="${x}" y1="${top}" x2="${x + w}" y2="${top}" stroke="${COLOURS.stroke}" stroke-width="1.5"/>`;
  return [rule, ...lines.map((line, i) => text(x + PAD, top + 6 + 13 + i * LINE, line))];
}

function classBox(box) {
  const { x, y, w, h } = box;
  const cx = x + w / 2;
  const muted = { font: SANS, anchor: 'middle', fill: COLOURS.muted };
  return [
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${COLOURS.fill}" stroke="${COLOURS.stroke}" stroke-width="1.5"/>`,
    text(cx, y + 17, `«${box.stereotype}»`, { ...muted, size: 11 }),
    text(cx, y + 35, box.name, { size: 15, font: SANS, anchor: 'middle', style: 'bold' }),
    box.selector ? text(cx, y + 52, box.selector, { ...muted, font: MONO }) : '',
    ...compartment(box, box.attributesAt, box.attributes),
    ...compartment(box, box.operationsAt, box.operations),
  ]
    .filter(Boolean)
    .join('\n');
}

// ── Relations ───────────────────────────────────────────────────────────────────────────────────

/**
 * The point `at` (0 to 1) of the way along one side of a class's box — or, for `at: 'align'`, the
 * point on that side level with `other`, so the line between them runs straight.
 */
function anchor([id, side, at], other) {
  const { x, y, w, h } = BOXES[id];
  const along = (start, length, level) => (at === 'align' ? level : start + length * at);
  if (side === 'top') return [along(x, w, other?.[0]), y];
  if (side === 'bottom') return [along(x, w, other?.[0]), y + h];
  if (side === 'left') return [x, along(y, h, other?.[1])];
  return [x + w, along(y, h, other?.[1])];
}

const vertical = (side) => side === 'top' || side === 'bottom';

/** The line between two sides, square-cornered: out of the first side, into the second. */
function route(from, to) {
  const p = anchor(from);
  const q = anchor(to, p);
  const [fromSide, toSide] = [from[1], to[1]];
  if (vertical(fromSide) && vertical(toSide)) {
    const midY = (p[1] + q[1]) / 2;
    return [p, [p[0], midY], [q[0], midY], q];
  }
  if (!vertical(fromSide) && !vertical(toSide)) {
    const midX = (p[0] + q[0]) / 2;
    return [p, [midX, p[1]], [midX, q[1]], q];
  }
  return vertical(fromSide) ? [p, [p[0], q[1]], q] : [p, [q[0], p[1]], q];
}

function labelPoint(points, near) {
  if (near === 'from') return points[0];
  if (near === 'to') return points.at(-1);
  const i = Math.floor((points.length - 1) / 2);
  return [(points[i][0] + points[i + 1][0]) / 2, (points[i][1] + points[i + 1][1]) / 2];
}

function relation({ kind, from, to, labels = [] }) {
  const points = route(from, to);
  const dashed = kind === 'dependency' ? ' stroke-dasharray="6 4"' : '';
  const start = kind === 'composition' ? ' marker-start="url(#diamond)"' : '';
  const end = kind === 'composition' ? '' : ' marker-end="url(#open)"';
  const path = points.map(([x, y]) => `${x},${y}`).join(' ');
  const muted = { font: SANS, fill: COLOURS.muted };
  return [
    `<polyline points="${path}" fill="none" stroke="${COLOURS.line}" stroke-width="1.5"${dashed}${start}${end}/>`,
    ...labels.map(({ text: content, near, dx = 0, dy = 0, anchor: align = 'start' }) => {
      const [x, y] = labelPoint(points, near);
      return text(x + dx, y + dy, content, { ...muted, anchor: align });
    }),
  ].join('\n');
}

// ── Notes ───────────────────────────────────────────────────────────────────────────────────────

function note({ x, y, to, lines }) {
  const w = Math.ceil(Math.max(...lines.map((l) => l.length)) * NOTE_CHAR + 2 * PAD);
  const h = lines.length * 16 + 2 * 10;
  const fold = 12;
  const { fill, stroke } = COLOURS.note;
  const target = BOXES[to];
  const pin = [target.x + target.w, target.y + target.h / 2];
  return [
    `<line x1="${x}" y1="${y + h / 2}" x2="${pin[0]}" y2="${pin[1]}" stroke="${stroke}" stroke-width="1.5" stroke-dasharray="4 3"/>`,
    `<path d="M${x},${y} H${x + w - fold} L${x + w},${y + fold} V${y + h} H${x} Z" fill="${fill}" stroke="${stroke}" stroke-width="1.5"/>`,
    `<path d="M${x + w - fold},${y} V${y + fold} H${x + w}" fill="none" stroke="${stroke}" stroke-width="1.5"/>`,
    ...lines.map((line, i) => text(x + PAD, y + 10 + 12 + i * 16, line, { font: SANS })),
  ].join('\n');
}

// ── The picture ─────────────────────────────────────────────────────────────────────────────────

const MARKERS = `<defs>
<marker id="open" viewBox="0 0 12 12" refX="11" refY="6" markerWidth="12" markerHeight="12" markerUnits="userSpaceOnUse" orient="auto"><path d="M1,1 L11,6 L1,11" fill="none" stroke="${COLOURS.line}" stroke-width="1.5"/></marker>
<marker id="diamond" viewBox="0 0 18 10" refX="1" refY="5" markerWidth="18" markerHeight="10" markerUnits="userSpaceOnUse" orient="auto"><path d="M1,5 L9,1 L17,5 L9,9 Z" fill="${COLOURS.line}"/></marker>
</defs>`;

export function architectureSvg() {
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">`,
    '<!-- Generated by architecture.mjs from architecture.data.mjs; edit those, not this file. -->',
    MARKERS,
    `<rect width="${WIDTH}" height="${HEIGHT}" fill="${COLOURS.background}"/>`,
    ...RELATIONS.map(relation),
    ...NOTES.map(note),
    ...Object.values(BOXES).map(classBox),
    '</svg>',
    '',
  ].join('\n');
}

const target = fileURLToPath(new URL('./architecture.svg', import.meta.url));
if (process.argv.includes('--check')) {
  if (readFileSync(target, 'utf8') !== architectureSvg()) {
    console.error('docs/architecture.svg is out of date: run npm run diagrams');
    process.exit(1);
  }
} else {
  writeFileSync(target, architectureSvg());
}
