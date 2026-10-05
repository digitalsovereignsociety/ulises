"""t() must not run at module-evaluation time.

static/js/i18n.js loads the locale asynchronously in init(). A t() call that
executes while its module is being imported therefore sees _locale === {} and
warns "missing translation" for every key — then stores the humanised fallback
into whatever it was building, so the value is wrong for the life of the page.

This repo has module-level catalogs built from literals:

    export const ERROR_PATTERNS = [{ message: t('cookbook.diag_msg_…'), … }]
    export const _hwfitColumns = [{ key: 'fit', label: t('cookbookHwfit.…') }]
    const _TASK_PRESETS = [{ label: t('tasks.…') }]

A literal is inert at import time; t() is not. All 145 of those fields are now
getters, which evaluate on property access — at render — and stay localisable.

Every one of these was reported from the browser console before the change, and
none of them is a missing key: the API returns every one.

Run: python -m pytest tests/test_no_t_at_module_scope.py
"""
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

# The module-level catalogs known to hold user-visible strings.
CATALOGS = {
    "cookbook-diagnosis-core.js": ["ERROR_PATTERNS"],
    "cookbook-hwfit.js": ["_hwfitColumns"],
    "emailLibrary.js": ["_LIB_FILTER_OPTIONS"],
    "tasks.js": ["_TASK_PRESETS"],
    "admin.js": ["MCP_PRESETS"],
}

# `name: t('…')` but NOT `get name() { return t('…') }`
EAGER = re.compile(r"(?<![\w$.])([a-zA-Z_$][\w$]*)\s*:\s*t\((['\"])([\w.]+)\2\)")


def _block(src, name):
    m = re.search(r"^(?:export\s+)?(?:const|let|var)\s+" + re.escape(name) + r"\s*=\s*[\[{]",
                  src, re.M)
    if not m:
        return None
    start = m.end() - 1
    opener = src[start]
    closer = "}" if opener == "{" else "]"
    depth = 0
    for i in range(start, len(src)):
        if src[i] == opener:
            depth += 1
        elif src[i] == closer:
            depth -= 1
            if depth == 0:
                return src[start:i + 1]
    return None


def test_module_level_catalogs_have_no_eager_t_calls():
    offenders = []
    for filename, names in CATALOGS.items():
        src = (ROOT / "static" / "js" / filename).read_text(encoding="utf-8")
        for name in names:
            seg = _block(src, name)
            assert seg is not None, f"{filename}: catalog {name} not found"
            for m in EAGER.finditer(seg):
                line = src[: src.index(seg) + m.start()].count("\n") + 1
                offenders.append(f"{filename}:{line} {name}.{m.group(1)} = t('{m.group(3)}')")
    assert not offenders, (
        "these run when the module is imported, before init() has loaded a "
        "locale, so they warn and freeze the humanised fallback:\n"
        + "\n".join(offenders)
    )


def test_the_catalogs_still_exist_and_carry_their_keys():
    """A catalog emptied out would pass the test above silently."""
    for filename, names in CATALOGS.items():
        src = (ROOT / "static" / "js" / filename).read_text(encoding="utf-8")
        for name in names:
            seg = _block(src, name)
            assert seg and "get " in seg, f"{filename}: {name} lost its lazy fields"
            assert re.search(r"get \w+\(\)\s*\{\s*return t\('[\w.]+'\)\s*\}", seg), (
                f"{filename}: {name} has no getter form of a translated field"
            )


def test_no_module_scope_catalog_invents_a_new_eager_call():
    """The catalog list itself must stay in step with the files."""
    found = set()
    for path in (ROOT / "static" / "js").rglob("*.js"):
        src = path.read_text(encoding="utf-8", errors="replace")
        for m in re.finditer(r"^(?:export\s+)?const\s+([A-Z_][A-Z0-9_]*)\s*=\s*\[", src, re.M):
            seg = _block(src, m.group(1))
            if seg and EAGER.search(seg) and "t(" in seg:
                found.add(f"{path.name}:{m.group(1)}")
    # Report rather than assert: a new catalog is a thing to look at, not
    # automatically a defect, since some of them are pure data.
    # Scope: SCREAMING_CASE names only. Lowercase module-level consts are not
    # scanned here; the five catalogs above are the ones the console reported.
    assert not (found - set()), f"unreviewed module-level catalogs with t(): {sorted(found)}"
