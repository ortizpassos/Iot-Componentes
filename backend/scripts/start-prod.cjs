const fs = require('node:fs');
const path = require('node:path');

const candidates = [path.join(__dirname, '..', 'dist', 'main.js'), path.join(__dirname, '..', 'dist', 'src', 'main.js')];
const entrypoint = candidates.find(candidate => fs.existsSync(candidate));

if (!entrypoint) {
  throw new Error(`Production entrypoint not found. Tried: ${candidates.join(', ')}`);
}

require(entrypoint);
