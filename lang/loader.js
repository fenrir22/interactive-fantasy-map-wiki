const fs = require('fs');
const path = require('path');

const LANG_DIR = path.join(process.env.DATA_PATH || __dirname, 'lang');
const CONFIG_FILE = path.join(process.env.DATA_PATH || __dirname, 'config.json');

let currentLang = 'eng';
let translations = {};

function getSavedLang() {
  try {
    const cfg = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
    return cfg.language || 'eng';
  } catch {
    return 'eng';
  }
}

function loadTranslations(langCode) {
  const langFile = path.join(LANG_DIR, `${langCode}.json`);
  if (!fs.existsSync(langFile)) {
    const fallback = path.join(LANG_DIR, 'eng.json');
    if (!fs.existsSync(fallback)) return {};
    return JSON.parse(fs.readFileSync(fallback, 'utf-8'));
  }
  return JSON.parse(fs.readFileSync(langFile, 'utf-8'));
}

function init() {
  currentLang = process.env.APP_LANG || getSavedLang();
  translations = loadTranslations(currentLang);
}

function t(key, vars) {
  let val = translations[key];
  if (val === undefined) {
    console.warn(`Missing translation key: ${key}`);
    return key;
  }
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      val = val.split('${' + k + '}').join(v);
    }
  }
  return val;
}

function clientKeys() {
  return Object.fromEntries(
    Object.entries(translations).filter(([k]) => k.startsWith('edit_') || k === 'wiki_back' || k === 'home_move_error')
  );
}

function switchLang(langCode) {
  currentLang = langCode;
  translations = loadTranslations(langCode);
}

function getLang() {
  return currentLang;
}

init();

module.exports = { t, translations, lang: currentLang, langCode: translations.lang, clientKeys, switchLang, getLang };
