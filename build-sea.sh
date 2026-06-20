#!/bin/bash
set -e

echo "=== Building Aetherion (single executable) ==="

# 1. Build editor
echo "[1/5] Building editor..."
npm run build:editor 2>&1 | grep -E '✓|error' || true

# 2. Bundle server
echo "[2/5] Bundling server..."
npx esbuild server.js --bundle --platform=node --outfile=server-bundle.js --external:node:* 2>&1 | grep -v '^$'

# 3. Generate sea-entry.js with embedded bundle
echo "[3/5] Embedding bundle into SEA entry..."
node -e "
const fs = require('fs');
const bundle = fs.readFileSync('server-bundle.js', 'utf8');
const entry = \`const path = require('path');
const Module = require('module');

const exeDir = path.dirname(process.execPath);
if (!process.env.DATA_PATH) process.env.DATA_PATH = exeDir;

const bundleCode = \${JSON.stringify(bundle)};
const m = new Module(path.join(exeDir, 'server-bundle.js'));
m._compile(bundleCode, path.join(exeDir, 'server-bundle.js'));
\`;
fs.writeFileSync('sea-entry.js', entry);
const stats = fs.statSync('sea-entry.js');
console.log('   Entry size: ' + (stats.size / 1048576).toFixed(1) + 'MB');
"

# 4. Build SEA binary
echo "[4/5] Building SEA binary..."
/tmp/node-v22.16.0-linux-x64/bin/node --experimental-sea-config sea-config.json 2>/dev/null
cp /tmp/node-v22.16.0-linux-x64/bin/node aetherion
npx postject aetherion NODE_SEA_BLOB sea-prep.blob --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2 2>/dev/null
chmod +x aetherion
echo "   Binary: $(du -sh aetherion | cut -f1)"

# 5. Create distribution directory
echo "[5/5] Creating distribution..."
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
