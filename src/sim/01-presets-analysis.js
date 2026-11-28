"use strict";

// ============================================================================
// PRESETS DE DRIVERS
// ============================================================================
const PRESETS = {
  oversound: {
    name: "Oversound 18 SUB 800 XT", dia: 18,
    Fs: 40.0, Qms: 7.2, Qes: 0.446, Re: 5.1, Sd: 1186, Vas: 185,
    Xmax: 9.8, Pe: 800, Vsub: 9.0, type: "bass-reflex", Vb: 130, Fb: 44.62,
    numDucts: 2, ductDia: 6.0, ductThick: 1.5, hpf: 36.0
  },
  alumapro: {
    name: "Alumapro Alchemy 12-8", dia: 12,
    Fs: 35.0, Qms: 6.3, Qes: 0.89, Re: 7.8, Sd: 527, Vas: 65.13,
    Xmax: 12.0, Pe: 300, Vsub: 2.0, type: "sealed", Vb: 85.0, Fb: 35.0,
    numDucts: 1, ductDia: 4.0, ductThick: 1.5, hpf: 20.0
  },
  kicker: {
    name: "Kicker Comp 12", dia: 12,
    Fs: 32.06, Qms: 8.111, Qes: 1.902, Re: 3.8, Sd: 531, Vas: 79.3,
    Xmax: 6.6, Pe: 300, Vsub: 3.1, type: "sealed", Vb: 176.3, Fb: 32.0,
    numDucts: 1, ductDia: 4.0, ductThick: 1.5, hpf: 20.0
  },
  jbl: {
    name: "JBL 15SWT2200", dia: 15,
    Fs: 41.0, Qms: 10.32, Qes: 0.48, Re: 3.39, Sd: 814, Vas: 105,
    Xmax: 9.5, Pe: 1100, Vsub: 6.5, type: "bass-reflex", Vb: 102.6, Fb: 47.9,
    numDucts: 3, ductDia: 4.0, ductThick: 1.5, hpf: 40.0
  },
  jbl_opt_c: {
    name: "JBL 15SWT2200 (Opção C — 85L @ 48Hz)", dia: 15,
    Fs: 41.0, Qms: 16.32, Qes: 0.45, Re: 3.4, Sd: 814, Vas: 76.3,
    Xmax: 10.6, Pe: 1100, Vsub: 6.5, type: "bass-reflex", Vb: 85.0, Fb: 48.0,
    ql: 7.0, temp: 25, numDucts: 3, ductDia: 3.937, ductThick: 1.5, hpf: 38.0,
    manualTune: true
  },
  eighteen: {
    name: "18 Sound 18W1300", dia: 18,
    Fs: 35.0, Qms: 7.0, Qes: 0.31, Re: 5.0, Sd: 1225, Vas: 290,
    Xmax: 9.0, Pe: 600, Vsub: 8.5, type: "bass-reflex", Vb: 150, Fb: 44.95,
    numDucts: 2, ductDia: 6.0, ductThick: 1.5, hpf: 35.0
  },
  dayton: {
    name: "Dayton Audio UMII12-22", dia: 12,
    Fs: 31.0, Qms: 2.75, Qes: 0.71, Re: 4.2, Sd: 505, Vas: 42,
    Xmax: 19.0, Pe: 800, Vsub: 3.8, type: "bass-reflex", Vb: 70, Fb: 30.0,
    numDucts: 1, ductDia: 4.0, ductThick: 1.5, hpf: 25.0
  }
};

const CHARTS_INFO = [
  { id: 'G1',  key: 'G1_MaxPower',      title: '#1 Max Power (Watts RMS)',     unit: 'W',   kind: 'linear', nonNeg: true,  decimals: 0, min: 0,    max: 4000, color: '#ef4444' },
  { id: 'G2',  key: 'G2_VentSPL',       title: '#2 Vent SPL (dB-SPL)',         unit: 'dB',  kind: 'db',     nonNeg: false, decimals: 0, min: 80,   max: 150,  color: '#f97316' },
  { id: 'G3',  key: 'G3_FreeAirZ',      title: '#3 Free Air Impedance (Ohms)', unit: 'Ω',   kind: 'linear', nonNeg: true,  decimals: 1, min: 0,    max: 100,  color: '#dc2626' },
  { id: 'G4',  key: 'G4_NormAmp',       title: '#4 Normalized Amplitude (dB)', unit: 'dB',  kind: 'db',     nonNeg: false, decimals: 1, min: -18,  max: 12,   color: '#38bdf8' },
  { id: 'G5',  key: 'G5_SPLinCar',      title: '#5 SPL in Car (dB-SPL)',       unit: 'dB',  kind: 'db',     nonNeg: false, decimals: 0, min: 90,   max: 160,  color: '#e11d48' },
  { id: 'G6',  key: 'G6_SPLThermic',    title: '#6 SPL Thermic (dB)',          unit: 'dB',  kind: 'db',     nonNeg: false, decimals: 0, min: 80,   max: 150,  color: '#dc2626' },
  { id: 'G7',  key: 'G7_CabinGain',     title: '#7 Cabin Gain Acoplado (dB)',  unit: 'dB',  kind: 'db',     nonNeg: false, decimals: 0, min: -6,   max: 30,   color: '#fb923c' },
  { id: 'G8',  key: 'G8_ConeExcursion', title: '#8 Cone Excursion (mm)',       unit: 'mm',  kind: 'linear', nonNeg: true,  decimals: 1, min: 0,    max: 40,   color: '#a855f7' },
  { id: 'G9',  key: 'G9_PortAirVel',    title: '#9 Port Air Velocity (m/s)',   unit: 'm/s', kind: 'linear', nonNeg: true,  decimals: 1, min: 0,    max: 60,   color: '#f43f5e' },
  { id: 'G10', key: 'G10_ConeSPL',      title: '#10 Cone SPL (dB-SPL)',        unit: 'dB',  kind: 'db',     nonNeg: false, decimals: 0, min: 80,   max: 150,  color: '#dc2626' },
  { id: 'G11', key: 'G11_InBoxZ',       title: '#11 In Box Impedance (Ohms)',  unit: 'Ω',   kind: 'linear', nonNeg: true,  decimals: 1, min: 0,    max: 60,   color: '#dc2626' },
  { id: 'G12', key: 'G12_Phase',        title: '#12 Fase Acústica (Graus)',    unit: '°',   kind: 'phase',  nonNeg: false, decimals: 0, min: -180, max: 180,  color: '#ea580c' },
  { id: 'G13', key: 'G13_GroupDelay',   title: '#13 Group Delay (ms)',         unit: 'ms',  kind: 'linear', nonNeg: true,  decimals: 1, min: 0,    max: 40,   color: '#14b8a6' }
];

// ============================================================================
// ANALYSIS ENGINE — REGISTRO ESTÁVEL, PERFIS DE AMBIENTE E RESTRIÇÕES FÍSICAS
// Camada pura de organização/interpretação. NÃO altera o Physics Core:
// nenhuma fórmula, nenhuma série de `currentCurves` e nenhum input do projeto
// são modificados ao alternar Architectural <-> Automotive.
// ============================================================================
const CHART_REGISTRY = (() => {
  const chartMeta = {
    G1:  { label: 'Max Power',            availability: 'calculated', constraint: 'power' },
    G2:  { label: 'Vent SPL',             availability: 'calculated' },
    G3:  { label: 'Free Air Impedance',   availability: 'calculated' },
    G4:  { label: 'Normalized Amplitude', availability: 'calculated' },
    G5:  { label: 'SPL in Car',           availability: 'modeled', constraint: 'cabin',
           modelNote: 'T_cabin 1D (F100 = c / L_carro) — cabine pressurizada, sem geometria 3D' },
    G6:  { label: 'SPL Thermic',          availability: 'calculated', constraint: 'thermal' },
    G7:  { label: 'Cabin Gain Acoplado',  availability: 'modeled', constraint: 'cabin',
           modelNote: 'G4 + T_cabin — resposta acoplada à cabine (não é o ganho de cabine isolado)' },
    G8:  { label: 'Cone Excursion',       availability: 'calculated', constraint: 'excursion' },
    G9:  { label: 'Port Air Velocity',    availability: 'calculated', constraint: 'portVelocity' },
    G10: { label: 'Cone SPL',             availability: 'calculated' },
    G11: { label: 'In Box Impedance',     availability: 'calculated' },
    G12: { label: 'Acoustic Phase',       availability: 'calculated' },
    G13: { label: 'Group Delay',          availability: 'calculated', constraint: 'groupDelay' }
  };
  const reg = {};
  CHARTS_INFO.forEach(c => {
    reg[c.id] = Object.assign({}, c, chartMeta[c.id] || { label: c.title, availability: 'calculated' });
  });
  // Modelo físico de sala (Waterhouse Boundary Loading + Modos Axiais/Tangenciais L×W×H + RT60)
  reg.SLOT_ROOM_GAIN = {
    id: 'SLOT_ROOM_GAIN', key: 'G14_RoomGain', label: 'Room Gain', unit: 'dB',
    title: 'Room Gain (dB)', kind: 'db', nonNeg: false, decimals: 1, min: -6, max: 18, color: '#38a3d1',
    availability: 'modeled',
    modelNote: 'Boundary Loading (Waterhouse) + Modos Axiais/Tangenciais (L×W×H, RT60)'
  };
  reg.SLOT_SPL_ROOM = {
    id: 'SLOT_SPL_ROOM', key: 'G15_SPLinRoom', label: 'SPL in Room', unit: 'dB-SPL',
    title: 'SPL in Room (dB-SPL)', kind: 'db', nonNeg: false, decimals: 0, min: 80, max: 150, color: '#e11d48',
    availability: 'modeled',
    modelNote: 'G6 SPL Thermic + G14 Room Gain (L×W×H, Posição e RT60)'
  };
  return reg;
})();

const ENV_PROFILES = {
  architectural: {
    id: 'architectural',
    label: 'Architectural',
    icon: '🏛️',
    description: 'Ambientes residenciais e profissionais: resposta acústica e qualidade sonora.',
    order: ['G4', 'G6', 'G8', 'G11', 'G9', 'G13', 'G1', 'G2', 'G12', 'G3', 'G10', 'SLOT_ROOM_GAIN', 'SLOT_SPL_ROOM']
  },
  automotive: {
    id: 'automotive',
    label: 'Automotive',
    icon: '🚗',
    description: 'Aplicação automotiva: pressão sonora e capacidade operacional.',
    order: ['G4', 'G6', 'G8', 'G11', 'G9', 'G13', 'G5', 'G7', 'G1', 'G2', 'G12', 'G3', 'G10']
  }
};

/**
 * Formata o título visual do card/seletor seguindo a numeração 1..13 do perfil ativo,
 * mantendo o prefixo original (#1..#13) em CHARTS_INFO apenas como controle interno.
 */
function formatChartDisplayTitle(entry, posIndex) {
  if (!entry) return '';
  const cleanTitle = String(entry.title || entry.label || entry.id).replace(/^#\d+\s+/, '');
  return (typeof posIndex === 'number' && posIndex >= 0) ? `#${posIndex + 1} ${cleanTitle}` : cleanTitle;
}

const ANALYSIS_THRESHOLDS = {
  portVelocityWarnRatio: 0.80,
  excursionWarnRatio: 0.90,
  powerWarnRatio: 0.95,
  groupDelayWarnMs: 20,
  thermalWarnDb: -1.0
};

const SEVERITY_RANK = { info: 1, warn: 2, critical: 3 };

function getAnalysisEnv() {
  return ENV_PROFILES[analysisEnv] ? analysisEnv : 'automotive';
}

function getAnalysisProfile(env) {
  return ENV_PROFILES[env] || ENV_PROFILES.automotive;
}

/** Varre uma série dentro da banda visível e devolve o extremo (max/min) e a frequência. */
function scanSeriesInBand(freqs, values, fLo, fHi, mode) {
  const res = { value: null, freq: null };
  if (!Array.isArray(freqs) || !Array.isArray(values)) return res;
  for (let i = 0; i < freqs.length; i++) {
    const f = freqs[i];
    if (f < fLo || f > fHi) continue;
    const v = values[i];
    if (!Number.isFinite(v)) continue;
    if (res.value === null || (mode === 'min' ? v < res.value : v > res.value)) {
      res.value = v;
      res.freq = f;
    }
  }
  return res;
}

/**
 * Avalia as restrições de engenharia obrigatórias (§4 da spec) sobre as séries
 * JÁ CALCULADAS. Função pura: não recalcula física, não escreve no DOM.
 * @returns {Array<{id,code,severity,badge,message,value,limit,freq}>}
 */
function evaluatePhysicalConstraints(curves, fMin, fMax) {
  const out = [];
  if (!curves || !Array.isArray(curves.frequencies) || !curves.frequencies.length) return out;
  const m = curves.meta || {};
  const fLo = Math.max(1, Number.isFinite(fMin) ? fMin : 10);
  const fHi = Number.isFinite(fMax) ? Math.max(fLo, fMax) : 1000;
  const tuneRef = (Number.isFinite(m.Fb) && m.Fb > 0) ? m.Fb
    : ((Number.isFinite(m.fc) && m.fc > 0) ? m.fc : fLo);
  const fUsefulLo = Math.min(fHi, Math.max(fLo, tuneRef));
  const T = ANALYSIS_THRESHOLDS;

  // 1. Cone Excursion vs Xmax (limite mecânico absoluto)
  const xmax = (Number.isFinite(m.Xmax) && m.Xmax > 0) ? m.Xmax : null;
  const exc = scanSeriesInBand(curves.frequencies, curves.G8_ConeExcursion, fLo, fHi, 'max');
  if (xmax && exc.value !== null) {
    const ratio = exc.value / xmax;
    if (ratio >= 1.0) {
      const isVentedBox = (m.boxType === 'bass-reflex' || m.boxType === 'bp4' || m.boxType === 'bp6' || m.boxType === 'planar');
      const noHpfRisk = isVentedBox && !(Number.isFinite(m.hpfHz) && m.hpfHz > 0);
      out.push({
        id: 'G8',
        code: 'EXCURSION_OVER_XMAX',
        subCode: noHpfRisk ? 'ELE_NO_HPF_XMAX_RISK' : null,
        severity: 'critical',
        noHpfProtection: noHpfRisk,
        badge: noHpfRisk ? `Xmax ${(ratio * 100).toFixed(0)}% (SEM HPF!)` : `Xmax ${(ratio * 100).toFixed(0)}%`,
        value: exc.value, limit: xmax, freq: exc.freq,
        message: noHpfRisk
          ? `Risco mecânico P0 (ELE-03): caixa ventilada sem filtro subsônico (HPF OFF) com excursão ${exc.value.toFixed(1)} mm > Xmax (${xmax.toFixed(1)} mm) em ${exc.freq.toFixed(0)} Hz — ative o HPF.`
          : `Excursão de ${exc.value.toFixed(1)} mm em ${exc.freq.toFixed(0)} Hz excede o Xmax de ${xmax.toFixed(1)} mm.`
      });
    } else if (ratio >= T.excursionWarnRatio) {
      out.push({
        id: 'G8', code: 'EXCURSION_NEAR_XMAX', severity: 'warn',
        badge: `Xmax ${(ratio * 100).toFixed(0)}%`, value: exc.value, limit: xmax, freq: exc.freq,
        message: `Excursão de ${exc.value.toFixed(1)} mm em ${exc.freq.toFixed(0)} Hz está em ${(ratio * 100).toFixed(0)}% do Xmax (${xmax.toFixed(1)} mm).`
      });
    }
  }

  // 2. Port Air Velocity vs limite laminar (5%/10% Mach)
  const velLimit = (Number.isFinite(m.velLimit) && m.velLimit > 0) ? m.velLimit : null;
  const vel = scanSeriesInBand(curves.frequencies, curves.G9_PortAirVel, fLo, fHi, 'max');
  if (velLimit && vel.value !== null && vel.value > 0.01) {
    const ratio = vel.value / velLimit;
    if (ratio >= 1.0) {
      out.push({
        id: 'G9', code: 'PORT_VELOCITY_OVER_LIMIT', severity: 'critical',
        badge: `${vel.value.toFixed(1)} m/s`, value: vel.value, limit: velLimit, freq: vel.freq,
        message: `Velocidade do ar de ${vel.value.toFixed(1)} m/s em ${vel.freq.toFixed(0)} Hz excede o limite de ${velLimit.toFixed(1)} m/s (turbulência/chuffing).`
      });
    } else if (ratio >= T.portVelocityWarnRatio) {
      out.push({
        id: 'G9', code: 'PORT_VELOCITY_NEAR_LIMIT', severity: 'warn',
        badge: `${vel.value.toFixed(1)} m/s`, value: vel.value, limit: velLimit, freq: vel.freq,
        message: `Velocidade do ar de ${vel.value.toFixed(1)} m/s em ${vel.freq.toFixed(0)} Hz está em ${(ratio * 100).toFixed(0)}% do limite laminar (${velLimit.toFixed(1)} m/s).`
      });
    }
  }

  // 3. Max Power limitada mecanicamente na banda útil (acima da sintonia)
  const pe = (Number.isFinite(m.Pe) && m.Pe > 0) ? m.Pe : null;
  const pw = scanSeriesInBand(curves.frequencies, curves.G1_MaxPower, fUsefulLo, fHi, 'min');
  if (pe && pw.value !== null && pw.value < pe * T.powerWarnRatio) {
    out.push({
      id: 'G1', code: 'POWER_MECH_LIMITED', severity: 'warn',
      badge: `${pw.value.toFixed(0)} W`, value: pw.value, limit: pe, freq: pw.freq,
      message: `Potência admissível cai a ${pw.value.toFixed(0)} W em ${pw.freq.toFixed(0)} Hz (limite mecânico por excursão, Pe = ${pe.toFixed(0)} W).`
    });
  }

  // 4. Compressão térmica ativa
  if (Number.isFinite(m.deltaT) && m.deltaT > 0) {
    const comp = Number.isFinite(m.powerCompDb) ? m.powerCompDb : 0;
    if (comp <= T.thermalWarnDb) {
      out.push({
        id: 'G6', code: 'THERMAL_COMPRESSION', severity: 'warn',
        badge: `${comp.toFixed(1)} dB`, value: comp, limit: T.thermalWarnDb, freq: null,
        message: `Compressão térmica de ${comp.toFixed(1)} dB com ΔT = +${m.deltaT} °C — o SPL térmico já está atenuado.`
      });
    } else {
      out.push({
        id: 'G6', code: 'THERMAL_ACTIVE', severity: 'info',
        badge: `+${m.deltaT} °C`, value: comp, limit: null, freq: null,
        message: `ΔT = +${m.deltaT} °C aplicado ao Re/Qes — compressão de ${comp.toFixed(2)} dB (abaixo do limiar de alerta).`
      });
    }
  }

  // 5. Group Delay na banda útil
  const gd = scanSeriesInBand(curves.frequencies, curves.G13_GroupDelay, fUsefulLo, fHi, 'max');
  if (gd.value !== null && gd.value > T.groupDelayWarnMs) {
    out.push({
      id: 'G13', code: 'GROUP_DELAY_HIGH', severity: 'warn',
      badge: `${gd.value.toFixed(0)} ms`, value: gd.value, limit: T.groupDelayWarnMs, freq: gd.freq,
      message: `Atraso de grupo de ${gd.value.toFixed(1)} ms em ${gd.freq.toFixed(0)} Hz acima do limiar audível de ${T.groupDelayWarnMs} ms.`
    });
  }

  // 6. Validação DSP P0 (ELE-01: HPF >= LPF | ELE-02: fc <= 0 ou >= 20 kHz)
  if (Array.isArray(m.dspIssues) && m.dspIssues.length) {
    m.dspIssues.forEach(di => out.push(di));
  }

  // 7. Asserção pós-varredura de passividade elétrica (FIS-07: |Z(f)| >= Re(T))
  if (m.passivityOk === false) {
    out.push({
      id: 'G11', code: 'FIS_PASSIVITY_VIOLATION', severity: 'critical',
      badge: '|Z| < Re', value: m.minZMag, limit: m.Re, freq: null,
      message: `Violação de passividade (FIS-07): impedância mínima |Z| (${Number.isFinite(m.minZMag) ? m.minZMag.toFixed(2) : 'NaN'} Ω) abaixo de Re(T) (${Number.isFinite(m.Re) ? m.Re.toFixed(2) : '—'} Ω).`
    });
  }

  // 8. Estresse SOA no amplificador (ELE-05: EPDR < 0.5*Znom ou < 1.0 Ω)
  if (Number.isFinite(m.minEpdrVal) && m.minEpdrVal > 0 && m.minEpdrVal < 1e8) {
    const epdrLimit = Math.max(1.0, (Number.isFinite(m.zNom) && m.zNom > 0) ? 0.5 * m.zNom : 1.0);
    if (m.minEpdrVal < epdrLimit) {
      out.push({
        id: 'G11', code: 'ELE_EPDR_SOA_STRESS', severity: 'warn',
        badge: `EPDR ${m.minEpdrVal.toFixed(2)}Ω`, value: m.minEpdrVal, limit: epdrLimit,
        freq: Number.isFinite(m.minEpdrFreq) ? m.minEpdrFreq : null,
        message: `Estresse SOA no amplificador (ELE-05): EPDR mínimo de ${m.minEpdrVal.toFixed(2)} Ω abaixo do limiar seguro (${epdrLimit.toFixed(2)} Ω).`
      });
    }
  }

  // 9. Ressonância longitudinal de tubo de órgão baixa (CAD-07: fPipe1 < 400 Hz)
  const isVentedPipe = (m.boxType === 'bass-reflex' || m.boxType === 'bp4' || m.boxType === 'bp6');
  if (isVentedPipe && Number.isFinite(m.fPipe1) && m.fPipe1 > 0 && m.fPipe1 < 400) {
    out.push({
      id: 'G9', code: 'PORT_ORGAN_PIPE_RESONANCE', severity: 'warn',
      badge: `f₁ ${m.fPipe1.toFixed(0)}Hz`, value: m.fPipe1, limit: 400, freq: m.fPipe1,
      message: `Ressonância longitudinal de tubo de órgão baixa (CAD-07): f₁ = ${m.fPipe1.toFixed(0)} Hz (< 400 Hz) pode colorir a banda útil.`
    });
  }

  // 10. Razão de aspecto excessiva no duto régua (CAD-07: slot AR > 8:1)
  if (Number.isFinite(m.slotAR) && m.slotAR > 8.0) {
    out.push({
      id: 'G9', code: 'PORT_SLOT_AR_HIGH', severity: 'warn',
      badge: `AR ${m.slotAR.toFixed(1)}:1`, value: m.slotAR, limit: 8.0, freq: null,
      message: `Razão de aspecto excessiva no duto régua (CAD-07): ${m.slotAR.toFixed(1)}:1 (> 8:1) aumenta perdas viscosas e turbulência.`
    });
  }

  return out;
}

/** Aplica os badges de restrição nos cabeçalhos dos cards (pior severidade por gráfico). */
function updateChartConstraintBadges(constraints) {
  const worst = {};
  (constraints || []).forEach(item => {
    const cur = worst[item.id];
    if (!cur || (SEVERITY_RANK[item.severity] || 0) > (SEVERITY_RANK[cur.severity] || 0)) worst[item.id] = item;
  });
  CHARTS_INFO.forEach(cfg => {
    const el = document.getElementById('badge_' + cfg.id);
    if (!el) return;
    const hit = worst[cfg.id];
    if (!hit) {
      el.style.display = 'none';
      el.textContent = '';
      el.className = 'chart-alert';
      el.setAttribute('title', '');
      return;
    }
    const icon = hit.severity === 'critical' ? '⛔' : (hit.severity === 'warn' ? '⚠️' : 'ℹ️');
    el.style.display = 'inline-flex';
    el.className = 'chart-alert chart-alert-' + hit.severity;
    el.textContent = icon + ' ' + hit.badge;
    el.setAttribute('title', hit.message);
  });
}

/** Monta a grade de gráficos na ordem do perfil ativo (por ID estável, nunca por índice). */
function buildChartGridForEnv() {
  const grid = document.getElementById('tabGrid');
  if (!grid) return;
  const profile = getAnalysisProfile(getAnalysisEnv());
  grid.innerHTML = '';
  profile.order.forEach((slotId, posIndex) => {
    const entry = CHART_REGISTRY[slotId];
    if (!entry) return;
    const displayTitle = formatChartDisplayTitle(entry, posIndex);
    const box = document.createElement('div');
    if (entry.availability === 'unimplemented') {
      box.className = 'chart-box chart-box-placeholder';
      box.setAttribute('data-chart-id', entry.id);
      box.setAttribute('data-chart-pos', String(posIndex + 1));
      box.innerHTML = `
        <div class="chart-header">
          <span class="chart-title">${displayTitle}</span>
          <span class="chart-alert chart-alert-info">N/D</span>
        </div>
        <div class="chart-placeholder-body">
          <b>${entry.placeholder}</b>
          <small>${entry.placeholderDetail}</small>
        </div>
      `;
      grid.appendChild(box);
      return;
    }
    box.className = 'chart-box';
    box.setAttribute('data-chart-id', entry.id);
    box.setAttribute('data-chart-pos', String(posIndex + 1));
    box.innerHTML = `
      <div class="chart-header" style="cursor:pointer;" title="Clique para abrir em tela expandida" onclick="openExpandedChart('${entry.id}')">
        <span class="chart-title">${displayTitle}</span>
        <span style="display:flex; align-items:center; gap:5px;">
          <span class="chart-alert" id="badge_${entry.id}" style="display:none;"></span>
          <button type="button" class="chart-expand-btn" aria-label="Expandir ${displayTitle}">⤢</button>
        </span>
      </div>
      <canvas id="cv_${entry.id}" class="chart-canvas" ondblclick="openExpandedChart('${entry.id}')"></canvas>
      <div class="chart-info" id="info_${entry.id}"><span>Pico: --</span><span>Passe o cursor · Duplo-clique ⤢</span></div>
    `;
    grid.appendChild(box);
  });
  syncExpandedSelectForEnv();
}

/** Reordena o seletor do modo Expandido pelo perfil ativo (séries calculadas). */
function syncExpandedSelectForEnv() {
  const sel = document.getElementById('expandedSelect');
  if (!sel) return;
  const prev = sel.value;
  const profile = getAnalysisProfile(getAnalysisEnv());
  const ordered = profile.order.filter(id => CHART_REGISTRY[id] && CHART_REGISTRY[id].availability !== 'unimplemented');
  // Séries calculadas fora do perfil continuam acessíveis na análise individual
  CHARTS_INFO.forEach(c => { if (ordered.indexOf(c.id) === -1) ordered.push(c.id); });
  sel.innerHTML = '';
  ordered.forEach(id => {
    const opt = document.createElement('option');
    opt.value = id;
    const posIndex = profile.order.indexOf(id);
    opt.textContent = formatChartDisplayTitle(CHART_REGISTRY[id], posIndex >= 0 ? posIndex : null);
    sel.appendChild(opt);
  });
  sel.value = ordered.indexOf(prev) !== -1 ? prev : (ordered.indexOf('G4') !== -1 ? 'G4' : ordered[0]);
}

/**
 * Alterna o ambiente de análise. NUNCA chama recalculate(), NUNCA altera inputs
 * do projeto: apenas reordena a apresentação e reavalia os critérios.
 */
function setAnalysisEnvironment(env, opts = {}) {
  analysisEnv = ENV_PROFILES[env] ? env : 'automotive';
  const isArch = (analysisEnv === 'architectural');
  document.querySelectorAll('[data-env-btn]').forEach(b => {
    b.classList.toggle('active', b.getAttribute('data-env-btn') === analysisEnv);
  });
  const rowCab = document.getElementById('rowCabinLen');
  const roomCtrls = document.getElementById('roomControls');
  if (rowCab) rowCab.style.display = isArch ? 'none' : '';
  if (roomCtrls) roomCtrls.style.display = isArch ? 'flex' : 'none';
  if (opts.skipRender) return analysisEnv;
  buildChartGridForEnv();
  if (currentCurves) {
    drawAllCharts();
    renderExpanded();
  }
  return analysisEnv;
}

let currentCurves = null;
let referenceSnapshot = null;
let isAutoTune = true;
let analysisEnv = 'automotive';
const chartOpts = {
  fMin: 10,
  fMax: 1000,
  autoScaleY: true,
  showMarkers: false,
  showLimits: true
};

function captureSnapshotA() {
  if (!currentCurves) return;
  const m = currentCurves.meta || {};
  const sel = document.getElementById('driverPreset');
  const dName = sel && sel.selectedIndex >= 0 ? sel.options[sel.selectedIndex].text.split('(')[0].trim() : 'Ref';
  const tuneTxt = m.boxType === 'bass-reflex'
    ? `${(m.Vb || 0).toFixed(0)}L @ ${(m.Fb || 0).toFixed(1)}Hz`
    : `Selada ${(m.Vb || 0).toFixed(0)}L`;
  const extra = (m.nDrivers > 1 ? ` ${m.nDrivers}x` : '') + (m.deltaT > 0 ? ` +${m.deltaT}°C` : '');
  const cloned = {};
  Object.values(CHART_REGISTRY).forEach(c => { if (c && c.key && currentCurves[c.key]) cloned[c.key] = Array.from(currentCurves[c.key]); });
  referenceSnapshot = {
    label: `Ref A: ${dName.slice(0, 18)} (${tuneTxt}${extra})`,
    shortLabel: 'Ref A',
    frequencies: Array.from(currentCurves.frequencies || []),
    curves: cloned,
    meta: { ...m }
  };
  const btnClr = document.getElementById('btnClearA');
  const badge = document.getElementById('snapshotABadge');
  const btnFrz = document.getElementById('btnFreezeA');
  const tbFrz = document.getElementById('tbFreezeA');
  if (btnClr) btnClr.style.display = 'inline-flex';
  if (btnFrz) btnFrz.classList.add('active');
  if (tbFrz) tbFrz.classList.add('active');
  if (badge) { badge.style.display = 'inline'; badge.textContent = referenceSnapshot.label; }
  const sbAB = document.getElementById('sbAB');
  if (sbAB) { sbAB.style.display = 'inline-flex'; sbAB.textContent = '📌 A/B Ativo'; }
  drawAllCharts();
  renderExpanded();
}

function clearSnapshotA() {
  referenceSnapshot = null;
  const btnClr = document.getElementById('btnClearA');
  const badge = document.getElementById('snapshotABadge');
  const btnFrz = document.getElementById('btnFreezeA');
  const tbFrz = document.getElementById('tbFreezeA');
  if (btnClr) btnClr.style.display = 'none';
  if (btnFrz) btnFrz.classList.remove('active');
  if (tbFrz) tbFrz.classList.remove('active');
  if (badge) { badge.style.display = 'none'; badge.textContent = ''; }
  const sbAB = document.getElementById('sbAB');
  if (sbAB) sbAB.style.display = 'none';
  drawAllCharts();
  renderExpanded();
}

function onSimNumDriversChange() {
  const n = parseInt(document.getElementById('simNumDrivers')?.value) || 1;
  const elSpk = document.getElementById('elNumSpk');
  if (elSpk && parseInt(elSpk.value) !== n) elSpk.value = n;
  updateFbLockButtonUI();
  if (isAutoTune && typeof runAutoDesignForCurrentState === 'function') {
    runAutoDesignForCurrentState('drivers', { enableHpfIfNeeded: false });
    return;
  }
  recalculate();
  autofixWoodlockGeometry(`alteração para ${n}× drivers`);
}

const PROJECT_FIELD_IDS = [
  'driverPreset', 'boxType', 'simNumDrivers', 'autoDesignProfile', 'vbInput', 'fbInput', 'vrInput', 'fbVrInput', 'qlInput', 'tempInput',
  'portType', 'numDucts', 'ductDia', 'ductThick', 'numDuctsVr', 'ductDiaVr', 'ductThickVr', 'slotW', 'slotH', 'slotWallThick', 'triCount', 'triA', 'triB',
  'cabinLen', 'roomLen', 'roomWid', 'roomHgt', 'roomPlacement', 'roomRt60',
  'hpfCutoff', 'hpfType', 'lpfCutoff', 'lpfType', 'thermalDeltaT',
  'tsFs', 'tsQes', 'tsQms', 'tsVas', 'tsRe', 'tsPe', 'tsSd', 'tsXmax', 'tsVsub',
  'tsLe', 'tsZnom', 'tsDia', 'tsCoils', 'tsMmsCat', 'tsBlCat',
  'wlShape', 'wlMountMode', 'wlSlotOrient', 'wlPortLayout', 'wlPortOffset', 'wlPortRouting', 'wlPlanarStyle', 'wlPlanarRecuoG', 'wlThickness', 'wlWidthA', 'wlHeightB', 'wlAngle', 'wlBattens', 'wlSheetPrice', 'wlWheelCut', 'wlTrunkW', 'wlTrunkH', 'wlTrunkD', 'wlMatrixCols', 'wlMatrixRows', 'wlWheelK', 'wlWheelH', 'wlWheelJ',
  'wlBraceFF', 'wlBraceTB', 'wlBraceLR', 'wlBraceCross', 'wlBraceBaffle', 'wlBraceRear', 'wlWheelArch', 'wlProtectBar', 'elDerate70',
  'elNumSpk', 'elCoils', 'elZCoil', 'elCoilMode', 'elSpkMode',
  'elAmpPower', 'elVbat', 'elPwrLen', 'elPwrGauge', 'elSpkLen', 'elSpkGauge',
  'elPreoutV', 'elLimProfile', 'elXoverHz', 'elLeMh', 'elMeasV'
];

function buildProjectPayload() {
  const fields = {};
  PROJECT_FIELD_IDS.forEach(id => {
    const el = document.getElementById(id);
    if (el) fields[id] = (el.type === 'checkbox') ? !!el.checked : el.value;
  });
  const sel = document.getElementById('driverPreset');
  const driverLabel = sel && sel.selectedIndex >= 0 ? sel.options[sel.selectedIndex].text : 'Projeto';
  return {
    schema: 'bassforge-project/v1',
    savedAt: new Date().toISOString(),
    name: driverLabel,
    isAutoTune,
    isHpfEnabled,
    isLpfEnabled,
    analysisEnv: getAnalysisEnv(),
    chartOpts: { ...chartOpts },
    validation: lastBuildPack ? {
      valid: lastBuildPack.validation.valid,
      criticalCount: lastBuildPack.validation.criticalCount,
      warnCount: lastBuildPack.validation.warnCount,
      issues: lastBuildPack.validation.issues
    } : null,
    fields
  };
}

function exportProjectJson() {
  const payload = buildProjectPayload();
  const driverLabel = payload.name;
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  const safe = driverLabel.replace(/[^a-zA-Z0-9_-]+/g, '_').slice(0, 32);
  a.download = `BassForge_Projeto_${safe}.json`;
  a.href = URL.createObjectURL(blob);
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1500);
}

function applyProjectData(proj, opts = {}) {
  if (!proj || !proj.fields) return false;
  PROJECT_FIELD_IDS.forEach(id => {
    const el = document.getElementById(id);
    if (!el || proj.fields[id] === undefined) return;
    if (el.type === 'checkbox') el.checked = !!proj.fields[id];
    else el.value = proj.fields[id];
  });
  const vb = parseFloat(proj.fields.vbInput);
  const fb = parseFloat(proj.fields.fbInput);
  const vbR = document.getElementById('vbRange');
  if (vbR && !isNaN(vb)) {
    if (vb > parseFloat(vbR.max)) vbR.max = Math.ceil(vb * 1.3);
    if (vb < parseFloat(vbR.min)) vbR.min = Math.max(5, Math.floor(vb * 0.7));
    vbR.value = vb;
  }
  const fbR = document.getElementById('fbRange');
  if (fbR && !isNaN(fb)) {
    if (fb > parseFloat(fbR.max)) fbR.max = Math.ceil(fb * 1.3);
    if (fb < parseFloat(fbR.min)) fbR.min = Math.max(10, Math.floor(fb * 0.7));
    fbR.value = fb;
  }
  const vr = parseFloat(proj.fields.vrInput);
  if (!isNaN(vr) && vr > 0) syncSliderRange('vrRange', vr, 5);
  const fbVr = parseFloat(proj.fields.fbVrInput);
  if (!isNaN(fbVr) && fbVr > 0) syncSliderRange('fbVrRange', fbVr, 15);
  if (typeof proj.isHpfEnabled === 'boolean') setHpfEnabled(proj.isHpfEnabled, false);
  if (typeof proj.isLpfEnabled === 'boolean') setLpfEnabled(proj.isLpfEnabled, false);
  setTuningMode(proj.isAutoTune !== false);
  if (typeof proj.analysisEnv === 'string' && ENV_PROFILES[proj.analysisEnv]) {
    analysisEnv = proj.analysisEnv;
  }
  if (proj.chartOpts && Number.isFinite(proj.chartOpts.fMin) && Number.isFinite(proj.chartOpts.fMax) && proj.chartOpts.fMax > proj.chartOpts.fMin) {
    chartOpts.fMin = proj.chartOpts.fMin;
    chartOpts.fMax = proj.chartOpts.fMax;
    const key = `${chartOpts.fMin}-${chartOpts.fMax}`;
    document.querySelectorAll('[data-freq-btn], [data-freq-btn-modal]').forEach(b => b.classList.remove('active'));
    document.querySelector(`[data-freq-btn="${key}"]`)?.classList.add('active');
    document.querySelector(`[data-freq-btn-modal="${key}"]`)?.classList.add('active');
  }
  if (!opts.skipAutofix) autofixWoodlockGeometry('abertura de projeto');
  setAnalysisEnvironment(getAnalysisEnv());
  return true;
}

function importProjectJsonFile(input) {
  const file = input.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const parsed = JSON.parse(e.target.result);
      if (parsed && parsed.schema === 'bassforge-project/v1' && parsed.fields) {
        applyProjectData(parsed);
        alert(`Projeto "${parsed.name || file.name}" restaurado com sucesso!`);
      } else {
        alert('Este arquivo não é um Projeto BassForge (bassforge-project/v1).');
      }
    } catch (err) {
      alert('Erro ao abrir projeto JSON: ' + err.message);
    } finally {
      input.value = '';
    }
  };
  reader.readAsText(file);
}

function setFreqRange(fMin, fMax, btnEl) {
  chartOpts.fMin = fMin;
  chartOpts.fMax = fMax;
  const key = `${fMin}-${fMax}`;
  document.querySelectorAll('[data-freq-btn], [data-freq-btn-modal]').forEach(b => b.classList.remove('active'));
  if (btnEl) btnEl.classList.add('active');
  else document.querySelector(`[data-freq-btn="${key}"]`)?.classList.add('active');
  document.querySelector(`[data-freq-btn-modal="${key}"]`)?.classList.add('active');
  drawAllCharts();
  renderExpanded();
}

function toggleChartOpt(key) {
  chartOpts[key] = !chartOpts[key];
  const map = {
    autoScaleY: 'btnAutoScaleY',
    showMarkers: 'btnShowMarkers',
    showLimits: 'btnShowLimits'
  };
  const btn = document.getElementById(map[key]);
  if (btn) btn.classList.toggle('active', chartOpts[key]);
  drawAllCharts();
  renderExpanded();
}

// ============================================================================
// CONTROLES DE SINTONIA E SLIDERS INTERATIVOS
// ============================================================================
function syncSliderRange(rangeId, val, minFloor = 10) {
  const r = document.getElementById(rangeId);
  if (!r || !Number.isFinite(val) || val <= 0) return;
  if (val > parseFloat(r.max)) r.max = Math.ceil(val * 1.25);
  if (val < parseFloat(r.min)) r.min = Math.max(minFloor, Math.floor(val * 0.75));
  r.value = val;
}

function updateFbLockButtonUI(boxTypeOverride) {
  const boxType = boxTypeOverride || document.getElementById('boxType')?.value || 'bass-reflex';
  const formulaHint = boxType === 'bp4'
    ? 'BP4 (VR+VF)'
    : (boxType === 'bp6' ? 'BP6 (VR+VF)' : 'Fb = Fs·α^0.31');
  ['fbLockBtn', 'fbVrLockBtn'].forEach(btnId => {
    const lockBtn = document.getElementById(btnId);
    if (!lockBtn) return;
    lockBtn.textContent = isAutoTune ? 'AUTO' : 'MAN';
    lockBtn.classList.toggle('manual', !isAutoTune);
    lockBtn.title = isAutoTune
      ? `Sintonia Automática (${formulaHint}) — clique para travar em Manual`
      : `Sintonia Manual — clique para voltar ao Automático (${formulaHint})`;
  });
}

let isHpfEnabled = false;
let isLpfEnabled = false;

// Motor de Filtros Ativos / DSP no Domínio Complexo s = jω (Polinômios Exatos de Laplace)
// BW e Bessel normalizados para -3.01 dB em fc; Linkwitz-Riley (cascata BW²) para -6.02 dB em fc.
const FILTER_ALIGNMENTS = {
  BW6:  { label: 'BW 6 dB/oit',  firstOrder: 1, biquads: [] },
  BW12: { label: 'BW 12 dB/oit', firstOrder: 0, biquads: [{ q: Math.SQRT1_2, s: 1.0 }] },
  LR12: { label: 'LR 12 dB/oit', firstOrder: 0, biquads: [{ q: 0.5, s: 1.0 }] },
  BS12: { label: 'BS 12 dB/oit', firstOrder: 0, biquads: [{ q: 1.0 / Math.sqrt(3.0), s: 1.27201965 }] },
  BW18: { label: 'BW 18 dB/oit', firstOrder: 1, biquads: [{ q: 1.0, s: 1.0 }] },
  BW24: { label: 'BW 24 dB/oit', firstOrder: 0, biquads: [{ q: 0.54119610, s: 1.0 }, { q: 1.30656296, s: 1.0 }] },
  LR24: { label: 'LR 24 dB/oit', firstOrder: 0, biquads: [{ q: Math.SQRT1_2, s: 1.0 }, { q: Math.SQRT1_2, s: 1.0 }] },
  BS24: { label: 'BS 24 dB/oit', firstOrder: 0, biquads: [{ q: 0.52193458, s: 1.43017156 }, { q: 0.80553828, s: 1.60335752 }] },
  BW36: { label: 'BW 36 dB/oit', firstOrder: 0, biquads: [{ q: 0.51763809, s: 1.0 }, { q: Math.SQRT1_2, s: 1.0 }, { q: 1.93185165, s: 1.0 }] },
  LR36: { label: 'LR 36 dB/oit', firstOrder: 2, biquads: [{ q: 1.0, s: 1.0 }, { q: 1.0, s: 1.0 }] },
  BW48: { label: 'BW 48 dB/oit', firstOrder: 0, biquads: [{ q: 0.50979558, s: 1.0 }, { q: 0.60134489, s: 1.0 }, { q: 0.89997622, s: 1.0 }, { q: 2.56291545, s: 1.0 }] },
  LR48: { label: 'LR 48 dB/oit', firstOrder: 0, biquads: [{ q: 0.54119610, s: 1.0 }, { q: 1.30656296, s: 1.0 }, { q: 0.54119610, s: 1.0 }, { q: 1.30656296, s: 1.0 }] }
};

function evalFilterComplex(f, fc, kind, alignCode = 'LR24') {
  if (!Number.isFinite(f) || !(f > 0) || !Number.isFinite(fc) || !(fc > 0) || fc >= 20000) {
    return { mag: 1.0, db: 0.0, phaseRad: 0.0, invalid: true };
  }
  const def = FILTER_ALIGNMENTS[alignCode] || FILTER_ALIGNMENTS.LR24;
  const isHp = (kind === 'hpf');
  const om = f / fc;
  let mag = 1.0;
  let phaseRad = 0.0;
  for (let i = 0; i < def.firstOrder; i++) {
    // LPF: 1 / (1 + j*om) | HPF: j*om / (1 + j*om)
    const denMag = Math.hypot(1.0, om);
    if (isHp) {
      mag *= om / denMag;
      phaseRad += (Math.PI * 0.5) - Math.atan2(om, 1.0);
    } else {
      mag *= 1.0 / denMag;
      phaseRad += -Math.atan2(om, 1.0);
    }
  }
  for (let i = 0; i < def.biquads.length; i++) {
    const bq = def.biquads[i];
    const u = isHp ? (om * bq.s) : (om / bq.s);
    const u2 = u * u;
    const dRe = 1.0 - u2;
    const dIm = u / bq.q;
    const dMag = Math.hypot(dRe, dIm);
    const dPhi = Math.atan2(dIm, dRe);
    if (isHp) {
      // HPF: -u^2 / ((1 - u^2) + j*(u/Q)) => arg(-u^2) = +pi
      mag *= u2 / Math.max(1e-12, dMag);
      phaseRad += Math.PI - dPhi;
    } else {
      // LPF: 1 / ((1 - u^2) + j*(u/Q))
      mag *= 1.0 / Math.max(1e-12, dMag);
      phaseRad += -dPhi;
    }
  }
  return {
    mag: Math.max(1e-9, mag),
    db: 20.0 * Math.log10(Math.max(1e-9, mag)),
    phaseRad
  };
}

function setHpfEnabled(enabled, shouldRecalc = true) {
  isHpfEnabled = !!enabled;
  const btn = document.getElementById('hpfToggleBtn');
  const inp = document.getElementById('hpfCutoff');
  const sel = document.getElementById('hpfType');
  if (btn) {
    btn.textContent = isHpfEnabled ? 'ON' : 'OFF';
    btn.style.color = isHpfEnabled ? 'var(--success)' : 'var(--text-muted)';
    btn.style.borderColor = isHpfEnabled ? 'rgba(46, 160, 112, 0.5)' : 'var(--border)';
    btn.style.background = isHpfEnabled ? 'rgba(46, 160, 112, 0.14)' : 'var(--bg-input)';
  }
  if (inp) inp.style.opacity = isHpfEnabled ? '1' : '0.45';
  if (sel) sel.style.opacity = isHpfEnabled ? '1' : '0.45';
  if (shouldRecalc) recalculate();
}

function toggleHpfEnabled() {
  setHpfEnabled(!isHpfEnabled);
}

function setLpfEnabled(enabled, shouldRecalc = true) {
  isLpfEnabled = !!enabled;
  const btn = document.getElementById('lpfToggleBtn');
  const inp = document.getElementById('lpfCutoff');
  const sel = document.getElementById('lpfType');
  if (btn) {
    btn.textContent = isLpfEnabled ? 'ON' : 'OFF';
    btn.style.color = isLpfEnabled ? 'var(--accent)' : 'var(--text-muted)';
    btn.style.borderColor = isLpfEnabled ? 'var(--accent-border)' : 'var(--border)';
    btn.style.background = isLpfEnabled ? 'var(--accent-muted)' : 'var(--bg-input)';
  }
  if (inp) inp.style.opacity = isLpfEnabled ? '1' : '0.45';
  if (sel) sel.style.opacity = isLpfEnabled ? '1' : '0.45';
  if (shouldRecalc) recalculate();
}

function toggleLpfEnabled() {
  setLpfEnabled(!isLpfEnabled);
}

function setTuningMode(auto) {
  isAutoTune = auto;
  const btnAuto = document.getElementById('btnAutoTune');
  const btnManual = document.getElementById('btnManualTune');
  const badge = document.getElementById('tuningModeBadge');
  const btnReset = document.getElementById('btnResetFb');

  if (isAutoTune) {
    if (btnAuto) btnAuto.classList.add('active');
    if (btnManual) btnManual.classList.remove('active');
    if (badge) {
      badge.textContent = '⚡ AUTO (α^0.31)';
      badge.style.background = 'rgba(34, 197, 94, 0.2)';
      badge.style.color = '#4ade80';
    }
    if (btnReset) btnReset.style.display = 'none';
  } else {
    if (btnManual) btnManual.classList.add('active');
    if (btnAuto) btnAuto.classList.remove('active');
    if (badge) {
      badge.textContent = '🛠️ MANUAL (Livre)';
      badge.style.background = 'rgba(234, 179, 8, 0.2)';
      badge.style.color = '#facc15';
    }
    if (btnReset) btnReset.style.display = 'inline-block';
  }
  updateFbLockButtonUI();
  recalculate();
}

function resetToOptimalFb() {
  setTuningMode(true);
}

function onVbRangeChange(val) {
  bpSynthClampNote = '';
  const vb = parseFloat(val);
  document.getElementById('vbInput').value = vb;
  document.getElementById('vbValBadge').textContent = vb.toFixed(1) + ' L';
  updateFbLockButtonUI();
  recalculate();
}

function onVbInputChange(val) {
  bpSynthClampNote = '';
  const vb = parseFloat(val);
  if (!isNaN(vb) && vb > 0) {
    syncSliderRange('vbRange', vb, 5);
    document.getElementById('vbValBadge').textContent = vb.toFixed(1) + ' L';
    recalculate();
  }
}

function onFbRangeChange(val) {
  bpSynthClampNote = '';
  const fb = parseFloat(val);
  document.getElementById('fbInput').value = fb;
  document.getElementById('fbValBadge').textContent = fb.toFixed(2) + ' Hz';
  if (isAutoTune) {
    setTuningMode(false);
  } else {
    recalculate();
  }
}

function onFbInputChange(val) {
  bpSynthClampNote = '';
  const fb = parseFloat(val);
  if (!isNaN(fb) && fb > 0) {
    syncSliderRange('fbRange', fb, 10);
    document.getElementById('fbValBadge').textContent = fb.toFixed(2) + ' Hz';
    if (isAutoTune) {
      setTuningMode(false);
    } else {
      recalculate();
    }
  }
}

function onVrRangeChange(val) {
  bpSynthClampNote = '';
  const vr = parseFloat(val);
  if (!isNaN(vr) && vr > 0) {
    const el = document.getElementById('vrInput');
    if (el) el.value = vr;
    recalculate();
  }
}

function onVrInputChange(val) {
  bpSynthClampNote = '';
  const vr = parseFloat(val);
  if (!isNaN(vr) && vr > 0) {
    syncSliderRange('vrRange', vr, 5);
    recalculate();
  }
}

function onFbVrRangeChange(val) {
  const fbVr = parseFloat(val);
  if (!isNaN(fbVr) && fbVr > 0) {
    const el = document.getElementById('fbVrInput');
    if (el) el.value = fbVr;
    if (isAutoTune) {
      setTuningMode(false);
    } else {
      recalculate();
    }
  }
}

function onFbVrInputChange(val) {
  const fbVr = parseFloat(val);
  if (!isNaN(fbVr) && fbVr > 0) {
    syncSliderRange('fbVrRange', fbVr, 15);
    if (isAutoTune) {
      setTuningMode(false);
    } else {
      recalculate();
    }
  }
}

function onBp6ModeChange() {
  recalculate();
  autofixWoodlockGeometry('acoplamento BP6', { resetToMin: true });
}
