const path = require('path');
const { createRequire } = require('module');

// In SEA, process.execPath points to the exe itself
const exeDir = path.dirname(process.execPath);

// Set DATA_PATH to the exe directory if not set
if (!process.env.DATA_PATH) {
  process.env.DATA_PATH = exeDir;
}

// Use createRequire to load local files (SEA only allows built-in modules in require)
const localRequire = createRequire(path.join(exeDir, 'package.json'));
localRequire('./server-bundle.js');
