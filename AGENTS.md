# Ulises — AI Agent Guide

## Stack
Python 3.10+ · FastAPI · SQLAlchemy 2.0+ (SQLite) · ChromaDB · vanilla ES6 modules

## Layout
| Directory | Purpose |
|-----------|---------|
| `routes/` | FastAPI route handlers (one per domain) |
| `src/` | Business logic (LLM, RAG, search, tools, memory) |
| `core/` | Shared abstractions (db, auth, middleware, models) |
| `services/` | Subsystems (memory, search, research, TTS, STT, shell) |
| `static/js/` | Frontend ES6 modules (155 files incl. subdirs, no build step) |
| `tests/` | pytest tests (~670 files, asyncio_mode=auto) |

## Conventions
- **snake_case** for Python identifiers, **kebab-case** for URL paths
- Route modules export `setup_*_routes(...)` factory returning `APIRouter`
- Auth guard: `require_admin(request)` from `core/middleware`
- i18n: `t("namespace.key")` in Python, `t('namespace.key')` in JS
- Error responses: `{"error": "CODE", "message": "..."}` or `HTTPException`

## Run
```bash
python -m uvicorn app:app --host 127.0.0.1 --port 7000
```

Docker (the container runs `setup.py` on boot, so admin credentials in `.env`
must use the `ULISES_ADMIN_*` names — see Known Issues):

```bash
docker compose up -d --build      # http://127.0.0.1:7000
```

> The host `docker` group GID rarely matches the compose default (963). If the
> socket mount misbehaves, put the real GID in `.env` as `DOCKER_GID=<gid>`.

## Test
```bash
python -m pytest tests/ -v -x
```

There is no local venv guaranteed to have the deps; running the suite in the
compose image works and needs no extra image:

```bash
docker run --rm --entrypoint /bin/bash -v "$PWD":/app -w /app ulises-ulises:latest -c \
  'pip install -q -r requirements-dev.txt && mkdir -p data && python -m pytest -q'
```

## i18n
See [MULTILANG.md](MULTILANG.md) for the multilanguage system. Current state:
74 namespaces, 1898 keys, `en` and `es` in lockstep (enforced by
`tests/test_locale_files.py`).

`tests/test_i18n_html_coverage.py` is the gate that matters:
- every `data-i18n*` attribute in `static/*.html` must resolve in every locale
- every `t()` / `tn()` key used in JS must resolve in every locale
- the `{{vars}}` passed to `t()` must match the ones the locale string expects
- keys carrying HTML (`data-i18n-html`) must keep balanced markup

`tests/i18n_missing_keys_baseline.txt` is a **ratchet**: it is empty. A future
`t()` key with no translation must either be added to `en`+`es` or recorded
there; the suite fails on keys missing from the baseline, and fails again when a
baseline entry becomes translated (the signal to delete the line).

Not covered by any test: strings used **without** a key. Those are the remaining
i18n debt.

## Work State

### Objective
Get CI green across all test suites and Docker build for the Ulises project.

### Status
`pytest -q` → **4469 passed, 4 skipped, 0 failed** (was 61 failures at the
start of this work). `python -m compileall` and `node --check` over all 157 JS
files are clean. All relative import specifiers resolve. Four node-level suites
guard the JS: `cookbook_modules_smoke`, `cookbook_diagnosis_core`,
`token_scope_labels`, `enum_keys_not_localised`, `compare_prompts`,
`cookbook_diag_fix_shape`, `i18n_fallback`.

### Known Issues
- **Untranslated strings (i18n debt)** — no test covers strings used WITHOUT a
  key, so nothing in CI catches them. A sweep of `static/js` for literals
  assigned to `textContent` / `innerHTML` / `placeholder` / `title`, to dialog
  and toast helpers, to `setAttribute`, and to `label:` / `title:` / `sub:` /
  `suggestion:` fields counts **378 distinct values in 45 files**. Treat it as a
  ceiling, not a tally. Largest offenders: `cookbook-hwfit.js` 31,
  `tasks.js` 26, `settings.js` 24, `skills.js` 23, `sessions.js` 21,
  `gallery.js` 18, `modalManager.js` 15. 33 further files hold ≤5 each.

  Three traps in this work, each of which cost real time:
  - A literal with an embedded English fragment inside a template expression
    (a ternary branch, a concatenated fragment) does not match a naive literal
    scan. Six strings beginning with a lowercase letter were missed until a
    second pass.
  - Display text parsed back out of a display string is not localisable. This
    repo has **six** instances of one string doing two or three jobs at once —
    token-scope names in `admin.js` and `settings.js` (English suffix stripped
    off a label), the compare eval catalog's `sub`/`label`, message-variant
    `label` in `chat.js`, and the diagnosis `label` in
    `cookbook-diagnosis-core.js`, which was simultaneously visible text, the
    argument to an icon classifier, and the left side of an `===` dedupe. All
    are pinned by the node suites listed under Status.
  - The scan has a known blind spot: it keys on field *names*, so an object
    literal using an identifier as the key is missed — `modeLabels = { chat:
    'Chat' }` in `compare/scoreboard.js` slipped through until it was found by
    hand, thirty lines below the correct version of the same mapping. There may
    be more.

  `static/index.html` is still unmeasured. Two earlier attempts at counting it
  were wrong because the regexes read inline `<script>` bodies as markup. It
  needs a real parse; `static/login.html` is done.

- **No browser-level test.** Everything above is static analysis or headless
  node. Three real runtime bugs (`esc`, `_cookbookOpeningSpinners`,
  `allowNetwork`) shipped because no check evaluated the modules in a browser.
  `tests/cookbook_modules_smoke.test.mjs` covers the cookbook graph, but the
  SPA itself is unverified.
- **Pre-existing import cycles** outside Cookbook: `admin → ui ↔ theme` and
  `emailInbox ↔ emailLibrary`.
- **`/backgrounds` is dead**: the route says "No auth required" but
  `static/backgrounds.html` does not exist in the repo. Masked because auth
  redirects to `/login` before the handler runs. Restore the page or drop the
  route.
- **Env var rename.** Commit `d13276a` renamed `ODYSSEUS_*` → `ULISES_*`.
  `setup.py` now accepts both, but a pre-rename `.env` silently configured
  nothing before that. Only the admin vars have a fallback.
- **Two signing identities.** The 1142 pre-existing commits are signed with SSH
  key `B5690EEEBB952194`; commits since `9cbc6af` use GPG `E791C5B7A60B5A80`
  (chosen deliberately). There is no `allowedSignersFile`, so the older ones
  verify as `E` (unchecked) rather than `G`. Tag `pre-gpg-sign-20261004` points
  at the pre-rewrite HEAD and is no longer needed. Note `tag.gpgSign = true` in
  the global config, which makes a plain `git tag` open an editor.
- **41 of 80 diagnosis fixes render the generic `default` icon.** The icon
  classifier recognised 12 English verbs; the other verbs (Check, Lower, Try,
  Update…) fell through to the lightbulb. This was left as-is on purpose when
  `kind` became an explicit enum, so no button changes appearance. Adding icons
  is now trivial and is a design decision, not a refactor.

### Completed
- 12 commits fixing runtime bugs, each with a regression test: `/login` 500
  (`_cached_translations` did not exist), `/login` sending `content-length` then
  zero bytes (`response.body` mutated after construction), `esc` /
  `_cookbookOpeningSpinners` / `allowNetwork` unbound identifiers that broke the
  Cookbook, legacy `ODYSSEUS_ADMIN_*` ignored, and two interpolation bugs
  (`admin.removed_offroom` raw `{{s}}`, `calendar.reminder_title` dropping
  `{{summary}}`).
- Removed the dead `initForegroundActivityHeartbeat` (posted to a
  non-existent `/api/activity/heartbeat` every 15s) and the `content.js`
  confusion documented in Known Issues.
- Split the cookbook import graph: `cookbook-diagnosis-core.js` is a leaf,
  which eliminated the last two Cookbook cycles. `t()` now humanises a missing
  key instead of leaking `some.key` into the UI.
- Service worker bumped to `v328` with the cookbook sub-modules precached.
- **i18n: 655 missing `t()` keys → 0.** Ten batches across every namespace,
   en+es in lockstep. The ratchet keeps it at zero.
- `{{var}}` → `{var}` in both locale files for Python `.format()` compat.
- Added `cookbook.diagnosis.*` (21 keys) + `invalid_remote_host` to both locales.
- Fixed validator namespace (`validation.*` → `validators.*`).
- Registered `ADMIN_TOOL_HANDLERS` in `TOOL_HANDLERS`.
- Fixed `_active_document_relevant` NameError in `src/agent_loop.py`.
- Standardised file-too-large error messages across chat_helpers, upload_handler, upload_limits.
- Added `start_time`/`end_time` to calendar alias list; `query_raw` partial-range rejection.
- `read_byte_limit_env` falls back to legacy `ODYSSEUS_*` vars.
- Restored `vet_workspace()` in `src/tool_execution.py`.
- Updated test paths for memory_routes shim; fixed upload-limits assertion.
- `WebFetchTool.execute` prepends `[partial content: ...]` when `result.truncated`.
- Webhook tests assert `X-Ulises-Event` (not `X-Odysseus-Event`).
- Workspace confinement: grep/glob/ls tools receive `workspace` in ctx.
- Locale files split from 4 monolithic JSONs into per-namespace directories.
- `core/translations.py` loads from directory using `dict.update()`.
- `GET /api/i18n/{lang}` endpoint; `static/js/i18n.js` fetches from API.
- `./i18n.js` import stubbed in markdown JS test harnesses.
- `GlobTool._glob` wraps `p.relative_to(base)` in `try/except ValueError` → `continue`.
- `WebFetchTool.execute` parses `full` param and passes `max_bytes=WEB_FETCH_HARD_MAX_BYTES`.
- `numpy<2.0.0` → `numpy<3.0.0` in requirements.txt; `chromadb-client<1.0.0` → `<2.0.0` so Docker build resolves on Python 3.13.
- `str | None` → `Optional[str]` in `core/translations.py:48` for Python 3.9 compat.
- `GlobTool`: fall back to workspace root (instead of error) when `_resolve_search_root` rejects escaping paths; catch `NotImplementedError` from `rglob` with absolute patterns → treat as no match.
- `GrepTool`: reverted to returning `exit_code: 1` for out-of-workspace paths (consistent with `LsTool`; test expects explicit error for grep/ls, but silent no-match for glob).
- `bytes | str` → `Union[bytes, str]` in `src/llm_core.py` (two function signatures) for Python 3.9 compat; unblocks test collection blocked when conftest.py → core.models → src.llm_core.
