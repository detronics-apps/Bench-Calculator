/**
 * Bootstraps the app: builds the chrome, routes between tools, and re-renders
 * whenever the state changes.
 */

import { el, clear, $, select, field, toast, download } from './ui/dom.js';
import { section } from './ui/sidebar.js';
import { renderBanners } from './ui/warnings.js';
import { renderExplainer } from './ui/explain.js';
import { benchSection, addToBench, buildPrintSheet } from './ui/bench.js';
import { exportPng, exportSvg, copyShareLink } from './ui/export.js';
import {
  mountModals, openWelcome, openChangelog, openLicense, openImprint, APP_VERSION,
} from './ui/modals.js';
import {
  initState, getState, setState, subscribe, toProject, loadProject, welcomeSeen,
} from './state.js';
import { SERIES_NAMES, SERIES_TOLERANCE } from './eseries.js';

import { colourTool } from './ui/tools/colour.js';
import { smdTool } from './ui/tools/smd.js';
import { ledTool } from './ui/tools/led.js';
import { combineTool } from './ui/tools/combine.js';

const TOOLS = [colourTool, smdTool, ledTool, combineTool];
const toolById = (id) => TOOLS.find((t) => t.id === id) || TOOLS[0];

const dom = {};
/** Focus to restore after a re-render, for controls that redraw as you type. */
let pendingFocus = null;

/* ---------------------------------------------------------------- theme */

function applyTheme(theme) {
  const root = document.documentElement;
  if (theme === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', theme);
}

function cycleTheme() {
  const order = ['system', 'light', 'dark'];
  const next = order[(order.indexOf(getState().theme) + 1) % order.length];
  setState({ theme: next });
  applyTheme(next);
}

const THEME_LABEL = { system: 'Theme: system', light: 'Theme: light', dark: 'Theme: dark' };
const THEME_ICON = { system: '◐', light: '☀', dark: '☾' };

/* ---------------------------------------------------------------- header */

/** A button whose label shortens on narrow screens. */
const dualLabel = (long, short) => [
  el('span', { class: 'btn-label btn-label--long', text: long }),
  el('span', { class: 'btn-label btn-label--short', text: short }),
];

function buildHeader() {
  const themeBtn = el('button', {
    class: 'btn btn--ghost btn--icon',
    type: 'button',
    id: 'theme-toggle',
    on: { click: () => { cycleTheme(); syncTheme(); } },
  });

  const fileInput = el('input', {
    type: 'file',
    accept: 'application/json,.json',
    hidden: true,
    on: {
      change: (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        file.text().then((text) => {
          const result = loadProject(text);
          toast(result.ok ? `Loaded ${file.name}` : result.error);
          if (result.ok) { applyTheme(getState().theme); render(); }
        });
        e.target.value = '';
      },
    },
  });

  return el('header', { class: 'app-header' }, [
    el('div', { class: 'brand' }, [
      el('img', { class: 'brand__logo', src: 'assets/logo.png', alt: 'Detronics' }),
      el('span', { class: 'brand__sep', 'aria-hidden': 'true' }),
      el('span', { class: 'brand__tool', text: 'Electronics Bench' }),
    ]),
    el('div', { class: 'header-actions' }, [
      el('button', {
        class: 'btn',
        type: 'button',
        title: 'Download everything - settings and bench list - as a JSON file',
        on: {
          click: () => {
            download(new Blob([toProject()], { type: 'application/json' }),
              `detronics-resistors-${new Date().toISOString().slice(0, 10)}.json`);
            toast('Project saved to your downloads');
          },
        },
      }, dualLabel('Save project', 'Save')),
      el('button', {
        class: 'btn',
        type: 'button',
        title: 'Open a project file you saved earlier',
        on: { click: () => fileInput.click() },
      }, dualLabel('Load project', 'Load')),
      fileInput,
      themeBtn,
      el('a', {
        class: 'btn btn--ghost',
        href: 'https://github.com/detronics-apps/Bench-Calculator',
        target: '_blank',
        rel: 'noopener noreferrer',
        title: 'Source code on GitHub',
      }, dualLabel('Source', 'Code')),
    ]),
  ]);
}

function syncTheme() {
  const { theme } = getState();
  const btn = $('#theme-toggle');
  if (!btn) return;
  btn.textContent = THEME_ICON[theme];
  btn.title = THEME_LABEL[theme];
  btn.setAttribute('aria-label', THEME_LABEL[theme]);
}

/* -------------------------------------------------------------- viewport */

function buildViewport() {
  dom.tabs = el('div', { class: 'segmented', role: 'tablist', 'aria-label': 'Calculator' });
  dom.stage = el('div', { class: 'viewport__stage', id: 'stage' });
  dom.readout = el('div', { class: 'readout', id: 'readout' });
  dom.banners = el('div', { class: 'banners', id: 'banners' });
  dom.explain = el('div', { class: 'explain-host', id: 'explain' });

  for (const tool of TOOLS) {
    dom.tabs.appendChild(el('button', {
      class: 'segmented__btn',
      type: 'button',
      role: 'tab',
      dataset: { tool: tool.id },
      title: tool.label,
      on: { click: () => setState({ tool: tool.id }) },
    }, [
      el('span', { class: 'tab-label tab-label--long', text: tool.label }),
      el('span', { class: 'tab-label tab-label--short', text: tool.shortLabel || tool.label }),
    ]));
  }

  return el('section', { class: 'viewport' }, [dom.tabs, dom.stage, dom.readout, dom.banners, dom.explain]);
}

function renderReadout(spec, tool, state) {
  clear(dom.readout);
  dom.readout.appendChild(el('div', {
    class: `readout__value${spec.error ? ' readout__value--error' : ''}`,
    text: spec.value,
  }));
  if (spec.facts?.length) {
    dom.readout.appendChild(el('div', { class: 'readout__facts' },
      spec.facts.map((f) => el('span', { class: 'readout__fact' }, [
        `${f.label}: `, el('b', { text: f.value }),
      ]))));
  }
  dom.readout.appendChild(el('div', { class: 'readout__cta' }, [
    el('button', {
      class: 'btn',
      type: 'button',
      text: 'Add to bench',
      disabled: !tool.benchItem(state),
      on: { click: () => { addToBench(tool.benchItem(getState())); render(); } },
    }),
  ]));
}

/* --------------------------------------------------------------- sidebar */

function preferencesSection(state, rerender) {
  return section({
    id: 'prefs',
    title: 'Preferences',
    summary: state.prefs.eSeries,
    info: 'The E-series decides which values count as "standard" throughout the app: which '
      + 'resistances raise a warning, what the LED tool snaps to, and what the target solver searches.',
    defaultOpen: false,
    children: [
      field(
        'Preferred value series',
        select(
          SERIES_NAMES.map((n) => ({ value: n, label: `${n} (±${SERIES_TOLERANCE[n]}% parts)` })),
          state.prefs.eSeries,
          (v) => { setState({ prefs: { eSeries: v } }); rerender(); },
        ),
        { hint: 'E24 is the usual hobby stock. E96 for 1% precision parts.' },
      ),
    ],
  });
}

function exportSection(state, tool) {
  const name = tool.exportName(state);
  const hasBench = state.bench.length > 0;

  return section({
    id: 'export',
    title: 'Export',
    summary: name,
    info: 'Everything is generated in your browser and saved straight to your computer. '
      + 'Nothing is uploaded.',
    children: [
      el('div', { class: 'row', style: { marginBottom: '8px' } }, [
        el('button', {
          class: 'btn',
          type: 'button',
          text: 'PNG',
          title: 'Download the picture as a 3x PNG',
          on: { click: () => exportPng(dom.stage.querySelector('svg'), name) },
        }),
        el('button', {
          class: 'btn',
          type: 'button',
          text: 'SVG',
          title: 'Download the picture as a scalable vector file',
          on: { click: () => exportSvg(dom.stage.querySelector('svg'), name) },
        }),
        el('button', {
          class: 'btn',
          type: 'button',
          text: 'Link',
          title: 'Copy a link that reproduces exactly this calculation',
          on: { click: copyShareLink },
        }),
      ]),
      el('button', {
        class: 'btn',
        type: 'button',
        style: { width: '100%' },
        text: hasBench
          ? `Print ${state.bench.length} label${state.bench.length === 1 ? '' : 's'}`
          : 'Print labels (bench list empty)',
        disabled: !hasBench,
        on: {
          click: () => {
            buildPrintSheet($('#print-sheet'));
            window.print();
          },
        },
      }),
      el('div', {
        class: 'field__hint',
        style: { marginTop: '8px' },
        text: 'The label sheet prints whatever is on the bench list.',
      }),
    ],
    cta: {
      label: 'Copy shareable link',
      onClick: copyShareLink,
    },
  });
}

function renderSidebar(tool, state) {
  clear(dom.sidebar);
  const scroll = el('div', { class: 'sidebar__scroll' });

  for (const node of tool.sections(state, render)) scroll.appendChild(node);
  scroll.appendChild(preferencesSection(state, render));
  scroll.appendChild(benchSection(state, render, () => {
    addToBench(tool.benchItem(getState()));
    render();
  }));
  scroll.appendChild(exportSection(state, tool));

  dom.sidebar.appendChild(scroll);
}

/* ---------------------------------------------------------------- footer */

function buildFooter() {
  return el('footer', { class: 'app-footer' }, [
    el('span', { text: 'All processing runs locally in your browser — nothing is uploaded.' }),
    el('nav', {}, [
      el('button', { class: 'btn btn--ghost btn--small', type: 'button', text: "What's new", on: { click: openChangelog } }),
      el('button', { class: 'btn btn--ghost btn--small', type: 'button', text: 'Licence & terms', on: { click: openLicense } }),
      el('button', { class: 'btn btn--ghost btn--small', type: 'button', text: 'Imprint & privacy', on: { click: openImprint } }),
      el('button', { class: 'btn btn--ghost btn--small', type: 'button', text: 'Quick start', on: { click: () => openWelcome() } }),
      el('span', { class: 'muted', text: `v${APP_VERSION}` }),
    ]),
  ]);
}

/**
 * Cap every diagram at its natural size.
 *
 * The canvases size themselves to their contents, so a one-component network
 * produces a small one. Left to fill the panel it would be magnified several
 * times over and look absurd next to a six-branch circuit. Pinning the maximum
 * width to the viewBox keeps one drawing unit at one pixel, so everything is
 * drawn at the same scale; narrower panels still shrink it to fit.
 */
function capDiagramScale(host) {
  for (const node of host.querySelectorAll('svg[viewBox]')) {
    const width = Number(node.getAttribute('viewBox').split(/\s+/)[2]);
    if (Number.isFinite(width) && width > 0) node.style.maxWidth = `${Math.round(width)}px`;
  }
}

/* ----------------------------------------------------------------- render */

export function render(opts = {}) {
  if (opts.keepFocus) pendingFocus = opts;

  const state = getState();
  const tool = toolById(state.tool);

  for (const btn of dom.tabs.children) {
    btn.setAttribute('aria-selected', String(btn.dataset.tool === tool.id));
  }

  clear(dom.stage).appendChild(tool.stage(state, render));
  capDiagramScale(dom.stage);
  renderReadout(tool.readout(state), tool, state);
  renderBanners(dom.banners, tool.warnings(state, render));
  renderExplainer(dom.explain, state);
  renderSidebar(tool, state);
  syncTheme();

  if (pendingFocus?.keepFocus) {
    const node = document.getElementById(pendingFocus.keepFocus);
    if (node) {
      node.focus();
      if (typeof pendingFocus.caret === 'number' && node.setSelectionRange) {
        try {
          node.setSelectionRange(pendingFocus.caret, pendingFocus.caret);
        } catch {
          // Number inputs refuse selection ranges; focus alone is enough.
        }
      }
    }
    pendingFocus = null;
  }
}

/* ------------------------------------------------------------------ boot */

function boot() {
  initState();
  applyTheme(getState().theme);

  dom.sidebar = el('aside', { class: 'sidebar', id: 'sidebar', 'aria-label': 'Controls' });

  const modalRoot = el('div', { class: 'modal-root', id: 'modals', hidden: true });
  const printSheet = el('div', { class: 'print-sheet', id: 'print-sheet' });

  document.body.append(
    buildHeader(),
    el('main', { class: 'app-main' }, [buildViewport(), dom.sidebar]),
    buildFooter(),
    modalRoot,
    printSheet,
  );

  mountModals(modalRoot);
  subscribe(() => render());
  render();

  // The LED tool's result CTA asks for a bench add without importing main.
  document.addEventListener('bench:add', () => {
    const tool = toolById(getState().tool);
    addToBench(tool.benchItem(getState()));
    render();
  });

  if (!welcomeSeen(APP_VERSION)) openWelcome({ firstVisit: true });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
