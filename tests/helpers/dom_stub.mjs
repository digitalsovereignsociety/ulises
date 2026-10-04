// Minimal DOM stub for evaluating Ulises ES modules under plain node.
//
// These modules self-initialise on import (theme painting, observers, spinner
// timers, storage reads). Node has no DOM, so provide just enough surface for
// the module bodies to run to completion.
//
// Usage: import './helpers/dom_stub.mjs' BEFORE importing any app module.
// This must be imported in a FRESH module registry — see
// tests/cookbook_modules_smoke.test.mjs, which spawns one child process per
// module for exactly that reason.

// Constructors need a mutable prototype before use, so build them as functions
// rather than `class {}` (whose prototype property is read-only).
for (const name of [
  'HTMLElement', 'HTMLInputElement', 'HTMLTextAreaElement', 'HTMLSelectElement',
  'HTMLCanvasElement', 'HTMLImageElement', 'Element', 'Node', 'NodeList',
  'DocumentFragment', 'Image', 'Option', 'Audio', 'SVGElement', 'ShadowRoot',
  'CustomEvent', 'Event', 'UIEvent', 'MouseEvent', 'KeyboardEvent', 'PointerEvent',
]) {
  if (globalThis[name]) continue;
  const Ctor = function Stub() {};
  Ctor.prototype = {
    dataset: {}, style: {}, value: '', appendChild(c) { return c; }, addEventListener() {},
    removeEventListener() {}, setAttribute() {}, getAttribute: () => null,
    querySelector: () => null, querySelectorAll: () => [], closest: () => null,
  };
  globalThis[name] = Ctor;
}

// Elements are memoized per id and carry a REAL classList, so control flow that
// branches on `classList.contains('hidden')` behaves like the browser instead of
// short-circuiting. Without this, open() bails at its first
// `if (!modal) return` and the module's real code paths never execute.
const byId = new Map();

function makeStyle() {
  const props = new Map();
  const api = {
    setProperty: (k, v) => { props.set(k, v); },
    removeProperty: (k) => { props.delete(k); },
    getPropertyValue: (k) => props.get(k) || '',
  };
  // cssText is writable in the DOM, and callers assign to it.
  Object.defineProperty(api, 'cssText', {
    get() { return [...props].map(([k, v]) => `${k}:${v}`).join(';'); },
    set(v) { props.clear(); String(v).split(';').forEach((d) => {
      const [k, ...rest] = d.split(':');
      if (k && rest.length) props.set(k.trim(), rest.join(':').trim());
    }); },
    enumerable: true,
  });
  return api;
}

function makeEl(id = '') {
  const classes = new Set();
  const el = {
    id,
    className: '',
    innerHTML: '',
    textContent: '',
    value: '',
    style: makeStyle(),
    dataset: {},
    children: [],
    isConnected: false,
    disabled: false,
    classList: {
      add: (...c) => c.forEach((x) => classes.add(x)),
      remove: (...c) => c.forEach((x) => classes.delete(x)),
      contains: (c) => classes.has(c),
      toggle: (c, force) => (force ? classes.add(c) : classes.delete(c)),
    },
    appendChild(c) {
      this.children.push(c);
      if (c && typeof c === 'object') c.parentNode = this;
      return c;
    },
    prepend(c) {
      this.children.unshift(c);
      if (c && typeof c === 'object') c.parentNode = this;
      return c;
    },
    insertBefore(c, ref) {
      const i = ref ? this.children.indexOf(ref) : -1;
      if (i === -1) this.children.push(c); else this.children.splice(i, 0, c);
      if (c && typeof c === 'object') c.parentNode = this;
      return c;
    },
    replaceChild(next, prev) {
      const i = this.children.indexOf(prev);
      if (i !== -1) this.children.splice(i, 1, next);
      if (next && typeof next === 'object') next.parentNode = this;
      return prev;
    },
    removeChild(c) {
      const i = this.children.indexOf(c);
      if (i !== -1) this.children.splice(i, 1);
      return c;
    },
    get firstChild() { return this.children[0] || null; },
    get lastChild() { return this.children[this.children.length - 1] || null; },
    get nextSibling() { return null; },
    get previousSibling() { return null; },
    parentNode: null,
    parentElement: null,
    ownerDocument: null,
    after() {}, before() {}, remove() {}, replaceChildren() {},
    cloneNode() { return makeEl(id); },
    closest: () => null,
    contains: () => false,
    querySelector: () => null,
    querySelectorAll: () => [],
    getElementsByClassName: () => [],
    getElementsByTagName: () => [],
    addEventListener() {}, removeEventListener() {},
    dispatchEvent() { return true; },
    setAttribute(k, v) { this[k] = v; },
    getAttribute: (k) => (k in this ? this[k] : null),
    removeAttribute(k) { delete this[k]; },
    focus() {}, blur() {}, click() {}, scrollIntoView() {},
    getBoundingClientRect: () => ({
      top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0,
    }),
  };
  return el;
}

// Cookbook's modal starts hidden, which is the state open() expects.
const cookbookModal = makeEl('cookbook-modal');
cookbookModal.classList.add('hidden');
byId.set('cookbook-modal', cookbookModal);

// Canvas: theme.js and the spinner paint through 2d contexts on open.
const ctx2d = () => {
  const noop = () => {};
  return {
    canvas: null, save: noop, restore: noop, scale: noop, rotate: noop,
    translate: noop, transform: noop, setTransform: noop, resetTransform: noop,
    clearRect: noop, fillRect: noop, strokeRect: noop, beginPath: noop,
    closePath: noop, moveTo: noop, lineTo: noop, arc: noop, rect: noop,
    fill: noop, stroke: noop, clip: noop, bezierCurveTo: noop,
    quadraticCurveTo: noop, ellipse: noop, roundRect: noop,
    fillText: noop, strokeText: noop, drawImage: noop, putImageData: noop,
    createLinearGradient: () => ({ addColorStop: noop }),
    createRadialGradient: () => ({ addColorStop: noop }),
    createPattern: () => null, measureText: () => ({ width: 0 }),
    getImageData: (x, y, w, h) => ({ data: new Uint8ClampedArray(Math.max(1, (w || 1) * (h || 1) * 4)) }),
    isPointInPath: () => false,
    globalAlpha: 1, globalCompositeOperation: 'source-over',
    fillStyle: '#000', strokeStyle: '#000', lineWidth: 1, font: '10px sans-serif',
    lineCap: 'butt', lineJoin: 'miter', shadowBlur: 0, shadowColor: 'transparent',
    imageSmoothingEnabled: true, filter: 'none',
  };
};

globalThis.document = {
  createElement: () => makeEl(),
  createElementNS: () => makeEl(),
  createDocumentFragment: () => makeEl(),
  createTextNode: () => makeEl(),
  getElementById: (id) => {
    if (!byId.has(id)) byId.set(id, makeEl(id));
    const el = byId.get(id);
    // Elements queried by id live in the document, so they have a parent —
    // callers rely on that for parentNode.replaceChild and friends.
    if (!el.parentNode) el.parentNode = globalThis.document.body;
    return el;
  },
  querySelector: () => null,
  querySelectorAll: () => [],
  getElementsByClassName: () => [],
  getElementsByTagName: () => [],
  addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true; },
  body: makeEl('body'), head: makeEl('head'), documentElement: makeEl('html'),
  readyState: 'complete', hidden: false, visibilityState: 'visible',
  fonts: { ready: Promise.resolve(), add() {}, check: () => true, load: () => Promise.resolve() },
};

// Canvas support — theme.js and the spinner both paint through 2d contexts when
// the Cookbook modal opens. Must come after `document` exists.
const baseCreate = globalThis.document.createElement;
globalThis.document.createElement = (tag, ...rest) => {
  const el = baseCreate(tag, ...rest);
  if (String(tag).toLowerCase() === 'canvas') {
    el.width = 300;
    el.height = 150;
    el.getContext = () => ctx2d();
    el.toDataURL = () => 'data:image/png;base64,';
    el.toBlob = (cb) => cb && cb({});
  }
  return el;
};

globalThis.OffscreenCanvas = class {
  constructor() { this.width = 300; this.height = 150; }
  getContext() { return ctx2d(); }
  convertToBlob() { return Promise.resolve({}); }
};

globalThis.window = globalThis;
globalThis.self = globalThis;
globalThis.top = globalThis;
globalThis.parent = globalThis;
globalThis.location = {
  href: 'http://localhost/', origin: 'http://localhost', protocol: 'http:',
  host: 'localhost', hostname: 'localhost', port: '', pathname: '/',
  search: '', hash: '', assign() {}, replace() {}, reload() {},
};
globalThis.history = { pushState() {}, replaceState() {}, back() {}, forward() {}, length: 1 };
globalThis.navigator = {
  language: 'en-US', languages: ['en-US', 'en'], userAgent: 'node',
  platform: 'linux', hardwareConcurrency: 4, clipboard: {},
  serviceWorker: { register: () => Promise.resolve(), controller: null },
  permissions: { query: () => Promise.resolve({ state: 'granted' }) },
  mediaDevices: { enumerateDevices: () => Promise.resolve([]) },
  wakeLock: { request: () => Promise.reject(new Error('n/a')) },
};
globalThis.CSS = { escape: (s) => String(s), supports: () => false };
globalThis.innerWidth = 1280;
globalThis.innerHeight = 800;
globalThis.devicePixelRatio = 1;
globalThis.screen = { width: 1280, height: 800, availWidth: 1280, availHeight: 800 };
globalThis.matchMedia = () => ({
  matches: false, media: '', onchange: null,
  addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {},
});
globalThis.getComputedStyle = () => ({
  getPropertyValue: () => '', display: 'block', visibility: 'visible',
});
globalThis.requestAnimationFrame = (fn) => setTimeout(fn, 0);
globalThis.cancelAnimationFrame = (h) => clearTimeout(h);
globalThis.requestIdleCallback = (fn) => setTimeout(fn, 0);
globalThis.cancelIdleCallback = (h) => clearTimeout(h);
globalThis.addEventListener = () => {};
globalThis.removeEventListener = () => {};
globalThis.scrollTo = () => {};
globalThis.scrollBy = () => {};
globalThis.open = () => null;
globalThis.close = () => {};
globalThis.alert = () => {};
globalThis.confirm = () => false;
globalThis.prompt = () => null;
globalThis.MutationObserver = class { observe() {} disconnect() {} takeRecords() { return []; } };
globalThis.ResizeObserver = class { observe() {} disconnect() {} unobserve() {} };
globalThis.IntersectionObserver = class { observe() {} disconnect() {} unobserve() {} };
globalThis.PerformanceObserver = class { observe() {} disconnect() {} };
globalThis.Worker = class { constructor() {} postMessage() {} terminate() {} addEventListener() {} };
globalThis.localStorage = {
  _d: new Map(),
  getItem(k) { return this._d.has(k) ? this._d.get(k) : null; },
  setItem(k, v) { this._d.set(k, String(v)); },
  removeItem(k) { this._d.delete(k); },
  clear() { this._d.clear(); },
  key: (i) => null,
  get length() { return this._d.size; },
};
globalThis.sessionStorage = { ...globalThis.localStorage, _d: new Map() };
// Resolve every fetch locally: a relative-URL request throws ERR_INVALID_URL,
// which kicks off retry loops that stop `node --test` from ever exiting.
globalThis.fetch = async () => ({
  ok: true, status: 200, statusText: 'OK',
  json: async () => ({}), text: async () => '', blob: async () => ({}),
  arrayBuffer: async () => new ArrayBuffer(0), headers: { get: () => null },
});

export const domStubReady = true;
