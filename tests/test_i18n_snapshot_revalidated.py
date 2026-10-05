"""The preloaded locale snapshot must never be the final word.

app.py inlines window.__preloadedLocale / __preloadedFallback into the HTML it
serves, to avoid an English flash before the locale fetch lands. That HTML is
precached by the service worker ('/' is in PRECACHE) and served cache-first with
a background refresh, so a cached copy of index.html carries whatever keys it had
when it was cached.

init() used to trust that snapshot outright. The visible symptom was a console
full of "missing translation" for keys that were present on the server — most of
them added minutes earlier — while curl on /api/i18n returned every one of them.
init() now hydrates from the snapshot and then revalidates against the API.
"""
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
I18N = ROOT / "static" / "js" / "i18n.js"
SW = ROOT / "static" / "sw.js"

src = I18N.read_text(encoding="utf-8")
init = src[src.index("export async function init()"):]
init = init[: init.index("export function getCurrentLang")]


def test_init_revalidates_the_preloaded_snapshot():
    # The snapshot branch must be followed by a live fetch of the active language.
    assert "await _loadLocale(_lang)" in init.split("delete window.__preloadedLang")[-1], (
        "init() still trusts the inlined snapshot without revalidating it"
    )
    assert "_locale = fresh" in init, "the fresh locale is fetched but never assigned"


def test_revalidation_is_guarded_so_offline_still_works():
    block = init[init.index("await _loadLocale(_lang)"):]
    block = block[: block.index("catch")] if "catch" in block else block
    assert "catch" in init[init.index("try {"):], (
        "the revalidation fetch is unguarded, so an offline load loses the snapshot"
    )


def test_the_html_snapshot_is_precached_which_is_why_this_matters():
    sw = SW.read_text(encoding="utf-8")
    block = sw[sw.index("const PRECACHE = [") : sw.index("];", sw.index("const PRECACHE = ["))]
    assert "'/'" in block, (
        "index.html is no longer precached; if that is deliberate, this whole "
        "staleness path is gone and these tests should be revisited"
    )


def test_every_key_reported_missing_by_the_console_exists():
    """The three keys the browser reported that were genuinely absent."""
    import json
    for ns, key in (("modalSnap", "resize_docked"), ("modalSnap", "resize_split"),
                    ("modalManager", "minimize")):
        for lang in ("en", "es"):
            f = ROOT / "static" / "locales" / lang / f"{ns}.json"
            assert f.exists(), f"{lang}/{ns}.json missing"
            assert key in json.loads(f.read_text(encoding="utf-8"))[ns], f"{ns}.{key} missing in {lang}"


def test_spa_root_navigation_is_network_first():
    """The shell must not be served stale.

    /  was stale-while-revalidate: the cached shell answered immediately and
    refreshed in the background, so the app booted from a build of unknown age.
    Neither an HTTP cache clear nor a hard reload fixed it — the service worker's
    Cache Storage is a separate store and stays registered — which made deploys
    invisible and left the console full of "missing translation" for keys that
    were present on the server.
    """
    sw = SW.read_text(encoding="utf-8")
    nav = sw[sw.index("if (e.request.mode === 'navigate'"):]
    nav = nav[: nav.index("\n  }")]
    assert "cache.match('/')" in nav, "the offline fallback was removed entirely"
    # The cached response must only be reachable from the catch, never returned
    # ahead of the network.
    assert "return cached || network" not in nav, (
        "navigation is still stale-while-revalidate: it returns the cached shell "
        "before trying the network"
    )
    assert nav.index("fetch(e.request)") < nav.rindex("catch("), (
        "the network fetch must come before the cache fallback"
    )
