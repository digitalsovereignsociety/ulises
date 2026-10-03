"""Run the cookbook-diagnosis-core.js unit tests via node --test.

Companion to tests/cookbook_diagnosis_core.test.mjs. The pytest file next to
it only asserts on module *shape*; this runs the module for real, so the
diagnosis pattern table and the initDiagnosisCore wiring are exercised
rather than pattern-matched as strings.

Skips when node is not on PATH.
"""
import re
import shutil
import subprocess
from pathlib import Path

import pytest

_REPO = Path(__file__).resolve().parent.parent
_TEST_JS = _REPO / "tests" / "cookbook_diagnosis_core.test.mjs"
_HAS_NODE = shutil.which("node") is not None

pytestmark = pytest.mark.skipif(not _HAS_NODE, reason="node binary not on PATH")


def test_diagnosis_core_js_tests_pass():
    proc = subprocess.run(
        ["node", "--test", str(_TEST_JS)],
        capture_output=True,
        text=True,
        cwd=str(_REPO),
        timeout=120,
    )
    if proc.returncode != 0:
        print(proc.stdout)
        pytest.fail(
            f"node --test failed (exit {proc.returncode}):\n{proc.stderr}"
        )
    assert proc.returncode == 0
    # The .mjs prints DIAGNOSIS_CORE_TESTS_OK <n> once every subtest has run.
    # Asserting on that rather than the TAP counters guards against a silently
    # empty run (e.g. every subtest filtered out or skipped).
    ran = re.search(r"DIAGNOSIS_CORE_TESTS_OK (\d+)", proc.stdout)
    assert ran, f"no sentinel in output:\n{proc.stdout}"
    assert int(ran.group(1)) >= 6, f"only {ran.group(1)} subtests ran:\n{proc.stdout}"
