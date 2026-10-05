// The cookbook diagnosis fix catalog — the sixth instance of this repo's
// recurring shape, and the most tangled one.
//
// A fix entry used to be `{ label, action }` where `label` was simultaneously:
//   - the button's visible text,
//   - the argument to _diagFixIcon, which lowercased it and matched English
//     verbs to pick an SVG,
//   - and the left side of `fixes.some(f => f.label === 'Edit serve')`.
//
// So localising a label would have changed the button's icon and silently
// appended a duplicate "Edit serve". Three fields now, three jobs:
//
//   id     stable contract for dedupe
//   kind   icon enum, consumed by _diagFixIcon
//   label  display text, resolved through the locale
//
// The kinds were derived from the *old* string-matching logic, so each button
// keeps the icon it renders today — including the quirk where "Edit & relaunch"
// classifies as a retry because the relaunch check runs first.
//
// Run: node --test tests/test_cookbook_diag_fix_shape.test.mjs
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const ran = [];
const check = (name, fn) => { ran.push(name); return test(name, fn); };

after(() => { console.log(`COOKBOOK_DIAG_SHAPE_OK ${ran.length}`); });

const core = readFileSync(path.join(ROOT, 'static/js/cookbook-diagnosis-core.js'), 'utf8');
const running = readFileSync(path.join(ROOT, 'static/js/cookbookRunning.js'), 'utf8');

// Anchored on `kind:` and reading forward to `action:`. A brace-matching regex
// was tried first and only found 51 of the 113 entries, because plenty of
// actions have braces in their own body.
function fixEntries(src) {
  return [...src.matchAll(/\bkind:\s*'[^']+'([^]*?)\baction:/g)].map((m) => m[0]);
}
const entries = [...fixEntries(core), ...fixEntries(running)];

check('the catalog is populated', () => {
  assert.ok(entries.length >= 100, `only ${entries.length} fix entries parsed`);
});

check('every fix entry declares a kind', () => {
  const missing = entries.filter((e) => !/\bkind:\s*'(retry|copy|edit|open|install|kill|switch|default)'/.test(e));
  assert.equal(missing.length, 0,
    `${missing.length} fixes without a kind, e.g. ${missing[0]?.slice(0, 70)}`);
});

check('every fix entry resolves its label through t()', () => {
  const literal = entries.filter((e) => /label:\s*'[^']*'/.test(e));
  assert.equal(literal.length, 0,
    `${literal.length} fixes still carry a literal label, e.g. `
    + literal[0]?.match(/label:\s*'[^']*'/)?.[0]);
  const viaT = entries.filter((e) => /label:\s*t\('cookbook\.diag_/.test(e));
  assert.equal(viaT.length, entries.length,
    `${entries.length - viaT.length} labels are not t('cookbook.diag_…')`);
});

check('_diagFixIcon switches on kind and never inspects text', () => {
  const fn = core.slice(core.indexOf('function _diagFixIcon'));
  const body = fn.slice(0, fn.indexOf('\n}'));
  assert.ok(!/toLowerCase|startsWith|includes\(/.test(body),
    '_diagFixIcon still parses the label as text');
  assert.ok(/kind === 'retry'/.test(body), 'the retry branch is gone');
  assert.ok(!/label: '[^']*'\s*\n?\s*\}\)/.test(core),
    'an icon is still derived from a literal label');
});

check('the dedupe compares ids, not display text', () => {
  assert.ok(/!fixes\.some\(\s*f\s*=>\s*f\.id === 'edit_serve'\s*\)/.test(core),
    'the edit_serve dedupe is not id-based');
  assert.ok(!/f\.label === /.test(core), 'a fix is still matched by its label');
  // Every producer of that fix must carry the id too, or the dedupe never fires.
  const producers = (running.match(/label:\s*t\('cookbook\.diag_edit_serve'\)/g) || []).length;
  assert.ok(producers >= 1,
    'cookbookRunning.js pushes an edit_serve fix with no id, so the dedupe cannot match it');
});

check('the interpolated values are quoted strings', () => {
  // A bare `{ flag: --max-num-seqs }` parses as subtraction: node --check passes
  // and the browser throws ReferenceError at runtime.
  const bad = [...core.matchAll(/t\('cookbook\.diag_[a-z_]+',\s*\{([^}]*)\}\)/g)]
    .filter((m) => /:\s*(?!['"])[A-Za-z0-9_.\-]+/.test(m[1]));
  assert.equal(bad.length, 0,
    `unquoted interpolation value in: ${bad[0]?.[0]}`);
});

check('the modules that call t() import it', () => {
  for (const [src, name] of [[core, 'cookbook-diagnosis-core.js'], [running, 'cookbookRunning.js']]) {
    if (!/(?<![\w$])t\('/.test(src)) continue;
    assert.ok(/import\s*\{[^}]*\bt\b[^}]*\}\s*from\s*'\.\/i18n\.js'/.test(src),
      `${name} calls t() without importing it from ./i18n.js`);
  }
});

check('the diagnosis prose is localised too', () => {
  const literalMsg = [...core.matchAll(/message:\s*'([^']{6,})'/g)];
  assert.equal(literalMsg.length, 0,
    `${literalMsg.length} messages still literal, e.g. ${literalMsg[0]?.[1]?.slice(0, 50)}`);
  const literalSug = [...(core + running).matchAll(/suggestion:\s*'([^']{10,})'/g)];
  assert.equal(literalSug.length, 0,
    `${literalSug.length} suggestions still literal, e.g. ${literalSug[0]?.[1]?.slice(0, 50)}`);
});

check('no locale file carries CJK or Cyrillic', () => {
  // A stray translation in the wrong script is invisible in review and renders
  // as garbage. This caught one such string during authoring.
  const dir = path.join(ROOT, 'static/locales');
  for (const lang of readdirSync(dir)) {
    for (const f of readdirSync(path.join(dir, lang)).filter((n) => n.endsWith('.json'))) {
      const raw = readFileSync(path.join(dir, lang, f), 'utf8');
      const m = raw.match(/[Ѐ-ӿ一-鿿]/);
      assert.equal(m, null, `${lang}/${f} contains ${JSON.stringify(m?.[0])}`);
    }
  }
});