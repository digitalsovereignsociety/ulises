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
