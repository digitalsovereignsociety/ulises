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

const noopEl = () => ({
  className: '', innerHTML: '', textContent: '', value: '', style: {},
  dataset: {}, children: [], isConnected: false, disabled: false,
  classList: {
    add() {}, remove() {}, contains: () => false, toggle() {},
  },
  appendChild(c) { this.children.push(c); return c; },
  prepend(c) { this.children.unshift(c); return c; },
  insertBefore(c) { this.children.push(c); return c; },
  after() {}, before() {}, remove() {}, replaceChildren() {},
  cloneNode() { return noopEl(); },
  closest: () => null, contains: () => false,
  querySelector: () => null, querySelectorAll: () => [],
  getElementsByClassName: () => [], getElementsByTagName: () => [],
  addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true; },
  setAttribute() {}, getAttribute: () => null, removeAttribute() {},
  focus() {}, blur() {}, click() {}, scrollIntoView() {},
  getBoundingClientRect: () => ({
    top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0,
  }),
});

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
    dataset: {}, style: {}, classList: { add() {}, remove() {}, contains: () => false, toggle() {} },
    value: '', appendChild(c) { return c; }, addEventListener() {},
    removeEventListener() {}, setAttribute() {}, getAttribute: () => null,
    querySelector: () => null, querySelectorAll: () => [], closest: () => null,
  };
  globalThis[name] = Ctor;
}

globalThis.document = {
  createElement: noopEl,
  createElementNS: noopEl,
  createDocumentFragment: noopEl,
  createTextNode: () => noopEl(),
  getElementById: () => null,
  querySelector: () => null,
  querySelectorAll: () => [],
  getElementsByClassName: () => [],
  getElementsByTagName: () => [],
  addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true; },
  body: noopEl(), head: noopEl(), documentElement: noopEl(),
  readyState: 'complete', hidden: false, visibilityState: 'visible',
  fonts: { ready: Promise.resolve(), add() {}, check: () => true, load: () => Promise.resolve() },
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
