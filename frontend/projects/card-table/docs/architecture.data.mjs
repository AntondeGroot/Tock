// What docs/architecture.svg shows: the library's public API as a UML class diagram. Drawn by
// architecture.mjs; change the picture here and rerun `npm run diagrams`.

// Each class: its top-left corner, stereotype, name (and an Angular selector, for components),
// then its attributes and operations — one member per line, as in UML.
export const CLASSES = {
  game: {
    x: 470,
    y: 40,
    stereotype: 'host',
    name: 'YourGameComponent',
  },
  table: {
    x: 40,
    y: 190,
    stereotype: 'class',
    name: 'CardTable',
    attributes: [
      '+ timing: Required<CardTableTiming>',
      '+ cards: Signal<CardVM[]>',
      '+ flyers: Signal<Flyer[]>',
      '+ pile: WritableSignal<CardFace[]>',
      '+ dealing: Signal<boolean>',
      '+ stacked: Signal<boolean>',
    ],
    operations: [
      '+ constructor(config: CardTableConfig)',
      '+ defineZone(zone: Zone): void',
      '+ place(card: CardFace, zoneId: string): void',
      '+ deal(cards: CardFace[], options?): void',
      '+ dealIn(uuids: number[]): void',
      '+ flyToPile(card, options?): void',
      '+ tradeSwap(partner: Pos, gave, got): void',
      '+ clearPile(): void',
      '+ positionOf(uuid: number): Pos | undefined',
      '+ nextPositionIn(zoneId: string): Pos',
    ],
  },
  layer: {
    x: 720,
    y: 190,
    stereotype: 'component',
    name: 'CardLayer',
    selector: '<ct-card-layer>',
    attributes: [
      '«input» table: CardTable',
      '«input» face: TemplateRef<FaceContext> | null',
      '«input» selectedUuid: number | null',
      '«input» isSpecial: (value: number) => boolean',
      '«output» cardClick: number',
      '«output» cardHover: number | null',
    ],
  },
  card: {
    x: 720,
    y: 470,
    stereotype: 'component',
    name: 'Card',
    selector: '<ct-card>',
    attributes: [
      '«input» suit: number',
      '«input» value: number',
      '«input» face: TemplateRef<FaceContext> | null',
    ],
  },
  config: {
    x: 40,
    y: 640,
    stereotype: 'interface',
    name: 'CardTableConfig',
    attributes: [
      '+ hand: Signal<CardFace[]> | (() => CardFace[])',
      '+ layout?: TableLayout',
      '+ timing?: CardTableTiming',
    ],
  },
  layout: {
    x: 40,
    y: 830,
    stereotype: 'interface',
    name: 'TableLayout',
    attributes: ['+ hand: ZoneLayout', '+ pile: ZoneLayout', '+ deck: ZoneLayout'],
  },
  zone: {
    x: 500,
    y: 640,
    stereotype: 'interface',
    name: 'Zone',
    attributes: ['+ id: string', '+ faceDown?: boolean', '+ layout: ZoneLayout'],
  },
  zoneLayout: {
    x: 500,
    y: 850,
    stereotype: 'type',
    name: 'ZoneLayout',
    attributes: ['(index: number, count: number) => Pos'],
  },
};

// A UML note: free text, pinned to a class by a dashed line.
export const NOTES = [
  {
    x: 820,
    y: 30,
    to: 'game',
    lines: [
      'Your rules, server state and board',
      'geometry live here — the library',
      'knows none of them.',
    ],
  },
];

// Each relation runs between two sides of two classes (`at` = how far along that side, 0 to 1):
//   dependency  - - - ->  uses or creates the other    association  ——>  holds a reference to it
//   composition ◆——>      owns the other's instances
// A `to` end `at: 'align'` sits level with the `from` end, so the line runs straight.
// Labels sit next to the line, at its `from` end, its `to` end or the `middle` of it.
export const RELATIONS = [
  {
    kind: 'dependency',
    from: ['game', 'bottom', 0.2],
    to: ['table', 'top', 0.5],
    labels: [{ text: '«creates, drives»', near: 'middle', dy: -8, anchor: 'middle' }],
  },
  {
    kind: 'dependency',
    from: ['game', 'bottom', 0.8],
    to: ['layer', 'top', 0.4],
    labels: [{ text: '«binds»', near: 'middle', dy: -8, anchor: 'middle' }],
  },
  {
    kind: 'association',
    from: ['layer', 'left', 0.25],
    to: ['table', 'right', 'align'],
    labels: [
      { text: 'table', near: 'to', dx: 10, dy: -8 },
      { text: '1', near: 'to', dx: 10, dy: 16 },
    ],
  },
  {
    kind: 'composition',
    from: ['layer', 'bottom', 0.4],
    to: ['card', 'top', 0.4],
    labels: [{ text: '*', near: 'to', dx: 8, dy: -10 }],
  },
  {
    kind: 'dependency',
    from: ['table', 'bottom', 0.5],
    to: ['config', 'top', 0.5],
    labels: [{ text: '«uses»', near: 'middle', dx: 8, dy: 4 }],
  },
  {
    kind: 'association',
    from: ['config', 'bottom', 0.5],
    to: ['layout', 'top', 0.5],
    labels: [
      { text: 'layout', near: 'to', dx: 8, dy: -22 },
      { text: '0..1', near: 'to', dx: 8, dy: -8 },
    ],
  },
  {
    kind: 'composition',
    from: ['table', 'right', 0.85],
    to: ['zone', 'top', 0.3],
    labels: [
      { text: 'zones', near: 'to', dx: 8, dy: -22 },
      { text: '*', near: 'to', dx: 8, dy: -8 },
    ],
  },
  {
    kind: 'association',
    from: ['zone', 'bottom', 0.3],
    to: ['zoneLayout', 'top', 'align'],
    labels: [{ text: 'layout  1', near: 'to', dx: 8, dy: -8 }],
  },
  {
    kind: 'association',
    from: ['layout', 'right', 0.5],
    to: ['zoneLayout', 'left', 'align'],
    labels: [{ text: 'hand, pile, deck  3', near: 'to', dx: -8, dy: -8, anchor: 'end' }],
  },
];
