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
