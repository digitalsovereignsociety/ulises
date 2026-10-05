// ============================================
// COOKBOOK DIAGNOSIS CORE (leaf module)
// Error-pattern matching and diagnosis rendering.
//
// Split out of cookbook-diagnosis.js so that cookbookRunning.js and
// cookbookDownload.js can consume _diagnose / _showDiagnosis / _clearDiagnosis
// without importing back into a module that needs them. Previously:
//
//   cookbook-diagnosis.js -> cookbookRunning.js -> cookbook-diagnosis.js
//   cookbook-diagnosis.js -> cookbookDownload.js -> cookbook-diagnosis.js
//
// Both are cycles, which ES modules only tolerate by accident (hoisted
// function declarations + live bindings). This module depends solely on
// cookbook-shared.js and spinner.js, so those edges are gone.
//
// The "fix" actions attached to each ERROR_PATTERNS entry call back into the
// serve/download modules. Those arrive via initDiagnosisCore(), called once by
// cookbook.js (the composition root). They are read at click time, never at
// module-eval time, so wiring order does not matter.
import {
  _envState,
  _copyText,
  _persistEnvState,
} from './cookbook-shared.js';
import spinnerModule from './spinner.js';
import { t } from './i18n.js';

// Injected by initDiagnosisCore() from cookbook.js. Deliberately module-local
// rather than imported: importing them is what created the cycles. Each starts
// out as a throwing stub so a missed wiring call names itself instead of
// failing as a bare "is not a function".
function _unwired(name) {
  throw new Error(
    `[cookbook] diagnosis action ${name} used before initDiagnosisCore() ran`
  );
}
let _serveAutoRetry = (...a) => _unwired('_serveAutoRetry', a);
let _serveAutoRetryReplace = (...a) => _unwired('_serveAutoRetryReplace', a);
let _serveAutoRetryRemove = (...a) => _unwired('_serveAutoRetryRemove', a);
let _serveAutoFix = (...a) => _unwired('_serveAutoFix', a);
let _launchServeTask = (...a) => _unwired('_launchServeTask', a);
let _loadTasks = (...a) => _unwired('_loadTasks', a);
let _setPanelField = (...a) => _unwired('_setPanelField', a);
let _setPanelCheckbox = (...a) => _unwired('_setPanelCheckbox', a);

export function initDiagnosisCore(deps) {
  _serveAutoRetry = deps._serveAutoRetry;
  _serveAutoRetryReplace = deps._serveAutoRetryReplace;
  _serveAutoRetryRemove = deps._serveAutoRetryRemove;
  _serveAutoFix = deps._serveAutoFix;
  _launchServeTask = deps._launchServeTask;
  _loadTasks = deps._loadTasks;
  _setPanelField = deps._setPanelField;
  _setPanelCheckbox = deps._setPanelCheckbox;
}

// Tiny HTML-escape — keeps the file standalone instead of leaning on a
// shared helper that may not be exported from this module's import surface.
function _diagEsc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

// Pick an icon for a diagnosis-action button based on the label. The icon
// renders on the LEFT of the button text. Keeps the strokes consistent
// across the set so they read as one family.
// Takes the fix's `kind` enum, NOT its label. This used to lowercase the label
// and match English verbs, so localising a label silently changed the button's
// icon — and "Edit & relaunch" was classified as a retry, because the relaunch
// check runs before the edit check. The branch order below keeps that quirk on
// purpose: every kind was derived from this exact logic, so each button keeps
// the icon it has today.
function _diagFixIcon(kind) {
  const _svg = (path) => `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" class="cookbook-diag-btn-ico" aria-hidden="true">${path}</svg>`;
  if (kind === 'retry') {
    // Circular-arrow refresh
    return _svg('<polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>');
  }
  if (kind === 'copy') {
    return _svg('<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>');
  }
  if (kind === 'edit') {
    return _svg('<path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z"/>');
  }
  if (kind === 'open') {
    return _svg('<path d="M14 3h7v7"/><path d="M21 3l-9 9"/><path d="M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5"/>');
  }
  if (kind === 'install') {
    return _svg('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>');
  }
  if (kind === 'kill') {
    return _svg('<rect x="6" y="6" width="12" height="12" rx="1"/>');
  }
  if (kind === 'switch') {
    return _svg('<polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>');
  }
  // Default: lightbulb (generic "suggestion")
  return _svg('<path d="M9 21h6"/><path d="M12 17v4"/><path d="M12 3a6 6 0 0 0-4 10.5c1 1 1.5 2 1.5 3.5h5c0-1.5.5-2.5 1.5-3.5A6 6 0 0 0 12 3Z"/>');
}

function _openServeEditFromDiagnosis(panel, fields = null) {
  const task = panel?.closest?.('.cookbook-task');
  if (!task) return;
  task.dispatchEvent(new CustomEvent('cookbook:edit-serve', { bubbles: true, detail: { fields } }));
}

function _openCpuServeEdit(panel) {
  _openServeEditFromDiagnosis(panel, {
    backend: 'llamacpp',
    gpus: '',
    tp: '1',
    gpu_mem: '0.80',
    _forceBackend: true,
  });
}

// Infer the gated base repo that single-file checkpoints need configs from
function _inferBaseRepo(text) {
  if (!text) return null;
  const t = text.toLowerCase();
  if (t.includes('sd3.5') || t.includes('stable-diffusion-3.5')) return 'stabilityai/stable-diffusion-3.5-large';
  if (t.includes('sd3') || t.includes('stable-diffusion-3')) return 'stabilityai/stable-diffusion-3-medium-diffusers';
  if (t.includes('flux')) return 'black-forest-labs/FLUX.1-schnell';
  if (t.includes('sdxl') || t.includes('stable-diffusion-xl')) return 'stabilityai/stable-diffusion-xl-base-1.0';
  return null;
}

export const ERROR_PATTERNS = [
  {
    pattern: /No available memory for the cache blocks|Available KV cache memory:.*-/i,
    message: t('cookbook.diag_msg_kv_cache_oom'),
    fixes: [
      { kind: 'retry', label: t('cookbook.diag_retry_gpu_mem', { v: '0.95' }), action: (panel) => _serveAutoRetryReplace(panel, '--gpu-memory-utilization', '0.95') },
      { kind: 'retry', label: t('cookbook.diag_retry_context', { v: '2048' }), action: (panel) => _serveAutoRetryReplace(panel, '--max-model-len', '2048') },
      { kind: 'retry', label: t('cookbook.diag_retry_more_gpus', { v: '8' }), action: (panel) => _serveAutoRetryReplace(panel, '--tensor-parallel-size', '8') },
    ],
  },
  {
    pattern: /warming up sampler|max_num_seqs.*gpu_memory_utilization/i,
    message: t('cookbook.diag_msg_warmup_oom'),
    fixes: [
      { kind: 'retry', label: t('cookbook.diag_retry_gpu_mem', { v: '0.80' }), action: (panel) => _serveAutoRetryReplace(panel, '--gpu-memory-utilization', '0.80') },
      { kind: 'retry', label: t('cookbook.diag_retry_flag_value', { flag: '--max-num-seqs', v: '64' }), action: (panel) => _serveAutoRetry(panel, '--max-num-seqs 64') },
      { kind: 'retry', label: t('cookbook.diag_retry_flag_value', { flag: '--max-num-seqs', v: '32' }), action: (panel) => _serveAutoRetry(panel, '--max-num-seqs 32') },
    ],
  },
  {
    pattern: /CUDA out of memory|torch\.cuda\.OutOfMemoryError|CUDA error: out of memory/i,
    message: t('cookbook.diag_msg_gpu_oom'),
    fixes: [
      { kind: 'retry', label: t('cookbook.diag_retry_flag_value', { flag: 'TP', v: '2' }), action: (panel) => _serveAutoRetryReplace(panel, '--tensor-parallel-size', '2') },
      { kind: 'retry', label: t('cookbook.diag_retry_flag_value', { flag: 'TP', v: '4' }), action: (panel) => _serveAutoRetryReplace(panel, '--tensor-parallel-size', '4') },
      { kind: 'retry', label: t('cookbook.diag_retry_gpu_mem', { v: '0.80' }), action: (panel) => _serveAutoRetryReplace(panel, '--gpu-memory-utilization', '0.80') },
      { kind: 'retry', label: t('cookbook.diag_retry_context', { v: '4096' }), action: (panel) => _serveAutoRetryReplace(panel, '--max-model-len', '4096') },
      { kind: 'retry', label: t('cookbook.diag_retry_flag', { flag: '--enforce-eager' }), action: (panel) => _serveAutoRetry(panel, '--enforce-eager') },
    ],
  },
  {
    pattern: /not divisible by weight quantization|quantization block/i,
    message: t('cookbook.diag_msg_fp8_moe_tp'),
    suggestion: t('cookbook.diag_sug_lower_tp'),
    fixes: [
      { kind: 'retry', label: t('cookbook.diag_retry_flag_value', { flag: 'TP', v: '4' }), action: (panel) => _serveAutoRetryReplace(panel, '--tensor-parallel-size', '4') },
      { kind: 'retry', label: t('cookbook.diag_retry_flag_value', { flag: 'TP', v: '2' }), action: (panel) => _serveAutoRetryReplace(panel, '--tensor-parallel-size', '2') },
      { kind: 'edit', label: t('cookbook.diag_edit_serve'), action: (panel) => _openServeEditFromDiagnosis(panel) },
    ],
  },
  {
    pattern: /There is no module or parameter named ['"]lm_head\.input_scale['"]|lm_head\.input_scale|weight_scale_2/i,
    message: t('cookbook.diag_msg_modelopt_lmhead'),
    suggestion: t('cookbook.diag_sug_upgrade_env'),
    fixes: [
      { kind: 'open', label: t('cookbook.diag_open_dependencies'), action: () => _openCookbookDependencies('vllm') },
      {
        kind: 'copy', label: t('cookbook.diag_copy_upgrade_hint'),
        action: () => _copyText('Upgrade the vLLM environment that provides the selected vllm CLI, or use a compatible checkpoint. Do not assume Ulises owns PATH/system/source/Docker installs.'),
      },
    ],
  },
  {
    pattern: /not divisib|must be divisible|attention heads.*divisible/i,
    message: t('cookbook.diag_msg_tp_dimensions'),
    fixes: [
      { kind: 'retry', label: t('cookbook.diag_retry_flag_value', { flag: 'TP', v: '1' }), action: (panel) => _serveAutoRetryReplace(panel, '--tensor-parallel-size', '1') },
      { kind: 'retry', label: t('cookbook.diag_retry_flag_value', { flag: 'TP', v: '2' }), action: (panel) => _serveAutoRetryReplace(panel, '--tensor-parallel-size', '2') },
      { kind: 'retry', label: t('cookbook.diag_retry_flag_value', { flag: 'TP', v: '4' }), action: (panel) => _serveAutoRetryReplace(panel, '--tensor-parallel-size', '4') },
    ],
  },
  {
    pattern: /Too large swap space|swap space.*total CPU memory/i,
    message: t('cookbook.diag_msg_swap_too_large'),
    fixes: [
      { kind: 'retry', label: t('cookbook.diag_retry_without_swap'), action: (panel) => _serveAutoRetryRemove(panel, '--swap-space') },
      { kind: 'retry', label: t('cookbook.diag_retry_swap', { v: '1' }), action: (panel) => _serveAutoRetryReplace(panel, '--swap-space', '1') },
    ],
  },
  {
    pattern: /swap space|not enough.*memory.*cpu|Cannot allocate memory/i,
    message: t('cookbook.diag_msg_no_cpu_ram'),
    fixes: [
      { kind: 'retry', label: t('cookbook.diag_retry_without_swap'), action: (panel) => _serveAutoRetryRemove(panel, '--swap-space') },
      { kind: 'default', label: t('cookbook.diag_lower_max_context', { v: '4096' }), action: (panel) => _setPanelField(panel, 'ctx', '4096') },
    ],
  },
  {
    pattern: /unrecognized arguments:\s*--swap-space/i,
    message: t('cookbook.diag_msg_swap_removed'),
    fixes: [
      { kind: 'retry', label: t('cookbook.diag_retry_without_swap'), action: (panel) => _serveAutoRetryRemove(panel, '--swap-space') },
    ],
  },
  {
    pattern: /Address already in use|bind.*address.*in use/i,
    message: t('cookbook.diag_msg_port_in_use'),
    fixes: [
      { kind: 'kill', label: t('cookbook.diag_kill_existing_vllm'), action: (panel) => _runQuickCmd(panel, 'pkill -f vllm') },
      { kind: 'switch', label: t('cookbook.diag_use_port', { v: '8001' }), action: (panel) => _setPanelField(panel, 'port', '8001') },
    ],
  },
  {
    pattern: /No CUDA GPUs are available|no GPU.*found|CUDA_VISIBLE_DEVICES.*invalid/i,
    message: t('cookbook.diag_msg_no_gpus_visible'),
    fixes: [
      { kind: 'switch', label: t('cookbook.diag_clear_gpu_selection_use_all'), action: (panel) => {
        _setPanelField(panel, 'gpus', '');
        _envState.gpus = '';
        _persistEnvState();
      }},
    ],
  },
  {
    pattern: /403 Forbidden|401 Unauthorized|Access to model.*is restricted|gated repo|not in the authorized list|awaiting a review/i,
    message: t('cookbook.diag_msg_gated_model'),
    // Extract repo name from error text to build HF link
    _repoPattern: /Access to model\s+(\S+)\s+is restricted|gated repo.*?huggingface\.co\/([^\s/]+\/[^\s/]+)/i,
    fixes: [
      { kind: 'default', label: t('cookbook.diag_request_access_on_hf'), action: (panel, _text) => {
        const m = _text && (_text.match(/Access to model\s+(\S+)\s+is restricted/i) || _text.match(/huggingface\.co\/([^\s/]+\/[^\s/]+)/i));
        const repo = m && (m[1] || m[2]);
        if (repo) window.open('https://huggingface.co/' + repo, '_blank');
        else window.open('https://huggingface.co/settings/gated-repos', '_blank');
      }},
      { kind: 'default', label: t('cookbook.diag_check_hf_token'), action: (panel) => {
        const el = panel.querySelector('[data-field="hf_token"]');
        if (el) { el.focus(); el.style.borderColor = 'var(--red)'; }
      }},
    ],
  },
  {
    pattern: /Weights for this component appear to be missing|load the component before passing/i,
    message: t('cookbook.diag_msg_single_file_base'),
    fixes: [
      { kind: 'default', label: t('cookbook.diag_request_access_to_base_model'), action: (panel, _text) => {
        // Extract gated repo from error, or infer from model name
        const gated = _text && _text.match(/Access to model\s+(\S+)\s+is restricted/i);
        const base = _text && _text.match(/config=([^\s,)]+)/i);
        const model = _text && _text.match(/load model from\s+(\S+)/i);
        const repo = (gated && gated[1]) || (base && base[1]) || _inferBaseRepo(_text);
        if (repo) window.open('https://huggingface.co/' + repo, '_blank');
        else if (model && model[1]) window.open('https://huggingface.co/' + model[1].replace(/[.]$/, ''), '_blank');
      }},
      { kind: 'default', label: t('cookbook.diag_check_hf_token'), action: (panel) => {
        const el = panel.querySelector('[data-field="hf_token"]');
        if (el) { el.focus(); el.style.borderColor = 'var(--red)'; }
      }},
    ],
  },
  {
    pattern: /Entry Not Found.*model_index\.json|Could not load model.*Check diffusers/i,
    message: t('cookbook.diag_msg_single_file_config'),
    fixes: [
      { kind: 'default', label: t('cookbook.diag_request_access_to_base_model'), action: (panel, _text) => {
        const gated = _text && _text.match(/Access to model\s+(\S+)\s+is restricted/i);
        const repo = (gated && gated[1]) || _inferBaseRepo(_text);
        if (repo) window.open('https://huggingface.co/' + repo, '_blank');
        else window.open('https://huggingface.co/settings/gated-repos', '_blank');
      }},
      { kind: 'default', label: t('cookbook.diag_check_hf_token'), action: (panel) => {
        const el = panel.querySelector('[data-field="hf_token"]');
        if (el) { el.focus(); el.style.borderColor = 'var(--red)'; }
      }},
    ],
  },
  {
    pattern: /does not appear to have a file named|not a valid model|No such file or directory.*model/i,
    message: t('cookbook.diag_msg_model_not_found'),
    fixes: [
      { kind: 'default', label: t('cookbook.diag_check_model_name'), action: (panel) => {
        const header = panel.querySelector('.hwfit-panel-model');
        if (header) header.style.color = 'var(--red)';
      }},
    ],
  },
  {
    pattern: /NCCL error|ncclSystemError|ncclInternalError/i,
    message: t('cookbook.diag_msg_nccl_failed'),
    fixes: [
      { kind: 'default', label: t('cookbook.diag_set_tp_single', { v: '1' }), action: (panel) => _setPanelField(panel, 'tp', '1') },
      { kind: 'default', label: t('cookbook.diag_enable_enforce_eager'), action: (panel) => _setPanelCheckbox(panel, 'enforce_eager', true) },
    ],
  },
  {
    pattern: /KV cache.*too (small|large)|max_model_len.*exceeds|maximum.*context/i,
    message: t('cookbook.diag_msg_context_too_large'),
    fixes: [
      { kind: 'default', label: t('cookbook.diag_lower_to', { v: '8192' }), action: (panel) => _setPanelField(panel, 'ctx', '8192') },
      { kind: 'default', label: t('cookbook.diag_lower_to', { v: '4096' }), action: (panel) => _setPanelField(panel, 'ctx', '4096') },
      { kind: 'default', label: t('cookbook.diag_lower_to', { v: '2048' }), action: (panel) => _setPanelField(panel, 'ctx', '2048') },
    ],
  },
  {
    pattern: /vllm.*command not found|No module named vllm/i,
    message: t('cookbook.diag_msg_vllm_missing'),
    fixes: [
      { kind: 'open', label: t('cookbook.diag_open_dependencies'), action: () => _openCookbookDependencies('vllm') },
      { kind: 'default', label: t('cookbook.diag_check_environment_is_set'), action: (panel) => {
        const el = panel.querySelector('[data-field="env_type"]');
        if (el) { el.focus(); el.style.borderColor = 'var(--red)'; }
      }},
    ],
  },
  {
    pattern: /sgl_kernel[\s\S]*(Python\.h|libnuma\.so\.1|common_ops)|(Python\.h|libnuma\.so\.1|common_ops)[\s\S]*sgl_kernel|Please ensure sgl_kernel is properly installed/i,
    message: t('cookbook.diag_msg_sglang_deps_missing'),
    fixes: [
      { kind: 'copy', label: t('cookbook.diag_copy_os_package_command'), action: () => _copyText('sudo apt-get install -y libnuma-dev python3.12-dev build-essential') },
      { kind: 'copy', label: t('cookbook.diag_copy_kernel_upgrade'), action: () => _copyText('python3 -m pip install --upgrade sglang-kernel') },
      { kind: 'open', label: t('cookbook.diag_open_dependencies'), action: () => _openCookbookDependencies('sglang') },
    ],
  },
  {
    pattern: /sglang.*command not found|No module named sglang|SGLang is not installed/i,
    message: t('cookbook.diag_msg_sglang_missing'),
    fixes: [
      { kind: 'open', label: t('cookbook.diag_open_dependencies'), action: () => _openCookbookDependencies('sglang') },
      { kind: 'copy', label: t('cookbook.diag_copy_install_command'), action: () => _copyText('python3 -m pip install "sglang[all]"') },
    ],
  },
  {
    pattern: /No accelerator \(CUDA, XPU, HPU, NPU, MUSA, MPS\) is available|Triton is not supported on current platform/i,
    message: t('cookbook.diag_msg_sglang_no_gpu'),
    suggestion: t('cookbook.diag_sug_switch_llamacpp'),
    fixes: [
      { kind: 'switch', label: t('cookbook.diag_switch_to_llama_cpp'), action: (panel) => _openCpuServeEdit(panel) },
      { kind: 'default', label: t('cookbook.diag_choose_gpu_server'), action: (panel) => _openServeEditFromDiagnosis(panel) },
    ],
  },
  {
    pattern: /flashinfer.*version.*does not match|flashinfer-cubin version/i,
    message: t('cookbook.diag_msg_flashinfer_mismatch'),
    fixes: [
      { kind: 'default', label: t('cookbook.diag_auto_fix_bypass_version_check'), action: (panel) => _serveAutoFix(panel, 'FLASHINFER_DISABLE_VERSION_CHECK=1'), autofix: true },
      { kind: 'default', label: t('cookbook.diag_fix_properly_pip_install_matching_version'), action: () => {} },
    ],
  },
  {
    pattern: /torch\.cuda\.is_available\(\).*False|No CUDA runtime/i,
    message: t('cookbook.diag_msg_vllm_no_cuda'),
    suggestion: t('cookbook.diag_sug_switch_llamacpp'),
    fixes: [
      { kind: 'switch', label: t('cookbook.diag_switch_to_llama_cpp'), action: (panel) => _openCpuServeEdit(panel) },
      { kind: 'default', label: t('cookbook.diag_choose_gpu_server'), action: (panel) => _openServeEditFromDiagnosis(panel) },
    ],
  },
  {
    pattern: /Engine core initialization failed/i,
    message: t('cookbook.diag_msg_vllm_engine_failed'),
    fixes: [
      { kind: 'retry', label: t('cookbook.diag_retry_flag', { flag: '--enforce-eager' }), action: (panel) => _serveAutoRetry(panel, '--enforce-eager'), autofix: true },
      { kind: 'retry', label: t('cookbook.diag_retry_context', { v: '4096' }), action: (panel) => _serveAutoRetry(panel, '--max-model-len 4096'), autofix: true },
      { kind: 'default', label: t('cookbook.diag_lower_context', { v: '4096' }), action: (panel) => _setPanelField(panel, 'ctx', '4096') },
      { kind: 'default', label: t('cookbook.diag_lower_gpu_mem', { v: '0.80' }), action: (panel) => _setPanelField(panel, 'gpu_mem', '0.80') },
    ],
  },
  {
    pattern: /weight_loader.*unexpected keyword|Unexpected key.*state_dict/i,
    message: t('cookbook.diag_msg_model_format'),
    fixes: [
      { kind: 'default', label: t('cookbook.diag_try_trust_remote_code'), action: (panel) => _setPanelCheckbox(panel, 'trust_remote', true) },
    ],
  },
  {
    pattern: /enable-auto-tool-choice requires --tool-call-parser/i,
    message: t('cookbook.diag_msg_auto_tool_choice'),
    fixes: [
      { kind: 'retry', label: t('cookbook.diag_retry_flag_word', { flag: '--tool-call-parser', word: 'hermes' }), action: (panel) => _serveAutoRetry(panel, '--tool-call-parser hermes'), autofix: true },
    ],
  },
  {
    pattern: /Please pass.*trust.remote.code=True|contains custom code which must be executed to correctly load/i,
    message: t('cookbook.diag_msg_needs_trust_remote_code'),
    fixes: [
      { kind: 'retry', label: t('cookbook.diag_retry_flag', { flag: '--trust-remote-code' }), action: (panel) => _serveAutoRetry(panel, '--trust-remote-code'), autofix: true },
    ],
  },
  {
    pattern: /does not recognize this architecture|model type.*but Transformers does not/i,
    message: t('cookbook.diag_msg_arch_too_new'),
    fixes: [
      { kind: 'default', label: t('cookbook.diag_try_trust_remote_code_flag'), action: (panel) => _serveAutoRetry(panel, '--trust-remote-code'), autofix: true },
      { kind: 'default', label: t('cookbook.diag_update_vllm_on_server'), action: () => {
        // Use the venv's python3 by absolute path when configured (SSH non-
        // interactive sessions often pick user-site Python over the venv).
        const _vp = (_envState.env === 'venv' && _envState.envPath)
          ? `${_envState.envPath.replace(/\/+$/, '')}/bin/python3` : 'python3';
        _launchServeTask('update-vllm', 'pip-update', `${_vp} -m pip install -U vllm transformers`);
      }},
    ],
  },
  {
    pattern: /Either a revision or a version must be specified|transformers\.integrations\.hub_kernels|kernels\/layer/i,
    message: t('cookbook.diag_msg_kernels_mismatch'),
    fixes: [
      { kind: 'default', label: t('cookbook.diag_repair_kernel_package'), action: () => {
        const _vp = (_envState.env === 'venv' && _envState.envPath)
          ? `${_envState.envPath.replace(/\/+$/, '')}/bin/python3` : 'python3';
        _launchServeTask('repair-kernels', 'pip-update', `${_vp} -m pip install --user --break-system-packages "kernels<0.15"`);
      }},
      { kind: 'open', label: t('cookbook.diag_open_dependencies'), action: () => _openCookbookDependencies('sglang') },
    ],
  },
  {
    pattern: /ollama.*command not found/i,
    message: t('cookbook.diag_msg_ollama_missing'),
    fixes: [
      { kind: 'copy', label: t('cookbook.diag_copy_install_command'), action: () => _copyText('curl -fsSL https://ollama.com/install.sh | sh') },
    ],
  },
  // System build deps must be checked BEFORE the llama-server catch-all:
  // a `cmake: command not found` failure ALSO produces `llama-server:
  // command not found` later in the script (the build aborts then the
  // run line fails) — pattern order is first-match-wins, so without
  // these specific entries the user gets the misleading "install
  // llama-cpp-python[server]" suggestion when the actual blocker is a
  // missing OS-package toolchain that pip can't ship.
  {
    pattern: /cmake: command not found|cmake.*not found.*Could not/i,
    message: t('cookbook.diag_msg_cmake_required'),
    suggestion: t('cookbook.diag_sug_install_cmake'),
    fixes: [
      { kind: 'open', label: t('cookbook.diag_open_dependencies'), action: () => _openCookbookDependencies('llama_cpp') },
      { kind: 'copy', label: t('cookbook.diag_copy_apt_install'), action: () => _copyText('sudo apt install -y cmake build-essential git') },
      { kind: 'copy', label: t('cookbook.diag_copy_pacman_install'), action: () => _copyText('sudo pacman -Sy --needed cmake base-devel git') },
      { kind: 'copy', label: t('cookbook.diag_copy_dnf_install'), action: () => _copyText('sudo dnf install -y cmake gcc gcc-c++ make git') },
    ],
  },
  {
    pattern: /^(make|g\+\+|gcc): command not found|Could not find C\+\+ compiler/i,
    message: t('cookbook.diag_msg_cc_compiler_required'),
    fixes: [
      { kind: 'open', label: t('cookbook.diag_open_dependencies'), action: () => _openCookbookDependencies('llama_cpp') },
      { kind: 'copy', label: t('cookbook.diag_copy_apt_install'), action: () => _copyText('sudo apt install -y build-essential') },
    ],
  },
  {
    pattern: /^git: command not found/i,
    message: t('cookbook.diag_msg_git_required'),
    fixes: [
      { kind: 'open', label: t('cookbook.diag_open_dependencies'), action: () => _openCookbookDependencies('llama_cpp') },
      { kind: 'copy', label: t('cookbook.diag_copy_apt_install'), action: () => _copyText('sudo apt install -y git') },
    ],
  },
  {
    pattern: /llama-server.*command not found|llama\.cpp.*not found|No module named.*llama_cpp|No module named 'starlette_context'/i,
    message: t('cookbook.diag_msg_llama_cpp_server_missing'),
    fixes: [
      { kind: 'open', label: t('cookbook.diag_open_dependencies'), action: () => _openCookbookDependencies('llama_cpp') },
      { kind: 'copy', label: t('cookbook.diag_copy_install_command'), action: () => _copyText('pip install "llama-cpp-python[server]"') },
    ],
  },
  {
    pattern: /Windows Error 0xc000001d|Illegal instruction|0xc000001d/i,
    message: t('cookbook.diag_msg_avx2_mismatch'),
    suggestion: t('cookbook.diag_sug_switch_ollama'),
    fixes: [
      { kind: 'switch', label: t('cookbook.diag_switch_to_ollama'), action: (panel) => _openServeEditFromDiagnosis(panel, { backend: 'ollama' }) },
      { kind: 'default', label: t('cookbook.diag_choose_remote_server'), action: (panel) => _openServeEditFromDiagnosis(panel) },
    ],
  },
  {
    pattern: /CUDA Toolkit not found|Unable to find cudart library|missing:\s*CUDA_CUDART/i,
    message: t('cookbook.diag_msg_cuda_runtime_missing'),
    suggestion: t('cookbook.diag_sug_relaunch_runner'),
    fixes: [
      { kind: 'edit', label: t('cookbook.diag_edit_serve'), action: (panel) => _openServeEditFromDiagnosis(panel) },
      { kind: 'open', label: t('cookbook.diag_open_dependencies'), action: () => _openCookbookDependencies('llama_cpp') },
    ],
  },
  {
    pattern: /No module named ['"]?torch|No module named ['"]?diffusers|diffusers.*command not found/i,
    message: t('cookbook.diag_msg_diffusion_deps'),
    fixes: [
      { kind: 'open', label: t('cookbook.diag_open_dependencies'), action: () => _openCookbookDependencies('diffusers') },
      { kind: 'copy', label: t('cookbook.diag_copy_install_command'), action: () => _copyText('python3 -m pip install "diffusers[torch]"') },
    ],
  },
  {
    pattern: /Triton kernels.*Failed to import|cannot import name '\w+' from 'triton_kernels/i,
    message: t('cookbook.diag_msg_triton_mismatch'),
    fixes: [
      { kind: 'default', label: t('cookbook.diag_update_triton_on_server'), action: () => {
        const _vp = (_envState.env === 'venv' && _envState.envPath)
          ? `${_envState.envPath.replace(/\/+$/, '')}/bin/python3` : 'python3';
        _launchServeTask('update-triton', 'pip-update', `${_vp} -m pip install -U triton triton-kernels`);
      }},
    ],
  },
  {
    pattern: /No space left on device|Disk quota exceeded|ENOSPC/i,
    message: t('cookbook.diag_msg_disk_full'),
    fixes: [
      { kind: 'default', label: t('cookbook.diag_check_hf_cache_size'), action: (panel) => _runQuickCmd(panel, 'du -sh ~/.cache/huggingface 2>/dev/null') },
    ],
  },
  {
    pattern: /Connection refused|Could not connect|Connection reset by peer/i,
    message: t('cookbook.diag_msg_network_failed'),
    fixes: [
      { kind: 'default', label: t('cookbook.diag_test_hf_connectivity'), action: (panel) => _runQuickCmd(panel, 'curl -sI https://huggingface.co 2>&1 | head -3') },
    ],
  },
  {
    pattern: /attention_sink|sliding.window.*not supported|sliding_window.*incompatible/i,
    message: t('cookbook.diag_msg_attention_unsupported'),
    fixes: [
      { kind: 'default', label: t('cookbook.diag_update_vllm_on_server'), action: () => {
        const _vp = (_envState.env === 'venv' && _envState.envPath)
          ? `${_envState.envPath.replace(/\/+$/, '')}/bin/python3` : 'python3';
        _launchServeTask('update-vllm', 'pip-update', `${_vp} -m pip install -U vllm`);
      }},
    ],
  },
  {
    // FlashInfer JIT-compiles attention kernels for the host GPU on first
    // use. If the system /usr/bin/nvcc is older than CUDA 11.8 it can't
    // target sm_89/sm_90 (Ada/Hopper), and the engine workers die before
    // they can report a useful traceback. Two quick paths out: pick a
    // non-flashinfer attention backend, or set CUDACXX to a newer nvcc
    // (vLLM installs nvidia-cuda-nvcc into the venv — point at that).
    pattern: /nvcc fatal\s+:\s+Unsupported gpu architecture 'compute_\d+'/i,
    message: t('cookbook.diag_msg_flashinfer_nvcc_old'),
    suggestion: t('cookbook.diag_sug_flashinfer_sampler'),
    fixes: [
      { kind: 'retry', label: t('cookbook.diag_retry_flag_value', { flag: 'VLLM_USE_FLASHINFER_SAMPLER', v: '0' }), action: (panel) => _serveAutoRetryReplace(panel, '', 'VLLM_USE_FLASHINFER_SAMPLER=0 ', { prepend: true }) },
      { kind: 'default', label: t('cookbook.diag_uninstall_flashinfer_python'), action: () => {
        // Hard fallback: vLLM 0.22 reaches into flashinfer for sampling kernels
        // even with VLLM_USE_FLASHINFER_SAMPLER=0 in some configs. Removing
        // the package forces it onto the native sampler.
        const _vp = (_envState.env === 'venv' && _envState.envPath)
          ? `${_envState.envPath.replace(/\/+$/, '')}/bin/python3` : 'python3';
        _launchServeTask('uninstall-flashinfer', 'pip-update', `${_vp} -m pip uninstall flashinfer-python -y`);
      }},
      { kind: 'edit', label: t('cookbook.diag_edit_serve'), action: (panel) => _openServeEditFromDiagnosis(panel) },
    ],
  },
  {
    // vLLM <-> torch ABI mismatch: vLLM imports torch.library helpers
    // (`infer_schema`, `register_fake`, etc.) that only exist on newer torch
    // versions. When the installed torch is older, the import fails before
    // any server code runs. Fix is to reinstall vllm (which pulls a matching
    // torch) or upgrade torch directly.
    pattern: /ImportError: cannot import name '[^']+' from 'torch(\.\w+)+'/i,
    message: t('cookbook.diag_msg_torch_abi'),
    fixes: [
      { kind: 'default', label: t('cookbook.diag_reinstall_vllm_pulls_matching_torch'), action: () => {
        // Absolute path to the venv's python3 — bare `python3` lands in the
        // wrong site-packages over SSH when ~/.local/bin precedes the venv.
        const _vp = (_envState.env === 'venv' && _envState.envPath)
          ? `${_envState.envPath.replace(/\/+$/, '')}/bin/python3` : 'python3';
        _launchServeTask('reinstall-vllm', 'pip-reinstall', `${_vp} -m pip install --force-reinstall vllm`);
      }},
      { kind: 'install', label: t('cookbook.diag_upgrade_torch_only'), action: () => {
        const _vp = (_envState.env === 'venv' && _envState.envPath)
          ? `${_envState.envPath.replace(/\/+$/, '')}/bin/python3` : 'python3';
        _launchServeTask('upgrade-torch', 'pip-update', `${_vp} -m pip install -U torch`);
      }},
    ],
  },
  {
    // Dependency-install (pip) build failure — a required package failed to
    // build its wheel (common when an old sdist's setup.py breaks on a newer
    // Python, e.g. basicsr on 3.13). This is an install problem, NOT a serve
    // problem, so it must never suggest killing vLLM.
    match: (text) => {
      const TAIL = text.slice(-6000);
      // A serve script can run a fallback build and then start serving fine —
      // don't flag a stale build error once the server is up.
      if (/Application startup complete|"(?:GET|POST)\s+\/v1\/[^"]+ HTTP\/[\d.]+"\s*2\d\d|Uvicorn running on|server is listening on https?:\/\//i.test(TAIL)) return false;
      return /Failed to build\b|subprocess-exited-with-error|Could not build wheels|metadata-generation-failed/i.test(TAIL);
    },
    message: t('cookbook.diag_msg_dep_build_failed'),
    suggestion: t('cookbook.diag_sug_check_build_output'),
    fixes: [],
  },
  {
    // vLLM-specific traceback: only offer the kill-processes recovery when the
    // output is actually about vLLM. Tail-only + healthy-server suppression so
    // a one-shot startup traceback doesn't stick on the panel forever while
    // the server happily serves /v1/models.
    match: (text) => {
      const TAIL = text.slice(-4096);
      if (!/Traceback \(most recent call last\)/i.test(TAIL)) return false;
      if (/Application startup complete|"GET \/v1\/[^"]+ HTTP\/[\d.]+" 2\d\d|Uvicorn running on/i.test(TAIL)) return false;
      return /vllm/i.test(TAIL);
    },
    message: t('cookbook.diag_msg_vllm_wedged'),
    fixes: [
      { kind: 'kill', label: t('cookbook.diag_kill_vllm_processes'), action: (panel) => _runQuickCmd(panel, 'pkill -f vllm') },
    ],
  },
  {
    // Generic traceback (not vLLM, not a pip build): surface it without
    // suggesting an unrelated vLLM kill. Same tail-only + healthy suppression.
    match: (text) => {
      const TAIL = text.slice(-4096);
      if (!/Traceback \(most recent call last\)/i.test(TAIL)) return false;
      if (/Application startup complete|"GET \/v1\/[^"]+ HTTP\/[\d.]+" 2\d\d|Uvicorn running on/i.test(TAIL)) return false;
      return true;
    },
    message: t('cookbook.diag_msg_traceback_detected'),
    suggestion: t('cookbook.diag_sug_read_failed_step'),
    fixes: [],
  },
];

export function _diagnose(text) {
  for (const entry of ERROR_PATTERNS) {
    const hit = entry.match ? entry.match(text) : entry.pattern.test(text);
    if (hit) return entry;
  }
  return null;
}

function _diagnosisCopyBundle(task, diagnosis, sourceText, suggestionText) {
  const lines = ['## Ulises Cookbook troubleshooting'];
  if (task) {
    lines.push(
      '',
      '### Task',
      `- ID: ${task.sessionId || task.id || 'unknown'}`,
      `- Type: ${task.type || 'unknown'}`,
      `- Status: ${task.status || 'unknown'}`,
      `- Model: ${task.payload?.repo_id || task.name || 'unknown'}`,
      `- Host: ${task.remoteHost || 'local'}${task.sshPort ? `:${task.sshPort}` : ''}`,
    );
  }
  lines.push('', '### Diagnosis', diagnosis?.message || '(none)');
  if (suggestionText) lines.push('', '### Suggested action', suggestionText.replace(/^Suggested action:\s*/i, ''));
  const cmd = task?.payload?._cmd || '';
  if (cmd) lines.push('', '### Launch command', '```bash', cmd, '```');
  if (sourceText) lines.push('', '### Captured output', '```text', String(sourceText).trim(), '```');
  return lines.join('\n');
}

export function _showDiagnosis(panel, diagnosis, sourceText) {
  const wasCollapsed = panel._lastDiagMsg === diagnosis.message && panel._diagCollapsed;
  if (panel._diagDismissed === diagnosis.message) return;
  panel._lastDiagMsg = diagnosis.message;
  panel._diagCollapsed = !!wasCollapsed;

  let diag = panel.querySelector('.cookbook-diagnosis');
  if (!diag) {
    diag = document.createElement('div');
    diag.className = 'cookbook-diagnosis';
    const output = panel.querySelector('.cookbook-output-pre');
    if (output) output.after(diag);
    else panel.appendChild(diag);
  }
  diag.classList.remove('hidden');
  diag.innerHTML = '';
  const taskEl = panel?.closest?.('.cookbook-task');
  const task = taskEl ? _loadTasks().find(t => t.sessionId === taskEl.dataset.taskId) : null;
  const fixes = [...(diagnosis.fixes || [])];
  // Deduped on a stable id, not on the label: comparing display text made this
  // silently append a duplicate the moment the label was localised.
  if (task?.type === 'serve' && task.payload?._cmd && !fixes.some(f => f.id === 'edit_serve')) {
    fixes.push({ id: 'edit_serve', kind: 'edit', label: t('cookbook.diag_edit_serve'), action: (p) => _openServeEditFromDiagnosis(p) });
  }
  const suggestionText = diagnosis.suggestion || (fixes.length
    ? `Suggested action: ${fixes[0].label}.`
    : t('cookbook.diag_sug_default_copy_error'));

  panel._diagCollapsed = false;

  // Top-right toolbar: Copy bundle + × dismiss. Restored after user feedback
  // — without them there's no way to quietly close a stale diagnosis or grab
  // the full error+context for a forum/discord paste.
  const toolbar = document.createElement('div');
  toolbar.className = 'cookbook-diag-toolbar';
  // Left side carries the diagnosis text (message + suggestion); buttons
  // stay on the right. Was a separate body row below the toolbar, but
  // the message reads more like "this is what the toolbar is for" when
  // it sits inline with Copy / × Dismiss.
  toolbar.style.cssText = 'display:flex;align-items:flex-start;gap:8px;margin-bottom:-2px;';

  const textWrap = document.createElement('div');
  textWrap.style.cssText = 'flex:1;min-width:0;font-size:11px;line-height:1.35;';
  const msg = document.createElement('div');
  msg.className = 'cookbook-diag-message';
  msg.textContent = diagnosis.message;
  textWrap.appendChild(msg);
  const suggestion = document.createElement('div');
  suggestion.className = 'cookbook-diag-suggestion';
  suggestion.textContent = suggestionText;
  suggestion.style.cssText = 'opacity:0.75;margin-top:1px;';
  textWrap.appendChild(suggestion);
  toolbar.appendChild(textWrap);

  const copyBtn = document.createElement('button');
  copyBtn.type = 'button';
  copyBtn.className = 'cookbook-diag-copy';
  copyBtn.title = 'Copy diagnosis details';
  copyBtn.setAttribute('aria-label', 'Copy diagnosis');
  copyBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
  copyBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    const bundle = _diagnosisCopyBundle(task, diagnosis, sourceText, suggestionText);
    // Use the shared helper which falls back to execCommand('copy') on
    // non-HTTPS origins (Tailscale IPs, LAN IPs, etc.) — navigator.clipboard
    // is silently a no-op on those, which is why the button appeared dead
    // for users on http://100.113.161.2:7011 over Tailscale/mobile.
    const ok = await _copyText(bundle);
    if (ok) {
      copyBtn.classList.add('copied');
      setTimeout(() => { if (copyBtn.isConnected) copyBtn.classList.remove('copied'); }, 1200);
    }
  });

  const dismissBtn = document.createElement('button');
  dismissBtn.type = 'button';
  dismissBtn.className = 'cookbook-diag-dismiss';
  dismissBtn.title = 'Dismiss diagnosis';
  dismissBtn.setAttribute('aria-label', 'Dismiss');
  dismissBtn.textContent = '×';
  dismissBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    panel._diagDismissed = diagnosis.message;
    _clearDiagnosis(panel);
  });

  toolbar.appendChild(copyBtn);
  toolbar.appendChild(dismissBtn);
  diag.appendChild(toolbar);

  const runFix = async (fix, button, busyLabel = fix.label, onStart = null, onDone = null) => {
    if (!fix || !button || button.dataset.busy) return;
    button.dataset.busy = '1';
    const _orig = button.textContent;
    const wp = spinnerModule.createWhirlpool(12);
    wp.element.style.cssText = 'display:inline-block;vertical-align:middle;width:12px;height:12px;margin-right:5px;';
    button.textContent = '';
    button.appendChild(wp.element);
    const _lbl = document.createElement('span');
    _lbl.textContent = busyLabel;
    _lbl.style.verticalAlign = 'middle';
    button.appendChild(_lbl);
    try {
      if (typeof onStart === 'function') onStart();
      await fix.action(panel, sourceText);
    } catch (err) {
      console.error('[cookbook] diagnosis fix failed', err);
    } finally {
      if (button.isConnected) {
        try { wp.destroy(); } catch {}
        button.textContent = _orig;
        delete button.dataset.busy;
      }
      if (typeof onDone === 'function') onDone();
    }
  };

  if (fixes.length) {
    // Always render fixes as inline buttons. The old "Actions ▾" dropdown
    // (for >3 fixes) was broken — the menu wouldn't open in some panels and
    // hid useful actions behind a non-working affordance. Inline buttons wrap
    // naturally in `.cookbook-diag-fixes` (flex-wrap) so a long list reflows
    // onto multiple rows instead of getting collapsed.
    const row = document.createElement('div');
    row.className = 'cookbook-diag-fixes';
    for (const fix of fixes) {
      const btn = document.createElement('button');
      btn.className = 'cookbook-btn cookbook-diag-btn';
      btn.type = 'button';
      btn.innerHTML = _diagFixIcon(fix.kind) + '<span class="cookbook-diag-btn-label">' + _diagEsc(fix.label) + '</span>';
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        runFix(fix, btn);
      });
      row.appendChild(btn);
    }
    diag.appendChild(row);
  }
}

export function _clearDiagnosis(panel) {
  panel._lastDiagMsg = null;
  const diag = panel.querySelector('.cookbook-diagnosis');
  if (diag) { diag.innerHTML = ''; diag.classList.add('hidden'); }
}
