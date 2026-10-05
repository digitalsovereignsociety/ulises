// static/js/i18n.js
// Lightweight translation engine — zero deps, JSON locale files, dot-path keys.

import { get, set } from './storage.js'

const STORAGE_KEY = 'ulises-lang'
const FALLBACK_LANG = 'en'

let _locale = null
let _fallbackLocale = null
let _lang = FALLBACK_LANG
let _ready = false

function _resolve(obj, path) {
  const parts = path.split('.')
  for (const p of parts) {
    if (!obj || typeof obj !== 'object') return null
    obj = obj[p]
  }
  return obj !== undefined ? obj : null
}

function _interpolate(str, vars) {
  if (!vars) return str
  return str.replace(/\{\{(\w+)\}\}/g, (_, k) =>
    vars[k] !== undefined ? String(vars[k]) : `{{${k}}}`
  )
}

function _detectLanguage() {
  const saved = get(STORAGE_KEY)
  if (saved) return saved
  const nav = (navigator.language || FALLBACK_LANG).split('-')[0]
  return nav || FALLBACK_LANG
}

async function _loadLocale(lang) {
  try {
    const resp = await fetch(`/api/i18n/${lang}`)
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
    return await resp.json()
  } catch (e) {
    if (lang !== FALLBACK_LANG) return _loadLocale(FALLBACK_LANG)
    console.warn(`[i18n] No locale for "${lang}", using empty fallback`)
    return {}
  }
}

const _reportedMissing = new Set()

// Turn a bare key into something readable: 'admin.add_directory' -> 'Add directory'.
// Used only as the last resort, so a key with no translation anywhere renders as
// prose instead of leaking 'admin.add_directory' into the UI.
function _humanizeKey(key) {
  const tail = String(key).split('.').pop() || String(key)
  const words = tail.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim()
  if (!words) return String(key)
  return words.charAt(0).toUpperCase() + words.slice(1)
}

export function t(key, vars) {
  let val = _resolve(_locale, key)
  if (val === null && _fallbackLocale) {
    val = _resolve(_fallbackLocale, key)
  }
  if (val === null) {
    // Warn once per key. The key is still returned humanized rather than
    // verbatim: a missing translation should look like untranslated UI, not
    // like a crash. tests/test_i18n_html_coverage.py is the gate that keeps
    // this list from growing — it fails on any t() key missing from a locale.
    if (!_reportedMissing.has(key)) {
      _reportedMissing.add(key)
      console.warn(`[i18n] missing translation for "${key}"`)
    }
    val = _humanizeKey(key)
  }
  return _interpolate(val, vars)
}

function _applyTranslations(root) {
  root = root || document
  root.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n')
    el.textContent = t(key)
  })
  // For strings that legitimately contain markup (<code>, <a>, <b>, the
  // <span class="k"> keyword prefix on the rich input hints). `data-i18n` uses
  // textContent, which would flatten that markup, so these keys carry HTML and
  // are applied as innerHTML. Never interpolate untrusted values into one.
  root.querySelectorAll('[data-i18n-html]').forEach(el => {
    const key = el.getAttribute('data-i18n-html')
    el.innerHTML = t(key)
  })
  root.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    el.setAttribute('placeholder', t(el.getAttribute('data-i18n-placeholder')))
  })
  root.querySelectorAll('[data-i18n-title]').forEach(el => {
    el.setAttribute('title', t(el.getAttribute('data-i18n-title')))
  })
  root.querySelectorAll('[data-i18n-aria-label]').forEach(el => {
    el.setAttribute('aria-label', t(el.getAttribute('data-i18n-aria-label')))
  })
  root.querySelectorAll('[data-i18n-value]').forEach(el => {
    el.value = t(el.getAttribute('data-i18n-value'))
  })
}

export function setLanguage(code) {
  _lang = code
  _ready = false
  return _loadLocale(code).then(locale => {
    _locale = locale
    _ready = true
    set(STORAGE_KEY, code)
    _applyTranslations()
    document.documentElement.lang = code
    window.dispatchEvent(new CustomEvent('languagechange', { detail: { lang: code } }))
  })
}

export async function init() {
  _lang = _detectLanguage()
  // Use preloaded locale data if available (injected by server for login page)
  // to eliminate the English-flash before translations load.
  if (window.__preloadedLocale && window.__preloadedFallback) {
    if (_lang === window.__preloadedLang) {
      _locale = window.__preloadedLocale
    } else {
      _locale = _lang === FALLBACK_LANG ? window.__preloadedFallback : await _loadLocale(_lang)
    }
    _fallbackLocale = window.__preloadedFallback
    delete window.__preloadedLocale
    delete window.__preloadedFallback
    delete window.__preloadedLang

    // Revalidate. The snapshot is inlined into HTML that the service worker
    // precaches ('/' is in PRECACHE) and serves cache-first with a background
    // refresh, so a cached copy of index.html carries whatever keys it had when
    // it was cached. Trusting it outright meant every i18n batch was one load
    // behind, with the console full of "missing translation" for keys that were
    // on the server — including ones added minutes earlier. Hydrate from the
    // snapshot so there is no flash, then replace it with the live data.
    try {
      const fresh = await _loadLocale(_lang)
      if (fresh && Object.keys(fresh).length) _locale = fresh
      const freshFallback = await _loadLocale(FALLBACK_LANG)
      if (freshFallback && Object.keys(freshFallback).length) _fallbackLocale = freshFallback
    } catch (e) {
      // Offline, or the API is down: the snapshot is all we have, so keep it.
    }
  } else {
    _fallbackLocale = await _loadLocale(FALLBACK_LANG)
    _locale = _lang === FALLBACK_LANG ? _fallbackLocale : await _loadLocale(_lang)
  }
  _ready = true
  _applyTranslations()
  document.documentElement.lang = _lang
}

export function getCurrentLang() {
  return _lang
}

export function isReady() {
  return _ready
}

export function reapply(root) {
  _applyTranslations(root)
}

// --- Pluralisation ---

export function tn(key, count, vars) {
  const msg = t(key)
  if (!msg || msg === key) return msg
  const parts = msg.split('|')
  const form = count === 1 ? parts[0] : (parts[1] || parts[0])
  const allVars = Object.assign({}, vars, { count })
  return form.replace(/\{\{(\w+)\}\}/g, (_, k) =>
    allVars[k] !== undefined ? String(allVars[k]) : `{{${k}}}`
  )
}

// --- Number / date formatting ---

export function formatNumber(value, options) {
  try {
    return new Intl.NumberFormat(_lang, options).format(value)
  } catch {
    return String(value)
  }
}

export function formatDate(date, options) {
  try {
    const d = date instanceof Date ? date : new Date(date)
    return new Intl.DateTimeFormat(_lang, options).format(d)
  } catch {
    return String(date)
  }
}
