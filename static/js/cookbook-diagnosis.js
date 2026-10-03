// ============================================
// COOKBOOK DIAGNOSIS SUB-MODULE
// Dependencies deep-link + quick command.
//
// The error-pattern table and the diagnosis renderer now live in
// cookbook-diagnosis-core.js (a leaf). They are re-exported here because
// cookbook.js, cookbook-hwfit.js and cookbookServe.js import them from this
// module, and cookbookRunning.js / cookbookDownload.js used to create an
// import cycle by doing the same.
import {
  _envState,
  _sshCmd,
} from './cookbook-shared.js';

// Re-exported for existing importers of cookbook-diagnosis.js.
export {
  ERROR_PATTERNS,
  _diagnose,
  _showDiagnosis,
  _clearDiagnosis,
} from './cookbook-diagnosis-core.js';


// Re-exported so callers (Launch-tab pre-flight) can deep-link into the
// Dependencies tab + auto-expand a specific backend's recipe panel and
// pre-select the model they were trying to launch.
export function openCookbookDependencies(pkgName = '', opts = {}) {
  _openCookbookDependencies(pkgName, opts);
}
function _openCookbookDependencies(pkgName = '', opts = {}) {
  const cookbook = window.cookbookModule;
  if (cookbook && typeof cookbook.open === 'function') {
    cookbook.open({ tab: 'Dependencies' });
  } else {
    document.getElementById('tool-cookbook-btn')?.click();
  }

  const wanted = String(pkgName || '').toLowerCase();
  const tryHighlight = (attempt = 0) => {
    const modal = document.getElementById('cookbook-modal');
    const tab = modal?.querySelector('.cookbook-tab[data-backend="Dependencies"]');
    if (tab && !tab.classList.contains('active')) tab.click();

    const rows = [...document.querySelectorAll('#cookbook-deps-list [data-pkg-name]')];
    if (!rows.length) {
      if (attempt < 45) setTimeout(() => tryHighlight(attempt + 1), 100);
      return;
    }
    if (!wanted) return;
    const row = rows.find(r => {
      const name = (r.dataset.pkgName || '').toLowerCase();
      const pip = (r.dataset.depPip || '').toLowerCase();
      return name === wanted || pip.includes(wanted) || wanted.includes(name);
    });
    if (row) {
      row.scrollIntoView({ block: 'center' });
      row.classList.add('cookbook-pkg-flash');
      setTimeout(() => row.classList.remove('cookbook-pkg-flash'), 1800);
      // Pre-flight deep link: auto-expand the recipe panel + pre-select
      // the model the user was trying to launch. The dropdown values are
      // now full model ids (sourced from _cachedModelIds), so we match by
      // exact value first, then fall back to a substring match.
      if (opts.expandRecipe) {
        const caret = row.querySelector('[data-dep-recipe-toggle]');
        if (caret && caret.getAttribute('aria-expanded') !== 'true') caret.click();
        if (opts.model) {
          const sel = document.querySelector(`[data-dep-recipe-pick="${CSS.escape(opts.expandRecipe)}"]`);
          if (sel) {
            const wanted = String(opts.model);
            let matched = false;
            for (let i = 0; i < sel.options.length; i++) {
              if (sel.options[i].value === wanted) {
                sel.value = wanted; matched = true; break;
              }
            }
            if (!matched) {
              for (let i = 0; i < sel.options.length; i++) {
                if (sel.options[i].value && wanted.includes(sel.options[i].value)) {
                  sel.value = sel.options[i].value; matched = true; break;
                }
              }
            }
            if (matched) sel.dispatchEvent(new Event('change'));
          }
        }
      }
    }
  };
  tryHighlight();
}

// ── Quick command ──

export async function _runQuickCmd(panel, cmd) {
  let fullCmd = cmd;
  if (_envState.remoteHost) {
    fullCmd = _sshCmd(_envState.remoteHost, cmd);
  }
  const diag = panel.querySelector('.cookbook-diagnosis');
  if (diag) { diag.classList.remove('hidden'); diag.textContent = `Running: ${fullCmd}...`; }

  try {
    const res = await fetch('/api/shell/stream', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ command: fullCmd }),
    });
    if (diag) diag.textContent = res.ok ? `Done: ${cmd}` : `Failed (HTTP ${res.status})`;
  } catch (e) {
    if (diag) diag.textContent = `Error: ${e.message}`;
  }
}
