"""Every data-i18n* key used in the SPA must resolve in every locale.

The repo had no coverage test for the declarative translation layer:
tests/test_locale_files.py checks that `es` mirrors `en`, and
static/js/i18n.test.mjs unit-tests _resolve/_interpolate/t(), but nothing
verified that the keys the HTML actually references exist. A missing key does
not throw — i18n.js:t() returns the key string itself — so a typo silently
renders the raw key in the UI, and a hardcoded English string next to it just
stays English.

That is how the Memory modal's rich input hints ("Title", "Import URL", …)
shipped in English for so long: the locale keys existed, but the spans carried
no data-i18n attribute at all and nothing flagged the gap.

Also guards data-i18n-html values, which are applied as innerHTML: if one loses
its markup it degrades silently, and if it arrives with unbalanced tags it can
break the surrounding layout.
"""
import glob
import json
import os
import re

import pytest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LOCALES_DIR = os.path.join(ROOT, "static", "locales")

# Attribute name -> whether the translated value is applied as innerHTML.
I18N_ATTRS = {
    "data-i18n": False,
    "data-i18n-html": True,
    "data-i18n-placeholder": False,
    "data-i18n-title": False,
    "data-i18n-aria-label": False,
    "data-i18n-value": False,
}

TAG_RE = re.compile(r"<[^>]+>")
VOID_TAGS = {"br", "img", "input", "hr", "meta", "link", "source"}


def _load_merged(lang):
    merged = {}
    for path in sorted(glob.glob(os.path.join(LOCALES_DIR, lang, "*.json"))):
        with open(path, encoding="utf-8") as f:
            data = json.load(f)
        if isinstance(data, dict):
            merged.update(data)
    return merged


def _resolve(data, key):
    cur = data
    for part in key.split("."):
        if not isinstance(cur, dict) or part not in cur:
            return None
        cur = cur[part]
    return cur


def _collect_keys():
    """All (attr, key) pairs used across the static HTML entry points."""
    found = []
    for name in ("index.html", "login.html", "backgrounds.html"):
        path = os.path.join(ROOT, "static", name)
        if not os.path.exists(path):
            continue
        with open(path, encoding="utf-8") as f:
            html = f.read()
        for attr in I18N_ATTRS:
            for key in re.findall(rf'{attr}="([^"]+)"', html):
                found.append((name, attr, key))
    return found


ALL_KEYS = _collect_keys()
LANGS = sorted(
    d for d in os.listdir(LOCALES_DIR)
    if os.path.isdir(os.path.join(LOCALES_DIR, d))
)


def test_collected_keys_are_not_empty():
    """Guard the guard: if the regex ever stops matching, every test below
    would pass vacuously."""
    assert len(ALL_KEYS) > 100, f"only matched {len(ALL_KEYS)} i18n attributes"
    assert len({lang for lang in LANGS}) >= 2, LANGS


@pytest.mark.parametrize("lang", LANGS)
@pytest.mark.parametrize("attr", sorted(I18N_ATTRS))
def test_attribute_keys_resolve_in_locale(attr, lang):
    locale = _load_merged(lang)
    keys = sorted({key for _f, a, key in ALL_KEYS if a == attr})
    if not keys:
        pytest.skip(f"{attr} is unused")
    missing = [k for k in keys if not isinstance(_resolve(locale, k), str)]
    assert not missing, f"{attr} keys missing from {lang}: {missing}"


@pytest.mark.parametrize("lang", LANGS)
def test_html_keys_keep_balanced_markup(lang):
    """data-i18n-html values are injected as innerHTML, so unbalanced tags would
    corrupt the surrounding layout."""
    locale = _load_merged(lang)
    keys = sorted({key for _f, attr, key in ALL_KEYS if attr == "data-i18n-html"})
    problems = []
    for key in keys:
        value = _resolve(locale, key)
        if not isinstance(value, str):
            continue
        stack = []
        for tag in TAG_RE.findall(value):
            name = re.match(r"</?\s*([A-Za-z0-9]+)", tag)
            if not name:
                continue
            name = name.group(1).lower()
            if name in VOID_TAGS:
                continue
            if tag.startswith("</"):
                if not stack or stack[-1] != name:
                    problems.append(f"{key}: unexpected </{name}>")
                    break
                stack.pop()
            else:
                stack.append(name)
        else:
            if stack:
                problems.append(f"{key}: unclosed {stack}")
    assert not problems, f"malformed data-i18n-html values in {lang}: {problems}"


def test_keys_used_in_html_are_translatable_placeholders():
    """A data-i18n-html value must actually contain markup, otherwise it should
    be a plain data-i18n key — that mismatch is how hardcoded English hides."""
    locale = _load_merged("en")
    keys = sorted({key for _f, attr, key in ALL_KEYS if attr == "data-i18n-html"})
    without_markup = []
    for key in keys:
        value = _resolve(locale, key)
        if isinstance(value, str) and not TAG_RE.search(value):
            without_markup.append(key)
    assert not without_markup, (
        "these data-i18n-html values hold no markup; use data-i18n instead: "
        f"{without_markup}"
    )


# --------------------------------------------------------------------------
# Keys referenced from JavaScript via t('...') / tn('...')
# --------------------------------------------------------------------------

# t('key') / t("key") / tn('key', n) — skip template literals (dynamic keys)
# and any call whose first argument is not a plain string literal.
T_CALL_RE = re.compile(r"\b(?:t|tn)\(\s*'([A-Za-z0-9_]+(?:\.[A-Za-z0-9_]+)+)'")
# Modules live in static/js/ (recursively), but top-level static/*.js — app.js
# above all — call t() too and were nearly missed by a static/js-only scan.
JS_ROOTS = [os.path.join(ROOT, "static", "js")]
STATIC_TOP = os.path.join(ROOT, "static")


def _js_files():
    for base in JS_ROOTS:
        for dirpath, dirnames, filenames in os.walk(base):
            dirnames[:] = [d for d in dirnames if d not in ("node_modules", "lib")]
            for name in sorted(filenames):
                if name.endswith((".js", ".mjs")):
                    yield os.path.join(dirpath, name)
    for name in sorted(os.listdir(STATIC_TOP)):
        path = os.path.join(STATIC_TOP, name)
        if os.path.isfile(path) and name.endswith((".js", ".mjs")):
            yield path


def _collect_js_keys():
    found = []
    for path in _js_files():
        rel = os.path.relpath(path, ROOT)
        try:
            with open(path, encoding="utf-8") as f:
                source = f.read()
        except (OSError, UnicodeDecodeError):
            continue
        # The test file itself contains these keys as fixtures.
        if os.path.basename(path) == "test_i18n_html_coverage.py":
            continue
        for key in T_CALL_RE.findall(source):
            found.append((rel, key))
    return found


JS_KEYS = _collect_js_keys()


def test_js_keys_were_collected():
    """Guard the guard: a regex change must not silently reduce coverage to 0."""
    assert len(JS_KEYS) > 500, f"only matched {len(JS_KEYS)} t() keys in JS"
    assert len({k for _f, k in JS_KEYS}) > 300, "suspiciously few distinct keys"


@pytest.mark.parametrize("lang", LANGS)
def test_js_t_call_keys_resolve_in_locale(lang):
    """Ratchet, not a cliff.

    655 t() keys across 35 namespaces have no entry in any locale file — the
    multilang commit (95311e9) wrapped literals in t() without adding the
    strings, and test_locale_files.py only checks that es mirrors en, which both
    satisfied while equally incomplete. t() therefore rendered the raw key in the
    UI (now readable prose, see i18n.js, but still untranslated).

    Those known gaps are recorded in tests/i18n_missing_keys_baseline.txt, and
    this test fails only on keys MISSING FROM that baseline. That way the debt is
    visible and cannot silently grow, while translating a namespace shrinks the
    baseline instead of leaving the suite permanently red.

    To close part of the debt: add the string to both en and es, then delete its
    line from the baseline. A baseline entry that no longer misses is not a
    failure — the ratchet only cares about regressions — but
    test_i18n_baseline_has_no_stale_entries fails to remind you to prune it.
    """
    locale = _load_merged(lang)
    by_key = {}
    for rel, key in JS_KEYS:
        by_key.setdefault(key, set()).add(rel)
    missing = {k for k in by_key if not isinstance(_resolve(locale, k), str)}

    baseline = set(_load_baseline())
    new_missing = sorted(missing - baseline)
    detail = "\n".join(
        f"  {k} (e.g. {sorted(by_key[k])[0]})" for k in new_missing
    )
    assert not new_missing, (
        f"{len(new_missing)} NEW t() key(s) missing from {lang}, absent from the "
        f"baseline — add them to en and es, or record them:\n{detail}"
    )


def _load_baseline():
    path = os.path.join(ROOT, "tests", "i18n_missing_keys_baseline.txt")
    with open(path, encoding="utf-8") as f:
        return {ln.strip() for ln in f if ln.strip() and not ln.startswith("#")}


@pytest.mark.parametrize("lang", LANGS)
def test_i18n_baseline_has_no_stale_entries(lang):
    """Each baseline line should still be an unresolved key. Once a key is
    translated this fires, which is the signal to delete its line."""
    locale = _load_merged(lang)
    by_key = {}
    for rel, key in JS_KEYS:
        by_key.setdefault(key, set()).add(rel)
    missing = {k for k in by_key if not isinstance(_resolve(locale, k), str)}
    stale = sorted(set(_load_baseline()) - missing)
    assert not stale, (
        f"{len(stale)} baseline entries are now translated in {lang} — delete "
        f"these lines from tests/i18n_missing_keys_baseline.txt:\n  "
        + "\n  ".join(stale)
    )


@pytest.mark.parametrize("lang", LANGS)
def test_js_t_call_interpolation_vars_exist_in_locale(lang):
    """A t('key', {a: 1}) call whose locale string has no {a} placeholder means
    the translation silently drops the value; the reverse leaves a raw {a}."""
    locale = _load_merged(lang)
    problems = []
    for path in _js_files():
        with open(path, encoding="utf-8") as f:
            source = f.read()
            # t('key', { name: x, other: y }) — only the simple object form.
            for m in re.finditer(
                r"\bt\(\s*'([A-Za-z0-9_.]+)'\s*,\s*\{([^}]*)\}", source
            ):
                key, obj = m.group(1), m.group(2)
                value = _resolve(locale, key)
                if not isinstance(value, str):
                    continue
                passed = {
                    p.split(":")[0].strip()
                    for p in obj.split(",")
                    if p.strip() and not p.strip().startswith("...")
                }
                expected = set(re.findall(r"\{\{\s*(\w+)\s*\}\}", value))
                if passed != expected:
                    problems.append(
                        f"{os.path.relpath(path, ROOT)}:{key} "
                        f"passes {sorted(passed)} but {lang} expects {sorted(expected)}"
                    )
    assert not problems, "interpolation mismatch:\n  " + "\n  ".join(problems)

