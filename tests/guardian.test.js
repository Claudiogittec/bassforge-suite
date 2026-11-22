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

  // --- 12.2 Registro: todo slot calculado aponta para uma série real de 600 pontos ---
  const registry = vm.runInContext('Object.keys(CHART_REGISTRY).map(id => ({ id, key: CHART_REGISTRY[id].key, av: CHART_REGISTRY[id].availability }))', ctx);
  const curves = vm.runInContext('currentCurves', ctx);
  const calculated = registry.filter(r => r.av !== 'unimplemented');
  assert.strictEqual(calculated.length, 13, `Expected 13 calculated charts, got ${calculated.length}`);
  for (const r of calculated) {
    const arr = curves[r.key];
    assert(Array.isArray(arr) && arr.length === 600, `${r.id}: série ${r.key} ausente ou com tamanho inválido`);
  }

  // --- 12.3 Slots não implementados: sem chave, sem curva, com placeholder explícito ---
  for (const slot of ['SLOT_SPL_ROOM', 'SLOT_ROOM_GAIN']) {
    const entry = vm.runInContext(`CHART_REGISTRY.${slot}`, ctx);
    assert.strictEqual(entry.availability, 'unimplemented', `${slot} deve ser 'unimplemented'`);
    assert.strictEqual(entry.key, null, `${slot} NÃO pode apontar para série existente`);
    assert(entry.placeholder && entry.placeholderDetail, `${slot} precisa de texto de placeholder`);
    assert.notStrictEqual(entry.key, 'G5_SPLinCar', `${slot} jamais pode reutilizar G5_SPLinCar`);
    assert.notStrictEqual(entry.key, 'G7_CabinGain', `${slot} jamais pode reutilizar G7_CabinGain`);
  }

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
  elements.get('bp6Mode').value = 'parallel';
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

  // 19.4 BP6 Série
  elements.get('portType').value = 'round';
  vm.runInContext("selectTopology('bp6'); setTuningMode(false);", ctx);
  elements.get('vbInput').value = '60';
  elements.get('vrInput').value = '80';
  elements.get('fbInput').value = '55.0';
  elements.get('ductDia').value = '4.0';
  elements.get('numDucts').value = '2';
  elements.get('bp6Mode').value = 'series';
  elements.get('fbVrInput').value = '35.0';
  vm.runInContext("recalculate(); autofixWoodlockGeometry('s19_bp6s'); updateWoodlock();", ctx);
  const bp6sPack = vm.runInContext('lastBuildPack', ctx);
  const serCut = bp6sPack.geometry.cutouts.find(c => c.partId === 'P_BP_DIVIDER' && c.kind === 'port');
  const serPort = bp6sPack.geometry.parts.find(p => p.id === 'P_PORT_SERIES');
  assert(serCut && serPort && serPort.axis === '-X', 'BP6 Série deve vincular duto acoplador à P_BP_DIVIDER com P_PORT_SERIES no eixo -X');
  assert.strictEqual(bp6sPack.validation.valid, true, 'BP6 Série após autofix deve ser 100% válida');

  elements.get('bp6Mode').value = 'parallel';
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
  elements.get('bp6Mode').value = 'parallel';
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

console.log('\n---------------------------------------------------------------');
console.log(`  RESULTADO: ${passed} passed, ${failed} failed`);
console.log('---------------------------------------------------------------\n');

if (failed > 0) process.exit(1);
