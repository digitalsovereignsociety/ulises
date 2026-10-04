"""Run the cookbook module evaluation smoke tests via node --test.

Companion to tests/cookbook_modules_smoke.test.mjs. The pytest files next to
the cookbook sources only assert on file contents, which cannot tell a module
that loads from one that throws ReferenceError on evaluation — the failure that
`node --check` and the import graph both miss.

Skips when node is not on PATH.
"""
import re
import shutil
import subprocess
from pathlib import Path

import pytest

_REPO = Path(__file__).resolve().parent.parent
_TEST_JS = _REPO / "tests" / "cookbook_modules_smoke.test.mjs"
_HAS_NODE = shutil.which("node") is not None

pytestmark = pytest.mark.skipif(not _HAS_NODE, reason="node binary not on PATH")


def test_cookbook_modules_smoke_js_passes():
    proc = subprocess.run(
        ["node", "--test", str(_TEST_JS)],
        capture_output=True,
        text=True,
        cwd=str(_REPO),
        timeout=600,
    )
    if proc.returncode != 0:
        print(proc.stdout)
        pytest.fail(
            f"node --test failed (exit {proc.returncode}):\n{proc.stderr}"
        )
    assert proc.returncode == 0
    ran = re.search(r"COOKBOOK_SMOKE_OK (\d+)", proc.stdout)
    assert ran, f"no sentinel in output:\n{proc.stdout}"
    assert int(ran.group(1)) >= 15, f"only {ran.group(1)} checks ran:\n{proc.stdout}"
