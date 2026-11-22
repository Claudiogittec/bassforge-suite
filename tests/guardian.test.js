#!/usr/bin/env node
/**
 * BassForge Engineering Guardian — Regression & Contract Gate
 * Zero-dependency Node.js test suite protecting electroacoustic math,
 * Golden Master calibration, 5 topologies, UI contracts, IP Hygiene & mirror parity.
 *
 * Usage: node tests/guardian.test.js
 */

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const vm = require('vm');
const assert = require('assert');

const ROOT = path.resolve(__dirname, '..');
const INDEX_PATH = path.join(ROOT, 'index.html');
const DB_PATH = path.join(ROOT, 'drivers-db.html');
const MIRROR_DIR = path.resolve(ROOT, '..', 'bassforge-pro-x');

let passed = 0;
let failed = 0;

function runSuite(name, fn) {
  try {
    fn();
    console.log(`  [PASS] ${name}`);
    passed++;
  } catch (err) {
    console.error(`  [FAIL] ${name}`);
    console.error(`         ${err.message}`);
    failed++;
  }
}

function approx(actual, expected, tol, label) {
  assert(
    Number.isFinite(actual) && Math.abs(actual - expected) <= tol,
    `${label}: expected ${expected} ± ${tol}, got ${actual}`
  );
}

const indexHtml = fs.readFileSync(INDEX_PATH, 'utf8');
const dbHtml = fs.readFileSync(DB_PATH, 'utf8');

function extractInlineScripts(html) {
  return [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)].map(m => m[1]);
}

function buildMockDom(html) {
  const elements = new Map();

  function makeEl(id, tag = 'div', initVal = '') {
    const classes = new Set();
    const attrs = {};
    const options = [];
    const el = {
      id,
      tagName: tag.toUpperCase(),
      value: initVal,
      checked: false,
      textContent: '',
      innerHTML: '',
      title: '',
      min: '0',
      max: '100',
      style: {},
      width: 600,
      height: 360,
      options,
      selectedIndex: 0,
      dataset: {},
      classList: {
        add: (...c) => c.forEach(x => classes.add(x)),
        remove: (...c) => c.forEach(x => classes.delete(x)),
        toggle: (x, force) => (force === undefined ? (classes.has(x) ? classes.delete(x) : classes.add(x)) : (force ? classes.add(x) : classes.delete(x))),
        contains: x => classes.has(x)
      },
      getAttribute: k => attrs[k] ?? null,
      setAttribute: (k, v) => { attrs[k] = String(v); },
      appendChild: child => { if (child && el.tagName === 'SELECT') options.push(child); return child; },
      querySelector: () => null,
      querySelectorAll: () => [],
      addEventListener: () => {},
      scrollIntoView: () => {},
      focus: () => {},
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 600, height: 360 }),
      getContext: () => ({
        save() {}, restore() {}, beginPath() {}, closePath() {}, moveTo() {}, lineTo() {},
        stroke() {}, fill() {}, fillRect() {}, clearRect() {}, strokeRect() {}, rect() {},
        arc() {}, setLineDash() {}, fillText() {}, strokeText() {}, translate() {}, rotate() {},
        scale() {}, clip() {},
        measureText: t => ({ width: String(t || '').length * 6.5 }),
        createLinearGradient: () => ({ addColorStop() {} })
      })
    };
    return el;
  }

  // Parse all elements with id + default values/select options from real HTML
  const tagRe = /<(input|select|textarea|button|canvas|div|span|p|table|tbody|ul|li|svg|optgroup|h[1-6])\b([^>]*)>/gi;
  let m;
  while ((m = tagRe.exec(html)) !== null) {
    const tag = m[1];
    const attrStr = m[2];
    const idM = attrStr.match(/\bid="([^"]+)"/);
    if (!idM) continue;
    const id = idM[1];
    const valM = attrStr.match(/\bvalue="([^"]*)"/);
    const el = makeEl(id, tag, valM ? valM[1] : '');
    const minM = attrStr.match(/\bmin="([^"]*)"/);
    const maxM = attrStr.match(/\bmax="([^"]*)"/);
    if (minM) el.min = minM[1];
    if (maxM) el.max = maxM[1];
    if (/\bchecked\b/.test(attrStr)) el.checked = true;
    elements.set(id, el);
  }

  // Populate select default selected options
  const selRe = /<select\b[^>]*\bid="([^"]+)"[^>]*>([\s\S]*?)<\/select>/gi;
  while ((m = selRe.exec(html)) !== null) {
    const el = elements.get(m[1]);
    if (!el) continue;
    const optRe = /<option\b([^>]*)>([\s\S]*?)<\/option>/gi;
    let om;
    let firstVal = null;
    let selectedVal = null;
    while ((om = optRe.exec(m[2])) !== null) {
      const oAttr = om[1];
      const oText = om[2].trim();
      const oValM = oAttr.match(/\bvalue="([^"]*)"/);
      const oVal = oValM ? oValM[1] : oText;
      if (firstVal === null) firstVal = oVal;
      if (/\bselected\b/.test(oAttr)) selectedVal = oVal;
      el.options.push({ value: oVal, text: oText, textContent: oText });
    }
    el.value = selectedVal !== null ? selectedVal : (firstVal !== null ? firstVal : '');
  }

  const storage = new Map();
  const sandbox = {
    console,
    Math,
    Number,
    Date,
    JSON,
    Array,
    Object,
    String,
    Boolean,
    RegExp,
    Map,
    Set,
    Error,
    parseFloat,
    parseInt,
    isNaN,
    isFinite,
    Uint8Array,
    TextDecoder,
    atob: s => Buffer.from(s, 'base64').toString('binary'),
    btoa: s => Buffer.from(s, 'binary').toString('base64'),
    setTimeout: fn => { fn(); return 0; },
    clearTimeout: () => {},
    requestAnimationFrame: () => 0,
    alert: () => {},
    confirm: () => true,
    localStorage: {
      getItem: k => (storage.has(k) ? storage.get(k) : null),
      setItem: (k, v) => storage.set(k, String(v)),
      removeItem: k => storage.delete(k)
    },
    window: null,
    document: {
      getElementById: id => {
        if (!elements.has(id)) elements.set(id, makeEl(id));
        return elements.get(id);
      },
      createElement: tag => makeEl('', tag),
      querySelector: () => null,
      querySelectorAll: () => [],
      addEventListener: () => {},
      body: makeEl('body', 'body')
    },
    location: { hash: '', href: 'file:///index.html' },
    navigator: { clipboard: { writeText: async () => {} } }
  };
  sandbox.window = sandbox;
  sandbox.window.location = sandbox.location;
  sandbox.window.innerWidth = 1440;
  sandbox.window.innerHeight = 900;
  sandbox.window.addEventListener = () => {};
  sandbox.window.matchMedia = () => ({ matches: false });

  const ctx = vm.createContext(sandbox);
  const code = extractInlineScripts(html).join('\n');
  vm.runInContext(code, ctx, { filename: 'index.html' });
  return { ctx, elements };
}

console.log('\n===============================================================');
console.log('  BASSFORGE ENGINEERING GUARDIAN — REGRESSION & CONTRACT GATE');
console.log('===============================================================\n');

// SUITE 1: Structural integrity & JS syntax
runSuite('1. Structural Integrity (JS syntax + 0 duplicate HTML IDs)', () => {
  for (const [label, html] of [['index.html', indexHtml], ['drivers-db.html', dbHtml]]) {
    const scripts = extractInlineScripts(html);
    assert(scripts.length >= 1, `${label}: expected at least 1 inline <script>`);
    scripts.forEach((s, i) => {
      try {
        new Function(s);
      } catch (e) {
        throw new Error(`${label} script #${i + 1} syntax error: ${e.message}`);
      }
    });
    const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]);
    const seen = new Set();
    const dups = [];
    for (const id of ids) {
      if (seen.has(id)) dups.push(id);
      seen.add(id);
    }
    assert.strictEqual(dups.length, 0, `${label}: duplicate HTML IDs found: ${dups.join(', ')}`);
  }
});

// SUITE 2: Strict IP Hygiene
runSuite('2. Strict IP Hygiene (0 third-party simulator trademarks)', () => {
  const forbidden = /\b(bassbox|bb6|elisa|winisd|ht audio|hornresp)\b/gi;
  const targets = [
    ['index.html', indexHtml],
    ['drivers-db.html', dbHtml],
    ['README.md', fs.existsSync(path.join(ROOT, 'README.md')) ? fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8') : ''],
    ['AGENTS.md', fs.existsSync(path.join(ROOT, 'AGENTS.md')) ? fs.readFileSync(path.join(ROOT, 'AGENTS.md'), 'utf8') : '']
  ];
  for (const [name, content] of targets) {
    const hits = content.match(forbidden) || [];
    assert.strictEqual(hits.length, 0, `${name} contains forbidden trademark(s): ${[...new Set(hits)].join(', ')}`);
  }
});

// SUITE 3: UI & Integration Contracts
runSuite('3. UI & Integration Contracts (nav order, sliders, storage keys)', () => {
  for (const [name, html] of [['index.html', indexHtml], ['drivers-db.html', dbHtml]]) {
    const posDb = html.indexOf('Banco de Drivers');
    const posSim = html.indexOf('Simulador 4ª Ordem');
    assert(posDb > 0 && posSim > 0 && posDb < posSim, `${name}: [Banco de Drivers] must precede [Simulador 4ª Ordem]`);
    assert(html.includes('BASSFORGE_DRIVER_DB_V1'), `${name}: missing BASSFORGE_DRIVER_DB_V1`);
    assert(html.includes('BASSFORGE_ACTIVE_DRIVER_V1'), `${name}: missing BASSFORGE_ACTIVE_DRIVER_V1`);
  }
  const ranges = [...indexHtml.matchAll(/<input\b[^>]*type="range"[^>]*>/gi)].map(m => {
    const idM = m[0].match(/\bid="([^"]+)"/);
    return idM ? idM[1] : '(no-id)';
  });
  assert.deepStrictEqual(ranges.sort(), ['fbRange', 'vbRange'], `Sliders must exist ONLY on vbRange and fbRange, got: ${ranges.join(', ')}`);
});

// Initialize VM once for mathematical & behavioral suites
const { ctx, elements } = buildMockDom(indexHtml);

// SUITE 4: Golden Master & Exact Small (1973) Eq. 19
runSuite('4. Golden Master (Oversound 18 SUB 800 XT) + Small (1973) Eq. 19', () => {
  vm.runInContext('recalculate()', ctx);
  const fb = parseFloat(elements.get('kpi1Val').textContent);
  const vtot = parseFloat(elements.get('kpiVtotVal').textContent);
  approx(fb, 44.62, 0.02, 'Golden Master Fb');
  approx(vtot, 148.73, 0.05, 'Golden Master Vtot');

  const brEval = vm.runInContext(
    "analyzeTransferAlignment({ boxType: 'bass-reflex', Fs: 40, Qts: 0.420, alpha: 185/130, Fb: 40 * Math.pow(185/130, 0.31), QL: 15 })",
    ctx
  );
  approx(brEval.f3Exact, 42.90, 0.20, 'Small 1973 exact F3 (QL=15)');
  approx(brEval.peakDb, 1.46, 0.10, 'Small 1973 exact peak dB');
  approx(brEval.fPeak, 69.8, 2.0, 'Small 1973 peak frequency');
});

// SUITE 5: Energy Conservation in G2_VentSPL & HPF Parity in G10_ConeSPL
runSuite('5. Energy Conservation G2_VentSPL (h^2) & G10_ConeSPL (+HPF)', () => {
  elements.get('boxType').value = 'bass-reflex';
  elements.get('tsFs').value = '40';
  elements.get('vbInput').value = '130';
  elements.get('fbInput').value = '20';
  elements.get('hpfCutoff').value = '1';
  vm.runInContext('setTuningMode(false)', ctx);
  let curves = vm.runInContext('currentCurves', ctx);
  let idxFb = curves.frequencies.reduce((best, f, i) => (Math.abs(f - 20) < Math.abs(curves.frequencies[best] - 20) ? i : best), 0);
  const deltaG2G6 = Math.abs(curves.G2_VentSPL[idxFb] - curves.G6_SPLThermic[idxFb]);
  assert(deltaG2G6 < 0.25, `G2_VentSPL vs G6_SPLThermic at Fb (h=0.5) diverged by ${deltaG2G6.toFixed(2)} dB`);

  // Default HPF must be OFF
  assert.strictEqual(vm.runInContext('isHpfEnabled', ctx), false, 'HPF must default to OFF');

  // Check G10 HPF attenuation at 12 Hz with HPF ON at 38 Hz
  elements.get('fbInput').value = '44.62';
  elements.get('hpfCutoff').value = '38';
  vm.runInContext('setHpfEnabled(true)', ctx);
  curves = vm.runInContext('currentCurves', ctx);
  const idx12 = curves.frequencies.reduce((best, f, i) => (Math.abs(f - 12) < Math.abs(curves.frequencies[best] - 12) ? i : best), 0);
  const diffG10G2 = Math.abs(curves.G10_ConeSPL[idx12] - curves.G2_VentSPL[idx12]);
  assert(diffG10G2 < 3.0, `G10_ConeSPL omitted HPF at 12 Hz: G10=${curves.G10_ConeSPL[idx12].toFixed(1)}, G2=${curves.G2_VentSPL[idx12].toFixed(1)}`);

  // Restore Golden Master state (HPF OFF)
  elements.get('hpfCutoff').value = '36';
  vm.runInContext('setHpfEnabled(false, false); setTuningMode(true);', ctx);
});

// SUITE 6: All 5 Topologies (0 NaN / Infinity across all 13 curves)
runSuite('6. All 5 Topologies (Sealed, BR, BP4, BP6 Parallel/Series, Planar)', () => {
  const curveKeys = [
    'G1_MaxPower', 'G2_VentSPL', 'G3_FreeAirZ', 'G4_NormAmp', 'G5_SPLinCar',
    'G6_SPLThermic', 'G7_CabinGain', 'G8_ConeExcursion', 'G9_PortAirVel', 'G10_ConeSPL',
    'G11_InBoxZ', 'G12_Phase', 'G13_GroupDelay'
  ];
  const configs = [
    { topo: 'bass-reflex' },
    { topo: 'sealed' },
    { topo: 'bp4' },
    { topo: 'bp6', bp6Mode: 'parallel' },
    { topo: 'bp6', bp6Mode: 'series' },
    { topo: 'planar' }
  ];
  for (const cfg of configs) {
    if (cfg.bp6Mode) elements.get('bp6Mode').value = cfg.bp6Mode;
    vm.runInContext(`selectTopology('${cfg.topo}')`, ctx);
    const curves = vm.runInContext('currentCurves', ctx);
    for (const k of curveKeys) {
      const arr = curves[k];
      assert(Array.isArray(arr) && arr.length === 600, `${cfg.topo}: ${k} length invalid`);
      const bad = arr.filter(v => !Number.isFinite(v)).length;
      assert.strictEqual(bad, 0, `${cfg.topo} (${cfg.bp6Mode || ''}): ${k} has ${bad} NaN/Infinity values`);
    }
  }
  vm.runInContext("selectTopology('bass-reflex')", ctx);
});

// SUITE 7: Anti-NaN Edge-Case Guards & Small Driver BP4 Preservation
runSuite('7. Anti-NaN Edge Guards (hpf=0, empty Vb, zero params) & Small-Driver BP4', () => {
  elements.get('hpfCutoff').value = '0';
  vm.runInContext('recalculate()', ctx);
  let curves = vm.runInContext('currentCurves', ctx);
  assert(curves.G4_NormAmp.every(Number.isFinite), 'hpfCutoff=0 produced non-finite G4');

  const prevKpi1 = elements.get('kpi1Val').textContent;
  elements.get('vbInput').value = '';
  vm.runInContext('recalculate()', ctx);
  assert.strictEqual(elements.get('kpi1Val').textContent, prevKpi1, 'Empty vbInput corrupted KPI');
  elements.get('vbInput').value = '130';
  elements.get('hpfCutoff').value = '36';

  const edgeEval = vm.runInContext(
    "analyzeTransferAlignment({ boxType: 'bass-reflex', Fs: 0, Qts: 0, alpha: 0, Fb: 0, QL: 0 })",
    ctx
  );
  assert(Number.isFinite(edgeEval.peakDb) && Number.isFinite(edgeEval.f3Exact), 'Zero-param analyzeTransferAlignment returned non-finite');

  // Small driver BP4 Vr preservation
  elements.get('tsVas').value = '4';
  elements.get('tsFs').value = '95';
  elements.get('vbInput').value = '3';
  elements.get('vrInput').value = '2';
  vm.runInContext("selectTopology('bp4')", ctx);
  assert.strictEqual(parseFloat(elements.get('vrInput').value), 2, 'Small-driver BP4 overwrote Vr=2L');

  // Restore Golden Master
  elements.get('tsVas').value = '185';
  elements.get('tsFs').value = '40';
  elements.get('vbInput').value = '130';
  vm.runInContext("selectTopology('bass-reflex')", ctx);
});

// SUITE 8: Port Geometries & Wizard BP6 Series Parity
runSuite('8. Port Geometries (Round, Slot Wall, Triangle) & Wizard BP6 Series Parity', () => {
  const tri = vm.runInContext(
    "computePortGeometry({ portType: 'triangle', triCount: 2, triA: 14, triB: 14, Fb: 44.62, Vb: 130, c: 343.37 })",
    ctx
  );
  approx(tri.Sp * 10000, 196.0, 0.1, 'Triangle port Sp (cm²)');
  approx(tri.hypCm, 19.799, 0.05, 'Triangle port hypotenuse (cm)');
  assert.strictEqual(tri.kEnd, 1.343, 'Triangle port kEnd must be 1.343');

  elements.get('bp6Mode').value = 'series';
  elements.get('wizBoxOverride').value = 'bp6';
  vm.runInContext("activeWizardGoal = 'optimum'; updateWizardPreview();", ctx);
  const previewFb = vm.runInContext('activeWizardPlan.Fb', ctx);
  vm.runInContext('applyWizardRecommendation()', ctx);
  const appliedFb = parseFloat(elements.get('fbInput').value);
  approx(appliedFb, previewFb, 0.25, 'Wizard BP6 Series preview vs applied Fb');
});

// SUITE 9: Mirror SHA-256 Parity (local workspace only)
runSuite('9. Mirror SHA-256 Parity (BassForge_Kit_Oficial <-> bassforge-pro-x)', () => {
  const mirrorIndex = path.join(MIRROR_DIR, 'index.html');
  const mirrorDb = path.join(MIRROR_DIR, 'drivers-db.html');
  if (!fs.existsSync(mirrorIndex) || !fs.existsSync(mirrorDb)) {
    console.log('         (Mirror directory not present in CI environment — skipped)');
    return;
  }
  const sha = f => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
  assert.strictEqual(sha(INDEX_PATH), sha(mirrorIndex), 'index.html SHA-256 mismatch with bassforge-pro-x');
  assert.strictEqual(sha(DB_PATH), sha(mirrorDb), 'drivers-db.html SHA-256 mismatch with bassforge-pro-x');
});

// SUITE 10: Build Pack P0 Geometric Validator & HTML Export (Oversound 18" Regression Fixture)
runSuite('10. Build Pack P0 Validator & HTML Export (Oversound 18" Fixture)', () => {
  const fixturePath = path.join(ROOT, 'tests', 'fixtures', 'oversound_18_invalid.json');
  assert(fs.existsSync(fixturePath), 'Missing regression fixture oversound_18_invalid.json');
  const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));

  // Apply invalid Oversound 18" fixture with skipAutofix to verify P0 raw blocker
  ctx.__fixture = fixture;
  vm.runInContext('applyProjectData(__fixture, { skipAutofix: true }); updateWoodlock();', ctx);
  const badRes = vm.runInContext('generateBuildPackHtml()', ctx);
  assert.strictEqual(badRes.ok, false, 'Invalid Oversound 18" fixture MUST block Build Pack export');
  const badCodes = badRes.validation.issues.filter(i => i.level === 'critical').map(i => i.code);
  assert(badCodes.includes('DIA_SD_MISMATCH'), `Expected DIA_SD_MISMATCH, got: ${badCodes.join(', ')}`);
  assert(badCodes.includes('DRIVER_HEIGHT_FIT'), `Expected DRIVER_HEIGHT_FIT, got: ${badCodes.join(', ')}`);

  // Fix tsDia=18 and viable baffle dimensions (A=860, B=520) -> MUST pass & generate complete HTML
  elements.get('tsDia').value = '18';
  elements.get('wlWidthA').value = '860';
  elements.get('wlHeightB').value = '520';
  vm.runInContext('updateWoodlock()', ctx);
  const okRes = vm.runInContext('generateBuildPackHtml()', ctx);
  assert.strictEqual(okRes.ok, true, `Expected valid build pack after fixing tsDia/A/B, got issues: ${JSON.stringify(okRes.validation.issues)}`);
  assert.strictEqual(okRes.validation.criticalCount, 0, 'Expected 0 critical issues');
  assert(okRes.pack.pieces.some(p => p.kind === 'batten'), 'Cut-sheet missing battens BOM');
  assert(okRes.pack.pieces.some(p => p.kind === 'port'), 'Cut-sheet missing port Lv BOM');
  assert.strictEqual(okRes.pack.baffleHoles.length, 3, 'Expected 1 driver + 2 round port holes');
  assert(okRes.html.includes('Pacote de Construção') && okRes.html.includes('Gabarito de Furação'), 'Exported HTML missing required build sections');
  assert(!okRes.html.includes('Lei de Ohm'), 'Exported HTML must stay out of electrical scope');
});

// SUITE 11: Autofix Geométrico na Carga & Piso Mínimo Dinâmico na Edição
runSuite('11. Geometric Autofix on Load & Dynamic Minimum Floor Guard', () => {
  const fixturePath = path.join(ROOT, 'tests', 'fixtures', 'oversound_18_invalid.json');
  const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
  ctx.__fixture = fixture;

  // 1. Load invalid Oversound 18" (tsDia=15, B=450) WITH autofix -> auto-sanitizes without changing Vb/Fb
  vm.runInContext('applyProjectData(__fixture);', ctx);
  const packAfter = vm.runInContext('lastBuildPack', ctx);
  assert.strictEqual(packAfter.validation.valid, true, `Autofix should make Oversound 18" valid, got: ${JSON.stringify(packAfter.validation.issues)}`);
  assert(parseFloat(elements.get('wlHeightB').value) >= 488, `Expected B >= 488 after autofix, got ${elements.get('wlHeightB').value}`);
  assert.strictEqual(parseFloat(elements.get('tsDia').value), 18, 'Autofix should correct tsDia 15 -> 18');
  approx(parseFloat(elements.get('vbInput').value), 130, 0.01, 'Autofix must preserve Vb');
  approx(parseFloat(elements.get('fbInput').value), 44.62, 0.05, 'Autofix must preserve Fb');

  // 2. User tries to lower B below floor -> bounces back to minB
  elements.get('wlHeightB').value = '380';
  vm.runInContext("onWoodlockDimChange('B')", ctx);
  const bouncedB = parseFloat(elements.get('wlHeightB').value);
  assert(bouncedB >= 488, `Floor guard failed: B stayed at ${bouncedB} instead of rebounding >= 488`);
  assert(elements.get('wlAutofixBanner').innerHTML.includes('Piso mínimo'), 'Floor guard should explain minimum in banner');

  // 3. Switch presets (12" dayton & 15" jbl) -> always re-sanitizes to valid geometry
  for (const preset of ['dayton', 'jbl', 'oversound']) {
    elements.get('driverPreset').value = preset;
    vm.runInContext('loadPreset()', ctx);
    const pk = vm.runInContext('lastBuildPack', ctx);
    assert.strictEqual(pk.validation.valid, true, `Preset ${preset} failed autofix validity: ${JSON.stringify(pk.validation.issues)}`);
  }
});

console.log('\n---------------------------------------------------------------');
console.log(`  RESULTADO: ${passed} passed, ${failed} failed`);
console.log('---------------------------------------------------------------\n');

if (failed > 0) process.exit(1);
