"""Guard on data-i18n-html in the static HTML.

A data-i18n-html element has its innerHTML replaced wholesale, by _applyTranslations
in static/js/i18n.js. That runs on init and again on every setLanguage() call. So
anything living inside such an element is destroyed and rebuilt.

That is fine for markup. It is not fine for an element JS holds a handle on:

  - an id looked up by el('...') / getElementById, or
  - a node with a directly-attached listener.

One real instance: the reminder channel hint wraps
<a id="set-reminders-open-integrations">, whose click handler is attached in
settings.js with a dataset.wired idempotency guard. Using data-i18n-html on the
parent would have recreated the anchor on every language switch, leaving the link
dead. The test on index.html had no way to see that: it checks that the key
resolves and that the markup is balanced.

Delegated handlers are unaffected — admin.js resolves [data-go-settings-tab] with
e.target.closest(...) on a document-level listener — so an anchor carrying only
that attribute is fine. This check is scoped to ids, which is the tractable case
and the one that actually bit.
"""
import re
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
HTML_FILES = sorted((ROOT / "static").glob("*.html"))
JS_FILES = sorted((ROOT / "static" / "js").rglob("*.js"))

# Ids that JS resolves by name. If one of these appears inside the innerHTML of a
# data-i18n-html element, that element is being rebuilt out from under the code
# that holds the reference.
_LOOKUP = re.compile(r"""\b(?:el|byId|qs|getElementById)\s*\(\s*['"]([\w-]+)['"]""")
_DATAV = re.compile(r"data-i18n-html\s*=\s*\"([\w.-]+)\"")


def _js_lookup_ids():
    ids = set()
    for path in JS_FILES:
        if path.name == "i18n.js":
            continue
        ids |= set(_LOOKUP.findall(path.read_text(encoding="utf-8", errors="replace")))
    return ids


def _inner_html_of_data_i18n_html(src):
    """Yield (key, inner_html) for elements carrying data-i18n-html.

    Scoped by a regex over one element at a time rather than a full parse: the
    only thing that matters is which ids sit inside the replaced subtree.
    """
    for m in re.finditer(r"<(\w[\w-]*)([^>]*?)data-i18n-html=\"[\w.-]+\"[^>]*>(.*?)</\1>", src, re.S):
        yield m.group(3)


@pytest.fixture(scope="module")
def js_ids():
    return _js_lookup_ids()


def test_html_files_found():
    assert HTML_FILES, "no static/*.html found; the scan would silently pass"


def test_no_data_i18n_html_rebuilds_a_js_referenced_id(js_ids):
    offenders = []
    for path in HTML_FILES:
        src = path.read_text(encoding="utf-8")
        for inner in _inner_html_of_data_i18n_html(src):
            for found in re.finditer(r"\bid\s*=\s*[\"']([\w-]+)[\"']", inner):
                if found.group(1) in js_ids:
                    offenders.append((path.name, found.group(1)))
    assert not offenders, (
        "these ids are looked up by JS but live inside a data-i18n-html subtree, "
        "so _applyTranslations replaces the node and the reference goes stale: "
        f"{offenders}"
    )


def test_the_known_offender_uses_a_span_not_data_i18n_html():
    """Regression pin for the specific case, so it cannot come back unnoticed."""
    src = (ROOT / "static" / "index.html").read_text(encoding="utf-8")
    assert 'id="set-reminders-open-integrations"' in src, "the anchor is gone entirely"
    for inner in _inner_html_of_data_i18n_html(src):
        assert "set-reminders-open-integrations" not in inner, (
            "the reminder Integrations anchor is inside a data-i18n-html subtree "
            "again; its click handler is attached directly in settings.js"
        )
    # And the lead-in sentence around it is still localised.
    assert 'data-i18n="settings.index_configure_intro"' in src
    assert 'data-i18n="settings.nav.integrations"' in src


def _resolve(data, key):
    """Walk nested dicts, the way core/translations and the JS loader do.

    A first version of this test split the key once and looked the remainder up
    as a flat leaf. That is wrong: most namespaces store keys flat
    ("sub_featured"), but some nest ("add_skill" -> {"how_placeholder": ...}).
    Assuming flat made this test report memory.add_skill.how_placeholder as
    missing when it resolves fine, which is exactly the kind of invented bug a
    test should never introduce.
    """
    cur = data
    for part in key.split("."):
        if not isinstance(cur, dict) or part not in cur:
            return None
        cur = cur[part]
    return cur


def test_data_i18n_html_keys_exist_in_every_locale():
    import json
    for path in HTML_FILES:
        src = path.read_text(encoding="utf-8")
        for key in set(_DATAV.findall(src)):
            ns = key.split(".", 1)[0]
            for lang in ("en", "es"):
                f = ROOT / "static" / "locales" / lang / f"{ns}.json"
                assert f.exists(), f"{lang}/{ns}.json missing for {key}"
                data = json.loads(f.read_text(encoding="utf-8"))
                val = _resolve(data, key)
                assert isinstance(val, str), f"{key} missing in {lang}"
                # The rendered value must carry the same inline markup the
                # English source did, or a <code>/<a> disappears at runtime.
                after = src.split(f'data-i18n-html="{key}"', 1)[1][:900]
                for tag in ("<code", "<a "):
                    if tag in after:
                        assert tag in val, f"{key} lost {tag} in {lang}"