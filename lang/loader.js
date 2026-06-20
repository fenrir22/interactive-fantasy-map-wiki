const fs = require('fs');
const path = require('path');

const LANG = process.env.APP_LANG || 'eng';
const LANG_DIR = path.join(process.env.DATA_PATH || __dirname, 'lang');

function loadTranslations() {
  const langFile = path.join(LANG_DIR, `${LANG}.json`);
  if (!fs.existsSync(langFile)) {
    console.warn(`Language file not found: ${langFile}, falling back to eng`);
    return JSON.parse(fs.readFileSync(path.join(LANG_DIR, 'eng.json'), 'utf-8'));
  }
  return JSON.parse(fs.readFileSync(langFile, 'utf-8'));
}

const translations = loadTranslations();

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

module.exports = { t, translations, lang: LANG, langCode: translations.lang, clientKeys };
