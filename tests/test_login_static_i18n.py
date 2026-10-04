"""Static checks on static/login.html.

The login page renders a visible submit button long before its i18n bootstrap
runs: the inline script only rewrites the label inside setMode(), and setMode()
is reached after `await window.__onI18nReady`. Anything hardcoded in the markup
for that button is therefore on screen in English for as long as the locale
fetch takes.

The password-visibility toggle is the other half: it wrote a raw English string
into aria-label on every click and relied on a later reapply() to fix it.
"""
import re
from pathlib import Path

import pytest

LOGIN = Path(__file__).resolve().parents[1] / "static" / "login.html"
SRC = LOGIN.read_text(encoding="utf-8")
# Inline scripts contain template expressions and SVG; only markup is in scope
# for the data-i18n assertions.
MARKUP = re.sub(r"<script\b.*?</script>", "", SRC, flags=re.S)


def test_submit_button_carries_a_data_i18n_key():
    """The button is visible from first paint, so its label must not be literal."""
    m = re.search(r"<button[^>]*\bid=\"submitBtn\"[^>]*>", MARKUP)
    assert m, "submit button not found in login.html"
    tag = m.group(0)
    assert "data-i18n=" in tag, (
        "submitBtn has no data-i18n; setMode() only rewrites it after the i18n "
        f"readiness promise resolves, so the literal shows first: {tag}"
    )
    assert re.search(r'data-i18n="auth\.[a-z_]+"', tag), (
        f"submitBtn data-i18n must name an auth.* key: {tag}"
    )


def test_password_toggle_does_not_write_english_into_aria_label():
    """setAttribute with a literal means a screen reader hears English."""
    # Capture the argument and inspect it. A negative lookahead after \s* is
    # unreliable here: \s* backtracks and the assertion then reads the space
    # instead of the _t( that follows it.
    args = re.findall(r"setAttribute\(\s*'aria-label'\s*,\s*([^;]{0,120})", SRC)
    assert args, "aria-label is no longer set in login.html; update this test"
    for expr in args:
        assert expr.strip().startswith("_t("), (
            f"aria-label set from a literal, not through _t(): {expr.strip()!r}"
        )
    # The toggle must still carry the keys so a language switch re-translates it.
    assert "'auth.hide_password'" in SRC and "'auth.show_password'" in SRC


def test_toggle_block_is_hidden_until_setmode_runs():
    """Guards the reasoning behind marking these two as cosmetic-only."""
    m = re.search(r'<div class="toggle" id="toggleArea"([^>]*)>', MARKUP)
    assert m, "toggleArea not found"
    assert "display:none" in m.group(1).replace(" ", ""), (
        "toggleArea no longer starts hidden, so its literal text WOULD flash: "
        f"{m.group(1)}"
    )


@pytest.mark.parametrize("attr", ["data-i18n", "data-i18n-title", "data-i18n-aria-label"])
def test_login_markup_uses_supported_data_i18n_spellings(attr):
    """Guard the scan footgun: `data-i18n-title` contains `title=`, so a naive
    search for title= reports the key name as if it were the visible text."""
    for m in re.finditer(rf"\b{attr}=\"([^\"]+)\"", MARKUP):
        value = m.group(1)
        assert "{{" not in value, f"unrendered template in {attr}: {value}"
        assert not value.startswith("{{"), f"jinja placeholder in {attr}: {value}"