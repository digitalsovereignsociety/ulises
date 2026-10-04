// Guard for static/js/compare/icons.js — the EVAL_PROMPTS catalog.
//
// Every other string in this repo can be localised without consequence. A
// `prompt` cannot: it is the benchmark payload, sent to the model verbatim.
// Localising one does not raise an error, does not break a test, and does not
// look wrong on screen — it quietly asks the model a different question and
// fills the scoreboard with numbers that mean nothing.
//
// That is why this file exists rather than a convention comment. It asserts the
// property that is otherwise invisible.
//
// Run: node --test tests/test_compare_prompts.test.mjs
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const ran = [];
const check = (name, fn) => { ran.push(name); return test(name, fn); };

after(() => {
  console.log(`COMPARE_PROMPTS_OK ${ran.length}`);
});

const iconsSrc = readFileSync(path.join(ROOT, 'static/js/compare/icons.js'), 'utf8');
const indexSrc = readFileSync(path.join(ROOT, 'static/js/compare/index.js'), 'utf8');

const { EVAL_PROMPTS } = await import(
  new URL(`file://${path.join(ROOT, 'static/js/compare/icons.js')}`).href
);

const allEntries = Object.entries(EVAL_PROMPTS).flatMap(([mode, list]) =>
  list.map((e) => ({ mode, ...e }))
);

// Locale text, so "is this string in a locale file?" is answerable.
function localeValues(lang) {
  const dir = path.join(ROOT, 'static/locales', lang);
  const out = new Map();
  for (const f of readdirSync(dir).filter((n) => n.endsWith('.json'))) {
    const ns = f.replace(/\.json$/, '');
    const data = JSON.parse(readFileSync(path.join(dir, f), 'utf8'))[ns] || {};
    for (const [k, v] of Object.entries(data)) {
      if (typeof v === 'string' && v.length > 20) out.set(v, `${ns}.${k}`);
    }
  }
  return out;
}
const EN = localeValues('en');
const ES = localeValues('es');

check('the catalog is not empty', () => {
  assert.ok(allEntries.length >= 20, `only ${allEntries.length} entries`);
  assert.ok(allEntries.every((e) => typeof e.prompt === 'string' && e.prompt.length > 0));
});

check('no prompt is reachable from a locale string', () => {
  // A prompt that matches a translated string almost certainly got localised.
  for (const e of allEntries) {
    for (const [value, where] of ES) {
      assert.notEqual(e.prompt, value,
        `${e.mode}/${e.label}: prompt is byte-identical to ${where}`);
    }
    // And the giveaway: a prompt carrying {{vars}} means the interpolate path
    // was pointed at it.
    assert.ok(!e.prompt.includes('{{'), `${e.mode}/${e.label}: prompt has {{}} in it`);
  }
});

check('no prompt, answer, or label reaches t() in the render path', () => {
  // Explicitly: the picker localises the label, never the prompt.
  assert.ok(indexSrc.includes('t(p.labelKey)'), 'label is no longer routed through t()');
  // The lookbehind matters: without it t\( matches the tail of
  // encodeURIComponent( and every prompt site looks like a violation.
  assert.ok(!/(?<![\w$])t\(\s*p\.prompt/.test(indexSrc),
    'something passes p.prompt to t()');
  assert.ok(!/(?<![\w$])t\(\s*e\.prompt/.test(indexSrc),
    'something passes e.prompt to t()');
  assert.ok(!/(?<![\w$])t\(\s*[^)]*\.answer/.test(indexSrc),
    'the expected answer is being localised');
});

check('no locale string in ANY locale matches a prompt prefix', () => {
  // Catches a partial localisation, e.g. only the first sentence was routed.
  //
  // Both locales are checked. An earlier version scanned only EN, which is
  // exactly backwards: a prompt gets translated into the locale you are adding,
  // so es is where a botched one appears. Verified by injecting a Spanish
  // prefix of a real prompt — EN-only scanning let it through.
  for (const [lang, table] of [['en', EN], ['es', ES]]) {
    for (const e of allEntries) {
      for (const [value, where] of table) {
        const head = value.split(/[.:;—]/)[0].trim();
        if (head.length < 25) continue;
        assert.ok(!e.prompt.startsWith(head),
          `${e.mode}/${e.label}: prompt starts with ${where} (${lang}): `
          + JSON.stringify(head));
      }
    }
  }
});

check('no locale string matches a prompt anywhere in its text', () => {
  // The prefix check misses a translation that starts with a short lead-in,
  // e.g. "Calcula: suma de los digitos de 2^100". Compare on the longest run of
  // shared words instead of position.
  const words = (str) => str.toLowerCase().match(/[a-z]{4,}/g) || [];
  for (const [lang, table] of [['en', EN], ['es', ES]]) {
    for (const e of allEntries) {
      const pw = new Set(words(e.prompt));
      for (const [value, where] of table) {
        const vw = words(value);
        // 8 consecutive shared words is far beyond coincidence for these texts.
        let run = 0;
        for (let i = 0; i < vw.length; i++) {
          run = pw.has(vw[i]) ? run + 1 : 0;
          assert.ok(run < 8,
            `${e.mode}/${e.label}: shares ${run} words with ${where} (${lang})`);
        }
      }
    }
  }
});

check('every sub carries a subKey and it resolves in both locales', () => {
  const en = JSON.parse(readFileSync(path.join(ROOT, 'static/locales/en/compare.json'), 'utf8')).compare;
  const es = JSON.parse(readFileSync(path.join(ROOT, 'static/locales/es/compare.json'), 'utf8')).compare;
  const subs = new Set(allEntries.map((e) => e.sub).filter(Boolean));
  assert.equal(subs.size, 17, `expected 17 categories, found ${subs.size}`);
  for (const e of allEntries) {
    assert.ok(e.subKey, `${e.mode}/${e.label}: sub '${e.sub}' has no subKey`);
    assert.ok(e.subKey.startsWith('compare.sub_'), `bad subKey: ${e.subKey}`);
    for (const [lang, d] of [['en', en], ['es', es]]) {
      const leaf = e.subKey.replace(/^compare\./, '');
      assert.ok(d[leaf], `${e.subKey} missing in ${lang}`);
      // en is the source language, so its value must match the raw field.
      if (lang === 'en') {
        assert.equal(d[leaf], e.sub, `${e.subKey} drifted from the source string in en`);
      }
      // Both must be resolved, i.e. not the raw key. es is deliberately NOT
      // required to differ from the English: 'Visual' is the same word in both
      // languages, so a differ-from-source rule would fail on a correct file.
      assert.notEqual(d[leaf], leaf, `${e.subKey} would render as a raw key in ${lang}`);
    }
  }
});

check('grouping still keys on the raw sub, not the translated text', () => {
  // The picker builds groups[sub]; if it ever keyed on t(subKey) the grouping
  // would silently change with the active locale.
  assert.ok(/const sub = p\.sub \|\| 'Other'/.test(indexSrc),
    'the grouping key is no longer the raw p.sub');
  assert.ok(/groups\[sub\]/.test(indexSrc), 'groups is no longer keyed by sub');
  assert.ok(!/groups\[t\(/.test(indexSrc), 'grouping is keyed on a translation');
});

check('labelKey is only on generic descriptors, never on proper nouns', () => {
  // These are the names the prompts themselves use. Translating them would
  // make the menu entry disagree with the payload it sends.
  const PROPER_NOUNS = [
    'Snake', 'Breakout', 'Solar system', 'Matrix rain', 'Fractal tree',
    'Draw SVG', 'Butterfly ASCII', 'Black hole HTML',
  ];
  const labelled = new Map(allEntries.map((e) => [e.label, e]));
  for (const name of PROPER_NOUNS) {
    const e = labelled.get(name);
    assert.ok(e, `${name} is no longer in the catalog`);
    assert.ok(!e.labelKey, `${name} must keep its English name, found labelKey ${e.labelKey}`);
  }
});

check('every labelKey resolves in both locales', () => {
  const en = JSON.parse(readFileSync(path.join(ROOT, 'static/locales/en/compare.json'), 'utf8')).compare;
  const es = JSON.parse(readFileSync(path.join(ROOT, 'static/locales/es/compare.json'), 'utf8')).compare;
  const withKey = allEntries.filter((e) => e.labelKey);
  assert.ok(withKey.length >= 15, `only ${withKey.length} labels have a labelKey`);
  for (const e of withKey) {
    for (const [lang, d] of [['en', en], ['es', es]]) {
      const leaf = e.labelKey.replace(/^compare\./, '');
      assert.ok(d[leaf], `${e.labelKey} missing in ${lang}`);
      if (lang === 'en') {
        assert.equal(d[leaf], e.label, `${e.labelKey} drifted from the source string in en`);
      } else {
        assert.notEqual(d[leaf], e.label, `${e.labelKey} untranslated in es`);
      }
    }
  }
  // Keys are unique: two entries sharing one would silently share a name.
  const keys = withKey.map((e) => e.labelKey);
  assert.equal(new Set(keys).size, keys.length, 'duplicate labelKey');
});

check('the catalog header documents the three-field rule', () => {
  assert.ok(/prompt.*NEVER localised/is.test(iconsSrc), 'header lost the prompt rule');
  assert.ok(/subKey/.test(iconsSrc) && /labelKey/.test(iconsSrc),
    'header lost the sub/label distinction');
});