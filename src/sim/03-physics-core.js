// ============================================================================
// MOTOR MATEMÁTICO COMPLETO EM ES6 (COM SLOT PORT, GROUP DELAY, MULTI-DRIVER & TÉRMICA)
// ============================================================================
function computeTopologySuitability({ EBP, Qts, dia }) {
  const d = parseFloat(dia) || 12;
  const big = d >= 8;
  const res = {
    sealed: { level: 'ok', reason: 'Compatível com caixa selada.' },
    'bass-reflex': { level: 'ok', reason: 'Compatível com dutada.' },
    bp4: { level: 'ok', reason: 'Compatível com Band-Pass 4ª ordem.' },
    bp6: { level: 'ok', reason: 'Compatível com Band-Pass 6ª ordem.' },
    planar: { level: 'ok', reason: 'Compatível com Planar Horn.' },
    'free-air': {
      level: Qts >= 0.50 ? 'ideal' : (Qts >= 0.40 ? 'ok' : 'avoid'),
      reason: Qts >= 0.50
        ? `Qts elevado (${Qts.toFixed(2)}): excelente em Baffle Infinito (Free-Air).`
        : (Qts >= 0.40 ? 'Compatível em Free-Air com controle de excursão / HPF.' : `Qts baixo (${Qts.toFixed(2)}): Free-Air exige alto controle mecânico / HPF.`)
    }
  };

  if (EBP < 50 || Qts > 0.55) {
    res.sealed = { level: 'ideal', reason: `Ideal (EBP ${EBP.toFixed(0)} / Qts ${Qts.toFixed(2)}): grave firme e controlado.` };
    res['bass-reflex'] = { level: EBP < 38 ? 'avoid' : 'ok', reason: EBP < 38 ? 'EBP muito baixo: dutada exigiria volume excessivo.' : 'Compatível em dutada com pico moderado.' };
    res.bp4 = { level: big ? 'ideal' : 'avoid', reason: big ? 'Ideal em BP4: câmara traseira selada controla o cone.' : 'BP4 recomendada para drivers ≥ 8".' };
    res.bp6 = { level: 'avoid', reason: 'BP6 exige motor mais forte (EBP > 80 / Qts < 0.45).' };
    res.planar = { level: 'avoid', reason: 'Planar Horn exige maior força de motor (EBP ≥ 65).' };
  } else if (EBP <= 85) {
    res.sealed = { level: 'ok', reason: 'Compatível em selada (resposta plana e compacta).' };
    res['bass-reflex'] = { level: 'ideal', reason: `Ideal em Dutada (EBP ${EBP.toFixed(0)}): ótimo rendimento e extensão.` };
    res.bp4 = { level: big ? 'ideal' : 'avoid', reason: big ? 'Ideal em BP4 (alto ganho na banda passante).' : 'BP4 recomendada para drivers ≥ 8".' };
    res.bp6 = { level: (big && Qts <= 0.46) ? 'ok' : 'avoid', reason: big ? 'Compatível em BP6 (exige sintonia cuidadosa).' : 'BP6 recomendada para drivers ≥ 8".' };
    res.planar = { level: (big && EBP >= 65) ? 'ideal' : 'ok', reason: big ? 'Bom rendimento em Planar Horn para ataque/SPL.' : 'Planar recomendada para drivers ≥ 8".' };
  } else {
    res.sealed = { level: 'avoid', reason: `EBP alto (${EBP.toFixed(0)}): selada perde muita extensão de subgrave.` };
    res['bass-reflex'] = { level: 'ideal', reason: `Ideal em Dutada (EBP ${EBP.toFixed(0)}): alto fator de motor.` };
    res.bp4 = { level: big ? 'ok' : 'avoid', reason: big ? 'Compatível em BP4 (banda mais estreita).' : 'BP4 recomendada para drivers ≥ 8".' };
    res.bp6 = { level: (big && Qts <= 0.45) ? 'ideal' : 'ok', reason: big ? 'Ideal em BP6 (motor forte aproveita 2 câmaras dutadas).' : 'BP6 recomendada para drivers ≥ 8".' };
    res.planar = { level: big ? 'ideal' : 'avoid', reason: big ? 'Ideal em Planar Horn (alta eficiência e pegada).' : 'Planar recomendada para drivers ≥ 8".' };
  }
  return res;
}

let lastActiveTopology = 'bass-reflex';
let autoDesignExactFb = null;
let autoDesignVbRef = null;
let autoDesignNominalPe = null;

function chooseBestTopologyForDriver({ Fs, Qes, Qms, Qts, EBP, dia }) {
  const q = Number.isFinite(Qts) ? Qts : ((Qms * Qes) / Math.max(1e-6, Qms + Qes));
  const ebp = Number.isFinite(EBP) ? EBP : (Fs / Math.max(0.05, Qes));
  const d = parseFloat(dia) || 12;
  if (ebp < 50 && q > 0.52) return 'sealed';
  if (d >= 12 && ebp >= 110 && q <= 0.34 && Fs >= 45) return 'planar';
  if (d >= 12 && ebp >= 95 && q <= 0.35 && Fs < 45) return 'bp6';
  if (ebp >= 48 && ebp <= 72 && q >= 0.44 && q <= 0.58) return 'bp4';
  return 'bass-reflex';
}

function synthesizeOptimalEnclosure(params) {
  const Fs = Math.max(10, params.Fs || 40);
  const Qts = Math.max(0.15, Math.min(1.2, params.Qts || 0.42));
  const Vas = Math.max(1.0, params.Vas || 100);
  const QL = Math.max(3.0, params.QL || 15.0);
  const nDrivers = Math.max(1, params.nDrivers || 1);
  const boxType = params.boxType || 'bass-reflex';
  const profile = params.profile || 'musical';

  const velTarget = profile === 'subgrave' ? 15.0 : (profile === 'spl' ? 19.0 : 17.0);
  let Vb = Vas * 0.8;
  let Vr = 0;
  let Fb = Fs;
  let FbVr = 0;
  let alignTag = '';

  if (boxType === 'free-air') {
    return { Vb: Math.max(10, Vas), Vr: 0, Fb: Fs, FbVr: 0, velTarget, alignTag: 'Baffle Infinito (Free-Air)' };
  }

  if (boxType === 'sealed') {
    const qBase = (profile === 'subgrave') ? 0.62 : (profile === 'spl' ? 0.88 : 0.7071);
    const qTarget = (Qts >= qBase * 0.92) ? Math.min(1.15, Math.max(qBase, Qts * 1.15)) : qBase;
    const alpha = Math.max(0.28, Math.min(5.0, Math.pow(qTarget / Qts, 2) - 1.0));
    Vb = Math.max(2.0 * nDrivers, Math.min(340.0 * nDrivers, Vas / alpha));
    const fc = Fs * Math.sqrt(1.0 + Vas / Vb);
    const qActual = Qts * Math.sqrt(1.0 + Vas / Vb);
    alignTag = `Selada Qtc=${qActual.toFixed(2)} · Fc=${fc.toFixed(0)}Hz`;
    return { Vb: Math.round(Vb * 10) / 10, Vr: 0, Fb: Math.round(fc * 10) / 10, FbVr: 0, velTarget, alignTag };
  }

  if (boxType === 'bp4') {
    const cfg = (profile === 'subgrave') ? { S: 0.707, Pa: -1.5, tag: 'BP4 Estendida' }
      : (profile === 'spl' ? { S: 0.55, Pa: 2.5, tag: 'BP4 Chebyshev SPL' }
      : { S: 0.707, Pa: 0.0, tag: 'BP4 Butterworth B4' });
    const diaBp = Math.max(4, params.dia || 12);
    const minVfBp = nDrivers * (diaBp >= 18 ? 42 : (diaBp >= 15 ? 26 : (diaBp >= 12 ? 15 : (diaBp >= 10 ? 10 : (diaBp >= 8 ? 7.5 : 4)))));
    const vfRaw = Math.pow(2.0 * cfg.S * Qts, 2) * Vas;
    Vb = Math.max(minVfBp, Math.min(260.0 * nDrivers, vfRaw));
    const Bcoef = Math.pow(10.0, -cfg.Pa / 40.0);
    const qtcTarget = Math.max(Qts * 1.12, 1.0 / (2.0 * cfg.S * Bcoef));
    const vrRaw = Vas / Math.max(0.18, Math.pow(qtcTarget / Qts, 2) - 1.0);
    Vr = Math.max(minVfBp * 1.25, Math.min(340.0 * nDrivers, vrRaw));
    Fb = Fs * Math.sqrt(1.0 + Vas / Vr);
    return {
      Vb: Math.round(Vb * 10) / 10,
      Vr: Math.round(Vr * 10) / 10,
      Fb: Math.round(Fb * 100) / 100,
      FbVr: 0,
      velTarget,
      alignTag: `${cfg.tag} (VR=${Vr.toFixed(0)}L / VF=${Vb.toFixed(0)}L)`
    };
  }

  if (boxType === 'bp6') {
    const diaBp6 = Math.max(4, params.dia || 12);
    const minVfBp6 = nDrivers * (diaBp6 >= 18 ? 48 : (diaBp6 >= 15 ? 30 : (diaBp6 >= 12 ? 18 : (diaBp6 >= 10 ? 15 : (diaBp6 >= 8 ? 15 : 6)))));
    const minVrBp6 = minVfBp6 * 1.45;
    if (profile === 'subgrave') {
      Vr = Math.max(minVrBp6, Math.min(340.0 * nDrivers, Vas * 1.10));
      Vb = Math.max(minVfBp6, Math.min(220.0 * nDrivers, Vas * 0.50));
      FbVr = Math.max(18.0, Fs * 0.78);
      Fb = FbVr * 1.92;
      alignTag = 'BP6 Paralela Subgrave';
    } else if (profile === 'spl') {
      Vr = Math.max(minVrBp6, Math.min(280.0 * nDrivers, Vas * 0.68));
      Vb = Math.max(minVfBp6, Math.min(180.0 * nDrivers, Vas * 0.36));
      FbVr = Math.max(20.0, Fs * 1.00);
      Fb = FbVr * 1.76;
      alignTag = 'BP6 Paralela SPL';
    } else {
      Vr = Math.max(minVrBp6, Math.min(320.0 * nDrivers, Vas * 0.88));
      Vb = Math.max(minVfBp6, Math.min(200.0 * nDrivers, Vas * 0.44));
      FbVr = Math.max(18.0, Fs * 0.86);
      Fb = FbVr * 1.85;
      alignTag = 'BP6 Paralela Quasi-Plana';
    }
    return {
      Vb: Math.round(Vb * 10) / 10,
      Vr: Math.round(Vr * 10) / 10,
      Fb: Math.round(Fb * 100) / 100,
      FbVr: Math.round(FbVr * 10) / 10,
      velTarget,
      alignTag
    };
  }

  // Bass-Reflex (4ª Ordem): Síntese Keele/Bullock por Qts + Refino direto na Função de Transferência Small 1973 com perdas QL
  const qc = Math.max(0.20, Math.min(0.68, Qts));
  let vbSeed, fbSeed, baseFamily;
  if (qc <= 0.38) {
    // Keele (1975) / Bullock (1985) QB3: Vb = 15 * Qts^2.87 * Vas
    vbSeed = 15.0 * Math.pow(qc, 2.87) * Vas;
    fbSeed = 0.42 * Math.pow(qc, -0.9) * Fs;
    baseFamily = 'QB3';
  } else if (qc <= 0.42) {
    vbSeed = 0.707 * Vas * Math.pow(qc / 0.39, 2.5);
    fbSeed = Fs * Math.pow(0.39 / qc, 0.7);
    baseFamily = 'B4';
  } else {
    vbSeed = Math.min(2.2 * Vas, 20.0 * Math.pow(qc, 2.87) * Vas);
    fbSeed = Math.max(20.0, 0.42 * Math.pow(qc, -0.9) * Fs);
    baseFamily = 'C4/EBS';
  }

  const volMult = profile === 'subgrave' ? 1.25 : (profile === 'spl' ? 0.88 : 1.0);
  const fbMult = profile === 'subgrave' ? 0.86 : (profile === 'spl' ? 1.14 : 1.0);
  const diaIn = Math.max(4, params.dia || 12);
  const minVbByDia = nDrivers * (diaIn >= 21 ? 140 : (diaIn >= 18 ? 115 : (diaIn >= 15 ? 65 : (diaIn >= 12 ? 30 : (diaIn >= 10 ? 16 : (diaIn >= 8 ? 8 : 4))))));
  Vb = Math.max(Math.max(minVbByDia, Vas * 0.28), Math.min(Math.min(360.0 * nDrivers, Math.max(60.0 * nDrivers, Vas * 2.2)), vbSeed * volMult));
  const alpha = Vas / Vb;
  const fMin = Math.max(18.0, fbSeed * fbMult * 0.74);
  const fMax = Math.min(Fs * 1.9, fbSeed * fbMult * 1.26);

  let bestFb = Math.max(18.0, fbSeed * fbMult);
  let bestScore = Infinity;
  let bestPeak = 0;
  for (let i = 0; i <= 16; i++) {
    const fTry = fMin + (fMax - fMin) * (i / 16);
    const ev = analyzeTransferAlignment({ boxType: 'bass-reflex', Fs, Qts, alpha, Fb: fTry, QL });
    const pk = Math.max(0, ev.peakDb || 0);
    const f3 = ev.f3Exact > 0 ? ev.f3Exact : Fs;
    let score;
    if (profile === 'musical') {
      const overPeak = Math.max(0, pk - 0.95);
      score = overPeak * overPeak * 40.0 + Math.abs(pk - 0.30) * 1.2 + (f3 / Fs) * 1.8;
    } else if (profile === 'subgrave') {
      const overPeak = Math.max(0, pk - 0.65);
      score = overPeak * overPeak * 40.0 + (f3 / Fs) * 3.5 + Math.abs(fTry - Math.max(20, Fs * 0.78)) * 0.02;
    } else {
      score = Math.abs(pk - 2.2) * 3.0 + Math.max(0, pk - 3.2) * 25.0 + (f3 / Fs) * 0.8;
    }
    if (score < bestScore) {
      bestScore = score;
      bestFb = fTry;
      bestPeak = pk;
    }
  }

  alignTag = (boxType === 'planar')
    ? `Planar Dutada + λ/4 (+${bestPeak.toFixed(1)}dB)`
    : `${baseFamily} ${profile === 'subgrave' ? 'EBS' : (profile === 'spl' ? 'SPL' : 'Plano')} (+${bestPeak.toFixed(1)}dB)`;
  return {
    Vb: Math.round(Vb * 10) / 10,
    Vr: 0,
    Fb: Math.round(bestFb * 100) / 100,
    FbVr: 0,
    velTarget,
    alignTag
  };
}

function autoSizeBassReflexPort(velTarget = 17.0, allowFlaredUpgrade = false) {
  const pEl = document.getElementById('portType');
  let pType = pEl?.value || 'round';
  const Vb = Math.max(1, parseFloat(document.getElementById('vbInput')?.value) || 50);
  const Fb = Math.max(10, parseFloat(document.getElementById('fbInput')?.value) || 40);
  const tempC = parseFloat(document.getElementById('tempInput')?.value) || 20;
  const cVal = 331.45 * Math.sqrt(1.0 + tempC / 273.15);
  const nDrivers = Math.max(1, parseInt(document.getElementById('simNumDrivers')?.value) || 1);
  const Fs = Math.max(10, parseFloat(document.getElementById('tsFs')?.value) || 40);
  const Qes = Math.max(0.05, parseFloat(document.getElementById('tsQes')?.value) || 0.45);
  const Vas = Math.max(1, (parseFloat(document.getElementById('tsVas')?.value) || 100) * nDrivers);
  const Pe = Math.max(10, (parseFloat(document.getElementById('tsPe')?.value) || 500) * nDrivers);
  const noFrac = (4.0 * Math.PI * Math.PI / Math.pow(cVal, 3)) * (Math.pow(Fs, 3) * (Vas / 1000.0) / Qes);
  const diaInPort = Math.max(4, parseFloat(document.getElementById('tsDia')?.value) || 12);
  const isSlotP = (pType === 'slot' || pType === 'slot_wall');
  const estAcm = isSlotP
    ? Math.max(22, (diaInPort * 2.54 * 1.06 + 3.0) * (nDrivers > 1 ? 1.9 : 1.0))
    : Math.max(24, (diaInPort * 2.54 * 1.06 + 13.0) * (nDrivers > 1 ? 1.85 : 1.0));
  const estBcm = isSlotP
    ? Math.max(22, diaInPort * 2.54 * 1.06 + 7.5)
    : Math.max(20, diaInPort * 2.54 * 1.06 + 3.5);
  const estCcm = (Vb * 1000.0) / Math.max(100, estAcm * estBcm);
  const maxSafeLv = Math.min(48.0, Math.max(12.0, estCcm - 5.5));
  const spMinLaminarM2 = (4.540262351285604 * Math.sqrt(noFrac * Pe)) / (Math.max(8.0, velTarget) * Math.max(10.0, Fb));

  if (pType === 'round' || pType === 'flared') {
    const nEl = document.getElementById('numDucts');
    const dEl = document.getElementById('ductDia');
    const dThick = parseFloat(document.getElementById('ductThick')?.value) || 3;
    if (!nEl || !dEl) return;
    const candidates = [[1, 1.5], [1, 2], [1, 2.5], [1, 3], [1, 4], [1, 5], [1, 6], [2, 4], [2, 5], [1, 8], [2, 6], [3, 4], [3, 5], [2, 8], [3, 6]];
    let tier1 = null, tier2 = null, tier3 = null;
    for (const [tryN, tryD] of candidates) {
      const pg = computePortGeometry({ portType: pType, numDucts: tryN, ductDia: tryD, ductThick: dThick, Fb, Vb, c: cVal });
      const vel = (4.540262351285604 * Math.sqrt(noFrac * Pe)) / (Math.max(1e-6, pg.Sp) * Fb);
      if (pg.LvCm >= 4.5 && pg.LvCm <= maxSafeLv && vel <= velTarget * 1.08) {
        tier1 = [tryN, tryD, vel];
        break;
      }
      if (pg.LvCm >= 3.0 && pg.LvCm <= maxSafeLv) {
        if (!tier2 || vel < tier2[2]) tier2 = [tryN, tryD, vel];
      } else if (pg.LvCm >= 2.0) {
        if (!tier3 || pg.LvCm < tier3[3]) tier3 = [tryN, tryD, vel, pg.LvCm];
      }
    }
    const chosen = tier1 || tier2 || tier3;
    if (chosen) {
      nEl.value = String(chosen[0]);
      dEl.value = String(chosen[1]);
      // Se nenhum tubo reto coube abaixo do limite laminar: promove p/ flared (24 m/s) ou slot_wall se ainda > 28 m/s
      if (!tier1 && allowFlaredUpgrade && pType === 'round' && chosen[2] > 18.0 && pEl) {
        if (chosen[2] > 27.0) {
          pEl.value = 'slot_wall';
          autoSizeBassReflexPort(velTarget, false);
          return;
        }
        pEl.value = 'flared';
      }
    } else if (allowFlaredUpgrade && pType === 'round' && pEl) {
      pEl.value = 'slot_wall';
      autoSizeBassReflexPort(velTarget, false);
      return;
    }
  } else if (pType === 'slot' || pType === 'slot_wall') {
    const swEl = document.getElementById('slotW');
    const shEl = document.getElementById('slotH');
    if (!swEl || !shEl) return;
    const kEnd = (pType === 'slot_wall') ? 1.343 : 0.732;
    const w = 2.0 * Math.PI * Fb;
    const aC = (cVal * cVal) / (w * w * (Vb / 1000.0));
    const bC = kEnd * 2.0 / Math.sqrt(Math.PI);
    const uMin = (bC + Math.sqrt(bC * bC + 4.0 * aC * 0.05)) / (2.0 * aC);
    const spMinCm2 = Math.max(spMinLaminarM2 * 10000.0, uMin * uMin * 10000.0);
    const uMax = (bC + Math.sqrt(bC * bC + 4.0 * aC * (maxSafeLv / 100.0))) / (2.0 * aC);
    const spMaxCm2 = uMax * uMax * 10000.0;
    const spTarget = Math.min(spMaxCm2, Math.max(spMinCm2, spMinLaminarM2 * 10000.0));
    const slotOrientNow = document.getElementById('wlSlotOrient')?.value || 'horizontal';
    // Em Duto Régua (slot_wall), casa exatamente com o vão interno da caixa (A na horizontal, B na vertical)
    const spanCm = (pType === 'slot_wall')
      ? (slotOrientNow === 'vertical' ? estBcm : estAcm)
      : Math.sqrt(spTarget * 4.5);
    const sw = Math.max(10, Math.min(80, Math.round(spanCm * 2) / 2));
    const sh = Math.max(1.0, Math.min(18, Math.round((spTarget / sw) * 10) / 10));
    swEl.value = sw.toFixed(1);
    shEl.value = sh.toFixed(1);
  } else if (pType === 'triangle') {
    const cEl = document.getElementById('triCount');
    const aEl = document.getElementById('triA');
    const bEl = document.getElementById('triB');
    if (!aEl || !bEl) return;
    const nTri = Math.max(1, Math.min(4, parseInt(cEl?.value) || 2));
    const leg = Math.max(6, Math.min(26, Math.ceil(Math.sqrt((2.0 * spMinLaminarM2 * 10000.0) / nTri) * 2) / 2));
    aEl.value = leg.toFixed(1);
    bEl.value = leg.toFixed(1);
  }
}

function computeOptimalHpfHz(boxType, Fb, FbVr, fc, Xmax_mm) {
  const isVentedHpf = (boxType === 'bass-reflex' || boxType === 'planar' || boxType === 'bp4' || boxType === 'bp6');
  const fRef = (boxType === 'bp6') ? Math.max(18, FbVr || 35)
    : ((boxType === 'sealed' || boxType === 'free-air') ? Math.max(18, fc || 40) : Math.max(18, Fb || 40));
  const fallback = (boxType === 'sealed' || boxType === 'free-air')
    ? Math.max(15, Math.round(fRef * 0.45))
    : Math.max(18, Math.round(fRef * 0.74));
  if (!currentCurves || !Array.isArray(currentCurves.G8_ConeExcursion) || !(Xmax_mm > 0)) {
    return { hpfHz: fallback, needed: false, xSubPeak: 0, xNotch: 0, xPassPeak: 0 };
  }
  const freqs = currentCurves.frequencies;
  const g8 = currentCurves.G8_ConeExcursion;
  const curHpf = (currentCurves.meta && currentCurves.meta.hpfHz > 0) ? currentCurves.meta.hpfHz : 0;
  // Reconstroi excursão bruta sem HPF para avaliar necessidade real de filtro subsônico e simetria dos dois picos
  const rawG8 = freqs.map((f, i) => {
    if (curHpf > 0) {
      const r4 = Math.pow(f / curHpf, 4);
      const hLin = r4 / (r4 + 1.0);
      return hLin > 1e-4 ? g8[i] / hLin : g8[i];
    }
    return g8[i];
  });

  const fSubHi = isVentedHpf ? (fRef * 0.96) : 200;
  let maxRawSub = 0;
  let xPassPeak = 0;
  let xNotch = Infinity;
  for (let i = 0; i < freqs.length; i++) {
    const f = freqs[i];
    const x = rawG8[i];
    if (f >= 12 && f <= fSubHi && x > maxRawSub) maxRawSub = x;
    if (isVentedHpf && f >= fRef * 1.04 && f <= 260 && x > xPassPeak) xPassPeak = x;
    if (isVentedHpf && Math.abs(f - fRef) <= Math.max(1.5, fRef * 0.04) && x < xNotch) xNotch = x;
  }
  if (!Number.isFinite(xNotch)) xNotch = 0;

  // Alvo de simetria "Camelo Equilibrado": pico subsônico <= 92% Xmax e equilibrado (~88%) com o pico da banda útil
  const subCeiling = isVentedHpf
    ? Math.min(Xmax_mm * 0.92, xPassPeak > 0.5 ? Math.max(Xmax_mm * 0.55, xPassPeak * 0.88) : Xmax_mm * 0.92)
    : Xmax_mm * 0.95;

  if (maxRawSub <= subCeiling) {
    return { hpfHz: fallback, needed: false, xSubPeak: maxRawSub, xNotch, xPassPeak };
  }
  const fHiSearch = Math.min(85, Math.max(fallback + 6, Math.round(fRef * 0.88)));
  for (let fTry = 16; fTry <= fHiSearch; fTry += 1) {
    let peak = 0;
    for (let i = 0; i < freqs.length; i++) {
      const f = freqs[i];
      if (f < 10 || f > fSubHi) continue;
      const r4 = Math.pow(f / fTry, 4);
      const x = rawG8[i] * (r4 / (r4 + 1.0));
      if (x > peak) peak = x;
    }
    if (peak <= subCeiling) {
      return { hpfHz: fTry, needed: true, xSubPeak: peak, xNotch, xPassPeak };
    }
  }
  return { hpfHz: fHiSearch, needed: true, xSubPeak: subCeiling, xNotch, xPassPeak };
}

function runAutoDesignForCurrentState(source = 'manual', opts = {}) {
  const boxType = document.getElementById('boxType')?.value || 'bass-reflex';
  const profile = document.getElementById('autoDesignProfile')?.value || 'musical';
  const nDrivers = Math.max(1, parseInt(document.getElementById('simNumDrivers')?.value) || 1);
  const Fs = Math.max(10, parseFloat(document.getElementById('tsFs')?.value) || 40);
  const Qes_nom = Math.max(0.05, parseFloat(document.getElementById('tsQes')?.value) || 0.45);
  const Qms = Math.max(0.5, parseFloat(document.getElementById('tsQms')?.value) || 7.0);
  const deltaT = Math.max(0, parseFloat(document.getElementById('thermalDeltaT')?.value) || 0);
  const Qes = Qes_nom * (1.0 + 0.00393 * deltaT);
  const Qts = (Qms * Qes) / (Qms + Qes);
  const Vas = Math.max(1.0, (parseFloat(document.getElementById('tsVas')?.value) || 100) * nDrivers);
  const QL = Math.max(3.0, parseFloat(document.getElementById('qlInput')?.value) || 15);
  const Xmax_mm = Math.max(1.0, parseFloat(document.getElementById('tsXmax')?.value) || 10);
  const peEl = document.getElementById('tsPe');
  const curPeVal = Math.max(10, parseFloat(peEl?.value) || 500);
  if (!(autoDesignNominalPe > 0) || curPeVal > autoDesignNominalPe) autoDesignNominalPe = curPeVal;
  const peNominal = (opts.enableHpfIfNeeded && autoDesignNominalPe > 0) ? autoDesignNominalPe : curPeVal;
  if (opts.enableHpfIfNeeded && peEl) peEl.value = String(peNominal);

  const dia = Math.max(4, parseFloat(document.getElementById('tsDia')?.value) || 12);
  const plan = synthesizeOptimalEnclosure({ Fs, Qes, Qms, Qts, Vas, QL, nDrivers, dia, boxType, profile });

  const vbEl = document.getElementById('vbInput');
  const vrEl = document.getElementById('vrInput');
  const fbEl = document.getElementById('fbInput');
  const fbVrEl = document.getElementById('fbVrInput');

  if (vbEl && boxType !== 'free-air') {
    vbEl.value = plan.Vb.toFixed(1);
    syncSliderRange('vbRange', plan.Vb, 5);
  }
  if ((boxType === 'bp4' || boxType === 'bp6') && vrEl && plan.Vr > 0) {
    vrEl.value = plan.Vr.toFixed(1);
    syncSliderRange('vrRange', plan.Vr, 5);
  }
  if (fbEl && (boxType === 'bass-reflex' || boxType === 'planar' || boxType === 'bp4' || boxType === 'bp6')) {
    fbEl.value = plan.Fb.toFixed(2);
    syncSliderRange('fbRange', plan.Fb, 15);
  }
  if (boxType === 'bp6' && fbVrEl && plan.FbVr > 0) {
    fbVrEl.value = plan.FbVr.toFixed(1);
    syncSliderRange('fbVrRange', plan.FbVr, 15);
  }

  autoDesignExactFb = (boxType === 'bass-reflex' || boxType === 'planar') ? plan.Fb : null;
  autoDesignVbRef = (boxType === 'bass-reflex' || boxType === 'planar') ? plan.Vb : null;
  isAutoTune = true;
  recalculate();

  // Etapa 2.5 (Refino Mecânico de Excursão na Banda Útil — "Camelo Equilibrado"):
  // Se o pico direito (acima de Fb) excede 95% de Xmax em Pe nominal, ajusta levemente (Vb, Fb) antes de cortar Pe
  if (opts.enableHpfIfNeeded && (boxType === 'bass-reflex' || boxType === 'planar') && currentCurves && Array.isArray(currentCurves.G8_ConeExcursion)) {
    const getPassPeak = () => {
      let pk = 0;
      const fMinP = Math.max(15, (currentCurves.meta?.Fb || plan.Fb) * 1.05);
      for (let i = 0; i < currentCurves.frequencies.length; i++) {
        const f = currentCurves.frequencies[i];
        if (f >= fMinP && f <= 260 && currentCurves.G8_ConeExcursion[i] > pk) pk = currentCurves.G8_ConeExcursion[i];
      }
      return pk;
    };
    const origPassPk = getPassPeak();
    if (origPassPk > Xmax_mm * 0.95) {
      let bestVb = plan.Vb, bestFb = plan.Fb, bestScore = Infinity;
      const minVbFloor = nDrivers * (dia >= 21 ? 140 : (dia >= 18 ? 115 : (dia >= 15 ? 65 : (dia >= 12 ? 28 : (dia >= 10 ? 16 : (dia >= 8 ? 8 : 4))))));
      const vScales = [0.92, 0.84, 0.76];
      const fScales = [1.03, 1.08, 1.14];
      for (const sv of vScales) {
        for (const sf of fScales) {
          const tryVb = Math.max(minVbFloor, +(plan.Vb * sv).toFixed(1));
          const tryFb = Math.max(20.0, Math.min(95.0, +(plan.Fb * sf).toFixed(2)));
          if (vbEl) vbEl.value = tryVb.toFixed(1);
          if (fbEl) fbEl.value = tryFb.toFixed(2);
          autoDesignExactFb = tryFb;
          autoDesignVbRef = tryVb;
          recalculate();
          const pkTry = getPassPeak();
          const over = Math.max(0, pkTry - Xmax_mm * 0.94);
          const f3Pen = Math.max(0, (currentCurves.meta?.F3 || tryFb) - plan.Fb * 1.35) * 0.08;
          const devPen = (1.0 - sv) * 1.2 + (sf - 1.0) * 1.5;
          const score = over * 20.0 + f3Pen + devPen;
          if (pkTry < origPassPk * 0.97 && score < bestScore) {
            bestScore = score;
            bestVb = tryVb;
            bestFb = tryFb;
          }
        }
      }
      plan.Vb = bestVb;
      plan.Fb = bestFb;
      if (vbEl) { vbEl.value = plan.Vb.toFixed(1); syncSliderRange('vbRange', plan.Vb, 5); }
      if (fbEl) { fbEl.value = plan.Fb.toFixed(2); syncSliderRange('fbRange', plan.Fb, 15); }
      autoDesignExactFb = plan.Fb;
      autoDesignVbRef = plan.Vb;
      recalculate();
    }
  }

  const allowPortUpgrade = (source === 'db' || source === 'manual' || source === 'profile' || source === 'db_sealed_fallback');
  if (boxType === 'bass-reflex' || boxType === 'planar') {
    autoSizeBassReflexPort(plan.velTarget, allowPortUpgrade);
    recalculate();
  } else if (boxType === 'bp4' || boxType === 'bp6') {
    autoSizeBandPassPorts(boxType, true, allowPortUpgrade);
  }

  // Calcula HPF subsônico ótimo com simetria de dois picos (pico esquerdo equilibrado com pico direito <= 92% Xmax)
  const hpfPlan = computeOptimalHpfHz(boxType, plan.Fb, plan.FbVr, currentCurves?.meta?.fc || Fs, Xmax_mm);
  const hpfEl = document.getElementById('hpfCutoff');
  if (hpfEl) hpfEl.value = String(hpfPlan.hpfHz);
  if (opts.enableHpfIfNeeded && hpfPlan.needed && boxType !== 'sealed' && boxType !== 'free-air') {
    if (typeof setHpfEnabled === 'function') setHpfEnabled(true, false);
  }
  recalculate();

  // Etapa 4: se ainda houver excursão acima de 97% Xmax na banda útil, ajusta Pe para teto seguro (95% Xmax)
  let peAdjusted = null;
  if (opts.enableHpfIfNeeded && boxType !== 'free-air' && peEl && currentCurves && Array.isArray(currentCurves.G8_ConeExcursion)) {
    let maxXpk = 0;
    for (let i = 0; i < currentCurves.frequencies.length; i++) {
      const f = currentCurves.frequencies[i];
      if (f >= 10 && f <= 300 && currentCurves.G8_ConeExcursion[i] > maxXpk) {
        maxXpk = currentCurves.G8_ConeExcursion[i];
      }
    }
    if (maxXpk > Xmax_mm * 0.97) {
      const peSafe = Math.max(2, Math.floor(peNominal * Math.pow((Xmax_mm * 0.95) / maxXpk, 2)));
      if (peSafe < peNominal) {
        peEl.value = String(peSafe);
        const ampPowEl = document.getElementById('elAmpPower');
        if (ampPowEl) ampPowEl.value = Math.round(peSafe * nDrivers * 1.25);
        peAdjusted = { from: peNominal, to: peSafe };
        recalculate();
      }
    }
  }

  autofixWoodlockGeometry(`auto-design ${boxType}/${profile}`, { resetToMin: true });

  // Em micro-gabinetes vindos do Banco DB onde nenhum duto reto cabe fisicamente (BR ou BP6), migra automaticamente
  if (source === 'db' && (boxType === 'bass-reflex' || boxType === 'bp6') && lastBuildPack && !lastBuildPack.validation.valid && lastBuildPack.validation.issues.some(i => i.code === 'PORT_DEPTH_COLLISION')) {
    const btEl = document.getElementById('boxType');
    const nextTopo = (boxType === 'bp6') ? 'bass-reflex' : 'sealed';
    if (btEl) btEl.value = nextTopo;
    lastActiveTopology = nextTopo;
    return runAutoDesignForCurrentState('db_sealed_fallback', opts);
  }

  const adSt = document.getElementById('autoDesignStatus');
  if (adSt) {
    adSt.style.display = 'block';
    const velTxt = (boxType === 'bass-reflex' || boxType === 'planar' || boxType === 'bp4' || boxType === 'bp6')
      ? ` · Ar ${(currentCurves?.meta?.airVel || 0).toFixed(1)} m/s`
      : '';
    const hpfTxt = (boxType !== 'free-air') ? ` · HPF ${hpfPlan.hpfHz}Hz` : '';
    const finalMaxX = (currentCurves && Array.isArray(currentCurves.G8_ConeExcursion))
      ? Math.max(...currentCurves.G8_ConeExcursion) : 0;
    const xPct = Xmax_mm > 0 ? Math.round((finalMaxX / Xmax_mm) * 100) : 0;
    const xTxt = (finalMaxX > 0 && boxType !== 'free-air') ? ` · Xpk ${finalMaxX.toFixed(1)}/${Xmax_mm}mm (${xPct}%)` : '';
    const peTxt = peAdjusted ? ` · <span style="color:#facc15;">Pe ${peAdjusted.from}→${peAdjusted.to}W</span>` : '';
    const fbNote = (source === 'db_sealed_fallback') ? ' (micro-caixa)' : '';
    adSt.innerHTML = `<span style="color:var(--success);">${plan.alignTag}${fbNote}</span>${velTxt}${hpfTxt}${xTxt}${peTxt}`;
  }
  return plan;
}

function onAutoDesignProfileChange() {
  runAutoDesignForCurrentState('profile', { enableHpfIfNeeded: true });
}

function autoSizeBandPassPorts(topo, resetCount = false, allowUpgrade = false) {
  if (topo !== 'bp4' && topo !== 'bp6') return;
  const pEl = document.getElementById('portType');
  let pType = pEl ? pEl.value : 'round';
  const nEl = document.getElementById('numDucts');
  const dEl = document.getElementById('ductDia');
  const nVrEl = document.getElementById('numDuctsVr');
  const dVrEl = document.getElementById('ductDiaVr');
  const dThick = parseFloat(document.getElementById('ductThick')?.value) || 3;
  const dThickVr = parseFloat(document.getElementById('ductThickVr')?.value) || 3;
  const Vb = Math.max(1, parseFloat(document.getElementById('vbInput')?.value) || 50);
  const Vr = Math.max(1, parseFloat(document.getElementById('vrInput')?.value) || 50);
  const Fb = Math.max(10, parseFloat(document.getElementById('fbInput')?.value) || 65);
  const FbVr = Math.max(10, parseFloat(document.getElementById('fbVrInput')?.value) || 38);
  const tempC = parseFloat(document.getElementById('tempInput')?.value) || 20;
  const cVal = 331.45 * Math.sqrt(1.0 + tempC / 273.15);
  const diaBpP = Math.max(4, parseFloat(document.getElementById('tsDia')?.value) || 12);
  const estBmm = Math.max(260, diaBpP * 25.4 * 1.06 + 80);
  const domBmm = parseFloat(document.getElementById('wlHeightB')?.value) || estBmm;
  const refBmm = resetCount ? estBmm : Math.max(estBmm, domBmm);
  const maxSafeLv = Math.min(42.0, Math.max(16.0, (refBmm - 65) / 10.0));
  const bpM = (currentCurves && currentCurves.meta && currentCurves.meta.bpMetrics) || null;
  const maxUpf = (bpM && Number.isFinite(bpM.maxUpf) && bpM.maxUpf > 0) ? bpM.maxUpf : 0.15;
  const maxUpr = (bpM && Number.isFinite(bpM.maxUpr) && bpM.maxUpr > 0) ? bpM.maxUpr : 0.15;

  const solveBpSlot = (slotType) => {
    const kEnd = (slotType === 'slot_wall') ? 1.343 : 0.732;
    const areaForLv = (vL, fHz, lvM) => {
      const w = 2.0 * Math.PI * Math.max(1, fHz);
      const aC = (cVal * cVal) / (w * w * Math.max(0.001, vL / 1000.0));
      const bC = kEnd * 2.0 / Math.sqrt(Math.PI);
      const u = (bC + Math.sqrt(bC * bC + 4.0 * aC * Math.max(0.01, lvM))) / (2.0 * aC);
      return u * u * 10000.0;
    };
    const minAreaF = areaForLv(Vb, Fb, 0.045);
    const maxAreaF = areaForLv(Vb, Fb, Math.max(0.18, maxSafeLv / 100.0));
    const aeroAreaF = (maxUpf / 17.0) * 10000.0;
    const aeroAreaR = (topo === 'bp6') ? (maxUpr / 17.0) * 10000.0 : 0;
    const aeroNeed = Math.max(aeroAreaF, aeroAreaR);
    let targetArea = Math.min(maxAreaF, Math.max(minAreaF, aeroNeed));
    if (topo === 'bp6') {
      const minAreaR = areaForLv(Vr, FbVr, 0.04);
      const maxAreaR = areaForLv(Vr, FbVr, Math.max(0.20, maxSafeLv / 100.0));
      const lo = Math.max(minAreaF, minAreaR);
      const hi = Math.min(maxAreaF, maxAreaR);
      targetArea = (lo <= hi)
        ? Math.min(hi, Math.max(lo, aeroNeed))
        : Math.max(minAreaF, Math.min(maxAreaR * 1.15, Math.max(aeroNeed * 0.85, (minAreaF + maxAreaR) * 0.5)));
    }
    const swNew = Math.max(10, Math.min(48, Math.round(Math.sqrt(targetArea * 3.5) * 2) / 2));
    const shNew = Math.max(1.5, Math.min(18, Math.round((targetArea / swNew) * 2) / 2));
    const pgF = computePortGeometry({ portType: slotType, slotW: swNew, slotH: shNew, Fb, Vb, c: cVal });
    const pgR = (topo === 'bp6') ? computePortGeometry({ portType: slotType, slotW: swNew, slotH: shNew, Fb: FbVr, Vb: Vr, c: cVal }) : null;
    const velF = maxUpf / Math.max(1e-6, pgF.Sp);
    const velR = (topo === 'bp6' && pgR) ? (maxUpr / Math.max(1e-6, pgR.Sp)) : 0;
    const lvOk = pgF.LvCm >= 2.0 && pgF.LvCm <= maxSafeLv + 1.0 && (!pgR || (pgR.LvCm >= 2.0 && pgR.LvCm <= maxSafeLv + 1.0));
    return { swNew, shNew, velMax: Math.max(velF, velR), lvOk };
  };

  if (pType === 'round' || pType === 'flared') {
    const pickRound = (modeType, chamberVb, chamberFb, chamberThick, maxUp, curN, curD) => {
      const curPg = computePortGeometry({ portType: modeType, numDucts: curN, ductDia: curD, ductThick: chamberThick, Fb: chamberFb, Vb: chamberVb, c: cVal });
      const curVel = maxUp / Math.max(1e-6, curPg.Sp);
      if (!resetCount && curPg.LvCm >= 4.0 && curPg.LvCm <= maxSafeLv && curVel <= curPg.velLimit * 1.15) {
        return [curN, curD, curVel, true];
      }
      const diaBpP = Math.max(4, parseFloat(document.getElementById('tsDia')?.value) || 12);
      const candidates = (diaBpP <= 8)
        ? [[1, 3], [1, 2.5], [1, 2], [1, 4], [1, 5], [2, 3], [2, 4]]
        : [[1, 6], [1, 8], [1, 5], [1, 4], [1, 10], [1, 3], [2, 6], [2, 8], [2, 10], [3, 6], [3, 8], [2, 5], [2, 4], [2, 3], [1, 2.5], [1, 2]];
      const minLvCm = Math.max(2.0, ((parseFloat(document.getElementById('wlThickness')?.value) || 18) / 10.0) + 0.2);
      let tier1 = null, tier2 = null, tier3 = null;
      for (const [tryN, tryD] of candidates) {
        const pg = computePortGeometry({ portType: modeType, numDucts: tryN, ductDia: tryD, ductThick: chamberThick, Fb: chamberFb, Vb: chamberVb, c: cVal });
        const vel = maxUp / Math.max(1e-6, pg.Sp);
        if (pg.LvCm >= 4.5 && pg.LvCm <= maxSafeLv && vel <= pg.velLimit * 1.15) {
          tier1 = [tryN, tryD, vel, true];
          break;
        }
        if (pg.LvCm >= 4.5 && pg.LvCm <= maxSafeLv) {
          if (!tier2 || (tryN === 1 && tier2[0] > 1 && vel <= tier2[2] * 1.25) || (tryN === tier2[0] && vel < tier2[2]) || (tier2[0] === 1 && tryN > 1 && vel < tier2[2] * 0.72)) {
            tier2 = [tryN, tryD, vel, false];
          }
        } else if (pg.LvCm >= minLvCm && pg.LvCm <= maxSafeLv) {
          if (!tier3 || vel < tier3[2]) tier3 = [tryN, tryD, vel, false];
        }
      }
      const chosen = tier1 || tier2 || tier3;
      return chosen || [1, curD, curVel, false];
    };

    const applyRoundMode = (modeType) => {
      let velF = 0, velR = 0;
      if (nEl && dEl) {
        const [bestN, bestD, vF] = pickRound(modeType, Vb, Fb, dThick, maxUpf, parseInt(nEl.value) || 1, parseFloat(dEl.value) || 6);
        nEl.value = String(bestN);
        dEl.value = String(bestD);
        velF = vF;
      }
      if (topo === 'bp6' && nVrEl && dVrEl) {
        const [bestNVr, bestDVr, vR] = pickRound(modeType, Vr, FbVr, dThickVr, maxUpr, parseInt(nVrEl.value) || 1, parseFloat(dVrEl.value) || 6);
        nVrEl.value = String(bestNVr);
        dVrEl.value = String(bestDVr);
        velR = vR;
      }
      return Math.max(velF, velR);
    };

    let peakVel = applyRoundMode(pType);

    // Upgrade automático aerodinâmico em Band-Pass quando tubos retos estouram o limite laminar:
    // - BP4: promove p/ flared (24 m/s) ou slot_wall se ainda > 24 m/s e régua entregar menor velocidade
    // - BP6: promove p/ flared mantendo dutos VF e VR independentes (régua única em BP6 estrangula VF)
    if (allowUpgrade && pType === 'round' && pEl && peakVel > 18.0) {
      pEl.value = 'flared';
      pType = 'flared';
      const flaredVel = applyRoundMode('flared');
      if (topo === 'bp4' && flaredVel > 24.0) {
        const swEl = document.getElementById('slotW');
        const shEl = document.getElementById('slotH');
        const sl = solveBpSlot('slot_wall');
        if (swEl && shEl && sl.lvOk && sl.velMax < flaredVel * 0.90) {
          pEl.value = 'slot_wall';
          swEl.value = sl.swNew.toFixed(1);
          shEl.value = sl.shNew.toFixed(1);
          recalculate();
          return;
        }
      }
    }
    recalculate();
  } else if (pType === 'slot' || pType === 'slot_wall') {
    const swEl = document.getElementById('slotW');
    const shEl = document.getElementById('slotH');
    if (swEl && shEl) {
      const swCur = Math.max(10, parseFloat(swEl.value) || 35);
      const shCur = Math.max(2, parseFloat(shEl.value) || 6);
      const pgF = computePortGeometry({ portType: pType, slotW: swCur, slotH: shCur, Fb, Vb, c: cVal });
      const pgR = (topo === 'bp6') ? computePortGeometry({ portType: pType, slotW: swCur, slotH: shCur, Fb: FbVr, Vb: Vr, c: cVal }) : null;
      const velF = maxUpf / Math.max(1e-6, pgF.Sp);
      const velR = (topo === 'bp6' && pgR) ? (maxUpr / Math.max(1e-6, pgR.Sp)) : 0;
      const minLvSlotCm = Math.max(2.0, ((parseFloat(document.getElementById('wlThickness')?.value) || 18) / 10.0) + 0.2);
      if (resetCount || pgF.LvCm < minLvSlotCm || pgF.LvCm > maxSafeLv || (pgR && (pgR.LvCm < minLvSlotCm || pgR.LvCm > maxSafeLv)) || velF > 19.5 || velR > 19.5) {
        const sl = solveBpSlot(pType);
        if (!sl.lvOk && topo === 'bp6' && pEl) {
          // Régua única em BP6 não satisfaz Lv > t simultaneamente em VF e VR: promove para dutos independentes flared
          pEl.value = 'flared';
          autoSizeBandPassPorts(topo, true, false);
          return;
        }
        swEl.value = sl.swNew.toFixed(1);
        shEl.value = sl.shNew.toFixed(1);
        recalculate();
      }
    }
  }
}

function selectTopology(topo) {
  bpSynthClampNote = '';
  const el = document.getElementById('boxType');
  const prevTopo = lastActiveTopology || (el ? el.value : '');
  lastActiveTopology = topo;
  if (el) el.value = topo;
  const vbEl = document.getElementById('vbInput');
  const vrEl = document.getElementById('vrInput');
  const fbEl = document.getElementById('fbInput');
  const fbVrEl = document.getElementById('fbVrInput');
  const fbR = document.getElementById('fbRange');
  const VbCur = parseFloat(vbEl?.value) || 80;
  const curVr = parseFloat(vrEl?.value) || 0;
  const isTinyDriverBp4 = (topo === 'bp4' && VbCur < 20 && curVr > 0 && curVr < 20);

  if (fbR && isAutoTune) {
    fbR.min = 20;
    fbR.max = 80;
  }

  // Com Modo Automático (⚡) ligado ao trocar de topologia, sintetiza automaticamente o melhor Vb/VR/Fb/duto p/ a nova topologia
  if (isAutoTune && prevTopo !== topo && !isTinyDriverBp4 && typeof runAutoDesignForCurrentState === 'function') {
    runAutoDesignForCurrentState('topology', { enableHpfIfNeeded: false });
    return;
  }

  const enteringBp = (topo === 'bp4' || topo === 'bp6') && (prevTopo !== 'bp4' && prevTopo !== 'bp6');
  if (topo === 'bp4' || topo === 'bp6') {
    if (enteringBp && isAutoTune && !isTinyDriverBp4 && vbEl && vrEl && VbCur >= 20 && (curVr < 0.5 || (Math.abs(curVr - 60) < 0.01 && VbCur > curVr * 1.15))) {
      const targetVr = Math.max(15, Math.round(VbCur));
      const targetVf = Math.max(10, Math.round(targetVr * (topo === 'bp6' ? 0.55 : 0.50)));
      vrEl.value = targetVr;
      vbEl.value = targetVf;
      syncSliderRange('vbRange', targetVf, 5);
    } else if (vrEl && (!curVr || curVr < 0.5)) {
      vrEl.value = Math.max(0.5, Math.round(VbCur * 0.75 * 10) / 10);
    }
  }
  if (vrEl && parseFloat(vrEl.value) > 0) syncSliderRange('vrRange', parseFloat(vrEl.value), 5);
  if (topo === 'bp6' && fbVrEl && fbEl) {
    const fbF = parseFloat(fbEl.value) || 65;
    if (!parseFloat(fbVrEl.value) || parseFloat(fbVrEl.value) >= fbF) {
      fbVrEl.value = Math.max(18, Math.round(fbF * 0.62));
    }
    syncSliderRange('fbVrRange', parseFloat(fbVrEl.value), 15);
  }
  recalculate();
  if ((topo === 'bp4' || topo === 'bp6') && isAutoTune) {
    autoSizeBandPassPorts(topo, enteringBp);
  }
  autofixWoodlockGeometry(`topologia ${topo}`, { resetToMin: true });
}

function syncSlotWidthToBoxSpan() {
  const boxType = document.getElementById('boxType')?.value || 'bass-reflex';
  const portType = document.getElementById('portType')?.value || 'round';
  if (boxType !== 'bass-reflex' || portType !== 'slot_wall') return false;
  const swEl = document.getElementById('slotW');
  const shEl = document.getElementById('slotH');
  const elA = document.getElementById('wlWidthA');
  const elB = document.getElementById('wlHeightB');
  if (!swEl || !shEl || !elA || !elB) return false;
  const A = parseFloat(elA.value) || 400;
  const B = parseFloat(elB.value) || 400;
  const t = parseFloat(document.getElementById('wlThickness')?.value) || 18;
  const nDrivers = Math.max(1, parseInt(document.getElementById('simNumDrivers')?.value) || 1);
  const slotOrient = document.getElementById('wlSlotOrient')?.value || 'horizontal';
  const portLayout = document.getElementById('wlPortLayout')?.value || 'standard';
  const isShared = (nDrivers === 2 && portLayout === 'center_shared');
  const spanMm = (slotOrient === 'vertical')
    ? B
    : ((nDrivers === 2 && !isShared) ? Math.max(100, (A - t) / 2.0) : A);
  const targetSwCm = +(spanMm / 10.0).toFixed(1);
  const curSw = Math.max(5, parseFloat(swEl.value) || 35);
  const curSh = Math.max(1.5, parseFloat(shEl.value) || 6);
  if (Math.abs(curSw - targetSwCm) < 0.25) return false;
  const curArea = curSw * curSh;
  const newSh = Math.max(1.8, Math.min(18.0, Math.round((curArea / targetSwCm) * 2) / 2));
  swEl.value = targetSwCm.toFixed(1);
  shEl.value = newSh.toFixed(1);
  return true;
}

function onSlotOrientChange() {
  syncSlotWidthToBoxSpan();
  recalculate();
  autofixWoodlockGeometry('orientação duto régua');
  if (syncSlotWidthToBoxSpan()) {
    recalculate();
    updateWoodlock();
  }
}

function onPortTypeChange() {
  const topo = document.getElementById('boxType')?.value || 'bass-reflex';
  const pType = document.getElementById('portType')?.value || 'round';
  if (topo === 'bass-reflex' && pType === 'slot_wall') {
    syncSlotWidthToBoxSpan();
  }
  recalculate();
  if (topo === 'bp4' || topo === 'bp6') {
    autoSizeBandPassPorts(topo, true);
  }
  autofixWoodlockGeometry(`duto ${pType}`);
}

function computePortGeometry(opts) {
  const portType = opts.portType || 'round';
  const isSlot = (portType === 'slot' || portType === 'slot_wall');
  const isTri = (portType === 'triangle');
  const numD = Math.max(1, parseInt(opts.numDucts) || 1);
  const Fb = Math.max(1.0, parseFloat(opts.Fb) || 40.0);
  const Vb = Math.max(0.5, parseFloat(opts.Vb) || 50.0);
  const cVal = opts.c || 343.37;

  let Sp = 0;
  let DeqM = 0;
  let DeqIn = 0;
  let DhCm = 0;
  let aspectRatio = 1.0;
  let kEnd = 0.732;
  let velLimit = 17.0;
  let hypCm = 0;

  if (isTri) {
    const nTri = Math.max(1, Math.min(4, parseInt(opts.triCount) || 2));
    const aCm = Math.max(2.0, parseFloat(opts.triA) || 14.0);
    const bCm = Math.max(2.0, parseFloat(opts.triB) || 14.0);
    hypCm = Math.sqrt(aCm * aCm + bCm * bCm);
    const areaOneCm2 = 0.5 * aCm * bCm;
    Sp = (nTri * areaOneCm2) / 10000.0;
    DeqM = 2.0 * Math.sqrt(Sp / Math.PI);
    DeqIn = DeqM / 0.0254;
    DhCm = (4.0 * areaOneCm2) / (aCm + bCm + hypCm);
    aspectRatio = Math.max(aCm, bCm) / Math.min(aCm, bCm);
    kEnd = 1.343;
    velLimit = 17.0;
  } else if (isSlot) {
    const wCm = Math.max(0.5, parseFloat(opts.slotW) || 35.0);
    const hCm = Math.max(0.5, parseFloat(opts.slotH) || 6.0);
    Sp = (wCm / 100.0) * (hCm / 100.0);
    DeqM = 2.0 * Math.sqrt(Sp / Math.PI);
    DeqIn = DeqM / 0.0254;
    DhCm = (2.0 * wCm * hCm) / (wCm + hCm);
    aspectRatio = Math.max(wCm, hCm) / Math.min(wCm, hCm);
    kEnd = (portType === 'slot_wall') ? 1.343 : 0.732;
    velLimit = 17.0;
  } else {
    const dDia = Math.max(0.5, parseFloat(opts.ductDia) || 4.0);
    Sp = numD * Math.PI * Math.pow((dDia * 0.0254) / 2.0, 2);
    DeqIn = dDia * Math.sqrt(numD);
    DeqM = DeqIn * 0.0254;
    DhCm = dDia * 2.54;
    aspectRatio = 1.0;
    kEnd = (portType === 'flared') ? 0.850 : 0.732;
    velLimit = (portType === 'flared') ? 24.0 : 17.0;
  }

  const omega_b = 2.0 * Math.PI * Fb;
  const LeffM = (cVal * cVal * Sp) / (Math.pow(omega_b, 2) * (Vb / 1000.0));
  // Para múltiplos dutos cilíndricos separados, a correção de extremidade atua na boca de cada tubo individual (Small 1973 / Dickason)
  const dEndM = (!isSlot && !isTri) ? (Math.max(0.5, parseFloat(opts.ductDia) || 4.0) * 0.0254) : DeqM;
  const deltaL = kEnd * dEndM;
  const LvM = LeffM - deltaL;
  const LvCm = LvM * 100.0;
  const fPipe1 = LeffM > 1e-4 ? (cVal / (2.0 * LeffM)) : 0;

  let vDuto = 0;
  if (isTri) {
    const nTri = Math.max(1, Math.min(4, parseInt(opts.triCount) || 2));
    const aCm = Math.max(2.0, parseFloat(opts.triA) || 14.0);
    const bCm = Math.max(2.0, parseFloat(opts.triB) || 14.0);
    const tCm = 1.8;
    const extAreaCm2 = nTri * (0.5 * aCm * bCm + hypCm * tCm);
    vDuto = (extAreaCm2 * Math.max(1.0, LvCm)) / 1000.0;
  } else if (isSlot) {
    const wCm = Math.max(0.5, parseFloat(opts.slotW) || 35.0);
    const hCm = Math.max(0.5, parseFloat(opts.slotH) || 6.0);
    const tCm = (Math.max(1.0, parseFloat(opts.slotWallThick) || 18.0)) / 10.0;
    const extAreaCm2 = (portType === 'slot_wall')
      ? ((wCm + tCm) * (hCm + tCm))
      : ((wCm + 2 * tCm) * (hCm + 2 * tCm));
    vDuto = (extAreaCm2 * Math.max(1.0, LvCm)) / 1000.0;
  } else {
    const dDia = Math.max(0.5, parseFloat(opts.ductDia) || 4.0);
    const dThick = Math.max(0.0, parseFloat(opts.ductThick) || 1.5);
    const dExtM = (dDia * 0.0254) + 2.0 * (dThick / 1000.0);
    vDuto = (numD * Math.PI * Math.pow(dExtM / 2.0, 2) * Math.max(0.01, LvM) * 1000.0) + 0.08;
  }

  return { portType, isSlot, isTri, hypCm, Sp, DeqM, DeqIn, DhCm, aspectRatio, kEnd, LeffM, LvM, LvCm, vDuto, fPipe1, velLimit };
}

// ============================================================================
// MOTOR FÍSICO ACOPLADO BAND-PASS (BP4, BP6 PARALELA & BP6 SÉRIE)
// Malha eletromecânico-acústica exata (impedância acústica / velocidade de volume)
// + Parâmetros clássicos de projeto e síntese: Q't (Qbp), S, DF, Pa
// ============================================================================
function buildBandPassAcousticModel(p) {
  const Fs = Math.max(1.0, p.Fs || 40.0);
  const Qms = Math.max(0.2, p.Qms || 7.0);
  const Qts_in = Math.max(0.05, Math.min(Qms * 0.95, p.Qts || 0.40));
  const Qes = Math.max(0.05, p.Qes || ((Qts_in * Qms) / Math.max(0.05, Qms - Qts_in)));
  const Qts = (Qms * Qes) / (Qms + Qes);
  const Re = Math.max(0.2, p.Re || 4.0);
  const Vas = Math.max(0.1, p.Vas || 50.0);
  const Sd_m2 = Math.max(1e-4, p.Sd_m2 || 0.05);
  const Pe = Math.max(1.0, p.Pe || 100.0);
  const Vr = Math.max(0.5, p.Vr || (p.Vb ? p.Vb * 0.75 : 30.0));
  const Vf = Math.max(0.5, p.Vb || 30.0);
  const Fb = Math.max(10.0, p.Fb || 60.0);
  const FbVr = Math.max(10.0, p.FbVr || 35.0);
  const QL = Math.max(1.0, p.QL || 15.0);
  const Qp = Math.max(10.0, p.Qp || 60.0);
  const rho = Math.max(0.5, p.rho || 1.205585);
  const c = Math.max(200.0, p.c || 343.37);
  const boxType = p.boxType || 'bp4';
  const bp6Mode = p.bp6Mode || 'parallel';

  const ws = 2.0 * Math.PI * Fs;
  const rhoC2 = rho * c * c;
  const Cas = (Vas / 1000.0) / rhoC2;
  const Mas = 1.0 / (ws * ws * Cas);
  const Ram = (ws * Mas) / Qms;
  const Rae = (ws * Mas) / Qes;
  const Rat = Ram + Rae;
  const bl2OverSd2 = Rae * Re; // (Bl / Sd)^2 = Rae * Re
  const Pg_pk = Math.sqrt(2.0 * Pe * Rae); // Pressão acústica de pico em Pe

  const Car = (Vr / 1000.0) / rhoC2;
  const Caf = (Vf / 1000.0) / rhoC2;

  const alphaR = Vas / Vr;
  const alphaF = Vas / Vf;
  const fcR = Fs * Math.sqrt(1.0 + alphaR);
  const qtcR = Qts * Math.sqrt(1.0 + alphaR);

  const wbf = 2.0 * Math.PI * Fb;
  const Mapf = 1.0 / (wbf * wbf * Caf);
  const Rapf = (wbf * Mapf) / Qp;
  const Gaf = (wbf * Caf) / QL;

  const wbr = 2.0 * Math.PI * FbVr;
  const Mapr = 1.0 / (wbr * wbr * Car);
  const Rapr = (wbr * Mapr) / Qp;
  const wRefR = (boxType === 'bp4') ? (2.0 * Math.PI * fcR) : wbr;
  const Gar = (wRefR * Car) / QL;

  return {
    boxType, bp6Mode, Fs, Qms, Qes, Qts, Re, Vas, Sd_m2, Pe,
    Vr, Vf, Fb, FbVr, QL, Qp, rho, c,
    Cas, Mas, Ram, Rae, Rat, bl2OverSd2, Pg_pk,
    Car, Caf, alphaR, alphaF, fcR, qtcR,
    Mapf, Rapf, Gaf, Mapr, Rapr, Gar,
    SpFront: Math.max(1e-5, p.SpFront || 0.01),
    SpRear: Math.max(1e-5, p.SpRear || 0.01)
  };
}

function evalBandPassFrequency(m, f) {
  const w = 2.0 * Math.PI * Math.max(1e-3, f);

  // Impedância acústica do transdutor (mecânica pura e total com amortecimento elétrico)
  const zAdmRe = m.Ram;
  const zAdmIm = (w * m.Mas) - (1.0 / (w * m.Cas));
  const zAdRe = m.Rat;
  const zAdIm = zAdmIm;

  // Duto frontal Zpf = Rapf + j*w*Mapf e sua admitância Ypf = 1/Zpf
  const zPfRe = m.Rapf;
  const zPfIm = w * m.Mapf;
  const zPfMag2 = Math.max(1e-30, zPfRe * zPfRe + zPfIm * zPfIm);
  const yPfRe = zPfRe / zPfMag2;
  const yPfIm = -zPfIm / zPfMag2;

  // Admitância capacitiva + perdas das câmaras
  const yCrRe = m.Gar;
  const yCrIm = w * m.Car;
  const yCfRe = m.Gaf;
  const yCfIm = w * m.Caf;

  let zLoadRe = 0, zLoadIm = 0;
  // Razões complexas U_pf / U_c, U_pr / U_c e U_out / U_c
  let rPfRe = 0, rPfIm = 0;
  let rPrRe = 0, rPrIm = 0;
  let rOutRe = 0, rOutIm = 0;

  if (m.boxType === 'bp4') {
    // Câmara traseira selada: Zr = 1 / Ycr
    const yCrMag2 = Math.max(1e-30, yCrRe * yCrRe + yCrIm * yCrIm);
    const zRRe = yCrRe / yCrMag2;
    const zRIm = -yCrIm / yCrMag2;

    // Câmara frontal dutada: Yf = Ycf + Ypf, Zf = 1 / Yf
    const yFRe = yCfRe + yPfRe;
    const yFIm = yCfIm + yPfIm;
    const yFMag2 = Math.max(1e-30, yFRe * yFRe + yFIm * yFIm);
    const zFRe = yFRe / yFMag2;
    const zFIm = -yFIm / yFMag2;

    zLoadRe = zRRe + zFRe;
    zLoadIm = zRIm + zFIm;

    // Upf / Uc = Zf * Ypf
    rPfRe = zFRe * yPfRe - zFIm * yPfIm;
    rPfIm = zFRe * yPfIm + zFIm * yPfRe;
    rOutRe = rPfRe;
    rOutIm = rPfIm;
  } else {
    // Duto traseiro/acoplador Zpr = Rapr + j*w*Mapr e sua admitância Ypr = 1/Zpr
    const zPrRe = m.Rapr;
    const zPrIm = w * m.Mapr;
    const zPrMag2 = Math.max(1e-30, zPrRe * zPrRe + zPrIm * zPrIm);
    const yPrRe = zPrRe / zPrMag2;
    const yPrIm = -zPrIm / zPrMag2;

    if (m.bp6Mode === 'series') {
      // BP6 Série: malha nodal 2x2 (VR acopla em VF via Ypr; VF radia ao exterior via Ypf)
      // A = Ycr + Ypr, B = Ycf + Ypr + Ypf, Delta = A*B - Ypr^2
      const aRe = yCrRe + yPrRe, aIm = yCrIm + yPrIm;
      const bRe = yCfRe + yPrRe + yPfRe, bIm = yCfIm + yPrIm + yPfIm;
      const abRe = aRe * bRe - aIm * bIm;
      const abIm = aRe * bIm + aIm * bRe;
      const c2Re = yPrRe * yPrRe - yPrIm * yPrIm;
      const c2Im = 2.0 * yPrRe * yPrIm;
      const detRe = abRe - c2Re;
      const detIm = abIm - c2Im;
      const detMag2 = Math.max(1e-30, detRe * detRe + detIm * detIm);

      // Soma Ysum = Ycr + Ycf + Ypf
      const sumRe = yCrRe + yCfRe + yPfRe;
      const sumIm = yCrIm + yCfIm + yPfIm;

      // Zload = Ysum / Delta
      zLoadRe = (sumRe * detRe + sumIm * detIm) / detMag2;
      zLoadIm = (sumIm * detRe - sumRe * detIm) / detMag2;

      // Upf / Uc = (Ycr * Ypf) / Delta
      const numFRe = yCrRe * yPfRe - yCrIm * yPfIm;
      const numFIm = yCrRe * yPfIm + yCrIm * yPfRe;
      rPfRe = (numFRe * detRe + numFIm * detIm) / detMag2;
      rPfIm = (numFIm * detRe - numFRe * detIm) / detMag2;

      // Upr / Uc = -(Ysum * Ypr) / Delta = -Zload * Ypr
      rPrRe = -(zLoadRe * yPrRe - zLoadIm * yPrIm);
      rPrIm = -(zLoadRe * yPrIm + zLoadIm * yPrRe);

      // Radiação externa sai apenas pelo duto frontal Upf
      rOutRe = rPfRe;
      rOutIm = rPfIm;
    } else {
      // BP6 Paralela: ambas câmaras dutadas ao exterior (radiação Uout = Upf + Upr)
      const yRRe = yCrRe + yPrRe;
      const yRIm = yCrIm + yPrIm;
      const yRMag2 = Math.max(1e-30, yRRe * yRRe + yRIm * yRIm);
      const zRRe = yRRe / yRMag2;
      const zRIm = -yRIm / yRMag2;

      const yFRe = yCfRe + yPfRe;
      const yFIm = yCfIm + yPfIm;
      const yFMag2 = Math.max(1e-30, yFRe * yFRe + yFIm * yFIm);
      const zFRe = yFRe / yFMag2;
      const zFIm = -yFIm / yFMag2;

      zLoadRe = zRRe + zFRe;
      zLoadIm = zRIm + zFIm;

      // Upf / Uc = +Zf * Ypf ; Upr / Uc = -Zr * Ypr (face traseira em oposição de fase)
      rPfRe = zFRe * yPfRe - zFIm * yPfIm;
      rPfIm = zFRe * yPfIm + zFIm * yPfRe;
      rPrRe = -(zRRe * yPrRe - zRIm * yPrIm);
      rPrIm = -(zRRe * yPrIm + zRIm * yPrRe);

      rOutRe = rPfRe + rPrRe;
      rOutIm = rPfIm + rPrIm;
    }
  }

  // Uc / Pg = 1 / (Zad + Zload)
  const zTotRe = zAdRe + zLoadRe;
  const zTotIm = zAdIm + zLoadIm;
  const zTotMag2 = Math.max(1e-30, zTotRe * zTotRe + zTotIm * zTotIm);
  const ucRe = zTotRe / zTotMag2;
  const ucIm = -zTotIm / zTotMag2;

  // Uout / Pg = (Uc / Pg) * (Uout / Uc)
  const uOutRe = ucRe * rOutRe - ucIm * rOutIm;
  const uOutIm = ucRe * rOutIm + ucIm * rOutRe;

  // Função de transferência acústica normalizada H(jw) = j*w*Mas * (Uout / Pg)
  const wMas = w * m.Mas;
  const H_re = -wMas * uOutIm;
  const H_im = wMas * uOutRe;

  // Magnitudes de velocidade de volume de pico em Pe (m³/s) e transferência individual de cada duto
  const ucNormMag = Math.hypot(ucRe, ucIm);
  const Uc_mag = m.Pg_pk * ucNormMag;
  const rPfMag = Math.hypot(rPfRe, rPfIm);
  const rPrMag = Math.hypot(rPrRe, rPrIm);
  const Upf_mag = Uc_mag * rPfMag;
  const Upr_mag = Uc_mag * rPrMag;
  const Hf_mag = wMas * ucNormMag * rPfMag;
  const Hr_mag = wMas * ucNormMag * rPrMag;

  // Impedância elétrica de entrada complexa real: Zin = Re + (Bl/Sd)^2 / (Zadm + Zload)
  const zMechRe = zAdmRe + zLoadRe;
  const zMechIm = zAdmIm + zLoadIm;
  const zMechMag2 = Math.max(1e-30, zMechRe * zMechRe + zMechIm * zMechIm);
  const Zin_re = m.Re + (m.bl2OverSd2 * zMechRe) / zMechMag2;
  const Zin_im = -(m.bl2OverSd2 * zMechIm) / zMechMag2;

  return { H_re, H_im, Hf_mag, Hr_mag, Uc_mag, Upf_mag, Upr_mag, Zin_re, Zin_im };
}

// =========================================================================
// MOTOR TMM / ABCD 1D ACOPLADO — PLANAR HORN / CAIXA EUCLIDES
// Combina circuito eletromecânico Thiele-Small, câmara traseira dutada (Vb, Fb, QL),
// guia de onda frontal 1D com atenuação visco-térmica e impedância de radiação
// de Beranek em semi-espaço 2pi, diferenciando Planar Quadrado vs Triângulo/Euclides.
// =========================================================================
function resolvePlanarTunnelGeometry({ A, B, t, nDrivers, planarStyle, recuoGInput }) {
  const A_mm = Math.max(150, parseFloat(A) || 550);
  const B_mm = Math.max(150, parseFloat(B) || 480);
  const t_mm = Math.max(6, parseFloat(t) || 18);
  const nDrv = Math.max(1, parseInt(nDrivers, 10) || 1);
  const style = (planarStyle === 'triangle') ? 'triangle' : 'square';
  const rawG = parseFloat(recuoGInput);
  const isAutoG = !Number.isFinite(rawG) || rawG <= 0;
  const recuoG = isAutoG
    ? Math.round(Math.max(120, Math.min(280, B_mm * 0.42)))
    : Math.round(Math.max(80, Math.min(600, rawG)));

  const nBays = (nDrv >= 2) ? 2 : 1;
  const bayA_mm = (nBays === 2) ? Math.max(120, (A_mm - t_mm) / 2.0) : A_mm;

  let C4 = null, Z_leg = null, S_side = null, Z_hyp = null;
  let St_bay_m2, Pt_bay_m;

  if (style === 'triangle') {
    Z_leg = Math.round(Math.min(A_mm, B_mm) * 0.22);
    S_side = Math.round(Math.max(40, B_mm - 2 * Z_leg));
    Z_hyp = Math.round(Z_leg * Math.SQRT2);
    // Seção octogonal do túnel por baia: A_bay*B - 4*(0.5*zl^2) = A_bay*B - 2*zl^2
    const zlBay = (nBays === 2) ? Math.min(Z_leg, bayA_mm * 0.28) : Z_leg;
    const a_m = bayA_mm / 1000.0;
    const b_m = B_mm / 1000.0;
    const z_m = zlBay / 1000.0;
    St_bay_m2 = Math.max(0.01, a_m * b_m - 2.0 * z_m * z_m);
    Pt_bay_m = Math.max(0.2, 2.0 * (a_m - 2.0 * z_m) + 2.0 * (b_m - 2.0 * z_m) + 4.0 * Math.SQRT2 * z_m);
  } else {
    C4 = Math.max(50.0, Math.round(B_mm - Math.min(110, B_mm * 0.18) - t_mm));
    // Seção retangular do túnel frontal acima da divisória: bayA x C4
    const a_m = bayA_mm / 1000.0;
    const c4_m = C4 / 1000.0;
    St_bay_m2 = Math.max(0.01, a_m * c4_m);
    Pt_bay_m = Math.max(0.2, 2.0 * (a_m + c4_m));
  }

  const St_total_m2 = St_bay_m2 * nBays;
  const rh_m = (2.0 * St_bay_m2) / Pt_bay_m;
  const aMouth_m = Math.sqrt(St_total_m2 / Math.PI);
  const Lt_m = recuoG / 1000.0;

  return {
    style, recuoG, isAutoG, C4, Z_leg, S_side, Z_hyp,
    nBays, St_m2: St_total_m2, Pt_m: Pt_bay_m * nBays, rh_m, aMouth_m, Lt_m
  };
}

function buildPlanarAcousticModel(p) {
  const Fs = Math.max(10.0, p.Fs || 40.0);
  const Qms = Math.max(0.2, p.Qms || 7.0);
  const Qts_in = Math.max(0.05, Math.min(Qms * 0.95, p.Qts || 0.40));
  const Qes = Math.max(0.05, p.Qes || ((Qts_in * Qms) / Math.max(0.05, Qms - Qts_in)));
  const Qts = (Qms * Qes) / (Qms + Qes);
  const Re = Math.max(0.2, p.Re || 4.0);
  const Vas = Math.max(0.1, p.Vas || 50.0);
  const Sd_m2 = Math.max(1e-4, p.Sd_m2 || 0.05);
  const Pe = Math.max(1.0, p.Pe || 100.0);
  const Vb = Math.max(0.5, p.Vb || 50.0);
  const Fb = Math.max(10.0, p.Fb || Fs);
  const QL = Math.max(1.0, p.QL || 7.0);
  const Qp = Math.max(10.0, p.Qp || 60.0);
  const rho = Math.max(0.5, p.rho || 1.205585);
  const c = Math.max(200.0, p.c || 343.37);
  const Sp = Math.max(1e-5, p.SpFront || p.Sp || 0.01);

  const ws = 2.0 * Math.PI * Fs;
  const rhoC2 = rho * c * c;
  const Cas = (Vas / 1000.0) / rhoC2;
  const Mas = 1.0 / (ws * ws * Cas);
  const Ram = (ws * Mas) / Qms;
  const Rae = (ws * Mas) / Qes;
  const Rat = Ram + Rae;
  const bl2OverSd2 = Rae * Re;
  const Pg_pk = Math.sqrt(2.0 * Pe * Rae);

  const Cab = (Vb / 1000.0) / rhoC2;
  const wb = 2.0 * Math.PI * Fb;
  const Map = 1.0 / (wb * wb * Cab);
  const Rap = (wb * Map) / Qp;
  const Gab = (wb * Cab) / QL;

  const planarStyle = (p.planarStyle === 'triangle') ? 'triangle' : 'square';
  const Lt_m = Math.max(0.05, (p.planarTunnelMm || 200) / 1000.0);
  const St_m2 = Math.max(0.01, p.planarSt_m2 || Math.max(Sd_m2 * 1.45, 0.16));
  const rh_m = Math.max(0.02, p.planarRh_m || Math.sqrt(St_m2 / Math.PI));
  const aMouth_m = Math.max(0.05, p.planarAMouth_m || Math.sqrt(St_m2 / Math.PI));
  const Z0 = (rho * c) / St_m2;

  // Correção de extremidade de Beranek em semi-espaço 2pi: dEnd = (8 / 3pi) * aMouth
  const dEnd_m = (8.0 / (3.0 * Math.PI)) * aMouth_m;
  const Leff_m = Lt_m + dEnd_m;
  const fQuarterWave = c / (4.0 * Leff_m);
  const fHalfWave = c / (2.0 * Leff_m);

  // Atenuação visco-térmica de Kirchhoff-Benade nas paredes do túnel (ar a 20°C)
  const nuAir = 1.516e-5;
  const thermoFactor = 1.4747; // 1 + (gamma - 1) / sqrt(Pr)
  const alphaWallCoef = (thermoFactor * Math.sqrt(nuAir / 2.0)) / (rh_m * c);
  const QtWaveguide = (planarStyle === 'triangle') ? 24.0 : 20.0;

  return {
    boxType: 'planar', planarStyle,
    Fs, Qms, Qes, Qts, Re, Vas, Sd_m2, Pe, Vb, Fb, QL, Qp, rho, c, Sp,
    Cas, Mas, Ram, Rae, Rat, bl2OverSd2, Pg_pk,
    Cab, Map, Rap, Gab,
    Lt_m, St_m2, rh_m, aMouth_m, Z0, dEnd_m, Leff_m,
    fQuarterWave, fHalfWave, alphaWallCoef, QtWaveguide
  };
}

function evalPlanarFrequency(m, f) {
  const w = 2.0 * Math.PI * Math.max(1e-3, f);
  const k = w / m.c;

  // 1. Impedância acústica do transdutor
  const zAdmRe = m.Ram;
  const zAdmIm = (w * m.Mas) - (1.0 / (w * m.Cas));
  const zAdRe = m.Rat;
  const zAdIm = zAdmIm;

  // 2. Câmara traseira dutada (Vb, QL, Fb)
  const yCbRe = m.Gab;
  const yCbIm = w * m.Cab;
  const zPRe = m.Rap;
  const zPIm = w * m.Map;
  const zPMag2 = Math.max(1e-30, zPRe * zPRe + zPIm * zPIm);
  const yPRe = zPRe / zPMag2;
  const yPIm = -zPIm / zPMag2;

  const yRRe = yCbRe + yPRe;
  const yRIm = yCbIm + yPIm;
  const yRMag2 = Math.max(1e-30, yRRe * yRRe + yRIm * yRIm);
  const zRRe = yRRe / yRMag2;
  const zRIm = -yRIm / yRMag2;

  // 3. Matriz de Transferência Acústica 1D (ABCD) do Túnel Frontal
  const alphaAtten = m.alphaWallCoef * Math.sqrt(w) + (k / (2.0 * m.QtWaveguide));
  const aL = Math.min(20.0, alphaAtten * m.Lt_m);
  const bL = k * m.Lt_m;
  const chA = Math.cosh(aL);
  const shA = Math.sinh(aL);
  const cosB = Math.cos(bL);
  const sinB = Math.sin(bL);

  const aRe = chA * cosB;
  const aIm = shA * sinB;
  const sRe = shA * cosB;
  const sIm = chA * sinB;
  const bRe = m.Z0 * sRe;
  const bIm = m.Z0 * sIm;
  const cRe = sRe / m.Z0;
  const cIm = sIm / m.Z0;

  // 4. Impedância de radiação de boca em semi-espaço 2pi (Beranek)
  const ka = k * m.aMouth_m;
  const ka2 = ka * ka;
  const rr = ka2 / (2.0 + ka2);
  const xr = ((8.0 / (3.0 * Math.PI)) * ka) / (1.0 + 0.48 * ka2);
  const zRadRe = m.Z0 * rr;
  const zRadIm = m.Z0 * xr;

  const numTRe = (aRe * zRadRe - aIm * zRadIm) + bRe;
  const numTIm = (aRe * zRadIm + aIm * zRadRe) + bIm;
  const denTRe = (cRe * zRadRe - cIm * zRadIm) + aRe;
  const denTIm = (cRe * zRadIm + cIm * zRadRe) + aIm;
  const denTMag2 = Math.max(1e-30, denTRe * denTRe + denTIm * denTIm);

  const zThRe = (numTRe * denTRe + numTIm * denTIm) / denTMag2;
  const zThIm = (numTIm * denTRe - numTRe * denTIm) / denTMag2;
  const tuRe = denTRe / denTMag2;
  const tuIm = -denTIm / denTMag2;

  // 5. Solução da rede acoplada (Planar Quadrado vs Triângulo / Euclides)
  let zLoadRe, zLoadIm;
  let rMouthConeRe, rMouthConeIm;
  let rMouthPortRe, rMouthPortIm;
  let rPortRawRe, rPortRawIm;

  const zrCbRe = zRRe * yCbRe - zRIm * yCbIm;
  const zrCbIm = zRRe * yCbIm + zRIm * yCbRe;

  if (m.planarStyle === 'triangle') {
    // Triângulo / Euclides: duto acoplado na garganta do túnel octogonal (z = 0)
    const yPZthRe = yPRe * zThRe - yPIm * zThIm;
    const yPZthIm = yPRe * zThIm + yPIm * zThRe;
    const dCoupRe = 1.0 + (zrCbRe * yPZthRe - zrCbIm * yPZthIm);
    const dCoupIm = (zrCbRe * yPZthIm + zrCbIm * yPZthRe);
    const dCoupMag2 = Math.max(1e-30, dCoupRe * dCoupRe + dCoupIm * dCoupIm);

    const rU1Re = (zrCbRe * dCoupRe + zrCbIm * dCoupIm) / dCoupMag2;
    const rU1Im = (zrCbIm * dCoupRe - zrCbRe * dCoupIm) / dCoupMag2;

    const z1Re = rU1Re * zThRe - rU1Im * zThIm;
    const z1Im = rU1Re * zThIm + rU1Im * zThRe;
    zLoadRe = zRRe + (zrCbRe * z1Re - zrCbIm * z1Im);
    zLoadIm = zRIm + (zrCbRe * z1Im + zrCbIm * z1Re);

    rPortRawRe = rU1Re - 1.0;
    rPortRawIm = rU1Im;

    rMouthConeRe = tuRe;
    rMouthConeIm = tuIm;
    rMouthPortRe = tuRe * rPortRawRe - tuIm * rPortRawIm;
    rMouthPortIm = tuRe * rPortRawIm + tuIm * rPortRawRe;
  } else {
    // Quadrado: cone alimenta o túnel frontal (A×C4); duto sai paralelo no plano da boca
    zLoadRe = zRRe + zThRe;
    zLoadIm = zRIm + zThIm;

    rPortRawRe = zrCbRe - 1.0;
    rPortRawIm = zrCbIm;

    rMouthConeRe = tuRe;
    rMouthConeIm = tuIm;
    rMouthPortRe = rPortRawRe;
    rMouthPortIm = rPortRawIm;
  }

  // Soma vetorial complexa das velocidades de volume na boca (túnel + duto)
  const rOutRe = rMouthConeRe + rMouthPortRe;
  const rOutIm = rMouthConeIm + rMouthPortIm;

  // 6. Velocidade de volume do cone Uc / Pg = 1 / (Zad + Zload)
  const zTotRe = zAdRe + zLoadRe;
  const zTotIm = zAdIm + zLoadIm;
  const zTotMag2 = Math.max(1e-30, zTotRe * zTotRe + zTotIm * zTotIm);
  const ucRe = zTotRe / zTotMag2;
  const ucIm = -zTotIm / zTotMag2;

  const uOutRe = ucRe * rOutRe - ucIm * rOutIm;
  const uOutIm = ucRe * rOutIm + ucIm * rOutRe;

  // Transferência normalizada em semi-espaço 2pi: H(jw) = j*w*Mas * (Uout / Pg)
  const wMas = w * m.Mas;
  const H_re = -wMas * uOutIm;
  const H_im = wMas * uOutRe;

  const ucNormMag = Math.hypot(ucRe, ucIm);
  const Uc_mag = m.Pg_pk * ucNormMag;
  const Up_mag = Uc_mag * Math.hypot(rPortRawRe, rPortRawIm);
  const Hcone_mag = wMas * ucNormMag * Math.hypot(rMouthConeRe, rMouthConeIm);
  const Hvent_mag = wMas * ucNormMag * Math.hypot(rMouthPortRe, rMouthPortIm);

  // Impedância elétrica real acoplada: Zin = Re + (Bl/Sd)^2 / (Zadm + Zload)
  const zMechRe = zAdmRe + zLoadRe;
  const zMechIm = zAdmIm + zLoadIm;
  const zMechMag2 = Math.max(1e-30, zMechRe * zMechRe + zMechIm * zMechIm);
  const Zin_re = m.Re + (m.bl2OverSd2 * zMechRe) / zMechMag2;
  const Zin_im = -(m.bl2OverSd2 * zMechIm) / zMechMag2;

  return { H_re, H_im, Hcone_mag, Hvent_mag, Uc_mag, Up_mag, Zin_re, Zin_im };
}

function onPlanarGeomChange() {
  if (document.getElementById('boxType')?.value === 'planar') recalculate();
  else updateWoodlock();
}

let bpSynthClampNote = '';

function onBpAlignPresetChange() {
  bpSynthClampNote = '';
  const sel = document.getElementById('bpAlignPreset');
  if (!sel) return;
  const key = sel.value;
  const bp4Presets = {
    butterworth:    { S: 0.707, Pa: 0.0 },
    bessel:         { S: 0.866, Pa: -1.5 },
    extended:       { S: 0.707, Pa: -2.0 },
    chebyshev_mild: { S: 0.600, Pa: 1.5 },
    chebyshev_spl:  { S: 0.500, Pa: 3.0 }
  };
  if (bp4Presets[key]) {
    const sEl = document.getElementById('bpTargetS');
    const paEl = document.getElementById('bpTargetPa');
    if (sEl) sEl.value = bp4Presets[key].S.toFixed(3);
    if (paEl) paEl.value = bp4Presets[key].Pa.toFixed(1);
  }
}

function applyBandPassSynthesis() {
  const boxType = document.getElementById('boxType')?.value || 'bp4';
  if (boxType !== 'bp4' && boxType !== 'bp6') return;

  const nDrivers = Math.max(1, parseInt(document.getElementById('simNumDrivers')?.value) || 1);
  const Fs = Math.max(10, parseFloat(document.getElementById('tsFs')?.value) || 40);
  const Qes_nom = Math.max(0.05, parseFloat(document.getElementById('tsQes')?.value) || 0.44);
  const Qms = Math.max(0.5, parseFloat(document.getElementById('tsQms')?.value) || 9.0);
  const deltaT = Math.max(0, parseFloat(document.getElementById('thermalDeltaT')?.value) || 0);
  const Qes = Qes_nom * (1.0 + 0.00393 * deltaT);
  const Qts = (Qms * Qes) / (Qms + Qes);
  const Vas = Math.max(1.0, (parseFloat(document.getElementById('tsVas')?.value) || 100) * nDrivers);

  bpSynthClampNote = '';
  let Vr, Vf, Fb, FbVr = null;
  if (boxType === 'bp4') {
    const S = Math.max(0.35, Math.min(1.20, parseFloat(document.getElementById('bpTargetS')?.value) || 0.707));
    const Pa = Math.max(-6.0, Math.min(6.0, parseFloat(document.getElementById('bpTargetPa')?.value) || 0.0));
    // Síntese canônica BP4 (Geddes 1989 / Dickason):
    // Vf = (2 * S * Qts)^2 * Vas ; B = 10^(-Pa/40) ; Qtc = 1 / (2 * S * B) ; Vr = Vas / ((Qtc/Qts)^2 - 1) ; Fb = Fc = Fs * (Qtc/Qts)
    const vfRaw = Math.pow(2.0 * S * Qts, 2) * Vas;
    Vf = Math.max(2.0, vfRaw);
    const B = Math.pow(10.0, -Pa / 40.0);
    const qtcRaw = 1.0 / (2.0 * S * B);
    const qtcMin = Qts * 1.12;
    const qtcTarget = Math.max(qtcMin, qtcRaw);
    const ratio2 = Math.pow(qtcTarget / Qts, 2);
    const vrRaw = Vas / Math.max(0.15, ratio2 - 1.0);
    Vr = Math.max(2.0, vrRaw);
    Fb = Fs * Math.sqrt(1.0 + Vas / Vr);
    if (qtcRaw < qtcMin - 1e-3) {
      bpSynthClampNote = `⚠️ Limitado por Qts=${Qts.toFixed(2)} (Qtc mín ${qtcMin.toFixed(2)} vs alvo ${qtcRaw.toFixed(2)})`;
    } else if (vfRaw < 2.0 || vrRaw < 2.0) {
      bpSynthClampNote = `⚠️ Volume mínimo de 2.0 L atingido (S/Pa ajustados)`;
    }
  } else {
    const preset = document.getElementById('bpAlignPreset')?.value || 'bp6_flat';
    // BP6 Paralela (ambas câmaras dutadas ao exterior: VR maior/grave, VF menor/médio-grave)
    if (preset === 'bp6_ext') {
      Vr = Math.max(5.0, Vas * 1.15);
      Vf = Math.max(3.0, Vas * 0.52);
      FbVr = Math.max(18.0, Fs * 0.76);
      Fb = FbVr * 1.95;
    } else if (preset === 'bp6_spl') {
      Vr = Math.max(5.0, Vas * 0.65);
      Vf = Math.max(3.0, Vas * 0.34);
      FbVr = Math.max(20.0, Fs * 1.02);
      Fb = FbVr * 1.75;
    } else {
      // bp6_flat (Quasi-Plana Paralela)
      Vr = Math.max(5.0, Vas * 0.88);
      Vf = Math.max(3.0, Vas * 0.44);
      FbVr = Math.max(18.0, Fs * 0.86);
      Fb = FbVr * 1.85;
    }
  }

  const vrEl = document.getElementById('vrInput');
  const vbEl = document.getElementById('vbInput');
  const fbEl = document.getElementById('fbInput');
  const fbVrEl = document.getElementById('fbVrInput');
  if (vrEl) vrEl.value = (Math.round(Vr * 10) / 10).toFixed(1);
  if (vbEl) vbEl.value = (Math.round(Vf * 10) / 10).toFixed(1);
  if (fbEl) fbEl.value = (Math.round(Fb * 100) / 100).toFixed(2);
  syncSliderRange('vrRange', Vr, 5);
  syncSliderRange('vbRange', Vf, 5);
  syncSliderRange('fbRange', Fb, 15);
  if (FbVr !== null && fbVrEl) {
    fbVrEl.value = (Math.round(FbVr * 10) / 10).toFixed(1);
    syncSliderRange('fbVrRange', FbVr, 15);
  }
  isAutoTune = (boxType === 'bp4');
  recalculate();
  autoSizeBandPassPorts(boxType, true);
  autofixWoodlockGeometry('síntese Band-Pass', { resetToMin: true });
}

function analyzeTransferAlignment(p) {
  const N = 320;
  const logMin = Math.log10(10);
  const logMax = Math.log10(2000);
  const freqs = new Array(N);
  const dbs = new Array(N);
  let peakDb = -999;
  let fPeak = p.Fs || 40;
  let peakIdx = 0;

  if (p.boxType === 'bass-reflex') {
    const Fs_s = Math.max(1e-3, p.Fs || 0);
    const Fb_s = Math.max(1e-3, p.Fb || 0);
    const Qts_s = Math.max(1e-3, p.Qts || 0);
    const QL_s = Math.max(0.1, p.QL || 7.0);
    const alpha_s = Math.max(0, p.alpha || 0);
    const h = Math.max(1e-6, Fb_s / Fs_s);
    const sh = Math.sqrt(h);
    const w0 = 2.0 * Math.PI * Math.sqrt(Fs_s * Fb_s);
    const a1 = (sh / Qts_s) + (1.0 / (sh * QL_s));
    const a2 = ((1.0 + alpha_s + (h * h)) / h) + (1.0 / (Qts_s * QL_s));
    const a3 = (1.0 / (sh * Qts_s)) + (sh / QL_s);
    const rho_s = p.rho || 1.205585;
    const c_s = p.c || 343.37;
    const Qes_s = Math.max(1e-3, p.Qes || Qts_s);
    const hasAcoustic = (p.Vas > 0 && p.Sd_m2 > 0 && p.Pe > 0);
    const ws_s = 2.0 * Math.PI * Fs_s;
    const Cms_s = hasAcoustic ? ((p.Vas / 1000.0) / (rho_s * c_s * c_s * p.Sd_m2 * p.Sd_m2)) : 0;
    const xRefRms = hasAcoustic ? Math.sqrt((p.Pe * Cms_s) / (ws_s * Qes_s)) : 0;
    const hpfOn = Number.isFinite(p.hpfHz) && p.hpfHz > 0;
    const hpfType = p.hpfType || 'LR24';
    let maxUp = 0;
    for (let i = 0; i < N; i++) {
      const f = Math.pow(10, logMin + (i / (N - 1)) * (logMax - logMin));
      freqs[i] = f;
      const rw = (2.0 * Math.PI * f) / w0;
      const rw2 = rw * rw;
      const dRe = rw2 * rw2 - a2 * rw2 + 1.0;
      const dIm = -a3 * rw2 * rw + a1 * rw;
      const dMag2 = dRe * dRe + dIm * dIm;
      const db = 10.0 * Math.log10(Math.max(1e-12, Math.pow(rw, 8) / dMag2));
      dbs[i] = db;
      if (db > peakDb) { peakDb = db; fPeak = f; peakIdx = i; }
      if (hasAcoustic) {
        const hpfMag = hpfOn ? evalFilterComplex(f, p.hpfHz, 'hpf', hpfType).mag : 1.0;
        const up = (2.0 * Math.PI * f * p.Sd_m2 * xRefRms / Math.sqrt(Math.max(1e-18, dMag2))) * hpfMag;
        if (up > maxUp) maxUp = up;
      }
    }
    let f3Exact = 0;
    for (let i = 1; i < N; i++) {
      if (dbs[i - 1] < -3.0 && dbs[i] >= -3.0) {
        const frac = (-3.0 - dbs[i - 1]) / Math.max(1e-9, dbs[i] - dbs[i - 1]);
        f3Exact = freqs[i - 1] + frac * (freqs[i] - freqs[i - 1]);
        break;
      }
    }
    return { f3Exact, peakDb, fPeak, maxUp };
  }

  if (p.boxType === 'bp4' || p.boxType === 'bp6') {
    const bpModel = buildBandPassAcousticModel(p);
    const hpfOn = Number.isFinite(p.hpfHz) && p.hpfHz > 0;
  const hpfType = p.hpfType || 'LR24';
  const lpfOn = Number.isFinite(p.lpfHz) && p.lpfHz > 0;
  const lpfType = p.lpfType || 'LR24';
  const wrapPi = rad => {
    let r = ((rad + Math.PI) % (2.0 * Math.PI) + 2.0 * Math.PI) % (2.0 * Math.PI) - Math.PI;
    return r;
  };
    let maxUpf = 0;
    let maxUpr = 0;

    for (let i = 0; i < N; i++) {
      const f = Math.pow(10, logMin + (i / (N - 1)) * (logMax - logMin));
      freqs[i] = f;
      const ev = evalBandPassFrequency(bpModel, f);
      const hpfMag = hpfOn ? evalFilterComplex(f, p.hpfHz, 'hpf', hpfType).mag : 1.0;
      const lpfMag = lpfOn ? evalFilterComplex(f, p.lpfHz, 'lpf', lpfType).mag : 1.0;
      const hpfLin = hpfMag * lpfMag;
      const db = 20.0 * Math.log10(Math.max(1e-6, Math.hypot(ev.H_re, ev.H_im)));
      dbs[i] = db;
      if (db > peakDb) { peakDb = db; fPeak = f; peakIdx = i; }
      const upfEff = ev.Upf_mag * hpfLin;
      const uprEff = ev.Upr_mag * hpfLin;
      if (upfEff > maxUpf) maxUpf = upfEff;
      if (uprEff > maxUpr) maxUpr = uprEff;
    }

    const thresh = peakDb - 3.0;
    let fL = freqs[0], fH = freqs[N - 1];
    // Busca bordas externas -3 dB em relação ao pico da banda passante (robusto para 2 picos Chebyshev/BP6)
    for (let i = 1; i < N; i++) {
      if (dbs[i - 1] < thresh && dbs[i] >= thresh) {
        const frac = (thresh - dbs[i - 1]) / Math.max(1e-9, dbs[i] - dbs[i - 1]);
        fL = freqs[i - 1] + frac * (freqs[i] - freqs[i - 1]);
        break;
      }
    }
    for (let i = N - 1; i >= 1; i--) {
      if (dbs[i - 1] >= thresh && dbs[i] < thresh) {
        const frac = (dbs[i - 1] - thresh) / Math.max(1e-9, dbs[i - 1] - dbs[i]);
        fH = freqs[i - 1] + frac * (freqs[i] - freqs[i - 1]);
        break;
      }
    }
    if (fH <= fL) {
      fL = Math.max(10, fPeak * 0.7);
      fH = Math.min(2000, fPeak * 1.4);
    }

    const f0 = Math.sqrt(fL * fH);
    const bw = Math.max(1.0, fH - fL);
    const octaves = Math.log2(Math.max(1.01, fH / Math.max(1.0, fL)));
    const ev0 = evalBandPassFrequency(bpModel, f0);
    const paCenterDb = 20.0 * Math.log10(Math.max(1e-6, Math.hypot(ev0.H_re, ev0.H_im)));
    const rippleDb = Math.max(0.0, peakDb - paCenterDb);

    // Parâmetros clássicos Band-Pass: Q't (Qbp), DF, S, Pa
    let qtPrime, df, sFactor, paTheoDb, symRatio;
    if (p.boxType === 'bp4') {
      // Protótipo passa-baixas equivalente: Q't = Qts * sqrt(Vas/Vf), S = 1/(2*Q't), DF = 1/Q't = 2*S
      qtPrime = bpModel.Qts * Math.sqrt(bpModel.alphaF);
      df = 1.0 / Math.max(1e-4, qtPrime);
      sFactor = 0.5 * df;
      paTheoDb = 20.0 * Math.log10(Math.max(1e-4, (1.0 + bpModel.alphaR) / Math.max(1e-4, bpModel.alphaF)));
      symRatio = bpModel.Fb / Math.max(1.0, bpModel.fcR);
    } else {
      // BP6: Q't efetivo da banda passante (F0 / BW), DF = 1/Q't, S = DF/2
      qtPrime = f0 / bw;
      df = 1.0 / Math.max(1e-4, qtPrime);
      sFactor = 0.5 * df;
      paTheoDb = paCenterDb;
      symRatio = bpModel.Fb / Math.max(1.0, bpModel.FbVr);
    }

    return {
      fL, fH, f0, bw, octaves, peakDb, paCenterDb, rippleDb, fPeak,
      qtPrime, df, sFactor, paTheoDb, symRatio,
      qtcR: bpModel.qtcR, fcR: bpModel.fcR,
      maxUpf, maxUpr
    };
  }

  if (p.boxType === 'planar') {
    // Planar Horn / Euclides: Solver TMM / ABCD 1D acoplado exato (Câmara Dutada + Túnel λ/4)
    const planarModel = buildPlanarAcousticModel(p);
    const hpfOn = Number.isFinite(p.hpfHz) && p.hpfHz > 0;
  const hpfType = p.hpfType || 'LR24';
  const lpfOn = Number.isFinite(p.lpfHz) && p.lpfHz > 0;
  const lpfType = p.lpfType || 'LR24';
  const wrapPi = rad => {
    let r = ((rad + Math.PI) % (2.0 * Math.PI) + 2.0 * Math.PI) % (2.0 * Math.PI) - Math.PI;
    return r;
  };
    let maxUp = 0;
    const peakLo = Math.max(planarModel.Fb * 1.35, 55.0);
    const peakHi = Math.min(1800.0, Math.max(planarModel.fQuarterWave * 3.0, 600.0));
    for (let i = 0; i < N; i++) {
      const f = Math.pow(10, logMin + (i / (N - 1)) * (logMax - logMin));
      freqs[i] = f;
      const ev = evalPlanarFrequency(planarModel, f);
      const mag = Math.max(1e-6, Math.hypot(ev.H_re, ev.H_im));
      const db = 20.0 * Math.log10(mag);
      dbs[i] = db;
      if (f >= peakLo && f <= peakHi && db > peakDb) {
        peakDb = db;
        fPeak = f;
        peakIdx = i;
      }
      const hpfMag = hpfOn ? evalFilterComplex(f, p.hpfHz, 'hpf', hpfType).mag : 1.0;
      const lpfMag = lpfOn ? evalFilterComplex(f, p.lpfHz, 'lpf', lpfType).mag : 1.0;
      const hpfLin = hpfMag * lpfMag;
      const upVal = ev.Up_mag * hpfLin;
      if (upVal > maxUp) maxUp = upVal;
    }
    if (peakDb < -900) { peakDb = 0; fPeak = planarModel.fQuarterWave; }
    // Vale real λ/2 acoplado (mínimo local de |H(jw)| acima do pico λ/4 considerando dispersão de Beranek xr(ka))
    let dipDb = 999;
    let fDip = Math.min(2000.0, fPeak * 2.0);
    const dipLo = fPeak * 1.15;
    const dipHi = Math.min(2000.0, fPeak * 3.8);
    for (let i = 0; i < N; i++) {
      const f = freqs[i];
      if (f >= dipLo && f <= dipHi && dbs[i] < dipDb) {
        dipDb = dbs[i];
        fDip = f;
      }
    }
    let f3Planar = planarModel.Fb;
    for (let i = 1; i < N; i++) {
      if (dbs[i - 1] < -3.0 && dbs[i] >= -3.0) {
        const frac = (-3.0 - dbs[i - 1]) / Math.max(1e-9, dbs[i] - dbs[i - 1]);
        f3Planar = freqs[i - 1] + frac * (freqs[i] - freqs[i - 1]);
        break;
      }
    }
    return {
      f3Exact: f3Planar,
      peakDb,
      fPeak,
      dipDb: dipDb < 900 ? dipDb : 0,
      fDip,
      fQuarterWave: fPeak,
      fHalfWave: fDip,
      fQuarterWaveGeo: planarModel.fQuarterWave,
      maxUp
    };
  }

  return { f3Exact: 0, peakDb: 0, fPeak: p.Fs || 40 };
}

let lastInputValidationError = null;

function recalculate() {
  const boxType = document.getElementById('boxType').value;
  const isVented = (boxType === 'bass-reflex' || boxType === 'bp4' || boxType === 'bp6' || boxType === 'planar');
  const isBP = (boxType === 'bp4' || boxType === 'bp6');
  document.getElementById('portControls').style.display = (isVented ? 'block' : 'none');

  const bpCtrl = document.getElementById('bpControls');
  const bp6Extra = document.getElementById('bp6ExtraRow');
  const bp4Synth = document.getElementById('bp4SynthParams');
  const bp6Synth = document.getElementById('bp6SynthBtnRow');
  const bpPresetSel = document.getElementById('bpAlignPreset');
  const vbLbl = document.getElementById('vbInputLabel');
  const portVfHdr = document.getElementById('portVfHeader');
  const portVrSec = document.getElementById('portVrSection');
  const portVrHdr = document.getElementById('portVrHeader');
  const portVrRound = document.getElementById('portVrRoundFields');
  if (bpCtrl) bpCtrl.style.display = isBP ? 'flex' : 'none';
  if (bp6Extra) bp6Extra.style.display = (boxType === 'bp6') ? 'flex' : 'none';
  if (bp4Synth) bp4Synth.style.display = (boxType === 'bp4') ? 'flex' : 'none';
  if (bp6Synth) bp6Synth.style.display = (boxType === 'bp6') ? 'flex' : 'none';
  if (bpPresetSel && isBP) {
    const opts = bpPresetSel.options ? Array.from(bpPresetSel.options) : [];
    opts.forEach(opt => {
      const optIsBp6 = String(opt.value || '').startsWith('bp6_');
      const hide = (boxType === 'bp6') ? !optIsBp6 : optIsBp6;
      opt.hidden = hide;
      opt.disabled = hide;
    });
    const isBp6Val = String(bpPresetSel.value || '').startsWith('bp6_');
    if (boxType === 'bp6' && !isBp6Val) bpPresetSel.value = 'bp6_flat';
    else if (boxType === 'bp4' && isBp6Val) {
      bpPresetSel.value = 'butterworth';
      onBpAlignPresetChange();
    }
  }
  if (vbLbl) vbLbl.textContent = isBP ? 'Câm. Front. VF (L):' : 'Vol. Vb (L):';
  if (portVfHdr) portVfHdr.style.display = isBP ? 'block' : 'none';
  if (portVrSec) portVrSec.style.display = (boxType === 'bp6') ? 'flex' : 'none';

  const portType = document.getElementById('portType')?.value || 'round';
  const isSlot = (portType === 'slot' || portType === 'slot_wall');
  const isTri = (portType === 'triangle');
  if (portVrHdr) portVrHdr.textContent = 'Câmara Traseira (VR — Paralela)';
  if (portVrRound) portVrRound.style.display = (boxType === 'bp6' && !isSlot) ? 'flex' : 'none';
  const roundFields = document.getElementById('portRoundFields');
  const slotFields = document.getElementById('portSlotFields');
  const triFields = document.getElementById('portTriFields');
  if (roundFields) roundFields.style.display = (!isSlot && !isTri) ? 'flex' : 'none';
  if (slotFields) slotFields.style.display = isSlot ? 'flex' : 'none';
  if (triFields) triFields.style.display = isTri ? 'flex' : 'none';

  const nDrivers = Math.max(1, parseInt(document.getElementById('simNumDrivers')?.value) || 1);
  const deltaT = Math.max(0, parseFloat(document.getElementById('thermalDeltaT')?.value) || 0);

  const Fs = parseFloat(document.getElementById('tsFs').value);
  const Qes_nom = parseFloat(document.getElementById('tsQes').value);
  const Qms = parseFloat(document.getElementById('tsQms').value);
  const Re_nom = parseFloat(document.getElementById('tsRe').value);
  const Le_mH = Math.max(0, parseFloat(document.getElementById('tsLe')?.value) || 0);
  const Vas_single = parseFloat(document.getElementById('tsVas').value);
  const Pe_single = parseFloat(document.getElementById('tsPe').value);
  const Sd_single_m2 = parseFloat(document.getElementById('tsSd').value) / 10000.0;
  const Xmax_mm = parseFloat(document.getElementById('tsXmax').value);
  const Vsub_single = parseFloat(document.getElementById('tsVsub').value);
  const diaNom = parseFloat(document.getElementById('tsDia')?.value) || 15;

  // Compressão térmica da bobina (Re(T) = Re * (1 + alpha_cu * deltaT))
  const thermalFactor = 1.0 + 0.00393 * deltaT;
  const Re = Re_nom * thermalFactor;
  const Qes = Qes_nom * thermalFactor;
  const powerCompDb = deltaT > 0 ? (-10.0 * Math.log10(thermalFactor)) : 0.0;

  // Acoplamento acústico de N drivers idênticos em câmara comum
  const Vas = Vas_single * nDrivers;
  const Sd_m2 = Sd_single_m2 * nDrivers;
  const Pe = Pe_single * nDrivers;
  const Vsub = Vsub_single * nDrivers;

  const Vb = parseFloat(document.getElementById('vbInput').value);
  const VrRaw = parseFloat(document.getElementById('vrInput')?.value);
  const fbRawGate = parseFloat(document.getElementById('fbInput')?.value);
  const fbVrRawGate = parseFloat(document.getElementById('fbVrInput')?.value);
  const QL = parseFloat(document.getElementById('qlInput').value);
  const tempC = parseFloat(document.getElementById('tempInput').value);
  const cabinM = parseFloat(document.getElementById('cabinLen').value);
  const rawLe = parseFloat(document.getElementById('tsLe')?.value);
  const isPosFin = v => Number.isFinite(v) && v > 0;
  if (
    !isPosFin(Vb) ||
    !isPosFin(Fs) ||
    !isPosFin(Qes_nom) ||
    !isPosFin(Qms) ||
    !isPosFin(Re_nom) ||
    !isPosFin(Vas_single) ||
    !isPosFin(Pe_single) ||
    !isPosFin(Sd_single_m2) ||
    !isPosFin(Xmax_mm) ||
    !isPosFin(QL) ||
    !isPosFin(cabinM) ||
    !Number.isFinite(tempC) || tempC <= -273.15 ||
    (Number.isFinite(rawLe) && rawLe < 0) ||
    (isBP && Number.isFinite(VrRaw) && VrRaw <= 0) ||
    (isVented && !isAutoTune && Number.isFinite(fbRawGate) && fbRawGate <= 0) ||
    (boxType === 'bp6' && !isAutoTune && Number.isFinite(fbVrRawGate) && fbVrRawGate <= 0)
  ) {
    lastInputValidationError = 'Parâmetros físicos inválidos (valores ≤ 0, NaN, Le < 0, Fb/Vr ≤ 0 ou T ≤ -273.15 °C).';
    return;
  }
  lastInputValidationError = null;
  const Vr = Math.max(0.5, Number.isFinite(VrRaw) && VrRaw > 0 ? VrRaw : (Vb * 0.75));
  const bp6Mode = document.getElementById('bp6Mode')?.value || 'parallel';
  const fbVrRaw = parseFloat(document.getElementById('fbVrInput')?.value);
  let FbVr = Math.max(15.0, (Number.isFinite(fbVrRaw) && fbVrRaw > 0) ? fbVrRaw : 35.0);
  const hpfRaw = parseFloat(document.getElementById('hpfCutoff').value);
  const hpfHz = isHpfEnabled ? (Number.isFinite(hpfRaw) && hpfRaw > 0 && hpfRaw < 20000 ? hpfRaw : 0) : 0;
  const hpfType = document.getElementById('hpfType')?.value || 'LR24';
  const lpfRaw = parseFloat(document.getElementById('lpfCutoff')?.value);
  const lpfHz = isLpfEnabled ? (Number.isFinite(lpfRaw) && lpfRaw > 0 && lpfRaw < 20000 ? lpfRaw : 0) : 0;
  const lpfType = document.getElementById('lpfType')?.value || 'LR24';

  const dspIssues = [];
  if (isHpfEnabled && (!Number.isFinite(hpfRaw) || hpfRaw <= 0 || hpfRaw >= 20000)) {
    dspIssues.push({
      id: 'G4', code: 'DSP_HPF_INVALID', severity: 'critical',
      badge: 'HPF inválido', value: hpfRaw, limit: 20000, freq: null,
      message: `Frequência HPF inválida (${Number.isFinite(hpfRaw) ? hpfRaw : 'NaN'} Hz): exige 0 < fc < 20000 Hz.`
    });
  }
  if (isLpfEnabled && (!Number.isFinite(lpfRaw) || lpfRaw <= 0 || lpfRaw >= 20000)) {
    dspIssues.push({
      id: 'G4', code: 'DSP_LPF_INVALID', severity: 'critical',
      badge: 'LPF inválido', value: lpfRaw, limit: 20000, freq: null,
      message: `Frequência LPF inválida (${Number.isFinite(lpfRaw) ? lpfRaw : 'NaN'} Hz): exige 0 < fc < 20000 Hz.`
    });
  }
  if (isHpfEnabled && isLpfEnabled && hpfHz > 0 && lpfHz > 0 && hpfHz >= lpfHz) {
    dspIssues.push({
      id: 'G4', code: 'DSP_HPF_GE_LPF', severity: 'critical',
      badge: `HPF ≥ LPF`, value: hpfHz, limit: lpfHz, freq: hpfHz,
      message: `Sobreposição proibida de crossover: HPF (${hpfHz.toFixed(0)} Hz) ≥ LPF (${lpfHz.toFixed(0)} Hz) — cancelamento total da banda útil.`
    });
  }

  const numD = parseInt(document.getElementById('numDucts').value) || 1;
  const dDia = parseFloat(document.getElementById('ductDia').value) || 4.0;
  const dThick = parseFloat(document.getElementById('ductThick').value) || 1.5;
  const numDVr = Math.max(1, parseInt(document.getElementById('numDuctsVr')?.value) || 1);
  const dDiaVr = Math.max(1.0, parseFloat(document.getElementById('ductDiaVr')?.value) || 4.0);
  const dThickVr = Math.max(0.5, parseFloat(document.getElementById('ductThickVr')?.value) || 1.5);
  const slotW = parseFloat(document.getElementById('slotW')?.value) || 35.0;
  const slotH = parseFloat(document.getElementById('slotH')?.value) || 6.0;
  const slotWallThick = parseFloat(document.getElementById('slotWallThick')?.value) || 18.0;
  const triCount = parseInt(document.getElementById('triCount')?.value) || 2;
  const triA = parseFloat(document.getElementById('triA')?.value) || 14.0;
  const triB = parseFloat(document.getElementById('triB')?.value) || 14.0;

  const Qts = (Qms * Qes) / (Qms + Qes);
  const c = 20.0547605 * Math.sqrt(273.15 + tempC);
  const rho = 1.205585 * (293.15 / (273.15 + tempC));
  const EBP = Fs / Qes;
  const Vd = Sd_m2 * (Xmax_mm / 1000.0) * 1000.0;
  const F100 = c / cabinM;

  // Atualiza pílulas de aptidão de topologia para o driver atual
  const suit = computeTopologySuitability({ EBP: Fs / Qes_nom, Qts: (Qms * Qes_nom) / (Qms + Qes_nom), dia: diaNom });
  document.querySelectorAll('#topoSuitPills .topo-pill').forEach(btn => {
    const t = btn.getAttribute('data-topo');
    const info = suit[t];
    btn.classList.remove('active', 'suit-ideal', 'suit-ok', 'suit-avoid');
    if (t === boxType) btn.classList.add('active');
    if (info) {
      btn.classList.add('suit-' + info.level);
      btn.title = info.reason;
      const dot = btn.querySelector('.topo-dot');
      if (dot) dot.style.color = info.level === 'ideal' ? '#10b981' : (info.level === 'ok' ? '#f59e0b' : '#ef4444');
    }
  });

  const thBadge = document.getElementById('thermalCompBadge');
  if (thBadge) {
    if (deltaT > 0) {
      thBadge.style.display = 'block';
      thBadge.innerHTML = `🔥 Bobina +${deltaT}°C: Re=${Re.toFixed(2)}Ω | Qts=${Qts.toFixed(3)} | <b>Perda: ${powerCompDb.toFixed(2)} dB</b>`;
    } else {
      thBadge.style.display = 'none';
    }
  }

  const no_frac = (4.0 * (Math.PI**2) / (c**3)) * ((Fs**3) * (Vas / 1000.0) / Qes);
  const spl_1w = 112.4 + 10.0 * Math.log10(no_frac);
  const spl_rated = spl_1w + 10.0 * Math.log10(Pe);

  let alpha = Vas / Vb;
  let Fb, F3, FH = 0, Vtot, LvCm = 0, DeqIn = 0, airVel = 0, airVelVr = 0, machPct = 0, qtc, fc, fgmax, fxmax, ripple = 0, alignName = '', alignSub = '', alignLabel = 'Alinhamento 4ª Ordem', alignColor = '#38bdf8', kpi2SubTxt = '';
  let fPipe1 = 0, velLimit = 17.0, portGeom = null, portGeomVr = null, bpEval = null, planarEval = null, brEvalRef = null;

  const optimalFb = Fs * Math.pow(alpha, 0.31);
  const optimalF3 = Fs * Math.pow(alpha, 0.44);
  updateFbLockButtonUI(boxType);
  const vbBadgeGlobal = document.getElementById('vbValBadge');
  if (vbBadgeGlobal) vbBadgeGlobal.textContent = Vb.toFixed(1) + ' L';

  const wlAMm = parseFloat(document.getElementById('wlWidthA')?.value) || 550;
  const wlBMm = parseFloat(document.getElementById('wlHeightB')?.value) || 480;
  const wlTMm = parseFloat(document.getElementById('wlThickness')?.value) || 18;
  const planarStyle = document.getElementById('wlPlanarStyle')?.value || 'square';
  const planarRecuoInput = document.getElementById('wlPlanarRecuoG')?.value;
  const planarTunnelGeom = resolvePlanarTunnelGeometry({
    A: wlAMm, B: wlBMm, t: wlTMm, nDrivers, planarStyle, recuoGInput: planarRecuoInput
  });
  const planarTunnelMm = planarTunnelGeom.recuoG;
  let fQuarterWave = c / (4.0 * (planarTunnelGeom.Lt_m + (8.0 / (3.0 * Math.PI)) * planarTunnelGeom.aMouth_m));
  let fHalfWave = 2.0 * fQuarterWave;

  if (isVented) {
    const tuningModeCont = document.getElementById('tuningModeContainer');
    if (tuningModeCont) tuningModeCont.style.display = 'block';
    const fbGroup = document.getElementById('fbControlGroup');
    if (fbGroup) fbGroup.style.display = 'block';

    if (boxType === 'bass-reflex' || boxType === 'planar') {
      alignLabel = (boxType === 'planar') ? 'Planar TMM (Dutada + λ/4)' : 'Alinhamento 4ª Ordem';
      if (isAutoTune) {
        const useExactAuto = (autoDesignExactFb !== null && autoDesignVbRef !== null && Math.abs(Vb - autoDesignVbRef) < 0.15);
        Fb = useExactAuto ? autoDesignExactFb : optimalFb;
        document.getElementById('fbInput').value = Fb.toFixed(2);
        syncSliderRange('fbRange', parseFloat(Fb.toFixed(2)), 10);
      } else {
        autoDesignExactFb = null;
        autoDesignVbRef = null;
        const fbRawManual = parseFloat(document.getElementById('fbInput').value);
        Fb = (Number.isFinite(fbRawManual) && fbRawManual > 0) ? fbRawManual : optimalFb;
      }
      const h_ratio = Fb / Fs;
      const brEval = analyzeTransferAlignment({
        boxType, Fs, Qes, Qms, Qts, Re, Vas, Sd_m2, Pe, Vb, alpha, Fb, QL, rho, c, hpfHz, hpfType, lpfHz, lpfType,
        planarStyle, planarTunnelMm,
        planarSt_m2: planarTunnelGeom.St_m2,
        planarRh_m: planarTunnelGeom.rh_m,
        planarAMouth_m: planarTunnelGeom.aMouth_m
      });
      if (boxType === 'planar') {
        planarEval = brEval;
        if (brEval.fQuarterWave > 0) fQuarterWave = brEval.fQuarterWave;
        if (brEval.fHalfWave > 0) fHalfWave = brEval.fHalfWave;
      }
      if (boxType === 'bass-reflex') brEvalRef = brEval;
      ripple = Math.max(0, brEval.peakDb);
      F3 = (brEval.f3Exact > 0)
        ? brEval.f3Exact
        : (isAutoTune ? optimalF3 : optimalF3 * Math.sqrt(Fb / optimalFb));

      if (boxType === 'planar') {
        const styleTag = (planarStyle === 'triangle') ? 'Triângulo/Euclides' : 'Quadrada';
        alignName = `Planar ${styleTag} (TMM)`;
        alignColor = '#14b8a6';
        alignSub = `Fb ${Fb.toFixed(1)}Hz · λ/4 ${fQuarterWave.toFixed(0)}Hz · λ/2 ${fHalfWave.toFixed(0)}Hz (G=${planarTunnelMm}mm)`;
        kpi2SubTxt = `F3/Fs = ${(F3 / Fs).toFixed(3)} · λ/4 ${fQuarterWave.toFixed(0)}Hz (+${brEval.peakDb.toFixed(1)}dB)`;
      } else if (brEval.peakDb > 2.5) {
        alignName = `C4 Pico Alto (+${brEval.peakDb.toFixed(1)} dB)`;
        alignColor = '#f59e0b';
      } else if (brEval.peakDb > 0.65) {
        alignName = `C4 Chebyshev (+${brEval.peakDb.toFixed(1)} dB)`;
        alignColor = '#38bdf8';
      } else if (isAutoTune) {
        if (h_ratio < 0.94) alignName = 'SC4 / EBS Estendido';
        else if (Qts < 0.38 && Math.abs(h_ratio - 1.0) <= 0.08) alignName = 'SBB4 (Baixo Atraso)';
        else if (Qts < 0.38) alignName = 'QB3 (Quasi-Butterworth)';
        else alignName = 'Alinhamento Ótimo (SC4/QB3)';
      } else {
        if (Math.abs(h_ratio - 1.0) < 0.06 && Qts >= 0.36 && Qts <= 0.43) alignName = 'B4 / QB3 (Plana)';
        else if (h_ratio < 0.94) alignName = 'SC4 / EBS (Manual)';
        else if (Qts < 0.38 && Math.abs(h_ratio - 1.0) <= 0.08) alignName = 'SBB4 (Baixo Atraso)';
        else alignName = 'Sintonia Manual (h=' + h_ratio.toFixed(2) + ')';
      }

      if (boxType !== 'planar') {
        alignSub = isAutoTune
          ? (brEval.peakDb > 2.5 ? `Fb = Fs·α^0.31 · Pico @ ${brEval.fPeak.toFixed(0)}Hz` : 'Fb = Fs · α^0.31')
          : `Manual · h = ${h_ratio.toFixed(3)}` + (brEval.peakDb >= 0.4 ? ` · +${brEval.peakDb.toFixed(1)}dB` : ' · Plano');
        kpi2SubTxt = `F3/Fs = ${(F3 / Fs).toFixed(3)}` + (brEval.peakDb > 0.6 ? ` · Pico +${brEval.peakDb.toFixed(1)}dB` : '');
      }
    } else if (boxType === 'bp4') {
      alignLabel = 'Alinhamento BP4 (4ª)';
      const alphaR = Vas / Vr;
      fc = Fs * Math.sqrt(1.0 + alphaR);
      qtc = Qts * Math.sqrt(1.0 + alphaR);
      // Sintonia simétrica exata BP4 (Geddes / Dickason): Fb = Fc = Fs * sqrt(1 + Vas/Vr)
      const fbOptBp4 = fc;
      const fbRawBp4 = parseFloat(document.getElementById('fbInput').value);
      Fb = isAutoTune ? fbOptBp4 : ((Number.isFinite(fbRawBp4) && fbRawBp4 > 0) ? fbRawBp4 : fbOptBp4);
      if (isAutoTune) {
        document.getElementById('fbInput').value = Fb.toFixed(2);
        syncSliderRange('fbRange', parseFloat(Fb.toFixed(2)), 15);
      }
      if (isBP) syncSliderRange('vrRange', Vr, 5);
      bpEval = analyzeTransferAlignment({
        boxType, Fs, Qes, Qms, Qts, Re, Vas, Sd_m2, Pe, Vr, Vb, Fb, QL, rho, c, hpfHz, hpfType, lpfHz, lpfType
      });
      F3 = bpEval.fL;
      FH = bpEval.fH;
      const paDb = bpEval.paCenterDb;
      const bw = bpEval.bw;
      const sVal = bpEval.sFactor;
      const qtP = bpEval.qtPrime;
      const dfVal = bpEval.df;
      if (bpEval.rippleDb > 2.0 || sVal < 0.48) {
        alignName = `BP4 Chebyshev SPL (S=${sVal.toFixed(2)})`;
        alignColor = '#f59e0b';
      } else if (sVal < 0.65) {
        alignName = `BP4 Chebyshev (S=${sVal.toFixed(2)}, +${bpEval.rippleDb.toFixed(1)}dB)`;
        alignColor = '#38bdf8';
      } else if (sVal <= 0.78) {
        alignName = `BP4 Butterworth (S=${sVal.toFixed(2)})`;
        alignColor = '#4ade80';
      } else {
        alignName = `BP4 Bessel / Suave (S=${sVal.toFixed(2)})`;
        alignColor = '#38bdf8';
      }
      alignSub = `Q't=${qtP.toFixed(2)} · DF=${dfVal.toFixed(2)} · Qtc=${qtc.toFixed(2)}`;
      kpi2SubTxt = `BW ${bw.toFixed(0)} Hz (${bpEval.octaves.toFixed(2)} oit) · Pa ${paDb >= 0 ? '+' : ''}${paDb.toFixed(1)} dB`;
    } else {
      // BP6 (Paralela ou Série)
      alignLabel = 'Alinhamento BP6 (6ª)';
      const alphaR = Vas / Vr;
      const alphaF = Vas / Vb;
      const fbVrOpt = Math.max(18.0, Fs * Math.pow(Math.max(0.2, alphaR), 0.31) * 0.88);
      const baseRatio = (bp6Mode === 'series') ? 1.65 : 1.80;
      const fbOptBp6 = Math.max(fbVrOpt * baseRatio, fbVrOpt * (baseRatio - 0.12 + 0.18 * Math.pow(Math.max(0.25, alphaF), 0.31)));
      if (isAutoTune) {
        FbVr = fbVrOpt;
        Fb = fbOptBp6;
        const fbVrEl = document.getElementById('fbVrInput');
        if (fbVrEl) fbVrEl.value = FbVr.toFixed(1);
        syncSliderRange('fbVrRange', parseFloat(FbVr.toFixed(1)), 15);
        document.getElementById('fbInput').value = Fb.toFixed(2);
        syncSliderRange('fbRange', parseFloat(Fb.toFixed(2)), 15);
      } else {
        const fbRawBp6 = parseFloat(document.getElementById('fbInput').value);
        Fb = (Number.isFinite(fbRawBp6) && fbRawBp6 > 0) ? fbRawBp6 : fbOptBp6;
        syncSliderRange('fbVrRange', parseFloat(FbVr.toFixed(1)), 15);
      }
      if (isBP) syncSliderRange('vrRange', Vr, 5);
      bpEval = analyzeTransferAlignment({
        boxType, Fs, Qes, Qms, Qts, Re, Vas, Sd_m2, Pe, Vr, Vb, FbVr, Fb, bp6Mode, QL, rho, c, hpfHz, hpfType, lpfHz, lpfType
      });
      F3 = bpEval.fL;
      FH = bpEval.fH;
      const bw = bpEval.bw;
      const ratio6 = Fb / Math.max(1.0, FbVr);
      const paDb = bpEval.paCenterDb;
      alignName = `BP6 ${bp6Mode === 'series' ? 'Série' : 'Paralela'} (${FbVr.toFixed(0)}/${Fb.toFixed(0)} Hz)`;
      alignSub = `Q't=${bpEval.qtPrime.toFixed(2)} · DF=${bpEval.df.toFixed(2)} · Razão ${ratio6.toFixed(2)}×`;
      kpi2SubTxt = `BW ${bw.toFixed(0)} Hz (${bpEval.octaves.toFixed(2)} oit) · Pa ${paDb >= 0 ? '+' : ''}${paDb.toFixed(1)} dB`;
    }

    const bpTelBox = document.getElementById('bpTelemetryBox');
    if (bpTelBox && isBP && bpEval) {
      const paSign = bpEval.paCenterDb >= 0 ? '+' : '';
      const row2 = (boxType === 'bp4')
        ? `<div><b>Qtc:</b> ${bpEval.qtcR.toFixed(2)} | <b>Fc:</b> ${bpEval.fcR.toFixed(1)} Hz | <b>Fb/Fc:</b> ${bpEval.symRatio.toFixed(2)}</div>`
        : `<div><b>FbR/FbF:</b> ${FbVr.toFixed(0)}/${Fb.toFixed(0)} Hz (${bpEval.symRatio.toFixed(2)}×) | <b>VR/VF:</b> ${(Vr / Math.max(0.5, Vb)).toFixed(2)}</div>`;
      const warnLines = [];
      if (bpSynthClampNote) warnLines.push(`<div style="color:#facc15; margin-top:2px;">${bpSynthClampNote}</div>`);
      if (boxType === 'bp4' && Math.abs(bpEval.symRatio - 1.0) > 0.08) {
        warnLines.push(`<div style="color:#facc15;">⚠️ Sintonia assimétrica (Fb/Fc=${bpEval.symRatio.toFixed(2)})</div>`);
      }
      bpTelBox.innerHTML =
        `<div><b>Q't:</b> <span style="color:#38bdf8;font-weight:700;">${bpEval.qtPrime.toFixed(3)}</span> | <b>DF:</b> <span style="color:#4ade80;font-weight:700;">${bpEval.df.toFixed(3)}</span> | <b>S:</b> <span style="color:#facc15;font-weight:700;">${bpEval.sFactor.toFixed(3)}</span></div>` +
        `<div><b>Pa:</b> ${paSign}${bpEval.paCenterDb.toFixed(1)} dB | <b>Pico:</b> ${bpEval.peakDb >= 0 ? '+' : ''}${bpEval.peakDb.toFixed(1)} dB | <b>Rip:</b> ${bpEval.rippleDb.toFixed(1)} dB</div>` +
        `<div><b>F₀:</b> ${bpEval.f0.toFixed(1)} Hz | <b>BW:</b> ${bpEval.bw.toFixed(0)} Hz (${bpEval.octaves.toFixed(2)} oit)</div>` +
        row2 + warnLines.join('');
    }

    const vbBadge = document.getElementById('vbValBadge');
    if (vbBadge) vbBadge.textContent = Vb.toFixed(1) + ' L';
    const fbBadge = document.getElementById('fbValBadge');
    if (fbBadge) fbBadge.textContent = Fb.toFixed(2) + ' Hz';

    portGeom = computePortGeometry({
      portType, numDucts: numD, ductDia: dDia, ductThick: dThick,
      slotW, slotH, slotWallThick, triCount, triA, triB, Fb, Vb, c
    });
    airVelVr = 0;
    if (boxType === 'bp6') {
      const vrPortType = (bp6Mode === 'parallel' && isSlot) ? portType : (portType === 'flared' ? 'flared' : 'round');
      portGeomVr = computePortGeometry({
        portType: vrPortType, numDucts: numDVr, ductDia: dDiaVr, ductThick: dThickVr,
        slotW, slotH, slotWallThick, triCount, triA, triB, Fb: FbVr, Vb: Vr, c
      });
      airVelVr = (bpEval && Number.isFinite(bpEval.maxUpr))
        ? (bpEval.maxUpr / Math.max(1e-6, portGeomVr.Sp))
        : (4.540262351285604 * Math.sqrt(no_frac * Pe) / (Math.max(1e-6, portGeomVr.Sp) * Math.max(1.0, FbVr)));
    }
    DeqIn = portGeom.DeqIn;
    LvCm = portGeom.LvCm;
    fPipe1 = portGeom.fPipe1;
    velLimit = portGeom.velLimit;
    Vtot = Vb + (isBP ? Vr : 0) + Vsub + portGeom.vDuto + (portGeomVr ? portGeomVr.vDuto : 0);

    airVel = (isBP && bpEval && Number.isFinite(bpEval.maxUpf))
      ? (bpEval.maxUpf / Math.max(1e-6, portGeom.Sp))
      : ((boxType === 'planar' && planarEval && Number.isFinite(planarEval.maxUp))
        ? (planarEval.maxUp / Math.max(1e-6, portGeom.Sp))
        : ((boxType === 'bass-reflex' && brEvalRef && Number.isFinite(brEvalRef.maxUp) && brEvalRef.maxUp > 0)
          ? (brEvalRef.maxUp / Math.max(1e-6, portGeom.Sp))
          : (4.540262351285604 * Math.sqrt(no_frac * Pe) / (Math.max(1e-6, portGeom.Sp) * Math.max(1.0, Fb)))));
    machPct = (airVel / c) * 100.0;

    const ptBox = document.getElementById('portTelemetryBox');
    if (ptBox) {
      const spCm2 = portGeom.Sp * 10000.0;
      const warns = [];
      if (LvCm < 1.0) warns.push('<span style="color:#f87171;">⚠️ Lv curto/negativo (aumente área ou baixe Fb)</span>');
      if (portGeom.isSlot && portGeom.aspectRatio > 8.0) warns.push(`<span style="color:#facc15;">⚠️ Razão ${portGeom.aspectRatio.toFixed(1)}:1 (&gt;8:1 atrito alto)</span>`);
      if (fPipe1 > 0 && fPipe1 < 400) warns.push(`<span style="color:#facc15;">⚠️ Tubo órgão baixo (${fPipe1.toFixed(0)} Hz)</span>`);
      if (airVel > velLimit) warns.push(`<span style="color:#f87171;">⚠️ Sopro/Chuffing (&gt;${velLimit} m/s)</span>`);
      const dimExtra = portGeom.isTri
        ? ` | <b>Hip:</b> ${portGeom.hypCm.toFixed(1)}cm`
        : (portGeom.isSlot ? ` | <b>AR:</b> ${portGeom.aspectRatio.toFixed(1)}:1` : ` | <b>Deq:</b> ${DeqIn.toFixed(2)}"`);
      ptBox.innerHTML =
        `<div><b>Sp:</b> ${spCm2.toFixed(1)} cm² | <b>Lv:</b> <span style="color:var(--accent);font-weight:700;">${LvCm.toFixed(2)} cm</span> (k=${portGeom.kEnd})</div>` +
        `<div><b>Tubo Órgão f₁:</b> <span style="color:#38bdf8;">${fPipe1.toFixed(0)} Hz</span>${dimExtra}</div>` +
        (warns.length ? `<div style="margin-top:2px;">${warns.join('<br>')}</div>` : `<div style="color:#4ade80;">✓ Escoamento limpo (&lt;${velLimit} m/s)</div>`);
    }

    const ptBoxVr = document.getElementById('portTelemetryBoxVr');
    if (ptBoxVr && portGeomVr) {
      const spVrCm2 = portGeomVr.Sp * 10000.0;
      const lvVrCm = portGeomVr.LvCm;
      const fPipeVr = portGeomVr.fPipe1;
      const warnsVr = [];
      if (lvVrCm < 1.0) warnsVr.push('<span style="color:#f87171;">⚠️ Lv VR curto/negativo (ajuste Ø VR ou Fb VR)</span>');
      if (fPipeVr > 0 && fPipeVr < 400) warnsVr.push(`<span style="color:#facc15;">⚠️ Tubo órgão VR baixo (${fPipeVr.toFixed(0)} Hz)</span>`);
      if (airVelVr > portGeomVr.velLimit) warnsVr.push(`<span style="color:#f87171;">⚠️ Sopro VR (${airVelVr.toFixed(1)} m/s &gt; ${portGeomVr.velLimit})</span>`);
      ptBoxVr.innerHTML =
        `<div><b>Sp VR:</b> ${spVrCm2.toFixed(1)} cm² | <b>Lv VR:</b> <span style="color:#c084fc;font-weight:700;">${lvVrCm.toFixed(2)} cm</span></div>` +
        `<div><b>Ar VR:</b> <span style="color:#38bdf8;">${airVelVr.toFixed(1)} m/s</span> | <b>f₁:</b> ${fPipeVr.toFixed(0)} Hz</div>` +
        (warnsVr.length ? `<div style="margin-top:2px;">${warnsVr.join('<br>')}</div>` : `<div style="color:#4ade80;">✓ Escoamento VR limpo (&lt;${portGeomVr.velLimit} m/s)</div>`);
    }

    document.getElementById('kpi1Label').textContent = isBP ? 'Sintonia VF (Fb)' : 'Sintonia Fb';
    document.getElementById('kpi1Val').textContent = Fb.toFixed(2) + ' Hz';
    document.getElementById('kpi1Sub').textContent = isBP ? (boxType === 'bp6' ? `VR @ ${FbVr.toFixed(1)} Hz` : `VR = ${Vr.toFixed(0)} L · Fc ${fc.toFixed(0)}Hz`) : ('h = ' + (Fb/Fs).toFixed(3) + (nDrivers > 1 ? ` · ${nDrivers}x` : ''));
    document.getElementById('kpi2Label').textContent = isBP ? 'Banda FL – FH' : 'Corte F3 (-3dB)';
    document.getElementById('kpi2Val').textContent = isBP ? `${F3.toFixed(0)}–${FH.toFixed(0)} Hz` : (F3.toFixed(2) + ' Hz');
    const kpi2SubEl = document.getElementById('kpi2Sub');
    if (kpi2SubEl) kpi2SubEl.textContent = kpi2SubTxt;

    const kpiAlign = document.getElementById('kpiAlignCard');
    if (kpiAlign) {
      kpiAlign.style.display = 'flex';
      const lblEl = document.getElementById('kpiAlignLabel');
      if (lblEl) lblEl.textContent = alignLabel;
      const valEl = document.getElementById('kpiAlignVal');
      if (valEl) { valEl.textContent = alignName; valEl.style.color = alignColor; }
      document.getElementById('kpiAlignSub').textContent = alignSub;
    }

    const portCard = document.getElementById('kpiPortCard');
    if (portCard) {
      portCard.style.display = 'flex';
      const worstVel = portGeomVr ? Math.max(airVel, airVelVr) : airVel;
      portCard.classList.remove('good', 'warn', 'danger');
      portCard.classList.add(worstVel <= velLimit * 0.85 ? 'good' : (worstVel <= velLimit ? 'warn' : 'danger'));
      if (portGeomVr) {
        document.getElementById('kpiVelVal').textContent = `VF ${LvCm.toFixed(1)} · VR ${portGeomVr.LvCm.toFixed(1)} cm`;
        document.getElementById('kpiVelSub').textContent = `Ar VF ${airVel.toFixed(1)} · VR ${airVelVr.toFixed(1)} m/s`;
      } else {
        document.getElementById('kpiVelVal').textContent = LvCm.toFixed(1) + ' cm (Lv)';
        document.getElementById('kpiVelSub').textContent = `Ar: ${airVel.toFixed(1)} m/s (${machPct.toFixed(1)}% Mach · f₁=${fPipe1.toFixed(0)}Hz)`;
      }
    }
  } else {
    // Caixa Selada, Planar Horn (câmara traseira selada) ou Baffle Infinito (Free-Air, Vb → ∞)
    const tuningModeCont = document.getElementById('tuningModeContainer');
    if (tuningModeCont) tuningModeCont.style.display = 'none';
    const fbGroup = document.getElementById('fbControlGroup');
    if (fbGroup) fbGroup.style.display = 'none';

    if (boxType === 'free-air') {
      alpha = 0.0;
      qtc = Qts;
      fc = Fs;
    } else {
      qtc = Qts * Math.sqrt(alpha + 1.0);
      fc = Fs * Math.sqrt(alpha + 1.0);
    }
    const term1 = (1.0 / (2.0 * (qtc ** 2))) - 1.0;
    const term2 = Math.sqrt((term1 ** 2) + 1.0);
    F3 = fc * Math.sqrt(term1 + term2);

    if (qtc > 0.7071) {
      const h_max = qtc / Math.sqrt(1.0 - (1.0 / (4.0 * (qtc ** 2))));
      ripple = 20.0 * Math.log10(h_max);
      fgmax = fc / Math.sqrt(1.0 - (1.0 / (2.0 * (qtc ** 2))));
      fxmax = fc * Math.sqrt(1.0 - (1.0 / (2.0 * (qtc ** 2))));
    } else {
      ripple = 0; fgmax = null; fxmax = null;
    }

    if (boxType === 'free-air') {
      alignLabel = 'Baffle Infinito';
      alignName = 'Free-Air (Vb → ∞)';
      alignSub = `Qtc = Qts = ${qtc.toFixed(2)} · Fc = Fs = ${fc.toFixed(1)} Hz`;
      if (qtc < 0.40) alignColor = '#f59e0b';
      kpi2SubTxt = `F3/Fs = ${(F3 / Fs).toFixed(3)} · Isolamento Frente/Trás`;
    } else if (boxType === 'planar') {
      const plEval = analyzeTransferAlignment({ boxType, Fs, fc, qtc });
      if (plEval.f3Exact > 0) F3 = plEval.f3Exact;
      alignLabel = 'Alinhamento Planar';
      if (qtc < 0.55) {
        alignName = 'Planar Câmara Grande';
        alignSub = `Qtc=${qtc.toFixed(2)} · Controle suave`;
      } else if (qtc <= 0.82) {
        alignName = 'Planar Horn Ótimo';
        alignSub = `Qtc=${qtc.toFixed(2)} · Boca +3.2dB @ ${(fc * 2.1).toFixed(0)}Hz`;
      } else {
        alignName = 'Planar Câmara Compacta';
        alignSub = `Qtc=${qtc.toFixed(2)} · Pico +${plEval.peakDb.toFixed(1)}dB`;
        alignColor = '#f59e0b';
      }
      kpi2SubTxt = `F3/Fs = ${(F3 / Fs).toFixed(3)} · Boca ${(fc * 2.1).toFixed(0)}Hz`;
    } else {
      alignLabel = 'Alinhamento 2ª Ordem';
      const vbB2Raw = (Qts < 0.7071 && Qts > 0.05) ? (Vas / (Math.pow(0.7071 / Qts, 2) - 1.0)) : null;
      const vbB2 = (vbB2Raw && Number.isFinite(vbB2Raw) && vbB2Raw <= Vas * 10) ? vbB2Raw : null;
      const b2Hint = (vbB2 && Math.abs(qtc - 0.7071) > 0.06) ? ` · B2=${vbB2.toFixed(0)}L` : '';
      if (qtc < 0.55) {
        alignName = 'Super-Amortecida';
        alignSub = `Qtc=${qtc.toFixed(2)} · Transiente Máx.${b2Hint}`;
      } else if (qtc <= 0.63) {
        alignName = 'Bessel (Fase Plana)';
        alignSub = `Qtc=${qtc.toFixed(2)} (alvo 0.577)${b2Hint}`;
      } else if (qtc <= 0.78) {
        alignName = 'Butterworth B2 (Plana)';
        alignSub = `Qtc=${qtc.toFixed(2)} · 0 dB Ripple`;
      } else if (qtc <= 0.95) {
        alignName = 'Chebyshev Compacta';
        alignSub = `Ripple +${ripple.toFixed(2)}dB @ ${fgmax ? fgmax.toFixed(0) : fc.toFixed(0)}Hz${b2Hint}`;
      } else {
        alignName = 'Chebyshev Pico Alto';
        alignSub = `Pico +${ripple.toFixed(1)}dB @ ${fgmax ? fgmax.toFixed(0) : fc.toFixed(0)}Hz`;
        alignColor = '#f59e0b';
      }
      kpi2SubTxt = `F3/Fs = ${(F3 / Fs).toFixed(3)}` + (ripple > 0.15 ? ` · +${ripple.toFixed(1)}dB` : ' · Plana');
    }

    const kpiAlign = document.getElementById('kpiAlignCard');
    if (kpiAlign) {
      kpiAlign.style.display = 'flex';
      const lblEl = document.getElementById('kpiAlignLabel');
      if (lblEl) lblEl.textContent = alignLabel;
      const valEl = document.getElementById('kpiAlignVal');
      if (valEl) { valEl.textContent = alignName; valEl.style.color = alignColor; }
      document.getElementById('kpiAlignSub').textContent = alignSub;
    }

    Vtot = (boxType === 'free-air') ? 0.0 : (Vb + Vsub);

    document.getElementById('kpi1Label').textContent = boxType === 'free-air' ? 'Free-Air Qts' : 'Fator Q (Qtc)';
    document.getElementById('kpi1Val').textContent = qtc.toFixed(3);
    document.getElementById('kpi1Sub').textContent = 'Fc = ' + fc.toFixed(2) + ' Hz' + (nDrivers > 1 ? ` · ${nDrivers}x` : '');
    document.getElementById('kpi2Label').textContent = 'Corte F3 (-3dB)';
    document.getElementById('kpi2Val').textContent = F3.toFixed(2) + ' Hz';
    const kpi2SubEl = document.getElementById('kpi2Sub');
    if (kpi2SubEl) kpi2SubEl.textContent = kpi2SubTxt;
    document.getElementById('kpiPortCard').style.display = 'none';
  }

  document.getElementById('kpiAlfaVal').textContent = alpha.toFixed(2);
  document.getElementById('kpiAlfaSub').textContent = boxType === 'free-air'
    ? 'Vb → ∞ (Baffle Infinito)'
    : ('Vb = ' + Vb.toFixed(1) + ' L' + (nDrivers > 1 ? ` (${(Vb/nDrivers).toFixed(1)}L/un)` : ''));
  document.getElementById('kpiVtotVal').textContent = Vtot.toFixed(2) + ' L';
  document.getElementById('kpiF100Val').textContent = F100.toFixed(2) + ' Hz';

  // Síntese dos 13 Gráficos (suporta Selada, Dutada, BP4, BP6 e Planar TMM)
  const zNomMeta = Math.max(0.5, parseFloat(document.getElementById('tsZnom')?.value) || 4.0);
  const slotARMeta = (portGeom && portGeom.isSlot && Number.isFinite(portGeom.aspectRatio)) ? portGeom.aspectRatio : 0;
  generateSimulationData({
    boxType, Fs, Qes, Qms, Re, Le_mH, Sd_m2, Vas, Xmax_mm, Pe, Qts, zNom: zNomMeta, slotAR: slotARMeta,
    Vb, Vr, bp6Mode, FbVr, QL, tempC, cabinM, hpfHz, hpfType, lpfHz, lpfType, dspIssues, c, rho, F100, spl_rated, alpha, Fb, F3, FH, qtc, fc, airVel,
    fPipe1, velLimit, nDrivers, deltaT, powerCompDb, fQuarterWave, fHalfWave, planarTunnelMm, planarStyle,
    planarSt_m2: planarTunnelGeom.St_m2,
    planarRh_m: planarTunnelGeom.rh_m,
    planarAMouth_m: planarTunnelGeom.aMouth_m,
    SpFront: portGeom ? portGeom.Sp : 0.01,
    SpRear: portGeomVr ? portGeomVr.Sp : 0.01,
    bpMetrics: bpEval,
    planarMetrics: planarEval
  });

  drawAllCharts();
  renderExpanded();
  updateWoodlock();
  updateElectrical();
  updateSimAdvancedTelemetry({ Fs, Qes: Qes_nom, Qms, Qts: (Qms * Qes_nom) / (Qms + Qes_nom), Vas: Vas_single, Re: Re_nom, Pe: Pe_single, Sd_m2: Sd_single_m2, Xmax_mm, c, rho, spl_1w, spl_rated, Vd, EBP: Fs / Qes_nom, no_frac });
  updateDesktopStatusBar({ boxType, nDrivers, Vb, Vr, Fb, FbVr, bp6Mode, fc, F3, FH, LvCm, LvVrCm: portGeomVr ? portGeomVr.LvCm : 0, airVel, airVelVr: portGeomVr ? airVelVr : 0, fPipe1, fQuarterWave, fHalfWave, planarTunnelMm, planarStyle, deltaT, powerCompDb, EBP, alpha, Vtot, Qts, Xmax_mm, Pe });
  syncKpiAndInsightTooltips();
}

function syncKpiAndInsightTooltips() {
  const ids = ['kpi1Val', 'kpi1Sub', 'kpi2Val', 'kpi2Sub', 'kpiAlignVal', 'kpiAlignSub', 'kpiVelVal', 'kpiVelSub', 'kpiAlfaVal', 'kpiAlfaSub', 'kpiVtotVal', 'kpiF100Val', 'kpiEpdrVal', 'kpiEpdrSub', 'driverInsightsBar'];
  for (const id of ids) {
    const el = document.getElementById(id);
    if (el && el.textContent) el.title = el.textContent.trim();
  }
}

function generateSimulationData(p) {
  const freqs = [];
  const logMin = Math.log10(5);
  const logMax = Math.log10(20000);
  const N = 900;
  for(let i=0; i<N; i++) {
    freqs.push(Math.pow(10, logMin + (i/(N-1))*(logMax-logMin)));
  }

  const G1 = [], G2 = [], G2_front = [], G2_rear = [], G3 = [], G4 = [], G5 = [], G6 = [];
  const G7 = [], G8 = [], G9 = [], G9_front = [], G9_rear = [], G10 = [], G11 = [], G12 = [], G13 = [];
  const phaseRadRaw = [];

  const Fs_s = Math.max(1e-3, p.Fs || 0);
  const Fb_s = Math.max(1e-3, p.Fb || 0);
  const fc_s = Math.max(1e-3, p.fc || Fs_s);
  const Qts_s = Math.max(1e-3, p.Qts || 0.4);
  const Qms_s = Math.max(1e-3, p.Qms || 5.0);
  const Qes_s = Math.max(1e-3, p.Qes || 0.45);
  const QL_s = Math.max(0.1, p.QL || 7.0);
  const alpha_s = Math.max(0, p.alpha || 0);
  const hpfOn = Number.isFinite(p.hpfHz) && p.hpfHz > 0;
  const hpfType = p.hpfType || 'LR24';
  const lpfOn = Number.isFinite(p.lpfHz) && p.lpfHz > 0;
  const lpfType = p.lpfType || 'LR24';
  const wrapPi = rad => {
    let r = ((rad + Math.PI) % (2.0 * Math.PI) + 2.0 * Math.PI) % (2.0 * Math.PI) - Math.PI;
    return r;
  };

  const isBrLike = (p.boxType === 'bass-reflex');
  const h = (isBrLike ? Math.max(1e-6, Fb_s / Fs_s) : 1.0);
  const sh = Math.sqrt(h);
  const w0 = 2.0 * Math.PI * Math.sqrt(Fs_s * (isBrLike ? Fb_s : fc_s));

  // Coeficientes exatos do polinômio de 4ª ordem (Small 1973 Eq. 19)
  const a1 = (sh / Qts_s) + (1.0 / (sh * QL_s));
  const a2 = ((1.0 + alpha_s + (h * h)) / h) + (1.0 / (Qts_s * QL_s));
  const a3 = (1.0 / (sh * Qts_s)) + (sh / QL_s);

  // Coeficientes com QL real configurado para excursão do cone #8 (Small 1973 Eq. 24)
  const qb_disp = QL_s;
  const a1_disp = a1;
  const a2_disp = a2;
  const a3_disp = a3;

  // Coeficientes mecânicos puros (Qms) para impedância acoplada #11 (Small 1973 Eq. 11)
  const a1_m = (sh / Qms_s) + (1.0 / (sh * QL_s));
  const a2_m = ((1.0 + alpha_s + (h * h)) / h) + (1.0 / (Qms_s * QL_s));
  const a3_m = (1.0 / (sh * Qms_s)) + (sh / QL_s);

  // Parâmetros mecânicos e acústicos analíticos para G11, EPDR e G8
  const rho_val = p.rho || (1.205585 * (293.15 / (273.15 + (p.tempC || 20.0))));
  const c_val = p.c || 343.37;
  const Cms = (p.Vas / 1000.0) / (rho_val * Math.pow(c_val, 2) * Math.pow(p.Sd_m2, 2));
  const ws = 2.0 * Math.PI * Fs_s;
  const Mms = 1.0 / (Math.pow(ws, 2) * Cms);
  const Bl = Math.sqrt((ws * Mms * p.Re) / Qes_s);

  // Deslocamento de pico de referência em malha aberta na potência Pe (Small 1972 Eq. 27)
  const x_ref_peak_mm = Math.sqrt((2.0 * p.Pe * Cms) / (ws * Qts_s)) * 1000.0;
  const x_ref_box_mm = x_ref_peak_mm / (1.0 + alpha_s);

  // Normalizador da função de transferência de velocidade |sn / D(sn)| (sem HPF, para que HPF atenue G9)
  let max_hv = 1e-9;
  if (isBrLike) {
    freqs.forEach(f => {
      const rw = (2.0 * Math.PI * f) / w0;
      const d_re = Math.pow(rw, 4) - a2*Math.pow(rw, 2) + 1.0;
      const d_im = -a3*Math.pow(rw, 3) + a1*rw;
      const d_mag = Math.sqrt(d_re*d_re + d_im*d_im);
      const hv_val = rw / d_mag;
      if (hv_val > max_hv) max_hv = hv_val;
    });
  }

  // EPDR exato segundo AES (Eric Benjamin, JAES 1994 / Keith Howard 2007)
  const computeEpdrAes = (zMag, phaseRad) => {
    if (!Number.isFinite(zMag) || zMag <= 0) return NaN;
    const phi = Number.isFinite(phaseRad) ? phaseRad : 0;
    const absPhi = Math.min(Math.PI / 2 - 1e-4, Math.abs(phi));
    const den = (1.0 - Math.sin((5.0 * Math.PI) / 6.0 + (2.0 * absPhi) / 3.0)) * Math.sin((5.0 * Math.PI) / 6.0 - absPhi / 3.0);
    const epdr = (den > 1e-9) ? (0.25 * zMag) / den : zMag;
    return Math.min(zMag, Math.max(0, epdr));
  };

  // Modelo físico acoplado Band-Pass (pré-computado uma vez por varredura)
  const bpModel = (p.boxType === 'bp4' || p.boxType === 'bp6')
    ? buildBandPassAcousticModel(p)
    : null;

  // Modelo físico TMM / ABCD 1D acoplado Planar Horn / Euclides
  const planarModel = (p.boxType === 'planar')
    ? buildPlanarAcousticModel(p)
    : null;
  const fQW = (p.fQuarterWave && p.fQuarterWave > 0) ? p.fQuarterWave : (planarModel ? planarModel.fQuarterWave : 0);
  const fHW = (p.fHalfWave && p.fHalfWave > 0) ? p.fHalfWave : (planarModel ? planarModel.fHalfWave : 0);

  let minEpdrVal = 1e9;
  let minEpdrFreq = 40.0;

  freqs.forEach(f => {
    const w = 2.0 * Math.PI * f;
    // Filtros ativos HPF + LPF no domínio complexo H(jw) = H_HPF(jw) * H_LPF(jw) (magnitude, fase e group delay reais)
    const hpfC = hpfOn ? evalFilterComplex(f, p.hpfHz, 'hpf', hpfType) : { mag: 1.0, db: 0.0, phaseRad: 0.0 };
    const lpfC = lpfOn ? evalFilterComplex(f, p.lpfHz, 'lpf', lpfType) : { mag: 1.0, db: 0.0, phaseRad: 0.0 };
    const hpf_lin = hpfC.mag * lpfC.mag;
    const hpf_db = hpfC.db + lpfC.db;
    const flt_phi = hpfC.phaseRad + lpfC.phaseRad;

    // Função de transferência de pressurização acústica pura da cabine T_cabin(f) (+12 dB/oitava abaixo de F100)
    const t_cabin_db = (f > 0.0) ? 20.0 * Math.log10(1.0 + (Math.SQRT2 - 1.0) * Math.pow(p.F100 / f, 2)) : 0.0;

    // Free Air Impedance #3 (Small 1972 RLC motional impedance + voice-coil inductance j*w*Le)
    const Le_H = Math.max(0, Number(p.Le_mH) || 0) / 1000.0;
    const z_le_im = w * Le_H;
    const rel_fs = f / Fs_s;
    const inv_qes_eff = (1.0 / Qts_s) - (1.0 / Qms_s);
    const d_free_re = 1.0 - Math.pow(rel_fs, 2);
    const d_free_im = rel_fs / Qms_s;
    const d_free_mag2 = d_free_re*d_free_re + d_free_im*d_free_im;
    const z_free_re = p.Re * (1.0 + inv_qes_eff * (rel_fs * d_free_im) / d_free_mag2);
    const z_free_im = p.Re * (inv_qes_eff * (rel_fs * d_free_re) / d_free_mag2) + z_le_im;
    G3.push(Math.sqrt(z_free_re*z_free_re + z_free_im*z_free_im));

    if (isBrLike) {
      const rel_w = w / w0;
      const den_re = Math.pow(rel_w, 4) - a2*Math.pow(rel_w, 2) + 1.0;
      const den_im = -a3*Math.pow(rel_w, 3) + a1*rel_w;
      const den_mag2 = den_re*den_re + den_im*den_im;

      // G4: Normalized Amplitude Response (Small 1973 Eq. 19 + LR4 HPF)
      const g_mag_db = 10.0 * Math.log10(Math.max(1e-12, Math.pow(rel_w, 8) / den_mag2)) + hpf_db;
      G4.push(g_mag_db);

      // G6: SPL Thermic & G7: Cabin Gain (G4 + T_cabin) & G5: SPL in Car (G6 + T_cabin)
      const spl_th = p.spl_rated + g_mag_db;
      const c_gain = g_mag_db + t_cabin_db;
      G6.push(spl_th);
      G7.push(c_gain);
      G5.push(spl_th + t_cabin_db);

      // G2: Vent SPL (Small 1973: |-h * sn^2 / D(sn)| * |H_HPF|, iguala G6 em Fb)
      const vent_mag_db = 10.0 * Math.log10(Math.max(1e-12, (h * h * Math.pow(rel_w, 4)) / den_mag2)) + hpf_db;
      const ventSplBr = p.spl_rated + vent_mag_db;
      G2.push(ventSplBr);
      G2_front.push(ventSplBr);
      G2_rear.push(0);

      // G10: Cone SPL (Small 1973: |sn^2 * (sn^2 + (sh/QL)*sn + h) / D(sn)| * |H_HPF|, notch finito em Fb)
      const c_num_re = h - Math.pow(rel_w, 2);
      const c_num_im = (sh / QL_s) * rel_w;
      const c_num_mag2 = Math.pow(rel_w, 4) * (c_num_re*c_num_re + c_num_im*c_num_im);
      const cone_mag_db = 10.0 * Math.log10(Math.max(1e-9, c_num_mag2 / den_mag2)) + hpf_db;
      G10.push(p.spl_rated + cone_mag_db);

      // G8: Cone Displacement #8 (mm) (Small 1972/1973 Eq. 24 com QB = 7.0)
      const dd_re = Math.pow(rel_w, 4) - a2_disp*Math.pow(rel_w, 2) + 1.0;
      const dd_im = -a3_disp*Math.pow(rel_w, 3) + a1_disp*rel_w;
      const dd_mag2 = dd_re*dd_re + dd_im*dd_im;
      const nd_re = h - Math.pow(rel_w, 2);
      const nd_im = (sh / qb_disp) * rel_w;
      const nd_mag2 = nd_re*nd_re + nd_im*nd_im;
      const exc_mm = x_ref_peak_mm * (Math.sqrt(nd_mag2 / dd_mag2) / h) * hpf_lin;
      G8.push(exc_mm);

      // G1: Max Power #1 (Watts RMS) — Limitada por Pe e Xmax (Small 1973)
      const p_max_f = (exc_mm > 1e-6) ? Math.min(p.Pe, p.Pe * Math.pow(p.Xmax_mm / exc_mm, 2)) : p.Pe;
      G1.push(p_max_f);

      // G9: Port Air Velocity #9 (m/s RMS) — Equação analítica exata de Small (1973): v(w) = w*Sd*x_ref_rms / (Sp*|D(sn)|) * |H_HPF*H_LPF|
      const xRefRmsM = Math.sqrt((p.Pe * Cms) / (ws * Qes_s));
      const vBr = (p.SpFront > 0 && xRefRmsM > 0)
        ? ((w * p.Sd_m2 * xRefRmsM) / (p.SpFront * Math.sqrt(Math.max(1e-18, den_mag2)))) * hpf_lin
        : ((p.airVel || 12.5963) * ((rel_w / Math.sqrt(den_mag2)) * hpf_lin / max_hv));
      G9.push(vBr);
      G9_front.push(vBr);
      G9_rear.push(0);

      // G11: In Box Impedance #11 (Ohms) — Identidade de Polinômios Acoplados de Small (1973) Eq. 11 + j*w*Le
      const dm_re = Math.pow(rel_w, 4) - a2_m*Math.pow(rel_w, 2) + 1.0;
      const dm_im = -a3_m*Math.pow(rel_w, 3) + a1_m*rel_w;
      const dm_mag2 = dm_re*dm_re + dm_im*dm_im;
      const z_in_re = p.Re * ((den_re*dm_re + den_im*dm_im) / dm_mag2);
      const z_in_im = p.Re * ((den_im*dm_re - den_re*dm_im) / dm_mag2) + z_le_im;
      const z_box = Math.sqrt(z_in_re*z_in_re + z_in_im*z_in_im);
      G11.push(z_box);

      const theta_z = Math.atan2(z_in_im, z_in_re);
      const epdr_f = computeEpdrAes(z_box, theta_z);
      if (epdr_f < minEpdrVal) {
        minEpdrVal = epdr_f;
        minEpdrFreq = f;
      }

      // G12: Fase Acústica do Gabinete + Filtros HPF/LPF (Graus)
      const phiRad = -Math.atan2(den_im, den_re) + flt_phi;
      phaseRadRaw.push(phiRad);
      G12.push(wrapPi(phiRad) * 180.0 / Math.PI);
    } else if (p.boxType === 'bp4' || p.boxType === 'bp6') {
      // Modelo físico eletromecânico-acústico acoplado exato (BP4, BP6 Paralela & BP6 Série)
      const ev = evalBandPassFrequency(bpModel, f);
      const bpMag = Math.max(1e-6, Math.hypot(ev.H_re, ev.H_im));
      const g_mag_db = 20.0 * Math.log10(bpMag) + hpf_db;
      G4.push(g_mag_db);
      const spl_th = p.spl_rated + g_mag_db;
      G6.push(spl_th);
      G7.push(g_mag_db + t_cabin_db);
      G5.push(spl_th + t_cabin_db);
      G2.push(spl_th); // Em Band-Pass toda a radiação externa sai pelos dutos
      const splVf = p.spl_rated + 20.0 * Math.log10(Math.max(1e-6, ev.Hf_mag || bpMag)) + hpf_db;
      const splVr = (p.boxType === 'bp6') ? (p.spl_rated + 20.0 * Math.log10(Math.max(1e-6, ev.Hr_mag || 1e-6)) + hpf_db) : 0;
      G2_front.push(splVf);
      G2_rear.push(splVr);
      G10.push(spl_th - 24.0); // Cone confinado nas câmaras internas

      // Excursão real de pico do cone Xpk(f) = |Uc_pk| / (w * Sd) * |H_HPF| [mm]
      const exc_mm = Math.max(0.0, (ev.Uc_mag / Math.max(1e-12, w * bpModel.Sd_m2)) * 1000.0 * hpf_lin);
      G8.push(exc_mm);
      G1.push(exc_mm > 1e-6 ? Math.min(p.Pe, p.Pe * Math.pow(p.Xmax_mm / exc_mm, 2)) : p.Pe);

      // Velocidade real de pico do ar nos dutos |Up_pk| / Sp * |H_HPF| [m/s]
      const vFront = (ev.Upf_mag / bpModel.SpFront) * hpf_lin;
      const vRear = (p.boxType === 'bp6') ? ((ev.Upr_mag / bpModel.SpRear) * hpf_lin) : 0.0;
      G9.push(Math.max(vFront, vRear));
      G9_front.push(vFront);
      G9_rear.push(vRear);

      // Impedância complexa real Zin(jw) + j*w*Le e EPDR real
      const zBpIm = ev.Zin_im + z_le_im;
      const zBoxVal = Math.hypot(ev.Zin_re, zBpIm);
      G11.push(zBoxVal);
      const zPhase = Math.atan2(zBpIm, ev.Zin_re);
      const epdr_f = computeEpdrAes(zBoxVal, zPhase);
      if (epdr_f < minEpdrVal) { minEpdrVal = epdr_f; minEpdrFreq = f; }

      // Fase acústica real do gabinete + filtros HPF/LPF (unwrapped em G13 para atraso de grupo real)
      const phiRad = Math.atan2(ev.H_im, ev.H_re) + flt_phi;
      phaseRadRaw.push(phiRad);
      G12.push(wrapPi(phiRad) * 180.0 / Math.PI);
    } else if (p.boxType === 'planar') {
      // Planar Horn / Euclides: Solver TMM / ABCD 1D acoplado exato
      const ev = evalPlanarFrequency(planarModel, f);
      const plMag = Math.max(1e-6, Math.hypot(ev.H_re, ev.H_im));
      const g_mag_db = 20.0 * Math.log10(plMag) + hpf_db;
      G4.push(g_mag_db);

      const spl_th = p.spl_rated + g_mag_db;
      G6.push(spl_th);
      G7.push(g_mag_db + t_cabin_db);
      G5.push(spl_th + t_cabin_db);

      // G2: Vent SPL (radiação do duto) & G10: Cone/Tunnel SPL (radiação do cone via túnel)
      const ventSplPl = p.spl_rated + 20.0 * Math.log10(Math.max(1e-6, ev.Hvent_mag)) + hpf_db;
      const coneSplPl = p.spl_rated + 20.0 * Math.log10(Math.max(1e-6, ev.Hcone_mag)) + hpf_db;
      G2.push(ventSplPl);
      G2_front.push(ventSplPl);
      G2_rear.push(0);
      G10.push(coneSplPl);

      // G8: Excursão real de pico do cone carregado pela impedância de garganta Z_throat [mm]
      const exc_mm = Math.max(0.0, (ev.Uc_mag / Math.max(1e-12, w * planarModel.Sd_m2)) * 1000.0 * hpf_lin);
      G8.push(exc_mm);

      // G1: Potência máxima limitada por Pe térmico e Xmax mecânico real
      G1.push(exc_mm > 1e-6 ? Math.min(p.Pe, p.Pe * Math.pow(p.Xmax_mm / exc_mm, 2)) : p.Pe);

      // G9: Velocidade real de pico do ar no duto |Up_pk| / Sp * |H_HPF| [m/s]
      const vPort = (ev.Up_mag / planarModel.Sp) * hpf_lin;
      G9.push(vPort);
      G9_front.push(vPort);
      G9_rear.push(0);

      // G11: Impedância elétrica complexa real Zin(jw) carregada pelo túnel + j*w*Le + EPDR
      const zPlIm = ev.Zin_im + z_le_im;
      const zBoxVal = Math.hypot(ev.Zin_re, zPlIm);
      G11.push(zBoxVal);
      const zPhase = Math.atan2(zPlIm, ev.Zin_re);
      const epdr_f = computeEpdrAes(zBoxVal, zPhase);
      if (epdr_f < minEpdrVal) { minEpdrVal = epdr_f; minEpdrFreq = f; }

      // G12: Fase acústica real + filtros HPF/LPF (unwrapped em G13 para atraso de grupo real)
      const phiRad = Math.atan2(ev.H_im, ev.H_re) + flt_phi;
      phaseRadRaw.push(phiRad);
      G12.push(wrapPi(phiRad) * 180.0 / Math.PI);
    } else {
      // Sealed (Small 1972) ou Free-Air (Baffle Infinito)
      const rel_fc = f / p.fc;
      const den_re_s = 1.0 - Math.pow(rel_fc, 2);
      const den_im_s = rel_fc / p.qtc;
      const den_mag2 = den_re_s*den_re_s + den_im_s*den_im_s;
      const g_mag_db = 10.0 * Math.log10(Math.pow(rel_fc, 4) / den_mag2) + hpf_db;
      G4.push(g_mag_db);

      const spl_th = p.spl_rated + g_mag_db;
      const c_gain = g_mag_db + t_cabin_db;
      G6.push(spl_th);
      G7.push(c_gain);
      G5.push(spl_th + t_cabin_db);
      G2.push(0);
      G2_front.push(0);
      G2_rear.push(0);
      G10.push(spl_th);
      G9.push(0);
      G9_front.push(0);
      G9_rear.push(0);

      const c_tot = Cms / (1.0 + p.alpha);
      // Small (1972): impedância mecânica pura Rms = ws * Mms / Qms (sem amortecimento elétrico Re)
      const r_tot = (ws * Mms) / Qms_s;
      const z_m_re = r_tot;
      const z_m_im = (w * Mms) - (1.0 / (w * c_tot));
      const z_m_mag2 = z_m_re*z_m_re + z_m_im*z_m_im;
      const z_in_re = p.Re + (Bl*Bl * z_m_re) / z_m_mag2;
      const z_in_im = -(Bl*Bl * z_m_im) / z_m_mag2 + z_le_im;
      const z_box = Math.sqrt(z_in_re*z_in_re + z_in_im*z_in_im);
      G11.push(z_box);

      const theta_z = Math.atan2(z_in_im, z_in_re);
      const epdr_f = computeEpdrAes(z_box, theta_z);
      if (epdr_f < minEpdrVal) {
        minEpdrVal = epdr_f;
        minEpdrFreq = f;
      }

      const exc_mm = (x_ref_box_mm / Math.sqrt(den_mag2)) * hpf_lin;
      G8.push(exc_mm);

      const p_max_f = (exc_mm > 1e-6) ? Math.min(p.Pe, p.Pe * Math.pow(p.Xmax_mm / exc_mm, 2)) : p.Pe;
      G1.push(p_max_f);

      // Fase Acústica de 2ª Ordem + filtros HPF/LPF
      const h_re = (Math.pow(rel_fc, 4) - Math.pow(rel_fc, 2)) / den_mag2;
      const h_im = (Math.pow(rel_fc, 3) / p.qtc) / den_mag2;
      const phiRad = Math.atan2(h_im, h_re) + flt_phi;
      phaseRadRaw.push(phiRad);
      G12.push(wrapPi(phiRad) * 180.0 / Math.PI);
    }
  });

  // G13: Group Delay (ms) = -d(phi_unwrapped)/d(omega) * 1000
  const unwrapped = new Array(N);
  unwrapped[0] = phaseRadRaw[0];
  for (let i = 1; i < N; i++) {
    let diff = phaseRadRaw[i] - phaseRadRaw[i - 1];
    while (diff > Math.PI) diff -= 2.0 * Math.PI;
    while (diff < -Math.PI) diff += 2.0 * Math.PI;
    unwrapped[i] = unwrapped[i - 1] + diff;
  }
  for (let i = 0; i < N; i++) {
    const i0 = Math.max(0, i - 1);
    const i1 = Math.min(N - 1, i + 1);
    const dPhi = unwrapped[i1] - unwrapped[i0];
    const dW = 2.0 * Math.PI * (freqs[i1] - freqs[i0]);
    const gdMs = dW > 0 ? Math.max(0, (-dPhi / dW) * 1000.0) : 0;
    G13.push(gdMs);
  }

  // FIS-07: Asserção pós-varredura de passividade elétrica (|Z(f)| >= Re(T))
  let minZMag = Infinity;
  let passivityOk = true;
  const reMinPass = (Number.isFinite(p.Re) && p.Re > 0) ? p.Re * 0.999 : 0;
  for (let i = 0; i < G11.length; i++) {
    const zv = G11[i];
    if (!Number.isFinite(zv) || zv < reMinPass) passivityOk = false;
    if (Number.isFinite(zv) && zv < minZMag) minZMag = zv;
  }

  const epdrValid = Number.isFinite(minEpdrVal) && minEpdrVal > 0 && minEpdrVal < 1e8;
  const safeMinEpdr = epdrValid ? minEpdrVal : (Number.isFinite(p.Re) && p.Re > 0 ? p.Re : 0);
  const epdrEl = document.getElementById('kpiEpdrVal');
  const epdrSub = document.getElementById('kpiEpdrSub');
  if (epdrEl && epdrSub) {
    epdrEl.textContent = safeMinEpdr > 0 ? (safeMinEpdr.toFixed(2) + ' Ω') : '—';
    epdrSub.textContent = safeMinEpdr > 0 ? ('@ ' + minEpdrFreq.toFixed(1) + ' Hz (Re=' + p.Re.toFixed(1) + 'Ω)') : '—';
  }

  // G6_SPLMaxReal: SPL máximo acústico real limitado por min(Pe térmico, Xmax mecânico)
  const peSafeG6 = Math.max(1e-6, p.Pe || 1.0);
  const G6_maxReal = G6.map((splTh, i) => {
    const pMax = Math.max(1e-6, Math.min(peSafeG6, G1[i] != null ? G1[i] : peSafeG6));
    return splTh + 10.0 * Math.log10(pMax / peSafeG6);
  });

  // Modelo físico de sala (Architectural): Boundary Loading (Waterhouse) + Zona de Pressão + Modos L×W×H (RT60)
  const roomL = Math.max(2.0, Math.min(25.0, parseFloat(document.getElementById('roomLen')?.value) || 5.0));
  const roomW = Math.max(2.0, Math.min(25.0, parseFloat(document.getElementById('roomWid')?.value) || 4.0));
  const roomH = Math.max(2.0, Math.min(10.0, parseFloat(document.getElementById('roomHgt')?.value) || 2.7));
  const roomPlace = document.getElementById('roomPlacement')?.value || 'quarter';
  const roomRt60 = Math.max(0.15, Math.min(1.50, parseFloat(document.getElementById('roomRt60')?.value) || 0.45));
  const roomVol = roomL * roomW * roomH;
  const fSchroeder = 2000.0 * Math.sqrt(roomRt60 / Math.max(1.0, roomVol));
  const fRoomMin = c_val / (2.0 * Math.max(roomL, roomW, roomH));
  const nBounds = roomPlace === 'corner' ? 3 : (roomPlace === 'quarter' ? 2 : (roomPlace === 'half' ? 1 : 0));
  const fBoundTrans = c_val / (2.0 * Math.PI * 0.45);
  const fLeakRoom = 12.0;
  const roomModes = [];
  const dfMode = 2.2 / roomRt60;
  for (let nx = 0; nx <= 3; nx++) {
    for (let ny = 0; ny <= 3; ny++) {
      for (let nz = 0; nz <= 3; nz++) {
        const nzCnt = (nx > 0 ? 1 : 0) + (ny > 0 ? 1 : 0) + (nz > 0 ? 1 : 0);
        if (nzCnt === 0 || nzCnt === 3) continue; // apenas axiais (1) e tangenciais (2)
        const fm = (c_val / 2.0) * Math.sqrt((nx / roomL) ** 2 + (ny / roomW) ** 2 + (nz / roomH) ** 2);
        if (fm > fSchroeder * 1.45) continue;
        const qm = Math.min(9.5, Math.max(1.8, fm / dfMode));
        const wMode = (nzCnt === 1 ? 1.0 : 0.35) / Math.pow(nx + ny + nz, 0.45);
        roomModes.push({ fm, qm, wMode });
      }
    }
  }
  const pzRefAtFmin = 10.0 * Math.log10(1.0 + 0.65 / (1.0 + (fLeakRoom / fRoomMin) ** 2));
  const G14_roomGain = new Array(freqs.length);
  const G15_splRoom = new Array(freqs.length);
  for (let i = 0; i < freqs.length; i++) {
    const f = freqs[i];
    // 1. Waterhouse boundary loading (ganho médio por plano rígido: 0 / +3 / +6 / +9 dB)
    const gBound = nBounds > 0
      ? 10.0 * Math.log10(1.0 + (Math.pow(2, nBounds) - 1.0) / (1.0 + Math.pow(f / fBoundTrans, 2)))
      : 0.0;
    // 2. Pressurização suave abaixo do 1º modo axial (máx. ~+3 a +4.5 dB em 10-20 Hz, com vazamento estrutural em 12 Hz)
    const gPz = f < fRoomMin * 2.0
      ? Math.max(0.0, 10.0 * Math.log10(1.0 + 0.65 / (Math.pow(f / fRoomMin, 2) + Math.pow(fLeakRoom / fRoomMin, 2))) - pzRefAtFmin)
      : 0.0;
    // 3. Modos estacionários (L×W×H) centrados em 0 dB (zero-mean) abaixo da frequência de Schroeder
    let mPeak = 0.0;
    const modalRoll = Math.exp(-Math.pow(f / Math.max(45.0, fSchroeder * 1.15), 2));
    if (modalRoll > 0.01 && roomModes.length > 0) {
      for (let m = 0; m < roomModes.length; m++) {
        const md = roomModes[m];
        const r = f / md.fm;
        const resp = 1.0 / Math.sqrt(Math.pow(1.0 - r * r, 2) + Math.pow(r / md.qm, 2));
        mPeak += md.wMode * Math.min(4.5, resp);
      }
    }
    // Normaliza pela densidade modal média esperada para oscilar entre -3 dB (antimodos) e +4.5 dB (modos axiais)
    const expectedMean = Math.max(1.2, 0.38 * roomModes.length * Math.min(1.0, f / Math.max(20.0, fRoomMin)));
    const gModal = modalRoll * Math.max(-4.5, Math.min(5.0, 6.0 * Math.log10((0.45 + mPeak) / (0.45 + expectedMean))));
    const rg = gBound + gPz + gModal;
    G14_roomGain[i] = rg;
    G15_splRoom[i] = G6[i] + rg;
  }

  currentCurves = {
    frequencies: freqs,
    G1_MaxPower: G1,
    G2_VentSPL: G2,
    G2_VentSPL_VF: G2_front,
    G2_VentSPL_VR: G2_rear,
    G3_FreeAirZ: G3,
    G4_NormAmp: G4,
    G5_SPLinCar: G5,
    G6_SPLThermic: G6,
    G6_SPLMaxReal: G6_maxReal,
    G7_CabinGain: G7,
    G8_ConeExcursion: G8,
    G9_PortAirVel: G9,
    G9_PortAirVel_VF: G9_front,
    G9_PortAirVel_VR: G9_rear,
    G10_ConeSPL: G10,
    G11_InBoxZ: G11,
    G12_Phase: G12,
    G13_GroupDelay: G13,
    G14_RoomGain: G14_roomGain,
    G15_SPLinRoom: G15_splRoom,
    meta: {
      room: { L: roomL, W: roomW, H: roomH, V: roomVol, fSchroeder, fMin: fRoomMin, placement: roomPlace, rt60: roomRt60 },
      boxType: p.boxType,
      Fs: p.Fs,
      Fb: p.Fb,
      FbVr: p.FbVr,
      fc: p.fc,
      F3: p.F3,
      FH: p.FH,
      hpfHz: p.hpfHz,
      hpfType: hpfType,
      lpfHz: p.lpfHz,
      lpfType: lpfType,
      F100: p.F100,
      Xmax: p.Xmax_mm,
      Pe: p.Pe,
      Re: p.Re,
      c: c_val,
      airVel: p.airVel,
      fPipe1: p.fPipe1,
      fQuarterWave: fQW,
      fHalfWave: fHW,
      planarTunnelMm: p.planarTunnelMm || 0,
      planarStyle: p.planarStyle || 'square',
      velLimit: p.velLimit,
      nDrivers: p.nDrivers,
      deltaT: p.deltaT,
      powerCompDb: p.powerCompDb,
      minEpdrVal: safeMinEpdr,
      minEpdrFreq: minEpdrFreq,
      passivityOk: passivityOk,
      minZMag: Number.isFinite(minZMag) ? minZMag : 0,
      dspIssues: Array.isArray(p.dspIssues) ? p.dspIssues : [],
      zNom: Number.isFinite(p.zNom) ? p.zNom : null,
      slotAR: Number.isFinite(p.slotAR) ? p.slotAR : 0,
      Vb: p.Vb,
      bpMetrics: p.bpMetrics || null,
      planarMetrics: p.planarMetrics || null
    }
  };
}
