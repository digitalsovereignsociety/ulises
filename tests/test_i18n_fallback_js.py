"""Run the i18n.js missing-key fallback tests via node --test.

Companion to tests/i18n_fallback.test.mjs. static/js/i18n.test.mjs
re-implements t() rather than importing i18n.js, so the real t() — and with it
the behaviour that decides what a user sees when a key has no translation — was
untested.

Skips when node is not on PATH.
"""
import re
import shutil
import subprocess
from pathlib import Path

import pytest

_REPO = Path(__file__).resolve().parent.parent
_TEST_JS = _REPO / "tests" / "i18n_fallback.test.mjs"
_HAS_NODE = shutil.which("node") is not None

pytestmark = pytest.mark.skipif(not _HAS_NODE, reason="node binary not on PATH")


def test_i18n_fallback_js_tests_pass():
    proc = subprocess.run(
        ["node", "--test", str(_TEST_JS)],
        capture_output=True,
        text=True,
        cwd=str(_REPO),
        timeout=180,
    )
    if proc.returncode != 0:
        print(proc.stdout)
        pytest.fail(
            f"node --test failed (exit {proc.returncode}):\n{proc.stderr}"
        )
    assert proc.returncode == 0
    ran = re.search(r"I18N_FALLBACK_OK (\d+)", proc.stdout)
    assert ran, f"no sentinel in output:\n{proc.stdout}"
    assert int(ran.group(1)) >= 7, f"only {ran.group(1)} checks ran:\n{proc.stdout}"
