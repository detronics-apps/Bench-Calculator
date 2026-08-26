/**
 * The single canonical application state, with subscription, localStorage
 * persistence and URL-hash sharing.
 *
 * Everything the UI shows is derived from this object. The colour-code tool is
 * not two modes: clicking a band and typing a value both write `colour.bands`,
 * which is why the two views can never drift apart.
 */

const STORAGE_KEY = 'detronics.resistor-calculator.v1';
const WELCOME_KEY = 'detronics.resistor-calculator.welcome';

export const TOOLS = ['colour', 'smd', 'led', 'combine'];

/** Tool state a link may carry. Only the active tool's slice is actually encoded. */
const SHAREABLE = ['tool', 'colour', 'smd', 'led', 'combine', 'prefs'];

export function defaultState() {
  return {
    tool: 'colour',
    theme: 'system',

    prefs: {
      eSeries: 'E24',
      sigFigs: 3,
    },

    colour: {
      bandCount: 4,
      bands: ['yellow', 'violet', 'red', 'gold'],
    },

    smd: {
      type: 'd3',
      code: '473',
    },

    led: {
      topology: 'single',
      wiring: 'per-led',
      ifMa: 20,
      // One entry per LED. Length is the LED count - there is no separate
      // counter to fall out of step with the list.
      leds: [{ colorId: 'red', vf: 2.0 }],
      // When true the first LED's colour and Vf apply to all of them, which is
      // the common case and keeps the panel from becoming a wall of fields.
      matched: true,
      supplyMode: 'custom',
      supplyV: 5,
      battery: { cellId: 'aa-alkaline', series: 3, parallel: 1, capacityMah: null },
      product: { productId: 'magbot-2s-powerpack', outputId: 'raw', capacityMah: null },
    },

    combine: {
      kind: 'resistor',
      mode: 'series',
      components: [
        { value: 1000, tolerancePct: 5 },
        { value: 2200, tolerancePct: 5 },
      ],
      target: 3141,
    },

    bench: [],

    openSections: {},
  };
}

let state = defaultState();
const listeners = new Set();

/** @returns {object} the live state - treat it as read-only */
export const getState = () => state;

/**
 * Subscribe to state changes.
 * @param {(state:object, patchKeys:string[]) => void} fn
 * @returns {() => void} unsubscribe
 */
export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function notify(keys) {
  for (const fn of listeners) fn(state, keys);
}

/**
 * Merge a patch into the state, one level deep, and notify subscribers.
 * @param {object} patch
 * @param {{silent?:boolean}} [opts]
 */
export function setState(patch, opts = {}) {
  const keys = Object.keys(patch);
  for (const key of keys) {
    const next = patch[key];
    const isPlainObject = next && typeof next === 'object' && !Array.isArray(next);
    state[key] = isPlainObject ? { ...state[key], ...next } : next;
  }
  if (!opts.silent) {
    persist();
    notify(keys);
  }
}

/* -------------------------------------------------------------- storage */

/**
 * Bring an older saved LED slice up to the current shape. Sessions saved
 * before LEDs became individually editable carry `vf`, `colorId` and `count`
 * instead of a `leds` array.
 */
function migrateLed(led) {
  if (!led || typeof led !== 'object') return led;
  if (Array.isArray(led.leds) && led.leds.length) {
    return led.supplyMode === 'battery' ? { ...led, supplyMode: 'cells' } : led;
  }

  const count = led.topology === 'single' ? 1 : Math.max(1, Number(led.count) || 1);
  const vf = Number(led.vf);
  const migrated = {
    ...led,
    // 'battery' became 'cells'; anything older had no supply mode at all.
    supplyMode: led.supplyMode === 'battery' ? 'cells' : (led.supplyMode || 'custom'),
    leds: Array.from({ length: count }, () => ({
      colorId: led.colorId ?? 'red',
      vf: Number.isFinite(vf) && vf > 0 ? vf : 2.0,
    })),
    matched: true,
  };
  delete migrated.count;
  delete migrated.vf;
  delete migrated.colorId;
  return migrated;
}

/** Merge a stored or shared object over the defaults, keeping unknown keys out. */
function hydrate(raw) {
  const base = defaultState();
  if (!raw || typeof raw !== 'object') return base;

  for (const key of Object.keys(base)) {
    if (!(key in raw)) continue;
    const incoming = key === 'led' ? migrateLed(raw[key]) : raw[key];
    const current = base[key];
    if (Array.isArray(current)) {
      if (Array.isArray(incoming)) base[key] = incoming;
    } else if (current && typeof current === 'object') {
      if (incoming && typeof incoming === 'object') base[key] = { ...current, ...incoming };
    } else if (incoming !== undefined && incoming !== null) {
      base[key] = incoming;
    }
  }
  return base;
}

export function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Private mode, blocked site data, or a full quota. Persistence is a
    // convenience, so losing it must never break the calculator.
  }
}

function readStored() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------ URL hash */

/** URL-safe base64 over the UTF-8 bytes, which is far more compact than
 *  base64 over a percent-encoded string. */
const encode64 = (text) => btoa(String.fromCharCode(...new TextEncoder().encode(text)))
  .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const decode64 = (text) => {
  const padded = text.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4));
  return new TextDecoder().decode(Uint8Array.from(binary, (c) => c.charCodeAt(0)));
};

/**
 * Encode a shareable link. Only the tool being looked at travels, so the link
 * stays short and says nothing about the rest of the session.
 */
export function toHash(source = state) {
  const slice = { tool: source.tool, prefs: { eSeries: source.prefs.eSeries } };
  if (SHAREABLE.includes(source.tool)) slice[source.tool] = source[source.tool];
  return encode64(JSON.stringify(slice));
}

/** @returns {object|null} the decoded slice, or null if the hash is unusable */
export function fromHash(hash) {
  const raw = String(hash || '').replace(/^#/, '');
  if (!raw) return null;
  try {
    const parsed = JSON.parse(decode64(raw));
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    // Older links used percent-encoded base64; fall back rather than lose them.
    try {
      return JSON.parse(decodeURIComponent(atob(raw)));
    } catch {
      return null;
    }
  }
}

export function shareUrl() {
  const { origin, pathname } = window.location;
  return `${origin}${pathname}#${toHash()}`;
}

/* ------------------------------------------------------------- project */

/** The whole state, as a downloadable project file. */
export function toProject() {
  return JSON.stringify({
    format: 'detronics-resistor-calculator',
    version: 1,
    savedAt: new Date().toISOString(),
    state,
  }, null, 2);
}

/**
 * Replace the state from a project file.
 * @returns {{ok:true} | {ok:false, error:string}}
 */
export function loadProject(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, error: 'That file is not valid JSON.' };
  }
  if (parsed?.format !== 'detronics-resistor-calculator') {
    return { ok: false, error: 'That is not a Detronics Electronics Bench project file.' };
  }
  state = hydrate(parsed.state);
  persist();
  notify(Object.keys(state));
  return { ok: true };
}

/* ---------------------------------------------------------------- init */

/**
 * Build the initial state: defaults, then anything stored, then anything in
 * the URL hash (a shared link should win over the last local session).
 */
export function initState() {
  state = hydrate(readStored());

  const shared = fromHash(window.location.hash);
  if (shared) {
    for (const key of SHAREABLE) {
      if (shared[key] === undefined) continue;
      const incoming = key === 'led' ? migrateLed(shared[key]) : shared[key];
      const current = state[key];
      state[key] = current && typeof current === 'object' && !Array.isArray(current)
        ? { ...current, ...incoming }
        : incoming;
    }
  }
  return state;
}

/* -------------------------------------------------------------- welcome */

export const welcomeSeen = (version) => {
  try {
    return localStorage.getItem(WELCOME_KEY) === String(version);
  } catch {
    return false;
  }
};

export const markWelcomeSeen = (version) => {
  try {
    localStorage.setItem(WELCOME_KEY, String(version));
  } catch {
    // Nothing to do - the modal will simply reappear next visit.
  }
};
