/**
 * Export: SVG, PNG, a shareable URL, and the printable label sheet.
 * Everything happens in the page - nothing is uploaded anywhere.
 */

import { download, toast } from './dom.js';
import { shareUrl } from '../state.js';

/**
 * Replace every `var(--token)` in the clone with the value the page currently
 * computes for it, so the exported file stands alone with no stylesheet.
 */
function inlineTokens(node) {
  const computed = getComputedStyle(document.documentElement);
  const resolve = (value) => value.replace(
    /var\((--[\w-]+)\)/g,
    (_, name) => computed.getPropertyValue(name).trim() || '#000000',
  );

  const walk = (element) => {
    for (const attr of Array.from(element.attributes || [])) {
      if (attr.value.includes('var(--')) element.setAttribute(attr.name, resolve(attr.value));
    }
    if (element.style?.cssText?.includes('var(--')) {
      element.style.cssText = resolve(element.style.cssText);
    }
    for (const child of element.children) walk(child);
  };
  walk(node);
  return node;
}

/** A standalone copy of a live SVG: tokens resolved, fonts stated, background painted. */
export function standaloneSvg(source, { background = true, padding = 12 } = {}) {
  const clone = source.cloneNode(true);
  inlineTokens(clone);

  const [, , vbW, vbH] = (clone.getAttribute('viewBox') || '0 0 760 250').split(/\s+/).map(Number);

  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('width', vbW);
  clone.setAttribute('height', vbH);
  clone.setAttribute('font-family', 'system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif');

  // Interactive attributes mean nothing in a file.
  for (const node of clone.querySelectorAll('[tabindex], [role], [aria-pressed]')) {
    node.removeAttribute('tabindex');
    node.removeAttribute('aria-pressed');
    if (node.getAttribute('role') === 'button') node.setAttribute('role', 'presentation');
  }

  if (background) {
    const panel = getComputedStyle(document.documentElement).getPropertyValue('--panel').trim() || '#ffffff';
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('x', -padding);
    rect.setAttribute('y', -padding);
    rect.setAttribute('width', vbW + padding * 2);
    rect.setAttribute('height', vbH + padding * 2);
    rect.setAttribute('fill', panel);
    clone.insertBefore(rect, clone.firstChild);
  }

  return { node: clone, width: vbW, height: vbH };
}

const serialise = (node) => new XMLSerializer().serializeToString(node);

export function exportSvg(source, filename) {
  const { node } = standaloneSvg(source);
  const text = `<?xml version="1.0" encoding="UTF-8"?>\n${serialise(node)}`;
  download(new Blob([text], { type: 'image/svg+xml;charset=utf-8' }), `${filename}.svg`);
  toast('SVG downloaded');
}

/**
 * Rasterise the SVG through a canvas. The SVG is passed as a data URL rather
 * than a blob URL so that the canvas is never tainted.
 */
export function exportPng(source, filename, scale = 3) {
  const { node, width, height } = standaloneSvg(source);
  const text = serialise(node);
  const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(text)}`;

  const image = new Image();
  image.onload = () => {
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    canvas.toBlob((blob) => {
      if (!blob) { toast('Could not render the PNG'); return; }
      download(blob, `${filename}.png`);
      toast(`PNG downloaded at ${scale}x`);
    }, 'image/png');
  };
  image.onerror = () => toast('Could not render the PNG');
  image.src = url;
}

export async function copyShareLink() {
  const url = shareUrl();
  // Put it in the address bar first, so the link is recoverable by hand even
  // if the clipboard is refused.
  window.history.replaceState(null, '', url);
  try {
    await navigator.clipboard.writeText(url);
    toast('Link copied to the clipboard');
  } catch {
    toast('Clipboard blocked - the link is now in your address bar');
  }
}
