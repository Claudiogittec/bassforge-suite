// ============================================================================
// MOTOR ELÉTRICO, CABEAMENTO, ESTRUTURA DE GANHO RMS & LIMITER DSP
// ============================================================================
let lastElectricalAudit = { valid: true, issues: [], zTotal: 0, reTotal: 0, iMax: 0, maxAmp: 0, vDropPct: 0, vAmp: 0, peTotal: 0, estCoilC: null };

function updateElectrical(fromUser) {
  const numSpkEl = document.getElementById('elNumSpk');
  if (!numSpkEl) return;

  const nSpk = Math.max(1, Math.min(16, parseInt(numSpkEl.value) || 1));
  if (fromUser) {
    const simN = document.getElementById('simNumDrivers');
    if (simN && parseInt(simN.value) !== nSpk) {
      if (simN.options) {
        const hasOpt = [...simN.options].some(o => String(o.value) === String(nSpk));
        if (!hasOpt && typeof document.createElement === 'function') {
          const opt = document.createElement('option');
          opt.value = String(nSpk);
          opt.textContent = `${nSpk}x`;
          simN.appendChild(opt);
        }
      }
      simN.value = String(nSpk);
      recalculate();
      return;
    }
  }
  const elIssues = [];
  const coils = parseInt(document.getElementById('elCoils').value) || 1;
  const zCoil = Math.max(0.25, parseFloat(document.getElementById('elZCoil').value) || 8.0);
  const reDriver = Math.max(0.1, parseFloat(document.getElementById('tsRe').value) || 5.1);
  // ELE-10: reCoil representa a resistência por bobina (sem dupla divisão em DVC paralelo)
  const reCoil = reDriver;
  const coilMode = document.getElementById('elCoilMode').value;
  const spkMode = document.getElementById('elSpkMode').value;

  const zPerSpk = (coils === 1) ? zCoil : (coilMode === 'series' ? zCoil * 2.0 : zCoil / 2.0);
  const rePerSpk = (coils === 1) ? reCoil : (coilMode === 'series' ? reCoil * 2.0 : reCoil / 2.0);

  let zTotal = zPerSpk / nSpk;
  let reTotal = rePerSpk / nSpk;
  const invalidSerPar = (spkMode === 'series-parallel') && (nSpk < 2 || (nSpk % 2 !== 0));
  if (spkMode === 'series') {
    zTotal = zPerSpk * nSpk;
    reTotal = rePerSpk * nSpk;
  } else if (spkMode === 'series-parallel' && !invalidSerPar) {
    zTotal = (nSpk / 4.0) * zPerSpk;
    reTotal = (nSpk / 4.0) * rePerSpk;
  }
  if (invalidSerPar) {
    elIssues.push({
      code: 'ELE_INVALID_SERIES_PARALLEL',
      severity: 'critical',
      msg: `Associação Série-Paralelo inválida para ${nSpk} alto-falante(s) (exige número par ≥ 2).`
    });
  }
  if (zTotal < 0.5) {
    elIssues.push({
      code: 'ELE_IMPEDANCE_TOO_LOW',
      severity: 'critical',
      msg: `Impedância resultante Z_final = ${zTotal.toFixed(2)} Ω < 0.50 Ω — risco crítico de curto/queima do amplificador.`
    });
  }
  if (typeof currentCurves !== 'undefined' && currentCurves?.meta && Number.isFinite(currentCurves.meta.minEpdrVal) && currentCurves.meta.minEpdrVal > 0 && currentCurves.meta.minEpdrVal < 1e8) {
    const epdrScaled = currentCurves.meta.minEpdrVal * (reTotal / Math.max(0.1, reDriver));
    const epdrLim = Math.max(1.0, 0.5 * zTotal);
    if (epdrScaled < epdrLim) {
      elIssues.push({
        code: 'ELE_EPDR_SOA_STRESS',
        severity: 'warn',
        msg: `Estresse SOA (ELE-05): EPDR escalado (~${epdrScaled.toFixed(2)} Ω) abaixo de ${epdrLim.toFixed(2)} Ω.`
      });
    }
  }

  const wiringBox = document.getElementById('elWiringResult');
  if (wiringBox) {
    const wiringAlerts = elIssues
      .filter(i => i.code === 'ELE_INVALID_SERIES_PARALLEL' || i.code === 'ELE_IMPEDANCE_TOO_LOW' || i.code === 'ELE_EPDR_SOA_STRESS')
      .map(i => i.severity === 'critical'
        ? `<div style="color:#f87171; font-weight:700; font-size:11px; margin-top:4px;">⛔ ${escapeHtmlStr(i.msg)}</div>`
        : `<div style="color:#facc15; font-weight:700; font-size:11px; margin-top:4px;">⚠️ ${escapeHtmlStr(i.msg)}</div>`)
      .join('');
    wiringBox.innerHTML = `
      <div><b>Por Alto-Falante:</b> Z_spk = ${zPerSpk.toFixed(2)} Ω | Re_spk = ${rePerSpk.toFixed(2)} Ω</div>
      <div><b>Carga Final no Amplificador:</b> <span style="color:${zTotal < 0.5 ? '#f87171' : 'var(--accent)'}; font-weight:800; font-size:14px;">Z_final = ${zTotal.toFixed(2)} Ω</span> (Re_total = ${reTotal.toFixed(2)} Ω)</div>
      <div style="color:#9ca3af; font-size:11px;">Verifica compatibilidade com a impedância mínima de ponte (Bridge) do amplificador.</div>
      ${wiringAlerts}
    `;
  }

  // Cabos de Força 12V (ida + volta) e Áudio
  const pwrW = Math.max(1, parseFloat(document.getElementById('elAmpPower').value) || 1600.0);
  const vBat = Math.max(1, parseFloat(document.getElementById('elVbat').value) || 12.6);
  const pwrLen = Math.max(0.1, parseFloat(document.getElementById('elPwrLen').value) || 4.5);
  const pwrGauge = Math.max(0.5, parseFloat(document.getElementById('elPwrGauge').value) || 21.0);
  const spkLen = Math.max(0.1, parseFloat(document.getElementById('elSpkLen').value) || 3.0);
  const spkGauge = Math.max(0.5, parseFloat(document.getElementById('elSpkGauge').value) || 4.0);

  const rho25 = 0.017241 * (1.0 + 0.00393 * 5.0);
  const iMax = pwrW / (vBat * 0.82);
  // ELE-08: Circuito DC completo (ida positivo + retorno negativo/chassi = 2 × L) + ampacidade térmica do cobre
  const rPwr = (rho25 * 2.0 * pwrLen) / pwrGauge;
  const vDrop = iMax * rPwr;
  const vAmp = vBat - vDrop;
  const vDropPct = (vDrop / vBat) * 100.0;
  const sMin3Pct = (rho25 * 2.0 * pwrLen * iMax) / (0.03 * vBat);
  const maxAmp = 14.5 * Math.pow(pwrGauge, 0.62);

  if (iMax > maxAmp) {
    elIssues.push({
      code: 'ELE_CABLE_AMPACITY',
      severity: 'critical',
      msg: `Ampacidade excedida (risco de incêndio): ${iMax.toFixed(0)} A > limite seguro (~${maxAmp.toFixed(0)} A) para cabo ${pwrGauge} mm².`
    });
  }
  if (vDropPct > 5.0 || vAmp < 10.5) {
    const dropReasons = [];
    if (vDropPct > 5.0) dropReasons.push(`queda ${vDropPct.toFixed(1)}% > 5%`);
    dropReasons.push(vAmp < 10.5 ? `V_amp = ${vAmp.toFixed(2)} V < 10.5 V` : `V_amp = ${vAmp.toFixed(2)} V`);
    elIssues.push({
      code: 'ELE_VOLTAGE_DROP_CRITICAL',
      severity: 'critical',
      msg: `Queda de tensão DC crítica (${dropReasons.join(' · ')}). Aumente a bitola do cabo.`
    });
  }

  const rLoopSpk = (0.017241 * 2.0 * spkLen) / spkGauge;
  const lossDb = 20.0 * Math.log10(reTotal / (reTotal + rLoopSpk));
  const lossPct = (rLoopSpk / (reTotal + rLoopSpk)) * 100.0;
  const dfEff = reTotal / ((8.0 / 200.0) + rLoopSpk);
  if (Math.abs(lossDb) >= 0.5 || lossPct > 10.0 || dfEff < 10.0) {
    elIssues.push({
      code: 'ELE_AUDIO_CABLE_LOSS',
      severity: 'warn',
      msg: `Perda excessiva no cabo de áudio (ELE-09): ${lossDb.toFixed(2)} dB (${lossPct.toFixed(1)}%), DF_eff = ${dfEff.toFixed(1)}. Engrosse ou encurte o cabo.`
    });
  }

  const cableBox = document.getElementById('elCableResult');
  if (cableBox) {
    const dropColor = vDropPct <= 3.0 ? '#10b981' : (vDropPct <= 5.0 ? '#f59e0b' : '#f87171');
    const cableAlerts = elIssues
      .filter(i => i.code === 'ELE_CABLE_AMPACITY' || i.code === 'ELE_VOLTAGE_DROP_CRITICAL' || i.code === 'ELE_AUDIO_CABLE_LOSS')
      .map(i => i.severity === 'critical'
        ? `<div style="color:#f87171; font-weight:700; font-size:11px; margin-top:4px;">⛔ ${escapeHtmlStr(i.msg)}</div>`
        : `<div style="color:#facc15; font-weight:700; font-size:11px; margin-top:4px;">⚠️ ${escapeHtmlStr(i.msg)}</div>`)
      .join('');
    cableBox.innerHTML = `
      <div><b>Corrente Máxima DC:</b> ${iMax.toFixed(1)} A (Máx. cabo ${pwrGauge}mm²: ~${maxAmp.toFixed(0)} A) | <b>Fusível ANL:</b> ${Math.ceil((iMax*0.85)/10)*10} A</div>
      <div><b>Queda de Tensão DC (Loop 2×L):</b> <span style="color:${dropColor};font-weight:700;">${vDrop.toFixed(2)} V (${vDropPct.toFixed(2)}% · V_amp=${vAmp.toFixed(2)}V)</span> | Mín. p/ ≤3%: <b>${Math.ceil(sMin3Pct)} mm²</b></div>
      <div><b>Cabo de Áudio (Loop):</b> R=${rLoopSpk.toFixed(4)} Ω | Perda=${lossDb.toFixed(2)} dB (${lossPct.toFixed(1)}%)</div>
      <div><b>Fator de Amortecimento Real (DF_eff):</b> <span style="color:#38bdf8;font-weight:700;">${dfEff.toFixed(1)}</span></div>
      ${cableAlerts}
    `;
  }

  // Estrutura de Ganho, Limiter e Crossover Passivo + Zobel
  const peSingle = Math.max(1, parseFloat(document.getElementById('tsPe')?.value) || 500);
  const peTotal = peSingle * nSpk;
  if (pwrW > 2.0 * peTotal) {
    elIssues.push({
      code: 'ELE_AMP_OVERPOWER',
      severity: 'critical',
      msg: `Sobrecarga destrutiva (ELE-06): Amplificador (${pwrW.toFixed(0)} W) excede 2× a potência RMS total (${peTotal.toFixed(0)} W).`
    });
  }

  const preoutV = Math.max(0.05, parseFloat(document.getElementById('elPreoutV').value) || 2.0);
  const limProfile = document.getElementById('elLimProfile').value;
  const xoverHz = Math.max(10, parseFloat(document.getElementById('elXoverHz').value) || 80.0);
  const leMh = Math.max(0, parseFloat(document.getElementById('elLeMh').value) || 0);
  const hpfHzRaw = parseFloat(document.getElementById('hpfCutoff').value) || 36.0;
  const hpfHz = isHpfEnabled ? Math.max(10.0, hpfHzRaw) : 20.0;

  const derate70 = Boolean(document.getElementById('elDerate70')?.checked);
  const measV = Math.max(0, parseFloat(document.getElementById('elMeasV')?.value) || 0);
  const effPwrW = derate70 ? pwrW * 0.70 : pwrW;

  const vRmsTarget = Math.sqrt(effPwrW * zTotal);
  const vPeakTarget = vRmsTarget * Math.SQRT2;
  const iRmsTarget = Math.sqrt(effPwrW / Math.max(0.1, zTotal));
  const gainDb = 20.0 * Math.log10(vRmsTarget / Math.max(0.05, preoutV));
  if (gainDb < 0) {
    elIssues.push({
      code: 'ELE_GAIN_SATURATION',
      severity: 'warn',
      msg: `Saturação na entrada do amplificador (ELE-11): V_alvo (${vRmsTarget.toFixed(1)} V) < Pre-out (${preoutV.toFixed(1)} V) ➔ ganho ${gainDb.toFixed(1)} dB.`
    });
  } else if (gainDb > 40) {
    elIssues.push({
      code: 'ELE_GAIN_EXCESSIVE',
      severity: 'warn',
      msg: `Ganho muito alto (ELE-11): +${gainDb.toFixed(1)} dB (> 40 dB) aumenta o piso de ruído (Pre-out ${preoutV.toFixed(2)} V).`
    });
  }

  // ELE-07: Estimativa térmica da bobina baseada na potência nominal total dos drivers (Pe_total), com alarme > 250 °C
  let coilTempHtml = '';
  let estCoilC = null;
  if (measV > 0) {
    const pwrApplied = (measV * measV) / Math.max(0.2, zTotal);
    const loadRatio = pwrApplied / Math.max(10, peTotal);
    estCoilC = 25 + loadRatio * 135;
    if (estCoilC > 250) {
      elIssues.push({
        code: 'ELE_COIL_OVERTEMP',
        severity: 'critical',
        msg: `Alarme térmico crítico (ELE-07): Temperatura estimada da bobina (${estCoilC.toFixed(0)} °C) excede 250 °C (risco de fusão do verniz).`
      });
    }
    const tColor = estCoilC <= 120 ? '#4ade80' : (estCoilC <= 165 ? '#facc15' : '#f87171');
    coilTempHtml = `<div><b>Multímetro (${measV.toFixed(1)}V ➔ ${pwrApplied.toFixed(0)}W / Pe=${peTotal.toFixed(0)}W):</b> Temp. Provável Bobina ≈ <span style="color:${tColor};font-weight:700;">${estCoilC.toFixed(0)} °C</span></div>`;
  }

  const tPeriodMs = 1000.0 / Math.max(10.0, hpfHz);
  const attFactor = limProfile === 'sq_slow' ? 0.50 : (limProfile === 'fast_trio' ? 0.15 : 0.25);
  const relFactor = limProfile === 'sq_slow' ? 16.0 : (limProfile === 'fast_trio' ? 6.0 : 8.0);
  const attMs = attFactor * tPeriodMs;
  const relMs = relFactor * tPeriodMs;

  // Crossover Butterworth 2ª Ordem (12 dB/8ª) + Zobel (FIS-06: Le >= 0)
  const l_mh = ((Math.SQRT2 * zTotal) / (2.0 * Math.PI * xoverHz)) * 1000.0;
  const c_uf = (1.0 / (Math.SQRT2 * 2.0 * Math.PI * xoverHz * zTotal)) * 1e6;
  const rZobel = 1.25 * reTotal;
  const leTotalMh = Math.max(0, leMh * (reTotal / Math.max(0.1, rePerSpk)));
  const cZobelUf = ((leTotalMh / 1000.0) / Math.max(1e-6, rZobel * rZobel)) * 1e6;

  lastElectricalAudit = {
    valid: !elIssues.some(i => i.severity === 'critical'),
    issues: elIssues,
    zTotal, reTotal, iMax, maxAmp, vDropPct, vAmp, peTotal, estCoilC
  };

  const dspBox = document.getElementById('elDspResult');
  if (dspBox) {
    const dspAlerts = elIssues
      .filter(i => i.code === 'ELE_AMP_OVERPOWER' || i.code === 'ELE_COIL_OVERTEMP' || i.code === 'ELE_GAIN_SATURATION' || i.code === 'ELE_GAIN_EXCESSIVE')
      .map(i => i.severity === 'critical'
        ? `<div style="color:#f87171; font-weight:700; font-size:11px; margin-top:4px;">⛔ ${escapeHtmlStr(i.msg)}</div>`
        : `<div style="color:#facc15; font-weight:700; font-size:11px; margin-top:4px;">⚠️ ${escapeHtmlStr(i.msg)}</div>`)
      .join('');
    const hpfTag = isHpfEnabled ? `HPF ${hpfHz.toFixed(0)} Hz` : 'HPF OFF (ref. 20 Hz)';
    dspBox.innerHTML = `
      <div><b>Alvo de Ganho${derate70 ? ' (Derating 70%)' : ''}:</b> <span style="color:#10b981;font-weight:800;font-size:14px;">${vRmsTarget.toFixed(1)} V_rms</span> (${vPeakTarget.toFixed(1)} V_pico | ${iRmsTarget.toFixed(1)} A_rms)</div>
      ${coilTempHtml}
      <div><b>Ganho de Tensão Exigido:</b> ${gainDb >= 0 ? '+' : ''}${gainDb.toFixed(1)} dB (Entrada ${preoutV.toFixed(1)} V)</div>
      <div><b>Limiter DSP (${hpfTag}):</b> Attack = <b>${attMs.toFixed(2)} ms</b> | Release = <b>${relMs.toFixed(0)} ms</b></div>
      <div><b>Crossover 12dB/8ª (${xoverHz.toFixed(0)} Hz):</b> L = ${l_mh.toFixed(2)} mH | C = ${c_uf.toFixed(1)} µF</div>
      <div><b>Rede Zobel (Estabilização Le):</b> R_z = <b>${rZobel.toFixed(2)} Ω</b> | C_z = <b>${cZobelUf.toFixed(1)} µF</b></div>
      ${dspAlerts}
    `;
  }
}

function updateReverseVolume() {
  const resEl = document.getElementById('revVolResult');
  if (!resEl) return;
  const w = Math.max(5, parseFloat(document.getElementById('revW')?.value) || 80);
  const h = Math.max(5, parseFloat(document.getElementById('revH')?.value) || 42);
  const d1 = Math.max(5, parseFloat(document.getElementById('revD1')?.value) || 32);
  const d2 = Math.max(5, parseFloat(document.getElementById('revD2')?.value) || 44);
  const tCm = (Math.max(4, parseFloat(document.getElementById('revMdf')?.value) || 18)) / 10.0;
  const wIn = Math.max(1, w - 2 * tCm);
  const hIn = Math.max(1, h - 2 * tCm);
  const dIn = Math.max(1, 0.5 * (d1 + d2) - 2 * tCm);
  const volBrutoInt = (wIn * hIn * dIn) / 1000.0;
  const vSub = parseFloat(document.getElementById('tsVsub')?.value) || 0;
  const volLiq = Math.max(1, volBrutoInt - vSub);
  resEl.innerHTML =
    `<div><b>Medidas Internas:</b> ${wIn.toFixed(1)} × ${hIn.toFixed(1)} × ${dIn.toFixed(1)} cm (média)</div>` +
    `<div><b>Volume Interno Bruto:</b> <span style="color:var(--accent);font-weight:700;">${volBrutoInt.toFixed(1)} L</span> | <b>Líquido (−Vsub ${vSub}L):</b> <span style="color:#4ade80;font-weight:700;">${volLiq.toFixed(1)} L</span></div>`;
}
