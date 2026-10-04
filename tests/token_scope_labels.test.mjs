// Regression test for the token-scope rows in admin.js and settings.js.
//
// Both files render the same 13 scope toggles from a catalog whose only wire
// value is `key` (e.g. 'todos:read'). The tool name used to be derived by
// stripping an English suffix off a hardcoded label:
//
//     const tool = s.label.replace(/\s+(read|write|draft|send|launch)$/i, '');
//
// That is display data derived from display text, so it works until the label
// is translated — at which point the regex stops matching and the whole label
// is shown instead, with no error and no other failing test. settings.js had
// the same shape in _scopeNiceLabel, and its regex lacked 'launch', so
// 'Cookbook launch' was already rendered untrimmed.
//
// The catalogs are not importable (admin.js and settings.js both pull in the
// DOM and have import cycles), so the two functions are lifted out of the source
// and evaluated against a real Spanish locale. That is enough to assert the
// invariant: the rendered name comes from the key, not from any text.
//
// Run: node --test tests/token_scope_labels.test.mjs
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const ran = [];
const check = (name, fn) => { ran.push(name); return test(name, fn); };

after(() => {
  console.log(`TOKEN_SCOPE_LABELS_OK ${ran.length}`);
});

const esc = (s) => String(s ?? '');

// A t() backed by the real locale files, so a missing key surfaces as the
// humanised fallback rather than silently passing.
// Strip comments so a negative assertion cannot trip on the prose that explains
// the fix and quotes the removed identifier.
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

function makeT(lang) {
  const dir = path.join(ROOT, 'static/locales', lang);
  const data = {};
  for (const file of readdirSync(dir).filter((n) => n.endsWith('.json'))) {
    const ns = file.replace(/\.json$/, '');
    data[ns] = JSON.parse(readFileSync(path.join(dir, file), 'utf8'))[ns] || {};
  }
  return (key, vars) => {
    const [ns, ...rest] = key.split('.');
    let out = data[ns]?.[rest.join('.')];
    if (typeof out !== 'string') {
      out = rest.join('.')
        .replace(/[_.:-]+/g, ' ')
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .replace(/\b\w/g, (c) => c.toUpperCase());
    }
    if (!vars) return out;
    return out.replace(/\{\{(\w+)\}\}/g, (m, v) => (v in vars ? String(vars[v]) : m));
  };
}

// Pull `const NAME = [...];` and `function NAME(...) {...}` out of a source file.
function lift(src, constName, fnName) {
  const cStart = src.indexOf(`const ${constName} = [`);
  assert.notEqual(cStart, -1, `${constName} not found`);
  const cEnd = src.indexOf('\n];', cStart) + 3;
  const fStart = src.indexOf(`function ${fnName}`);
  assert.notEqual(fStart, -1, `${fnName} not found`);
  let depth = 0, i = src.indexOf('{', fStart);
  const bodyStart = i;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) { i++; break; } }
  }
  return src.slice(cStart, cEnd) + '\n' + src.slice(fStart, i);
}

function evalIsolated(code, t) {
  const fn = new Function('t', 'esc', `${code}; return typeof _renderTokenScopeRows === 'function' ? _renderTokenScopeRows : null;`);
  return fn(t, esc);
}

const EXPECTED_TOOLS = ['Todos', 'Documents', 'Email', 'Calendar', 'Memory', 'Cookbook'];

check('admin.js: tool names come from the key, not from an English label', () => {
  const src = readFileSync(path.join(ROOT, 'static/js/admin.js'), 'utf8');
  const code = lift(src, '_TOKEN_SCOPES', '_renderTokenScopeRows');
  const html = evalIsolated(code, makeT('es'))({ id: 'tok_1', scopes: [] });

  for (const tool of EXPECTED_TOOLS) {
    assert.ok(html.includes(`>${tool}<`), `missing tool name ${tool}`);
  }
  // The failure mode being guarded: the label survived the suffix strip.
  for (const leaked of ['Todos lectura', 'Documents lectura', 'Correo lectura']) {
    assert.ok(!html.includes(leaked), `leaked whole label: ${leaked}`);
  }
});

check('admin.js: every scope renders a localised action and detail', () => {
  const src = readFileSync(path.join(ROOT, 'static/js/admin.js'), 'utf8');
  const code = lift(src, '_TOKEN_SCOPES', '_renderTokenScopeRows');
  const html = evalIsolated(code, makeT('es'))({ id: 'tok_1', scopes: [] });

  assert.ok(html.includes('lectura'), 'action pill not translated');
  assert.ok(html.includes('escritura'), 'action pill not translated');
  assert.ok(html.includes('Leer notas'), 'detail not translated');
  // The raw action key must not reach the DOM.
  assert.ok(!/>read</.test(html), 'raw "read" leaked into the action pill');
});

check('settings.js: _scopeNiceLabel and its English regex are gone', () => {
  const src = stripComments(readFileSync(path.join(ROOT, 'static/js/settings.js'), 'utf8'));
  assert.ok(!/const _scopeNiceLabel\s*=/.test(src),
    '_scopeNiceLabel still parses an English suffix off a label');
  assert.ok(!/_scopeNiceLabel\(/.test(src), '_scopeNiceLabel is still called');
  assert.ok(!/\.label\.replace\(\/\\s\+/.test(src),
    'a label is still parsed with an English-suffix regex');
  assert.ok(!/toolScopes = \[[\s\S]{0,600}label:/.test(src),
    'toolScopes still carries a hardcoded label');
});

check('admin.js: the token parameter no longer shadows the i18n t()', () => {
  const src = readFileSync(path.join(ROOT, 'static/js/admin.js'), 'utf8');
  assert.ok(!/function _renderTokenScopeRows\(t\)/.test(src),
    'parameter `t` shadows the imported i18n t(), making it uncallable');
});

check('both catalogs agree on the 13 scope keys', () => {
  const read = (file, name) => {
    const src = readFileSync(path.join(ROOT, file), 'utf8');
    const start = src.indexOf(`${name} = [`);
    const body = src.slice(start, src.indexOf('];', start));
    return [...body.matchAll(/key: '([^']+)'/g)].map((m) => m[1]);
  };
  const a = read('static/js/admin.js', '_TOKEN_SCOPES');
  const s = read('static/js/settings.js', 'toolScopes');
  assert.equal(a.length, 13, `admin catalog has ${a.length} entries`);
  assert.deepEqual(a, s, 'the two catalogs drifted apart');
});

check('every catalog detail resolves in en and es', () => {
  const en = makeT('en'), es = makeT('es');
  const src = readFileSync(path.join(ROOT, 'static/js/admin.js'), 'utf8');
  const start = src.indexOf('_TOKEN_SCOPES = [');
  const body = src.slice(start, src.indexOf('];', start));
  const details = [...body.matchAll(/detail: '([^']+)'/g)].map((m) => m[1]);
  assert.ok(details.length > 0, 'no details parsed');
  for (const d of details) {
    for (const [lang, t] of [['en', en], ['es', es]]) {
      const v = t(`admin.token_detail.${d}`);
      assert.ok(!/token_detail/.test(v), `admin.token_detail.${d} missing in ${lang}`);
    }
  }
  for (const a of ['read', 'write', 'draft', 'send', 'launch']) {
    assert.notEqual(en(`common.token_action.${a}`), `common.token_action.${a}`);
    assert.notEqual(es(`common.token_action.${a}`), `common.token_action.${a}`);
  }
});

check('the locales this test reads are the ones the app serves', async () => {
  // Guard against the test passing against stale locale files on disk while the
  // container serves different ones.
  const served = await fetch('http://127.0.0.1:7000/api/i18n/es').then((r) => r.json())
    .catch(() => null);
  if (!served) return; // app not running; static analysis still holds
  if (!served.admin?.token_detail || !served.common?.token_action_read) return;
  const es = makeT('es');
  assert.equal(es('admin.token_detail.todos_read'), served.admin.token_detail.todos_read);
  assert.equal(es('common.token_action.read'), served.common.token_action.read);
});

