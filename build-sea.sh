#!/bin/bash
set -e

echo "=== Building Aetherion (fully self-contained) ==="

# 1. Build editor
echo "[1/6] Building editor..."
npm run build:editor 2>&1 | grep -E '✓|error' || true

# 2. Bundle server
echo "[2/6] Bundling server..."
npx esbuild server.js --bundle --platform=node --outfile=server-bundle.js --external:node:* 2>&1 | grep -v '^$'

# 3. Generate seed-data.js with all static files embedded
echo "[3/6] Embedding static files..."
node -e "
const fs = require('fs');
const path = require('path');

function readDirRecursive(dir, base) {
  const files = {};
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    const rel = path.join(base, entry.name);
    if (entry.isDirectory()) {
      Object.assign(files, readDirRecursive(full, rel));
    } else {
      const content = fs.readFileSync(full);
      const ext = path.extname(entry.name).toLowerCase();
      const isText = ['.html', '.js', '.css', '.json', '.svg', '.md', '.txt'].includes(ext) ||
                     entry.name === '.order.json' || entry.name === 'branding.json';
      files[rel] = isText ? { t: content.toString('utf8') } : { b: content.toString('base64') };
    }
  }
  return files;
}

const files = {};

// Map files (HTML, SVG, settings)
for (const f of ['index.html', 'editor.html', 'settings.html', 'favicon.svg', 'mappa.svg', 'settings.json']) {
  const p = path.join('map', f);
  if (fs.existsSync(p)) {
    if (f.endsWith('.svg')) {
      files[p] = { b: fs.readFileSync(p).toString('base64') };
    } else {
      files[p] = { t: fs.readFileSync(p, 'utf8') };
    }
  }
}

// Lang files
for (const f of fs.readdirSync('lang')) {
  if (f.endsWith('.json')) {
    files[path.join('lang', f)] = { t: fs.readFileSync(path.join('lang', f), 'utf8') };
  }
}

// Wiki files
function addWiki(dir, base) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    const rel = path.join(base, entry.name);
    if (entry.isDirectory()) {
      addWiki(full, rel);
    } else if (entry.name.endsWith('.md') || entry.name === '.order.json') {
      files[rel] = { t: fs.readFileSync(full, 'utf8') };
    }
  }
}
if (fs.existsSync('wiki')) addWiki('wiki', 'wiki');

// Branding
if (fs.existsSync('branding.json')) {
  files['branding.json'] = { t: fs.readFileSync('branding.json', 'utf8') };
}

const code = 'const seedData = ' + JSON.stringify(files) + ';\n';
fs.writeFileSync('seed-data.js', code);
const size = fs.statSync('seed-data.js').size;
console.log('   Embedded ' + Object.keys(files).length + ' files (' + (size / 1024).toFixed(0) + 'KB)');
"

# 4. Generate sea-entry.js with embedded bundle AND seed data
echo "[4/6] Creating SEA entry..."
node -e "
const fs = require('fs');
const bundle = fs.readFileSync('server-bundle.js', 'utf8');
const seed = fs.readFileSync('seed-data.js', 'utf8');
const entry = \`const path = require('path');
const Module = require('module');
const fs = require('fs');

const exeDir = path.dirname(process.execPath);
if (!process.env.DATA_PATH) process.env.DATA_PATH = exeDir;

// Embedded seed data (static files for first-run extraction)
\${seed}

// Write seed files to DATA_PATH on first run
const dataPath = process.env.DATA_PATH;
if (seedData) {
  for (const [rel, data] of Object.entries(seedData)) {
    const dst = path.join(dataPath, rel);
    if (!fs.existsSync(dst)) {
      const dir = path.dirname(dst);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(dst, data.t || Buffer.from(data.b, 'base64'));
    }
  }
}

// Embedded server bundle
const bundleCode = \${JSON.stringify(bundle)};
const m = new Module(path.join(exeDir, 'server-bundle.js'));
m._compile(bundleCode, path.join(exeDir, 'server-bundle.js'));
\`;
fs.writeFileSync('sea-entry.js', entry);
const stats = fs.statSync('sea-entry.js');
console.log('   Entry size: ' + (stats.size / 1048576).toFixed(1) + 'MB');
"

# 5. Build SEA binary
echo "[5/6] Building SEA binary..."
/tmp/node-v22.16.0-linux-x64/bin/node --experimental-sea-config sea-config.json 2>/dev/null
cp /tmp/node-v22.16.0-linux-x64/bin/node aetherion
npx postject aetherion NODE_SEA_BLOB sea-prep.blob --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2 2>/dev/null
chmod +x aetherion
echo "   Binary: $(du -sh aetherion | cut -f1)"

# 6. Create distribution directory
echo "[6/6] Creating distribution..."
DIST="dist"
rm -rf "$DIST"
mkdir -p "$DIST"
cp aetherion "$DIST/"
cp -r map "$DIST/"
cp -r lang "$DIST/"
cp -r wiki "$DIST/"
cp branding.json "$DIST/"
[ -d public ] && cp -r public "$DIST/"

echo ""
echo "=== Done! ==="
echo "Distribution: $(pwd)/$DIST/"
echo "Single file:  $(pwd)/dist/aetherion"
echo "Size: $(du -sh "$DIST" | cut -f1)"
