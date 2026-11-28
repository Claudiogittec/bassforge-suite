// ============================================================================
// PONTE OFICIAL COM O BANCO DE DRIVERS (localStorage + JSON + URL Hash)
// ============================================================================
const DB_STORAGE_KEY = 'BASSFORGE_DRIVER_DB_V1';
const DB_ACTIVE_KEY = 'BASSFORGE_ACTIVE_DRIVER_V1';
let DB_DRIVERS_MAP = {};
let activeDbDriverName = '';

function estimateVsubByDia(dia) {
  const d = parseFloat(dia) || 12;
  if (d >= 21) return 12.0;
  if (d >= 18) return 9.0;
  if (d >= 15) return 6.5;
  if (d >= 12) return 3.5;
  if (d >= 10) return 2.5;
  return 1.5;
}

function dbDriverId(drv) {
  const base = `${drv.brand || ''}_${drv.model || ''}`.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
  return 'db_' + (base || String(drv.id || Date.now()));
}

function validateImportedDriver(raw) {
  if (!raw || typeof raw !== 'object') return false;
  const posFin = v => { const n = Number(v); return Number.isFinite(n) && n > 0; };
  if (!posFin(raw.fs ?? raw.Fs)) return false;
  if (!posFin(raw.vas ?? raw.Vas)) return false;
  if (!posFin(raw.qes ?? raw.Qes)) return false;
  if (!posFin(raw.qms ?? raw.Qms)) return false;
  if (!posFin(raw.re ?? raw.Re)) return false;
  if (!posFin(raw.sd ?? raw.Sd)) return false;
  if (!posFin(raw.pe ?? raw.Pe)) return false;
  if (!posFin(raw.xmax ?? raw.Xmax)) return false;
  const dia = raw.diameter_in ?? raw.dia;
  if (dia !== undefined && dia !== '' && !posFin(dia)) return false;
  if (raw.znom !== undefined && raw.znom !== '' && !posFin(raw.znom)) return false;
  if (raw.le !== undefined && raw.le !== '' && (!Number.isFinite(Number(raw.le)) || Number(raw.le) < 0)) return false;
  return true;
}

function upsertDbDrivers(arr) {
  if (!Array.isArray(arr)) return [];
  const addedKeys = [];
  arr.forEach(raw => {
    // FIS-15: Validação física completa antes de inserir driver de JSON / localStorage / URL
    if (!validateImportedDriver(raw)) return;
    const key = dbDriverId(raw);
    DB_DRIVERS_MAP[key] = raw;
    addedKeys.push(key);
  });
  refreshCustomDriversDropdown();
  return addedKeys;
}

function refreshCustomDriversDropdown() {
  const grp = document.getElementById('customDriversGroup');
  if (!grp) return;
  const sel = document.getElementById('driverPreset');
  const prev = sel ? sel.value : '';
  const keys = Object.keys(DB_DRIVERS_MAP);
  grp.innerHTML = '';
  if (keys.length === 0) {
    const opt = document.createElement('option');
    opt.disabled = true;
    opt.textContent = '(Nenhum driver salvo ainda no Banco DB)';
    grp.appendChild(opt);
  } else {
    keys.forEach(k => {
      const d = DB_DRIVERS_MAP[k];
      const opt = document.createElement('option');
      opt.value = k;
      const title = d.name || `${d.brand || ''} ${d.model || ''}`.trim();
      opt.textContent = `${title} (${d.diameter_in || '?'}″ · ${d.pe || '?'}W · Fs ${d.fs}Hz)`;
      grp.appendChild(opt);
    });
  }
  if (sel && prev && (PRESETS[prev] || DB_DRIVERS_MAP[prev])) sel.value = prev;
}

function loadDriversFromStorage() {
  try {
    const raw = localStorage.getItem(DB_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      const arr = Array.isArray(parsed) ? parsed : (Array.isArray(parsed?.drivers) ? parsed.drivers : []);
      upsertDbDrivers(arr);
    }
  } catch (e) { console.warn('[BassForge] Falha ao ler banco de drivers do localStorage:', e); }
  refreshCustomDriversDropdown();
}

function decodeBase64UrlJson(b64u) {
  const b64 = b64u.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((b64u.length + 3) % 4);
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return JSON.parse(new TextDecoder().decode(bytes));
}

function syncSimLeToElec() {
  const leVal = parseFloat(document.getElementById('tsLe')?.value);
  const elLe = document.getElementById('elLeMh');
  if (elLe && isFinite(leVal) && leVal > 0) elLe.value = leVal;
}

function syncSimZnomToElec() {
  const zVal = parseFloat(document.getElementById('tsZnom')?.value);
  const elZ = document.getElementById('elZCoil');
  if (elZ && isFinite(zVal) && zVal > 0) {
    let found = [...elZ.options].some(o => Math.abs(parseFloat(o.value) - zVal) < 0.05);
    if (!found) {
      const opt = document.createElement('option');
      opt.value = String(zVal);
      opt.textContent = `${zVal.toFixed(1)} Ω`;
      elZ.appendChild(opt);
    }
    elZ.value = String([...elZ.options].find(o => Math.abs(parseFloat(o.value) - zVal) < 0.05).value);
  }
}

function applyDbDriver(drv) {
  const posNum = (v, fb) => { const n = parseFloat(v); return (Number.isFinite(n) && n > 0) ? n : fb; };
  const nonNegNum = (v, fb) => { const n = parseFloat(v); return (Number.isFinite(n) && n >= 0) ? n : fb; };
  const Fs = posNum(drv.fs ?? drv.Fs, 40);
  const Qes = posNum(drv.qes ?? drv.Qes, 0.45);
  const Qms = posNum(drv.qms ?? drv.Qms, 6.0);
  const Vas = posNum(drv.vas ?? drv.Vas, 50);
  const Re = posNum(drv.re ?? drv.Re, 3.5);
  const Pe = posNum(drv.pe ?? drv.Pe, 500);
  const Sd = posNum(drv.sd ?? drv.Sd, 500);
  const Xmax = posNum(drv.xmax ?? drv.Xmax, 8);
  const dia = posNum(drv.diameter_in ?? drv.dia, 12);
  const Vsub = (parseFloat(drv.vsub) > 0) ? parseFloat(drv.vsub) : estimateVsubByDia(dia);
  const Le = nonNegNum(drv.le, 1.5);
  const Znom = posNum(drv.znom, 4);
  const EBP = Fs / Qes;
  const Qts = (Qms * Qes) / (Qms + Qes);
  const bestTopo = (typeof chooseBestTopologyForDriver === 'function')
    ? chooseBestTopologyForDriver({ Fs, Qes, Qms, Qts, EBP, dia })
    : (EBP >= 50 ? 'bass-reflex' : 'sealed');

  document.getElementById('tsFs').value = Fs;
  document.getElementById('tsQes').value = Qes;
  document.getElementById('tsQms').value = Qms;
  document.getElementById('tsVas').value = Vas;
  document.getElementById('tsRe').value = Re;
  document.getElementById('tsPe').value = Pe;
  autoDesignNominalPe = Pe;
  document.getElementById('tsSd').value = Sd;
  document.getElementById('tsXmax').value = Xmax;
  document.getElementById('tsVsub').value = Vsub;

  const setVal = (id, v) => { const e = document.getElementById(id); if (e) e.value = v; };
  setVal('tsLe', Le);
  setVal('tsZnom', Znom);
  setVal('tsDia', dia);
  setVal('tsCoils', (drv.hvc && drv.hgap) ? `${drv.hvc} / ${drv.hgap}` : '');
  setVal('tsMmsCat', (drv.mms_cat > 0) ? drv.mms_cat : '');
  setVal('tsBlCat', (drv.bl_cat > 0) ? drv.bl_cat : '');
  syncSimLeToElec();
  syncSimZnomToElec();
  const ampPow = document.getElementById('elAmpPower');
  if (ampPow) ampPow.value = Math.round(Pe * 1.25);

  const nome = drv.name || `${drv.brand || ''} ${drv.model || ''}`.trim() || 'Driver DB';
  activeDbDriverName = nome;
  const badge = document.getElementById('dbDriverBadge');
  if (badge) {
    badge.style.display = 'block';
    const extras = [];
    if (drv.mms_cat > 0) extras.push(`Mms Cat: ${drv.mms_cat}g`);
    if (drv.bl_cat > 0) extras.push(`Bl Cat: ${drv.bl_cat}T·m`);
    if (drv.hvc && drv.hgap) extras.push(`Hvc/Hgap: ${drv.hvc}/${drv.hgap}mm`);
    badge.innerHTML = `<b>✅ Banco Oficial:</b> ${escapeHtmlStr(nome)} (${dia}″ · ${Znom}Ω · Le ${Le}mH)${extras.length ? '<br>' + escapeHtmlStr(extras.join(' · ')) : ''}`;
  }

  document.getElementById('boxType').value = bestTopo;
  const ptResetEl = document.getElementById('portType');
  if (ptResetEl) ptResetEl.value = 'round';
  lastActiveTopology = bestTopo;
  isAutoTune = true;
  if (typeof runAutoDesignForCurrentState === 'function') {
    runAutoDesignForCurrentState('db', { enableHpfIfNeeded: true });
  } else {
    setTuningMode(true);
    autofixWoodlockGeometry('driver do Banco DB', { resetToMin: true });
  }
}

function importDriversJsonFile(input) {
  const file = input.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const parsed = JSON.parse(e.target.result);
      if (parsed && parsed.schema === 'bassforge-project/v1' && parsed.fields) {
        applyProjectData(parsed);
        alert(`Projeto "${parsed.name || file.name}" restaurado com sucesso!`);
        return;
      }
      const arr = Array.isArray(parsed) ? parsed : (Array.isArray(parsed?.drivers) ? parsed.drivers : [parsed]);
      const keys = upsertDbDrivers(arr);
      if (!keys.length) {
        alert('Nenhum driver válido encontrado no JSON.');
        return;
      }
      try {
        let prevFactoryCount = null;
        try {
          const prevRaw = localStorage.getItem(DB_STORAGE_KEY);
          if (prevRaw) {
            const prevObj = JSON.parse(prevRaw);
            if (Number.isFinite(prevObj?.factoryCount)) prevFactoryCount = prevObj.factoryCount;
          }
        } catch (e2) { console.warn('[BassForge] Falha ao ler factoryCount prévio do localStorage:', e2); }
        const factoryCount = Number.isFinite(parsed?.factoryCount) ? parsed.factoryCount : prevFactoryCount;
        const payload = {
          schema: 'bassforge-driver-db/v1',
          updatedAt: new Date().toISOString(),
          drivers: Object.values(DB_DRIVERS_MAP)
        };
        if (factoryCount !== null) payload.factoryCount = factoryCount;
        localStorage.setItem(DB_STORAGE_KEY, JSON.stringify(payload));
      } catch (err) { console.warn('[BassForge] Falha ao persistir banco de drivers no localStorage:', err); }
      const sel = document.getElementById('driverPreset');
      if (sel) sel.value = keys[0];
      loadPreset();
      alert(`${keys.length} driver(s) carregado(s) no simulador com todos os parâmetros!`);
    } catch (err) {
      alert('Erro ao ler arquivo JSON: ' + err.message);
    } finally {
      input.value = '';
    }
  };
  reader.readAsText(file);
}

function updateSimAdvancedTelemetry(s) {
  const setTxt = (id, txt) => { const e = document.getElementById(id); if (e) e.textContent = txt; };
  const Vas_m3 = (s.Vas || 0) / 1000.0;
  const Cms = (s.rho > 0 && s.c > 0 && s.Sd_m2 > 0) ? Vas_m3 / (s.rho * s.c * s.c * s.Sd_m2 * s.Sd_m2) : 0;
  const w0 = 2 * Math.PI * (s.Fs || 0);
  const Mms = (w0 > 0 && Cms > 0) ? 1.0 / (w0 * w0 * Cms) : 0;
  const a_m = s.Sd_m2 > 0 ? Math.sqrt(s.Sd_m2 / Math.PI) : 0;
  const Mma_free = (8.0 / 3.0) * s.rho * Math.pow(a_m, 3);
  const Mmd = Math.max(Mms - Mma_free, 0.001);
  const Bl = (s.Qes > 0 && Mms > 0 && s.Re > 0) ? Math.sqrt((w0 * Mms * s.Re) / s.Qes) : 0;
  const Rms = (s.Qms > 0 && Mms > 0) ? (w0 * Mms) / s.Qms : 0;
  const bl2_re = s.Re > 0 ? (Bl * Bl) / s.Re : 0;
  const k_spl = (s.rho * s.c) / (2 * Math.PI * 4e-10);
  const eta0 = Math.max(s.no_frac || 0, 1e-12);
  const spl1w_exact = 10 * Math.log10(k_spl * eta0);
  const spl2v = s.Re > 0 ? spl1w_exact + 10 * Math.log10(8.0 / s.Re) : spl1w_exact;
  const r0 = s.Qes > 0 ? 1 + (s.Qms / s.Qes) : 1;
  const R0 = s.Re * r0;

  const coilsStr = document.getElementById('tsCoils')?.value || '';
  let xGeom = s.Xmax_mm;
  if (coilsStr.includes('/')) {
    const [hvc, hgap] = coilsStr.split('/').map(v => parseFloat(v) || 0);
    if (hvc > 0 && hgap > 0) xGeom = Math.abs(hvc - hgap) / 2.0;
  }

  setTxt('sim-qts', s.Qts.toFixed(3));
  setTxt('sim-ebp', s.EBP.toFixed(1));
  setTxt('sim-mms', (Mms * 1000).toFixed(1) + ' g');
  setTxt('sim-mmd', (Mmd * 1000).toFixed(1) + ' g');
  setTxt('sim-cms', (Cms * 1000).toFixed(3) + ' mm/N');
  setTxt('sim-rms', Rms.toFixed(2) + ' kg/s');
  setTxt('sim-bl', Bl.toFixed(2) + ' T·m');
  setTxt('sim-bl2re', bl2_re.toFixed(1) + ' N²/W');
  setTxt('sim-eta0', (eta0 * 100).toFixed(2) + ' %');
  setTxt('sim-spl1w', `${spl1w_exact.toFixed(1)} / ${spl2v.toFixed(1)} dB`);
  setTxt('sim-vd', `${s.Vd.toFixed(3)} L / ${xGeom.toFixed(1)} mm`);
  setTxt('sim-r0', R0.toFixed(1) + ' Ω');

  const mmsCat = parseFloat(document.getElementById('tsMmsCat')?.value) || 0;
  const blCat = parseFloat(document.getElementById('tsBlCat')?.value) || 0;
  const audEl = document.getElementById('sim-audit');
  if (audEl) {
    if (mmsCat > 0 || blCat > 0) {
      const mmsUse = mmsCat > 0 ? mmsCat / 1000 : Mms;
      const blUse = blCat > 0 ? blCat : Bl;
      const fs1 = 1 / (2 * Math.PI * Math.sqrt(mmsUse * Cms));
      const fs3 = (s.Qes * blUse * blUse) / (2 * Math.PI * mmsUse * s.Re);
      const wDev = Math.max(Math.abs(fs1 - s.Fs) / s.Fs, Math.abs(fs3 - s.Fs) / s.Fs) * 100;
      const color = wDev <= 5 ? '#4ade80' : (wDev <= 10 ? '#facc15' : '#f87171');
      audEl.innerHTML = `<span style="color:${color};font-weight:700;">Auditoria Catálogo: desvio máx. Fs = ${wDev.toFixed(1)}%</span>`;
    } else {
      audEl.textContent = 'Auditoria: Modo T/S derivado (informe Mms/Bl opc.)';
    }
  }
}

function checkIncomingDriverLink() {
  const hash = window.location.hash || '';
  if (hash.startsWith('#driver=')) {
    try {
      const drv = decodeBase64UrlJson(hash.slice(8));
      const keys = upsertDbDrivers([drv]);
      if (keys.length) {
        const sel = document.getElementById('driverPreset');
        if (sel) sel.value = keys[0];
        loadPreset();
        return true;
      }
    } catch (e) { console.warn('[BassForge] Link #driver= inválido ou corrompido:', e); }
  }
  return false;
}

window.addEventListener('hashchange', () => { checkIncomingDriverLink(); });
window.addEventListener('storage', ev => {
  if (ev.key === DB_STORAGE_KEY || ev.key === DB_ACTIVE_KEY) {
    loadDriversFromStorage();
    if (ev.key === DB_ACTIVE_KEY && ev.newValue) {
      try {
        const drv = JSON.parse(ev.newValue);
        const keys = upsertDbDrivers([drv]);
        if (keys.length) {
          const sel = document.getElementById('driverPreset');
          if (sel) sel.value = keys[0];
          loadPreset();
        }
      } catch (e) { console.warn('[BassForge] Falha ao sincronizar driver ativo via storage event:', e); }
    }
  }
});

// ============================================================================
// INICIALIZAÇÃO DA INTERFACE
// ============================================================================
function openExpandedChart(chartId) {
  const entry = CHART_REGISTRY[chartId];
  if (!entry || entry.availability === 'unimplemented') return;
  const sel = document.getElementById('expandedSelect');
  if (sel) sel.value = chartId;
  const ov = document.getElementById('expandedOverlay');
  if (ov) ov.value = 'none';
  switchTab('expanded');
}

function initUI() {
  buildChartGridForEnv();
  loadDriversFromStorage();
  if (!checkIncomingDriverLink()) {
    loadPreset({ autoDesign: true });
  }
}

function loadPreset(opts = {}) {
  const key = document.getElementById('driverPreset').value;
  if (DB_DRIVERS_MAP[key]) {
    applyDbDriver(DB_DRIVERS_MAP[key]);
    return;
  }
  const p = PRESETS[key];
  if (!p) return;
  if (opts && opts.autoDesign) {
    applyDbDriver({
      name: p.name, diameter_in: p.dia || 15,
      fs: p.Fs, qms: p.Qms, qes: p.Qes, re: p.Re,
      sd: p.Sd, vas: p.Vas, xmax: p.Xmax, pe: p.Pe,
      vsub: p.Vsub, le: p.Le || 1.5, znom: p.Znom || 4
    });
    return;
  }
  activeDbDriverName = '';
  const badge = document.getElementById('dbDriverBadge');
  if (badge) badge.style.display = 'none';

  document.getElementById('boxType').value = p.type;
  const ptPresetEl = document.getElementById('portType');
  if (ptPresetEl) ptPresetEl.value = p.portType || 'round';
  document.getElementById('vbInput').value = p.Vb;
  document.getElementById('fbInput').value = p.Fb;
  document.getElementById('numDucts').value = p.numDucts;
  document.getElementById('ductDia').value = p.ductDia;
  document.getElementById('ductThick').value = p.ductThick;
  document.getElementById('hpfCutoff').value = p.hpf;
  if (p.ql != null) document.getElementById('qlInput').value = p.ql;
  if (p.temp != null) document.getElementById('tempInput').value = p.temp;

  document.getElementById('tsFs').value = p.Fs;
  document.getElementById('tsQes').value = p.Qes;
  document.getElementById('tsQms').value = p.Qms;
  document.getElementById('tsVas').value = p.Vas;
  document.getElementById('tsRe').value = p.Re;
  document.getElementById('tsPe').value = p.Pe;
  autoDesignNominalPe = p.Pe;
  document.getElementById('tsSd').value = p.Sd;
  document.getElementById('tsXmax').value = p.Xmax;
  document.getElementById('tsVsub').value = p.Vsub;
  const setVal = (id, v) => { const e = document.getElementById(id); if (e) e.value = v; };
  setVal('tsLe', p.Le || 1.5);
  setVal('tsZnom', p.Znom || 4);
  setVal('tsDia', p.dia || 15);
  setVal('tsCoils', '');
  setVal('tsMmsCat', '');
  setVal('tsBlCat', '');
  syncSimLeToElec();
  syncSimZnomToElec();

  // Calibra dinamicamente as escalas dos ranges baseados no driver
  const vbR = document.getElementById('vbRange');
  if (vbR) {
    vbR.min = Math.max(10, Math.floor(p.Vas * 0.15));
    vbR.max = Math.max(250, Math.ceil(p.Vas * 2.2));
    vbR.value = p.Vb;
  }
  const fbR = document.getElementById('fbRange');
  if (fbR) {
    fbR.min = Math.max(15, Math.floor(p.Fs * 0.5));
    fbR.max = Math.ceil(p.Fs * 2.0);
    fbR.value = p.Fb;
  }
  const useAuto = !p.manualTune;
  lastActiveTopology = p.type;
  autoDesignExactFb = null;
  autoDesignVbRef = null;
  const adSt = document.getElementById('autoDesignStatus');
  if (adSt) adSt.style.display = 'none';
  isAutoTune = useAuto;
  setTuningMode(useAuto);
  autofixWoodlockGeometry(`preset ${p.name}`, { resetToMin: true });
}

function switchTab(tabId) {
  const btns = document.querySelectorAll('.tab-btn');
  btns.forEach(b => b.classList.remove('active'));
  document.getElementById('tabGrid').style.display = (tabId === 'grid' ? 'grid' : 'none');
  document.getElementById('tabExpanded').style.display = (tabId === 'expanded' ? 'flex' : 'none');
  document.getElementById('tabWoodlock').style.display = (tabId === 'woodlock' ? 'flex' : 'none');
  document.getElementById('tabElectrical').style.display = (tabId === 'electrical' ? 'flex' : 'none');
  document.getElementById('tabAudit').style.display = (tabId === 'audit' ? 'block' : 'none');

  const tb = document.getElementById('chartToolbar');
  if (tb) tb.style.display = (tabId === 'grid' || tabId === 'expanded') ? 'flex' : 'none';

  if(tabId === 'grid') {
    if (btns[0]) btns[0].classList.add('active');
    drawAllCharts();
  } else if(tabId === 'expanded') {
    if (btns[1]) btns[1].classList.add('active');
    renderExpanded();
  } else if(tabId === 'woodlock') {
    if (btns[2]) btns[2].classList.add('active');
    updateWoodlock();
  } else if(tabId === 'electrical') {
    if (btns[3]) btns[3].classList.add('active');
    updateElectrical();
  } else if(tabId === 'audit') {
    if (btns[4]) btns[4].classList.add('active');
    populateAuditTable();
  }
}
