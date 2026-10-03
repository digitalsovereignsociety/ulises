from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
# The ERROR_PATTERNS table lives in the leaf core module; cookbook-diagnosis.js
# re-exports it. Assert against core — that is where the patterns are defined.
DIAGNOSIS_CORE_JS = ROOT / "static" / "js" / "cookbook-diagnosis-core.js"
DIAGNOSIS_JS = ROOT / "static" / "js" / "cookbook-diagnosis.js"


def test_diagnosis_patterns_live_in_core_and_are_reexported():
    core = DIAGNOSIS_CORE_JS.read_text(encoding="utf-8")
    facade = DIAGNOSIS_JS.read_text(encoding="utf-8")

    assert "export const ERROR_PATTERNS = [" in core
    for sym in ("_diagnose", "_showDiagnosis", "_clearDiagnosis", "ERROR_PATTERNS"):
        assert f"export function {sym}" in core or f"export const {sym}" in core
        assert sym in facade
    assert "} from './cookbook-diagnosis-core.js';" in facade


def test_diagnosis_core_is_a_leaf_free_of_running_and_download():
    """The serve/download helpers arrive via initDiagnosisCore, not imports.

    Importing them is what produced the
    cookbook-diagnosis -> cookbookRunning -> cookbook-diagnosis cycle.
    """
    core = DIAGNOSIS_CORE_JS.read_text(encoding="utf-8")

    assert "from './cookbookRunning.js'" not in core
    assert "from './cookbookDownload.js'" not in core
    assert "export function initDiagnosisCore(deps)" in core


def test_running_and_download_consume_the_leaf_core():
    for name in ("cookbookRunning.js", "cookbookDownload.js"):
        source = (ROOT / "static" / "js" / name).read_text(encoding="utf-8")
        assert "from './cookbook-diagnosis-core.js'" in source
        assert "from './cookbook-diagnosis.js'" not in source


def test_repair_kernels_pip_spec_is_shell_quoted():
    source = DIAGNOSIS_CORE_JS.read_text(encoding="utf-8")

    assert '"kernels<0.15"' in source
    assert " --break-system-packages kernels<0.15" not in source


def test_sglang_native_dependency_diagnosis_is_exposed_to_browser():
    source = DIAGNOSIS_CORE_JS.read_text(encoding="utf-8")

    assert r"Python\.h" in source
    assert r"libnuma\.so\.1" in source
    assert "SGLang native dependencies" in source
    assert "libnuma-dev python3.12-dev build-essential" in source
    assert "sglang-kernel" in source
