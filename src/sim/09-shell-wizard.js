// ============================================================================
// SHELL DESKTOP PROFISSIONAL (MENUS, MODAIS, WIZARD, CONTEXT MENU, STATUS BAR)
// ============================================================================
let activeWizardGoal = 'optimum';
let activeWizardPlan = null;
let ctxTargetChartId = 'G4';

function closeAllMenus() {
  document.querySelectorAll('.menu-item.open').forEach(el => el.classList.remove('open'));
  closeChartContextMenu();
}

function toggleMenu(btn) {
  const item = btn && btn.parentElement;
  if (!item) return;
  const wasOpen = item.classList.contains('open');
  closeAllMenus();
  if (!wasOpen) item.classList.add('open');
}

function openConfigModal(modalId) {
  closeAllMenus();
  closeConfigModals();
  if (modalId === 'modalBox' || modalId === 'modalEnv') {
    const sb = document.getElementById('quickSidebar');
    const tb = document.getElementById('tbToggleSidebar');
    if (sb && sb.classList.contains('collapsed')) {
      sb.classList.remove('collapsed');
      if (tb) tb.classList.add('active');
      setTimeout(() => { drawAllCharts(); renderExpanded(); updateWoodlock(); }, 210);
    }
    const targetId = (modalId === 'modalEnv') ? 'grpDspThermal' : (document.getElementById('boxType')?.value === 'bass-reflex' ? 'portControls' : 'grpBoxData');
    const grp = document.getElementById(targetId);
    if (grp) {
      grp.open = true;
      if (grp.scrollIntoView) grp.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
    return;
  }
  const el = document.getElementById(modalId);
  if (el) el.classList.add('open');
}

function closeConfigModals() {
  document.querySelectorAll('.bf-modal-backdrop.open').forEach(m => m.classList.remove('open'));
}

function switchModalTab(modalId, paneKey, btnEl) {
  const modal = document.getElementById(modalId);
  if (!modal) return;
  modal.querySelectorAll('.bf-mtab-btn').forEach(b => b.classList.remove('active'));
  if (btnEl) btnEl.classList.add('active');
  modal.querySelectorAll('[data-mpane]').forEach(p => {
    p.style.display = (p.getAttribute('data-mpane') === paneKey) ? 'block' : 'none';
  });
}

function toggleQuickSidebar() {
  const sb = document.getElementById('quickSidebar');
  const tb = document.getElementById('tbToggleSidebar');
  if (!sb) return;
  const collapsed = sb.classList.toggle('collapsed');
  if (tb) tb.classList.toggle('active', !collapsed);
  setTimeout(() => { drawAllCharts(); renderExpanded(); updateWoodlock(); }, 210);
}

function resetCurrentProject() {
  const simN = document.getElementById('simNumDrivers');
  const th = document.getElementById('thermalDeltaT');
  const pt = document.getElementById('portType');
  if (simN) simN.value = '1';
  if (th) th.value = '0';
  if (pt) pt.value = 'round';
  clearSnapshotA();
  loadPreset();
}

function updateDesktopStatusBar(s) {
  const sel = document.getElementById('driverPreset');
  const dName = sel && sel.selectedIndex >= 0 ? sel.options[sel.selectedIndex].text.split('(')[0].trim() : 'Driver';
  const sbDrv = document.getElementById('sbDriver');
  const sbBox = document.getElementById('sbBox');
  const sbPort = document.getElementById('sbPort');
  const sbEpdr = document.getElementById('sbEpdr');
  const sbTh = document.getElementById('sbThermal');
  if (sbDrv) sbDrv.textContent = `${dName.slice(0, 26)}${s.nDrivers > 1 ? ` (${s.nDrivers}x)` : ''}`;
  if (sbBox) {
    if (s.boxType === 'bass-reflex') sbBox.textContent = `Dutada ${s.Vb.toFixed(1)}L @ ${s.Fb.toFixed(1)}Hz · F3 ${s.F3.toFixed(1)}Hz`;
    else if (s.boxType === 'bp4') sbBox.textContent = `BP4 VR=${(s.Vr||0).toFixed(0)}L / VF=${s.Vb.toFixed(0)}L @ ${s.Fb.toFixed(1)}Hz`;
    else if (s.boxType === 'bp6') sbBox.textContent = `BP6 ${(s.bp6Mode==='series'?'Série':'Paral.')} ${(s.FbVr||35).toFixed(0)}/${s.Fb.toFixed(0)}Hz`;
    else if (s.boxType === 'planar') sbBox.textContent = `Planar ${s.Vb.toFixed(1)}L @ ${s.Fb.toFixed(1)}Hz · F3 ${s.F3.toFixed(1)}Hz`;
    else if (s.boxType === 'free-air') sbBox.textContent = `Free-Air (Vb→∞) · Fc ${s.fc.toFixed(1)}Hz · F3 ${s.F3.toFixed(1)}Hz`;
    else sbBox.textContent = `Selada ${s.Vb.toFixed(1)}L · Fc ${s.fc.toFixed(1)}Hz · F3 ${s.F3.toFixed(1)}Hz`;
  }
  if (sbPort) {
    sbPort.textContent = (s.boxType === 'bp6')
      ? `VF ${s.LvCm.toFixed(1)}cm (${s.airVel.toFixed(1)} m/s) · VR ${(s.LvVrCm||0).toFixed(1)}cm (${(s.airVelVr||0).toFixed(1)} m/s)`
      : ((s.boxType === 'bass-reflex' || s.boxType === 'bp4')
          ? `Lv ${s.LvCm.toFixed(1)}cm · ${s.airVel.toFixed(1)} m/s · f₁ ${s.fPipe1.toFixed(0)}Hz`
          : (s.boxType === 'planar'
              ? `Lv ${s.LvCm.toFixed(1)}cm · ${s.airVel.toFixed(1)} m/s · λ/4 ${(s.fQuarterWave || 150).toFixed(0)}Hz · λ/2 ${(s.fHalfWave || 300).toFixed(0)}Hz`
              : (s.boxType === 'free-air' ? `Baffle Infinito` : `Caixa Selada (sem duto)`)));
  }
  if (sbEpdr && currentCurves && currentCurves.meta) {
    sbEpdr.textContent = `EPDR ${currentCurves.meta.minEpdrVal.toFixed(2)}Ω @ ${currentCurves.meta.minEpdrFreq.toFixed(0)}Hz`;
  }
  if (sbTh) {
    if (s.deltaT > 0) {
      sbTh.style.display = 'inline-flex';
      sbTh.textContent = `ΔT +${s.deltaT}°C (${s.powerCompDb.toFixed(1)} dB)`;
    } else {
      sbTh.style.display = 'none';
    }
  }

  // Atualiza Inspetor Lateral (miniatura SVG + tabela compacta read-only)
  const setTxt = (id, t) => { const e = document.getElementById(id); if (e) e.textContent = t; };
  if (s.EBP != null) setTxt('propEbp', s.EBP.toFixed(1) + ' Hz');
  if (s.alpha != null) setTxt('propAlpha', s.alpha.toFixed(2));
  if (s.F3 != null) setTxt('propF3', s.F3.toFixed(2) + ' Hz');
  if (s.Vtot != null) setTxt('propVtot', s.Vtot.toFixed(2) + ' L');

  const thumbSvg = document.getElementById('boxThumbSvg');
  if (thumbSvg) {
    const svgMap = {
      'bass-reflex': `<svg width="42" height="32" viewBox="0 0 42 32" fill="none"><rect x="2" y="2" width="38" height="28" rx="3" fill="#080d16" stroke="#00d4ff" stroke-width="1.4"/><circle cx="16" cy="16" r="8.5" stroke="#38bdf8" stroke-width="1.4"/><circle cx="16" cy="16" r="3" fill="#00d4ff" fill-opacity="0.3"/><rect x="29" y="6" width="6" height="20" rx="1.5" fill="#10b981" fill-opacity="0.25" stroke="#10b981" stroke-width="1.2"/></svg>`,
      'sealed': `<svg width="42" height="32" viewBox="0 0 42 32" fill="none"><rect x="4" y="2" width="34" height="28" rx="3" fill="#080d16" stroke="#a855f7" stroke-width="1.4"/><circle cx="21" cy="16" r="9" stroke="#c084fc" stroke-width="1.4"/><circle cx="21" cy="16" r="3.2" fill="#a855f7" fill-opacity="0.35"/></svg>`,
      'bp4': `<svg width="42" height="32" viewBox="0 0 42 32" fill="none"><rect x="2" y="2" width="38" height="28" rx="3" fill="#080d16" stroke="#f59e0b" stroke-width="1.4"/><line x1="20" y1="2" x2="20" y2="30" stroke="#f59e0b" stroke-width="1.2"/><circle cx="20" cy="16" r="6" fill="#080d16" stroke="#38bdf8" stroke-width="1.3"/><rect x="31" y="7" width="5" height="18" rx="1" fill="#10b981" fill-opacity="0.3" stroke="#10b981" stroke-width="1.1"/></svg>`,
      'bp6': `<svg width="42" height="32" viewBox="0 0 42 32" fill="none"><rect x="2" y="2" width="38" height="28" rx="3" fill="#080d16" stroke="#ef4444" stroke-width="1.4"/><line x1="21" y1="2" x2="21" y2="30" stroke="#ef4444" stroke-width="1.2"/><circle cx="21" cy="16" r="5.5" fill="#080d16" stroke="#38bdf8" stroke-width="1.3"/><rect x="5" y="8" width="4.5" height="16" rx="1" fill="#f59e0b" fill-opacity="0.3" stroke="#f59e0b" stroke-width="1"/><rect x="32" y="7" width="4.5" height="18" rx="1" fill="#10b981" fill-opacity="0.3" stroke="#10b981" stroke-width="1"/></svg>`,
      'planar': `<svg width="42" height="32" viewBox="0 0 42 32" fill="none"><rect x="2" y="2" width="38" height="28" rx="3" fill="#080d16" stroke="#14b8a6" stroke-width="1.4"/><line x1="15" y1="2" x2="15" y2="30" stroke="#14b8a6" stroke-width="1.2"/><path d="M15 11 L38 4 M15 21 L38 28" stroke="#38bdf8" stroke-width="1.2"/></svg>`,
      'free-air': `<svg width="42" height="32" viewBox="0 0 42 32" fill="none"><rect x="18" y="2" width="6" height="28" rx="1.5" fill="#080d16" stroke="#38bdf8" stroke-width="1.4"/><circle cx="21" cy="16" r="7" stroke="#10b981" stroke-width="1.3"/><path d="M6 16 H13 M29 16 H36" stroke="#94a3b8" stroke-width="1.2" stroke-dasharray="2 2"/></svg>`
    };
    thumbSvg.innerHTML = svgMap[s.boxType] || svgMap['bass-reflex'];
  }
  const titleMap = {
    'bass-reflex': 'Bass-Reflex (4ª Ordem)',
    'sealed': 'Caixa Selada (2ª Ordem)',
    'bp4': 'Band-Pass 4ª (BP4)',
    'bp6': `Band-Pass 6ª (${s.bp6Mode === 'series' ? 'Série' : 'Paralela'})`,
    'planar': 'Planar Horn (Dutada + λ/4)',
    'free-air': 'Baffle Infinito (Free-Air)'
  };
  setTxt('thumbBoxTitle', titleMap[s.boxType] || s.boxType);
  setTxt('thumbBoxSub',
    s.boxType === 'bass-reflex' ? `Vb ${s.Vb.toFixed(1)}L · Fb ${s.Fb.toFixed(1)}Hz` :
    s.boxType === 'planar' ? `Vb ${s.Vb.toFixed(1)}L · Fb ${s.Fb.toFixed(1)}Hz · λ/4 ${(s.fQuarterWave||150).toFixed(0)}Hz` :
    s.boxType === 'bp4' ? `VR ${(s.Vr||0).toFixed(0)}L · VF ${s.Vb.toFixed(0)}L @ ${s.Fb.toFixed(0)}Hz` :
    s.boxType === 'bp6' ? `VR ${(s.Vr||0).toFixed(0)}L@${(s.FbVr||35).toFixed(0)} · VF ${s.Vb.toFixed(0)}L@${s.Fb.toFixed(0)}` :
    s.boxType === 'free-air' ? `Vb → ∞ · Qtc=Qts · Fc ${s.fc.toFixed(1)}Hz` :
    `Vb ${s.Vb.toFixed(1)}L · Fc ${s.fc.toFixed(1)}Hz`
  );

  // Diagnóstico Acústico do Transdutor (física Thiele-Small)
  const insBar = document.getElementById('driverInsightsBar');
  if (insBar && s.EBP != null && s.Qts != null) {
    const tips = [];
    if (s.EBP < 50) tips.push('<b>EBP ' + s.EBP.toFixed(0) + ' Hz</b>: indicado para Caixa Selada.');
    else if (s.EBP <= 85) tips.push('<b>EBP ' + s.EBP.toFixed(0) + ' Hz</b>: apto para Selada ou Bass-Reflex.');
    else tips.push('<b>EBP ' + s.EBP.toFixed(0) + ' Hz</b>: indicado para Bass-Reflex (Dutada).');

    if (s.Qts < 0.35) tips.push('<b>Qts ' + s.Qts.toFixed(2) + '</b>: alto amortecimento elétrico.');
    else if (s.Qts <= 0.50) tips.push('<b>Qts ' + s.Qts.toFixed(2) + '</b>: amortecimento equilibrado.');
    else tips.push('<b>Qts ' + s.Qts.toFixed(2) + '</b>: baixo amortecimento (tende a elevar pico).');

    if (s.boxType === 'bass-reflex' && s.airVel > 17) {
      tips.push('<span style="color:var(--danger);"><b>Duto ' + s.airVel.toFixed(1) + ' m/s</b> (&gt; 17 m/s): aumente área ou use régua/aeroport.</span>');
    } else if (s.boxType === 'bass-reflex') {
      tips.push('<span style="color:var(--success);"><b>Duto ' + s.airVel.toFixed(1) + ' m/s</b> (escoamento laminar).</span>');
    }
    insBar.innerHTML = tips.map(t => `<span class="insight-chip">${t}</span>`).join('<span style="color:var(--border-strong);">·</span>');
  }
}

function openWizardModal() {
  openConfigModal('modalWizard');
  updateWizardPreview();
}

function selectWizardGoal(goal, btnEl) {
  activeWizardGoal = goal;
  document.querySelectorAll('[data-wiz-goal]').forEach(b => b.classList.remove('active'));
  if (btnEl) btnEl.classList.add('active');
  updateWizardPreview();
}

function computeWizardPlan() {
  const Fs = parseFloat(document.getElementById('tsFs').value) || 40;
  const Qes = parseFloat(document.getElementById('tsQes').value) || 0.45;
  const Qms = parseFloat(document.getElementById('tsQms').value) || 7.2;
  const VasSingle = parseFloat(document.getElementById('tsVas').value) || 100;
  const PeSingle = parseFloat(document.getElementById('tsPe').value) || 500;
  const SdSingle = (parseFloat(document.getElementById('tsSd').value) || 500) / 10000.0;
  const Xmax = parseFloat(document.getElementById('tsXmax').value) || 10;
  const nDrivers = Math.max(1, parseInt(document.getElementById('simNumDrivers')?.value) || 1);
  const tempC = parseFloat(document.getElementById('tempInput').value) || 20;
  const c = 20.0547605 * Math.sqrt(273.15 + tempC);

  const Qts = (Qms * Qes) / (Qms + Qes);
  const EBP = Fs / Qes;
  const Vas = VasSingle * nDrivers;
  const Pe = PeSingle * nDrivers;
  const Sd = SdSingle * nDrivers;
  const override = document.getElementById('wizBoxOverride')?.value || 'auto';
  const portPref = document.getElementById('wizPortPref')?.value || 'round';
  const g = activeWizardGoal || 'optimum';

  let boxType = override;
  if (boxType === 'auto') {
    if (EBP < 50 && Qts > 0.50 && (g === 'optimum' || g === 'attack')) boxType = 'sealed';
    else if (g === 'spl' && EBP >= 85 && Qts <= 0.42) boxType = 'bp6';
    else if (g === 'trio' && EBP >= 75) boxType = 'planar';
    else boxType = 'bass-reflex';
  }

  let Vb = Vas * 0.7, Vr = Vas * 0.5, Fb = Fs, FbVr = Math.max(25, Math.round(Fs * 0.85));
  let hpf = Math.max(18, Math.round(Fs * 0.7));
  let portType = portPref;
  let numDucts = 2, ductDia = 4.0, slotW = 35.0, slotH = 6.0, triCount = 2, triA = 14.0, triB = 14.0;
  let LvCm = 0, airVel = 0, fPipe1 = 0, alignDesc = '', warnNote = '';

  const goalMap = {
    optimum: { kVol: 0.90, kFb: 1.00, vel: 13.5, label: 'Optimum (Equilíbrio Musical)' },
    lowbass: { kVol: 1.25, kFb: 0.86, vel: 12.0, label: 'Low Bass (Subgrave Estendido)' },
    attack:  { kVol: 0.80, kFb: 1.06, vel: 14.5, label: 'Attack (Grave Encorpado)' },
    trio:    { kVol: 0.70, kFb: 1.28, vel: 16.0, label: 'Trio / Ataque (70–110 Hz)' },
    subext:  { kVol: 1.35, kFb: 0.78, vel: 13.5, label: 'Sub-Extremo (30–40 Hz)', warn: '⚠️ Sintonia sub-extrema: projetada para subgrave dedicado, não para música aberta.' },
    spl:     { kVol: 1.10, kFb: 1.18, vel: 17.0, label: 'SPL Máximo (Competição)', warn: '⚠️ Perfil de competição SPL: pico estreito de alta pressão.' }
  };
  const cfg = goalMap[g] || goalMap.optimum;
  warnNote = cfg.warn || '';

  let keepAutoTune = false;

  if (boxType === 'sealed' || boxType === 'planar') {
    const qTarget = g === 'lowbass' ? 0.62 : (g === 'optimum' ? 0.7071 : (g === 'attack' ? 0.85 : 0.95));
    const ratio2 = Math.pow(qTarget / Math.max(0.15, Qts), 2);
    const alpha = Math.max(0.35, Math.min(4.0, ratio2 - 1.0));
    Vb = Math.max(10, Math.round((Vas / alpha) * 10) / 10);
    const fc = Fs * Math.sqrt(1 + Vas / Vb);
    const qtcActual = Qts * Math.sqrt(1 + Vas / Vb);
    hpf = Math.max(18, Math.round(fc * (boxType === 'planar' ? 0.65 : 0.45)));
    alignDesc = `${boxType === 'planar' ? 'Planar Horn' : 'Caixa Selada'} · ${cfg.label} (Qtc=${qtcActual.toFixed(2)}, Fc=${fc.toFixed(1)} Hz)`;
  } else {
    const vbBase = Math.max(Vas * 0.35, Math.min(Vas * 2.2, 15.0 * Math.pow(Math.min(0.65, Math.max(0.25, Qts)), 2.8) * Vas));
    Vb = Math.max(15, Math.round(vbBase * cfg.kVol));
    const alpha = Vas / Vb;
    const fbOpt = Fs * Math.pow(alpha, 0.31);
    if (boxType === 'bp4') {
      Vr = Math.max(15, Math.round(Vb * 0.75));
      Vb = Math.max(15, Math.round(Vb * 0.65));
      const alphaR = Vas / Vr;
      const fcR = Fs * Math.sqrt(1.0 + alphaR);
      const fbOptBp4 = fcR;
      Fb = Math.round(Math.max(30, fbOptBp4 * cfg.kFb) * 10) / 10;
      keepAutoTune = (g === 'optimum');
      hpf = Math.max(22, Math.round(fcR * 0.65));
      alignDesc = `BP4 (VR=${Vr}L / VF=${Vb}L) · ${cfg.label}`;
    } else if (boxType === 'bp6') {
      const bp6Mode = document.getElementById('bp6Mode')?.value || 'parallel';
      Vr = Math.max(20, Math.round(Vb * 0.85));
      Vb = Math.max(15, Math.round(Vb * 0.60));
      const alphaR = Vas / Vr;
      const alphaF = Vas / Vb;
      const fbVrOpt = Math.max(18.0, Fs * Math.pow(Math.max(0.2, alphaR), 0.31) * 0.88);
      FbVr = Math.max(18, Math.round(fbVrOpt * (g === 'subext' ? 0.88 : 1.0) * 10) / 10);
      const baseRatio = (bp6Mode === 'series') ? 1.65 : 1.80;
      const fbOptBp6 = Math.max(FbVr * baseRatio, FbVr * (baseRatio - 0.12 + 0.18 * Math.pow(Math.max(0.25, alphaF), 0.31)));
      Fb = Math.round(Math.max(FbVr * 1.55, fbOptBp6 * cfg.kFb) * 10) / 10;
      keepAutoTune = (g === 'optimum');
      hpf = Math.max(20, Math.round(FbVr * 0.78));
      alignDesc = `BP6 ${bp6Mode === 'series' ? 'Série' : 'Paralela'} (${FbVr}/${Fb} Hz) · ${cfg.label}`;
    } else {
      Fb = Math.round(Math.max(24, fbOpt * cfg.kFb) * 10) / 10;
      if (g === 'subext') Fb = Math.min(40, Math.max(30, Fb));
      keepAutoTune = (g === 'optimum');
      hpf = Math.max(20, Math.round(Fb * 0.78));
      alignDesc = `Bass-Reflex · ${cfg.label}`;
    }

    const no_frac = (4.0 * Math.PI * Math.PI / Math.pow(c, 3)) * (Math.pow(Fs, 3) * (Vas / 1000.0) / Qes);
    const spMinM2 = Math.max(0.8 * Fb * Sd * (Xmax / 1000.0), (4.540262351285604 * Math.sqrt(no_frac * Pe)) / (cfg.vel * Fb));
    const spMinCm2 = spMinM2 * 10000.0;

    if (portPref === 'triangle') {
      portType = 'triangle';
      triCount = 2;
      const side = Math.max(8, Math.ceil(Math.sqrt(spMinCm2)));
      triA = side; triB = side;
      const pg = computePortGeometry({ portType, triCount, triA, triB, Fb, Vb, c });
      LvCm = pg.LvCm; fPipe1 = pg.fPipe1;
      airVel = 4.540262351285604 * Math.sqrt(no_frac * Pe) / (pg.Sp * Fb);
    } else if (portPref === 'slot_wall') {
      portType = 'slot_wall';
      slotW = Math.max(20, Math.round(Math.sqrt(spMinCm2 * 5.0)));
      slotH = Math.max(3.5, Math.round((spMinCm2 / slotW) * 2) / 2);
      const pg = computePortGeometry({ portType, slotW, slotH, slotWallThick: 18, Fb, Vb, c });
      LvCm = pg.LvCm; fPipe1 = pg.fPipe1;
      airVel = 4.540262351285604 * Math.sqrt(no_frac * Pe) / (pg.Sp * Fb);
    } else {
      portType = 'round';
      const diaOpts = [3, 4, 6];
      let chosen = { n: 2, d: 6 };
      outer: for (const d of diaOpts) {
        const a1 = Math.PI * Math.pow((d * 2.54) / 2, 2);
        for (let n = 1; n <= 4; n++) {
          if (n * a1 >= spMinCm2) { chosen = { n, d }; break outer; }
        }
      }
      numDucts = chosen.n; ductDia = chosen.d;
      const pg = computePortGeometry({ portType, numDucts, ductDia, ductThick: 1.5, Fb, Vb, c });
      LvCm = pg.LvCm; fPipe1 = pg.fPipe1;
      airVel = 4.540262351285604 * Math.sqrt(no_frac * Pe) / (pg.Sp * Fb);
    }
  }

  return { boxType, Vb, Vr, Fb, FbVr, hpf, portType, numDucts, ductDia, slotW, slotH, triCount, triA, triB, LvCm, airVel, fPipe1, EBP, Qts, nDrivers, alignDesc, warnNote, keepAutoTune };
}

function updateWizardPreview() {
  activeWizardPlan = computeWizardPlan();
  const p = activeWizardPlan;
  const drvEl = document.getElementById('wizDriverSummary');
  const prevEl = document.getElementById('wizPreviewBox');
  const sel = document.getElementById('driverPreset');
  const dName = sel && sel.selectedIndex >= 0 ? sel.options[sel.selectedIndex].text : 'Driver Atual';
  if (drvEl) {
    const ebpVerdict = p.EBP < 50 ? 'Ideal p/ Selada ou BP4' : (p.EBP <= 85 ? 'Versátil (Dutada / BP4 / Planar)' : 'Ideal p/ Dutada, BP6 ou Planar');
    drvEl.innerHTML =
      `<div><b>Transdutor:</b> ${dName} (${p.nDrivers}x)</div>` +
      `<div><b>Diagnóstico EBP:</b> <span style="color:var(--accent);font-weight:700;">${p.EBP.toFixed(1)} Hz</span> | <b>Qts:</b> ${p.Qts.toFixed(3)} ➔ <span style="color:#4ade80;">${ebpVerdict}</span></div>`;
  }
  if (prevEl) {
    if (p.boxType === 'sealed' || p.boxType === 'planar') {
      prevEl.innerHTML =
        `<div><b>Alinhamento Sugerido:</b> ${p.alignDesc}</div>` +
        `<div><b>Volume Útil (Vb):</b> <span style="color:#fff;font-weight:700;">${p.Vb.toFixed(1)} L</span> | <b>HPF Protetor:</b> ${p.hpf} Hz</div>` +
        (p.warnNote ? `<div style="color:#fde68a;margin-top:4px;">${p.warnNote}</div>` : '');
    } else {
      const dutoTxt = p.portType === 'triangle'
        ? `${p.triCount}× Triângulo ${p.triA}×${p.triB} cm (Lv = ${p.LvCm.toFixed(1)} cm)`
        : (p.portType === 'slot_wall'
          ? `Duto Régua em Parede ${p.slotW}×${p.slotH} cm (Lv = ${p.LvCm.toFixed(1)} cm)`
          : `${p.numDucts}× Cilíndrico ${p.ductDia}" (Lv = ${p.LvCm.toFixed(1)} cm)`);
      prevEl.innerHTML =
        `<div><b>Alinhamento Sugerido:</b> ${p.alignDesc}</div>` +
        `<div><b>Volume &amp; Sintonia:</b> <span style="color:#fff;font-weight:700;">${(p.boxType==='bp4'||p.boxType==='bp6') ? `VR=${p.Vr}L / VF=${p.Vb}L` : `Vb=${p.Vb.toFixed(1)}L`} @ Fb=${p.Fb.toFixed(1)} Hz</span> | <b>HPF:</b> ${p.hpf} Hz</div>` +
        `<div><b>Duto Calculado:</b> ${dutoTxt}</div>` +
        `<div><b>Aerodinâmica:</b> Vel. Ar = <b>${p.airVel.toFixed(1)} m/s</b> | Tubo de Órgão f₁ = <b>${p.fPipe1.toFixed(0)} Hz</b></div>` +
        (p.warnNote ? `<div style="color:#fde68a;margin-top:4px;">${p.warnNote}</div>` : '');
    }
  }
}

function applyWizardRecommendation() {
  if (!activeWizardPlan) activeWizardPlan = computeWizardPlan();
  const p = activeWizardPlan;
  document.getElementById('boxType').value = p.boxType;
  document.getElementById('vbInput').value = p.Vb;
  const vbR = document.getElementById('vbRange');
  if (vbR) {
    if (p.Vb > parseFloat(vbR.max)) vbR.max = Math.ceil(p.Vb * 1.3);
    if (p.Vb < parseFloat(vbR.min)) vbR.min = Math.max(5, Math.floor(p.Vb * 0.7));
    vbR.value = p.Vb;
  }
  document.getElementById('hpfCutoff').value = p.hpf;
  if (p.boxType === 'bp4' || p.boxType === 'bp6') {
    const vrEl = document.getElementById('vrInput');
    if (vrEl) vrEl.value = p.Vr;
    if (p.boxType === 'bp6') {
      const fbVrEl = document.getElementById('fbVrInput');
      if (fbVrEl) fbVrEl.value = p.FbVr;
    }
  }
  if (p.boxType === 'bass-reflex' || p.boxType === 'bp4' || p.boxType === 'bp6') {
    document.getElementById('fbInput').value = p.Fb;
    syncSliderRange('fbRange', p.Fb, 10);
    document.getElementById('portType').value = p.portType;
    if (p.portType === 'triangle') {
      document.getElementById('triCount').value = p.triCount;
      document.getElementById('triA').value = p.triA;
      document.getElementById('triB').value = p.triB;
    } else if (p.portType === 'slot_wall') {
      document.getElementById('slotW').value = p.slotW;
      document.getElementById('slotH').value = p.slotH;
    } else {
      document.getElementById('numDucts').value = p.numDucts;
      document.getElementById('ductDia').value = p.ductDia;
    }
    setTuningMode(!!p.keepAutoTune);
  } else {
    recalculate();
  }
  closeConfigModals();
}

function openChartContextMenu(e, chartId) {
  e.preventDefault();
  closeAllMenus();
  ctxTargetChartId = chartId || 'G4';
  const menu = document.getElementById('chartContextMenu');
  const clrBtn = document.getElementById('ctxClearA');
  if (!menu) return;
  if (clrBtn) clrBtn.style.display = referenceSnapshot ? 'flex' : 'none';
  menu.classList.add('open');
  const mx = Math.min(window.innerWidth - 235, e.clientX);
  const my = Math.min(window.innerHeight - 210, e.clientY);
  menu.style.left = Math.max(8, mx) + 'px';
  menu.style.top = Math.max(8, my) + 'px';
}

function closeChartContextMenu() {
  const menu = document.getElementById('chartContextMenu');
  if (menu) menu.classList.remove('open');
}

function ctxAction(action) {
  closeChartContextMenu();
  if (action === 'expand') openExpandedChart(ctxTargetChartId);
  else if (action === 'freezeA') captureSnapshotA();
  else if (action === 'clearA') clearSnapshotA();
  else if (action === 'autoScale') toggleChartOpt('autoScaleY');
  else if (action === 'prefs') openConfigModal('modalGraphPrefs');
  else if (action === 'exportPng') {
    const sel = document.getElementById('expandedSelect');
    if (sel) sel.value = ctxTargetChartId;
    exportExpandedPNG();
  }
}

document.addEventListener('click', e => {
  if (!e.target.closest || (!e.target.closest('.menu-item') && !e.target.closest('#chartContextMenu'))) {
    closeAllMenus();
  }
});

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    closeAllMenus();
    closeConfigModals();
    if (pinnedCrosshairFreq != null) {
      pinnedCrosshairFreq = null;
      drawAllCharts();
      renderExpanded();
    }
    return;
  }
  if (e.ctrlKey && e.key.toLowerCase() === 's') { e.preventDefault(); exportProjectJson(); return; }
  if (e.ctrlKey && e.key.toLowerCase() === 'o') { e.preventDefault(); document.getElementById('projJsonInput')?.click(); return; }
  if (e.ctrlKey && e.key.toLowerCase() === 'n') { e.preventDefault(); resetCurrentProject(); return; }
  if (e.key === 'F1') { e.preventDefault(); openConfigModal('modalShortcuts'); return; }
  if (e.key === 'F2') { e.preventDefault(); openConfigModal('modalDriver'); return; }
  if (e.key === 'F3') { e.preventDefault(); openConfigModal('modalBox'); return; }
  if (e.key === 'F4') { e.preventDefault(); openConfigModal('modalEnv'); return; }
  if (e.key === 'F6') { e.preventDefault(); openWizardModal(); return; }
  if (e.key === 'F7') { e.preventDefault(); openConfigModal('modalGraphPrefs'); return; }
  if (e.key === 'F8') { e.preventDefault(); captureSnapshotA(); return; }
  if (e.key === 'F9') { e.preventDefault(); toggleQuickSidebar(); return; }
  const tag = (e.target && e.target.tagName) || '';
  if (['INPUT', 'SELECT', 'TEXTAREA'].includes(tag)) return;
  if (e.key === '1') switchTab('grid');
  else if (e.key === '2') switchTab('expanded');
  else if (e.key === '3') switchTab('woodlock');
  else if (e.key === '4') switchTab('electrical');
  else if (e.key === '5') switchTab('audit');
  else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
    e.preventDefault();
    const fMin = chartOpts.fMin || 10;
    const fMax = chartOpts.fMax || 1000;
    const dir = (e.key === 'ArrowRight') ? 1 : -1;
    if (pinnedCrosshairFreq == null) {
      const m = (currentCurves && currentCurves.meta) || {};
      const seed = m.Fb || m.fc || m.Fs || Math.sqrt(fMin * fMax);
      pinnedCrosshairFreq = Math.min(fMax, Math.max(fMin, seed));
    } else if (e.ctrlKey || e.altKey) {
      pinnedCrosshairFreq = Math.min(fMax, Math.max(fMin, +(pinnedCrosshairFreq + dir * 0.1).toFixed(2)));
    } else {
      const frac = e.shiftKey ? 0.05 : 0.01;
      const factor = Math.pow(fMax / fMin, frac);
      pinnedCrosshairFreq = Math.min(fMax, Math.max(fMin, dir > 0 ? pinnedCrosshairFreq * factor : pinnedCrosshairFreq / factor));
    }
    drawAllCharts();
    renderExpanded();
  } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
    const expTab = document.getElementById('tabExpanded');
    const sel = document.getElementById('expandedSelect');
    if (expTab && expTab.style.display === 'flex' && sel && sel.options.length > 0) {
      e.preventDefault();
      const len = sel.options.length;
      const cur = sel.selectedIndex >= 0 ? sel.selectedIndex : 0;
      const delta = (e.key === 'ArrowDown') ? 1 : -1;
      sel.selectedIndex = (cur + delta + len) % len;
      renderExpanded();
    }
  } else if ((e.key === 'Home' || e.key === 'End') && pinnedCrosshairFreq != null) {
    e.preventDefault();
    pinnedCrosshairFreq = (e.key === 'Home') ? (chartOpts.fMin || 10) : (chartOpts.fMax || 1000);
    drawAllCharts();
    renderExpanded();
  }
});

let _bfResizeTimer = null;
function scheduleViewportRedraw() {
  if (_bfResizeTimer) clearTimeout(_bfResizeTimer);
  _bfResizeTimer = setTimeout(() => {
    requestAnimationFrame(() => {
      drawAllCharts();
      renderExpanded();
      updateWoodlock();
    });
  }, 60);
}

window.onload = () => { initUI(); };
window.addEventListener('resize', scheduleViewportRedraw);
document.addEventListener('fullscreenchange', scheduleViewportRedraw);