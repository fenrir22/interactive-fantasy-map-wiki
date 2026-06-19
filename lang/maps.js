const fs = require('fs');
const path = require('path');

function applyMap(content, map) {
  for (const [from, to] of map) {
    content = content.split(from).join(to);
  }
  return content;
}

const LANG = process.env.APP_LANG || 'eng';

function loadMapPairs(page) {
  const langFile = path.join(__dirname, `${LANG}.json`);
  if (!fs.existsSync(langFile)) return [];
  const data = JSON.parse(fs.readFileSync(langFile, 'utf-8'));
  const common = data.map_common || {};
  const pageMap = data[`map_${page}`] || {};
  return Object.entries({ ...common, ...pageMap });
}

const mapIndex = loadMapPairs('index');
const mapEditor = loadMapPairs('editor');
const mapSettings = loadMapPairs('settings');

module.exports = {
  mapIndex,
  mapEditor,
  mapSettings,
  applyMap,
  reload: function () {
    this.mapIndex = loadMapPairs('index');
    this.mapEditor = loadMapPairs('editor');
    this.mapSettings = loadMapPairs('settings');
  }
};
