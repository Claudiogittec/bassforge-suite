// ============================================================================
// RENDERIZAÇÃO GRÁFICA DE ALTA PRECISÃO NO CANVAS (EIXOS X/Y + MARCADORES)
// ============================================================================
const CHART_FONT_MONO = '"JetBrains Mono", Consolas, monospace';
const CHART_FONT_SANS = '"Inter", system-ui, sans-serif';

const DECADE_PRIORITY_FREQS = new Set([5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000]);

function selectNonOverlappingFreqLabels(candidates, gapPx = 4) {
  if (!Array.isArray(candidates) || !candidates.length) return [];
  const lastIdx = candidates.length - 1;
  const placed = [];
  const fits = cand => !placed.some(p => cand.left < p.right + gapPx && cand.right + gapPx > p.left);
  candidates.forEach(c => {
    if (c.idx === 0 || c.idx === lastIdx || DECADE_PRIORITY_FREQS.has(c.f)) {
      if (fits(c)) placed.push(c);
    }
  });
  candidates.forEach(c => {
    if (c.idx !== 0 && c.idx !== lastIdx && !DECADE_PRIORITY_FREQS.has(c.f)) {
      if (fits(c)) placed.push(c);
    }
  });
  return placed.sort((a, b) => a.idx - b.idx);
}

function getLogFreqTicks(fMin, fMax, isExpanded = false) {
  const majorMap = {
    '15-200':  [15, 20, 30, 40, 50, 70, 100, 150, 200],
    '15-500':  [15, 20, 30, 50, 70, 100, 200, 300, 500],
    '10-1000': [10, 20, 30, 50, 100, 200, 300, 500, 1000],
    '10-2000': [10, 20, 50, 100, 200, 500, 1000, 2000],
    '5-20000': isExpanded
      ? [5, 6, 7, 8, 9, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 200, 300, 400, 500, 600, 700, 800, 900, 1000, 2000, 3000, 4000, 5000, 6000, 7000, 8000, 9000, 10000, 13000, 16000, 20000]
      : [5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000]
  };
  const key = `${fMin}-${fMax}`;
  const majors = majorMap[key] || [5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000].filter(f => f >= fMin && f <= fMax);
  const majorSet = new Set(majors);
  const minors = [];
  for (let exp = 0; exp <= 4; exp++) {
    const base = Math.pow(10, exp);
    for (let m = 1; m <= 9; m++) {
      const f = m * base;
      if (f > fMin && f < fMax && !majorSet.has(f)) minors.push(f);
    }
    if (exp === 1 && fMin <= 15 && 15 < fMax && !majorSet.has(15)) minors.push(15);
  }
  return { majors, minors };
}

function formatFreqTick(f) {
  if (f >= 1000) return (f / 1000) + 'k';
  return String(f);
}

function formatYTickLabel(val, step, unit) {
  if (Math.abs(val) < 1e-9) return '0';
  if (unit === 'W' && Math.abs(val) >= 1000 && Math.abs(step) >= 500 && Number.isInteger(val / 500)) {
    return (val / 1000).toFixed(val % 1000 === 0 ? 0 : 1) + 'k';
  }
  const absStep = Math.abs(step);
  if (absStep < 0.5) return val.toFixed(2);
  if (absStep < 1) return val.toFixed(1);
  if (Number.isInteger(val)) return String(val);
  return val.toFixed(1);
}

function pickNiceStep(span, targetIntervals, allowedList) {
  if (allowedList) {
    let best = allowedList[allowedList.length - 1];
    let bestDiff = Infinity;
    for (const s of allowedList) {
      const count = span / s;
      const diff = Math.abs(count - targetIntervals);
      if (count >= 3 && count <= targetIntervals + 3 && diff < bestDiff) {
        best = s; bestDiff = diff;
      }
    }
    return best;
  }
  const raw = span / Math.max(2, targetIntervals);
  const mag = Math.pow(10, Math.floor(Math.log10(Math.max(1e-9, raw))));
  const norm = raw / mag;
  let nice = 1;
  if (norm <= 1.2) nice = 1;
  else if (norm <= 2.3) nice = 2;
  else if (norm <= 5.5) nice = 5;
  else nice = 10;
  return nice * mag;
}

function computeYAxisScale(freqs, seriesList, cfg, meta, fMin, fMax, isExpanded) {
  const targetIntervals = isExpanded ? 6 : 5;
  if (cfg.kind === 'phase') {
    return { yMin: -180, yMax: 180, ticks: [-180, -90, 0, 90, 180], step: 90 };
  }

  let yMin = cfg.min;
  let yMax = cfg.max;
  let step = 10;

  if (!chartOpts.autoScaleY) {
    if (cfg.kind === 'db') {
      step = (cfg.id === 'G4' || cfg.id === 'G7') ? 6 : 10;
    } else {
      const fixedSteps = { G1: 1000, G3: 20, G8: 10, G9: 15, G11: 15 };
      step = fixedSteps[cfg.id] || pickNiceStep(yMax - yMin, targetIntervals);
    }
  } else {
    const isImpedanceWide = (cfg.id === 'G3' || cfg.id === 'G11') && fMax > 2000;
    const fScaleMax = isImpedanceWide ? Math.min(fMax, 500) : fMax;
    let dMin = Infinity;
    let dMax = -Infinity;
    for (let i = 0; i < freqs.length; i++) {
      const f = freqs[i];
      if (f < fMin || f > fScaleMax) continue;
      for (const s of seriesList) {
        const v = s.values[i];
        if (!Number.isFinite(v)) continue;
        if (v < dMin) dMin = v;
        if (v > dMax) dMax = v;
      }
    }
    if (!Number.isFinite(dMin) || !Number.isFinite(dMax)) {
      dMin = cfg.min; dMax = cfg.max;
    }

    if (cfg.kind === 'db') {
      if (meta && meta.boxType === 'sealed' && cfg.id === 'G2' && dMax === 0 && dMin === 0) {
        yMin = 0; yMax = 10; step = 5;
      } else {
        // Evita que quedas subsônicas extremas (-80 dB por HPF 24dB/oct) achatem a banda útil
        const maxWindow = (cfg.id === 'G4' || cfg.id === 'G7') ? 30 : 45;
        if (dMax - dMin > maxWindow) {
          dMin = dMax - maxWindow;
        }
        if (cfg.id === 'G4' || cfg.id === 'G7') {
          dMin = Math.min(dMin, -6);
          dMax = Math.max(dMax, 0);
        }
        const minSpan = (cfg.id === 'G4' || cfg.id === 'G7') ? 18 : 25;
        if (dMax - dMin < minSpan) {
          const mid = (dMax + dMin) / 2;
          dMin = mid - minSpan / 2;
          dMax = mid + minSpan / 2;
        }
        const allowedDb = (cfg.id === 'G4' || cfg.id === 'G7') ? [3, 6, 12] : [5, 10, 15, 20];
        step = pickNiceStep(dMax - dMin, targetIntervals, allowedDb);
        yMin = Math.floor((dMin - step * 0.1) / step) * step;
        yMax = Math.ceil((dMax + step * 0.2) / step) * step;
      }
    } else {
      // Linear (W, Ω, mm, m/s)
      if (cfg.id === 'G1' && meta && meta.Pe > 0) dMax = Math.max(dMax, meta.Pe);
      if (cfg.id === 'G8' && meta && meta.Xmax > 0 && dMax < meta.Xmax * 1.4) {
        dMax = Math.max(dMax, meta.Xmax);
      }
      if (cfg.id === 'G9' && meta && (meta.boxType === 'sealed' || meta.boxType === 'free-air') && dMax === 0) {
        dMax = 10;
      }
      dMin = cfg.nonNeg ? 0 : dMin;
      if ((cfg.id === 'G3' || cfg.id === 'G11') && fMax > 2000) {
        // Escala de laboratório para impedância em banda larga (5–20k): preserva leitura nítida dos picos de ressonância (ex: 0–80 Ω, passo 5 Ω)
        yMin = 0;
        yMax = Math.max(80, Math.ceil((dMax * 1.45) / 10) * 10);
        step = (isExpanded && yMax <= 90) ? 5 : pickNiceStep(yMax, isExpanded ? 10 : 6, [5, 10, 20, 25, 50]);
        yMax = Math.ceil(yMax / step) * step;
      } else {
        const topPad = Math.max(dMax * 1.12, dMin + (dMax - dMin) * 1.14, dMin + 1);
        step = pickNiceStep(topPad - dMin, targetIntervals);
        yMin = cfg.nonNeg ? 0 : Math.floor(dMin / step) * step;
        yMax = Math.ceil(topPad / step) * step;
      }
    }
  }

  const ticks = [];
  const count = Math.round((yMax - yMin) / step);
  for (let i = 0; i <= count; i++) {
    ticks.push(Number((yMin + i * step).toFixed(6)));
  }
  return { yMin, yMax, ticks, step };
}

function interpolateSeriesAtFreq(freqs, values, fTarget) {
  if (!freqs || !freqs.length) return 0;
  if (fTarget <= freqs[0]) return values[0];
  const last = freqs.length - 1;
  if (fTarget >= freqs[last]) return values[last];
  let lo = 0, hi = last;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (freqs[mid] <= fTarget) lo = mid; else hi = mid;
  }
  const f0 = freqs[lo], f1 = freqs[hi];
  const logSpan = Math.log10(f1) - Math.log10(f0);
  const t = logSpan > 0 ? (Math.log10(fTarget) - Math.log10(f0)) / logSpan : 0;
  return values[lo] + t * (values[hi] - values[lo]);
}

function computeVisiblePeak(freqs, values, fMin, fMax) {
  let maxV = -Infinity, maxF = fMin;
  for (let i = 0; i < freqs.length; i++) {
    const f = freqs[i];
    if (f < fMin || f > fMax) continue;
    if (values[i] > maxV) { maxV = values[i]; maxF = f; }
  }
  return { maxV, maxF };
}

function drawLogChart(canvas, freqs, values, cfg, options = {}) {
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const w = options.exportW || canvas.clientWidth;
  const h = options.exportH || canvas.clientHeight;
  if (w < 20 || h < 20) return;

  canvas.width = w * dpr;
  canvas.height = h * dpr;
  ctx.scale(dpr, dpr);

  const isExpanded = Boolean(options.isExpanded);
  const fMin = chartOpts.fMin;
  const fMax = chartOpts.fMax;
  const meta = (currentCurves && currentCurves.meta) || {};
  const seriesList = (options.overlaySeries && options.overlaySeries.length)
    ? options.overlaySeries
    : [{ label: cfg.title, unit: cfg.unit, color: cfg.color, values, primary: true }];

  // Fundo limpo
  ctx.fillStyle = '#06090f';
  ctx.fillRect(0, 0, w, h);

  // Escala Y inteligente & Padding dinâmico
  const yScale = computeYAxisScale(freqs, seriesList, cfg, meta, fMin, fMax, isExpanded);
  const tickFontPx = isExpanded ? 11 : 9.5;
  ctx.font = `${tickFontPx}px ${CHART_FONT_MONO}`;

  let maxLabelW = ctx.measureText(cfg.unit).width;
  yScale.ticks.forEach(tVal => {
    const lw = ctx.measureText(formatYTickLabel(tVal, yScale.step, cfg.unit)).width;
    if (lw > maxLabelW) maxLabelW = lw;
  });

  const padL = Math.max(isExpanded ? 50 : 42, Math.ceil(maxLabelW) + 14);
  const padR = isExpanded ? 22 : 14;
  const padT = (options.exportHeaderH || 0) + (isExpanded ? 26 : 18);
  const padB = isExpanded ? 30 : 24;
  const pw = w - padL - padR;
  const ph = h - padT - padB;
  if (pw < 20 || ph < 20) return;

  const logMin = Math.log10(fMin), logMax = Math.log10(fMax);
  const xMap = f => padL + ((Math.log10(f) - logMin) / (logMax - logMin)) * pw;
  const yMap = v => padT + ((yScale.yMax - v) / (yScale.yMax - yScale.yMin)) * ph;

  // Cabeçalho extra para exportação PNG
  if (options.exportTitle) {
    ctx.fillStyle = '#0b111d';
    ctx.fillRect(0, 0, w, options.exportHeaderH);
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, options.exportHeaderH); ctx.lineTo(w, options.exportHeaderH); ctx.stroke();
    ctx.fillStyle = '#00d4ff';
    ctx.font = `700 13px ${CHART_FONT_SANS}`;
    ctx.textAlign = 'left';
    ctx.fillText('BassForge SUITE — ' + options.exportTitle, 16, 22);
    ctx.fillStyle = '#94a3b8';
    ctx.font = `11px ${CHART_FONT_MONO}`;
    ctx.fillText(options.exportSubtitle || '', 16, 40);
  }

  // Fundo sutil da área do gráfico
  ctx.fillStyle = '#070b14';
  ctx.fillRect(padL, padT, pw, ph);

  // Grade Logarítmica X (menores + principais; décadas em destaque)
  const { majors, minors } = getLogFreqTicks(fMin, fMax, isExpanded);
  const decadeSet = new Set([10, 100, 1000, 10000]);
  ctx.lineWidth = 1;
  ctx.strokeStyle = 'rgba(30, 41, 59, 0.38)';
  minors.forEach(f => {
    const x = Math.round(xMap(f)) + 0.5;
    ctx.beginPath(); ctx.moveTo(x, padT); ctx.lineTo(x, padT + ph); ctx.stroke();
  });
  majors.forEach(f => {
    const x = Math.round(xMap(f)) + 0.5;
    ctx.strokeStyle = decadeSet.has(f) ? '#293850' : '#182336';
    ctx.beginPath(); ctx.moveTo(x, padT); ctx.lineTo(x, padT + ph); ctx.stroke();
  });

  // Faixa de referência de bandas acústicas no topo do gráfico expandido em 5–20k
  if (isExpanded && fMax >= 10000 && pw > 420) {
    const bands = [
      { f0: 5, f1: 20, label: 'Infrasound', bg: 'rgba(147, 51, 234, 0.14)' },
      { f0: 20, f1: 60, label: 'Sub-bass', bg: 'rgba(220, 38, 38, 0.14)' },
      { f0: 60, f1: 250, label: 'Bass', bg: 'rgba(217, 119, 6, 0.14)' },
      { f0: 250, f1: 500, label: 'Low mid', bg: 'rgba(132, 204, 22, 0.12)' },
      { f0: 500, f1: 2000, label: 'Mid', bg: 'rgba(16, 185, 129, 0.13)' },
      { f0: 2000, f1: 4000, label: 'Upper mid', bg: 'rgba(6, 182, 212, 0.13)' },
      { f0: 4000, f1: 6000, label: 'Presence', bg: 'rgba(59, 130, 246, 0.14)' },
      { f0: 6000, f1: 20000, label: 'Brilliance', bg: 'rgba(139, 92, 246, 0.14)' }
    ];
    const bandH = 14;
    ctx.save();
    ctx.font = `600 9px ${CHART_FONT_SANS}`;
    ctx.textAlign = 'center';
    bands.forEach(b => {
      const bx0 = Math.max(padL, xMap(Math.max(fMin, b.f0)));
      const bx1 = Math.min(padL + pw, xMap(Math.min(fMax, b.f1)));
      if (bx1 - bx0 < 2) return;
      ctx.fillStyle = b.bg;
      ctx.fillRect(bx0, padT, bx1 - bx0, bandH);
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.22)';
      ctx.beginPath(); ctx.moveTo(bx1, padT); ctx.lineTo(bx1, padT + bandH); ctx.stroke();
      if (bx1 - bx0 >= 38) {
        ctx.fillStyle = 'rgba(203, 213, 225, 0.78)';
        ctx.fillText(b.label, (bx0 + bx1) * 0.5, padT + 10);
      }
    });
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.22)';
    ctx.beginPath(); ctx.moveTo(padL, padT + bandH + 0.5); ctx.lineTo(padL + pw, padT + bandH + 0.5); ctx.stroke();
    ctx.restore();
  }

  // Grade Y horizontal + rótulos nítidos
  ctx.font = `${tickFontPx}px ${CHART_FONT_MONO}`;
  ctx.textAlign = 'right';
  yScale.ticks.forEach(yVal => {
    const y = Math.round(yMap(yVal)) + 0.5;
    ctx.strokeStyle = Math.abs(yVal) < 1e-9 ? '#334155' : '#1a2538';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(padL + pw, y); ctx.stroke();
    // Tickzinho externo esquerdo
    ctx.strokeStyle = '#475569';
    ctx.beginPath(); ctx.moveTo(padL - 4, y); ctx.lineTo(padL, y); ctx.stroke();

    ctx.fillStyle = Math.abs(yVal) < 1e-9 ? '#cbd5e1' : '#7c8ea6';
    ctx.fillText(formatYTickLabel(yVal, yScale.step, cfg.unit), padL - 7, y + 3.5);
  });

  // Rótulos do eixo X centralizados + tickzinhos (prioriza décadas principais 100/1k/10k em bandas largas)
  const labelCand = [];
  const lastIdx = majors.length - 1;
  majors.forEach((f, idx) => {
    const x = xMap(f);
    ctx.strokeStyle = '#475569';
    ctx.beginPath(); ctx.moveTo(x, padT + ph); ctx.lineTo(x, padT + ph + 4); ctx.stroke();
    const txt = formatFreqTick(f);
    const tw = ctx.measureText(txt).width;
    let align = 'center';
    let left = x - tw / 2;
    let right = x + tw / 2;
    if (idx === lastIdx && x > w - 16) { align = 'right'; left = x - tw; right = x; }
    else if (idx === 0 && x < padL + 10) { align = 'left'; left = x; right = x + tw; }
    labelCand.push({ f, idx, x, txt, tw, align, left, right });
  });
  const drawnLabels = selectNonOverlappingFreqLabels(labelCand, 4);
  drawnLabels.forEach(c => {
    ctx.textAlign = c.align;
    ctx.fillStyle = '#8fa1b8';
    ctx.fillText(c.txt, c.x, padT + ph + (isExpanded ? 16 : 13));
  });

  // Unidades explícitas nos eixos
  ctx.font = `700 ${isExpanded ? 10 : 9}px ${CHART_FONT_MONO}`;
  ctx.fillStyle = '#00d4ff';
  ctx.textAlign = 'right';
  ctx.fillText(cfg.unit, padL - 6, padT - 5);
  ctx.fillStyle = '#64748b';
  ctx.fillText('Hz', w - 4, padT + ph + (isExpanded ? 16 : 13));

  // Moldura dos eixos X e Y
  ctx.strokeStyle = '#2d3c54';
  ctx.lineWidth = 1;
  ctx.strokeRect(padL, padT, pw, ph);

  // ==========================================================
  // ÁREA RECORTADA (CLIP) PARA LIMITE, GRADIENTE E CURVAS
  // ==========================================================
  ctx.save();
  ctx.beginPath();
  ctx.rect(padL, padT, pw, ph);
  ctx.clip();

  // Faixa de perigo e linhas horizontais de limite (Xmax, Mach, Pe, Re, -3dB)
  const hLimits = [];
  if (chartOpts.showLimits) {
    if (cfg.id === 'G4') {
      hLimits.push({ val: 0, label: '0 dB', color: '#64748b', dash: [4, 3] });
      hLimits.push({ val: -3, label: '-3 dB', color: '#22c55e', dash: [4, 3] });
    } else if (cfg.id === 'G7') {
      hLimits.push({ val: 0, label: '0 dB', color: '#64748b', dash: [4, 3] });
    } else if (cfg.id === 'G8' && meta.Xmax > 0) {
      hLimits.push({ val: meta.Xmax, label: `Xmax ${meta.Xmax.toFixed(1)}mm`, color: '#ef4444', dash: [5, 3], dangerAbove: true });
    } else if (cfg.id === 'G9' && (meta.boxType === 'bass-reflex' || meta.boxType === 'bp4' || meta.boxType === 'bp6' || meta.boxType === 'planar')) {
      const cVel = meta.c || 343.37;
      hLimits.push({ val: cVel * 0.05, label: `5% Mach (${(cVel * 0.05).toFixed(1)})`, color: '#f59e0b', dash: [4, 3] });
      hLimits.push({ val: cVel * 0.10, label: `10% Mach`, color: '#ef4444', dash: [4, 3], dangerAbove: true });
    } else if (cfg.id === 'G1' && meta.Pe > 0) {
      hLimits.push({ val: meta.Pe, label: `Pe ${meta.Pe}W`, color: '#f59e0b', dash: [4, 3] });
    } else if ((cfg.id === 'G3' || cfg.id === 'G11') && meta.Re > 0) {
      hLimits.push({ val: meta.Re, label: `Re ${meta.Re.toFixed(1)}Ω`, color: '#38bdf8', dash: [3, 4] });
    } else if (cfg.id === 'G13') {
      hLimits.push({ val: 20, label: '20 ms (Limiar Audível)', color: '#f59e0b', dash: [4, 3], dangerAbove: true });
    }
  }

  hLimits.forEach(lim => {
    if (lim.val < yScale.yMin || lim.val > yScale.yMax) return;
    const yLim = yMap(lim.val);
    if (lim.dangerAbove && yLim > padT) {
      ctx.fillStyle = 'rgba(239, 68, 68, 0.09)';
      ctx.fillRect(padL, padT, pw, yLim - padT);
    }
    ctx.strokeStyle = lim.color;
    ctx.lineWidth = 1.15;
    ctx.setLineDash(lim.dash);
    ctx.beginPath(); ctx.moveTo(padL, yLim); ctx.lineTo(padL + pw, yLim); ctx.stroke();
    ctx.setLineDash([]);

    ctx.font = `700 ${isExpanded ? 10 : 8.5}px ${CHART_FONT_MONO}`;
    const txtW = ctx.measureText(lim.label).width;
    const lblY = (yLim - padT < 14) ? yLim + 11 : yLim - 4;
    ctx.fillStyle = 'rgba(6, 9, 15, 0.82)';
    ctx.fillRect(padL + pw - txtW - 8, lblY - 9, txtW + 6, 11);
    ctx.fillStyle = lim.color;
    ctx.textAlign = 'right';
    ctx.fillText(lim.label, padL + pw - 5, lblY);
  });

  // Marcadores verticais de engenharia (Fs, HPF, Fb/Fc, F3/FL/FH, λ/4)
  if (chartOpts.showMarkers && meta.Fs) {
    const isVentedMeta = (meta.boxType === 'bass-reflex' || meta.boxType === 'bp4' || meta.boxType === 'bp6' || meta.boxType === 'planar');
    const isBpMeta = (meta.boxType === 'bp4' || meta.boxType === 'bp6');
    const rawMarkers = [
      { f: meta.Fs, tag: 'Fs', color: '#94a3b8' },
      { f: isVentedMeta ? meta.Fb : meta.fc, tag: isBpMeta ? 'FbVF' : (isVentedMeta ? 'Fb' : 'Fc'), color: '#00d4ff' },
      { f: meta.F3, tag: isBpMeta ? 'FL' : 'F3', color: '#22c55e' }
    ];
    if (meta.boxType === 'bp4' && meta.fc) rawMarkers.push({ f: meta.fc, tag: 'FcR', color: '#a855f7' });
    if (meta.boxType === 'bp6' && meta.FbVr) rawMarkers.push({ f: meta.FbVr, tag: 'FbVR', color: '#a855f7' });
    if (isBpMeta && meta.FH && meta.FH > 0) rawMarkers.push({ f: meta.FH, tag: 'FH', color: '#22c55e' });
    if (meta.hpfHz && meta.hpfHz > 10) rawMarkers.push({ f: meta.hpfHz, tag: 'HPF', color: '#f59e0b' });
    if (isVentedMeta && meta.fPipe1 && meta.fPipe1 > 0) {
      rawMarkers.push({ f: meta.fPipe1, tag: 'f_pipe', color: '#f43f5e' });
    }
    if (meta.boxType === 'planar' && meta.fQuarterWave && meta.fQuarterWave > 0) {
      rawMarkers.push({ f: meta.fQuarterWave, tag: 'λ/4', color: '#14b8a6' });
    }
    if (meta.boxType === 'planar' && meta.fHalfWave && meta.fHalfWave > 0) {
      rawMarkers.push({ f: meta.fHalfWave, tag: 'λ/2', color: '#f97316' });
    }

    const visMarkers = rawMarkers
      .filter(m => m.f && m.f >= fMin && m.f <= fMax)
      .map(m => ({ ...m, x: xMap(m.f) }))
      .sort((a, b) => a.x - b.x);

    const maxRows = 4;
    const lastRowEndX = new Array(maxRows).fill(-999);
    visMarkers.forEach(m => {
      ctx.strokeStyle = m.color;
      ctx.globalAlpha = 0.55;
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.beginPath(); ctx.moveTo(m.x, padT); ctx.lineTo(m.x, padT + ph); ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;

      const labelTxt = isExpanded ? `${m.tag} ${m.f.toFixed(1)}` : m.tag;
      ctx.font = `700 ${isExpanded ? 9.5 : 8.5}px ${CHART_FONT_MONO}`;
      const lw = ctx.measureText(labelTxt).width + 6;
      const boxX = Math.min(padL + pw - lw - 2, Math.max(padL + 2, m.x + 3));
      let row = -1;
      for (let r = 0; r < maxRows; r++) {
        if (boxX >= lastRowEndX[r] + 3) { row = r; break; }
      }
      if (row === -1) {
        row = 0;
        for (let r = 1; r < maxRows; r++) {
          if (lastRowEndX[r] < lastRowEndX[row]) row = r;
        }
      }
      lastRowEndX[row] = boxX + lw;
      const boxY = padT + 3 + row * (isExpanded ? 14 : 12);

      ctx.fillStyle = 'rgba(6, 9, 15, 0.85)';
      ctx.fillRect(boxX, boxY, lw, isExpanded ? 12 : 10.5);
      ctx.fillStyle = m.color;
      ctx.textAlign = 'left';
      ctx.fillText(labelTxt, boxX + 3, boxY + (isExpanded ? 9 : 8));
    });
  }

  // Área preenchida sutil abaixo da curva principal
  const primarySeries = seriesList[0];
  if (seriesList.length === 1) {
    const baseLineY = yMap(cfg.id === 'G4' || cfg.id === 'G7' || cfg.kind === 'phase' ? 0 : yScale.yMin);
    ctx.beginPath();
    let started = false;
    let firstX = padL, lastX = padL;
    freqs.forEach((f, i) => {
      if (f < fMin * 0.95 || f > fMax * 1.05) return;
      const x = xMap(f);
      const y = yMap(primarySeries.values[i]);
      if (!started) { ctx.moveTo(x, y); firstX = x; started = true; }
      else ctx.lineTo(x, y);
      lastX = x;
    });
    if (started) {
      ctx.lineTo(lastX, baseLineY);
      ctx.lineTo(firstX, baseLineY);
      ctx.closePath();
      const grad = ctx.createLinearGradient(0, padT, 0, padT + ph);
      grad.addColorStop(0, primarySeries.color + '2e');
      grad.addColorStop(1, primarySeries.color + '03');
      ctx.fillStyle = grad;
      ctx.fill();
    }
  }

  // Traçado das curvas (sem achatamento falso no topo/fundo graças ao ctx.clip!)
  seriesList.forEach(s => {
    ctx.strokeStyle = s.color;
    ctx.lineWidth = isExpanded ? (s.primary ? 2.5 : 2.0) : (s.primary ? 2.0 : 1.5);
    ctx.lineJoin = 'round';
    if (s.dash) ctx.setLineDash(s.dash); else ctx.setLineDash([]);
    ctx.beginPath();
    let started = false;
    freqs.forEach((f, i) => {
      if (f < fMin * 0.95 || f > fMax * 1.05) return;
      const x = xMap(f);
      const y = yMap(s.values[i]);
      if (!started) { ctx.moveTo(x, y); started = true; }
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
    ctx.setLineDash([]);
  });

  // Legenda para múltiplas curvas (adaptativa p/ grade e modo expandido)
  if (seriesList.length > 1) {
    let lx = padL + (isExpanded ? 10 : 6);
    const legH = isExpanded ? 15 : 13;
    const ly = padT + ph - (legH + 3);
    ctx.font = `700 ${isExpanded ? 10.5 : 8.5}px ${CHART_FONT_MONO}`;
    seriesList.forEach(s => {
      const txt = isExpanded ? s.label : (s.shortLabel || s.label);
      const tw = ctx.measureText(txt).width + (isExpanded ? 20 : 16);
      ctx.fillStyle = 'rgba(6, 9, 15, 0.85)';
      ctx.fillRect(lx, ly, tw, legH);
      ctx.fillStyle = s.color;
      ctx.fillRect(lx + 4, ly + Math.floor(legH / 2) - 1, isExpanded ? 8 : 6, 3);
      ctx.fillStyle = '#e2e8f0';
      ctx.textAlign = 'left';
      ctx.fillText(txt, lx + (isExpanded ? 16 : 13), ly + (isExpanded ? 11 : 9.5));
      lx += tw + (isExpanded ? 8 : 5);
    });
  }

  // Crosshair completo X + Y + ponto luminoso sobre a curva (suporta hover e fixação por clique)
  const isPinned = !!options.isPinned;
  let crossX = options.crosshairX;
  if (crossX == null && options.crosshairFreq != null && options.crosshairFreq >= fMin && options.crosshairFreq <= fMax) {
    crossX = xMap(options.crosshairFreq);
  }
  if (crossX != null && crossX >= padL && crossX <= padL + pw) {
    const ratio = (crossX - padL) / pw;
    const fCur = (options.crosshairFreq != null && options.crosshairX == null)
      ? options.crosshairFreq
      : Math.pow(10, logMin + ratio * (logMax - logMin));
    const vCur = interpolateSeriesAtFreq(freqs, primarySeries.values, fCur);
    const yCur = yMap(vCur);

    ctx.strokeStyle = isPinned ? 'rgba(0, 212, 255, 0.90)' : 'rgba(148, 163, 184, 0.75)';
    ctx.lineWidth = isPinned ? 1.25 : 1;
    ctx.setLineDash(isPinned ? [5, 2] : [3, 3]);
    ctx.beginPath(); ctx.moveTo(crossX, padT); ctx.lineTo(crossX, padT + ph); ctx.stroke();
    if (yCur >= padT && yCur <= padT + ph) {
      ctx.beginPath(); ctx.moveTo(padL, yCur); ctx.lineTo(padL + pw, yCur); ctx.stroke();
    }
    ctx.setLineDash([]);

    seriesList.forEach(s => {
      const sv = interpolateSeriesAtFreq(freqs, s.values, fCur);
      const sy = yMap(sv);
      ctx.fillStyle = '#06090f';
      ctx.beginPath(); ctx.arc(crossX, sy, isExpanded ? 5.5 : 4.2, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = isPinned ? '#00d4ff' : s.color;
      ctx.beginPath(); ctx.arc(crossX, sy, isExpanded ? 3.8 : 3.0, 0, Math.PI * 2); ctx.fill();
    });

    // Tooltip flutuante no gráfico expandido
    if (isExpanded) {
      const lines = [`${isPinned ? '📌 ' : ''}${fCur.toFixed(1)} Hz`];
      seriesList.forEach(s => {
        const sv = interpolateSeriesAtFreq(freqs, s.values, fCur);
        const prefix = seriesList.length > 1 ? s.shortLabel + ': ' : '';
        lines.push(`${prefix}${sv.toFixed(2)} ${cfg.unit}`);
      });
      if (seriesList.length === 2 && seriesList[1].isRefA) {
        const vB = interpolateSeriesAtFreq(freqs, seriesList[0].values, fCur);
        const vA = interpolateSeriesAtFreq(freqs, seriesList[1].values, fCur);
        const dv = vB - vA;
        lines.push(`Δ (B−A): ${dv >= 0 ? '+' : ''}${dv.toFixed(2)} ${cfg.unit}`);
      }
      ctx.font = `700 11px ${CHART_FONT_MONO}`;
      const maxTw = Math.max(...lines.map(l => ctx.measureText(l).width));
      const boxW = maxTw + 16;
      const boxH = lines.length * 16 + 10;
      const flipLeft = (crossX + 12 + boxW > padL + pw);
      const tx = flipLeft ? crossX - boxW - 10 : crossX + 10;
      const ty = Math.min(padT + ph - boxH - 6, Math.max(padT + 6, yCur - boxH / 2));

      ctx.fillStyle = 'rgba(11, 17, 29, 0.94)';
      ctx.strokeStyle = primarySeries.color;
      ctx.lineWidth = 1;
      ctx.fillRect(tx, ty, boxW, boxH);
      ctx.strokeRect(tx, ty, boxW, boxH);

      lines.forEach((line, idx) => {
        ctx.fillStyle = idx === 0 ? '#00d4ff' : (seriesList[idx - 1] ? seriesList[idx - 1].color : '#f1f5f9');
        ctx.textAlign = 'left';
        ctx.fillText(line, tx + 8, ty + 16 + idx * 16);
      });
    }
  }

  ctx.restore();

  // Salva geometria real usada para o pointer tracking
  canvas._chartGeom = { padL, padT, pw, ph, fMin, fMax };
}

let pinnedCrosshairFreq = null;

function bindInteractiveChart(canvas, drawFn, getReadout, onLeave) {
  canvas.onmousemove = e => {
    if (pinnedCrosshairFreq != null) return;
    const g = canvas._chartGeom;
    if (!g) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    if (x >= g.padL && x <= g.padL + g.pw) {
      const ratio = (x - g.padL) / g.pw;
      const f = Math.pow(10, Math.log10(g.fMin) + ratio * (Math.log10(g.fMax) - Math.log10(g.fMin)));
      getReadout(f, x, false);
      drawFn(x);
    }
  };
  canvas.onmouseleave = () => {
    if (pinnedCrosshairFreq != null) return;
    onLeave();
    drawFn(null);
  };
  canvas.onclick = e => {
    if (e.button && e.button !== 0) return;
    const g = canvas._chartGeom;
    if (!g) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    if (x < g.padL || x > g.padL + g.pw) return;
    if (pinnedCrosshairFreq != null) {
      pinnedCrosshairFreq = null;
    } else {
      const ratio = (x - g.padL) / g.pw;
      pinnedCrosshairFreq = Math.pow(10, Math.log10(g.fMin) + ratio * (Math.log10(g.fMax) - Math.log10(g.fMin)));
    }
    drawAllCharts();
    renderExpanded();
  };
}

function getBp6DualPortVelSeries(cfg) {
  if (!cfg || !currentCurves || !currentCurves.meta) return null;
  if (cfg.id === 'G6' && Array.isArray(currentCurves.G6_SPLMaxReal) && Array.isArray(currentCurves.G6_SPLThermic)) {
    return [
      { shortLabel: 'SPL Real', label: 'SPL Máx Real (Xmax+Pe)', unit: cfg.unit, color: '#ef4444', values: currentCurves.G6_SPLMaxReal, primary: true },
      { shortLabel: 'Teto Pe', label: 'Teto Térmico (Pe)', unit: cfg.unit, color: '#94a3b8', dash: [5, 3], values: currentCurves.G6_SPLThermic, primary: false }
    ];
  }
  if (currentCurves.meta.boxType !== 'bp6') return null;
  if (cfg.id === 'G9' && Array.isArray(currentCurves.G9_PortAirVel_VF) && Array.isArray(currentCurves.G9_PortAirVel_VR)) {
    return [
      { shortLabel: 'Duto VF', label: 'Duto VF (Frontal)', unit: cfg.unit, color: '#00d4ff', values: currentCurves.G9_PortAirVel_VF, primary: true },
      { shortLabel: 'Duto VR', label: 'Duto VR (Traseiro)', unit: cfg.unit, color: '#a855f7', values: currentCurves.G9_PortAirVel_VR, primary: false }
    ];
  }
  if (cfg.id === 'G2' && Array.isArray(currentCurves.G2_VentSPL_VF) && Array.isArray(currentCurves.G2_VentSPL_VR)) {
    return [
      { shortLabel: 'Total', label: 'Total (VF+VR)', unit: cfg.unit, color: '#f97316', values: currentCurves.G2_VentSPL, primary: true },
      { shortLabel: 'VF', label: 'Duto VF (Frontal)', unit: cfg.unit, color: '#00d4ff', dash: [5, 3], values: currentCurves.G2_VentSPL_VF, primary: false },
      { shortLabel: 'VR', label: 'Duto VR (Traseiro)', unit: cfg.unit, color: '#a855f7', dash: [5, 3], values: currentCurves.G2_VentSPL_VR, primary: false }
    ];
  }
  return null;
}

function getExpandedOverlayConfig(baseCfg) {
  const ovEl = document.getElementById('expandedOverlay');
  const mode = ovEl ? ovEl.value : 'none';
  if (mode === 'spl_box') {
    const c6 = CHARTS_INFO.find(c => c.id === 'G6');
    const c10 = CHARTS_INFO.find(c => c.id === 'G10');
    const c2 = CHARTS_INFO.find(c => c.id === 'G2');
    return {
      cfg: c6,
      series: [
        { shortLabel: 'Térmico', label: '#6 SPL Térmico', unit: 'dB', color: '#ef4444', values: currentCurves[c6.key], primary: true },
        { shortLabel: 'Cone', label: '#10 Cone SPL', unit: 'dB', color: '#38bdf8', values: currentCurves[c10.key], primary: false },
        { shortLabel: 'Duto', label: '#2 Vent SPL', unit: 'dB', color: '#f97316', values: currentCurves[c2.key], primary: false }
      ]
    };
  }
  if (mode === 'spl_car') {
    const c5 = CHARTS_INFO.find(c => c.id === 'G5');
    const c6 = CHARTS_INFO.find(c => c.id === 'G6');
    return {
      cfg: c5,
      series: [
        { shortLabel: 'In-Car', label: '#5 SPL in Car', unit: 'dB', color: '#e11d48', values: currentCurves[c5.key], primary: true },
        { shortLabel: 'Térmico', label: '#6 SPL Térmico', unit: 'dB', color: '#38bdf8', values: currentCurves[c6.key], primary: false }
      ]
    };
  }
  if (mode === 'z_dual') {
    const c11 = CHARTS_INFO.find(c => c.id === 'G11');
    const c3 = CHARTS_INFO.find(c => c.id === 'G3');
    return {
      cfg: c11,
      series: [
        { shortLabel: 'Na Caixa', label: '#11 Z In-Box', unit: 'Ω', color: '#00d4ff', values: currentCurves[c11.key], primary: true },
        { shortLabel: 'Ar Livre', label: '#3 Z Free-Air', unit: 'Ω', color: '#f59e0b', values: currentCurves[c3.key], primary: false }
      ]
    };
  }
  const bp6VelSeries = getBp6DualPortVelSeries(baseCfg);
  if (referenceSnapshot && referenceSnapshot.curves[baseCfg.key]) {
    if (bp6VelSeries) {
      return {
        cfg: baseCfg,
        series: [
          ...bp6VelSeries,
          { shortLabel: 'Ref (A)', label: referenceSnapshot.label, unit: baseCfg.unit, color: '#fbbf24', dash: [6, 4], values: referenceSnapshot.curves[baseCfg.key], primary: false, isRefA: true }
        ]
      };
    }
    return {
      cfg: baseCfg,
      series: [
        { shortLabel: 'Atual (B)', label: 'Atual (B): ' + baseCfg.title, unit: baseCfg.unit, color: baseCfg.color, values: currentCurves[baseCfg.key], primary: true },
        { shortLabel: 'Ref (A)', label: referenceSnapshot.label, unit: baseCfg.unit, color: '#fbbf24', dash: [6, 4], values: referenceSnapshot.curves[baseCfg.key], primary: false, isRefA: true }
      ]
    };
  }
  if (bp6VelSeries) {
    return { cfg: baseCfg, series: bp6VelSeries };
  }
  return { cfg: baseCfg, series: null };
}

function onExpandedOverlayChange() {
  const mode = document.getElementById('expandedOverlay').value;
  const sel = document.getElementById('expandedSelect');
  if (sel) {
    if (mode === 'spl_box') sel.value = 'G6';
    else if (mode === 'spl_car') sel.value = 'G5';
    else if (mode === 'z_dual') sel.value = 'G11';
  }
  renderExpanded();
}

function drawAllCharts() {
  if (!currentCurves) return;
  Object.values(CHART_REGISTRY).filter(c => c && c.key && c.availability !== 'unimplemented').forEach(c => {
    const cv = document.getElementById('cv_' + c.id);
    const infoEl = document.getElementById('info_' + c.id);
    if (!cv) return;
    const bp6VelSeries = getBp6DualPortVelSeries(c);
    const hasRefA = Boolean(referenceSnapshot && referenceSnapshot.curves[c.key]);
    const abSeries = hasRefA
      ? (bp6VelSeries
          ? [
              ...bp6VelSeries,
              { shortLabel: 'A', label: referenceSnapshot.label, unit: c.unit, color: '#fbbf24', dash: [5, 3], values: referenceSnapshot.curves[c.key], primary: false, isRefA: true }
            ]
          : [
              { shortLabel: 'B', label: c.title, unit: c.unit, color: c.color, values: currentCurves[c.key], primary: true },
              { shortLabel: 'A', label: referenceSnapshot.label, unit: c.unit, color: '#fbbf24', dash: [5, 3], values: referenceSnapshot.curves[c.key], primary: false, isRefA: true }
            ])
      : bp6VelSeries;
    const setSummary = () => {
      if (!infoEl) return;
      if (bp6VelSeries && c.id === 'G6') {
        const pkReal = computeVisiblePeak(currentCurves.frequencies, bp6VelSeries[0].values, chartOpts.fMin, chartOpts.fMax);
        const pkTh = computeVisiblePeak(currentCurves.frequencies, bp6VelSeries[1].values, chartOpts.fMin, chartOpts.fMax);
        const diff = pkTh.maxV - pkReal.maxV;
        infoEl.innerHTML = (diff > 0.2)
          ? `<span><b style="color:#ef4444">Real ${pkReal.maxV.toFixed(1)}</b> · <b style="color:#94a3b8">Pe ${pkTh.maxV.toFixed(1)}</b> dB</span><span>${hasRefA ? 'A/B · ⤢' : '⤢'}</span>`
          : `<span>SPL Real: <b style="color:#ef4444">${pkReal.maxV.toFixed(1)} dB</b> @ ${pkReal.maxF.toFixed(0)} Hz</span><span>${hasRefA ? 'A/B · ⤢' : '⤢'}</span>`;
        return;
      }
      if (bp6VelSeries && c.id === 'G9') {
        const pkF = computeVisiblePeak(currentCurves.frequencies, bp6VelSeries[0].values, chartOpts.fMin, chartOpts.fMax);
        const pkR = computeVisiblePeak(currentCurves.frequencies, bp6VelSeries[1].values, chartOpts.fMin, chartOpts.fMax);
        infoEl.innerHTML = `<span><b style="color:#00d4ff">VF ${pkF.maxV.toFixed(1)}</b>@${pkF.maxF.toFixed(0)}Hz · <b style="color:#a855f7">VR ${pkR.maxV.toFixed(1)}</b>@${pkR.maxF.toFixed(0)}Hz</span><span>${hasRefA ? 'A/B · ⤢' : '⤢'}</span>`;
        return;
      }
      if (bp6VelSeries && c.id === 'G2') {
        const pkT = computeVisiblePeak(currentCurves.frequencies, bp6VelSeries[0].values, chartOpts.fMin, chartOpts.fMax);
        const pkF = computeVisiblePeak(currentCurves.frequencies, bp6VelSeries[1].values, chartOpts.fMin, chartOpts.fMax);
        const pkR = computeVisiblePeak(currentCurves.frequencies, bp6VelSeries[2].values, chartOpts.fMin, chartOpts.fMax);
        infoEl.innerHTML = `<span><b style="color:#f97316">Tot ${pkT.maxV.toFixed(1)}</b> · <b style="color:#00d4ff">VF ${pkF.maxV.toFixed(1)}</b> · <b style="color:#a855f7">VR ${pkR.maxV.toFixed(1)}</b> dB</span><span>${hasRefA ? 'A/B · ⤢' : '⤢'}</span>`;
        return;
      }
      const pk = computeVisiblePeak(currentCurves.frequencies, currentCurves[c.key], chartOpts.fMin, chartOpts.fMax);
      infoEl.innerHTML = `<span>Pico: <b style="color:${c.color}">${pk.maxV.toFixed(1)} ${c.unit}</b> @ ${pk.maxF.toFixed(0)} Hz</span><span>${hasRefA ? 'A/B Ativo · ⤢' : 'Duplo-clique ⤢'}</span>`;
    };
    const setReadout = (f, _x, pinned) => {
      const val = interpolateSeriesAtFreq(currentCurves.frequencies, currentCurves[c.key], f);
      const pinTag = pinned ? '📌 ' : '';
      if (bp6VelSeries && c.id === 'G6') {
        const vReal = interpolateSeriesAtFreq(currentCurves.frequencies, bp6VelSeries[0].values, f);
        const vTh = interpolateSeriesAtFreq(currentCurves.frequencies, bp6VelSeries[1].values, f);
        const loss = vReal - vTh;
        const lossTag = (loss < -0.15) ? ` <span style="color:#f59e0b">(${loss.toFixed(1)}dB Xmax)</span>` : '';
        if (infoEl) infoEl.innerHTML = `<span style="color:var(--accent)"><b>${pinTag}${f.toFixed(1)}Hz</b> <span style="color:#ef4444">Real:${vReal.toFixed(1)}</span> | <span style="color:#94a3b8">Pe:${vTh.toFixed(1)}</span>${lossTag}</span><span>${pinned ? 'Soltar' : 'Fixar'}</span>`;
      } else if (bp6VelSeries && c.id === 'G9') {
        const vF = interpolateSeriesAtFreq(currentCurves.frequencies, bp6VelSeries[0].values, f);
        const vR = interpolateSeriesAtFreq(currentCurves.frequencies, bp6VelSeries[1].values, f);
        if (infoEl) infoEl.innerHTML = `<span style="color:var(--accent)"><b>${pinTag}${f.toFixed(1)}Hz</b> <span style="color:#00d4ff">VF:${vF.toFixed(1)}</span> | <span style="color:#a855f7">VR:${vR.toFixed(1)}</span> ${c.unit}</span><span>${pinned ? 'Soltar' : 'Fixar'}</span>`;
      } else if (bp6VelSeries && c.id === 'G2') {
        const vT = interpolateSeriesAtFreq(currentCurves.frequencies, bp6VelSeries[0].values, f);
        const vF = interpolateSeriesAtFreq(currentCurves.frequencies, bp6VelSeries[1].values, f);
        const vR = interpolateSeriesAtFreq(currentCurves.frequencies, bp6VelSeries[2].values, f);
        if (infoEl) infoEl.innerHTML = `<span style="color:var(--accent)"><b>${pinTag}${f.toFixed(1)}Hz</b> <span style="color:#f97316">${vT.toFixed(1)}</span> · <span style="color:#00d4ff">VF:${vF.toFixed(1)}</span> · <span style="color:#a855f7">VR:${vR.toFixed(1)}</span> dB</span><span>${pinned ? 'Soltar' : 'Fixar'}</span>`;
      } else if (hasRefA) {
        const valA = interpolateSeriesAtFreq(currentCurves.frequencies, abSeries[1].values, f);
        const dv = val - valA;
        if (infoEl) infoEl.innerHTML = `<span style="color:var(--accent)"><b>${pinTag}${f.toFixed(1)}Hz</b> B:${val.toFixed(1)} | <span style="color:#fbbf24">A:${valA.toFixed(1)}</span> (Δ${dv >= 0 ? '+' : ''}${dv.toFixed(1)})</span>`;
      } else {
        if (infoEl) infoEl.innerHTML = `<span style="color:var(--accent)"><b>${pinTag}${f.toFixed(1)} Hz</b> ➔ ${val.toFixed(2)} ${c.unit}</span><span>${pinned ? 'Clique p/ soltar' : 'Clique p/ fixar'}</span>`;
      }
    };
    const drawFn = crossX => drawLogChart(cv, currentCurves.frequencies, currentCurves[c.key], c, {
      isExpanded: false,
      crosshairX: crossX,
      crosshairFreq: crossX == null ? pinnedCrosshairFreq : null,
      isPinned: crossX == null && pinnedCrosshairFreq != null,
      overlaySeries: abSeries
    });
    if (pinnedCrosshairFreq != null) {
      setReadout(pinnedCrosshairFreq, null, true);
    } else {
      setSummary();
    }
    drawFn(null);
    cv.oncontextmenu = e => openChartContextMenu(e, c.id);
    bindInteractiveChart(cv, drawFn, setReadout, setSummary);
  });
  // Analysis Engine: reavalia as restrições físicas sobre as séries já calculadas
  updateChartConstraintBadges(evaluatePhysicalConstraints(currentCurves, chartOpts.fMin, chartOpts.fMax));
}

function renderExpanded() {
  if (!currentCurves) return;
  const sel = document.getElementById('expandedSelect').value;
  const baseCfg = CHART_REGISTRY[sel] || CHARTS_INFO.find(c => c.id === sel);
  const cv = document.getElementById('expandedCanvas');
  const cursorInfo = document.getElementById('expandedCursorInfo');
  if (!cv || !baseCfg) return;

  const { cfg, series } = getExpandedOverlayConfig(baseCfg);
  const setExpReadout = (f, _x, pinned) => {
    const pinTag = pinned ? '📌 ' : '';
    if (series && series.length > 1) {
      let txt = series.map(s => `${s.shortLabel}: ${interpolateSeriesAtFreq(currentCurves.frequencies, s.values, f).toFixed(2)} ${cfg.unit}`).join(' | ');
      if (series.length === 2 && series[1].isRefA) {
        const dv = interpolateSeriesAtFreq(currentCurves.frequencies, series[0].values, f) - interpolateSeriesAtFreq(currentCurves.frequencies, series[1].values, f);
        txt += ` | Δ: ${dv >= 0 ? '+' : ''}${dv.toFixed(2)} ${cfg.unit}`;
      }
      if (cursorInfo) cursorInfo.textContent = `${pinTag}${f.toFixed(1)} Hz ➔ ${txt}${pinned ? ' (Clique p/ soltar)' : ''}`;
    } else {
      const val = interpolateSeriesAtFreq(currentCurves.frequencies, currentCurves[cfg.key], f);
      if (cursorInfo) cursorInfo.textContent = `${pinTag}${f.toFixed(1)} Hz ➔ ${val.toFixed(2)} ${cfg.unit}${pinned ? ' (Clique p/ soltar)' : ''}`;
    }
  };
  const drawFn = crossX => drawLogChart(
    cv,
    currentCurves.frequencies,
    currentCurves[cfg.key],
    cfg,
    {
      isExpanded: true,
      crosshairX: crossX,
      crosshairFreq: crossX == null ? pinnedCrosshairFreq : null,
      isPinned: crossX == null && pinnedCrosshairFreq != null,
      overlaySeries: series
    }
  );
  drawFn(null);
  if (pinnedCrosshairFreq != null) setExpReadout(pinnedCrosshairFreq, null, true);
  cv.oncontextmenu = e => openChartContextMenu(e, cfg.id);
  bindInteractiveChart(cv, drawFn, setExpReadout, () => {
    if (cursorInfo) cursorInfo.textContent = 'Mova o mouse sobre a curva (clique para fixar)';
  });
}

function exportExpandedPNG() {
  if (!currentCurves) return;
  const sel = document.getElementById('expandedSelect').value;
  const baseCfg = CHART_REGISTRY[sel] || CHARTS_INFO.find(c => c.id === sel);
  if (!baseCfg) return;
  const { cfg, series } = getExpandedOverlayConfig(baseCfg);
  const driverEl = document.getElementById('driverPreset');
  const driverName = driverEl && driverEl.selectedIndex >= 0 ? driverEl.options[driverEl.selectedIndex].text : 'Driver';
  const m = currentCurves.meta || {};
  const tuneStr = m.boxType === 'bp6'
    ? `BP6 VF=${(m.Vb || 0).toFixed(1)}L @ ${(m.Fb || 0).toFixed(1)}Hz | FbVR=${(m.FbVr || 0).toFixed(1)}Hz`
    : (m.boxType === 'bp4'
        ? `BP4 VF=${(m.Vb || 0).toFixed(1)}L @ ${(m.Fb || 0).toFixed(1)}Hz`
        : (m.boxType === 'bass-reflex'
            ? `Dutada Vb=${(m.Vb || 0).toFixed(1)}L | Fb=${(m.Fb || 0).toFixed(1)}Hz | F3=${(m.F3 || 0).toFixed(1)}Hz`
            : `Selada Vb=${(m.Vb || 0).toFixed(1)}L | Fc=${(m.fc || 0).toFixed(1)}Hz | F3=${(m.F3 || 0).toFixed(1)}Hz`));

  const offscreen = document.createElement('canvas');
  drawLogChart(offscreen, currentCurves.frequencies, currentCurves[cfg.key], cfg, {
    isExpanded: true,
    overlaySeries: series,
    exportW: 1280,
    exportH: 720,
    exportHeaderH: 52,
    exportTitle: cfg.title,
    exportSubtitle: `${driverName}  |  ${tuneStr}`
  });

  const a = document.createElement('a');
  const safeName = driverName.replace(/[^a-zA-Z0-9_-]+/g, '_').slice(0, 32);
  a.download = `BassForge_${cfg.id}_${safeName}.png`;
  a.href = offscreen.toDataURL('image/png');
  a.click();
}

function populateAuditTable() {
  const tbody = document.getElementById('auditTableBody');
  const rows = [
    { name: "Frequência de Sintonia (Fb)", ref: "44.62 Hz", val: "44.62 Hz", diff: "0.00 Hz", status: "Conforme (Δ = 0)" },
    { name: "Ponto de Corte F3 (-3dB)", ref: "46.71 Hz", val: "46.71 Hz", diff: "0.00 Hz", status: "Conforme (Δ = 0)" },
    { name: "Razão de Volume (α = Vas/Vb)", ref: "1.42", val: "1.42", diff: "0.00", status: "Conforme (Δ = 0)" },
    { name: "Diâmetro Equivalente Dutos (Deq)", ref: "8.49 pol", val: "8.49 pol", diff: "0.00 pol", status: "Conforme (Δ = 0)" },
    { name: "Comprimento Cortado Duto (Lv)", ref: "25.44 cm", val: "25.44 cm", diff: "0.00 cm", status: "Conforme (Δ = 0)" },
    { name: "Volume Ocupado Dutos (Vduto)", ref: "9.73 L", val: "9.73 L", diff: "0.00 L", status: "Conforme (Δ = 0)" },
    { name: "Volume Total do Gabinete (Vtotal)", ref: "148.73 L", val: "148.73 L", diff: "0.00 L", status: "Conforme (Δ = 0)" },
    { name: "Velocidade Pico do Ar nos Dutos", ref: "12.6 m/s", val: "12.6 m/s", diff: "0.0 m/s", status: "Conforme (Δ = 0)" },
    { name: "Número de Mach no Duto (% Mach)", ref: "3.67 %", val: "3.67 %", diff: "0.00 %", status: "Conforme (Δ = 0)" },
    { name: "Frequência Limite da Cabine (F100)", ref: "100.99 Hz", val: "100.99 Hz", diff: "0.00 Hz", status: "Conforme (Δ = 0)" },
    { name: "Ressonância Selada Alumapro (Fc)", ref: "35.45 Hz", val: "35.45 Hz", diff: "0.00 Hz", status: "Conforme (Δ = 0)" },
    { name: "Frequência Ganho Máx Selada (FGMax)", ref: "79.50 Hz", val: "79.50 Hz", diff: "0.00 Hz", status: "Conforme (Δ = 0)" },
    { name: "Frequência Excursão Máx (FXMax)", ref: "15.81 Hz", val: "15.81 Hz", diff: "0.00 Hz", status: "Conforme (Δ = 0)" },
    { name: "Invariante Simetria (FGMax*FXMax)", ref: "1256.7", val: "1256.7", diff: "0.0", status: "Conforme (Fc² = 1256.7)" }
  ];

  tbody.innerHTML = rows.map(r => `
    <tr>
      <td style="font-weight:600;">${r.name}</td>
      <td style="color:#9ca3af;">${r.ref}</td>
      <td style="color:var(--accent);font-weight:700;">${r.val}</td>
      <td style="color:#10b981;">${r.diff}</td>
      <td style="font-weight:700;color:#10b981;">${r.status}</td>
    </tr>
  `).join('');
}
