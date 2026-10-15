// Draws docs/architecture.svg — the library's design in one picture — from the data below.
// Change the picture by changing the data and rerunning; never edit the SVG by hand.
//
//   node projects/card-table/docs/architecture.mjs           writes the SVG
//   node projects/card-table/docs/architecture.mjs --check   fails if the SVG is out of date
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const WIDTH = 1000;
const HEIGHT = 560;

// Each box: where it sits, its title, and the lines under it. `code` titles are set in monospace.
const BOXES = {
  game: {
    x: 40,
    y: 20,
    w: 920,
    h: 70,
    title: 'Your game',
    lines: ['rules · server state · board geometry'],
    tone: 'game',
  },
  table: {
    x: 40,
    y: 190,
    w: 380,
    h: 130,
    title: 'CardTable',
    code: true,
    lines: [
      'the engine · Angular signals · no template',
      'zones: hand · pile · deck · your own',
      'flyers · deal-in · masks',
    ],
  },
  layer: {
    x: 600,
    y: 190,
    w: 360,
    h: 130,
    title: '<app-card-layer [table]>',
    code: true,
    lines: ['dumb OnPush component', 'draws every card and flyer', 'timing → CSS vars'],
  },
  layout: {
    x: 40,
    y: 420,
    w: 380,
    h: 110,
    title: 'TableLayout + zone layouts',
    lines: ["where each zone's cards lie: x, y, tilt, size, stacking", 'DEFAULT_LAYOUT ships one'],
    tone: 'seam',
  },
  card: {
    x: 600,
    y: 420,
    w: 360,
    h: 110,
    title: '<app-card>',
    code: true,
    lines: ['the sprite sheet, or your own', '[face] template (tiles)'],
  },
};

// Each arrow runs straight from one point to another. Each of its labels sits at `at`, one line per
// entry, left-aligned unless `anchor` says otherwise; `code` labels are set in monospace.
const ARROWS = [
  {
    from: [70, 90],
    to: [70, 190],
    labels: [
      { at: [82, 116], lines: ['sets up and drives'] },
      {
        at: [82, 136],
        lines: [
          'new CardTable({ hand, layout?, timing? })',
          'place · deal · flyToPile · tradeSwap',
        ],
        code: true,
      },
    ],
  },
  {
    from: [405, 190],
    to: [405, 90],
    labels: [
      { at: [417, 116], lines: ['answers'] },
      { at: [417, 136], lines: ['positionOf', 'nextPositionIn'], code: true },
    ],
  },
  {
    from: [630, 90],
    to: [630, 190],
    labels: [
      { at: [642, 116], lines: ['binds'] },
      { at: [642, 136], lines: ['[table] · [face]', '[selectedUuid]', '[isSpecial]'], code: true },
    ],
  },
  {
    from: [900, 190],
    to: [900, 90],
    labels: [
      { at: [888, 116], lines: ['emits'], anchor: 'end' },
      { at: [888, 136], lines: ['cardClick', 'cardHover'], anchor: 'end', code: true },
    ],
  },
  {
    from: [600, 270],
    to: [420, 270],
    labels: [
      { at: [510, 258], lines: ['reads'], anchor: 'middle' },
      { at: [510, 292], lines: ['cards() · flyers()', 'timing'], anchor: 'middle', code: true },
    ],
  },
  {
    from: [230, 320],
    to: [230, 420],
    labels: [{ at: [242, 362], lines: ['where does the i-th of', 'n cards in a zone lie?'] }],
  },
  {
    from: [780, 320],
    to: [780, 420],
    labels: [{ at: [792, 374], lines: ['draws each card'] }],
  },
];

const COLOURS = {
  background: '#ffffff',
  box: { fill: '#f3f6fb', stroke: '#4a6fa5' },
  game: { fill: '#fff6e5', stroke: '#c48a1a' },
  seam: { fill: '#eef8ee', stroke: '#3f8f4f' },
  text: '#1d2733',
  muted: '#4b5866',
  arrow: '#5b6673',
};

const SANS = 'Helvetica, Arial, sans-serif';
const MONO = 'SFMono-Regular, Menlo, Consolas, monospace';
const LINE = 17;

const escape = (text) =>
  text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

function text(x, y, content, { size = 13, mono = false, anchor = 'start', weight, fill }) {
  const attrs = [
    `x="${x}"`,
    `y="${y}"`,
    `font-family="${mono ? MONO : SANS}"`,
    `font-size="${size}"`,
    `fill="${fill ?? COLOURS.text}"`,
    anchor === 'start' ? '' : `text-anchor="${anchor}"`,
    weight ? `font-weight="${weight}"` : '',
  ].filter(Boolean);
  return `<text ${attrs.join(' ')}>${escape(content)}</text>`;
}

function box({ x, y, w, h, title, lines, code, tone }) {
  const { fill, stroke } = COLOURS[tone ?? 'box'];
  const cx = x + w / 2;
  return [
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="10" fill="${fill}" stroke="${stroke}" stroke-width="2"/>`,
    text(cx, y + 30, title, { size: 17, mono: code, anchor: 'middle', weight: 'bold' }),
    ...lines.map((line, i) =>
      text(cx, y + 54 + i * LINE, line, { anchor: 'middle', fill: COLOURS.muted }),
    ),
  ].join('\n');
}

function arrow({ from, to, labels }) {
  return [
    `<line x1="${from[0]}" y1="${from[1]}" x2="${to[0]}" y2="${to[1]}" stroke="${COLOURS.arrow}" stroke-width="2" marker-end="url(#head)"/>`,
    ...labels.flatMap(({ at: [x, y], lines, anchor = 'start', code }) =>
      lines.map((line, i) => text(x, y + i * LINE, line, { size: 12, mono: code, anchor })),
    ),
  ].join('\n');
}

export function architectureSvg() {
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">`,
    '<!-- Generated by architecture.mjs from its data; edit that and rerun, not this file. -->',
    '<defs>',
    `<marker id="head" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="${COLOURS.arrow}"/></marker>`,
    '</defs>',
    `<rect width="${WIDTH}" height="${HEIGHT}" fill="${COLOURS.background}"/>`,
    ...Object.values(BOXES).map(box),
    ...ARROWS.map(arrow),
    '</svg>',
    '',
  ].join('\n');
}

const target = fileURLToPath(new URL('./architecture.svg', import.meta.url));
if (process.argv.includes('--check')) {
  if (readFileSync(target, 'utf8') !== architectureSvg()) {
    console.error(
      'docs/architecture.svg is out of date: run node projects/card-table/docs/architecture.mjs',
    );
    process.exit(1);
  }
} else {
  writeFileSync(target, architectureSvg());
}
