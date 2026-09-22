/**
 * The "How to use" tab.
 *
 * A Detronics app needs no support: a stranger should open it, work out what
 * it is, and reach a real answer without anyone to ask. This tab is where that
 * promise is kept.
 *
 * Everything below is data - arrays of plain objects a non-programmer can
 * extend - so the guide grows with the app without anyone touching layout.
 */

import { el, clear } from '../dom.js';
import { getState, setState } from '../../state.js';
import { openWelcome } from '../modals.js';

/* ------------------------------------------------------------- searching */

/**
 * The client-wording to app-wording translator.
 *
 * A newcomer searches for what they would call the thing ("what colour is",
 * "how bright"), not what the screen says ("band", "forward current"). Each
 * app term carries the everyday phrases that mean it; maintain this as the
 * vocabulary grows and nobody has to learn the internal word to find the page.
 */
export const SEARCH_ALIASES = {
  band: ['colour code', 'color code', 'stripes', 'rings', 'what colour is', 'read a resistor'],
  smd: ['tiny resistor', 'surface mount', 'chip resistor', 'numbers on it', 'printed code'],
  led: ['light', 'lamp', 'how bright', 'burnt out', 'too dim', 'diode'],
  resistor: ['what size', 'which one', 'what value', 'ohms'],
  battery: ['how long', 'last', 'lasts', 'runtime', 'run time', 'cells', 'aa', 'aaa', '18650',
    'power it', 'flat', 'charge'],
  'e-series': ['standard value', 'can i buy', 'preferred value', 'e24', 'e12', 'real value'],
  parallel: ['side by side', 'two at once', 'split'],
  series: ['in a row', 'one after another', 'chain', 'string'],
  tolerance: ['how accurate', 'how close', 'margin', 'percent', 'accuracy'],
  power: ['watts', 'how hot', 'getting hot', 'burning', 'rating'],
  export: ['save a picture', 'png', 'svg', 'print', 'share', 'send it'],
  bench: ['my list', 'saved parts', 'shopping list', 'keep it'],
};

/** Fold an item's everyday phrases in, so it matches the words actually typed. */
export function searchText(text) {
  const low = String(text || '').toLowerCase();
  let extra = '';
  for (const [term, syns] of Object.entries(SEARCH_ALIASES)) {
    if (low.includes(term)) extra += ` ${syns.join(' ')}`;
  }
  return `${text}${extra}`;
}

/**
 * Filler a person types without meaning to narrow anything.
 *
 * Matching is AND - "led battery" must match both, or searching would widen
 * instead of narrow. But a real question is "how long will a battery last",
 * and requiring "will" and "a" to appear verbatim finds nothing. Dropping the
 * filler keeps AND honest over the words that actually carry meaning.
 */
const STOP_WORDS = new Set([
  'a', 'an', 'the', 'is', 'are', 'was', 'be', 'do', 'does', 'did', 'i', 'my', 'me', 'it', 'its',
  'to', 'for', 'of', 'in', 'on', 'at', 'and', 'or', 'but', 'if', 'so', 'that', 'this', 'with',
  'can', 'could', 'will', 'would', 'should', 'have', 'has', 'get', 'got', 'there', 'then',
]);

/** Every meaningful word must appear: "led battery" narrows, it does not widen. */
export function guideMatches(text, query) {
  if (!query) return true;
  const words = query.toLowerCase().split(/\s+/).filter(Boolean).filter((w) => !STOP_WORDS.has(w));
  if (!words.length) return true;          // nothing but filler - show everything
  const hay = searchText(text).toLowerCase();
  return words.every((w) => hay.includes(w));
}

/* ---------------------------------------------------------------- content */

/** Step-by-step answers to "how do I…". */
export const HOWTOS = [
  {
    id: 'read-bands',
    title: 'Read the colour bands on a resistor I am holding',
    tool: 'colour',
    steps: [
      'Open the Colour Code tab.',
      'Count the bands. Most are 4; precision parts have 5 or 6.',
      'Pick that number under Band count.',
      'Hold the resistor with the gold or silver band on the right, then click each band on the '
        + 'picture and choose the colour you see.',
      'The value appears underneath, with the range it is allowed to be.',
    ],
  },
  {
    id: 'value-to-bands',
    title: 'Find out what colours a value should have',
    tool: 'colour',
    steps: [
      'Open the Colour Code tab.',
      'Type the value into Resistance — 4700, 4.7k and 4k7 all work.',
      'Press Apply to bands.',
      'The picture redraws with the bands that resistor would carry.',
    ],
  },
  {
    id: 'smd',
    title: 'Read the tiny numbers on a surface-mount resistor',
    tool: 'smd',
    steps: [
      'Open the SMD Code tab.',
      'Type the code printed on the chip into Printed marking.',
      'The app works out which marking system it is; if it guesses wrong, pick the system '
        + 'yourself under Marking system.',
      'An R stands for a decimal point: 4R7 means 4.7 ohms.',
    ],
  },
  {
    id: 'led-resistor',
    title: 'Work out the resistor an LED needs',
    tool: 'led',
    steps: [
      'Open the LED Resistor tab.',
      'Choose One LED, In series or In parallel.',
      'Pick the LED colour — that fills in a typical forward voltage you can overwrite from a '
        + 'datasheet.',
      'Set the supply voltage and the current you want (20 mA is the usual starting point).',
      'The answer is the resistor to buy, with the power rating it needs.',
    ],
  },
  {
    id: 'battery-life',
    title: 'See how long a battery will run my LEDs',
    tool: 'led',
    steps: [
      'Open the LED Resistor tab and set up your LEDs first.',
      'Under Supply, choose Cells to build a pack, or Pack product for a ready-made one.',
      'Pick the cell type and how many in series and in parallel.',
      'Runtime appears in the results as a range — batteries are not precise, and the range is '
        + 'the honest answer.',
    ],
  },
  {
    id: 'combine',
    title: 'Make a value I cannot buy, from two I can',
    tool: 'combine',
    steps: [
      'Open the Combinations tab.',
      'Type the value you wish existed into Target.',
      'The solver lists the closest pairs you can actually buy, in series and in parallel, with '
        + 'how far off each one is.',
      'Click a pair to load it into the network above.',
    ],
  },
  {
    id: 'export',
    title: 'Save a picture, share a link, or print labels',
    tool: 'colour',
    steps: [
      'Set up whatever you want to keep.',
      'Open Export in the sidebar.',
      'PNG and SVG download the drawing; Link copies a web address that reopens this exact '
        + 'calculation.',
      'For labels, add parts to the Bench list first, then use Print labels.',
    ],
  },
];

/** Short answers to "why does it…" and "can I…". */
export const FAQS = [
  {
    id: 'why-not-exact',
    q: 'Why does it keep changing my value to something else?',
    a: 'Resistors are only made in certain values, called the E-series. If you ask for 4630 ohms '
      + 'the app tells you the nearest one you can actually buy. Which series it checks against '
      + 'is under Preferences in Advanced.',
  },
  {
    id: 'modes',
    q: 'What are Simple, Advanced and Expert?',
    a: 'How much of the app you want to see. Simple keeps it to the question and the answer. '
      + 'Advanced adds tolerance, preferred values, the bench list and battery packs. Expert adds '
      + 'a panel under every tool explaining the formula, worked through with your own numbers.',
  },
  {
    id: 'is-it-saved',
    q: 'Is my work saved if I close the tab?',
    a: 'Yes. Everything stays in this browser on this device. Nothing is ever uploaded. To move '
      + 'it somewhere else use Save project, which downloads a file you can open on another '
      + 'machine with Load project.',
  },
  {
    id: 'share',
    q: 'Can I send someone what I am looking at?',
    a: 'Use Link under Export. The whole calculation is packed into the web address itself, so '
      + 'opening it anywhere reproduces exactly this screen. Nothing is stored on a server.',
  },
  {
    id: 'vf-trust',
    q: 'Can I trust the LED forward voltages?',
    a: 'They are typical figures for ordinary indicator LEDs, good enough to get started. Real '
      + 'parts vary. Every one is editable, and if you have a datasheet you should use its number '
      + 'instead.',
  },
  {
    id: 'power',
    q: 'Why does it tell me about watts?',
    a: 'A resistor turns the voltage it absorbs into heat. Fit one rated too low and it scorches. '
      + 'The app suggests a rating two to ten times what it calculated, which is the usual advice.',
  },
  {
    id: 'parallel-leds',
    q: 'Why does it warn me about one resistor for several LEDs?',
    a: 'LEDs in parallel do not share current evenly. Whichever one needs the least voltage takes '
      + 'most of the current, runs hottest and dies first, while the others stay dim. Give each '
      + 'LED its own resistor.',
  },
  {
    id: 'offline',
    q: 'Does it work without internet?',
    a: 'Once the page has loaded, yes. There is no server behind it — every calculation happens '
      + 'in your browser.',
  },
];

/* -------------------------------------------------------------- rendering */

/** Live only while this tab is open; a search is not worth persisting. */
let query = '';

const stepList = (steps) => el('ol', { class: 'guide__steps' },
  steps.map((t) => el('li', { text: t })));

function howtoCard(item, rerender) {
  return el('article', { class: 'guide__card' }, [
    el('h3', { class: 'guide__cardTitle', text: item.title }),
    stepList(item.steps),
    item.tool ? el('button', {
      class: 'btn btn--small',
      type: 'button',
      text: 'Take me there',
      on: { click: () => { setState({ tool: item.tool }); } },
    }) : null,
  ].filter(Boolean));
}

const faqCard = (item) => el('article', { class: 'guide__card guide__card--faq' }, [
  el('h3', { class: 'guide__cardTitle', text: item.q }),
  el('p', { class: 'guide__answer', text: item.a }),
]);

function stage(state, rerender) {
  const howtos = HOWTOS.filter((h) => guideMatches(`${h.title} ${h.steps.join(' ')} ${h.tool}`, query));
  const faqs = FAQS.filter((f) => guideMatches(`${f.q} ${f.a}`, query));
  const nothing = !howtos.length && !faqs.length;

  const search = el('input', {
    id: 'guide-search',
    class: 'input guide__search',
    type: 'search',
    placeholder: 'Search in your own words — "how long will a battery last", "what colour is 4k7"',
    'aria-label': 'Search the guide',
    value: query,
    on: {
      input: (e) => {
        query = e.target.value;
        rerender({ keepFocus: 'guide-search', caret: e.target.selectionStart });
      },
    },
  });

  return el('div', { class: 'guide' }, [
    el('p', { class: 'guide__intro' }, [
      'Four calculators for the electronics bench. Everything runs in your browser and nothing '
      + 'is uploaded. Search below in whatever words come to mind — it understands the everyday '
      + 'ones, not just the technical ones.',
    ]),
    search,

    nothing ? el('p', { class: 'guide__empty' }, [
      `Nothing matches "${query}". `,
      el('button', {
        class: 'btn btn--small',
        type: 'button',
        text: 'Clear the search',
        on: { click: () => { query = ''; rerender(); } },
      }),
    ]) : null,

    howtos.length ? el('section', {}, [
      el('h2', { class: 'guide__heading', text: 'How do I…' }),
      el('div', { class: 'guide__grid' }, howtos.map((h) => howtoCard(h, rerender))),
    ]) : null,

    faqs.length ? el('section', {}, [
      el('h2', { class: 'guide__heading', text: 'Questions' }),
      el('div', { class: 'guide__grid' }, faqs.map(faqCard)),
    ]) : null,

    el('section', { class: 'guide__footer' }, [
      el('button', {
        class: 'btn',
        type: 'button',
        text: 'Show me around again',
        on: { click: () => openWelcome() },
      }),
      el('span', {
        class: 'muted',
        text: 'Switch to Expert above to see the formula behind every number.',
      }),
    ]),
  ].filter(Boolean));
}

export const guideTool = {
  id: 'guide',
  label: 'How to use',
  shortLabel: 'Help',
  /** No readout, no warnings, no teaching panel - the page is all of those. */
  chrome: false,
  stage,
  readout: () => ({ value: '', facts: [] }),
  warnings: () => [],
  sections: () => [],
  benchItem: () => null,
  exportName: () => 'guide',
};
