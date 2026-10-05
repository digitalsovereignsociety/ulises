// Enum keys that must never be localised.
//
// The repo has a recurring shape: a string that is simultaneously a lookup key
// and the thing a human reads. Two instances already bit us and were fixed by
// hand (token scope names in admin.js/settings.js, the compare eval catalog's
// raw sub/label). A third was found in chat.js: a message variant's `label`
// indexes an icon map and is compared literally to pick a CSS class, so
// translating it yields the literal string "undefined" in the DOM and silently
// drops an icon — with no error and no other failing test.
//
// These assertions exist because the mistake is cheap to make and invisible on
// failure. Run: node --test tests/enum_keys_not_localised.test.mjs
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const ran = [];
const check = (name, fn) => { ran.push(name); return test(name, fn); };

after(() => { console.log(`ENUM_KEYS_OK ${ran.length}`); });

const chat = readFileSync(path.join(ROOT, 'static/js/chat.js'), 'utf8');
const admin = readFileSync(path.join(ROOT, 'static/js/admin.js'), 'utf8');
const settings = readFileSync(path.join(ROOT, 'static/js/settings.js'), 'utf8');

check('variant labels stay enum keys, and the icon map still resolves', () => {
  const map = chat.match(/_VARIANT_ICONS\s*=\s*\{([^}]+)\}/);
  assert.ok(map, '_VARIANT_ICONS map not found');
  const kinds = [...map[1].matchAll(/(\w+)\s*:/g)].map((m) => m[1]);
  assert.deepEqual(kinds, ['regen', 'shorter', 'simpler', 'original'],
    'the variant kinds changed; update this test');

  // Every kind a variant can be created with must exist in the map, or the tag
  // renders the fallback (or "undefined") instead of its icon.
  for (const m of chat.matchAll(/label:\s*'([^']+)'/g)) {
    assert.ok(kinds.includes(m[1]),
      `variant created with label '${m[1]}', which is not in _VARIANT_ICONS`);
  }
});

check('the icon lookup is never fed through t()', () => {
  assert.ok(!/(?<![\w$])t\(\s*(?:_VARIANT_ICONS|curVariant\?\.label)/.test(chat),
    'a variant label or icon map is being passed to t()');
  // The enum key reaches t() only via the explicit kind->locale map.
  assert.ok(/_VARIANT_KIND_KEYS/.test(chat),
    'no kind->locale map; the icon has no translatable name');
});

check('the scissors class is still keyed on the literal enum value', () => {
  assert.ok(/label\s*===\s*'shorter'/.test(chat),
    "the .variant-tag-scissors check no longer compares the enum literal");
  assert.ok(!/label\s*===\s*t\(/.test(chat),
    'a CSS class is being chosen from a translation');
});

check('the variant glyph carries an accessible name', () => {
  // Icon-only indicators are unreadable to a screen reader.
  assert.ok(/tagLabel\.setAttribute\(\s*'aria-label'/.test(chat),
    'the variant tag has no aria-label');
  assert.ok(/tagLabel\.title\s*=/.test(chat), 'the variant tag has no title tooltip');
});

check('token scope catalogs expose no display label to parse', () => {
  for (const [src, name] of [[admin, '_TOKEN_SCOPES'], [settings, 'toolScopes']]) {
    const start = src.indexOf(`${name} = [`);
    assert.notEqual(start, -1, `${name} not found`);
    const body = src.slice(start, src.indexOf('];', start));
    assert.ok(!/\blabel:/.test(body),
      `${name} carries a hardcoded label again; derive display names from key`);
  }
  // And no display string is reconstructed by stripping words off another one.
  assert.ok(!/\.label\.replace\(/.test(admin + settings),
    'a label is being parsed to build a display name');
});

check('the compare eval catalog keeps prompts out of t()', () => {
  const icons = readFileSync(path.join(ROOT, 'static/js/compare/icons.js'), 'utf8');
  const index = readFileSync(path.join(ROOT, 'static/js/compare/index.js'), 'utf8');
  assert.ok(!/(?<![\w$])t\(\s*[pe]\.prompt/.test(index),
    'a compare prompt is being localised');
  assert.ok(!/prompt:\s*t\(/.test(icons), 'a prompt is built from t()');
});