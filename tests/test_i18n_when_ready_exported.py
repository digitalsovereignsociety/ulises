"""Every named import from i18n.js must exist.

static/js/modalSnap.js and modalManager.js started calling whenReady() to defer
their title assignments until the locale resolves. The export was never added —
the script that was meant to add it died on an earlier assertion — so both files
imported a symbol that did not exist and called it. node --check passed, the
module-level smoke test passed, and pytest was green, because neither loads
those modules under the stub in a way that reaches the IIFE.

This asserts the export exists, and that every named import from i18n.js across
static/js resolves to an export of the module. Reading the export list out of the
source is crude but it fails loudly on the actual mistake, which is a name that
was never defined.
"""
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
I18N = ROOT / "static" / "js" / "i18n.js"
JS = ROOT / "static" / "js"

src = I18N.read_text(encoding="utf-8")
exports = set(re.findall(r"export\s+(?:async\s+)?function\s+([A-Za-z_$][\w$]*)", src))
exports |= set(re.findall(r"export\s+(?:const|let|class)\s+([A-Za-z_$][\w$]*)", src))
exports |= set(re.findall(r"export\s*\{([^}]*)\}", src) and
               [n.strip().split(" as ")[-1].strip()
                for group in re.findall(r"export\s*\{([^}]*)\}", src)
                for n in group.split(",") if n.strip()])
exports |= {"default"}
assert exports, "no exports found in i18n.js — the regex needs updating"


def test_when_ready_is_exported():
    assert "whenReady" in exports, (
        "i18n.js does not export whenReady(), but static/js/modalSnap.js and "
        "static/js/modalManager.js import and call it"
    )


def test_when_ready_does_not_trigger_init():
    body = src[src.index("export function whenReady()"):]
    body = body[: body.index("\n}")]
    assert "init()" not in body, (
        "whenReady() must not call init(): two of its callers are IIFEs that run "
        "at import time, and init() reaches navigator before the test DOM stub has "
        "installed it, which throws on node 24 where navigator is read-only"
    )
    assert "_READY_MAX_MS" in body, "the readiness poll must be bounded"


def test_every_named_import_from_i18n_resolves():
    missing = []
    for path in JS.rglob("*.js"):
        text = path.read_text(encoding="utf-8", errors="replace")
        for m in re.finditer(r"import\s*\{([^}]*)\}\s*from\s*'[^']*i18n\.js'", text):
            for name in m.group(1).split(","):
                name = name.strip().split(" as ")[0].strip()
                if name and name not in exports:
                    missing.append(f"{path.relative_to(ROOT)}: {name}")
    assert not missing, (
        "these modules import names i18n.js does not export, and call them:\n"
        + "\n".join(missing)
    )
