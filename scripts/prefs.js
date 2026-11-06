/*
 * Reader preferences shared by every page: language, colour theme and text scale.
 *
 * The three controls live in the header's `.nav-tools` area (see blocks/header/header.js).
 * The minimal "apply what was stored" step runs eagerly in scripts.js, before first paint,
 * so the page never flashes the wrong theme or text size. Keep the storage keys below in
 * sync with that snippet.
 */

export const STORAGE_KEYS = {
  theme: 'insper-global-theme',
  font: 'insper-global-font',
  lang: 'insper-global-lang',
};

/* 5 steps, mirroring the A-/A+ control of the legacy catalogue. Index 1 is the default. */
export const FONT_STEPS = [0.875, 1, 1.125, 1.25, 1.375];
export const DEFAULT_FONT_STEP = 1;

export const LANGUAGES = ['pt', 'en'];

/* UI chrome, not authored content: these labels never appear in a document. */
const LABELS = {
  pt: {
    language: 'Idioma',
    switchTo: 'Ver esta página em português',
    fontDown: 'Diminuir tamanho do texto',
    fontUp: 'Aumentar tamanho do texto',
    themeToDark: 'Mudar para o tema escuro',
    themeToLight: 'Mudar para o tema claro',
  },
  en: {
    language: 'Language',
    switchTo: 'View this page in English',
    fontDown: 'Decrease text size',
    fontUp: 'Increase text size',
    themeToDark: 'Switch to dark theme',
    themeToLight: 'Switch to light theme',
  },
};

export function readPref(key) {
  try {
    return window.localStorage.getItem(key);
  } catch (e) {
    return null;
  }
}

export function writePref(key, value) {
  try {
    window.localStorage.setItem(key, value);
  } catch (e) {
    // storage can be unavailable (private window, blocked site data); preferences
    // still apply for this page view
  }
}

/**
 * The language of the current page, taken from the first path segment (/pt/..., /en/...)
 * and falling back to the document language.
 * @returns {string} two letter language code
 */
export function currentLanguage() {
  const segment = window.location.pathname.split('/')[1];
  if (LANGUAGES.includes(segment)) return segment;
  const docLang = (document.documentElement.lang || LANGUAGES[0]).slice(0, 2).toLowerCase();
  return LANGUAGES.includes(docLang) ? docLang : LANGUAGES[0];
}

/**
 * The path of the current page in another language. Content lives under /pt/ and /en/,
 * so switching language is a navigation, not a client side re-render.
 * @param {string} lang two letter language code
 * @returns {string} path, query and hash of the counterpart page
 */
export function languagePath(lang) {
  const { pathname, search, hash } = window.location;
  const segments = pathname.split('/');
  if (LANGUAGES.includes(segments[1])) segments[1] = lang;
  else segments.splice(1, 0, lang);
  return `${segments.join('/')}${search}${hash}`;
}

/**
 * Applies a theme and remembers it.
 * @param {string} theme 'dark' or 'light'
 */
export function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  writePref(STORAGE_KEYS.theme, theme);
}

/**
 * Applies a text scale step and remembers it.
 * @param {number} step index into FONT_STEPS
 */
export function applyFontStep(step) {
  const clamped = Math.min(Math.max(step, 0), FONT_STEPS.length - 1);
  document.documentElement.style.setProperty('--fs', FONT_STEPS[clamped]);
  writePref(STORAGE_KEYS.font, String(clamped));
  return clamped;
}

function currentTheme() {
  if (document.documentElement.dataset.theme) return document.documentElement.dataset.theme;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function currentFontStep() {
  const stored = Number.parseInt(readPref(STORAGE_KEYS.font), 10);
  return Number.isNaN(stored) ? DEFAULT_FONT_STEP : stored;
}

function createLanguageSwitch(labels) {
  const active = currentLanguage();
  const group = document.createElement('div');
  group.className = 'prefs-group prefs-languages';
  group.setAttribute('role', 'group');
  group.setAttribute('aria-label', labels.language);

  LANGUAGES.forEach((lang) => {
    const link = document.createElement('a');
    link.className = 'prefs-button prefs-lang';
    link.href = languagePath(lang);
    link.lang = lang;
    link.textContent = lang.toUpperCase();
    link.title = LABELS[lang].switchTo;
    if (lang === active) link.setAttribute('aria-current', 'page');
    link.addEventListener('click', () => writePref(STORAGE_KEYS.lang, lang));
    group.append(link);
  });

  return group;
}

function createFontSwitch(labels) {
  const group = document.createElement('div');
  group.className = 'prefs-group prefs-fonts';
  let step = currentFontStep();

  const down = document.createElement('button');
  down.type = 'button';
  down.className = 'prefs-button prefs-font-down';
  down.textContent = 'A−';
  down.setAttribute('aria-label', labels.fontDown);

  const up = document.createElement('button');
  up.type = 'button';
  up.className = 'prefs-button prefs-font-up';
  up.textContent = 'A+';
  up.setAttribute('aria-label', labels.fontUp);

  const sync = () => {
    down.disabled = step === 0;
    up.disabled = step === FONT_STEPS.length - 1;
  };

  down.addEventListener('click', () => {
    step = applyFontStep(step - 1);
    sync();
  });
  up.addEventListener('click', () => {
    step = applyFontStep(step + 1);
    sync();
  });

  sync();
  group.append(down, up);
  return group;
}

function createThemeSwitch(labels) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'prefs-button prefs-theme';
  button.textContent = '◑';
  button.setAttribute('aria-hidden', 'false');

  const sync = () => {
    const dark = currentTheme() === 'dark';
    button.setAttribute('aria-pressed', String(dark));
    button.setAttribute('aria-label', dark ? labels.themeToLight : labels.themeToDark);
  };

  button.addEventListener('click', () => {
    applyTheme(currentTheme() === 'dark' ? 'light' : 'dark');
    sync();
  });

  sync();
  return button;
}

/**
 * Builds the language, text size and theme controls and appends them to a container.
 * @param {Element} container element that receives the controls
 * @returns {Element} the controls wrapper
 */
export default function decoratePreferences(container) {
  const labels = LABELS[currentLanguage()] || LABELS.pt;
  const prefs = document.createElement('div');
  prefs.className = 'prefs';
  prefs.append(createLanguageSwitch(labels), createFontSwitch(labels), createThemeSwitch(labels));
  container.append(prefs);
  return prefs;
}
