const fs = require('fs');
const path = require('path');
const vm = require('vm');

const htmlPath = path.join('c:/Users/Dinalli/Desktop/Projetos acusticos/BassForge_Kit_Oficial/index.html');
const outDir = path.join('C:/Users/Dinalli/Desktop/Projetos acusticos/BassForge_CAD_Biblioteca/08_Bracing_e_Alojamento_09_10/json');
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

const braceIds = ['wlBraceFF', 'wlBraceTB', 'wlBraceLR', 'wlBraceCross', 'wlBraceBaffle', 'wlBraceRear'];

// 20 modelos canonicos: 12 de 09_BRACING + 8 de 10_ALOJAMENTO
const cases = [
  // 09_BRACING Retangulo (7)
  { file: '09_bracing_ret_100000_ff.json', shape: 'rectangular', braces: [1,0,0,0,0,0] },
  { file: '09_bracing_ret_010000_tb.json', shape: 'rectangular', braces: [0,1,0,0,0,0] },
  { file: '09_bracing_ret_001000_lr.json', shape: 'rectangular', braces: [0,0,1,0,0,0] },
  { file: '09_bracing_ret_000100_window.json', shape: 'rectangular', braces: [0,0,0,1,0,0] },
  { file: '09_bracing_ret_000010_baffle.json', shape: 'rectangular', braces: [0,0,0,0,1,0] },
  { file: '09_bracing_ret_000001_rear.json', shape: 'rectangular', braces: [0,0,0,0,0,1] },
  { file: '09_bracing_ret_111111_full.json', shape: 'rectangular', braces: [1,1,1,1,1,1] },
  // 09_BRACING Trapezio (5)
  { file: '09_bracing_trap_000100_window.json', shape: 'trapezoidal', braces: [0,0,0,1,0,0] },
  { file: '09_bracing_trap_011100_mix.json', shape: 'trapezoidal', braces: [0,1,1,1,0,0] },
  { file: '09_bracing_trap_100111_mix.json', shape: 'trapezoidal', braces: [1,0,0,1,1,1] },
  { file: '09_bracing_trap_010001_tb_rear.json', shape: 'trapezoidal', braces: [0,1,0,0,0,1] },
  { file: '09_bracing_trap_111111_full.json', shape: 'trapezoidal', braces: [1,1,1,1,1,1] },
  // 10_ALOJAMENTO_VEICULO_CACAMBA (8)
  { file: '10_aloj_nodiv.json', shape: 'rectangular', cols: 1, rows: 1, vb: '160' },
  { file: '10_aloj_div_2x2.json', shape: 'rectangular', cols: 2, rows: 2, vb: '220', A: '960', B: '620' },
  { file: '10_aloj_div_3x4.json', shape: 'rectangular', cols: 3, rows: 4, vb: '300', A: '1050', B: '780' },
  { file: '10_aloj_div_4x4.json', shape: 'rectangular', cols: 4, rows: 4, vb: '360', A: '1150', B: '820' },
  { file: '10_aloj_div_5x6.json', shape: 'rectangular', cols: 5, rows: 6, vb: '420', A: '1250', B: '900' },
  { file: '10_aloj_cxrodas.json', shape: 'rectangular', cols: 1, rows: 1, wheelArch: true, vb: '220', A: '1050', B: '520' },
  { file: '10_aloj_barra.json', shape: 'rectangular', cols: 1, rows: 1, protectBar: true, vb: '180', A: '900', B: '500' },
  { file: '10_aloj_completo_2x2_cxrodas_barra.json', shape: 'rectangular', cols: 2, rows: 2, wheelArch: true, protectBar: true, vb: '280', A: '1080', B: '620' }
];

let ok = 0;
for (const c of cases) {
  elements.get('driverPreset').value = 'oversound';
  vm.runInContext('loadPreset();', ctx);
  elements.get('simNumDrivers').value = '1';
  elements.get('wlShape').value = c.shape || 'rectangular';
  elements.get('wlAngle').value = c.shape === 'trapezoidal' ? '12' : '0';
  elements.get('wlWidthA').value = c.A || '800';
  elements.get('wlHeightB').value = c.B || '500';
  vm.runInContext("selectTopology('sealed');", ctx);
  elements.get('vbInput').value = c.vb || '140';
  const br = c.braces || [0,0,0,0,0,0];
  braceIds.forEach((id, i) => { elements.get(id).checked = !!br[i]; });
  elements.get('wlBattens').value = String(br.reduce((a, b) => a + b, 0));
  elements.get('wlMatrixCols').value = String(c.cols || 1);
  elements.get('wlMatrixRows').value = String(c.rows || 1);
  elements.get('wlWheelArch').checked = !!c.wheelArch;
  elements.get('wlProtectBar').checked = !!c.protectBar;
  vm.runInContext("recalculate(); autofixWoodlockGeometry('m09_10'); updateWoodlock();", ctx);
  const pack = vm.runInContext('lastBuildPack', ctx);
  fs.writeFileSync(path.join(outDir, c.file), JSON.stringify(pack, null, 2), 'utf8');
  const checks = (pack.geometry && pack.geometry.checks) || [];
  const g07 = checks.find(ch => ch.code === 'G07') || { pass: true };
  if (pack.validation.valid && g07 && g07.pass) {
    ok++;
  } else {
    console.log('ISSUE:', c.file, 'valid:', pack.validation.valid, 'G07:', g07);
  }
}
console.log(`=== MODULOS 09 & 10 EXPORTADOS: ${ok}/${cases.length} valid + G07 PASS ===`);
