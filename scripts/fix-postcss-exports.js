const fs = require('fs');
const path = require('path');

function patch(pkgPath) {
  if (!fs.existsSync(pkgPath)) return;
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  const extra = {
    './lib/tokenize': './lib/tokenize.js',
    './lib/comment': './lib/comment.js',
    './lib/parser': './lib/parser.js'
  };
  const current = pkg.exports && typeof pkg.exports === 'object' ? pkg.exports : {};
  const missing = Object.keys(extra).filter((key) => !current[key]);
  if (!missing.length) return;
  pkg.exports = Object.assign({}, current, extra);
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
}

patch(path.join(__dirname, '..', 'node_modules', 'postcss-safe-parser', 'node_modules', 'postcss', 'package.json'));
