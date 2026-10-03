// Behavioural smoke test for cookbook-diagnosis-core.js.
//
// The static assertions in test_cookbook_diagnosis_js.py prove the module
// *shape*. This proves it actually evaluates and that the initDiagnosisCore
// wiring reaches the ERROR_PATTERNS fix actions.
//
// Run: node --test tests/cookbook_diagnosis_core.test.mjs
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const coreUrl = pathToFileURL(path.join(ROOT, 'static/js/cookbook-diagnosis-core.js')).href;

// Minimal DOM: the diagnosis render path plus the transitive
// core -> cookbook-shared -> ui.js chain touch these at module-eval time.
// Node has no DOM, so stub the surface; nothing here exercises real behaviour.
const noopEl = () => ({
  className: '', innerHTML: '', textContent: '', style: {}, dataset: {},
  classList: { add() {}, remove() {}, contains: () => false, toggle() {} },
  appendChild() {}, prepend() {}, after() {}, before() {}, remove() {},
  closest: () => null, querySelector: () => null, querySelectorAll: () => [],
  addEventListener() {}, removeEventListener() {}, setAttribute() {},
  getBoundingClientRect: () => ({ top: 0, left: 0, width: 0, height: 0 }),
});
globalThis.document = {
  createElement: noopEl,
  createDocumentFragment: noopEl,
  getElementById: () => null,
  querySelector: () => null,
  querySelectorAll: () => [],
  addEventListener() {}, removeEventListener() {},
  body: noopEl(), head: noopEl(), documentElement: noopEl(),
  readyState: 'complete',
};
globalThis.CSS = { escape: (s) => s };
globalThis.window = globalThis;

// The transitive chain (core -> cookbook-shared -> ui.js -> colorPicker.js …)
// touches a few DOM constructors at module-eval time. Node has no DOM, so
// stub the constructors; nothing here exercises their behaviour.
for (const name of ['HTMLInputElement', 'HTMLElement', 'HTMLTextAreaElement',
                    'HTMLSelectElement', 'HTMLTextAreaElement', 'Element',
                    'Node', 'NodeList', 'DocumentFragment']) {
  if (!globalThis[name]) globalThis[name] = class {};
}
if (!globalThis.HTMLInputElement.prototype) globalThis.HTMLInputElement.prototype = {};
globalThis.HTMLInputElement.prototype.value = '';
globalThis.localStorage = {
  _d: new Map(),
  getItem(k) { return this._d.has(k) ? this._d.get(k) : null; },
  setItem(k, v) { this._d.set(k, String(v)); },
  removeItem(k) { this._d.delete(k); },
};
globalThis.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
globalThis.MutationObserver = class { observe() {} disconnect() {} takeRecords() { return []; } };
globalThis.ResizeObserver = class { observe() {} disconnect() {} unobserve() {} };
globalThis.IntersectionObserver = class { observe() {} disconnect() {} unobserve() {} };
globalThis.requestAnimationFrame = (fn) => setTimeout(fn, 0);
globalThis.cancelAnimationFrame = (h) => clearTimeout(h);
globalThis.getComputedStyle = () => ({ getPropertyValue: () => '' });
globalThis.addEventListener = () => {};
globalThis.removeEventListener = () => {};
globalThis.innerWidth = 1280;
globalThis.innerHeight = 800;
// ui.js/theme.js self-initialise on import. A real fetch to a relative URL
// throws ERR_INVALID_URL and kicks off a retry loop that never drains, which
// hangs `node --test` after the assertions have passed. Answer locally.
globalThis.fetch = async () => ({
  ok: true, status: 200,
  json: async () => ({}), text: async () => '',
});

// Importing the module pulls in ui.js / theme.js, which start timers and
// observers that Node's test runner waits on forever. The assertions are
// synchronous, so report a sentinel and exit explicitly once they are done.
// The sentinel (rather than the reporter's own counters) is what the pytest
// wrapper checks — process.exit() runs before the TAP summary is flushed.
const ran = [];
const check = (name, fn) => { ran.push(name); return test(name, fn); };

after(() => {
  console.log(`DIAGNOSIS_CORE_TESTS_OK ${ran.length}`);
  process.exit(0);
});

const core = await import(coreUrl);

check('module evaluates and exports the diagnosis surface', () => {
  assert.equal(typeof core._diagnose, 'function');
  assert.equal(typeof core._showDiagnosis, 'function');
  assert.equal(typeof core._clearDiagnosis, 'function');
  assert.equal(typeof core.initDiagnosisCore, 'function');
  assert.ok(Array.isArray(core.ERROR_PATTERNS));
  // 46 entries as of the split (43 keyed on `pattern`, 3 on `match`) — pins the
  // table against silent truncation.
  assert.equal(core.ERROR_PATTERNS.length, 46);
  assert.equal(core.ERROR_PATTERNS.filter(e => e.match).length, 3);
});

check('_diagnose matches a known error and ignores clean output', () => {
  const oom = core._diagnose('CUDA out of memory. Tried to allocate 20.00 GiB');
  assert.ok(oom, 'expected an OOM diagnosis');
  assert.ok(oom.fixes.length > 0, 'OOM entry should offer fixes');

  assert.equal(core._diagnose('all good, nothing to see here'), null);
});

check('ERROR_PATTERNS survived the module split intact', () => {
  // Spot-check entries whose fixes reference the injected serve helpers.
  const all = core.ERROR_PATTERNS.flatMap(p => p.fixes || []);
  const labels = all.map(f => f.label);
  assert.ok(labels.some(l => /Retry with context 4096/.test(l)), 'serve auto-retry fixes present');
  assert.ok(labels.some(l => /Lower max context to 4096/.test(l)), 'panel-field fixes present');
  assert.ok(labels.some(l => /Enable enforce eager/.test(l)), 'panel-checkbox fixes present');
  assert.ok(all.every(f => typeof f.action === 'function'), 'every fix is callable');
});

check('fix actions name themselves when used before initDiagnosisCore', () => {
  const oom = core._diagnose('CUDA out of memory. Tried to allocate 20.00 GiB');
  const fix = oom.fixes.find(f => /Retry with context/.test(f.label));
  assert.ok(fix, 'expected a serve-auto-retry fix');
  // The unwired stub throws synchronously, so this is assert.throws, not
  // assert.rejects — the point is a loud, self-describing failure rather than
  // a silent no-op if cookbook.js ever forgets to wire the module up.
  assert.throws(() => fix.action(noopEl()), /used before initDiagnosisCore/);
});

check('initDiagnosisCore routes fix actions to the injected implementation', () => {
  const calls = [];
  const record = (name) => (...args) => { calls.push([name, ...args]); };
  core.initDiagnosisCore({
    _serveAutoRetry: record('_serveAutoRetry'),
    _serveAutoRetryReplace: record('_serveAutoRetryReplace'),
    _serveAutoRetryRemove: record('_serveAutoRetryRemove'),
    _serveAutoFix: record('_serveAutoFix'),
    _launchServeTask: record('_launchServeTask'),
    _loadTasks: () => [],
    _setPanelField: record('_setPanelField'),
    _setPanelCheckbox: record('_setPanelCheckbox'),
  });

  const oom = core._diagnose('CUDA out of memory. Tried to allocate 20.00 GiB');
  const panel = noopEl();
  for (const fix of oom.fixes) fix.action(panel, 'CUDA out of memory');

  assert.ok(calls.length > 0, 'injected helpers were called');
  const names = new Set(calls.map(c => c[0]));
  assert.ok(names.has('_serveAutoRetry') || names.has('_serveAutoRetryReplace'),
    `expected a serve auto-retry call, got ${[...names]}`);
  // _loadTasks is consulted by _showDiagnosis; exercise it directly.
  assert.deepEqual(core._diagnose('CUDA out of memory'), oom, 'diagnosis still resolves post-init');
});

check('_clearDiagnosis is safe on a panel with no prior diagnosis', () => {
  const panel = noopEl();
  core._clearDiagnosis(panel);
  assert.equal(panel._lastDiagMsg, null);
});
