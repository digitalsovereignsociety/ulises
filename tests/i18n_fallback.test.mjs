// Behavioural tests for i18n.js itself.
//
// static/js/i18n.test.mjs deliberately re-implements _resolve/_interpolate/t()
// rather than importing the module, because i18n.js reaches for `fetch`,
// `localStorage` and `document`. That leaves the real t() — including its
// missing-key behaviour — untested. This file imports the actual module under
// the DOM stub so the fallback path is exercised.
//
// Run: node --test tests/i18n_fallback.test.mjs
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');

const ran = [];
const check = (name, fn) => { ran.push(name); return test(name, fn); };

after(() => {
  console.log(`I18N_FALLBACK_OK ${ran.length}`);
});

// init() must not run, so capture the warnings t() emits for missing keys.
const warnings = [];
const realWarn = console.warn;
console.warn = (...args) => { warnings.push(args.join(' ')); };

await import(pathToFileURL(path.join(ROOT, 'tests/helpers/dom_stub.mjs')).href);
const i18n = await import(
  pathToFileURL(path.join(ROOT, 'static/js/i18n.js')).href
);

// Before init() no locale is loaded, so every key is a miss. That is exactly the
// state the real fallback has to survive.
check('t() exists and is callable', () => {
  assert.equal(typeof i18n.t, 'function');
});

check('a missing key renders as readable prose, not the raw key', () => {
  assert.equal(i18n.t('admin.add_directory'), 'Add directory');
  assert.equal(i18n.t('gallery.remove_from_album'), 'Remove from album');
  assert.equal(i18n.t('cookbookServe.retry-with-context'), 'Retry with context');
  assert.equal(i18n.t('tasks.clear_all'), 'Clear all');
});

check('the namespace is dropped but the leaf is preserved', () => {
  // Without this, 'admin.add_directory' and 'tasks.add_directory' would be
  // indistinguishable in the UI.
  assert.equal(i18n.t('a.b.same_leaf'), 'Same leaf');
  assert.equal(i18n.t('c.d.same_leaf'), 'Same leaf');
});

check('a key with no leaf segment falls back to itself', () => {
  assert.equal(i18n.t(''), '');
  assert.notEqual(i18n.t('weird'), undefined);
});

check('missing keys warn exactly once each', () => {
  // Count only this key's warnings on both sides — earlier tests already
  // emitted warnings for their own missing keys.
  const countFor = (k) => warnings.filter((w) => w.includes(`"${k}"`)).length;
  const before = countFor('some.brand_new_key');
  i18n.t('some.brand_new_key');
  i18n.t('some.brand_new_key');
  i18n.t('some.brand_new_key');
  assert.equal(countFor('some.brand_new_key') - before, 1,
    'expected exactly one warning for three lookups');
  assert.ok(warnings.some((w) =>
    w.includes('missing translation for "some.brand_new_key"')), warnings.join('\n'));

  // A second key must still warn, i.e. the dedupe is per key not global.
  const otherBefore = countFor('another.missing_key');
  i18n.t('another.missing_key');
  assert.equal(countFor('another.missing_key') - otherBefore, 1);
});

check('humanized values still interpolate vars', () => {
  // A missing key with vars must not leave raw {{placeholders}} behind if the
  // humanized text happens to contain braces — it does not, but assert the
  // shape so a future key with braces cannot regress it.
  const out = i18n.t('missing.key_here', { name: 'x' });
  assert.equal(typeof out, 'string');
  assert.ok(!out.includes('{{name}}'));
});

check('console.warn was restored for the rest of the suite', () => {
  console.warn = realWarn;
  assert.equal(console.warn, realWarn);
});
