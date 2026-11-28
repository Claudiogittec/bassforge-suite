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
