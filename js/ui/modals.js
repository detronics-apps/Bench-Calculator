/** The welcome, changelog, licence and imprint dialogs. */

import { el, clear } from './dom.js';
import { markWelcomeSeen } from '../state.js';

export const APP_VERSION = '1.5.1';

let root = null;
let lastFocused = null;

export function mountModals(container) {
  root = container;
}

export function closeModal() {
  if (!root) return;
  clear(root);
  root.hidden = true;
  document.removeEventListener('keydown', onKeydown);
  if (lastFocused && document.contains(lastFocused)) lastFocused.focus();
}

function onKeydown(e) {
  if (e.key === 'Escape') { e.preventDefault(); closeModal(); }
}

/**
 * @param {object} spec
 * @param {string} spec.title
 * @param {Node[]} spec.body
 * @param {Node[]} [spec.footer]
 */
export function openModal({ title, body, footer = [] }) {
  if (!root) return;
  lastFocused = document.activeElement;
  clear(root);
  root.hidden = false;

  const dialog = el('div', {
    class: 'modal',
    role: 'dialog',
    'aria-modal': 'true',
    'aria-label': title,
  }, [
    el('div', { class: 'modal__head' }, [
      el('h2', { class: 'modal__title', text: title }),
      el('button', {
        class: 'btn btn--ghost btn--icon modal__close',
        type: 'button',
        'aria-label': 'Close',
        text: '×',
        on: { click: closeModal },
      }),
    ]),
    el('div', { class: 'modal__body' }, body),
    footer.length ? el('div', { class: 'modal__foot' }, footer) : null,
  ]);

  root.appendChild(el('div', {
    class: 'modal-backdrop',
    on: { click: (e) => { if (e.target === e.currentTarget) closeModal(); } },
  }, [dialog]));

  document.addEventListener('keydown', onKeydown);
  dialog.querySelector('.modal__close').focus();
}

/* ------------------------------------------------------------ changelog */

const CHANGELOG = [
  {
    version: '1.5.1',
    date: '2026-09-25',
    items: [
      'The coffee and theme buttons now match the rest of the Detronics apps, and the '
        + 'coffee cup is drawn rather than an emoji so it follows the theme colour.',
      'The theme cycle reads auto, light and dark.',
    ],
  },
  {
    version: '1.5.0',
    date: '2026-09-22',
    items: [
      'A "How to use" tab: search the guide in your own words, step-by-step how-tos and '
        + 'answers to the common questions.',
      'Simple, Advanced and Expert. Simple keeps it to the question and the answer; Advanced '
        + 'adds tolerance, preferred values, the bench list and battery packs; Expert adds the '
        + 'formula behind every number.',
      'The logo now links to detronics.co.za, and there is a coffee button if you would like '
        + 'to support the work.',
      'The quick start no longer carries the release notes - those live under What’s new - '
        + 'and it now opens the full guide instead.',
      'Battery specifications are one panel rather than a column of things that looked '
        + 'clickable.',
    ],
  },
  {
    version: '1.4.1',
    date: '2026-08-27',
    items: [
      'Diagrams are no longer magnified to fill the panel on wide screens. A '
        + 'one-component network was being blown up several times over; every drawing now '
        + 'appears at the same scale whatever it contains.',
      'Fixed the tool tabs and the diagram being squashed flat in a short browser window. '
        + 'The panel scrolls instead.',
    ],
  },
  {
    version: '1.4.0',
    date: '2026-08-27',
    items: [
      'Renamed to Electronics Bench, since more bench tools are coming.',
      'Every tool now has a "How this works" panel underneath it: the concepts in plain '
        + 'language, the formulas, and the same formulas worked through with whatever '
        + 'numbers are on your screen.',
      'Fixed info tooltips being clipped behind the main panel.',
      'Fixed the header buttons sitting on top of the logo on phones.',
      'Circuit diagrams size themselves to the circuit instead of a fixed width, and the '
        + 'supply label no longer runs off the left edge when exported.',
    ],
  },
  {
    version: '1.3.0',
    date: '2026-08-26',
    items: [
      'Renamed to Bench Calculator - it stopped being only about resistors several '
        + 'releases ago.',
      'Added the LG INR18650-HG2 as a cell in its own right, at its specified 3.60 V '
        + 'nominal rather than the generic 3.7 V.',
      'Added two complete pack products: the MagBot 2S PowerPack, and the MagBot 1S '
        + 'PowerHub with its raw, 5 V and 3.3 V outputs.',
      'Runtime on a regulated rail is now a single figure worked out in watt-hours, '
        + 'because a regulator holds its current instead of tapering as the cell sags.',
    ],
  },
  {
    version: '1.2.0',
    date: '2026-08-26',
    items: [
      'Every LED is now editable on its own. In a parallel group, LEDs with different '
        + 'forward voltages each get a resistor sized for that LED rather than one value shared.',
      'Forward current moved from Supply to the LED section, where it belongs.',
      'The supply can now be a battery pack - AA, AAA, 9 V, 18650, NiMH, LiPo and coin cells - '
        + 'built up in series and parallel, with an expected runtime and a warning when the '
        + 'circuit draws more than the cells can deliver.',
      'Inductors joined resistors and capacitors in the Combinations tool.',
    ],
  },
  {
    version: '1.0.0',
    date: '2026-08-26',
    items: [
      'Colour-code tool for 3, 4, 5 and 6-band resistors, editable from either the picture or the value box.',
      'SMD marking tool covering 3-digit, 4-digit and EIA-96 codes.',
      'LED series-resistor tool for one LED, a series string, or a parallel group wired either way.',
      'Resistor and capacitor combination tool, with a solver that searches E-series pairs for a target value.',
      'Export as PNG or SVG, share by link, and print a label sheet from the bench list.',
    ],
  },
];

const changelogNodes = () => CHANGELOG.flatMap((release) => [
  el('h3', { text: `${release.version} — ${release.date}` }),
  el('ul', {}, release.items.map((t) => el('li', { text: t }))),
]);

/* --------------------------------------------------------------- welcome */

export function openWelcome({ firstVisit = false } = {}) {
  const dontShow = el('input', { type: 'checkbox', id: 'welcome-dismiss', checked: firstVisit });

  openModal({
    title: 'Detronics Electronics Bench',
    body: [
      el('p', {
        text: 'Four calculators for the electronics bench, all running locally in your browser. '
          + 'Nothing you type is uploaded anywhere.',
      }),
      el('h3', { text: 'Quick start' }),
      el('ol', {}, [
        el('li', {
          html: 'Pick a tool with the buttons above the picture: <b>Colour Code</b>, '
            + '<b>SMD Code</b>, <b>LED Resistor</b> or <b>Combinations</b>.',
        }),
        el('li', {
          html: 'Work from either end. Click a band on the resistor to change it, or type a '
            + 'resistance in <b>Value entry</b> and press <b>Apply to bands</b> — both edit the same resistor.',
        }),
        el('li', {
          html: 'Watch the banners under the picture. They appear the moment a value crosses '
            + 'something worth knowing about — a non-standard value, too little headroom, a resistor '
            + 'running past a quarter watt.',
        }),
        el('li', {
          html: 'Save anything useful to the <b>Bench list</b>, then export it as a PNG, an SVG, '
            + 'a shareable link, or a printed label sheet.',
        }),
      ]),
      el('p', { class: 'muted' }, [
        'Set how much detail you want with ',
        el('b', { text: 'Simple / Advanced / Expert' }),
        ' above the tabs. Expert adds the formula behind every number.',
      ]),
    ],
    footer: [
      el('label', { class: 'check', style: { marginBottom: '0' } }, [
        dontShow,
        el('span', { text: "Don't show this again" }),
      ]),
      el('button', {
        class: 'btn',
        type: 'button',
        text: 'Open the full guide',
        on: {
          click: () => {
            if (dontShow.checked) markWelcomeSeen(APP_VERSION);
            closeModal();
            document.dispatchEvent(new CustomEvent('goto:tool', { detail: 'guide' }));
          },
        },
      }),
      el('button', {
        class: 'btn btn--primary',
        type: 'button',
        text: 'Start calculating',
        on: {
          click: () => {
            if (dontShow.checked) markWelcomeSeen(APP_VERSION);
            closeModal();
          },
        },
      }),
    ],
  });
}

export function openChangelog() {
  openModal({
    title: "What's new",
    body: changelogNodes(),
    footer: [el('button', { class: 'btn btn--primary', type: 'button', text: 'Close', on: { click: closeModal } })],
  });
}

/* ------------------------------------------------------ licence, imprint */

export function openLicense() {
  openModal({
    title: 'Licence & terms',
    body: [
      el('h3', { text: 'Licence' }),
      el('p', {
        html: 'This tool is released under the MIT Licence. You may use, copy, modify and '
          + 'redistribute it, including commercially, provided the copyright notice and this '
          + 'permission notice travel with it. The full text is in the <code>LICENSE</code> '
          + 'file in the repository.',
      }),
      el('h3', { text: 'No warranty' }),
      el('p', {
        text: 'The software is provided "as is", without warranty of any kind. Everything here '
          + 'is a calculation aid, not engineering advice.',
      }),
      el('h3', { text: 'Check your work' }),
      el('p', {
        text: 'Forward voltages, tolerances and power ratings vary between parts. Every figure '
          + 'this tool offers as a typical value is a starting point; the datasheet for the part '
          + 'in your hand is the authority. Verify anything that matters before you build it, and '
          + 'never rely on a calculated figure alone where safety is involved.',
      }),
      el('h3', { text: 'Standards' }),
      el('p', {
        text: 'Colour bands follow IEC 60062. Preferred values follow IEC 60063 (the E-series). '
          + 'EIA-96 markings follow the EIA standard of that name. Where a manufacturer departs '
          + 'from these, the manufacturer wins.',
      }),
    ],
    footer: [el('button', { class: 'btn btn--primary', type: 'button', text: 'Close', on: { click: closeModal } })],
  });
}

export function openImprint() {
  openModal({
    title: 'Imprint & privacy',
    body: [
      el('h3', { text: 'What this page collects' }),
      el('p', {
        text: 'Nothing. There is no analytics, no tracking, no cookies, and no account. '
          + 'Every calculation runs in your browser, and no value you enter is ever transmitted.',
      }),
      el('h3', { text: 'What is stored on your device' }),
      el('p', {
        html: 'Your current settings and bench list are kept in this browser\'s '
          + '<code>localStorage</code> so the page opens where you left it. That data never '
          + 'leaves your device, is not readable by anyone else, and is cleared when you clear '
          + 'your browser\'s site data. Saving a project simply downloads a JSON file to your '
          + 'own computer.',
      }),
      el('h3', { text: 'Shareable links' }),
      el('p', {
        text: 'A share link encodes the current calculation into the part of the URL after the '
          + '#, which browsers never send to a server. Whoever you send the link to can see the '
          + 'values in it, so treat it like any other message.',
      }),
      el('h3', { text: 'Hosting' }),
      el('p', {
        text: 'This is a static site. It is served as plain files, with no application server '
          + 'and no database behind it. The host that serves those files will keep its own '
          + 'ordinary web server logs, which typically include your IP address and the time of '
          + 'your request — that is outside this page\'s control and is the only record your '
          + 'visit creates.',
      }),
      el('h3', { text: 'Third parties' }),
      el('p', {
        text: 'None. No fonts, scripts, stylesheets or images are loaded from anywhere else; '
          + 'the page makes no network requests at all once it has loaded.',
      }),
      el('h3', { text: 'Contact' }),
      el('p', { html: 'Detronics — <a href="mailto:shop.detronics@gmail.com">shop.detronics@gmail.com</a>' }),
    ],
    footer: [el('button', { class: 'btn btn--primary', type: 'button', text: 'Close', on: { click: closeModal } })],
  });
}
