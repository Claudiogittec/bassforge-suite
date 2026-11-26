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
  const forbidden = /\b(bassbox|bb6|elisa|winisd|ht audio|hornresp|vituixcad|boxsim|unibox|akabak)\b/gi;
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
  assert.deepStrictEqual(ranges.sort(), ['fbRange', 'fbVrRange', 'vbRange', 'vrRange'], `Sliders must exist ONLY on vbRange, vrRange, fbRange, fbVrRange, got: ${ranges.join(', ')}`);
  assert(indexHtml.includes('id="numDuctsVr"') && indexHtml.includes('id="ductDiaVr"') && indexHtml.includes('id="portTelemetryBoxVr"'), 'index.html: missing BP6 VR per-chamber duct controls');
});

// Initialize VM once for mathematical & behavioral suites
const { ctx, elements } = buildMockDom(indexHtml);

// SUITE 4: Golden Master & Exact Small (1973) Eq. 19
runSuite('4. Golden Master (Oversound 18 SUB 800 XT) + Small (1973) Eq. 19', () => {
  vm.runInContext('recalculate()', ctx);
  const fb = parseFloat(elements.get('kpi1Val').textContent);
  const vtot = parseFloat(elements.get('kpiVtotVal').textContent);
  approx(fb, 44.62, 0.02, 'Golden Master Fb');
  approx(vtot, 150.81, 0.08, 'Golden Master Vtot (ISO 20°C c=343.37 m/s, per-duct end correction)');

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
runSuite('6. All 5 Topologies (Sealed, BR, BP4, BP6 Parallel, Planar)', () => {
  const curveKeys = [
    'G1_MaxPower', 'G2_VentSPL', 'G3_FreeAirZ', 'G4_NormAmp', 'G5_SPLinCar',
    'G6_SPLThermic', 'G7_CabinGain', 'G8_ConeExcursion', 'G9_PortAirVel', 'G10_ConeSPL',
    'G11_InBoxZ', 'G12_Phase', 'G13_GroupDelay'
  ];
  const configs = [
    { topo: 'bass-reflex' },
    { topo: 'sealed' },
    { topo: 'bp4' },
    { topo: 'bp6' },
    { topo: 'planar' }
  ];
  for (const cfg of configs) {
    vm.runInContext(`selectTopology('${cfg.topo}')`, ctx);
    const curves = vm.runInContext('currentCurves', ctx);
    assert(curves.frequencies[0] <= 5.01 && curves.frequencies[curves.frequencies.length - 1] >= 19999, `${cfg.topo}: frequencies must span 5..20000 Hz`);
    for (const k of curveKeys) {
      const arr = curves[k];
      assert(Array.isArray(arr) && arr.length === 900, `${cfg.topo}: ${k} length invalid`);
      const bad = arr.filter(v => !Number.isFinite(v)).length;
      assert.strictEqual(bad, 0, `${cfg.topo}: ${k} has ${bad} NaN/Infinity values`);
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

// SUITE 8: Port Geometries & Wizard BP6 Parity
runSuite('8. Port Geometries (Round, Slot Wall, Triangle) & Wizard BP6 Parity', () => {
  const tri = vm.runInContext(
    "computePortGeometry({ portType: 'triangle', triCount: 2, triA: 14, triB: 14, Fb: 44.62, Vb: 130, c: 343.37 })",
    ctx
  );
  approx(tri.Sp * 10000, 196.0, 0.1, 'Triangle port Sp (cm²)');
  approx(tri.hypCm, 19.799, 0.05, 'Triangle port hypotenuse (cm)');
  assert.strictEqual(tri.kEnd, 1.343, 'Triangle port kEnd must be 1.343');

  elements.get('wizBoxOverride').value = 'bp6';
  vm.runInContext("activeWizardGoal = 'optimum'; updateWizardPreview();", ctx);
  const previewFb = vm.runInContext('activeWizardPlan.Fb', ctx);
  vm.runInContext('applyWizardRecommendation()', ctx);
  const appliedFb = parseFloat(elements.get('fbInput').value);
  approx(appliedFb, previewFb, 0.25, 'Wizard BP6 preview vs applied Fb');
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

  // Fix tsDia=18 and viable baffle dimensions (A=760, B=520) -> MUST pass & generate complete HTML
  elements.get('tsDia').value = '18';
  elements.get('wlWidthA').value = '760';
  elements.get('wlHeightB').value = '520';
  vm.runInContext('updateWoodlock()', ctx);
  const okRes = vm.runInContext('generateBuildPackHtml()', ctx);
  assert.strictEqual(okRes.ok, true, `Expected valid build pack after fixing tsDia/A/B, got issues: ${JSON.stringify(okRes.validation.issues)}`);
  assert.strictEqual(okRes.validation.criticalCount, 0, 'Expected 0 critical issues');
  assert(okRes.pack.pieces.some(p => p.kind === 'batten'), 'Cut-sheet missing battens BOM');
  assert(okRes.pack.pieces.some(p => p.kind === 'port'), 'Cut-sheet missing port Lv BOM');
  assert.strictEqual(okRes.pack.baffleHoles.length, 3, 'Expected 1 driver + 2 round port holes');
  assert(okRes.html.includes('Pacote de Construção') && okRes.html.includes('Gabarito de Furação'), 'Exported HTML missing required build sections');
  assert(okRes.html.includes('Balanço Volumétrico:'), 'Exported HTML missing Balanço Volumétrico');
  assert(okRes.html.includes('Limites Físicos da Simulação'), 'Exported HTML missing physical constraint checks');
  // Paridade Lv canônico (Seção 2 == Plano de Corte == Gabarito)
  const lvMm = okRes.pack.acoustics.lvMm;
  const portPiece = okRes.pack.pieces.find(p => p.kind === 'port');
  const portHole = okRes.pack.baffleHoles.find(h => h.kind === 'port');
  assert.strictEqual(portPiece.h, lvMm, `Cut-sheet Lv (${portPiece.h}) != acoustics.lvMm (${lvMm})`);
  assert.strictEqual(Math.round(portHole.lvMm), lvMm, `Baffle hole Lv (${portHole.lvMm}) != acoustics.lvMm (${lvMm})`);
  assert(okRes.html.includes(`(${lvMm} mm)`), `Section 2 meta must show canonical Lv (${lvMm} mm)`);
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

// SUITE 12: Analysis Engine — Perfis de Ambiente, Slots NÃO Implementados & Invariância Física
runSuite('12. Analysis Engine (Architectural/Automotive, slots N/D, invariância física)', () => {
  // --- 12.1 Perfis: 13 slots cada, na ordem exata da spec (§2 Architectural / §3 Automotive) ---
  const orders = vm.runInContext('({ arch: ENV_PROFILES.architectural.order.join(","), auto: ENV_PROFILES.automotive.order.join(",") })', ctx);
  assert.strictEqual(
    orders.arch,
    'G4,G6,G8,G11,G9,G13,G1,G2,G12,G3,G10,SLOT_ROOM_GAIN,SLOT_SPL_ROOM',
    `Architectural order diverged: ${orders.arch}`
  );
  assert.strictEqual(
    orders.auto,
    'G4,G6,G8,G11,G9,G13,G5,G7,G1,G2,G12,G3,G10',
    `Automotive order diverged: ${orders.auto}`
  );
  const counts = vm.runInContext('({ arch: ENV_PROFILES.architectural.order.length, auto: ENV_PROFILES.automotive.order.length, uniqA: new Set(ENV_PROFILES.architectural.order).size, uniqB: new Set(ENV_PROFILES.automotive.order).size })', ctx);
  assert.strictEqual(counts.arch, 13, 'Architectural must have 13 slots');
  assert.strictEqual(counts.auto, 13, 'Automotive must have 13 slots');
  assert.strictEqual(counts.uniqA, 13, 'Architectural slots must be unique');
  assert.strictEqual(counts.uniqB, 13, 'Automotive slots must be unique');

  // Numeração visual dinâmica 1..13 por perfil (prefixo interno de CHARTS_INFO preservado)
  const displayCheck = vm.runInContext(`({
    arch1: formatChartDisplayTitle(CHART_REGISTRY[ENV_PROFILES.architectural.order[0]], 0),
    arch12: formatChartDisplayTitle(CHART_REGISTRY[ENV_PROFILES.architectural.order[11]], 11),
    arch13: formatChartDisplayTitle(CHART_REGISTRY[ENV_PROFILES.architectural.order[12]], 12),
    auto7: formatChartDisplayTitle(CHART_REGISTRY[ENV_PROFILES.automotive.order[6]], 6),
    auto8: formatChartDisplayTitle(CHART_REGISTRY[ENV_PROFILES.automotive.order[7]], 7),
    auto13: formatChartDisplayTitle(CHART_REGISTRY[ENV_PROFILES.automotive.order[12]], 12),
    internalG4: CHARTS_INFO.find(c => c.id === 'G4').title
  })`, ctx);
  assert.strictEqual(displayCheck.arch1, '#1 Normalized Amplitude (dB)', `Arch #1 title: ${displayCheck.arch1}`);
  assert.strictEqual(displayCheck.arch12, '#12 Room Gain (dB)', `Arch #12 title: ${displayCheck.arch12}`);
  assert.strictEqual(displayCheck.arch13, '#13 SPL in Room (dB-SPL)', `Arch #13 title: ${displayCheck.arch13}`);
  assert.strictEqual(displayCheck.auto7, '#7 SPL in Car (dB-SPL)', `Auto #7 title: ${displayCheck.auto7}`);
  assert.strictEqual(displayCheck.auto8, '#8 Cabin Gain Acoplado (dB)', `Auto #8 title: ${displayCheck.auto8}`);
  assert.strictEqual(displayCheck.auto13, '#13 Cone SPL (dB-SPL)', `Auto #13 title: ${displayCheck.auto13}`);
  assert.strictEqual(displayCheck.internalG4, '#4 Normalized Amplitude (dB)', 'Prefixo interno de CHARTS_INFO deve ser preservado');

  // --- 12.2 Registro: todo slot calculado/modelado aponta para uma série real de 900 pontos ---
  const registry = vm.runInContext('Object.keys(CHART_REGISTRY).map(id => ({ id, key: CHART_REGISTRY[id].key, av: CHART_REGISTRY[id].availability }))', ctx);
  const curves = vm.runInContext('currentCurves', ctx);
  const calculated = registry.filter(r => r.av !== 'unimplemented');
  assert.strictEqual(calculated.length, 15, `Expected 15 calculated/modeled charts (G1..G13 + RoomGain + SPLinRoom), got ${calculated.length}`);
  for (const r of calculated) {
    const arr = curves[r.key];
    assert(Array.isArray(arr) && arr.length === 900, `${r.id}: série ${r.key} ausente ou com tamanho inválido`);
    assert(arr.every(v => Number.isFinite(v)), `${r.id}: série ${r.key} contém NaN/Infinity`);
  }

  // --- 12.3 Modelo Físico de Sala (L×W×H + Waterhouse Boundary Loading) independente de Cabin Gain ---
  const rgEntry = vm.runInContext('CHART_REGISTRY.SLOT_ROOM_GAIN', ctx);
  const srEntry = vm.runInContext('CHART_REGISTRY.SLOT_SPL_ROOM', ctx);
  assert.strictEqual(rgEntry.availability, 'modeled', 'SLOT_ROOM_GAIN deve ser modeled');
  assert.strictEqual(srEntry.availability, 'modeled', 'SLOT_SPL_ROOM deve ser modeled');
  assert.strictEqual(rgEntry.key, 'G14_RoomGain', 'SLOT_ROOM_GAIN deve usar série dedicada G14_RoomGain');
  assert.strictEqual(srEntry.key, 'G15_SPLinRoom', 'SLOT_SPL_ROOM deve usar série dedicada G15_SPLinRoom');
  assert.notStrictEqual(rgEntry.key, 'G7_CabinGain', 'Room Gain jamais pode reutilizar G7_CabinGain');
  assert.notStrictEqual(srEntry.key, 'G5_SPLinCar', 'SPL in Room jamais pode reutilizar G5_SPLinCar');
  // Verifica monotonicidade física de Boundary Loading: corner > quarter > half > free em ~30 Hz
  const rg30 = vm.runInContext(`(() => {
    const out = {};
    const el = document.getElementById('roomPlacement');
    const orig = el.value;
    for (const pl of ['free', 'half', 'quarter', 'corner']) {
      el.value = pl;
      recalculate();
      const idx = currentCurves.frequencies.findIndex(f => f >= 30);
      out[pl] = currentCurves.G14_RoomGain[idx];
    }
    el.value = orig;
    recalculate();
    return out;
  })()`, ctx);
  assert(rg30.corner > rg30.quarter && rg30.quarter > rg30.half && rg30.half > rg30.free,
    `Boundary Loading fora de ordem física em 30Hz: ${JSON.stringify(rg30)}`);

  // --- 12.4 Invariância: alternar ambiente NÃO recalcula física nem toca inputs ---
  const fieldIds = ['vbInput', 'fbInput', 'tsFs', 'tsQes', 'tsQms', 'tsVas', 'tsXmax', 'boxType'];
  const fieldsBefore = fieldIds.map(id => elements.get(id).value).join('|');
  const tuneBefore = vm.runInContext('isAutoTune', ctx);
  const hpfBefore = vm.runInContext('isHpfEnabled', ctx);
  const curvesRefBefore = vm.runInContext('currentCurves', ctx);
  const snapshotBefore = JSON.stringify(curvesRefBefore);

  vm.runInContext("setAnalysisEnvironment('architectural')", ctx);
  const curvesRefArch = vm.runInContext('currentCurves', ctx);
  assert.strictEqual(curvesRefArch, curvesRefBefore, 'Alternar ambiente recalculou currentCurves (novo objeto) — Physics Core violado');
  assert.strictEqual(JSON.stringify(curvesRefArch), snapshotBefore, 'Alternar para Architectural alterou valores das séries');

  vm.runInContext("setAnalysisEnvironment('automotive')", ctx);
  assert.strictEqual(JSON.stringify(vm.runInContext('currentCurves', ctx)), snapshotBefore, 'Retorno para Automotive alterou valores das séries');
  assert.strictEqual(fieldIds.map(id => elements.get(id).value).join('|'), fieldsBefore, 'Alternar ambiente alterou inputs do projeto');
  assert.strictEqual(vm.runInContext('isAutoTune', ctx), tuneBefore, 'Alternar ambiente alterou isAutoTune');
  assert.strictEqual(vm.runInContext('isHpfEnabled', ctx), hpfBefore, 'Alternar ambiente alterou isHpfEnabled');

  // --- 12.5 Restrições físicas: detecção de violação e de estado seguro ---
  const critical = vm.runInContext(`evaluatePhysicalConstraints({
    frequencies: [20, 30, 40],
    meta: { Xmax: 5, velLimit: 17, Pe: 800, deltaT: 0, Fb: 35, boxType: 'bass-reflex' },
    G1_MaxPower: [800, 800, 800], G8_ConeExcursion: [9, 2, 1], G9_PortAirVel: [25, 5, 3], G13_GroupDelay: [5, 5, 5]
  }, 15, 200)`, ctx);
  assert(critical.some(c => c.id === 'G8' && c.code === 'EXCURSION_OVER_XMAX' && c.severity === 'critical'),
    `Esperado alerta crítico de excursão, obtido: ${JSON.stringify(critical)}`);
  assert(critical.some(c => c.id === 'G9' && c.code === 'PORT_VELOCITY_OVER_LIMIT' && c.severity === 'critical'),
    `Esperado alerta crítico de velocidade de duto, obtido: ${JSON.stringify(critical)}`);
  assert(critical.every(c => c.id !== 'SLOT_SPL_ROOM' && c.id !== 'SLOT_ROOM_GAIN'),
    'Restrições nunca podem ser atribuídas a slots não implementados');

  const safe = vm.runInContext(`evaluatePhysicalConstraints({
    frequencies: [20, 30, 40],
    meta: { Xmax: 10, velLimit: 17, Pe: 800, deltaT: 0, Fb: 35, boxType: 'bass-reflex' },
    G1_MaxPower: [800, 800, 800], G8_ConeExcursion: [2, 1, 1], G9_PortAirVel: [1, 1, 1], G13_GroupDelay: [3, 3, 3]
  }, 15, 200)`, ctx);
  assert.strictEqual(safe.length, 0, `Projeto seguro não deveria gerar alertas, obtido: ${JSON.stringify(safe)}`);

  // Restrições valem para os DOIS ambientes (mesma função pura, séries idênticas)
  const criticalInArch = vm.runInContext(`evaluatePhysicalConstraints({
    frequencies: [20, 30, 40],
    meta: { Xmax: 5, velLimit: 17, Pe: 800, deltaT: 0, Fb: 35, boxType: 'bass-reflex' },
    G1_MaxPower: [800, 800, 800], G8_ConeExcursion: [9, 2, 1], G9_PortAirVel: [25, 5, 3], G13_GroupDelay: [5, 5, 5]
  }, 15, 200).filter(c => c.severity === 'critical').map(c => c.id).sort().join(',')`, ctx);
  assert.strictEqual(criticalInArch, 'G8,G9', `Alertas críticos devem ser idênticos nos dois perfis, obtido: ${criticalInArch}`);

  // --- 12.6 G7: rótulo corrigido, física preservada ---
  const g7 = vm.runInContext('CHART_REGISTRY.G7', ctx);
  assert(/Acoplado/.test(g7.title), `G7 deve explicitar "Acoplado" no título, obtido: ${g7.title}`);
  assert.strictEqual(g7.availability, 'modeled', 'G7 é estimado por modelo físico (T_cabin)');
  assert.strictEqual(g7.key, 'G7_CabinGain', 'G7 deve manter a chave física congelada G7_CabinGain');

  // --- 12.7 Persistência do ambiente no Projeto (.json) ---
  vm.runInContext("setAnalysisEnvironment('architectural')", ctx);
  const payload = vm.runInContext('buildProjectPayload()', ctx);
  assert.strictEqual(payload.analysisEnv, 'architectural', 'buildProjectPayload deve salvar analysisEnv');
  vm.runInContext("setAnalysisEnvironment('automotive')", ctx);
  ctx.__analysisProject = payload;
  vm.runInContext('applyProjectData(__analysisProject)', ctx);
  assert.strictEqual(vm.runInContext('analysisEnv', ctx), 'architectural', 'applyProjectData deve restaurar analysisEnv');
  vm.runInContext("setAnalysisEnvironment('automotive')", ctx);
});

// SUITE 13: Fase A WoodLock CAD — Montagem Invertida, Duto Régua H/V Real & 2 Câmaras BP4/BP6
runSuite('13. WoodLock CAD Fase A (Normal/Invertida, Régua A×C4, BP4/BP6 2 Câmaras)', () => {
  // --- 13.1 Montagem Invertida: Vsub=0 no Vbruto, currentCurves bit-a-bit idêntico ---
  elements.get('driverPreset').value = 'oversound';
  vm.runInContext('loadPreset()', ctx);
  elements.get('wlMountMode').value = 'normal';
  vm.runInContext('updateWoodlock()', ctx);
  const packNorm = vm.runInContext('lastBuildPack', ctx);
  const curvesBefore = JSON.stringify(vm.runInContext('currentCurves', ctx));

  elements.get('wlMountMode').value = 'inverted';
  vm.runInContext('updateWoodlock()', ctx);
  const packInv = vm.runInContext('lastBuildPack', ctx);
  const curvesAfter = JSON.stringify(vm.runInContext('currentCurves', ctx));
  assert.strictEqual(curvesAfter, curvesBefore, 'Montagem invertida não pode alterar currentCurves');
  assert.strictEqual(packInv.acoustics.Vsub, 0, 'Montagem invertida deve zerar Vsub efetivo');
  assert(packInv.acoustics.Vbruto < packNorm.acoustics.Vbruto - 8.5,
    `Vbruto invertido (${packInv.acoustics.Vbruto}) deve descontar Vsub (~9 L) em relação ao normal (${packNorm.acoustics.Vbruto})`);
  elements.get('wlMountMode').value = 'normal';

  // --- 13.2 Duto Régua Horizontal: Baffle reduzido A×C4 + Divisória A4×R ---
  elements.get('portType').value = 'slot_wall';
  elements.get('wlSlotOrient').value = 'horizontal';
  elements.get('slotW').value = '40';
  elements.get('slotH').value = '6';
  elements.get('slotWallThick').value = '18';
  vm.runInContext('recalculate(); autofixWoodlockGeometry("teste slot"); updateWoodlock();', ctx);
  const packSlot = vm.runInContext('lastBuildPack', ctx);
  const frontPiece = packSlot.pieces.find(p => p.orient === 'FRENTE');
  const portDiv = packSlot.pieces.find(p => p.kind === 'port');
  const expectedC4 = packSlot.dimensions.B - 60 - 18;
  assert.strictEqual(frontPiece.w, packSlot.dimensions.A, `Baffle régua horizontal deve ter largura A (${packSlot.dimensions.A}), obtido ${frontPiece.w}`);
  assert.strictEqual(frontPiece.h, expectedC4, `Baffle régua horizontal deve ter altura C4 (${expectedC4}), obtido ${frontPiece.h}`);
  assert.strictEqual(portDiv.h, packSlot.acoustics.lvMm, `Divisória A4×R deve ter R === lvMm (${packSlot.acoustics.lvMm}), obtido ${portDiv.h}`);

  // --- 13.3 BP4: 2 câmaras reais (A_rear + t + A_front === A) + Divisória Interna do Falante ---
  elements.get('portType').value = 'round';
  elements.get('boxType').value = 'bp4';
  vm.runInContext('selectTopology("bp4"); updateWoodlock();', ctx);
  const packBp4 = vm.runInContext('lastBuildPack', ctx);
  assert(packBp4.acoustics.bpChambers && packBp4.acoustics.bpChambers.isBp, 'BP4 deve gerar bpChambers');
  approx(packBp4.acoustics.bpChambers.A_rear + packBp4.dimensions.t + packBp4.acoustics.bpChambers.A_front, packBp4.dimensions.A, 0.3, 'BP4 A_rear + t + A_front === A');
  assert(packBp4.pieces.some(p => p.kind === 'divider'), 'BP4 deve incluir Divisória Interna no Plano de Corte');
  assert(packBp4.baffleHoles.some(h => h.kind === 'driver' && h.panel === 'divisoria'), 'Driver em BP4 deve estar marcado na divisória interna');

  // --- 13.4 BP6 Paralelo: 2 conjuntos de dutos independentes (frontal + traseiro) ---
  vm.runInContext('selectTopology("bp6"); updateWoodlock();', ctx);
  const packBp6 = vm.runInContext('lastBuildPack', ctx);
  const portPiecesBp6 = packBp6.pieces.filter(p => p.kind === 'port');
  assert(portPiecesBp6.length >= 2, `BP6 Paralelo deve gerar 2 peças de duto (VF + VR), obtido ${portPiecesBp6.length}`);
  assert(packBp6.acoustics.lvRearMm > 0, 'BP6 Paralelo deve calcular lvRearMm > 0');

  // Restaura Oversound padrão
  elements.get('driverPreset').value = 'oversound';
  vm.runInContext('loadPreset()', ctx);
});

// SUITE 14: Fase B WoodLock CAD — Vista Explodida 3D Isométrica & Planificação 2D Procedural
runSuite('14. WoodLock CAD Fase B (Vista Explodida 3D, Planificação 2D & HTML Export)', () => {
  elements.get('driverPreset').value = 'oversound';
  vm.runInContext('loadPreset()', ctx);

  // Alterna entre os 3 modos de visualização CAD sem erro
  vm.runInContext("setWoodlockViewMode('exploded')", ctx);
  assert.strictEqual(vm.runInContext('wlViewMode', ctx), 'exploded', 'wlViewMode deve mudar para exploded');
  vm.runInContext("setWoodlockViewMode('cutplan')", ctx);
  assert.strictEqual(vm.runInContext('wlViewMode', ctx), 'cutplan', 'wlViewMode deve mudar para cutplan');
  vm.runInContext("setWoodlockViewMode('blueprint')", ctx);
  assert.strictEqual(vm.runInContext('wlViewMode', ctx), 'blueprint', 'wlViewMode deve retornar para blueprint');

  // Renderização direta em BP4 e Dutada Régua sem exceções
  for (const [box, port] of [['bass-reflex', 'slot_wall'], ['bp4', 'round'], ['bp6', 'round'], ['sealed', 'round']]) {
    elements.get('portType').value = port;
    vm.runInContext(`selectTopology('${box}'); updateWoodlock(); drawWoodlockExploded3D(lastBuildPack); drawWoodlockCutPlan2D(lastBuildPack);`, ctx);
  }

  // Restaura Oversound e verifica Vista Explodida 3D no HTML gerado
  elements.get('driverPreset').value = 'oversound';
  vm.runInContext('loadPreset()', ctx);
  const res = vm.runInContext('generateBuildPackHtml()', ctx);
  assert.strictEqual(res.ok, true, 'generateBuildPackHtml deve passar no Oversound');
  const htmlWithImgs = vm.runInContext("buildPackHtmlString(lastBuildPack, [], 'data:image/png;base64,BP', 'data:image/png;base64,EXP')", ctx);
  assert(htmlWithImgs.includes('Vista Explodida 3D Isométrica'), 'Pacote HTML deve incluir título da Vista Explodida 3D');
  assert(htmlWithImgs.includes('data:image/png;base64,EXP'), 'Pacote HTML deve embutir imagem da Vista Explodida 3D');
});

// SUITE 15: PGS Geometry & Manufacturing Engine (Módulo 1 — G01..G12, Nesting 2D, 3D Fonte Única)
runSuite('15. PGS Geometry Core (G01-G12, Nesting 2D 2750x1830, 3D Explosão 0%-100%)', () => {
  const cases = [
    { name: 'Oversound Bass-Reflex Redondo', box: 'bass-reflex', port: 'round', ductDia: '6.0', numDucts: '2' },
    { name: 'Oversound Bass-Reflex Régua Horiz.', box: 'bass-reflex', port: 'slot_wall', ductDia: '6.0', numDucts: '2' },
    { name: 'Oversound Selada', box: 'sealed', port: 'round', ductDia: '6.0', numDucts: '2' },
    { name: 'Oversound BP4', box: 'bp4', port: 'round', ductDia: '4.0', numDucts: '2' },
    { name: 'Oversound BP6 Paralelo', box: 'bp6', port: 'round', ductDia: '4.0', numDucts: '2' }
  ];

  for (const tc of cases) {
    elements.get('driverPreset').value = 'oversound';
    vm.runInContext('loadPreset()', ctx);
    vm.runInContext(`selectTopology('${tc.box}');`, ctx);
    elements.get('portType').value = tc.port;
    elements.get('ductDia').value = tc.ductDia;
    elements.get('numDucts').value = tc.numDucts;
    if (tc.box === 'bp4' || tc.box === 'bp6') {
      vm.runInContext('setTuningMode(false);', ctx);
      elements.get('vbInput').value = '60';
      elements.get('vrInput').value = '80';
      elements.get('fbInput').value = '55.0';
    }
    vm.runInContext("recalculate(); autofixWoodlockGeometry('pgs test'); updateWoodlock();", ctx);
    const geom = vm.runInContext('lastBuildPack.geometry', ctx);
    assert(geom && geom.schema === 'bassforge-pgs/v1', `${tc.name}: geometry schema ausente`);
    assert.strictEqual(geom.validation.length, 12, `${tc.name}: esperado 12 checks G01..G12`);
    const failedChecks = geom.validation.filter(v => !v.pass);
    assert.strictEqual(failedChecks.length, 0, `${tc.name}: falhas PGS: ${JSON.stringify(failedChecks)}`);

    // Nesting 2D: nenhuma peça fora da chapa 2750x1830 e zero sobreposição na chapa 0
    const nest = geom.manufacturing.sheetLayout;
    assert(nest.sheetsCount >= 1 && nest.utilizationPct > 0, `${tc.name}: nesting inválido`);
    const s0 = nest.placements.filter(pl => pl.sheetIdx === 0);
    for (let i = 0; i < s0.length; i++) {
      assert(s0[i].x + s0[i].w <= nest.sheetW + 0.1 && s0[i].y + s0[i].h <= nest.sheetH + 0.1,
        `${tc.name}: peça ${s0[i].partId} excede limites da chapa`);
      for (let j = i + 1; j < s0.length; j++) {
        const a = s0[i], b = s0[j];
        const overlap = !(a.x + a.w <= b.x + 0.1 || b.x + b.w <= a.x + 0.1 || a.y + a.h <= b.y + 0.1 || b.y + b.h <= a.y + 0.1);
        assert.strictEqual(overlap, false, `${tc.name}: sobreposição no nesting entre ${a.partId} e ${b.partId}`);
      }
    }
  }

  // Controle de explosão 0% -> 50% -> 100% e visualização Nesting 2D sem erro
  vm.runInContext("setWoodlockViewMode('exploded'); setWoodlockExplode(0); setWoodlockExplode(0.5); setWoodlockExplode(1); setWoodlockViewMode('nesting'); setWoodlockViewMode('blueprint');", ctx);
  const html = vm.runInContext('generateBuildPackHtml().html', ctx);
  assert(html.includes('Sequência de Montagem') && html.includes('G01–G12'), 'Pacote HTML deve incluir Sequência de Montagem e Auditoria PGS');

  // Restaura Oversound padrão
  elements.get('driverPreset').value = 'oversound';
  vm.runInContext('loadPreset()', ctx);
});

// SUITE 16: Módulos 5 & 6 — Planar Horn (Quadrado & Triângulo), Travamentos 6-Eixos e Baffle Infinito (Free-Air)
runSuite('16. Planar Horn (Quadrado/Triângulo), Bracing 6-Eixos & Free-Air (PGS G01-G12)', () => {
  // 16A. Baffle Infinito (Free-Air): alpha=0, Fc=Fs, Qtc=Qts, 1 painel único, aviso FREE_AIR_ISOLATION, PGS 12/12
  elements.get('driverPreset').value = 'oversound';
  vm.runInContext('loadPreset()', ctx);
  vm.runInContext("selectTopology('free-air'); updateWoodlock();", ctx);
  const faPack = vm.runInContext('lastBuildPack', ctx);
  const faCurves = vm.runInContext('currentCurves', ctx);
  assert.strictEqual(faPack.acoustics.boxType, 'free-air', 'boxType deve ser free-air');
  assert.strictEqual(elements.get('kpiAlfaVal').textContent, '0.00', `Free-Air alpha deve ser 0.00 (obtido ${elements.get('kpiAlfaVal').textContent})`);
  assert(Math.abs(faCurves.meta.fc - faPack.driver.Fs) < 0.05, `Free-Air Fc deve igualar Fs (${faCurves.meta.fc} vs ${faPack.driver.Fs})`);
  const qtsExp = (faPack.driver.Qms * faPack.driver.Qes) / (faPack.driver.Qms + faPack.driver.Qes);
  assert(Math.abs(parseFloat(elements.get('kpi1Val').textContent) - qtsExp) < 0.005, `Free-Air Qtc deve igualar Qts (${elements.get('kpi1Val').textContent} vs ${qtsExp.toFixed(3)})`);
  assert.strictEqual(faPack.pieces.length, 1, `Free-Air deve gerar exatamente 1 painel (obtido ${faPack.pieces.length})`);
  assert(faPack.validation.issues.some(i => i.code === 'FREE_AIR_ISOLATION'), 'Free-Air deve emitir aviso FREE_AIR_ISOLATION');
  const faFail = faPack.geometry.validation.filter(v => !v.pass);
  assert.strictEqual(faFail.length, 0, `Free-Air PGS falhou: ${JSON.stringify(faFail)}`);

  // 16B. Planar Horn Quadrado: CG > C, Baffle A×C4 e Divisória Boca Planar A4×R, PGS 12/12
  elements.get('wlPlanarStyle').value = 'square';
  vm.runInContext("selectTopology('planar'); updateWoodlock();", ctx);
  const sqPack = vm.runInContext('lastBuildPack', ctx);
  assert(sqPack.acoustics.planarGeom && sqPack.acoustics.planarGeom.style === 'square', 'planarGeom.style deve ser square');
  assert(sqPack.dimensions.CG > sqPack.dimensions.C_top, `Planar Quadrado deve ter CG (${sqPack.dimensions.CG}) > C (${sqPack.dimensions.C_top})`);
  assert(sqPack.pieces.some(p => /Baffle Planar Recuado/.test(p.name)), 'Planar Quadrado deve ter Baffle Recuado A×C4');
  assert(sqPack.pieces.some(p => /Divisória Boca Planar/.test(p.name)), 'Planar Quadrado deve ter Divisória A4×R');
  const sqFail = sqPack.geometry.validation.filter(v => !v.pass);
  assert.strictEqual(sqFail.length, 0, `Planar Quadrado PGS falhou: ${JSON.stringify(sqFail)}`);

  // 16C. Planar Horn Triângulo: Baffle Octogonal 4×45° + 4× Parede Triangular Chanfrada V×Z, PGS 12/12
  elements.get('wlPlanarStyle').value = 'triangle';
  vm.runInContext('updateWoodlock();', ctx);
  const triPack = vm.runInContext('lastBuildPack', ctx);
  assert(triPack.acoustics.planarGeom && triPack.acoustics.planarGeom.style === 'triangle', 'planarGeom.style deve ser triangle');
  assert(triPack.pieces.some(p => /Baffle Octogonal Planar/.test(p.name) && p.bev === 45), 'Planar Triângulo deve ter Baffle Octogonal 45°');
  const triWall = triPack.pieces.find(p => /Parede Triangular Chanfrada/.test(p.name));
  assert(triWall && triWall.qty === 4 && triWall.bev === 45, 'Planar Triângulo deve ter 4× Parede Triangular Chanfrada 45°');
  const triFail = triPack.geometry.validation.filter(v => !v.pass);
  assert.strictEqual(triFail.length, 0, `Planar Triângulo PGS falhou: ${JSON.stringify(triFail)}`);

  // 16D. Travamentos Estruturais 6-Eixos: ativa FF, TB e LR, verifica peças individuais e fechamento G07
  vm.runInContext("selectTopology('bass-reflex');", ctx);
  elements.get('wlBraceFF').checked = true;
  elements.get('wlBraceTB').checked = true;
  elements.get('wlBraceLR').checked = true;
  vm.runInContext('onWoodlockBracingChange();', ctx);
  const brPack = vm.runInContext('lastBuildPack', ctx);
  assert.strictEqual(elements.get('wlBattens').value, '3', 'wlBattens deve sincronizar para 3 com 3 eixos marcados');
  const battenPieces = brPack.pieces.filter(p => p.kind === 'batten');
  assert.strictEqual(battenPieces.length, 3, 'Devem existir 3 peças individuais de sarrafo por eixo');
  assert(battenPieces.some(p => p.orient === 'TRAVA_FF') && battenPieces.some(p => p.orient === 'TRAVA_LR'), 'Eixos FF e LR devem estar no BOM');
  const brFail = brPack.geometry.validation.filter(v => !v.pass);
  assert.strictEqual(brFail.length, 0, `Bracing 6-eixos PGS falhou: ${JSON.stringify(brFail)}`);

  // Limpa checkboxes e restaura Oversound padrão
  elements.get('wlBraceFF').checked = false;
  elements.get('wlBraceTB').checked = false;
  elements.get('wlBraceLR').checked = false;
  elements.get('wlPlanarStyle').value = 'square';
  elements.get('driverPreset').value = 'oversound';
  vm.runInContext('loadPreset()', ctx);
});

// SUITE 17: Exportador CAD DXF R12 (1:1 em mm) — Todas as Topologias
runSuite('17. Exportador CAD DXF R12 1:1 (Camadas, Nesting, Baffle & Corte Lateral)', () => {
  const cases = [
    ['bass-reflex', 'square'],
    ['sealed', 'square'],
    ['planar', 'square'],
    ['planar', 'triangle'],
    ['free-air', 'square']
  ];
  for (const [topo, pStyle] of cases) {
    elements.get('driverPreset').value = 'oversound';
    vm.runInContext('loadPreset()', ctx);
    elements.get('wlPlanarStyle').value = pStyle;
    vm.runInContext(`selectTopology('${topo}'); updateWoodlock();`, ctx);
    const dxf = vm.runInContext('buildPgsDxfString(lastBuildPack)', ctx);
    assert(dxf.includes('AC1009') && dxf.trim().endsWith('EOF'), `${topo}/${pStyle}: DXF deve ter header AC1009 e EOF`);
    assert(!dxf.includes('NaN'), `${topo}/${pStyle}: DXF não pode conter NaN`);
    for (const lyr of ['CHAPA_MDF', 'PECAS_CORTE', 'BAFFLE_FURACAO', 'VISTA_LATERAL', 'TEXTO_COTAS', 'COTAS_DIM']) {
      assert(dxf.includes(lyr), `${topo}/${pStyle}: camada ${lyr} ausente no DXF`);
    }
    assert(dxf.includes('\r\nCIRCLE\r\n'), `${topo}/${pStyle}: DXF deve conter CIRCLE de furação do driver`);
    assert(dxf.includes('\r\nDIMENSION\r\n'), `${topo}/${pStyle}: DXF deve conter cotas lineares DIMENSION nativas`);
    const dxf3d = vm.runInContext('buildPgs3dDxfString(lastBuildPack, 0.5)', ctx);
    assert(dxf3d.includes('\r\n3DFACE\r\n') && dxf3d.includes('PAINEIS_3D') && !dxf3d.includes('NaN'), `${topo}/${pStyle}: DXF 3D deve gerar 3DFACE válido sem NaN`);
    const obj3d = vm.runInContext('buildPgsObjString(lastBuildPack, 0.0)', ctx);
    assert(obj3d.includes('o P_FRONT_BAFFLE') && obj3d.includes('\nv ') && obj3d.includes('\nf ') && !obj3d.includes('NaN'), `${topo}/${pStyle}: OBJ 3D sólido deve gerar vértices e faces válidos sem NaN`);
  }
  elements.get('wlPlanarStyle').value = 'square';
  elements.get('driverPreset').value = 'oversound';
  vm.runInContext('loadPreset()', ctx);
});

// SUITE 18: Alinhamento PGS Duto Régua + Exportador de Macro FreeCAD (.FCMacro)
runSuite('18. Alinhamento PGS Duto Régua & Exportador Macro FreeCAD (.FCMacro)', () => {
  elements.get('driverPreset').value = 'oversound';
  vm.runInContext('loadPreset()', ctx);
  elements.get('portType').value = 'slot_wall';
  vm.runInContext("selectTopology('bass-reflex'); recalculate(); autofixWoodlockGeometry('s18'); updateWoodlock();", ctx);
  const slotPack = vm.runInContext('lastBuildPack', ctx);
  const t = slotPack.dimensions.t;
  const slotHole = slotPack.baffleHoles.find(h => h.kind === 'port' && h.shape === 'slot');
  const portPart = slotPack.geometry.parts.find(p => p.kind === 'port');
  const frontPart = slotPack.geometry.parts.find(p => p.id === 'P_FRONT_BAFFLE');
  assert(slotHole && portPart && frontPart, 'Dutada régua deve possuir recorte slot, peça port e baffle frontal');
  approx(portPart.origin[1], t + slotHole.h, 0.2, 'Divisória régua horizontal deve iniciar exatamente em y = t + slotH');
  approx(portPart.origin[1] + portPart.size[1], frontPart.origin[1], 0.2, 'Topo da divisória régua deve encostar exatamente na base do baffle reduzido');

  const macro0 = vm.runInContext('buildFreeCadMacroString(lastBuildPack, 0.0)', ctx);
  const macro1 = vm.runInContext('buildFreeCadMacroString(lastBuildPack, 1.0)', ctx);
  assert(macro0.includes('PACK_JSON = r\'\'\'') && macro0.includes('EXPLODE_RATIO = 0.00') && macro0.includes('make_planar_chamfers'), 'Macro FreeCAD 0% deve ser válida e autocontida');
  assert(macro1.includes('EXPLODE_RATIO = 1.00') && !macro1.includes('NaN'), 'Macro FreeCAD 100% explodida deve ser válida sem NaN');

  elements.get('portType').value = 'round';
  elements.get('driverPreset').value = 'oversound';
  vm.runInContext('loadPreset()', ctx);
});

// SUITE 19: Expansão CAD 3D P1 — Trapézio, BP6 Série, Duto Triângulo & Duto Régua Vertical
runSuite('19. Expansão CAD 3D P1 (Trapézio, BP6 Série, Duto Triângulo & Régua Vertical)', () => {
  // 19.1 Trapézio 15°
  elements.get('driverPreset').value = 'oversound';
  vm.runInContext('loadPreset()', ctx);
  elements.get('wlShape').value = 'trapezoidal';
  elements.get('wlAngle').value = '15';
  vm.runInContext("selectTopology('sealed'); recalculate(); autofixWoodlockGeometry('s19_trap'); updateWoodlock();", ctx);
  const trapPack = vm.runInContext('lastBuildPack', ctx);
  assert.strictEqual(trapPack.geometry.envelope.shape, 'trapezoidal', 'Envelope PGS deve marcar trapezoidal');
  assert(trapPack.dimensions.C_top < trapPack.dimensions.D_bot - 50, 'Trapézio deve ter C_top < D_bot');
  const pTop = trapPack.geometry.parts.find(p => p.id === 'P_TOP');
  const pSides = trapPack.geometry.parts.find(p => p.id === 'P_SIDES');
  const pRear = trapPack.geometry.parts.find(p => p.id === 'P_REAR');
  approx(pTop.origin[2] + pTop.size[2], trapPack.geometry.envelope.D_ext, 0.3, 'P_TOP trapezoidal deve alinhar à frente D_ext');
  assert(pSides.trapezoid && pRear.trapezoid, 'P_SIDES e P_REAR devem carregar metadados trapezoidais');
  elements.get('wlShape').value = 'rectangular';

  // 19.2 Duto Régua Vertical
  elements.get('portType').value = 'slot_wall';
  elements.get('wlSlotOrient').value = 'vertical';
  elements.get('slotW').value = '58';
  elements.get('slotH').value = '7';
  vm.runInContext("selectTopology('bass-reflex'); recalculate(); autofixWoodlockGeometry('s19_sv'); updateWoodlock();", ctx);
  const svPack = vm.runInContext('lastBuildPack', ctx);
  const svFront = svPack.geometry.parts.find(p => p.id === 'P_FRONT_BAFFLE');
  const svPort = svPack.geometry.parts.find(p => p.kind === 'port');
  approx(svFront.origin[0] + svFront.size[0], svPack.geometry.envelope.F - svPack.dimensions.t, 0.2, 'Baffle régua vertical deve encostar na lateral direita x = F - t');
  approx(svPort.origin[0] + svPort.size[0], svFront.origin[0], 0.2, 'Divisória régua vertical à esquerda deve encostar na borda esquerda do baffle');
  elements.get('wlSlotOrient').value = 'horizontal';

  // 19.3 Duto Triângulo Bass-Reflex
  elements.get('portType').value = 'triangle';
  elements.get('triCount').value = '4';
  elements.get('triA').value = '14';
  elements.get('triB').value = '14';
  vm.runInContext("selectTopology('bass-reflex'); recalculate(); autofixWoodlockGeometry('s19_tri'); updateWoodlock();", ctx);
  const triPack = vm.runInContext('lastBuildPack', ctx);
  const triPort = triPack.geometry.parts.find(p => p.kind === 'port');
  const triCuts = triPack.geometry.cutouts.filter(c => c.shape === 'triangle');
  assert(triPort && triPort.triMeta && triPort.triMeta.count === 4, 'Duto triângulo deve exportar triMeta com 4 cantos');
  assert.strictEqual(triCuts.length, 4, 'Baffle deve possuir 4 cutouts triangulares');

  // 19.4 BP6 Paralela (2 câmaras dutadas no tampo)
  elements.get('portType').value = 'round';
  vm.runInContext("selectTopology('bp6'); setTuningMode(false);", ctx);
  elements.get('vbInput').value = '60';
  elements.get('vrInput').value = '80';
  elements.get('fbInput').value = '55.0';
  elements.get('ductDia').value = '4.0';
  elements.get('numDucts').value = '2';
  elements.get('fbVrInput').value = '35.0';
  vm.runInContext("recalculate(); autofixWoodlockGeometry('s19_bp6p'); updateWoodlock();", ctx);
  const bp6pPack = vm.runInContext('lastBuildPack', ctx);
  const rearPort = bp6pPack.geometry.parts.find(p => p.id === 'P_PORT_REAR');
  assert(rearPort && rearPort.bpTopRound, 'BP6 Paralela deve gerar P_PORT_REAR no tampo superior');
  assert.strictEqual(bp6pPack.validation.valid, true, 'BP6 Paralela após autofix deve ser 100% válida');

  elements.get('driverPreset').value = 'oversound';
  vm.runInContext('loadPreset()', ctx);
});

// SUITE 20: Cobertura Completa Árvore 01..08 (2 Subs + P_CENTER_DIV, Duto Único V/R, BP4/BP6 Duto Quadrado, Planar/BP6 Trapézio)
runSuite('20. Árvore Completa 01..08 (2 Subs, Duto Único, BP Duto Quadrado, Trapézio Universal)', () => {
  // 20.1 Selada 2 Subs com P_CENTER_DIV
  elements.get('driverPreset').value = 'oversound';
  vm.runInContext('loadPreset()', ctx);
  elements.get('simNumDrivers').value = '2';
  elements.get('wlPortLayout').value = 'standard';
  elements.get('wlShape').value = 'rectangular';
  elements.get('vbInput').value = '260';
  vm.runInContext("selectTopology('sealed'); recalculate(); autofixWoodlockGeometry('s20_2s'); updateWoodlock();", ctx);
  const s2Pack = vm.runInContext('lastBuildPack', ctx);
  assert.strictEqual(s2Pack.validation.valid, true, 'Selada 2 Subs deve ser válida');
  assert(s2Pack.geometry.parts.some(p => p.id === 'P_CENTER_DIV'), 'Selada 2 Subs deve gerar P_CENTER_DIV');
  assert.strictEqual(s2Pack.geometry.cutouts.filter(c => c.kind === 'driver').length, 2, 'Selada 2 Subs deve ter 2 furos de driver');

  // 20.2 Duto Único Vertical Central (2 Subs)
  elements.get('portType').value = 'slot_wall';
  elements.get('wlSlotOrient').value = 'vertical';
  elements.get('wlPortLayout').value = 'center_shared';
  elements.get('vbInput').value = '280';
  elements.get('slotW').value = '50';
  elements.get('slotH').value = '12';
  vm.runInContext("selectTopology('bass-reflex'); setTuningMode(false);", ctx);
  elements.get('fbInput').value = '36.0';
  vm.runInContext("recalculate(); autofixWoodlockGeometry('s20_uv'); updateWoodlock();", ctx);
  const uvPack = vm.runInContext('lastBuildPack', ctx);
  const uvFront = uvPack.geometry.parts.find(p => p.id === 'P_FRONT_BAFFLE');
  const uvPort = uvPack.geometry.parts.find(p => p.kind === 'port');
  assert.strictEqual(uvPack.validation.valid, true, 'Duto Único Vertical deve ser válido');
  assert(uvFront && uvFront.frontSplit, 'Duto Único Vertical deve dividir P_FRONT_BAFFLE em 2 painéis');
  assert(uvPort && uvPort.sharedCenterSlot, 'Duto Único Vertical deve exportar sharedCenterSlot (2 paredes paralelas)');
  elements.get('wlPortLayout').value = 'standard';
  elements.get('wlSlotOrient').value = 'horizontal';

  // 20.3 BP6 Paralelo Duto Quadrado de Topo
  elements.get('simNumDrivers').value = '1';
  elements.get('portType').value = 'slot_wall';
  elements.get('slotW').value = '40';
  elements.get('slotH').value = '6';
  vm.runInContext("selectTopology('bp6'); setTuningMode(false);", ctx);
  elements.get('vbInput').value = '70';
  elements.get('vrInput').value = '90';
  elements.get('fbInput').value = '58.0';
  elements.get('fbVrInput').value = '42.0';
  vm.runInContext("recalculate(); autofixWoodlockGeometry('s20_bp6q'); updateWoodlock();", ctx);
  const bp6qPack = vm.runInContext('lastBuildPack', ctx);
  const bp6qSides = bp6qPack.geometry.parts.find(p => p.id === 'P_SIDES');
  const bp6qTop = bp6qPack.geometry.parts.find(p => p.id === 'P_TOP');
  assert.strictEqual(bp6qPack.validation.valid, true, 'BP6 Paralelo Duto Quadrado deve ser válido');
  assert(bp6qSides && bp6qSides.leftTopExtend && bp6qSides.rightTopExtend, 'BP6 Paralelo Duto Quadrado deve estender ambas as laterais (BM = B + t)');
  assert(bp6qTop && bp6qTop.size[0] < bp6qPack.geometry.envelope.F - 100, 'BP6 Paralelo Duto Quadrado deve reduzir tampo superior F2');

  // 20.4 Planar Quadrado Trapezoidal
  elements.get('wlShape').value = 'trapezoidal';
  elements.get('wlAngle').value = '12';
  elements.get('wlPlanarStyle').value = 'square';
  elements.get('vbInput').value = '140';
  vm.runInContext("selectTopology('planar'); recalculate(); autofixWoodlockGeometry('s20_pt'); updateWoodlock();", ctx);
  const ptPack = vm.runInContext('lastBuildPack', ctx);
  assert.strictEqual(ptPack.validation.valid, true, 'Planar Quadrado Trapezoidal deve ser válido');
  assert.strictEqual(ptPack.geometry.envelope.shape, 'trapezoidal', 'Planar Trapezoidal deve preservar envelope trapezoidal');
  assert(ptPack.dimensions.C_top < ptPack.dimensions.D_bot - 40, 'Planar Trapezoidal deve ter C_top < D_bot');

  // Restaura estado padrão
  elements.get('wlShape').value = 'rectangular';
  elements.get('simNumDrivers').value = '1';
  elements.get('portType').value = 'round';
  elements.get('driverPreset').value = 'oversound';
  vm.runInContext('loadPreset()', ctx);
});

// SUITE 21: Módulos 09 (Bracing 6-Eixos + Window Brace) e 10 (Alojamento Veicular DIV/CXRODAS/BARRA)
runSuite('21. Módulos 09 & 10 (Bracing 6-Eixos + Window Brace, Matriz DIV Meia-Madeira, CXRODAS & BARRA)', () => {
  const bIds = ['wlBraceFF', 'wlBraceTB', 'wlBraceLR', 'wlBraceCross', 'wlBraceBaffle', 'wlBraceRear'];
  // 21.1 Bracing 6-eixos completo (1_1_1_1_1_1) em Trapézio + Window Brace 5 furos
  elements.get('driverPreset').value = 'oversound';
  vm.runInContext('loadPreset()', ctx);
  elements.get('wlShape').value = 'trapezoidal';
  elements.get('wlAngle').value = '12';
  bIds.forEach(id => { elements.get(id).checked = true; });
  elements.get('wlBattens').value = '6';
  vm.runInContext("selectTopology('sealed'); recalculate(); autofixWoodlockGeometry('s21_br'); updateWoodlock();", ctx);
  const brPack = vm.runInContext('lastBuildPack', ctx);
  assert.strictEqual(brPack.validation.valid, true, 'Bracing 6-eixos trapezoidal deve ser válido');
  const winPart = brPack.geometry.parts.find(p => p.id === 'P_BRACE_CROSS');
  assert(winPart && winPart.braceMeta && winPart.braceMeta.isWindow && winPart.braceMeta.holesCount === 5,
    'Window Brace trapezoidal deve exportar braceMeta.isWindow com 5 furos');
  const braceParts = brPack.geometry.parts.filter(p => p.kind === 'batten');
  assert.strictEqual(braceParts.length, 6, 'Devem existir 6 peças individuais P_BRACE_*');
  bIds.forEach(id => { elements.get(id).checked = false; });
  elements.get('wlBattens').value = '0';

  // 21.2 Alojamento Veicular Completo (Matriz 3x4 + CXRODAS + BARRA)
  elements.get('wlShape').value = 'rectangular';
  elements.get('wlMatrixCols').value = '3';
  elements.get('wlMatrixRows').value = '4';
  elements.get('wlWheelArch').checked = true;
  elements.get('wlProtectBar').checked = true;
  elements.get('wlWidthA').value = '1050';
  elements.get('wlHeightB').value = '720';
  elements.get('vbInput').value = '300';
  vm.runInContext("recalculate(); autofixWoodlockGeometry('s21_aloj'); updateWoodlock();", ctx);
  const alPack = vm.runInContext('lastBuildPack', ctx);
  assert.strictEqual(alPack.validation.valid, true, 'Alojamento completo deve ser válido');
  assert(alPack.geometry.parts.some(p => p.id === 'P_MATRIX_V' && p.qty === 2), 'Matriz 3x4 deve gerar 2 divisórias verticais');
  assert(alPack.geometry.parts.some(p => p.id === 'P_MATRIX_H' && p.qty === 3), 'Matriz 3x4 deve gerar 3 divisórias horizontais');
  assert(alPack.geometry.parts.some(p => p.id === 'P_WHEEL_ARCH'), 'CXRODAS deve gerar P_WHEEL_ARCH');
  assert(alPack.geometry.parts.some(p => p.id === 'P_PROTECT_BAR'), 'BARRA deve gerar P_PROTECT_BAR');

  // Restaura estado padrão
  elements.get('wlMatrixCols').value = '1';
  elements.get('wlMatrixRows').value = '1';
  elements.get('wlWheelArch').checked = false;
  elements.get('wlProtectBar').checked = false;
  elements.get('driverPreset').value = 'oversound';
  vm.runInContext('loadPreset()', ctx);
});

// SUITE 22: Motor Físico Acoplado Band-Pass (BP4, BP6 Paralela/Série) & Parâmetros Clássicos (Q't, DF, S, Pa)
runSuite('22. Band-Pass Coupled Physics (BP4, BP6 Parallel/Series) & Q\'t / DF / S / Pa Synthesis', () => {
  const nearestIdx = (freqs, target) => freqs.reduce((best, f, i) => (Math.abs(f - target) < Math.abs(freqs[best] - target) ? i : best), 0);

  // 22.1 BP4 Butterworth B4 (S=0.707, Pa=0dB) no Oversound 18"
  elements.get('driverPreset').value = 'oversound';
  vm.runInContext('loadPreset()', ctx);
  vm.runInContext("selectTopology('bp4')", ctx);
  elements.get('bpAlignPreset').value = 'butterworth';
  vm.runInContext('onBpAlignPresetChange(); applyBandPassSynthesis();', ctx);

  const cB4 = vm.runInContext('currentCurves', ctx);
  const mB4 = cB4.meta.bpMetrics;
  assert(mB4, 'BP4 deve preencher currentCurves.meta.bpMetrics');
  approx(mB4.sFactor, 0.707, 0.015, 'BP4 Butterworth S');
  approx(mB4.qtPrime, 0.707, 0.015, 'BP4 Butterworth Q\'t');
  approx(mB4.df, 1.414, 0.03, 'BP4 Butterworth DF');
  approx(mB4.symRatio, 1.00, 0.02, 'BP4 Butterworth simetria Fb/Fc');
  assert(mB4.paCenterDb > -1.0 && mB4.paCenterDb < 0.6, `BP4 Butterworth Pa central esperado ~0 dB, obtido ${mB4.paCenterDb.toFixed(2)} dB`);
  assert(mB4.rippleDb < 0.6, `BP4 Butterworth ripple deve ser <0.6 dB, obtido ${mB4.rippleDb.toFixed(2)} dB`);

  // Inclinações assintóticas BP4: +12 dB/oit (HP) e -12 dB/oit (LP)
  const i10 = nearestIdx(cB4.frequencies, 10), i20 = nearestIdx(cB4.frequencies, 20);
  const i500 = nearestIdx(cB4.frequencies, 500), i1000 = nearestIdx(cB4.frequencies, 1000);
  const slopeLow4 = cB4.G4_NormAmp[i20] - cB4.G4_NormAmp[i10];
  const slopeHi4 = cB4.G4_NormAmp[i1000] - cB4.G4_NormAmp[i500];
  assert(slopeLow4 > 11.0 && slopeLow4 < 15.5, `BP4 roll-off grave esperado ~+12 dB/oit, obtido ${slopeLow4.toFixed(2)}`);
  assert(slopeHi4 < -11.0 && slopeHi4 > -13.5, `BP4 roll-off agudo esperado ~-12 dB/oit, obtido ${slopeHi4.toFixed(2)}`);

  // Impedância complexa real BP4: vale em Fb próximo a Re, flanqueado por 2 picos reais > 2*Re
  const iFb4 = nearestIdx(cB4.frequencies, cB4.meta.Fb);
  const zAtFb4 = cB4.G11_InBoxZ[iFb4];
  const zPeakLow = Math.max(...cB4.G11_InBoxZ.slice(0, iFb4));
  const zPeakHigh = Math.max(...cB4.G11_InBoxZ.slice(iFb4 + 1));
  assert(zAtFb4 < cB4.meta.Re * 1.35, `BP4 vale de impedância em Fb (${zAtFb4.toFixed(2)}Ω) deve aproximar Re (${cB4.meta.Re}Ω)`);
  assert(zPeakLow > cB4.meta.Re * 2.0 && zPeakHigh > cB4.meta.Re * 2.0, `BP4 deve exibir 2 picos reais de impedância (${zPeakLow.toFixed(1)}Ω / ${zPeakHigh.toFixed(1)}Ω)`);
  assert(cB4.meta.minEpdrVal > 0 && cB4.meta.minEpdrVal <= cB4.meta.Re * 1.05, `BP4 EPDR mínimo inválido: ${cB4.meta.minEpdrVal}`);

  // Proteção sub-grave real da câmara traseira selada (excursão finita e estabilizada em 10 Hz)
  assert(cB4.G8_ConeExcursion[0] > 0 && cB4.G8_ConeExcursion[0] < 100, `BP4 excursão em 10 Hz deve estabilizar, obtido ${cB4.G8_ConeExcursion[0]}`);
  assert(Math.max(...cB4.G9_PortAirVel) > 0.5, 'BP4 velocidade real de duto deve ser positiva');
  assert(elements.get('bpTelemetryBox').innerHTML.includes("Q't:") && elements.get('bpTelemetryBox').innerHTML.includes('DF:'), 'UI bpTelemetryBox deve exibir Q\'t e DF');

  // 22.2 BP4 Chebyshev SPL (S=0.50, Pa=+3dB): maior ganho e banda mais estreita que Butterworth
  elements.get('bpAlignPreset').value = 'chebyshev_spl';
  vm.runInContext('onBpAlignPresetChange(); applyBandPassSynthesis();', ctx);
  const mCheb = vm.runInContext('currentCurves.meta.bpMetrics', ctx);
  approx(mCheb.sFactor, 0.500, 0.015, 'BP4 Chebyshev S');
  approx(mCheb.qtPrime, 1.000, 0.03, 'BP4 Chebyshev Q\'t');
  approx(mCheb.df, 1.000, 0.03, 'BP4 Chebyshev DF');
  assert(mCheb.peakDb > mB4.peakDb + 2.0, `BP4 Chebyshev pico (${mCheb.peakDb.toFixed(2)}) deve superar Butterworth (${mB4.peakDb.toFixed(2)}) em >2 dB`);
  assert(mCheb.octaves < mB4.octaves, `BP4 Chebyshev banda (${mCheb.octaves.toFixed(2)} oit) deve ser mais estreita que Butterworth (${mB4.octaves.toFixed(2)} oit)`);

  // 22.3 BP6 Paralela: inclinações +24 dB/oit (HP) e -12 dB/oit (LP) + síntese Quasi-Plana vs SPL
  vm.runInContext("selectTopology('bp6')", ctx);
  elements.get('bpAlignPreset').value = 'bp6_flat';
  vm.runInContext('applyBandPassSynthesis();', ctx);
  const c6p = vm.runInContext('currentCurves', ctx);
  const m6p = c6p.meta.bpMetrics;
  const slopeLow6p = c6p.G4_NormAmp[nearestIdx(c6p.frequencies, 20)] - c6p.G4_NormAmp[nearestIdx(c6p.frequencies, 10)];
  const slopeHi6p = c6p.G4_NormAmp[i1000] - c6p.G4_NormAmp[i500];
  assert(slopeLow6p > 21.0 && slopeLow6p < 29.0, `BP6 Paralela roll-off grave esperado ~+24 dB/oit, obtido ${slopeLow6p.toFixed(2)}`);
  assert(slopeHi6p < -11.0 && slopeHi6p > -13.5, `BP6 Paralela roll-off agudo esperado ~-12 dB/oit, obtido ${slopeHi6p.toFixed(2)}`);
  assert(m6p && m6p.qtPrime > 0 && m6p.df > 0, 'BP6 Paralela deve expor Q\'t e DF válidos');

  // 22.4 BP6 Paralela SPL deve superar ganho de pico do bp6_flat
  elements.get('bpAlignPreset').value = 'bp6_spl';
  vm.runInContext('applyBandPassSynthesis();', ctx);
  const m6pSpl = vm.runInContext('currentCurves.meta.bpMetrics', ctx);
  assert(m6pSpl.peakDb > m6p.peakDb + 0.5, `BP6 SPL (${m6pSpl.peakDb.toFixed(2)} dB) deve superar bp6_flat (${m6p.peakDb.toFixed(2)} dB)`);

  // 22.5 Alerta explícito de limitação física em BP4 quando Qts > alvo (Qts=0.75, Bessel Pa=-1.5dB)
  vm.runInContext("selectTopology('bp4')", ctx);
  elements.get('tsQes').value = '0.85';
  elements.get('tsQms').value = '6.5';
  elements.get('bpAlignPreset').value = 'bessel';
  vm.runInContext('onBpAlignPresetChange(); applyBandPassSynthesis();', ctx);
  assert(elements.get('bpTelemetryBox').innerHTML.includes('Limitado por Qts='),
    'BP4 síntese limitada por Qts alto deve exibir alerta explícito em bpTelemetryBox');

  // Restaura estado padrão
  elements.get('driverPreset').value = 'oversound';
  vm.runInContext('loadPreset()', ctx);
});

// ============================================================================
// SUITE 23: BP6 Dual-Port G9/G2 Curves, Dropdown Switch & Smart Port Sizing
// ============================================================================
runSuite('23. BP6 Dual-Port G9/G2 Curves, Dropdown Topology Switch & Synthesis Port Sizing', () => {
  elements.get('driverPreset').value = 'oversound';
  vm.runInContext('loadPreset()', ctx);

  // 23.1 Simula troca via dropdown (#boxType já alterado antes de selectTopology)
  vm.runInContext("selectTopology('bass-reflex')", ctx);
  elements.get('boxType').value = 'bp6';
  vm.runInContext("selectTopology('bp6')", ctx);
  const bpDrop = vm.runInContext('lastBuildPack', ctx);
  const cDrop = vm.runInContext('currentCurves', ctx);
  assert(bpDrop.acoustics.Vr > bpDrop.acoustics.Vb, `BP6 via dropdown deve configurar VR (${bpDrop.acoustics.Vr}L) > VF (${bpDrop.acoustics.Vb}L)`);
  assert(bpDrop.acoustics.LvCm > 0, `BP6 via dropdown deve ter Lv VF positivo, obtido ${bpDrop.acoustics.LvCm}`);
  assert((bpDrop.acoustics.lvRearMm || 0) > 0, `BP6 via dropdown deve ter Lv VR positivo, obtido ${bpDrop.acoustics.lvRearMm}`);
  assert(bpDrop.validation.valid === true, `BP6 via dropdown deve ser válido: ${JSON.stringify(bpDrop.validation.issues)}`);

  // 23.2 Curvas individuais G9_PortAirVel_VF & G9_PortAirVel_VR + G2_VentSPL_VF & G2_VentSPL_VR
  assert(Array.isArray(cDrop.G9_PortAirVel_VF) && cDrop.G9_PortAirVel_VF.length === cDrop.frequencies.length, 'G9_PortAirVel_VF deve existir');
  assert(Array.isArray(cDrop.G9_PortAirVel_VR) && cDrop.G9_PortAirVel_VR.length === cDrop.frequencies.length, 'G9_PortAirVel_VR deve existir');
  assert(Array.isArray(cDrop.G2_VentSPL_VF) && cDrop.G2_VentSPL_VF.length === cDrop.frequencies.length, 'G2_VentSPL_VF deve existir');
  assert(Array.isArray(cDrop.G2_VentSPL_VR) && cDrop.G2_VentSPL_VR.length === cDrop.frequencies.length, 'G2_VentSPL_VR deve existir');
  const maxVf = Math.max(...cDrop.G9_PortAirVel_VF);
  const maxVr = Math.max(...cDrop.G9_PortAirVel_VR);
  assert(maxVf > 1.0 && maxVr > 1.0, `BP6 deve ter velocidades reais em VF (${maxVf.toFixed(1)}) e VR (${maxVr.toFixed(1)})`);
  assert(maxVr < 34.3, `BP6 padrão não deve estourar 10% Mach em VR (obtido ${maxVr.toFixed(1)} m/s)`);
  const fPeakVf = cDrop.frequencies[cDrop.G9_PortAirVel_VF.indexOf(maxVf)];
  const fPeakVr = cDrop.frequencies[cDrop.G9_PortAirVel_VR.indexOf(maxVr)];
  assert(fPeakVf > fPeakVr, `Pico de velocidade VF (${fPeakVf.toFixed(1)}Hz) deve estar acima de VR (${fPeakVr.toFixed(1)}Hz)`);

  const sG9 = vm.runInContext("getBp6DualPortVelSeries(CHARTS_INFO.find(c => c.id === 'G9'))", ctx);
  const sG2 = vm.runInContext("getBp6DualPortVelSeries(CHARTS_INFO.find(c => c.id === 'G2'))", ctx);
  assert(Array.isArray(sG9) && sG9.length === 2, 'G9 em BP6 deve plotar 2 séries (Duto VF e Duto VR)');
  assert(Array.isArray(sG2) && sG2.length === 3, 'G2 em BP6 deve plotar 3 séries (Total, VF e VR)');

  // 23.3 Síntese BP4 & BP6 deve auto-dimensionar dutos sem Lv negativo ou inválido
  for (const [bt, preset] of [['bp4', 'butterworth'], ['bp6', 'bp6_flat'], ['bp6', 'bp6_ext'], ['bp6', 'bp6_spl']]) {
    vm.runInContext(`selectTopology('${bt}')`, ctx);
    elements.get('bpAlignPreset').value = preset;
    vm.runInContext('onBpAlignPresetChange(); applyBandPassSynthesis();', ctx);
    const bp = vm.runInContext('lastBuildPack', ctx);
    assert(bp.acoustics.LvCm > 0, `Síntese ${bt}/${preset} deve gerar Lv VF > 0 (obtido ${bp.acoustics.LvCm})`);
    if (bt === 'bp6') {
      assert((bp.acoustics.lvRearMm || 0) > 0, `Síntese ${bt}/${preset} deve gerar Lv VR > 0 (obtido ${bp.acoustics.lvRearMm})`);
    }
    assert(bp.validation.valid === true, `Síntese ${bt}/${preset} deve ser válida: ${JSON.stringify(bp.validation.issues)}`);
  }
  // Restaura estado padrão
  elements.get('driverPreset').value = 'oversound';
  vm.runInContext('loadPreset()', ctx);
});

// ============================================================================
// SUITE 24: Motor Auto-Design PhD Universal (Qualquer Driver + Perfis + Topologias)
// ============================================================================
runSuite('24. PhD Universal Auto-Design Engine (QB3/B4/Sealed/BP4/BP6, Laminar Port & Xmax HPF)', () => {
  // 24.1 Classificação automática nas 5 topologias (BP6, Planar, BP4, Bass-Reflex, Selada)
  vm.runInContext(`applyDbDriver({ name: 'Test 18 BP6', fs: 36, qes: 0.26, qms: 8.5, vas: 240, re: 5.2, pe: 1000, sd: 1210, xmax: 11, diameter_in: 18 })`, ctx);
  let bp = vm.runInContext('lastBuildPack', ctx);
  let c = vm.runInContext('currentCurves', ctx);
  assert.strictEqual(bp.acoustics.boxType, 'bp6', 'Driver 18" EBP=138 Fs=36 Qts=0.25 deve escolher bp6');
  assert(bp.acoustics.LvCm > 0 && (bp.acoustics.lvRearMm || 0) > 0, 'Driver BP6 deve ter Lv VF e VR positivos');
  assert(bp.validation.valid === true, `Driver BP6 deve gerar caixa válida: ${JSON.stringify(bp.validation.issues)}`);

  vm.runInContext(`applyDbDriver({ name: 'Test 12 Planar', fs: 55, qes: 0.32, qms: 7.5, vas: 60, re: 5.5, pe: 1200, sd: 530, xmax: 8, diameter_in: 12 })`, ctx);
  bp = vm.runInContext('lastBuildPack', ctx);
  assert.strictEqual(bp.acoustics.boxType, 'planar', 'Driver 12" PA EBP=172 Fs=55 Qts=0.31 deve escolher planar');
  assert(bp.validation.valid === true, `Driver Planar deve gerar caixa válida: ${JSON.stringify(bp.validation.issues)}`);

  vm.runInContext(`applyDbDriver({ name: 'Test 12 BP4', fs: 30, qes: 0.52, qms: 7.0, vas: 75, re: 3.6, pe: 400, sd: 510, xmax: 11, diameter_in: 12 })`, ctx);
  bp = vm.runInContext('lastBuildPack', ctx);
  assert.strictEqual(bp.acoustics.boxType, 'bp4', 'Driver 12" EBP=58 Qts=0.48 deve escolher bp4');
  assert(bp.acoustics.LvCm > 0, 'Driver BP4 deve ter Lv > 0');
  assert(bp.validation.valid === true, `Driver BP4 deve gerar caixa válida: ${JSON.stringify(bp.validation.issues)}`);

  // 24.2 Driver B: Sub 12" equilibrado B4 (Qts ~ 0.39, Vas 65L, 500W)
  vm.runInContext(`applyDbDriver({ name: 'Test 12 B4', fs: 32, qes: 0.41, qms: 6.8, vas: 65, re: 3.4, pe: 500, sd: 510, xmax: 12, diameter_in: 12 })`, ctx);
  bp = vm.runInContext('lastBuildPack', ctx);
  c = vm.runInContext('currentCurves', ctx);
  assert.strictEqual(bp.acoustics.boxType, 'bass-reflex', 'Driver B4 (EBP=78) deve escolher bass-reflex');
  assert(bp.acoustics.LvCm > 0, 'Driver B4 deve ter Lv > 0');
  assert(Math.max(...c.G4_NormAmp) <= 1.35, `Perfil musical B4 deve manter ripple <= 1.35 dB, obtido ${Math.max(...c.G4_NormAmp).toFixed(2)} dB`);
  assert(Math.max(...c.G9_PortAirVel) < 34.3, `Driver B4 500W compacto deve ficar abaixo de 10% Mach (34.3 m/s), obtido ${Math.max(...c.G9_PortAirVel).toFixed(1)} m/s`);
  assert(bp.validation.valid === true, `Driver B4 deve gerar caixa válida: ${JSON.stringify(bp.validation.issues)}`);

  // 24.3 Perfis rápidos: subgrave (Fb menor, Vb maior) vs spl (pico maior)
  elements.get('autoDesignProfile').value = 'subgrave';
  vm.runInContext('onAutoDesignProfileChange()', ctx);
  const subState = { Vb: vm.runInContext('lastBuildPack.acoustics.Vb', ctx), Fb: vm.runInContext('lastBuildPack.acoustics.Fb', ctx) };
  elements.get('autoDesignProfile').value = 'spl';
  vm.runInContext('onAutoDesignProfileChange()', ctx);
  const splState = { Vb: vm.runInContext('lastBuildPack.acoustics.Vb', ctx), Fb: vm.runInContext('lastBuildPack.acoustics.Fb', ctx), peak: Math.max(...vm.runInContext('currentCurves.G4_NormAmp', ctx)) };
  assert(subState.Vb > splState.Vb, `Subgrave Vb (${subState.Vb}L) deve ser maior que SPL Vb (${splState.Vb}L)`);
  assert(subState.Fb < splState.Fb, `Subgrave Fb (${subState.Fb}Hz) deve ser menor que SPL Fb (${splState.Fb}Hz)`);
  assert(splState.peak > 1.2, `Perfil SPL deve produzir reforço > 1.2 dB, obtido ${splState.peak.toFixed(2)} dB`);
  elements.get('autoDesignProfile').value = 'musical';

  // 24.4 Driver C: Sub 10" Qts alto / EBP baixo -> deve escolher Selada automaticamente
  vm.runInContext(`applyDbDriver({ name: 'Test 10 Sealed', fs: 30, qes: 0.68, qms: 5.5, vas: 42, re: 3.6, pe: 300, sd: 340, xmax: 10, diameter_in: 10 })`, ctx);
  bp = vm.runInContext('lastBuildPack', ctx);
  assert.strictEqual(bp.acoustics.boxType, 'sealed', 'Driver EBP=44 e Qts=0.60 deve escolher caixa selada');
  assert(bp.validation.valid === true, `Driver Selada deve gerar caixa válida: ${JSON.stringify(bp.validation.issues)}`);

  // 24.5 Troca de topologia com ⚡ ligado em driver 8" recalcula volume ideal em todas as topologias
  vm.runInContext(`applyDbDriver({ name: 'Test 8 Compact', fs: 48, qes: 0.38, qms: 6.0, vas: 22, re: 3.8, pe: 180, sd: 210, xmax: 6, diameter_in: 8 })`, ctx);
  for (const topo of ['sealed', 'bp4', 'bp6', 'planar', 'bass-reflex']) {
    vm.runInContext(`selectTopology('${topo}')`, ctx);
    const tPack = vm.runInContext('lastBuildPack', ctx);
    assert(tPack.validation.valid === true, `Troca automática para ${topo} (8") deve ser válida: ${JSON.stringify(tPack.validation.issues)}`);
    if (topo === 'bass-reflex' || topo === 'bp4' || topo === 'bp6') {
      assert(tPack.acoustics.LvCm > 0, `Troca automática para ${topo} (8") deve ter Lv > 0`);
    }
  }

  // Restaura estado padrão (Golden Master)
  elements.get('autoDesignProfile').value = 'musical';
  elements.get('driverPreset').value = 'oversound';
  vm.runInContext('setHpfEnabled(false, false); loadPreset();', ctx);
});

// ============================================================================
// SUITE 25: SPL Máximo Real (Limite Térmico Pe vs Limite Mecânico Xmax)
// ============================================================================
runSuite('25. Max Acoustic SPL Real (Thermal Pe vs Mechanical Xmax Limit)', () => {
  elements.get('driverPreset').value = 'oversound';
  vm.runInContext('setHpfEnabled(false, false); loadPreset();', ctx);
  const c = vm.runInContext('currentCurves', ctx);
  assert(Array.isArray(c.G6_SPLMaxReal) && c.G6_SPLMaxReal.length === c.frequencies.length, 'G6_SPLMaxReal deve existir com 600 pontos');
  assert(c.G6_SPLMaxReal.every(Number.isFinite), 'G6_SPLMaxReal não pode conter NaN/Infinity');

  // Sempre SPL Real <= SPL Térmico em toda a banda
  for (let i = 0; i < c.frequencies.length; i++) {
    assert(c.G6_SPLMaxReal[i] <= c.G6_SPLThermic[i] + 1e-6, `Em ${c.frequencies[i].toFixed(1)}Hz SPL Real (${c.G6_SPLMaxReal[i]}) > Térmico (${c.G6_SPLThermic[i]})`);
  }
  // Em 15 Hz sem HPF, cone excede Xmax -> SPL Real deve cair claramente abaixo do teto térmico
  const i15 = c.frequencies.reduce((b, f, i) => (Math.abs(f - 15) < Math.abs(c.frequencies[b] - 15) ? i : b), 0);
  const i200 = c.frequencies.reduce((b, f, i) => (Math.abs(f - 200) < Math.abs(c.frequencies[b] - 200) ? i : b), 0);
  assert(c.G6_SPLMaxReal[i15] < c.G6_SPLThermic[i15] - 3.0, `Em 15Hz sem HPF SPL Real deve refletir queda por Xmax (diff=${(c.G6_SPLMaxReal[i15] - c.G6_SPLThermic[i15]).toFixed(1)} dB)`);
  // Em 200 Hz (regime térmico puro), SPL Real == SPL Térmico
  approx(c.G6_SPLMaxReal[i200], c.G6_SPLThermic[i200], 0.05, 'Em 200Hz (térmico puro) SPL Real deve igualar SPL Térmico');

  const sG6 = vm.runInContext("getBp6DualPortVelSeries(CHARTS_INFO.find(c => c.id === 'G6'))", ctx);
  assert(Array.isArray(sG6) && sG6.length === 2, 'G6 deve retornar 2 séries (SPL Real + Teto Térmico Pe)');

  // 25.2 Etapa 4 do Auto-Design: driver com Xmax curto (LAB-12R 200W, Xmax 3.5mm) deve ajustar Pe automaticamente p/ Xpk <= Xmax
  vm.runInContext(`applyDbDriver({ name: 'LAB-12R Test', fs: 39, qes: 0.44, qms: 7.5, vas: 52, re: 7.0, pe: 200, sd: 510, xmax: 3.5, diameter_in: 12 })`, ctx);
  const cLab = vm.runInContext('currentCurves', ctx);
  const peAfter = parseFloat(elements.get('tsPe').value);
  const maxXAfter = Math.max(...cLab.G8_ConeExcursion);
  assert(peAfter < 200 && peAfter >= 60, `Auto-Design deve limitar Pe real do LAB-12R abaixo de 200W, obtido ${peAfter}W`);
  assert(maxXAfter <= 3.55, `Após ajuste automático de Pe (${peAfter}W), excursão máxima deve ficar <= Xmax (3.5mm), obtido ${maxXAfter.toFixed(2)}mm`);

  // 25.3 Guardrails físicos de Posição Axial do Duto (#wlPortOffset)
  elements.get('driverPreset').value = 'oversound';
  vm.runInContext('setHpfEnabled(false, false); loadPreset();', ctx);
  elements.get('wlPortOffset').value = '-30';
  vm.runInContext('updateWoodlock()', ctx);
  assert.strictEqual(vm.runInContext('lastBuildPack.acoustics.portOffsetMm', ctx), 0, 'Duto redondo não pode aceitar deslocamento negativo (<0)');
  elements.get('wlPortOffset').value = '999';
  vm.runInContext('updateWoodlock()', ctx);
  const clampedOut = vm.runInContext('lastBuildPack.acoustics.portOffsetMm', ctx);
  const lvRound = vm.runInContext('lastBuildPack.acoustics.lvMm', ctx);
  assert(clampedOut <= lvRound - 18 && clampedOut > 0, `Duto redondo para fora deve manter engaste mínimo t=18mm (obtido ${clampedOut} vs Lv=${lvRound})`);
  elements.get('portType').value = 'slot_wall';
  elements.get('wlPortOffset').value = '40';
  vm.runInContext('updateWoodlock()', ctx);
  assert.strictEqual(vm.runInContext('lastBuildPack.acoustics.portOffsetMm', ctx), 0, 'Duto régua MDF não pode sair para fora da caixa (>0)');

  // 25.4 Planar Horn = Câmara Traseira Dutada (Fb) + Túnel Frontal λ/4 + Posição Duto habilitada [-t, 0]
  vm.runInContext("selectTopology('planar')", ctx);
  const cPlan = vm.runInContext('currentCurves', ctx);
  const maxVelPlan = Math.max(...cPlan.G9_PortAirVel);
  assert(maxVelPlan > 0.5, `Planar dutada deve ter velocidade de ar no duto G9 > 0 (obtido ${maxVelPlan.toFixed(2)} m/s)`);
  assert(cPlan.meta.fQuarterWave >= 60 && cPlan.meta.fQuarterWave <= 350, `Planar deve calcular ressonância de túnel λ/4 válida (obtido ${cPlan.meta.fQuarterWave})`);
  assert.strictEqual(elements.get('wlPortOffset').disabled, false, 'Planar deve habilitar #wlPortOffset (duto + túnel λ/4)');
  elements.get('wlPortOffset').value = '-18';
  vm.runInContext('updateWoodlock()', ctx);
  assert.strictEqual(vm.runInContext('lastBuildPack.acoustics.portOffsetMm', ctx), -18, 'Planar deve aceitar recuo até -t (-18mm)');
  elements.get('wlPortOffset').value = '25';
  vm.runInContext('updateWoodlock()', ctx);
  assert.strictEqual(vm.runInContext('lastBuildPack.acoustics.portOffsetMm', ctx), 0, 'Planar não deve permitir deslocamento positivo (>0mm)');

  elements.get('portType').value = 'round';
  elements.get('wlPortOffset').value = '0';
  vm.runInContext('loadPreset()', ctx);
});

// =========================================================================
// SUITE 26: Planar Horn TMM / ABCD 1D Acoplado, Recuo G Editável & Quadrado vs Triângulo
// =========================================================================
runSuite('26. Planar Horn TMM / ABCD 1D Coupled Physics, Recuo G & Square vs Triangle', () => {
  elements.get('driverPreset').value = 'oversound';
  vm.runInContext('setHpfEnabled(false, false); loadPreset();', ctx);

  // Referência Bass-Reflex no mesmo Vb/Fb para comparar carregamento acústico real do túnel
  const cBR = vm.runInContext('currentCurves', ctx);
  const idxClosest = (freqs, target) => {
    let bi = 0, bd = Infinity;
    for (let i = 0; i < freqs.length; i++) {
      const d = Math.abs(freqs[i] - target);
      if (d < bd) { bd = d; bi = i; }
    }
    return bi;
  };

  // 26.1 Planar Quadrado (Recuo G = 0 Auto): TMM gera pico real λ/4, vale real λ/2 e 0 NaN em G1..G13
  elements.get('wlPlanarStyle').value = 'square';
  elements.get('wlPlanarRecuoG').value = '0';
  vm.runInContext("selectTopology('planar');", ctx);
  const cSqAuto = vm.runInContext('currentCurves', ctx);
  const packSqAuto = vm.runInContext('lastBuildPack', ctx);
  assert(cSqAuto.meta.fQuarterWave > 70 && cSqAuto.meta.fQuarterWave < 400, `fQuarterWave fora da faixa: ${cSqAuto.meta.fQuarterWave}`);
  assert(cSqAuto.meta.fHalfWave > cSqAuto.meta.fQuarterWave * 1.7 && cSqAuto.meta.fHalfWave < 1800, `fHalfWave dispersivo de Beranek deve ficar acima de 1.7*fQuarterWave (${cSqAuto.meta.fHalfWave} vs ${cSqAuto.meta.fQuarterWave})`);

  const curveKeys = ['G1_MaxPower', 'G2_VentSPL', 'G3_FreeAirZ', 'G4_NormAmp', 'G5_SPLinCar', 'G6_SPLThermic', 'G6_SPLMaxReal', 'G7_CabinGain', 'G8_ConeExcursion', 'G9_PortAirVel', 'G10_ConeSPL', 'G11_InBoxZ', 'G12_Phase', 'G13_GroupDelay'];
  curveKeys.forEach(k => {
    const arr = cSqAuto[k];
    assert(Array.isArray(arr) && arr.length === 900, `Curva ${k} deve ter 900 pontos`);
    assert(arr.every(v => Number.isFinite(v)), `Curva ${k} contém NaN/Infinity em Planar TMM`);
  });

  // G6_SPLMaxReal <= G6_SPLThermic em toda a faixa
  for (let i = 0; i < cSqAuto.G6_SPLThermic.length; i++) {
    assert(cSqAuto.G6_SPLMaxReal[i] <= cSqAuto.G6_SPLThermic[i] + 1e-6, `G6_SPLMaxReal > G6_SPLThermic no índice ${i}`);
  }

  // Ganho real λ/4 (> +2.0 dB), vale real λ/2 (< pico λ/4 por > 4 dB) e alinhamento exato dos marcadores com o pico/vale TMM
  const iQW = idxClosest(cSqAuto.frequencies, cSqAuto.meta.fQuarterWave);
  const iHW = idxClosest(cSqAuto.frequencies, cSqAuto.meta.fHalfWave);
  const gainQW = cSqAuto.G4_NormAmp[iQW];
  const gainHW = cSqAuto.G4_NormAmp[iHW];
  let bandMaxDb = -999;
  for (let i = 0; i < cSqAuto.frequencies.length; i++) {
    if (cSqAuto.frequencies[i] >= 60 && cSqAuto.frequencies[i] <= 600) {
      bandMaxDb = Math.max(bandMaxDb, cSqAuto.G4_NormAmp[i]);
    }
  }
  assert(Math.abs(gainQW - bandMaxDb) < 0.35, `Marcador λ/4 deve coincidir com o pico real TMM (${gainQW.toFixed(2)} vs max ${bandMaxDb.toFixed(2)} dB)`);
  assert(gainQW > 2.0, `Planar TMM deve produzir ganho real λ/4 > +2.0 dB (obtido ${gainQW.toFixed(2)} dB @ ${cSqAuto.meta.fQuarterWave.toFixed(0)} Hz)`);
  assert(gainQW - gainHW > 4.0, `Planar TMM deve produzir vale real λ/2 abaixo do pico λ/4 (λ/4=${gainQW.toFixed(2)} dB vs λ/2=${gainHW.toFixed(2)} dB)`);
  assert(gainHW < 0.0, `Marcador λ/2 deve coincidir com o vale real negativo TMM (obtido ${gainHW.toFixed(2)} dB @ ${cSqAuto.meta.fHalfWave.toFixed(0)} Hz)`);

  // Carregamento acústico real Z_throat altera G8 (excursão) em λ/4 e G11 (impedância) na banda 40–250 Hz vs Bass-Reflex puro
  const excDiff = Math.abs(cSqAuto.G8_ConeExcursion[iQW] - cBR.G8_ConeExcursion[iQW]);
  let maxZDiffBand = 0;
  for (let i = 0; i < cSqAuto.frequencies.length; i++) {
    const f = cSqAuto.frequencies[i];
    if (f >= 40 && f <= 250) {
      maxZDiffBand = Math.max(maxZDiffBand, Math.abs(cSqAuto.G11_InBoxZ[i] - cBR.G11_InBoxZ[i]));
    }
  }
  assert(excDiff > 0.05, `Z_throat deve alterar excursão G8 em λ/4 vs BR puro (diff=${excDiff.toFixed(3)} mm)`);
  assert(maxZDiffBand > 0.5, `Z_throat deve alterar impedância elétrica G11 na banda 40–250 Hz vs BR puro (maxDiff=${maxZDiffBand.toFixed(3)} Ω)`);

  // 26.2 Recuo G editável (#wlPlanarRecuoG) sincronizado em tempo real com TMM + PGS 3D + DXF + FreeCAD
  elements.get('wlPlanarRecuoG').value = '160';
  vm.runInContext('onPlanarGeomChange();', ctx);
  const cG160 = vm.runInContext('currentCurves', ctx);
  const fQW160 = cG160.meta.fQuarterWave;
  const fHW160 = cG160.meta.fHalfWave;
  assert.strictEqual(vm.runInContext('lastBuildPack.acoustics.planarGeom.recuoG', ctx), 160, 'Recuo G=160mm deve refletir no BuildPack');

  elements.get('wlPlanarRecuoG').value = '360';
  vm.runInContext('onPlanarGeomChange();', ctx);
  const cG360 = vm.runInContext('currentCurves', ctx);
  const packG360 = vm.runInContext('lastBuildPack', ctx);
  assert.strictEqual(packG360.acoustics.planarGeom.recuoG, 360, 'Recuo G=360mm deve refletir no BuildPack');
  assert(Math.abs(packG360.acoustics.planarGeom.CG - (packG360.dimensions.C_top + 360)) < 0.2, 'CG deve igualar C_top + 360mm');
  assert(cG360.meta.fQuarterWave < fQW160 - 20, `Aumentar recuo G (160->360mm) deve reduzir fQuarterWave (${fQW160.toFixed(1)} -> ${cG360.meta.fQuarterWave.toFixed(1)} Hz)`);
  assert(cG360.meta.fHalfWave < fHW160 - 40, `Aumentar recuo G (160->360mm) deve reduzir fHalfWave (${fHW160.toFixed(1)} -> ${cG360.meta.fHalfWave.toFixed(1)} Hz)`);
  const g360PgsFail = packG360.geometry.validation.filter(c => !c.pass);
  assert.strictEqual(g360PgsFail.length, 0, `Planar com Recuo G=360mm deve passar PGS 12/12: ${JSON.stringify(g360PgsFail)}`);
  const dxfG360 = vm.runInContext('buildPgsDxfString(lastBuildPack)', ctx);
  assert(dxfG360.includes('G=360 mm'), 'Exportador DXF deve conter cota customizada G=360 mm');

  // Guardrails de clamp de Recuo G [80, 600] mm
  elements.get('wlPlanarRecuoG').value = '20';
  vm.runInContext('onPlanarGeomChange();', ctx);
  assert.strictEqual(vm.runInContext('lastBuildPack.acoustics.planarGeom.recuoG', ctx), 80, 'Recuo G abaixo de 80mm deve sofrer clamp p/ 80mm');
  elements.get('wlPlanarRecuoG').value = '999';
  vm.runInContext('onPlanarGeomChange();', ctx);
  assert.strictEqual(vm.runInContext('lastBuildPack.acoustics.planarGeom.recuoG', ctx), 600, 'Recuo G acima de 600mm deve sofrer clamp p/ 600mm');

  // 26.3 Diferenciação física real entre Planar Quadrado (square) vs Planar Triângulo / Euclides (triangle)
  elements.get('wlPlanarRecuoG').value = '240';
  elements.get('wlPlanarStyle').value = 'square';
  vm.runInContext('onPlanarGeomChange();', ctx);
  const cSq240 = vm.runInContext('currentCurves', ctx);
  const stSq = vm.runInContext('lastBuildPack.acoustics.planarGeom.St_m2', ctx);

  elements.get('wlPlanarStyle').value = 'triangle';
  vm.runInContext('onPlanarGeomChange();', ctx);
  const cTri240 = vm.runInContext('currentCurves', ctx);
  const packTri240 = vm.runInContext('lastBuildPack', ctx);
  const stTri = packTri240.acoustics.planarGeom.St_m2;
  assert(Math.abs(stSq - stTri) > 0.005, `Seção St_m2 deve diferir fisicamente entre Quadrado (${stSq}) e Triângulo/Euclides (${stTri})`);

  let maxAmpDiff = 0, maxZDiff = 0;
  for (let i = 0; i < cSq240.frequencies.length; i++) {
    maxAmpDiff = Math.max(maxAmpDiff, Math.abs(cSq240.G4_NormAmp[i] - cTri240.G4_NormAmp[i]));
    maxZDiff = Math.max(maxZDiff, Math.abs(cSq240.G11_InBoxZ[i] - cTri240.G11_InBoxZ[i]));
  }
  assert(maxAmpDiff > 0.5, `Resposta G4 deve diferir fisicamente entre Planar Quadrado e Triângulo/Euclides (maxDiff=${maxAmpDiff.toFixed(2)} dB)`);
  assert(maxZDiff > 1.0, `Impedância G11 deve diferir fisicamente entre Planar Quadrado e Triângulo/Euclides (maxDiff=${maxZDiff.toFixed(2)} Ω)`);
  const tri240Fail = packTri240.geometry.validation.filter(c => !c.pass);
  assert.strictEqual(tri240Fail.length, 0, `Planar Triângulo Recuo G=240mm deve passar PGS 12/12: ${JSON.stringify(tri240Fail)}`);

  // 26.4 Caso extremo: 2× Drivers Planar Triângulo Trapezoidal 25° com Recuo G=600mm (PGS + FreeCAD clamp de chanfro)
  elements.get('simNumDrivers').value = '2';
  elements.get('wlShape').value = 'trapezoidal';
  elements.get('wlAngle').value = '25';
  elements.get('wlPlanarStyle').value = 'triangle';
  elements.get('wlPlanarRecuoG').value = '600';
  vm.runInContext("recalculate(); autofixWoodlockGeometry('teste dual planar');", ctx);
  const packDualTri = vm.runInContext('lastBuildPack', ctx);
  const dualTriFail = packDualTri.geometry.validation.filter(c => !c.pass);
  assert.strictEqual(dualTriFail.length, 0, `Dual Planar Triângulo Trap 25° G=600mm deve passar PGS 12/12: ${JSON.stringify(dualTriFail)}`);
  const fcDualTri = vm.runInContext('buildFreeCadMacroString(lastBuildPack)', ctx);
  assert(fcDualTri.includes('min(float(pg["Z_leg"]), dx * 0.28)'), 'FreeCAD macro deve aplicar clamp de chanfro Z_leg no baffle duplo Planar Triângulo');

  // Restaura estado padrão
  elements.get('simNumDrivers').value = '1';
  elements.get('wlShape').value = 'rectangular';
  elements.get('wlAngle').value = '15';
  elements.get('wlPlanarStyle').value = 'square';
  elements.get('wlPlanarRecuoG').value = '0';
  vm.runInContext('loadPreset()', ctx);
});

// SUITE 27: Motor Completo de Filtros Complexos HPF / LPF (BW / LR / Bessel 6..48 dB/oit, Fase & Group Delay)
runSuite('27. Complex HPF / LPF Crossover Engine (BW/LR/Bessel 6-48 dB/oct, Phase & Group Delay)', () => {
  // 27.1 Atenuação exata em f = fc para todos os 12 alinhamentos (HPF e LPF)
  const bwAndBessel = ['BW6', 'BW12', 'BS12', 'BW18', 'BW24', 'BS24', 'BW36', 'BW48'];
  const lrTypes = ['LR12', 'LR24', 'LR36', 'LR48'];
  for (const kind of ['hpf', 'lpf']) {
    for (const code of bwAndBessel) {
      const r = vm.runInContext(`evalFilterComplex(80, 80, '${kind}', '${code}')`, ctx);
      approx(r.db, -3.0103, 0.08, `${kind.toUpperCase()} ${code} @ fc deve ser -3.01 dB`);
    }
    for (const code of lrTypes) {
      const r = vm.runInContext(`evalFilterComplex(80, 80, '${kind}', '${code}')`, ctx);
      approx(r.db, -6.0206, 0.08, `${kind.toUpperCase()} ${code} @ fc deve ser -6.02 dB`);
    }
  }

  // 27.2 Inclinação na banda de rejeição (LR24 ~ -24 dB/oit, LR48 ~ -48 dB/oit)
  const lr24Stop = vm.runInContext("evalFilterComplex(20, 80, 'hpf', 'LR24').db", ctx);
  const lr48Stop = vm.runInContext("evalFilterComplex(20, 80, 'hpf', 'LR48').db", ctx);
  assert(lr24Stop < -46 && lr24Stop > -50, `LR24 2 oitavas abaixo deve ficar em ~-48 dB, obtido ${lr24Stop.toFixed(2)}`);
  assert(lr48Stop < -92 && lr48Stop > -100, `LR48 2 oitavas abaixo deve ficar em ~-96 dB, obtido ${lr48Stop.toFixed(2)}`);

  // 27.3 Integração no simulador: LPF 80 Hz LR24 atenua G4/G6/G8/G15 em 200 Hz, aumenta G13 (Group Delay) e NÃO altera G11 (Impedância)
  vm.runInContext("loadPreset(); setHpfEnabled(false, false); setLpfEnabled(false, true);", ctx);
  const base = vm.runInContext(`(() => {
    const i200 = currentCurves.frequencies.findIndex(f => f >= 200);
    const i80 = currentCurves.frequencies.findIndex(f => f >= 80);
    return { g4: currentCurves.G4_NormAmp[i200], g11: currentCurves.G11_InBoxZ[i200], gd80: currentCurves.G13_GroupDelay[i80] };
  })()`, ctx);

  vm.runInContext(`
    document.getElementById('lpfCutoff').value = '80';
    document.getElementById('lpfType').value = 'LR24';
    setLpfEnabled(true, true);
  `, ctx);
  const withLpf = vm.runInContext(`(() => {
    const i200 = currentCurves.frequencies.findIndex(f => f >= 200);
    const i80 = currentCurves.frequencies.findIndex(f => f >= 80);
    return { g4: currentCurves.G4_NormAmp[i200], g11: currentCurves.G11_InBoxZ[i200], gd80: currentCurves.G13_GroupDelay[i80] };
  })()`, ctx);
  assert(withLpf.g4 < base.g4 - 30.0, `LPF 80Hz LR24 deve atenuar >30 dB em 200 Hz (Δ=${(withLpf.g4 - base.g4).toFixed(1)} dB)`);
  approx(withLpf.g11, base.g11, 0.01, 'LPF ativo não pode alterar impedância elétrica passiva da caixa (G11)');
  assert(withLpf.gd80 > base.gd80 + 3.0, `LPF 80Hz LR24 deve somar Group Delay real em 80 Hz (${base.gd80.toFixed(2)} -> ${withLpf.gd80.toFixed(2)} ms)`);

  // 27.4 Bessel 24 dB/oit (BS24) deve apresentar menor pico de Group Delay que Butterworth 24 (BW24)
  vm.runInContext("document.getElementById('lpfType').value = 'BW24'; recalculate();", ctx);
  const gdBw24 = vm.runInContext('Math.max(...currentCurves.G13_GroupDelay.slice(200))', ctx);
  vm.runInContext("document.getElementById('lpfType').value = 'BS24'; recalculate();", ctx);
  const gdBs24 = vm.runInContext('Math.max(...currentCurves.G13_GroupDelay.slice(200))', ctx);
  assert(gdBs24 < gdBw24, `BS24 deve ter menor pico de Group Delay que BW24 (${gdBs24.toFixed(2)} vs ${gdBw24.toFixed(2)} ms)`);

  // Restaura estado padrão (HPF OFF, LPF OFF)
  vm.runInContext("document.getElementById('hpfType').value = 'LR24'; document.getElementById('lpfType').value = 'LR24'; setHpfEnabled(false, false); setLpfEnabled(false, false); loadPreset();", ctx);
});

// ============================================================================
// SUITE 28: Blacklist Gate P0 (FIS / CAD / ELE / PRO Invariants)
// ============================================================================
runSuite('28. Blacklist Gate P0 (FIS/CAD/ELE/PRO Invariants & Anti-XSS)', () => {
  // --- 28.1 FIS-01/02/03/06/08: Bloqueio de entradas <=0 / NaN / T<=-273.15 / Le<0 / EPDR sentinela ---
  vm.runInContext('loadPreset(); recalculate();', ctx);
  const baseKpi1 = elements.get('kpi1Val').textContent;
  const badCases = [
    ['tsFs', '0'], ['tsFs', '-35'], ['tsVas', '-10'], ['tsQes', '0'],
    ['tsQms', '-2'], ['tsRe', '0'], ['tsSd', '0'], ['tsXmax', '-5'],
    ['tsPe', '0'], ['qlInput', '0'], ['cabinLen', '-1'], ['tempInput', '-273.15'],
    ['tsLe', '-1.5']
  ];
  for (const [id, badVal] of badCases) {
    const orig = elements.get(id).value;
    elements.get(id).value = badVal;
    vm.runInContext('recalculate()', ctx);
    assert.strictEqual(elements.get('kpi1Val').textContent, baseKpi1, `FIS-02: ${id}=${badVal} não pode corromper KPIs`);
    assert(vm.runInContext('lastInputValidationError !== null', ctx), `FIS-02: ${id}=${badVal} deve registrar lastInputValidationError`);
    elements.get(id).value = orig;
  }
  vm.runInContext('recalculate()', ctx);
  const epdrMeta = vm.runInContext('currentCurves.meta.minEpdrVal', ctx);
  assert(Number.isFinite(epdrMeta) && epdrMeta > 0 && epdrMeta < 1e8, `FIS-08: minEpdrVal inválido (${epdrMeta})`);

  // --- 28.2 ELE-01/02: HPF >= LPF e fc <= 0 ou >= 20 kHz ---
  const invFlt = vm.runInContext("evalFilterComplex(50, 0, 'hpf', 'LR24')", ctx);
  const invFltHi = vm.runInContext("evalFilterComplex(50, 25000, 'lpf', 'LR24')", ctx);
  assert.strictEqual(invFlt.invalid, true, 'ELE-02: fc=0 deve sinalizar invalid=true');
  assert.strictEqual(invFltHi.invalid, true, 'ELE-02: fc>=20kHz deve sinalizar invalid=true');

  elements.get('hpfCutoff').value = '100';
  elements.get('lpfCutoff').value = '80';
  vm.runInContext('setHpfEnabled(true, false); setLpfEnabled(true, true);', ctx);
  const dspOverlap = vm.runInContext('evaluatePhysicalConstraints(currentCurves, 10, 1000).some(c => c.code === "DSP_HPF_GE_LPF")', ctx);
  assert.strictEqual(dspOverlap, true, 'ELE-01: HPF >= LPF com ambos ativos deve emitir DSP_HPF_GE_LPF');

  elements.get('hpfCutoff').value = '-5';
  vm.runInContext('recalculate()', ctx);
  const dspHpfBad = vm.runInContext('evaluatePhysicalConstraints(currentCurves, 10, 1000).some(c => c.code === "DSP_HPF_INVALID")', ctx);
  assert.strictEqual(dspHpfBad, true, 'ELE-02: HPF <= 0 ativo deve emitir DSP_HPF_INVALID');
  elements.get('hpfCutoff').value = '36';
  elements.get('lpfCutoff').value = '80';
  vm.runInContext('setHpfEnabled(false, false); setLpfEnabled(false, true);', ctx);

  // --- 28.3 ELE-04/06/07/08/10: Segurança Elétrica & Térmica ---
  // DVC paralelo não pode dividir Re duas vezes (ELE-10)
  elements.get('elNumSpk').value = '1';
  elements.get('elCoils').value = '2';
  elements.get('elZCoil').value = '4';
  elements.get('tsRe').value = '3.6';
  elements.get('elCoilMode').value = 'parallel';
  elements.get('elSpkMode').value = 'parallel';
  vm.runInContext('updateElectrical(false)', ctx);
  const dvcRe = vm.runInContext('lastElectricalAudit.reTotal', ctx);
  approx(dvcRe, 1.8, 0.01, 'ELE-10: DVC paralelo deve resultar Re/2 (1.8 Ω), nunca Re/4 (0.9 Ω)');

  // Z < 0.5 Ω (ELE-04) + Série-Paralelo em ímpar + Amp > 2x Pe (ELE-06) + Cabo 10mm² em 20kW (ELE-08) + Bobina > 250°C (ELE-07)
  elements.get('elNumSpk').value = '4';
  elements.get('elCoils').value = '2';
  elements.get('elZCoil').value = '2';
  elements.get('elCoilMode').value = 'parallel';
  elements.get('elSpkMode').value = 'parallel'; // Z_total = 0.25 Ω
  elements.get('tsPe').value = '500'; // Pe_total = 2000 W
  elements.get('elAmpPower').value = '20000'; // > 2x Pe_total + 1900 A
  elements.get('elPwrGauge').value = '10';
  elements.get('elMeasV').value = '60'; // 60^2 / 0.25 = 14400 W -> >> 250 °C
  elements.get('elLeMh').value = '-5';
  vm.runInContext('updateElectrical(false)', ctx);
  const elCodes = vm.runInContext('lastElectricalAudit.issues.map(i => i.code)', ctx);
  assert(elCodes.includes('ELE_IMPEDANCE_TOO_LOW'), 'ELE-04: Z < 0.5 Ω deve gerar ELE_IMPEDANCE_TOO_LOW');
  assert(elCodes.includes('ELE_AMP_OVERPOWER'), 'ELE-06: Amp > 2x Pe_total deve gerar ELE_AMP_OVERPOWER');
  assert(elCodes.includes('ELE_COIL_OVERTEMP'), 'ELE-07: Bobina > 250 °C deve gerar ELE_COIL_OVERTEMP');
  assert(elCodes.includes('ELE_CABLE_AMPACITY'), 'ELE-08: Cabo 10 mm² sobrecarregado deve gerar ELE_CABLE_AMPACITY');
  assert(elCodes.includes('ELE_VOLTAGE_DROP_CRITICAL'), 'ELE-08: Queda > 5% / V_amp < 10.5 V deve gerar ELE_VOLTAGE_DROP_CRITICAL');
  assert(!elements.get('elDspResult').innerHTML.includes('C_z = <b>-'), 'FIS-06: Zobel nunca pode exibir capacitância negativa');

  elements.get('elNumSpk').value = '3';
  elements.get('elSpkMode').value = 'series-parallel';
  vm.runInContext('updateElectrical(false)', ctx);
  assert(vm.runInContext('lastElectricalAudit.issues.some(i => i.code === "ELE_INVALID_SERIES_PARALLEL")', ctx), 'ELE-04: Série-Paralelo em 3 drivers deve gerar ELE_INVALID_SERIES_PARALLEL');

  // --- 28.4 CAD-01/02/05/08/09/10: Folga proporcional, Lv<=t, L-Port c/ divisória, colisões, MDF<15mm ---
  const cad01Round = vm.runInContext(`validateBuildGeometry({
    A: 700, B: 520, C_top: 355, D_bot: 355, t: 18, nDrivers: 1, tsDia: 15, Sd_cm2: 855,
    boxType: 'bass-reflex', portType: 'round', numDucts: 1, ductDia: 6, ductThick: 1.5, LvCm: 30.0
  })`, ctx); // folga = 55 mm (>40 antigo, mas < 0.50*152.4 = 76.2 mm)
  assert(cad01Round.issues.some(i => i.code === 'PORT_DEPTH_COLLISION'), 'CAD-01: 6" cilíndrico com 55 mm (< 0.50×D = 76.2 mm) deve bloquear');

  const cad01Slot = vm.runInContext(`validateBuildGeometry({
    A: 700, B: 520, C_top: 350, D_bot: 350, t: 18, nDrivers: 1, tsDia: 15, Sd_cm2: 855,
    boxType: 'bass-reflex', portType: 'slot_wall', slotW: 40, slotH: 8, slotWallThick: 18, LvCm: 30.0
  })`, ctx); // folga = 50 mm (< 0.75*80 = 60 mm)
  assert(cad01Slot.issues.some(i => i.code === 'PORT_DEPTH_COLLISION'), 'CAD-01: Slot H=80mm com 50 mm (< 0.75×H = 60 mm) deve bloquear');

  const cad02Lv = vm.runInContext(`validateBuildGeometry({
    A: 700, B: 520, C_top: 400, D_bot: 400, t: 18, nDrivers: 1, tsDia: 15, Sd_cm2: 855,
    boxType: 'bass-reflex', portType: 'round', numDucts: 1, ductDia: 4, ductThick: 1.5, LvCm: 1.5
  })`, ctx);
  assert(cad02Lv.issues.some(i => i.code === 'PORT_LV_SHORTER_THAN_WALL'), 'CAD-02: 0 < Lv <= t (15 mm <= 18 mm) deve bloquear');

  const cad05Div = vm.runInContext(`computePortRoutingPlan({
    portRouting: 'l_bend', portType: 'round', A: 800, B: 450, C_min: 300, t: 18,
    lvMm: 580, odMm: 104.6, numDucts: 2, hasCenterDiv: true
  })`, ctx);
  assert.strictEqual(cad05Div.fits, false, 'CAD-05: L-Port com divisória central (câmara 391 mm) não pode caber para Lv=580mm');

  const cad08Tri = vm.runInContext(`validateBuildGeometry({
    A: 420, B: 420, C_top: 400, D_bot: 400, t: 18, nDrivers: 1, tsDia: 15, Sd_cm2: 855,
    boxType: 'bass-reflex', portType: 'triangle', triCount: 2, triA: 20, triB: 20, LvCm: 18.0
  })`, ctx);
  assert(cad08Tri.issues.some(i => i.code === 'BAFFLE_HOLE_COLLISION'), 'CAD-08: Colisão triângulo × driver deve gerar BAFFLE_HOLE_COLLISION');

  const cad10Thin = vm.runInContext(`validateBuildGeometry({
    A: 700, B: 520, C_top: 450, D_bot: 450, t: 12, nDrivers: 1, tsDia: 15, Sd_cm2: 855,
    boxType: 'bass-reflex', portType: 'slot_wall', slotW: 40, slotH: 6, slotWallThick: 10, LvCm: 20.0
  })`, ctx);
  assert(cad10Thin.issues.some(i => i.code === 'MDF_THICKNESS_TOO_THIN'), 'CAD-10: MDF 12 mm (< 15 mm) deve gerar MDF_THICKNESS_TOO_THIN');
  assert(cad10Thin.issues.some(i => i.code === 'PORT_WALL_TOO_THIN'), 'CAD-10: Parede de duto 10 mm (< 15 mm) deve gerar PORT_WALL_TOO_THIN');

  // --- 28.5 CAD-11 & PRO-10: Nesting oversized + #btnPrintDossierA4 travado ---
  const nestBad = vm.runInContext(`computeSheetNesting2D([
    { id: 'P_HUGE', name: 'Painel Gigante', kind: 'mdf', qty: 1, cutSize: { w: 3000, h: 2000 } },
    { id: 'P_ZERO', name: 'Painel Nulo', kind: 'mdf', qty: 1, cutSize: { w: 0, h: 500 } }
  ])`, ctx);
  assert.strictEqual(nestBad.oversizedParts.length, 1, 'CAD-11: Peça > 2750×1830 mm deve aparecer em oversizedParts');
  assert.strictEqual(nestBad.invalidParts.length, 1, 'CAD-11: Peça <= 0 mm deve aparecer em invalidParts');

  elements.get('wlThickness').value = '12';
  vm.runInContext('updateWoodlock()', ctx);
  assert.strictEqual(elements.get('btnPrintDossierA4').disabled, true, 'PRO-10: #btnPrintDossierA4 deve ficar disabled quando há erro crítico P0');
  assert.strictEqual(elements.get('menuExportBuildPackHtml').disabled, true, 'PRO-10: #menuExportBuildPackHtml deve ficar disabled quando há erro crítico P0');
  assert.strictEqual(elements.get('menuPrintBuildPackA4').disabled, true, 'PRO-10: #menuPrintBuildPackA4 deve ficar disabled quando há erro crítico P0');
  elements.get('wlThickness').value = '18';
  vm.runInContext('loadPreset();', ctx);

  // --- 28.5b FIS-03 (BP6 Fb/FbVr <= 0), FIS-07 (Passividade), ELE-03 (HPF OFF + Xmax), FIS-15 (upsertDbDrivers), CAD-02 (G09) ---
  elements.get('boxType').value = 'bp6';
  vm.runInContext('setTuningMode(false); recalculate();', ctx);
  const bp6BaseKpi = elements.get('kpi1Val').textContent;
  elements.get('fbInput').value = '-45';
  vm.runInContext('recalculate()', ctx);
  assert.strictEqual(elements.get('kpi1Val').textContent, bp6BaseKpi, 'FIS-03: BP6 manual Fb=-45 deve ser bloqueado');
  assert(vm.runInContext('lastInputValidationError !== null', ctx), 'FIS-03: BP6 manual Fb=-45 deve registrar lastInputValidationError');
  elements.get('fbInput').value = '65';
  elements.get('fbVrInput').value = '-30';
  vm.runInContext('recalculate()', ctx);
  assert(vm.runInContext('lastInputValidationError !== null', ctx), 'FIS-03: BP6 manual FbVr=-30 deve registrar lastInputValidationError');
  elements.get('fbVrInput').value = '35';
  elements.get('boxType').value = 'bass-reflex';
  vm.runInContext('setTuningMode(true); loadPreset();', ctx);

  // FIS-07: Passividade pós-varredura
  const passMeta = vm.runInContext('({ ok: currentCurves.meta.passivityOk, minZ: currentCurves.meta.minZMag, re: currentCurves.meta.Re })', ctx);
  assert.strictEqual(passMeta.ok, true, 'FIS-07: Varredura normal deve ser passiva (passivityOk=true)');
  assert(passMeta.minZ >= passMeta.re * 0.999, `FIS-07: minZ (${passMeta.minZ}) deve ser >= Re (${passMeta.re})`);
  const fakePassViolation = vm.runInContext(`(() => {
    const fake = Object.assign({}, currentCurves, { meta: Object.assign({}, currentCurves.meta, { passivityOk: false, minZMag: 1.0 }) });
    return evaluatePhysicalConstraints(fake, 10, 1000).some(c => c.code === 'FIS_PASSIVITY_VIOLATION');
  })()`, ctx);
  assert.strictEqual(fakePassViolation, true, 'FIS-07: passivityOk=false deve emitir FIS_PASSIVITY_VIOLATION');

  // ELE-03: Caixa ventilada sem HPF com Xpk > Xmax
  vm.runInContext('setHpfEnabled(false, true);', ctx);
  const noHpfRisk = vm.runInContext('evaluatePhysicalConstraints(currentCurves, 10, 1000).some(c => c.subCode === "ELE_NO_HPF_XMAX_RISK" && c.noHpfProtection === true)', ctx);
  assert.strictEqual(noHpfRisk, true, 'ELE-03: Caixa ventilada em Pe com HPF OFF e Xpk > Xmax deve emitir ELE_NO_HPF_XMAX_RISK');

  // FIS-15: upsertDbDrivers rejeita drivers inválidos e aceita válidos
  const upsertRes = vm.runInContext(`upsertDbDrivers([
    { brand: 'Bad1', model: 'NegFs', fs: -35, vas: 50, qes: 0.4, qms: 5, re: 4, sd: 500, pe: 500, xmax: 10 },
    { brand: 'Bad2', model: 'NegLe', fs: 35, vas: 50, qes: 0.4, qms: 5, re: 4, sd: 500, pe: 500, xmax: 10, le: -1 },
    { brand: 'Bad3', model: 'ZeroPe', fs: 35, vas: 50, qes: 0.4, qms: 5, re: 4, sd: 500, pe: 0, xmax: 10 },
    { brand: 'Good', model: 'Valid12', fs: 35, vas: 50, qes: 0.4, qms: 5, re: 4, sd: 500, pe: 500, xmax: 10, le: 1.2, diameter_in: 12, znom: 4 }
  ])`, ctx);
  assert.strictEqual(upsertRes.length, 1, `FIS-15: upsertDbDrivers deve aceitar apenas 1 driver válido (aceitou ${upsertRes.length})`);

  // CAD-02: PGS G09 reprova lvMm <= t
  const g09Fail = vm.runInContext(`validatePgsGeometry({
    envelope: { A: 500, B: 400, C: 300, D: 300, F: 536, E: 436, C_ext: 336, D_ext: 336 },
    material: { thickness: 18 }, topology: 'bass-reflex',
    volumes: { VbTarget: 50, VrTarget: 0, VnetVerified: 50, deltaL: 0, Vsub: 2, Vduto: 1, Vbracing: 0 },
    parts: [], drivers: [{ mountMode: 'normal' }], ducts: [{ id: 'D1', lvMm: 15, axis: '-Z', origin: [0,0,100] }],
    cutouts: [], joints: [], manufacturing: { assemblySequence: [], cutList: [] }
  }, { issues: [] }).find(c => c.code === 'G09').pass`, ctx);
  assert.strictEqual(g09Fail, false, 'CAD-02: PGS G09 deve reprovar quando lvMm (15 mm) <= t (18 mm)');

  // --- 28.6 PRO-03 / PRO-04 / PRO-05 / PRO-12: Anti-XSS, Anti-NaN Dossiê & Sanitização FreeCAD ---
  vm.runInContext(`applyDbDriver({ name: '<img src=x onerror=alert(1)>', fs: 40, qes: 0.42, qms: 6.0, vas: 185, re: 5.1, pe: 800, sd: 1210, xmax: 10, diameter_in: 18 })`, ctx);
  const badgeHtml = elements.get('dbDriverBadge').innerHTML;
  assert(!badgeHtml.includes('<img') && badgeHtml.includes('&lt;img'), `PRO-03: applyDbDriver deve escapar HTML no badge (obtido: ${badgeHtml})`);

  const safeDossierHtml = vm.runInContext(`(() => {
    const p = JSON.parse(JSON.stringify(lastBuildPack));
    p.acoustics.Vb = NaN;
    p.acoustics.Fb = Infinity;
    p.acoustics.F3 = undefined;
    return buildPackHtmlString(p, [], '', '', '');
  })()`, ctx);
  assert(!safeDossierHtml.includes('NaN') && !safeDossierHtml.includes('Infinity'), 'PRO-04: buildPackHtmlString não pode emitir NaN/Infinity');

  const fcMacro = vm.runInContext(`(() => {
    const p = JSON.parse(JSON.stringify(lastBuildPack));
    p.driver.name = 'Sub """ ; import os';
    p.acoustics.Vb = NaN;
    return buildFreeCadMacroString(p, 0);
  })()`, ctx);
  const docLines = fcMacro.split('\n').slice(0, 4).join('\n');
  assert(!docLines.includes('Sub """'), 'PRO-05: buildFreeCadMacroString deve sanitizar """ na docstring Python');
  assert(!fcMacro.includes(':NaN') && !fcMacro.includes('Infinity'), 'PRO-12: Payload JSON da macro FreeCAD não pode conter NaN/Infinity');

  // --- 28.7 PRO-01 (docs auxiliares) & drivers-db.html VM Runtime Gate (PRO-02/03/04/09, FIS-02/06/15) ---
  const forbiddenAll = /\b(bassbox|bb6|elisa|winisd|ht audio|hornresp|vituixcad|boxsim|unibox|akabak)\b/gi;
  const mdFiles = fs.readdirSync(ROOT).filter(f => f.endsWith('.md'));
  for (const mf of mdFiles) {
    const txt = fs.readFileSync(path.join(ROOT, mf), 'utf8');
    const hits = txt.match(forbiddenAll) || [];
    assert.strictEqual(hits.length, 0, `PRO-01: ${mf} contém termo proibido: ${[...new Set(hits)].join(', ')}`);
  }
  assert(dbHtml.includes('URL.revokeObjectURL('), 'PRO-09: drivers-db.html deve revogar Blob URLs');

  // Execução real em VM do script de drivers-db.html
  const dbScriptMatch = dbHtml.match(/<script>([\s\S]*?)<\/script>/g);
  const dbMainJs = dbScriptMatch[dbScriptMatch.length - 1].replace(/^<script>|<\/script>$/g, '');
  const dbEls = new Map();
  const mkDbEl = id => {
    if (!dbEls.has(id)) {
      dbEls.set(id, {
        id, value: '', innerHTML: '', textContent: '', checked: false, disabled: false,
        style: {}, classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
        addEventListener() {}, appendChild() {}, removeChild() {}, click() {},
        querySelector() { return null; }, querySelectorAll() { return []; }
      });
    }
    return dbEls.get(id);
  };
  let dbAlerts = [];
  const dbCtx = vm.createContext({
    console, Math, Date, JSON, Number, String, Array, Object, Boolean, RegExp, parseFloat, parseInt, isNaN, isFinite,
    setTimeout: () => 0, clearTimeout: () => {},
    alert: msg => { dbAlerts.push(String(msg)); },
    confirm: () => true,
    localStorage: { _m: {}, getItem(k) { return this._m[k] || null; }, setItem(k, v) { this._m[k] = String(v); }, removeItem(k) { delete this._m[k]; } },
    URL: { createObjectURL: () => 'blob:mock', revokeObjectURL: () => {} },
    Blob: function(p, o) { this.parts = p; this.opts = o; },
    window: { location: { href: 'http://localhost/drivers-db.html', search: '', hash: '' }, addEventListener() {} },
    document: {
      getElementById: id => mkDbEl(id),
      querySelector: () => null,
      querySelectorAll: () => [],
      createElement: tag => mkDbEl('dyn_' + tag),
      addEventListener() {},
      body: { appendChild() {}, removeChild() {} }
    },
    html2pdf: () => ({ set() { return this; }, from() { return this; }, save() {} })
  });
  vm.runInContext(dbMainJs, dbCtx);

  // Testa CLAudioDatabaseAgent.validate() em runtime
  const dbValBad = vm.runInContext(`CLAudioDatabaseAgent.validate({ brand: 'Test', model: 'X', diameter_in: 12, znom: 4, pe: -100, xmax: 0, fs: 40, qes: 0.4, qms: 6, vas: 50, sd: 500, re: 3.5, le: -2 })`, dbCtx);
  assert.strictEqual(dbValBad.valid, false, 'FIS-02/06: drivers-db validate() deve reprovar Pe<=0, Xmax<=0 e Le<0');
  assert(dbValBad.errors.some(e => e.includes('Le')), 'FIS-06: validate() deve reportar erro de Le < 0');

  // Testa confirmTSVImport() rejeitando inválido e aceitando válido
  const beforeLen = vm.runInContext('DRIVER_CATALOG.length', dbCtx);
  vm.runInContext(`
    parsedTsvData = [
      { brand: 'BadTsv', model: 'NegLe', diameter_in: 12, znom: 4, pe: 500, xmax: 10, fs: 40, qes: 0.4, qms: 6, vas: 50, sd: 500, re: 3.5, le: -1 },
      { brand: '<img src=x onerror=alert(1)>', model: 'Safe12', year: '<b>2025</b>', diameter_in: 12, znom: 4, pe: 500, xmax: 10, fs: 40, qes: 0.4, qms: 6, vas: 50, sd: 500, re: 3.5, le: 1.2 }
    ];
    confirmTSVImport();
  `, dbCtx);
  const afterLen = vm.runInContext('DRIVER_CATALOG.length', dbCtx);
  assert.strictEqual(afterLen, beforeLen + 1, 'FIS-15: confirmTSVImport() deve importar apenas o driver válido e rejeitar o inválido');

  // Testa renderTable() anti-XSS em runtime
  const tblHtml = dbEls.get('db-table-body').innerHTML;
  assert(!tblHtml.includes('<img src=x') && tblHtml.includes('&lt;img src=x'), 'PRO-03: drivers-db renderTable() deve escapar payload XSS em brand');
  assert(!tblHtml.includes('<b>2025</b>') && tblHtml.includes('&lt;b&gt;2025&lt;/b&gt;'), 'PRO-03: drivers-db renderTable() deve escapar payload XSS em year');

  // Testa renderPrintableReport() anti-XSS e anti-NaN + downloadReportPDF() bloqueio P0
  mkDbEl('inp-brand').value = '<img src=x onerror=alert(1)>';
  mkDbEl('inp-model').value = 'BadModel';
  mkDbEl('inp-dia').value = '12';
  mkDbEl('inp-znom').value = '4';
  mkDbEl('inp-pe').value = '0';
  mkDbEl('inp-xmax').value = '-5';
  mkDbEl('inp-fs').value = '';
  mkDbEl('inp-vas').value = '50';
  mkDbEl('inp-qes').value = '0';
  mkDbEl('inp-qms').value = '6';
  mkDbEl('inp-sd').value = '500';
  mkDbEl('inp-re').value = '3.5';
  mkDbEl('inp-le').value = '-1';
  vm.runInContext('renderPrintableReport()', dbCtx);
  const repHtml = mkDbEl('report-printable').innerHTML;
  assert(!repHtml.includes('<img src=x') && repHtml.includes('&lt;img src=x'), 'PRO-03: renderPrintableReport() deve escapar HTML XSS');
  assert(!repHtml.includes('NaN') && !repHtml.includes('Infinity'), 'PRO-04: renderPrintableReport() não pode emitir NaN/Infinity');
  const pdfOk = vm.runInContext('downloadReportPDF()', dbCtx);
  assert.strictEqual(pdfOk, false, 'PRO-02: downloadReportPDF() deve retornar false e bloquear driver inválido');

  // Restaura Golden Master limpo
  elements.get('driverPreset').value = 'oversound';
  vm.runInContext('loadPreset();', ctx);
});

// ============================================================================
// SUITE 29: Lote P0-B — CAD 3D Collisions (CAD-03), Side-Firing (CAD-04),
//           Air Velocity Gate (CAD-06) & Full 3D Exporter Parity (CAD-14)
// ============================================================================
runSuite('29. Lote P0-B CAD 3D (CAD-03 Collisions, CAD-04 Side-Firing, CAD-06 Aero Gate, CAD-14 Parity)', () => {
  // --- 29.1 CAD-03: Colisão 3D duto × ímã/cesta do driver e duto × travamentos internos ---
  const colDrvNormal = vm.runInContext(`(() => {
    const mockModel = {
      envelope: { F: 636, E: 536, A: 600, B: 500, C: 280, D: 280, D_ext: 316 },
      material: { thickness: 18 },
      drivers: [{ mountMode: 'normal' }],
      parts: [
        { id: 'P_PORT_1', name: 'Tubo Lateral', kind: 'port', area: 0, sideFiring: true, origin: [100, 210, 100], size: [420, 104, 104] }
      ],
      cutouts: [
        { id: 'CUT_DRV_1', partId: 'P_FRONT_BAFFLE', kind: 'driver', shape: 'round', label: 'Driver 18"', xInt: 300, yInt: 250, dia: 420 },
        { id: 'CUT_PORT_1', partId: 'P_SIDES', panel: 'lateral_dir', kind: 'port', shape: 'round', label: 'Duto Lateral #1', xInt: 180, yInt: 250, dia: 104, lvMm: 420 }
      ]
    };
    return detectPgs3dCollisions(mockModel, { portRouting: 'side_firing', mountMode: 'normal' });
  })()`, ctx);
  assert(colDrvNormal.some(c => c.code === 'PORT_DRIVER_3D_COLLISION'), 'CAD-03: Duto side_firing atravessando ímã/cesta do driver deve gerar PORT_DRIVER_3D_COLLISION');

  const colDrvInv = vm.runInContext(`(() => {
    const mockModel = {
      envelope: { F: 636, E: 536, A: 600, B: 500, C: 280, D: 280, D_ext: 316 },
      material: { thickness: 18 },
      drivers: [{ mountMode: 'inverted' }],
      parts: [
        { id: 'P_PORT_1', name: 'Tubo Lateral', kind: 'port', area: 0, sideFiring: true, origin: [100, 210, 100], size: [420, 104, 104] }
      ],
      cutouts: [
        { id: 'CUT_DRV_1', partId: 'P_FRONT_BAFFLE', kind: 'driver', shape: 'round', label: 'Driver 18"', xInt: 300, yInt: 250, dia: 420 },
        { id: 'CUT_PORT_1', partId: 'P_SIDES', panel: 'lateral_dir', kind: 'port', shape: 'round', label: 'Duto Lateral #1', xInt: 180, yInt: 250, dia: 104, lvMm: 420 }
      ]
    };
    return detectPgs3dCollisions(mockModel, { portRouting: 'side_firing', mountMode: 'inverted' });
  })()`, ctx);
  assert.strictEqual(colDrvInv.some(c => c.code === 'PORT_DRIVER_3D_COLLISION'), false, 'CAD-03: Driver montado invertido (ímã p/ fora) não pode gerar colisão interna');

  const colLBendDrv = vm.runInContext(`(() => {
    const mockModel = {
      envelope: { F: 736, E: 536, A: 700, B: 500, C: 300, D: 300, D_ext: 336 },
      material: { thickness: 18 },
      drivers: [{ mountMode: 'normal' }],
      parts: [
        { id: 'P_PORT_1', name: 'Tubo L-Port', kind: 'port', area: 0, origin: [580, 200, 150], size: [104, 104, 180] }
      ],
      cutouts: [
        { id: 'CUT_DRV_1', partId: 'P_FRONT_BAFFLE', kind: 'driver', shape: 'round', label: 'Driver 15"', xInt: 250, yInt: 250, dia: 355 },
        { id: 'CUT_PORT_1', partId: 'P_FRONT_BAFFLE', kind: 'port', shape: 'round', label: 'Duto L #1', xInt: 610, yInt: 250, dia: 104, lvMm: 520 }
      ]
    };
    return detectPgs3dCollisions(mockModel, {
      portRouting: 'l_bend', mountMode: 'normal',
      portRoutePlan: { l1Mm: 110, l2Mm: 350, rElbow: 85 }
    });
  })()`, ctx);
  assert(colLBendDrv.some(c => c.code === 'PORT_DRIVER_3D_COLLISION'), 'CAD-03: Trecho 2 de L-Port atravessando ímã do driver deve gerar PORT_DRIVER_3D_COLLISION');

  const colBrace = vm.runInContext(`(() => {
    const mockModel = {
      envelope: { F: 736, E: 536, A: 700, B: 500, C: 400, D: 400, D_ext: 436 },
      material: { thickness: 18 },
      drivers: [{ mountMode: 'normal' }],
      parts: [
        { id: 'P_PORT_1', name: 'Tubo Frontal', kind: 'port', area: 0, origin: [580, 200, 150], size: [104, 104, 280] },
        { id: 'P_BRACE_LR', name: 'Trava LR', kind: 'batten', origin: [18, 225, 220], size: [700, 50, 18] },
        { id: 'P_MATRIX_V', name: 'Matriz V', kind: 'divider', matrixMeta: { axis: 'V', cols: 2, rows: 1 }, origin: [359, 18, 18], size: [18, 500, 400] }
      ],
      cutouts: [
        { id: 'CUT_PORT_1', partId: 'P_FRONT_BAFFLE', kind: 'port', shape: 'round', label: 'Duto #1', xInt: 610, yInt: 250, dia: 104, lvMm: 280 }
      ]
    };
    return detectPgs3dCollisions(mockModel, { portRouting: 'straight', mountMode: 'normal' });
  })()`, ctx);
  assert(colBrace.some(c => c.code === 'PORT_BRACE_3D_COLLISION' && c.targetId === 'P_BRACE_LR'), 'CAD-03: Duto interceptando P_BRACE_LR deve gerar PORT_BRACE_3D_COLLISION');

  // --- 29.2 CAD-04: Side-Firing fura lateral_dir (não frontal) e exporta eixo lateral em DXF 2D/3D, OBJ e FreeCAD ---
  elements.get('driverPreset').value = 'oversound';
  vm.runInContext('loadPreset(); selectTopology("bass-reflex");', ctx);
  elements.get('portType').value = 'round';
  elements.get('ductDia').value = '4.0';
  elements.get('numDucts').value = '2';
  elements.get('wlPortRouting').value = 'side_firing';
  elements.get('wlWidthA').value = '820';
  elements.get('wlHeightB').value = '560';
  vm.runInContext('recalculate(); updateWoodlock();', ctx);
  const sfPack = vm.runInContext('lastBuildPack', ctx);
  const sfSideHoles = sfPack.baffleHoles.filter(h => h.kind === 'port' && h.panel === 'lateral_dir');
  const sfFrontPorts = sfPack.baffleHoles.filter(h => h.kind === 'port' && h.panel === 'frontal');
  assert.strictEqual(sfSideHoles.length, 2, `CAD-04: side_firing com 2 dutos deve alocar 2 furos em lateral_dir (obtido ${sfSideHoles.length})`);
  assert.strictEqual(sfFrontPorts.length, 0, 'CAD-04: side_firing não pode alocar furos de duto no painel frontal');
  assert(sfPack.geometry.cutouts.filter(c => c.kind === 'port').every(c => c.partId === 'P_SIDES' && c.panel === 'lateral_dir'), 'CAD-04: cutouts PGS de side_firing devem apontar para P_SIDES / lateral_dir');
  assert.strictEqual(sfPack.geometry.ducts[0].axis, '-X', 'CAD-04: duto PGS side_firing deve ter axis === "-X"');

  const sfDxf2d = vm.runInContext('buildPgsDxfString(lastBuildPack)', ctx);
  assert(sfDxf2d.includes('SIDE-FIRING'), 'CAD-04: DXF 2D deve desenhar recorte SIDE-FIRING na vista lateral');
  const sfDxf3d = vm.runInContext('buildPgs3dDxfString(lastBuildPack, 0)', ctx);
  const sfDxf3dPortFaces = (sfDxf3d.match(/3DFACE\r\n8\r\nDUTOS_3D/g) || []).length;
  assert(sfDxf3dPortFaces >= 40, `CAD-04/CAD-14: DXF 3D side_firing (2 dutos) deve gerar >= 40 faces em DUTOS_3D (obtido ${sfDxf3dPortFaces})`);
  const sfObj = vm.runInContext('buildPgsObjString(lastBuildPack, 0)', ctx);
  assert(sfObj.includes('o P_PORT_1_SIDE_1') && sfObj.includes('o P_PORT_1_SIDE_2'), 'CAD-04/CAD-14: OBJ side_firing deve exportar 2 tubos laterais P_PORT_1_SIDE_1 e _2');
  assert(sfObj.includes('o RING_SIDE_PORT_1') && sfObj.includes('o RING_SIDE_PORT_2'), 'CAD-04: OBJ side_firing deve exportar aros laterais RING_SIDE_PORT_1 e _2');
  const sfFc = vm.runInContext('buildFreeCadMacroString(lastBuildPack, 0)', ctx);
  assert(sfFc.includes('c.get("panel") == "lateral_dir"') && sfFc.includes('{pid}_SIDE_') && sfFc.includes('"portRouting":"side_firing"'), 'CAD-04/CAD-14: FreeCAD macro deve cortar P_SIDE_RIGHT e extrudar dutos side_firing em +X');

  // --- 29.3 CAD-06: Velocidade do ar (17 m/s reto / 24 m/s flared) no gate de validação e exportação CAD ---
  const cad06StraightOver = vm.runInContext(`validateBuildGeometry({
    A: 700, B: 520, C_top: 420, D_bot: 420, t: 18, nDrivers: 1, tsDia: 15, Sd_cm2: 855,
    boxType: 'bass-reflex', portType: 'round', numDucts: 1, ductDia: 4, ductThick: 1.5, LvCm: 15.0,
    airVel: 21.5, velLimit: 17.0
  })`, ctx);
  assert.strictEqual(cad06StraightOver.aeroBlocked, true, 'CAD-06: duto reto com 21.5 m/s (> 17 m/s) deve marcar aeroBlocked=true');
  assert(cad06StraightOver.issues.some(i => i.code === 'PORT_AIR_VELOCITY_CRITICAL' && i.requiresConfirm === true), 'CAD-06: deve emitir PORT_AIR_VELOCITY_CRITICAL com requiresConfirm=true');

  const gateBlocked = vm.runInContext(`checkCadExportGate({ validation: validateBuildGeometry({
    A: 700, B: 520, C_top: 420, D_bot: 420, t: 18, nDrivers: 1, tsDia: 15, Sd_cm2: 855,
    boxType: 'bass-reflex', portType: 'round', numDucts: 1, ductDia: 4, ductThick: 1.5, LvCm: 15.0,
    airVel: 21.5, velLimit: 17.0
  }) }, { noPrompt: true })`, ctx);
  assert.strictEqual(gateBlocked.ok, false, 'CAD-06: checkCadExportGate sem confirmação deve bloquear exportação');
  assert.strictEqual(gateBlocked.reason, 'CAD_06_AIR_VELOCITY_BLOCKED', 'CAD-06: reason deve ser CAD_06_AIR_VELOCITY_BLOCKED');

  const gateConfirmed = vm.runInContext(`checkCadExportGate({ validation: validateBuildGeometry({
    A: 700, B: 520, C_top: 420, D_bot: 420, t: 18, nDrivers: 1, tsDia: 15, Sd_cm2: 855,
    boxType: 'bass-reflex', portType: 'round', numDucts: 1, ductDia: 4, ductThick: 1.5, LvCm: 15.0,
    airVel: 21.5, velLimit: 17.0
  }) }, { confirmAeroOverride: true })`, ctx);
  assert.strictEqual(gateConfirmed.ok, true, 'CAD-06: checkCadExportGate com confirmAeroOverride=true deve liberar exportação');

  const cad06FlaredOk = vm.runInContext(`validateBuildGeometry({
    A: 700, B: 520, C_top: 420, D_bot: 420, t: 18, nDrivers: 1, tsDia: 15, Sd_cm2: 855,
    boxType: 'bass-reflex', portType: 'flared', numDucts: 1, ductDia: 4, ductThick: 1.5, LvCm: 15.0,
    airVel: 21.5
  })`, ctx);
  assert.strictEqual(cad06FlaredOk.aeroBlocked, false, 'CAD-06: duto flared com 21.5 m/s (<= 24 m/s) não pode bloquear');

  const cad06FlaredOver = vm.runInContext(`validateBuildGeometry({
    A: 700, B: 520, C_top: 420, D_bot: 420, t: 18, nDrivers: 1, tsDia: 15, Sd_cm2: 855,
    boxType: 'bass-reflex', portType: 'flared', numDucts: 1, ductDia: 4, ductThick: 1.5, LvCm: 15.0,
    airVel: 26.0
  })`, ctx);
  assert.strictEqual(cad06FlaredOver.aeroBlocked, true, 'CAD-06: duto flared com 26.0 m/s (> 24 m/s) deve marcar aeroBlocked=true');

  // --- 29.4 CAD-14: Paridade 3D completa (numDucts > 1, triMeta, l_bend) em OBJ, DXF 3D, DXF 2D e FreeCAD ---
  // 29.4A: numDucts = 3 (múltiplos dutos cilíndricos retos)
  elements.get('wlPortRouting').value = 'straight';
  elements.get('portType').value = 'round';
  elements.get('ductDia').value = '4.0';
  elements.get('numDucts').value = '3';
  elements.get('wlWidthA').value = '820';
  elements.get('wlHeightB').value = '560';
  vm.runInContext('recalculate(); updateWoodlock();', ctx);
  const obj3 = vm.runInContext('buildPgsObjString(lastBuildPack, 0)', ctx);
  assert(obj3.includes('o P_PORT_1_1') && obj3.includes('o P_PORT_1_2') && obj3.includes('o P_PORT_1_3'), 'CAD-14: OBJ com numDucts=3 deve exportar 3 tubos distintos P_PORT_1_1..3');
  const dxf3d3 = vm.runInContext('buildPgs3dDxfString(lastBuildPack, 0)', ctx);
  const faces3 = (dxf3d3.match(/3DFACE\r\n8\r\nDUTOS_3D/g) || []).length;
  assert.strictEqual(faces3, 60, `CAD-14: DXF 3D com numDucts=3 deve gerar 60 faces 3DFACE em DUTOS_3D (obtido ${faces3})`);

  // 29.4B: triMeta (4 dutos triangulares de canto)
  elements.get('portType').value = 'triangle';
  elements.get('triCount').value = '4';
  elements.get('triA').value = '14';
  elements.get('triB').value = '14';
  vm.runInContext('recalculate(); updateWoodlock();', ctx);
  const objTri = vm.runInContext('buildPgsObjString(lastBuildPack, 0)', ctx);
  assert(objTri.includes('o P_PORT_TRI_1') && objTri.includes('o P_PORT_TRI_4'), 'CAD-14: OBJ com triMeta (4 cantos) deve exportar P_PORT_TRI_1..4');
  const dxf3dTri = vm.runInContext('buildPgs3dDxfString(lastBuildPack, 0)', ctx);
  const facesTri = (dxf3dTri.match(/3DFACE\r\n8\r\nDUTOS_3D/g) || []).length;
  assert.strictEqual(facesTri, 24, `CAD-14: DXF 3D com triMeta (4 cantos × 6 faces) deve gerar 24 faces em DUTOS_3D (obtido ${facesTri})`);

  // 29.4C: l_bend (90° L-Port cilíndrico com 2 dutos — Trecho 1 + Joelho 90° + Trecho 2)
  elements.get('portType').value = 'round';
  elements.get('ductDia').value = '4.0';
  elements.get('numDucts').value = '2';
  elements.get('wlPortRouting').value = 'l_bend';
  vm.runInContext(`(() => {
    recalculate(); updateWoodlock();
    const p = JSON.parse(JSON.stringify(lastBuildPack));
    p.acoustics.portRouting = 'l_bend';
    p.acoustics.portRoutePlan = { routing: 'l_bend', fits: true, l1Mm: 140, l2Mm: 110, rElbow: 85, bendArcMm: 133, clearBackMm: 60 };
    globalThis.__lbPack = p;
  })()`, ctx);
  const objLb = vm.runInContext('buildPgsObjString(globalThis.__lbPack, 0)', ctx);
  assert(objLb.includes('o P_PORT_1_L1_1') && objLb.includes('o P_PORT_1_ELBOW_1') && objLb.includes('o P_PORT_1_L2_1'), 'CAD-14: OBJ l_bend deve exportar L1 + ELBOW + L2 para duto #1');
  assert(objLb.includes('o P_PORT_1_L1_2') && objLb.includes('o P_PORT_1_ELBOW_2') && objLb.includes('o P_PORT_1_L2_2'), 'CAD-14: OBJ l_bend deve exportar L1 + ELBOW + L2 para duto #2');
  const dxf3dLb = vm.runInContext('buildPgs3dDxfString(globalThis.__lbPack, 0)', ctx);
  const facesLb = (dxf3dLb.match(/3DFACE\r\n8\r\nDUTOS_3D/g) || []).length;
  assert(facesLb >= 200, `CAD-14: DXF 3D l_bend (2 dutos × [L1+Elbow+L2]) deve gerar >= 200 faces em DUTOS_3D (obtido ${facesLb})`);
  const dxf2dLb = vm.runInContext('buildPgsDxfString(globalThis.__lbPack)', ctx);
  assert(dxf2dLb.includes('L-PORT L1=140') && dxf2dLb.includes('L2=110'), 'CAD-14: DXF 2D l_bend deve cotar L1 e L2 na vista lateral');
  const fcLb = vm.runInContext('buildFreeCadMacroString(globalThis.__lbPack, 0)', ctx);
  assert(fcLb.includes('def make_elbow_90(') && fcLb.includes('_ELBOW_') && fcLb.includes('_L2_'), 'CAD-14: FreeCAD macro deve conter make_elbow_90 e gerar L1 + ELBOW + L2');

  // Restaura estado padrão limpo
  elements.get('wlPortRouting').value = 'straight';
  elements.get('driverPreset').value = 'oversound';
  vm.runInContext('delete globalThis.__lbPack; loadPreset();', ctx);
});

console.log('\n---------------------------------------------------------------');
console.log(`  RESULTADO: ${passed} passed, ${failed} failed`);
console.log('---------------------------------------------------------------\n');

if (failed > 0) process.exit(1);
