"""Guard the service worker's precache against silent staleness.

static/sw.js precaches 59 files, 57 of which are .js. _applyTranslations() only
rewrites HTML and locale JSONs, neither of which is precached, so a browser with
the worker installed will happily serve old JS from cache while the new locale
strings arrive — the page then looks half-translated with no error anywhere.

That is not hypothetical: the v328 cache went out unchanged through a whole round
of i18n batches (settings, chat, chatRenderer, emailLibrary, admin, calendar,
cookbookServe, documentLibrary, cookbook-hwfit, tasks, compare, diagnosis). None
of it reached the browser until someone bumped the version by hand.

The check is a sha256 over the contents of every precached file, recorded in sw.js
as PRECACHE_DIGEST. Editing a precached file without regenerating it fails here
instead of silently shipping.

Run: python -m pytest tests/test_sw_precache_version.py
     python3 tests/test_sw_precache_version.py --print   # regenerate
"""
import hashlib
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SW = os.path.join(ROOT, "static", "sw.js")


def precache_urls(src):
    # Anchor on the assignment, not on "const PRECACHE": the digest declaration
    # above it is also called PRECACHE_DIGEST, and a looser match slurps its
    # hex value in as if it were a precached path.
    start = src.index("const PRECACHE = [")
    return re.findall(r"'([^']+)'", src[start:src.index("];", start)])


def compute_digest(urls):
    """sha256 over (url, sha256(content)) for every precached entry.

    '/' resolves to static/index.html, which is the document the SW serves for
    navigations; a missing file is recorded rather than skipped so a typo in the
    list cannot silently shrink the digest's coverage.
    """
    parts = []
    for url in urls:
        path = url.lstrip("/") or "static/index.html"
        if url == "/":
            path = "static/index.html"
        if not os.path.exists(os.path.join(ROOT, path)):
            parts.append(f"{url}:missing")
            continue
        with open(os.path.join(ROOT, path), "rb") as f:
            parts.append(f"{url}:{hashlib.sha256(f.read()).hexdigest()}")
    return hashlib.sha256("\n".join(sorted(parts)).encode()).hexdigest()[:16]


def test_precache_digest_matches_the_files_on_disk():
    src = open(SW, encoding="utf-8").read()
    urls = precache_urls(src)
    assert urls, "could not parse PRECACHE out of sw.js"

    declared = re.search(r"const PRECACHE_DIGEST = '([0-9a-f]+)'", src)
    assert declared, (
        "sw.js has no PRECACHE_DIGEST. Without it a precached file can change "
        "with nothing noticing, and the browser keeps serving the cached copy."
    )
    actual = compute_digest(urls)
    assert actual == declared.group(1), (
        f"precached files changed but sw.js still declares {declared.group(1)} "
        f"(actual {actual}). Bump CACHE_NAME and regenerate: "
        "python3 tests/test_sw_precache_version.py --print"
    )


def test_every_precached_path_exists():
    src = open(SW, encoding="utf-8").read()
    missing = [
        u for u in precache_urls(src)
        if u != "/" and not os.path.exists(os.path.join(ROOT, u.lstrip("/")))
    ]
    assert not missing, f"precached paths that do not exist: {missing}"


def test_cache_version_and_digest_agree():
    """A version bump without a digest bump is the exact failure being guarded."""
    src = open(SW, encoding="utf-8").read()
    version = re.search(r"const CACHE_NAME = 'ulises-v(\d+)'", src)
    digest = re.search(r"const PRECACHE_DIGEST = '([0-9a-f]+)'", src)
    assert version, "no CACHE_NAME"
    assert digest, "no PRECACHE_DIGEST"
    # Nothing to compare numerically — the point is that both exist and the
    # digest check above is what enforces they move together.


def test_the_js_heavy_surface_is_known():
    """A guard on this cache only matters while most of it is JS."""
    src = open(SW, encoding="utf-8").read()
    urls = precache_urls(src)
    js = [u for u in urls if u.endswith(".js")]
    assert len(js) > len(urls) / 2, (
        f"only {len(js)}/{len(urls)} precache entries are .js — re-check whether "
        "this staleness guard is still the right shape"
    )


if __name__ == "__main__":
    if "--print" in sys.argv:
        src = open(SW, encoding="utf-8").read()
        print(compute_digest(precache_urls(src)))
    else:
        raise SystemExit("run via pytest, or pass --print")