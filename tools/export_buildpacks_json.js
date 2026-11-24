const fs = require('fs');
const path = require('path');
const vm = require('vm');

const htmlPath = path.join('c:/Users/Dinalli/Desktop/Projetos acusticos/BassForge_Kit_Oficial/index.html');
const outDir = path.join('C:/Users/Dinalli/Desktop/Projetos acusticos/BassForge_CAD_Biblioteca/06_BuildPacks_JSON');
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

const cases = [
  { file: '01_selada.json', topo: 'sealed', port: 'round', pStyle: 'square' },
  { file: '02_dutada_redonda.json', topo: 'bass-reflex', port: 'round', pStyle: 'square' },
  { file: '03_dutada_regua.json', topo: 'bass-reflex', port: 'slot_wall', pStyle: 'square', slotOrient: 'horizontal', slotW: '80', slotH: '6' },
  { file: '04_bp4.json', topo: 'bp4', port: 'round', pStyle: 'square', bp: 'bp4' },
  { file: '05_planar_quadrado.json', topo: 'planar', port: 'round', pStyle: 'square' },
  { file: '06_planar_triangulo.json', topo: 'planar', port: 'round', pStyle: 'triangle' },
  { file: '07_free_air.json', topo: 'free-air', port: 'round', pStyle: 'square' },
  { file: '08_bp6_paralela.json', topo: 'bp6', port: 'round', pStyle: 'square', bp: 'bp6', bp6Mode: 'parallel' },
  { file: '09_selada_trapezoidal.json', topo: 'sealed', port: 'round', pStyle: 'square', shape: 'trapezoidal', angle: '15' },
  { file: '10_dutada_regua_vertical.json', topo: 'bass-reflex', port: 'slot_wall', pStyle: 'square', slotOrient: 'vertical', slotW: '58', slotH: '7' },
  { file: '11_dutada_triangulo.json', topo: 'bass-reflex', port: 'triangle', pStyle: 'square', triCount: '4', triA: '14', triB: '14' }
];

for (const c of cases) {
  elements.get('driverPreset').value = 'oversound';
  vm.runInContext('loadPreset();', ctx);
  elements.get('wlShape').value = c.shape || 'rectangular';
  if (c.angle && elements.get('wlAngle')) elements.get('wlAngle').value = c.angle;
  elements.get('wlPlanarStyle').value = c.pStyle;
  if (elements.get('wlSlotOrient')) elements.get('wlSlotOrient').value = c.slotOrient || 'horizontal';
  vm.runInContext(`selectTopology('${c.topo}');`, ctx);
  elements.get('portType').value = c.port;
  if (c.port === 'slot_wall') {
    if (elements.get('slotW')) elements.get('slotW').value = c.slotW || '80';
    if (elements.get('slotH')) elements.get('slotH').value = c.slotH || '6';
  }
  if (c.port === 'triangle') {
    if (elements.get('triCount')) elements.get('triCount').value = c.triCount || '4';
    if (elements.get('triA')) elements.get('triA').value = c.triA || '14';
    if (elements.get('triB')) elements.get('triB').value = c.triB || '14';
  }
  if (c.bp === 'bp4' || c.bp === 'bp6') {
    vm.runInContext('setTuningMode(false);', ctx);
    elements.get('vbInput').value = '60';
    elements.get('vrInput').value = '80';
    elements.get('fbInput').value = '55.0';
    elements.get('ductDia').value = '4.0';
    elements.get('numDucts').value = '2';
    if (c.bp === 'bp6' && elements.get('fbVrInput')) {
      elements.get('fbVrInput').value = '35.0';
    }
  }
  vm.runInContext("recalculate(); autofixWoodlockGeometry('freecad'); updateWoodlock();", ctx);
  const pack = vm.runInContext('lastBuildPack', ctx);
  fs.writeFileSync(path.join(outDir, c.file), JSON.stringify(pack, null, 2), 'utf8');
  console.log('JSON OK:', c.file, '| valid:', pack.validation.valid);
}
