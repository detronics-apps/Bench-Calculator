/** Small DOM helpers, so the UI modules read as structure rather than plumbing. */

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * Create an element.
 * @param {string} tag
 * @param {object} [attrs] properties: `class`, `text`, `html`, `on` (event map),
 *                         `dataset`, plus any attribute name
 * @param {Array<Node|string|null|undefined>} [children]
 */
export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  applyAttrs(node, attrs);
  append(node, children);
  return node;
}

/** Same as `el`, in the SVG namespace. */
export function svg(tag, attrs = {}, children = []) {
  const node = document.createElementNS(SVG_NS, tag);
  applyAttrs(node, attrs, true);
  append(node, children);
  return node;
}

function applyAttrs(node, attrs, isSvg = false) {
  for (const [key, value] of Object.entries(attrs)) {
    if (value === null || value === undefined || value === false) continue;

    if (key === 'text') { node.textContent = value; continue; }
    if (key === 'html') { node.innerHTML = value; continue; }
    if (key === 'on') {
      for (const [type, fn] of Object.entries(value)) node.addEventListener(type, fn);
      continue;
    }
    if (key === 'dataset') {
      for (const [k, v] of Object.entries(value)) node.dataset[k] = v;
      continue;
    }
    if (key === 'style' && typeof value === 'object') {
      Object.assign(node.style, value);
      continue;
    }
    if (!isSvg && key === 'value') { node.value = value; continue; }
    node.setAttribute(key, value === true ? '' : value);
  }
}

export function append(parent, children) {
  const list = Array.isArray(children) ? children : [children];
  for (const child of list) {
    if (child === null || child === undefined || child === false) continue;
    parent.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
  }
  return parent;
}

export function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
  return node;
}

export const $ = (selector, root = document) => root.querySelector(selector);

/*
 * Info tooltips.
 *
 * The bubble cannot live inside the icon: the sidebar is a scroll container,
 * and anything overflowing it gets clipped no matter how high its z-index is.
 * Instead one shared bubble sits on <body> and is positioned in viewport
 * coordinates, which no ancestor can clip.
 */

let bubble = null;
let bubbleAnchor = null;

function ensureBubble() {
  if (!bubble) {
    bubble = el('div', { class: 'info__bubble', role: 'tooltip' });
    document.body.appendChild(bubble);
    // A tooltip pinned to viewport coordinates goes stale the moment anything
    // moves, so retire it rather than let it drift away from its icon.
    for (const event of ['scroll', 'resize']) {
      window.addEventListener(event, hideTooltip, true);
    }
  }
  return bubble;
}

export function hideTooltip() {
  if (bubble) bubble.style.display = 'none';
  bubbleAnchor = null;
}

function showTooltip(anchor, text) {
  const node = ensureBubble();
  bubbleAnchor = anchor;
  node.textContent = text;
  node.style.display = 'block';
  node.style.left = '0px';
  node.style.top = '0px';

  const a = anchor.getBoundingClientRect();
  const b = node.getBoundingClientRect();
  const margin = 8;

  // Centre on the icon, then pull back inside the viewport at either edge.
  const left = Math.min(
    Math.max(margin, a.left + a.width / 2 - b.width / 2),
    window.innerWidth - b.width - margin,
  );
  // Above by preference; below when there is no room up there.
  const above = a.top - b.height - margin;
  const top = above >= margin ? above : a.bottom + margin;

  node.style.left = `${left}px`;
  node.style.top = `${top}px`;
}

/** An inline info icon whose tooltip appears on hover and on keyboard focus. */
export function infoIcon(text) {
  const icon = el('button', {
    class: 'info',
    type: 'button',
    'aria-label': text,
    tabindex: '0',
    text: 'i',
    on: {
      mouseenter: () => showTooltip(icon, text),
      mouseleave: () => hideTooltip(),
      focus: () => showTooltip(icon, text),
      blur: () => hideTooltip(),
      click: (e) => {
        // On touch there is no hover, so a tap toggles it.
        e.preventDefault();
        if (bubbleAnchor === icon) hideTooltip();
        else showTooltip(icon, text);
      },
    },
  });
  return icon;
}

/** A labelled form field, optionally with an info icon and a hint line. */
export function field(label, control, { info, hint } = {}) {
  const id = control.id || `f-${Math.random().toString(36).slice(2, 9)}`;
  control.id = id;
  return el('div', { class: 'field' }, [
    el('label', { class: 'field__label', for: id }, [label, info ? infoIcon(info) : null]),
    control,
    hint ? el('div', { class: 'field__hint', text: hint }) : null,
  ]);
}

/** A <select> bound to a change handler. */
export function select(options, value, onChange, attrs = {}) {
  const node = el('select', { class: 'select', ...attrs, on: { change: (e) => onChange(e.target.value) } });
  for (const opt of options) {
    node.appendChild(el('option', {
      value: String(opt.value),
      text: opt.label,
      selected: String(opt.value) === String(value),
    }));
  }
  node.value = String(value);
  return node;
}

/** A row of mutually exclusive chips. */
export function chips(options, value, onChange) {
  return el('div', { class: 'chipset' }, options.map((opt) => el('button', {
    class: 'chip',
    type: 'button',
    'aria-pressed': String(String(opt.value) === String(value)),
    text: opt.label,
    title: opt.title || null,
    on: { click: () => onChange(opt.value) },
  })));
}

/** A short-lived confirmation message. */
export function toast(message) {
  const existing = $('.toast');
  if (existing) existing.remove();
  const node = el('div', { class: 'toast', role: 'status', text: message });
  document.body.appendChild(node);
  setTimeout(() => node.remove(), 2600);
}

/** Trigger a download of `blob` without ever leaving the page. */
export function download(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = el('a', { href: url, download: filename });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
