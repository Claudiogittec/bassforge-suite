#!/usr/bin/env node
/**
 * BassForge Zero-Dependency Modular Assembler
 * Compiles src/ modules into standalone 100% offline index.html & drivers-db.html.
 *
 * Usage:
 *   node scripts/build.js           # Build index.html & drivers-db.html in repo root
 *   node scripts/build.js --mirror  # Build and mirror identical bytes to ../bassforge-pro-x
 *   node scripts/build.js --check   # Verify src/ matches built HTML byte-for-byte (LF-normalized)
 */

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DEFAULT_ROOT = path.resolve(__dirname, '..');

const SIM_MODULES = [
  '01-presets-analysis.js',
  '02-drivers-bridge.js',
  '03-physics-core.js',
  '04-charts-canvas.js',
  '05-cad-woodlock.js',
  '06-cad-pgs-3d.js',
  '07-cad-exporters.js',
  '08-electrical-dsp.js',
  '09-shell-wizard.js'
];

function normLF(str) {
  return String(str).replace(/\r\n/g, '\n');
}

function sha256(str) {
  return crypto.createHash('sha256').update(str, 'utf8').digest('hex');
}

function readUtf8LF(filePath) {
  return normLF(fs.readFileSync(filePath, 'utf8'));
}

function buildSimHtml(root = DEFAULT_ROOT) {
  const simDir = path.join(root, 'src', 'sim');
  const tpl = readUtf8LF(path.join(simDir, 'template.html'));
  const css = readUtf8LF(path.join(simDir, 'styles.css'));
  const js = SIM_MODULES.map(name => readUtf8LF(path.join(simDir, name))).join('\n');

  if (!tpl.includes('{{INLINE_CSS}}')) {
    throw new Error('src/sim/template.html missing {{INLINE_CSS}} placeholder');
  }
  if (!tpl.includes('{{INLINE_JS}}')) {
    throw new Error('src/sim/template.html missing {{INLINE_JS}} placeholder');
  }

  return normLF(
    tpl
      .replace('{{INLINE_CSS}}', () => css)
      .replace('{{INLINE_JS}}', () => js)
  );
}

function buildDbHtml(root = DEFAULT_ROOT) {
  const dbDir = path.join(root, 'src', 'db');
  const catalogPath = path.join(root, 'src', 'data', 'drivers-catalog.json');
  const tpl = readUtf8LF(path.join(dbDir, 'template.html'));
  const css = readUtf8LF(path.join(dbDir, 'styles.css'));
  const catalogRaw = readUtf8LF(catalogPath).replace(/\n+$/, '');
  const appJs = readUtf8LF(path.join(dbDir, 'app.js'));

  const parsedCatalog = JSON.parse(catalogRaw);
  if (!Array.isArray(parsedCatalog) || parsedCatalog.length === 0) {
    throw new Error('src/data/drivers-catalog.json must be a non-empty JSON array');
  }

  if (!tpl.includes('{{INLINE_CSS}}')) {
    throw new Error('src/db/template.html missing {{INLINE_CSS}} placeholder');
  }
  if (!tpl.includes('{{CATALOG_JSON}}')) {
    throw new Error('src/db/template.html missing {{CATALOG_JSON}} placeholder');
  }
  if (!tpl.includes('{{INLINE_JS}}')) {
    throw new Error('src/db/template.html missing {{INLINE_JS}} placeholder');
  }

  return normLF(
    tpl
      .replace('{{INLINE_CSS}}', () => css)
      .replace('{{CATALOG_JSON}}', () => catalogRaw)
      .replace('{{INLINE_JS}}', () => appJs)
  );
}

function verifyBuild(root = DEFAULT_ROOT) {
  const builtIndex = buildSimHtml(root);
  const builtDb = buildDbHtml(root);
  const diskIndex = readUtf8LF(path.join(root, 'index.html'));
  const diskDb = readUtf8LF(path.join(root, 'drivers-db.html'));

  const indexBuiltHash = sha256(builtIndex);
  const indexDiskHash = sha256(diskIndex);
  const dbBuiltHash = sha256(builtDb);
  const dbDiskHash = sha256(diskDb);

  const indexMatch = indexBuiltHash === indexDiskHash;
  const dbMatch = dbBuiltHash === dbDiskHash;

  return {
    ok: indexMatch && dbMatch,
    indexMatch,
    dbMatch,
    indexHash: indexBuiltHash,
    indexDiskHash,
    dbHash: dbBuiltHash,
    dbDiskHash
  };
}

function detectEol(filePath) {
  if (!fs.existsSync(filePath)) return '\n';
  const raw = fs.readFileSync(filePath, 'utf8');
  return raw.includes('\r\n') ? '\r\n' : '\n';
}

function applyEol(lfStr, eol) {
  return eol === '\r\n' ? lfStr.replace(/\n/g, '\r\n') : lfStr;
}

function runBuild(options = {}) {
  const root = options.root || DEFAULT_ROOT;
  const mirror = Boolean(options.mirror);

  const builtIndexLF = buildSimHtml(root);
  const builtDbLF = buildDbHtml(root);

  const indexTarget = path.join(root, 'index.html');
  const dbTarget = path.join(root, 'drivers-db.html');

  const indexBytes = applyEol(builtIndexLF, detectEol(indexTarget));
  const dbBytes = applyEol(builtDbLF, detectEol(dbTarget));

  fs.writeFileSync(indexTarget, indexBytes, 'utf8');
  fs.writeFileSync(dbTarget, dbBytes, 'utf8');

  let mirroredTo = null;
  if (mirror) {
    const mirrorDir = path.resolve(root, '..', 'bassforge-pro-x');
    if (fs.existsSync(mirrorDir)) {
      fs.writeFileSync(path.join(mirrorDir, 'index.html'), indexBytes, 'utf8');
      fs.writeFileSync(path.join(mirrorDir, 'drivers-db.html'), dbBytes, 'utf8');
      mirroredTo = mirrorDir;
    }
  }

  return {
    indexBytes: Buffer.byteLength(indexBytes, 'utf8'),
    dbBytes: Buffer.byteLength(dbBytes, 'utf8'),
    mirroredTo
  };
}

if (require.main === module) {
  const args = new Set(process.argv.slice(2));
  if (args.has('--check')) {
    const res = verifyBuild(DEFAULT_ROOT);
    console.log(`build --check: index.html=${res.indexMatch ? 'MATCH' : 'MISMATCH'} (${res.indexHash.slice(0, 12)}) | drivers-db.html=${res.dbMatch ? 'MATCH' : 'MISMATCH'} (${res.dbHash.slice(0, 12)})`);
    process.exit(res.ok ? 0 : 1);
  } else {
    const mirror = args.has('--mirror');
    const res = runBuild({ root: DEFAULT_ROOT, mirror });
    console.log(`Built index.html (${res.indexBytes} B) and drivers-db.html (${res.dbBytes} B)${res.mirroredTo ? ` + mirrored to ${res.mirroredTo}` : ''}`);
  }
}

module.exports = {
  SIM_MODULES,
  buildSimHtml,
  buildDbHtml,
  verifyBuild,
  runBuild
};
