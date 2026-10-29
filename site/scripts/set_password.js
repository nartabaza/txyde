#!/usr/bin/env node
// Set the password for the coming-soon gate.
//
//   node scripts/set_password.js "new password"
//
// Writes the password's hash (never the password itself) to:
//   - GATE_PASSWORD_HASH in the repo's .env, which the build reads
//   - dist/gate.json, if the site has been built: upload this one file to the live site
// and prints the hash, for the GitHub variable GATE_PASSWORD_HASH (used by the preview deploy).
// Changing the password signs everyone out.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const SALT = 'txyde-gate:'; // must match assets/js/gate.js

const password = process.argv[2];
if (!password) {
  console.error('Usage: node scripts/set_password.js "new password"');
  process.exit(1);
}
const hash = crypto.createHash('sha256').update(SALT + password, 'utf8').digest('hex');

const envFile = path.join(__dirname, '..', '..', '.env');
let env = fs.existsSync(envFile) ? fs.readFileSync(envFile, 'utf8') : '';
const line = `GATE_PASSWORD_HASH=${hash}`;
env = /^GATE_PASSWORD_HASH=.*$/m.test(env)
  ? env.replace(/^GATE_PASSWORD_HASH=.*$/m, line)
  : env.replace(/\s*$/, env.trim() ? '\n' : '') + line + '\n';
fs.writeFileSync(envFile, env);

const dist = path.join(__dirname, '..', 'dist');
if (fs.existsSync(dist)) fs.writeFileSync(path.join(dist, 'gate.json'), JSON.stringify({ hash }) + '\n');

console.log(`Password hash: ${hash}

Saved to .env${fs.existsSync(dist) ? ' and site/dist/gate.json' : ''}.
Live site (GoDaddy): upload site/dist/gate.json to the web root, replacing the old one.
GitHub preview: set the repository variable GATE_PASSWORD_HASH to the hash above and re-run the deploy,
  e.g.  gh variable set GATE_PASSWORD_HASH --body ${hash}`);
