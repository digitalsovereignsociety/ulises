// ============================================
// COOKBOOK SHARED STATE & UTILITIES
// Leaf module — no imports from other cookbook
// modules. Breaks the circular dependency between
// cookbook.js ↔ cookbook-diagnosis.js / cookbook-hwfit.js.
// ============================================

import uiModule from './ui.js';
import { providerLogo } from './providers.js';

// ── Shared mutable state ──

export let _envState = {
  env: 'none', envPath: '', hfToken: '', hfTokenConfigured: false,
  hfTokenMasked: '', gpus: '', remoteHost: '', servers: [],
  modelPaths: [], platform: '', hostPlatform: '', defaultServer: '',
};

// ── Cache host accessors ──

let _lastCacheHostVal = null;
export function _lastCacheHost() { return _lastCacheHostVal; }
export function _setLastCacheHost(v) { _lastCacheHostVal = v; }

// ── Server utilities ──

function _isLocalEntry(s) {
  return !s || !s.host || s.host === 'local' || s.host.toLowerCase() === 'localhost';
}

export function _serverKey(s) {
  if (_isLocalEntry(s)) return 'local';
  return 'srv:' + [
    s?.name || '', s?.host || '', s?.port || '',
    s?.envPath || '', s?.platform || '',
  ].map(v => encodeURIComponent(String(v).trim())).join('|');
}

export function _serverByVal(val) {
  if (val == null || val === 'local' || val === '') return null;
  const raw = String(val);
  let s = _envState.servers.find(x => _serverKey(x) === raw);
  if (!s) s = _envState.servers.find(x => x.host === raw);
  if (!s) s = _envState.servers.find(x => x.name === raw);
  if (!s && /^\d+$/.test(String(val))) s = _envState.servers[parseInt(val)];
  return s || null;
}

export function _selectedServer() {
  if (_envState.remoteServerKey) {
    const keyed = _serverByVal(_envState.remoteServerKey);
    if (keyed) return keyed;
  }
  if (_envState.remoteHost) return _envState.servers.find(s => s.host === _envState.remoteHost) || null;
  return null;
}

export function _currentServerValue() {
  const selected = _selectedServer();
  if (selected) return _serverKey(selected);
  return _envState.remoteHost || 'local';
}

export { _isLocalEntry };

// ── Shell / SSH utilities ──

export function _sshCmd(host, cmd, port) {
  const portFlag = port && port !== '22' ? `-p ${port} ` : '';
  return `ssh ${portFlag}${host} '${cmd.replace(/'/g, "'\\''")}'`;
}

export function _shellQuote(value) {
  return "'" + String(value ?? '').replace(/'/g, "'\\''") + "'";
}

// ── Clipboard ──

function _fallbackCopy(text) {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.cssText = 'position:fixed;left:-9999px;top:-9999px';
  document.body.appendChild(ta);
  ta.select();
  try { document.execCommand('copy'); } catch (_) {}
  document.body.removeChild(ta);
  return Promise.resolve();
}

export function _copyText(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    return navigator.clipboard.writeText(text).catch(() => _fallbackCopy(text));
  }
  return _fallbackCopy(text);
}

// ── Persistence ──

const LAST_STATE_KEY = 'cookbook-last-state';

function _envStateForStorage() {
  const { hfToken, ...safeState } = _envState;
  return safeState;
}

export function _persistEnvState() {
  try { localStorage.setItem(LAST_STATE_KEY, JSON.stringify(_envStateForStorage())); }
  catch (_) {}
}

// ── UI constants ──

export const _MODELDIR_CHECK_OFF = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/></svg>';
export const _MODELDIR_CHECK_ON = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><polyline points="8 12 11 15 16 9"/></svg>';

/** Get inline logo HTML for a model name/repo_id */
export function modelLogo(name) {
  const logo = providerLogo(name);
  const svg = logo || '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="4"/></svg>';
  return `<span style="width:12px;height:12px;display:inline-flex;align-items:center;vertical-align:-2px;margin-right:3px;opacity:${logo ? '0.5' : '0.2'};">${svg}</span>`;
}

// Use shared esc() from ui module
export const esc = uiModule.esc;

// ── Backend detection ──
// Refactored to use window._hwfitSystemCache instead of importing
// _hwfitCache from cookbook-hwfit.js (breaks the circular dep).

function _isStepFunStepModel(modelName) {
  const n = (modelName || '').toLowerCase();
  return n.includes('step') && (n.includes('3') || n.includes('step-3'));
}

export function _detectReasoningParser(modelName) {
  const n = (modelName || '').toLowerCase();
  if (_isStepFunStepModel(modelName)) return 'step3p5';
  if (n.includes('minimax') && /\bm3\b/.test(n)) return 'minimax_m3';
  if (n.includes('minimax') && n.match(/\bm2(?:\.\d)?\b/)) return 'minimax_m2';
  if (n.includes('deepseek') && (n.includes('r1') || n.includes('thinking'))) return 'deepseek_r1';
  if (n.includes('qwen3') && !n.includes('coder') && !n.includes('instruct')) return 'qwen3';
  if (n.includes('glm-4') || n.includes('glm-5')) return 'glm45';
  if (n.includes('gpt-oss')) return 'gpt_oss';
  if (n.includes('hunyuan') && n.includes('a13b')) return 'hunyuan_a13b';
  if (n.includes('granite') && (n.includes('reason') || n.includes('think'))) return 'granite';
  if (n.includes('internlm')) return 'internlm';
  return null;
}

export function _detectToolParser(modelName) {
  const n = (modelName || '').toLowerCase();
  if (_isStepFunStepModel(modelName)) return 'step3p5';
  if (n.includes('qwen3') && n.includes('coder')) return 'qwen3_coder';
  if (n.includes('qwen3')) return 'qwen3_xml';
  if (n.includes('qwen')) return 'hermes';
  if (n.includes('llama-4') || n.includes('llama4')) return 'llama4_json';
  if (n.includes('llama') || n.includes('nemotron')) return 'llama3_json';
  if (n.includes('mistral') || n.includes('mixtral')) return 'mistral';
  if (n.includes('deepseek-v3')) return 'deepseek_v3';
  if (n.includes('deepseek')) return 'deepseek_v3';
  if (n.includes('minimax') && /\bm3\b/.test(n)) return 'minimax_m3';
  if (n.includes('minimax') && n.includes('m2')) return 'minimax_m2';
  if (n.includes('minimax')) return 'minimax';
  if (n.includes('gemma')) return 'pythonic';
  if (n.includes('glm-4')) return 'glm45';
  if (n.includes('internlm')) return 'internlm';
  if (n.includes('granite')) return 'granite';
  return 'hermes';
}

export function _detectBackend(model) {
  const _ollamaName = String(model?.repo_id || model?.name || model?.id || '').trim();
  const _ollamaMeta = `${model?.backend || ''} ${model?.endpoint_kind || ''} ${model?.provider || ''} ${model?.source || ''}`.toLowerCase();
  const _looksLikeOllamaTag = /^[A-Za-z0-9][A-Za-z0-9._-]*(?::[A-Za-z0-9][A-Za-z0-9._-]*)$/.test(_ollamaName);
  if (model?.backend === 'ollama' || model?.is_ollama || _ollamaMeta.includes('ollama') || _looksLikeOllamaTag) {
    return { backend: 'ollama', label: 'Ollama' };
  }
  const q = (model.quant || '').toUpperCase();
  const sysBackend = String(window._hwfitSystemCache?.backend || '').toLowerCase();
  const isRocm = sysBackend === 'rocm';
  const _nm = `${model.repo_id || ''} ${model.path || ''} ${model.name || ''}`.toLowerCase();
  if (/\bmlx\b|mlx-|_mlx/i.test(_nm) || q.startsWith('MLX')) {
    return { backend: 'unsupported', label: 'Unsupported' };
  }
  const isAwqLike = /^AWQ|^GPTQ|^NVFP4/.test(q) || ['FP8', 'FP4', 'MXFP4', 'NF4', 'INT4', 'INT8', 'W4A16', 'W8A8', 'W8A16'].includes(q) || /\b(awq|gptq|fp8|fp4|nvfp4|mxfp4|nf4|int4|int8|w4a16|w8a8|w8a16)\b/i.test(_nm);
  const hasGgufFile = Array.isArray(model.gguf_files)
    && model.gguf_files.some(f => f && typeof f.rel_path === 'string' && /\.gguf$/i.test(f.rel_path));
  const isGgufLike = model.is_gguf || hasGgufFile || /^Q[2-8]/.test(q) || /^IQ/.test(q) || q === 'GGUF' || _nm.includes('gguf');

  if (model.is_image_gen || model.is_diffusion || model._tag === 'image') {
    return { backend: 'diffusers', label: 'Diffusers' };
  }
  if (isAwqLike) {
    return { backend: 'vllm', label: 'vLLM' };
  }
  if (isGgufLike) {
    return { backend: 'llamacpp', label: 'llama.cpp' };
  }
  if (sysBackend === 'cuda') {
    return { backend: 'vllm', label: 'vLLM' };
  }
  if (['metal', 'mps', 'apple'].includes(sysBackend)) {
    return { backend: 'llamacpp', label: 'llama.cpp' };
  }
  if (isRocm) {
    return { backend: 'sglang', label: 'SGLang' };
  }
  return { backend: 'vllm', label: 'vLLM' };
}

// ── Server entry HTML builder ──

function _platformIcon(platform) {
  const k = (platform || '').toLowerCase();
  if (k === 'windows') {
    return '<svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M3 4.6l8-1.2v8.1H3V4.6zm9-1.3L21 2v9.5h-9V3.3zM3 12.5h8v8.1l-8-1.2v-6.9zm9 0h9V22l-9-1.3v-8.2z"/></svg>';
  }
  if (k === 'termux' || k === 'android') {
    return '<svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M7 9h10v6.6a1 1 0 0 1-1 1h-.7v2.6a1.15 1.15 0 1 1-2.3 0V16.6h-1.5v2.6a1.15 1.15 0 1 1-2.3 0V16.6H8a1 1 0 0 1-1-1V9zM4.3 9.1a1.15 1.15 0 0 1 2.3 0v4.6a1.15 1.15 0 1 1-2.3 0V9.1zm13.1 0a1.15 1.15 0 0 1 2.3 0v4.6a1.15 1.15 0 1 1-2.3 0V9.1zM8 8a4 4 0 0 1 8 0H8zm1.7-2.6-.8-1.2a.28.28 0 0 1 .47-.3l.83 1.25a4.8 4.8 0 0 1 3.66 0l.83-1.25a.28.28 0 0 1 .47.3L14.3 5.4M9.8 6.6a.62.62 0 1 0 0-1.24.62.62 0 0 0 0 1.24zm4.4 0a.62.62 0 1 0 0-1.24.62.62 0 0 0 0 1.24z"/></svg>';
  }
  if (k === 'linux' || k === 'termux-linux') {
    return '<svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M12 2a4 4 0 0 0-4 4v4.7c0 .9-.4 1.7-1 2.4-1.2 1.4-2 3-2 4.5C5 20.4 8.1 22 12 22s7-1.6 7-4.4c0-1.5-.8-3.1-2-4.5-.6-.7-1-1.5-1-2.4V6a4 4 0 0 0-4-4zm-1.7 4.8a1 1 0 1 1 0 2 1 1 0 0 1 0-2zm3.4 0a1 1 0 1 1 0 2 1 1 0 0 1 0-2zM12 9.4c.75 0 1.4.45 1.7 1.1h-3.4c.3-.65.95-1.1 1.7-1.1z"/></svg>';
  }
  return '';
}

export function _serverEntryHtml(s, i, defaultServer, forceRemote, isNew) {
  const isLocal = (forceRemote || isNew) ? false : (!s.host || s.host === 'local');
  const envOpts = [['none', 'None'], ['venv', 'venv'], ['conda', 'conda']].map(([value, label]) => `<option value="${value}"${s.env === value ? ' selected' : ''}>${label}</option>`).join('');
  let html = '';
  html += `<div class="cookbook-server-entry" data-idx="${i}" data-platform="${esc(s.platform || '')}">`;
  const _srvTitle = s.name || (isLocal ? 'Local' : (s.host || `Server ${i + 1}`));
  const _srvKey = isLocal ? 'local' : (s.host || '');
  const _isDefaultSrv = (defaultServer || '') === _srvKey;
  const _pIco = _platformIcon(s.platform);
  const _keyBtn = `<button class="cookbook-server-key-btn" title="Set up SSH key for this server" style="height:22px;box-sizing:border-box;display:inline-flex;align-items:center;position:relative;top:-2px;"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:4px;flex-shrink:0;"><circle cx="7.5" cy="15.5" r="5.5"/><path d="M12 11l8-8"/><path d="M17 6l3 3"/></svg>Key</button>`;
  const _checkBtn = `<button class="cookbook-server-check-btn" title="Check SSH connection" style="height:22px;box-sizing:border-box;display:inline-flex;align-items:center;position:relative;top:-2px;"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:4px;flex-shrink:0;"><polyline points="20 6 9 17 4 12"/></svg>Check</button>`;
  html += `<span class="cookbook-server-title" style="display:flex;align-items:center;gap:6px;width:100%;font-size:13px;font-weight:600;margin-bottom:4px;">`;
  html += `${esc(_srvTitle)}`;
  html += _pIco ? `<span class="cookbook-srv-platform" title="${esc(s.platform || '')}" style="display:inline-flex;align-items:center;opacity:0.55;">${_pIco}</span>` : '';
  html += `<span class="cookbook-srv-test-msg" style="font-size:10px;font-weight:400;opacity:0.55;max-width:160px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;position:relative;top:1px;"></span>`;
  if (isNew) {
    html += `<span style="margin-left:auto;display:inline-flex;gap:4px;align-items:center;">${_checkBtn}${_keyBtn}<button class="cookbook-server-cancel-btn" title="Discard this new server" style="height:22px;box-sizing:border-box;display:inline-flex;align-items:center;position:relative;top:-2px;"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:4px;flex-shrink:0;"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>Cancel</button></span>`;
  } else {
    html += `<span style="margin-left:auto;display:inline-flex;gap:4px;align-items:center;">${!isLocal ? _checkBtn + _keyBtn : ''}<span class="cookbook-srv-default${_isDefaultSrv ? ' active' : ''}" title="${_isDefaultSrv ? 'Default server — Cookbook opens here' : 'Make this the default server'}" data-srv-key="${esc(_srvKey)}">${_isDefaultSrv ? _MODELDIR_CHECK_ON : _MODELDIR_CHECK_OFF}<span class="cookbook-srv-default-label">default</span></span></span>`;
  }
  html += `</span>`;
  html += `<div class="cookbook-server-row">`;
  html += `<label style="font-size:11px;opacity:0.5;min-width:38px;">Host</label>`;
  html += `<input class="cookbook-server-host" value="${esc(s.host || '')}" placeholder="localhost" style="flex:1;min-width:0;">`;
  html += `</div>`;
  html += `<div class="cookbook-server-row">`;
  html += `<label style="font-size:11px;opacity:0.5;min-width:38px;">Name</label>`;
  html += `<input class="cookbook-server-name" value="${esc(s.name || '')}" placeholder="Optional label" style="flex:1;min-width:0;">`;
  html += `</div>`;
  html += `<div class="cookbook-server-row">`;
  html += `<label style="font-size:11px;opacity:0.5;min-width:38px;">Port</label>`;
  html += `<input class="cookbook-server-port" value="${esc(s.port || '')}" placeholder="22" style="width:60px;">`;
  html += `<label style="font-size:11px;opacity:0.5;min-width:38px;margin-left:8px;">Env</label>`;
  html += `<select class="cookbook-server-env">${envOpts}</select>`;
  html += `</div>`;
  html += `<div class="cookbook-server-row">`;
  html += `<label style="font-size:11px;opacity:0.5;min-width:38px;">Path</label>`;
  html += `<input class="cookbook-server-envpath" value="${esc(s.envPath || '')}" placeholder="Optional venv/conda path" style="flex:1;min-width:0;">`;
  html += `</div>`;
  html += `<div class="cookbook-server-row">`;
  html += `<label style="font-size:11px;opacity:0.5;min-width:38px;">Dir</label>`;
  html += `<input class="cookbook-server-modeldir" value="${esc(s.modelDir || '')}" placeholder="Default model directory" style="flex:1;min-width:0;">`;
  html += `</div>`;
  if (!isNew) {
    html += `<div style="margin-top:4px;"><button class="cookbook-server-delete-btn" title="Remove this server" style="font-size:11px;opacity:0.5;background:none;border:none;color:inherit;cursor:pointer;padding:2px 0;">Remove</button></div>`;
  }
  html += `</div>`;
  return html;
}
