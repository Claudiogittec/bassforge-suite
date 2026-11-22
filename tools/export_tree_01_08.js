const fs = require('fs');
const path = require('path');
const vm = require('vm');

const htmlPath = path.join('c:/Users/Dinalli/Desktop/Projetos acusticos/BassForge_Kit_Oficial/index.html');
const outDir = path.join('C:/Users/Dinalli/Desktop/Projetos acusticos/BassForge_CAD_Biblioteca/07_Arvore_Completa_01_08/json');
fs.mkdirSync(outDir, { recursive: true });

const html = fs.readFileSync(htmlPath, 'utf8');
const scripts = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)].map(m => m[1]).join('\n');

const elements = new Map();
const makeEl = (id, tag = 'div', value = '') => ({
  id, tagName: tag.toUpperCase(), value, checked: false, textContent: '', innerHTML: '',
  style: {}, options: [], selectedIndex: 0, clientWidth: 800, clientHeight: 400, width: 800, height: 400,
  classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
  addEventListener() {}, setAttribute() {}, getAttribute() { return ''; }, appendChild(c) { return c; }, removeChild(c) { return c; },
  querySelectorAll() { return []; }, querySelector() { return null; },
  getContext() {
    return new Proxy({}, { get: (_, prop) => prop === 'measureText' ? () => ({ width: 20 }) : (prop === 'createLinearGradient' ? () => ({ addColorStop() {} }) : () => {}) });
  }
});

for (const m of html.matchAll(/<(input|select|button|div|span|canvas|tbody|table|details|small|h3|label)\b([^>]*)>/gi)) {
  const tag = m[1], attrs = m[2];
  const idM = attrs.match(/\bid="([^"]+)"/i);
  if (!idM) continue;
  const valM = attrs.match(/\bvalue="([^"]*)"/i);
  const el = makeEl(idM[1], tag, valM ? valM[1] : '');
  if (tag.toLowerCase() === 'select') {
    const idx = m.index;
    const endIdx = html.indexOf('</select>', idx);
    if (endIdx > idx) {
      const inner = html.slice(idx, endIdx);
      const opts = [...inner.matchAll(/<option\b([^>]*)>([\s\S]*?)<\/option>/gi)];
      el.options = opts.map(o => ({ value: (o[1].match(/value="([^"]*)"/i) || [, ''])[1], text: o[2].replace(/<[^>]+>/g, '').trim(), selected: /selected/i.test(o[1]) }));
      const sel = el.options.find(o => o.selected) || el.options[0];
      if (sel) el.value = sel.value;
    }
  }
  elements.set(idM[1], el);
}

const ctx = vm.createContext({
  console, Math, Date, JSON, Number, String, Array, Object, Set, Map, RegExp, parseFloat, parseInt, isNaN, isFinite,
  setTimeout: () => 0, clearTimeout: () => {}, requestAnimationFrame: () => 0,
  window: { devicePixelRatio: 1, innerWidth: 1280, innerHeight: 800, location: { hash: '' }, addEventListener() {}, localStorage: { getItem: () => null, setItem() {} } },
  localStorage: { getItem: () => null, setItem() {} },
  document: {
    getElementById: id => elements.get(id) || null,
    querySelectorAll: () => [],
    querySelector: () => null,
    createElement: tag => makeEl('', tag),
    addEventListener() {}
  },
  navigator: { clipboard: { writeText: async () => {} } },
  alert() {}
});
vm.runInContext(scripts, ctx);
vm.runInContext('initUI();', ctx);

// Matriz completa 54/54 da arvore 01_CAIXA_SELADA .. 08_BAFFLE_INFINITO_FREE_AIR
const cases = [];
const shapes = [['ret', 'rectangular'], ['trap', 'trapezoidal']];

// 01_CAIXA_SELADA (8)
for (const [sTag, shape] of shapes) {
  for (const n of [1, 2]) {
    for (const mount of ['normal', 'inverted']) {
      cases.push({
        file: `01_selada_${sTag}_${n}sub_${mount === 'inverted' ? 'invertida' : 'normal'}.json`,
        topo: 'sealed', shape, n, mount, vb: n === 2 ? '260' : '130'
      });
    }
  }
}

// 02_CAIXA_DUTADA (20)
for (const orient of ['horizontal', 'vertical']) {
  for (const [sTag, shape] of shapes) {
    for (const n of [1, 2]) {
      cases.push({
        file: `02_dutada_quad_${orient === 'horizontal' ? 'horiz' : 'vert'}_${sTag}_${n}sub.json`,
        topo: 'bass-reflex', port: 'slot_wall', slotOrient: orient, shape, n,
        vb: n === 2 ? '280' : '140', fb: n === 2 ? '36.0' : '44.62',
        slotW: orient === 'horizontal' ? (n === 2 ? '110' : '80') : '58',
        slotH: n === 2 ? '9' : '6'
      });
    }
  }
}
for (const [sTag, shape] of shapes) {
  for (const n of [1, 2]) {
    cases.push({
      file: `02_dutada_red_${sTag}_${n}sub.json`,
      topo: 'bass-reflex', port: 'round', shape, n,
      vb: n === 2 ? '280' : '140', fb: n === 2 ? '36.0' : '44.62',
      numDucts: '2', ductDia: n === 2 ? '6.0' : '4.0'
    });
  }
}
for (const [sTag, shape] of shapes) {
  for (const n of [1, 2]) {
    cases.push({
      file: `02_dutada_tri_${sTag}_${n}sub.json`,
      topo: 'bass-reflex', port: 'triangle', shape, n,
      vb: n === 2 ? '280' : '140', fb: n === 2 ? '36.0' : '44.62',
      triCount: '4', triA: n === 2 ? '18' : '14', triB: n === 2 ? '18' : '14'
    });
  }
}
for (const [sTag, shape] of shapes) {
  cases.push({
    file: `02_dutada_unico_red_${sTag}_2sub.json`,
    topo: 'bass-reflex', port: 'round', portLayout: 'center_shared', shape, n: 2,
    vb: '280', fb: '36.0', numDucts: '1', ductDia: '8.0'
  });
  cases.push({
    file: `02_dutada_unico_vert_${sTag}_2sub.json`,
    topo: 'bass-reflex', port: 'slot_wall', slotOrient: 'vertical', portLayout: 'center_shared', shape, n: 2,
    vb: '280', fb: '36.0', slotW: '50', slotH: '12'
  });
}

// 03_BANDPASS_4_ORDEM (6)
for (const n of [1, 2]) {
  cases.push({
    file: `03_bp4_quad_ret_${n}sub.json`,
    topo: 'bp4', bp: 'bp4', port: 'slot_wall', shape: 'rectangular', n,
    vb: n === 2 ? '120' : '70', vr: n === 2 ? '160' : '90', fb: n === 2 ? '48.0' : '55.0',
    slotW: '40', slotH: n === 2 ? '10' : '7'
  });
}
for (const [sTag, shape] of shapes) {
  for (const n of [1, 2]) {
    cases.push({
      file: `03_bp4_red_${sTag}_${n}sub.json`,
      topo: 'bp4', bp: 'bp4', port: 'round', shape, n,
      vb: n === 2 ? '120' : '70', vr: n === 2 ? '160' : '90', fb: n === 2 ? '48.0' : '55.0',
      ductDia: n === 2 ? '5.0' : '4.0', numDucts: '2'
    });
  }
}

// 04_BANDPASS_6_ORDEM_PARALELO (6)
for (const n of [1, 2]) {
  cases.push({
    file: `04_bp6p_quad_ret_${n}sub.json`,
    topo: 'bp6', bp: 'bp6', bp6Mode: 'parallel', port: 'slot_wall', shape: 'rectangular', n,
    vb: n === 2 ? '120' : '70', vr: n === 2 ? '160' : '90', fb: n === 2 ? '48.0' : '58.0', fbVr: n === 2 ? '34.0' : '42.0',
    slotW: '40', slotH: n === 2 ? '10' : '6'
  });
}
for (const [sTag, shape] of shapes) {
  for (const n of [1, 2]) {
    cases.push({
      file: `04_bp6p_red_${sTag}_${n}sub.json`,
      topo: 'bp6', bp: 'bp6', bp6Mode: 'parallel', port: 'round', shape, n,
      vb: n === 2 ? '120' : '70', vr: n === 2 ? '160' : '90', fb: n === 2 ? '48.0' : '58.0', fbVr: '34.0',
      ductDia: n === 2 ? '5.0' : '4.0', numDucts: '2'
    });
  }
}

// 05_BANDPASS_6_ORDEM_SERIE (4)
for (const [sTag, shape] of shapes) {
  for (const n of [1, 2]) {
    cases.push({
      file: `05_bp6s_${sTag}_${n}sub.json`,
      topo: 'bp6', bp: 'bp6', bp6Mode: 'series', port: 'round', shape, n,
      vb: n === 2 ? '140' : '70', vr: n === 2 ? '220' : '90', fb: n === 2 ? '46.0' : '58.0', fbVr: '34.0',
      ductDia: '4.0', numDucts: '2'
    });
  }
}

// 06_BAFFLE_PLANAR_HORN_QUADRADO (4)
for (const [sTag, shape] of shapes) {
  for (const n of [1, 2]) {
    cases.push({
      file: `06_planar_quad_${sTag}_${n}sub.json`,
      topo: 'planar', pStyle: 'square', shape, n, vb: n === 2 ? '280' : '140'
    });
  }
}

// 07_BAFFLE_PLANAR_HORN_TRIANGULO (4)
for (const [sTag, shape] of shapes) {
  for (const n of [1, 2]) {
    cases.push({
      file: `07_planar_tri_${sTag}_${n}sub.json`,
      topo: 'planar', pStyle: 'triangle', shape, n, vb: n === 2 ? '280' : '140'
    });
  }
}

// 08_BAFFLE_INFINITO_FREE_AIR (2)
for (const n of [1, 2]) {
  cases.push({
    file: `08_free_air_${n}sub.json`,
    topo: 'free-air', shape: 'rectangular', n
  });
}

let validCount = 0;
let invalidList = [];
for (const c of cases) {
  elements.get('driverPreset').value = 'oversound';
  vm.runInContext('loadPreset();', ctx);
  elements.get('simNumDrivers').value = String(c.n || 1);
  elements.get('wlShape').value = c.shape || 'rectangular';
  elements.get('wlAngle').value = c.shape === 'trapezoidal' ? '12' : '0';
  elements.get('wlMountMode').value = c.mount || 'normal';
  elements.get('wlPlanarStyle').value = c.pStyle || 'square';
  elements.get('wlSlotOrient').value = c.slotOrient || 'horizontal';
  elements.get('wlPortLayout').value = c.portLayout || 'standard';
  elements.get('wlWidthA').value = c.n === 2 ? '1100' : '800';
  elements.get('wlHeightB').value = '520';
  vm.runInContext(`selectTopology('${c.topo}');`, ctx);
  if (c.vb) elements.get('vbInput').value = c.vb;
  if (c.fb && !c.bp) {
    vm.runInContext('setTuningMode(false);', ctx);
    elements.get('fbInput').value = c.fb;
  }
  elements.get('portType').value = c.port || 'round';
  if (c.port === 'slot_wall') {
    elements.get('slotW').value = c.slotW || '80';
    elements.get('slotH').value = c.slotH || '6';
  }
  if (c.port === 'triangle') {
    elements.get('triCount').value = c.triCount || '4';
    elements.get('triA').value = c.triA || '14';
    elements.get('triB').value = c.triB || '14';
  }
  if (c.ductDia) elements.get('ductDia').value = c.ductDia;
  if (c.numDucts) elements.get('numDucts').value = c.numDucts;
  if (c.bp === 'bp4' || c.bp === 'bp6') {
    vm.runInContext('setTuningMode(false);', ctx);
    elements.get('vbInput').value = c.vb || '70';
    elements.get('vrInput').value = c.vr || '90';
    elements.get('fbInput').value = c.fb || '55.0';
    if (c.bp === 'bp6') {
      elements.get('bp6Mode').value = c.bp6Mode || 'parallel';
      elements.get('fbVrInput').value = c.fbVr || '38.0';
    }
  }
  vm.runInContext("recalculate(); autofixWoodlockGeometry('tree'); updateWoodlock();", ctx);
  const pack = vm.runInContext('lastBuildPack', ctx);
  fs.writeFileSync(path.join(outDir, c.file), JSON.stringify(pack, null, 2), 'utf8');
  if (pack.validation.valid) {
    validCount++;
  } else {
    const crits = pack.validation.issues.filter(i => i.level === 'critical').map(i => `${i.code}: ${i.msg}`);
    invalidList.push({ file: c.file, crits });
  }
}

console.log(`=== ARVORE 01..08 EXPORTADA: ${validCount}/${cases.length} valid: true ===`);
if (invalidList.length) {
  for (const inv of invalidList) {
    console.log('  INVALID:', inv.file, '->', inv.crits.join(' | '));
  }
}
