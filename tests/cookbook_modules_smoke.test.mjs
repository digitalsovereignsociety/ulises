// Evaluation smoke test for the cookbook ES modules.
//
// Why this exists: `node --check` only parses, and a graph verifier only proves
// that imports which ARE present resolve. Neither notices an identifier that is
// used but never bound. That is not hypothetical — cookbook.js referenced `esc`
// (56 call sites, plus the module-scope `shared` object) with no import
// anywhere, so the Cookbook died on load with
// "ReferenceError: esc is not defined" while every static check stayed green.
//
// Each module is loaded in a FRESH child process, one module per process. That
// matters: sharing a registry between modules can mask a missing import, because
// an earlier load can leave the module cached (or leave stray globals behind)
// and hide the crash. Loading cookbook.js on its own is what reproduces the
// browser failure.
//
// Run: node --test tests/cookbook_modules_smoke.test.mjs
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const JS = path.join(ROOT, 'static/js');
const STUB = pathToFileURL(path.join(ROOT, 'tests/helpers/dom_stub.mjs')).href;

const ran = [];
const check = (name, fn) => { ran.push(name); return test(name, fn); };

after(() => {
  console.log(`COOKBOOK_SMOKE_OK ${ran.length}`);
  // Modules leave timers and observers running; nothing is awaited here.
  process.exit(0);
});

// Evaluate exactly one module in a pristine registry and report what happened.
function evalIsolated(relPath) {
  const target = pathToFileURL(path.join(JS, relPath)).href;
  const script = `
    import ${JSON.stringify(STUB)};
    const t = ${JSON.stringify(target)};
    try {
      const m = await import(t);
      const keys = Object.keys(m).sort();
      console.log('EVAL_OK ' + JSON.stringify({
        exports: keys,
        hasDefault: !!m.default,
        defaultKeys: m.default && typeof m.default === 'object' ? Object.keys(m.default).sort() : [],
      }));
    } catch (e) {
      console.log('EVAL_FAIL ' + (e && e.constructor ? e.constructor.name : 'Error') + ': ' + (e && e.message));
    }
    process.exit(0);
  `;
  const out = execFileSync(process.execPath, ['--input-type=module', '-e', script], {
    encoding: 'utf8', timeout: 60000,
  });
  const ok = out.match(/^EVAL_OK (.*)$/m);
  const bad = out.match(/^EVAL_FAIL (.*)$/m);
  if (bad) return { ok: false, error: bad[1] };
  assert.ok(ok, `no result marker in child output:\n${out}`);
  return { ok: true, ...JSON.parse(ok[1]) };
}

const MODULES = [
  'cookbook-shared.js',
  'cookbook-diagnosis-core.js',
  'cookbook-diagnosis.js',
  'cookbookRunning.js',
  'cookbookDownload.js',
  'cookbookServe.js',
  'cookbook-hwfit.js',
  'cookbook-deps-recipes.js',
  'cookbook.js',
];

for (const rel of MODULES) {
  check(`${rel} evaluates in a fresh module registry`, () => {
    const r = evalIsolated(rel);
    assert.ok(r.ok, `${rel} threw on evaluation: ${r.error}`);
    assert.ok(r.exports.length > 0, `${rel} exported nothing`);
  });
}

// The regression, spelled out. Without the `esc` import this is the exact
// browser failure: "Uncaught ReferenceError: esc is not defined" thrown from
// the module-scope `shared` object literal in cookbook.js.
check('regression: cookbook.js does not depend on an unbound esc', () => {
  const r = evalIsolated('cookbook.js');
  assert.ok(r.ok, `cookbook.js threw on evaluation: ${r.error}`);
  assert.ok(r.hasDefault, 'cookbook.js must keep its default export');
  for (const fn of ['open', 'close', 'isVisible']) {
    assert.ok(r.defaultKeys.includes(fn), `default export missing ${fn}()`);
  }
});

check('cookbook-shared.js esc escapes HTML', () => {
  const r = evalIsolated('cookbook-shared.js');
  assert.ok(r.ok);
  assert.ok(r.exports.includes('esc'), 'cookbook-shared.js must export esc');
});

check('cookbook-diagnosis-core.js exposes the diagnosis surface', () => {
  const r = evalIsolated('cookbook-diagnosis-core.js');
  assert.ok(r.ok);
  for (const sym of ['ERROR_PATTERNS', '_diagnose', '_showDiagnosis',
                     '_clearDiagnosis', 'initDiagnosisCore']) {
    assert.ok(r.exports.includes(sym), `cookbook-diagnosis-core.js missing ${sym}`);
  }
});

check('cookbook-diagnosis.js re-exports the core surface', () => {
  const r = evalIsolated('cookbook-diagnosis.js');
  assert.ok(r.ok);
  for (const sym of ['ERROR_PATTERNS', '_diagnose', '_showDiagnosis', '_clearDiagnosis']) {
    assert.ok(r.exports.includes(sym), `cookbook-diagnosis.js must re-export ${sym}`);
  }
  for (const sym of ['openCookbookDependencies', '_runQuickCmd']) {
    assert.ok(r.exports.includes(sym), `cookbook-diagnosis.js missing ${sym}`);
  }
});

check('every cookbook module evaluates in one shared graph', async () => {
  // Same graph the browser builds, in one registry. Catches a module that only
  // works when evaluated after some other module has run.
  await import(pathToFileURL(path.join(ROOT, 'tests/helpers/dom_stub.mjs')).href);
  const mods = await Promise.all(MODULES.map((m) => import(pathToFileURL(path.join(JS, m)).href)));
  assert.equal(mods.length, MODULES.length);
  // _envState must be a single shared object, or Cookbook writes state the
  // other modules never see (the two-modules-with-different-_envState bug).
  const shared = mods[0]._envState;
  assert.ok(shared && typeof shared === 'object', 'shared _envState missing');
  assert.equal(shared.servers && shared.servers.length, 0, 'unexpected default servers');
});
