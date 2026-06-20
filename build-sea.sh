#!/bin/bash
set -e

echo "=== Building Aetherion SEA ==="

# 1. Build editor
echo "[1/4] Building editor..."
npm run build:editor

# 2. Bundle server
echo "[2/4] Bundling server..."
npx esbuild server.js --bundle --platform=node --outfile=server-bundle.js --external:node:*

# 3. Build SEA binary
echo "[3/4] Building SEA binary..."
/tmp/node-v22.16.0-linux-x64/bin/node --experimental-sea-config sea-config.json 2>/dev/null
cp /tmp/node-v22.16.0-linux-x64/bin/node aetherion
npx postject aetherion NODE_SEA_BLOB sea-prep.blob --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2 2>/dev/null
chmod +x aetherion

# 4. Create distribution directory
echo "[4/4] Creating distribution..."
DIST="dist"
rm -rf "$DIST"
mkdir -p "$DIST"
cp aetherion "$DIST/"
cp server-bundle.js "$DIST/"
cp package.json "$DIST/"
cp -r map "$DIST/"
cp -r lang "$DIST/"
cp -r wiki "$DIST/"
cp branding.json "$DIST/"
[ -d public ] && cp -r public "$DIST/"

echo ""
echo "=== Done! ==="
echo "Distribution: $(pwd)/$DIST/"
echo "Size: $(du -sh "$DIST" | cut -f1)"
echo ""
echo "To run:"
echo "  cd $DIST && ./aetherion"
