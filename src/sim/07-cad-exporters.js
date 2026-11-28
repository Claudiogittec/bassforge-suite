
function buildPackHtmlString(pack, chartImages, blueprintDataUrl, explodedDataUrl, nestingDataUrl) {
  const d = pack.driver;
  const ac = pack.acoustics;
  const dm = pack.dimensions;
  const qts = (d.Qms && d.Qes) ? ((d.Qms * d.Qes) / (d.Qms + d.Qes)) : 0;
  const ebp = d.Qes ? (d.Fs / d.Qes) : 0;
  const profile = getAnalysisProfile(ac.analysisEnv || getAnalysisEnv());
  const profilePt = profile.id === 'architectural' ? 'Sala / Estúdio' : 'Automotivo';
  const hpfTypeNow = (currentCurves && currentCurves.meta && currentCurves.meta.hpfType) || document.getElementById('hpfType')?.value || 'LR24';
  const lpfHzNow = (currentCurves && currentCurves.meta && currentCurves.meta.lpfHz) || 0;
  const lpfTypeNow = (currentCurves && currentCurves.meta && currentCurves.meta.lpfType) || document.getElementById('lpfType')?.value || 'LR24';
  const hpfNote = ac.hpfEnabled ? `HPF ${hpfTypeNow} @ ${fmtNumSafe(ac.hpfHz, 0)} Hz` : 'HPF desligado';
  const lpfNote = lpfHzNow > 0 ? `LPF ${lpfTypeNow} @ ${fmtNumSafe(lpfHzNow, 0)} Hz` : 'LPF desligado';
  const dtNote = (ac.deltaT && ac.deltaT > 0) ? `Bobina ΔT +${fmtNumSafe(ac.deltaT, 0)} °C` : 'Bobina ΔT 0 °C (nominal)';
  const roomMeta = (currentCurves && currentCurves.meta && currentCurves.meta.room) || null;
  const envNote = (profile.id === 'architectural' && roomMeta)
    ? `Sala ${fmtNumSafe(roomMeta.L, 1)}×${fmtNumSafe(roomMeta.W, 1)}×${fmtNumSafe(roomMeta.H, 1)} m (${roomMeta.placement}, RT60 ${fmtNumSafe(roomMeta.rt60, 2)} s, f_S ${fmtNumSafe(roomMeta.fSchroeder, 0)} Hz)`
    : `Cabine automotiva (F100 = ${fmtNumSafe(ac.F100 || 101, 1)} Hz)`;
  const mountLabel = (ac.mountMode === 'inverted') ? 'Invertida (Ímã p/ fora · Vsub=0)' : 'Normal (Ímã p/ dentro)';
  const bpChambersNote = (ac.bpChambers && ac.bpChambers.isBp)
    ? ` &nbsp;|&nbsp; <b>Câmaras BP:</b> Traseira A = ${fmtNumSafe(ac.bpChambers.A_rear, 0)} mm (VR) · Frontal G = ${fmtNumSafe(ac.bpChambers.A_front, 0)} mm (VF)`
    : '';
  const bandArr = Array.isArray(ac.band) ? ac.band : [10, 1000];
  const isSealedLike = (ac.boxType === 'sealed' || ac.boxType === 'free-air');
  const tuneLabel = isSealedLike ? 'Ressonância Fc / Corte F3' : 'Sintonia Fb / Corte F3';
  const tuneValue = isSealedLike
    ? `${fmtNumSafe(ac.fc || 0, 2)} Hz / ${fmtNumSafe(ac.F3, 2)} Hz`
    : `${fmtNumSafe(ac.Fb, 2)} Hz / ${fmtNumSafe(ac.F3, 2)} Hz`;
  const lvMmVal = Number.isFinite(ac.lvMm) ? ac.lvMm : Math.round((ac.LvCm || 0) * 10.0);
  const lvCmVal = fmtNumSafe(lvMmVal / 10.0, 1);
  const vSubVal = Number.isFinite(ac.Vsub) ? ac.Vsub : ((Number(d.Vsub) || 0) * (Number(d.nDrivers) || 1));
  const vBracingRaw = (Number(ac.Vbruto) || 0) - (Number(ac.Vb) || 0) - (Number(ac.Vr) || 0) - vSubVal - (Number(ac.Vduto) || 0);
  const vBracingVal = Number.isFinite(ac.Vbracing) ? ac.Vbracing : Math.max(0, Number.isFinite(vBracingRaw) ? +vBracingRaw.toFixed(2) : 0);
  const volBalanceTxt = `Vb ${fmtNumSafe(ac.Vb, 1)} L${ac.Vr > 0 ? ` + VR ${fmtNumSafe(ac.Vr, 1)} L` : ''} + Vsub ${fmtNumSafe(vSubVal, 1)} L + Vduto ${fmtNumSafe(ac.Vduto || 0, 2)} L + Vtravas ${fmtNumSafe(vBracingVal, 2)} L = ${fmtNumSafe(ac.Vbruto, 2)} L brutos`;
  const docCode = 'BF-' + pack.generatedAt.slice(0, 10).replace(/-/g, '') + '-' + ac.boxType.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);
  const dateBr = pack.generatedAt.slice(0, 16).replace('T', ' ');

  const piecesRows = pack.pieces.map(p => `
    <tr>
      <td><b>${escapeHtmlStr(p.name)}</b></td>
      <td class="num">${p.qty}x</td>
      <td class="num">${fmtNumSafe(p.w, 1)} mm</td>
      <td class="num">${fmtNumSafe(p.h, 1)} mm</td>
      <td class="num">${fmtNumSafe(p.t, 0)} mm</td>
      <td class="num">${fmtNumSafe(p.bev, 1)}°</td>
      <td>${escapeHtmlStr(p.note)}</td>
    </tr>`).join('');

  const holesRows = pack.baffleHoles.map(h => {
    const dimTxt = h.shape === 'round' ? `Ø ${fmtNumSafe(h.dia, 1)} mm` : (h.shape === 'slot' ? `${fmtNumSafe(h.w, 0)} × ${fmtNumSafe(h.h, 0)} mm` : `Triângulo ${fmtNumSafe(h.triA, 0)} × ${fmtNumSafe(h.triB, 0)} mm`);
    const flTxt = h.kind === 'driver' ? `Flange Ø ${fmtNumSafe(h.flangeDia, 0)} mm (est.)` : (h.lvMm ? `Lv = ${fmtNumSafe(h.lvMm, 0)} mm` : '—');
    return `
      <tr>
        <td><b>${escapeHtmlStr(h.label)}</b></td>
        <td class="num">${fmtNumSafe(h.xExt, 1)} mm</td>
        <td class="num">${fmtNumSafe(h.yExt, 1)} mm</td>
        <td class="num"><b>${dimTxt}</b></td>
        <td>${flTxt}</td>
      </tr>`;
  }).join('');

  const chartsHtml = (chartImages || []).map(ci => `
    <div class="chart-item">
      <div class="chart-cap">${escapeHtmlStr(ci.title)}</div>
      <img src="${ci.dataUrl}" alt="${escapeHtmlStr(ci.title)}">
    </div>`).join('');

  const checksHtml = pack.validation.issues.map(it => {
    const tag = it.level === 'warn' ? 'AVISO' : 'OK';
    return `<li><b>[${tag}]</b> ${escapeHtmlStr(it.msg)}</li>`;
  }).join('');

  const constraints = Array.isArray(ac.constraints) ? ac.constraints : [];
  const hasCritConstraint = constraints.some(c => c.severity === 'critical');
  const hasWarnConstraint = constraints.some(c => c.severity === 'warn');
  const simBoxClass = hasCritConstraint ? 'crit-box' : (hasWarnConstraint ? 'warn-box' : 'ok-box');
  const simBoxHdr = hasCritConstraint
    ? '[CRÍTICO] Atenção: limites físicos excedidos na banda simulada'
    : (hasWarnConstraint ? '[AVISO] Limites físicos da simulação com avisos' : '[OK] Limites físicos da simulação dentro da faixa segura');
  const simChecksHtml = constraints.length
    ? constraints.map(c => {
        const tag = c.severity === 'critical' ? 'CRÍTICO' : (c.severity === 'warn' ? 'AVISO' : 'INFO');
        return `<li><b>[${tag}]</b> ${escapeHtmlStr(c.message)}</li>`;
      }).join('')
    : `<li><b>[OK]</b> Excursão (&lt; Xmax), velocidade de duto (&lt; limite laminar), potência admissível e atraso de grupo dentro dos critérios na banda ${bandArr[0]}–${bandArr[1]} Hz.</li>`;

  // Captura resumo de Engenharia Elétrica & DSP (texto limpo do DOM se disponível)
  const cleanTxt = id => {
    const el = (typeof document !== 'undefined') ? document.getElementById(id) : null;
    return el ? String(el.textContent || '').replace(/\s+/g, ' ').trim() : '';
  };
  const elWiringTxt = cleanTxt('elWiringResult');
  const elCableTxt = cleanTxt('elCableResult');
  const elDspTxt = cleanTxt('elDspResult');
  const hasElecBlock = !!(elWiringTxt || elCableTxt || elDspTxt);

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>BassForge — Pacote de Construção: ${escapeHtmlStr(d.name)}</title>
<style>
  @page { size: A4 portrait; margin: 12mm 12mm 14mm 12mm; }
  * { box-sizing: border-box; }
  body {
    font-family: 'Inter', 'Segoe UI', Arial, sans-serif;
    color: #0f172a;
    margin: 0 auto;
    padding: 16px 20px 28px;
    max-width: 960px;
    background: #fff;
    font-size: 11px;
    line-height: 1.42;
    font-variant-numeric: tabular-nums lining-nums;
  }
  .print-bar {
    display: flex; justify-content: space-between; align-items: center; gap: 12px;
    background: #0f172a; color: #e2e8f0; padding: 10px 14px; border-radius: 6px; margin-bottom: 14px;
    font-family: 'JetBrains Mono', Consolas, monospace; font-size: 11px;
  }
  .print-btn {
    padding: 7px 14px; background: #0284c7; color: #fff; border: none; border-radius: 4px;
    cursor: pointer; font-weight: 600; font-family: inherit; font-size: 11px;
  }
  .print-btn:hover { background: #0369a1; }
  .title-block {
    border: 1.5px solid #0f172a; border-radius: 4px; overflow: hidden; margin-bottom: 12px;
  }
  .tb-top {
    display: flex; justify-content: space-between; align-items: center; padding: 9px 12px;
    background: #0f172a; color: #f8fafc;
  }
  .tb-top h1 { font-size: 16px; margin: 0; letter-spacing: 0.3px; font-weight: 700; }
  .tb-top .tb-sub { font-size: 10px; color: #94a3b8; font-family: 'JetBrains Mono', Consolas, monospace; }
  .tb-grid {
    display: grid; grid-template-columns: 2fr 1fr 1fr 1fr; border-top: 1px solid #cbd5e1;
    background: #f8fafc; font-family: 'JetBrains Mono', Consolas, monospace; font-size: 10px;
  }
  .tb-cell { padding: 5px 9px; border-right: 1px solid #cbd5e1; }
  .tb-cell:last-child { border-right: none; }
  .tb-cell small { display: block; color: #64748b; font-size: 8.5px; text-transform: uppercase; letter-spacing: 0.4px; }
  .tb-cell b { color: #0f172a; font-size: 10.5px; }
  h2 {
    font-size: 12px; margin: 14px 0 6px; padding: 3px 0 3px 8px;
    border-left: 3px solid #0284c7; border-bottom: 1px solid #cbd5e1;
    color: #0f172a; text-transform: uppercase; letter-spacing: 0.4px;
    page-break-after: avoid; break-after: avoid;
  }
  .meta { color: #334155; font-size: 10.5px; margin-bottom: 6px; }
  .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 7px; margin-bottom: 8px; }
  .grid-3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 7px; margin-bottom: 8px; }
  .card { border: 1px solid #cbd5e1; border-radius: 4px; padding: 6px 8px; background: #f8fafc; break-inside: avoid; }
  .card small { display: block; color: #64748b; font-size: 9px; text-transform: uppercase; letter-spacing: 0.3px; }
  .card b { font-size: 12.5px; color: #0f172a; font-family: 'JetBrains Mono', Consolas, monospace; }
  table { width: 100%; border-collapse: collapse; margin-top: 4px; font-size: 10.5px; break-inside: auto; }
  tr { break-inside: avoid; page-break-inside: avoid; }
  th, td { border: 1px solid #cbd5e1; padding: 4px 7px; text-align: left; }
  th { background: #e2e8f0; color: #0f172a; font-weight: 700; font-size: 10px; text-transform: uppercase; }
  td.num { font-family: 'JetBrains Mono', Consolas, monospace; white-space: nowrap; }
  .fig-block { border: 1px solid #cbd5e1; border-radius: 4px; padding: 6px; background: #0b0e13; margin-bottom: 8px; break-inside: avoid; page-break-inside: avoid; }
  .fig-cap { color: #cbd5e1; font-family: 'JetBrains Mono', Consolas, monospace; font-size: 10px; font-weight: 600; margin-bottom: 4px; }
  .charts-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; }
  .chart-item { border: 1px solid #cbd5e1; border-radius: 4px; padding: 5px; background: #0b0e13; break-inside: avoid; page-break-inside: avoid; }
  .chart-cap { color: #e2e8f0; font-family: 'JetBrains Mono', Consolas, monospace; font-weight: 600; font-size: 10px; margin-bottom: 3px; }
  .chart-item img, .bp-img { width: 100%; height: auto; display: block; border-radius: 3px; }
  .ok-box { border: 1px solid #2ea070; border-left-width: 3px; background: #f0fdf4; padding: 7px 10px; border-radius: 4px; margin-bottom: 7px; break-inside: avoid; }
  .warn-box { border: 1px solid #d4942a; border-left-width: 3px; background: #fffbeb; padding: 7px 10px; border-radius: 4px; margin-bottom: 7px; break-inside: avoid; }
  .crit-box { border: 1px solid #d94f57; border-left-width: 3px; background: #fef2f2; padding: 7px 10px; border-radius: 4px; margin-bottom: 7px; break-inside: avoid; }
  .ok-box ul, .warn-box ul, .crit-box ul { margin: 4px 0 0 16px; padding: 0; }
  .chk-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 16px; font-size: 10.5px; margin-top: 6px; }
  .chk-item { display: flex; align-items: center; gap: 6px; padding: 3px 0; border-bottom: 1px dashed #cbd5e1; }
  .chk-box { display: inline-block; width: 11px; height: 11px; border: 1.2px solid #334155; border-radius: 2px; flex-shrink: 0; }
  .doc-foot { margin-top: 16px; padding-top: 6px; border-top: 1px solid #cbd5e1; display: flex; justify-content: space-between; font-family: 'JetBrains Mono', Consolas, monospace; font-size: 9.5px; color: #64748b; }
  .page-break { page-break-before: always; break-before: page; }
  @media print {
    body { margin: 0; padding: 0; max-width: none; }
    .no-print { display: none !important; }
    .fig-block, .chart-item { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .tb-top, th, .ok-box, .warn-box, .crit-box { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
</style>
</head>
<body>
  <div class="print-bar no-print">
    <span>DOSSIÊ TÉCNICO A4 · ${escapeHtmlStr(docCode)} · Pronto para impressão em folha A4 (Retrato)</span>
    <button type="button" class="print-btn" onclick="window.print()">Imprimir / Salvar PDF (A4)</button>
  </div>

  <!-- CARIMBO TÉCNICO DE ENGENHARIA -->
  <div class="title-block">
    <div class="tb-top">
      <div>
        <h1>BassForge — Pacote de Construção (Dossiê Técnico A4)</h1>
        <div class="tb-sub">PROJETO ELETROACÚSTICO, PLANO DE CORTE CNC/MARCENARIA, FURAÇÃO E DSP</div>
      </div>
      <div style="text-align:right; font-family:'JetBrains Mono',Consolas,monospace; font-size:10px;">
        <div><b>${escapeHtmlStr(docCode)}</b></div>
        <div style="color:#94a3b8;">${escapeHtmlStr(dateBr)}</div>
      </div>
    </div>
    <div class="tb-grid">
      <div class="tb-cell"><small>Transdutor / Arranjo</small><b>${escapeHtmlStr(d.name)} (${d.nDrivers}× · ${d.dia_in}″)</b></div>
      <div class="tb-cell"><small>Topologia / MDF</small><b>${escapeHtmlStr(ac.boxType.toUpperCase())} · MDF ${dm.t} mm</b></div>
      <div class="tb-cell"><small>Ambiente / Banda</small><b>${escapeHtmlStr(profilePt)} · ${bandArr[0]}–${bandArr[1]} Hz</b></div>
      <div class="tb-cell"><small>Filtros Ativos / Térmica</small><b>${escapeHtmlStr(hpfNote)} · ${escapeHtmlStr(lpfNote)}</b></div>
    </div>
  </div>

  <h2>1. Identificação do Driver e Parâmetros Thiele-Small</h2>
  <div class="grid">
    <div class="card"><small>Fs / EBP</small><b>${fmtNumSafe(d.Fs, 1)} Hz / ${fmtNumSafe(ebp, 0)} Hz</b></div>
    <div class="card"><small>Qts (Qes / Qms)</small><b>${fmtNumSafe(qts, 3)} (${fmtNumSafe(d.Qes, 3)} / ${fmtNumSafe(d.Qms, 2)})</b></div>
    <div class="card"><small>Vas / Sd</small><b>${fmtNumSafe(d.Vas, 1)} L / ${fmtNumSafe(d.Sd, 0)} cm²</b></div>
    <div class="card"><small>Xmax / Pe / Re</small><b>${fmtNumSafe(d.Xmax, 1)} mm · ${fmtNumSafe(d.Pe, 0)} W · ${fmtNumSafe(d.Re, 2)} Ω</b></div>
  </div>

  <h2>2. Resumo Acústico, Filtros e Cotas do Gabinete (MDF ${fmtNumSafe(dm.t, 0)} mm · Laterais Embutidas)</h2>
  <div class="grid">
    <div class="card"><small>Volume Útil / Bruto</small><b>${fmtNumSafe(ac.Vb, 1)} L / ${fmtNumSafe(ac.Vbruto, 1)} L</b></div>
    <div class="card"><small>${tuneLabel}</small><b>${tuneValue}</b></div>
    <div class="card"><small>Interno [A × B × C/D]</small><b>${dm.A} × ${dm.B} × ${dm.C_top}/${dm.D_bot} mm</b></div>
    <div class="card"><small>Externo [F × E × Prof]</small><b>${dm.F_ext} × ${dm.E_ext} × ${dm.C_ext_top}/${dm.D_ext_bot} mm</b></div>
  </div>
  <div class="meta"><b>Balanço Volumétrico:</b> ${escapeHtmlStr(volBalanceTxt)} &nbsp;|&nbsp; <b>Montagem:</b> ${escapeHtmlStr(mountLabel)}${bpChambersNote}</div>
  <div class="meta"><b>Ambiente &amp; DSP:</b> ${escapeHtmlStr(envNote)} &nbsp;|&nbsp; ${escapeHtmlStr(hpfNote)} &nbsp;|&nbsp; ${escapeHtmlStr(lpfNote)} &nbsp;|&nbsp; ${escapeHtmlStr(dtNote)}</div>
  <div class="meta"><b>Área MDF estimada:</b> ${dm.totalAreaM2} m² (~${dm.sheetsEst} chapa 2750×1830 mm) &nbsp;|&nbsp; <b>Peso estimado MDF:</b> ${dm.weightKg} kg${lvMmVal > 0 ? ` &nbsp;|&nbsp; <b>Duto Lv cortado:</b> ${lvCmVal} cm (${lvMmVal} mm) · Sp = ${ac.SpCm2} cm²` : ''}</div>

  ${blueprintDataUrl ? `
  <h2>3. Desenhos Técnicos — Blueprint 2D, Vista Explodida 3D Isométrica e Chapa MDF</h2>
  <div class="fig-block"><div class="fig-cap">3.1 Blueprint Técnico 2D — Vista Lateral (Lv vs C) e Painel Frontal</div><img class="bp-img" src="${blueprintDataUrl}" alt="Blueprint CAD 2D"></div>
  ${explodedDataUrl ? `<div class="fig-block"><div class="fig-cap">3.2 Vista Explodida 3D Isométrica — Encaixe Estrutural</div><img class="bp-img" src="${explodedDataUrl}" alt="Vista Explodida 3D Isométrica"></div>` : ''}
  ${nestingDataUrl ? `<div class="fig-block"><div class="fig-cap">3.3 Distribuição na Chapa MDF 2750×1830 mm (Nesting 2D · Kerf 3 mm)</div><img class="bp-img" src="${nestingDataUrl}" alt="Nesting Chapa MDF 2D"></div>` : ''}` : ''}

  <h2>4. Plano de Corte Completo (MDF, Sarrafos e Dutos)</h2>
  <table>
    <thead><tr><th>Peça / Orientação</th><th>Qtd</th><th>Largura</th><th>Altura / Compr.</th><th>Esp.</th><th>Chanfro</th><th>Montagem (Laterais Embutidas)</th></tr></thead>
    <tbody>${piecesRows}</tbody>
  </table>

  <h2>5. Gabarito de Furação do Painel Frontal (Origem X=0, Y=0 no canto inferior-esquerdo externo)</h2>
  <div class="meta">Painel Frontal externo: <b>${dm.F_ext} × ${dm.E_ext} mm</b> (MDF ${dm.t} mm). Meça <b>X</b> a partir da borda esquerda externa e <b>Y</b> a partir da borda inferior externa.</div>
  <table>
    <thead><tr><th>Elemento</th><th>Centro X Ext.</th><th>Centro Y Ext.</th><th>Recorte</th><th>Flange / Comprimento Lv</th></tr></thead>
    <tbody>${holesRows}</tbody>
  </table>

  <div class="page-break"></div>
  <h2>6. Gráficos Acústicos Congelados — Perfil ${escapeHtmlStr(profilePt)} (${escapeHtmlStr(profile.label)})</h2>
  <div class="charts-grid">${chartsHtml}</div>

  ${hasElecBlock ? `
  <h2>7. Engenharia Elétrica, Cabos e Estrutura de Ganho DSP</h2>
  <div class="grid-3">
    <div class="card"><small>Associação de Transdutores</small><div style="font-size:10px; margin-top:3px; color:#1e293b;">${escapeHtmlStr(elWiringTxt || '—')}</div></div>
    <div class="card"><small>Barramento DC e Cabo Áudio</small><div style="font-size:10px; margin-top:3px; color:#1e293b;">${escapeHtmlStr(elCableTxt || '—')}</div></div>
    <div class="card"><small>Ganho True-RMS, Limiter e Zobel</small><div style="font-size:10px; margin-top:3px; color:#1e293b;">${escapeHtmlStr(elDspTxt || '—')}</div></div>
  </div>` : ''}

  <h2>8. Checagens de Viabilidade Geométrica e Limites Físicos da Simulação</h2>
  <div class="ok-box"><b>[OK] Geometria aprovada para construção (0 erros críticos)</b><ul>${checksHtml}</ul></div>
  <div class="${simBoxClass}"><b>${simBoxHdr}</b><ul>${simChecksHtml}</ul></div>

  ${pack.geometry ? `
  <h2>9. Sequência de Montagem e Auditoria PGS (G01–G12)</h2>
  <div class="meta"><b>Aproveitamento Chapa MDF 2750×1830 mm (Kerf 3 mm):</b> ${pack.geometry.manufacturing.sheetLayout.sheetsCount} chapa(s) · ${pack.geometry.manufacturing.sheetLayout.utilizationPct}% de uso &nbsp;|&nbsp; <b>Validação PGS:</b> ${pack.geometry.validation.filter(v => v.pass).length}/${pack.geometry.validation.length} aprovados</div>
  <table>
    <thead><tr><th>Etapa</th><th>ID Peça</th><th>Componente</th><th>Qtd</th><th>Instrução de Montagem</th></tr></thead>
    <tbody>${pack.geometry.manufacturing.assemblySequence.map(s => `<tr><td class="num"><b>#${s.step}</b></td><td class="num"><code>${escapeHtmlStr(s.partId)}</code></td><td><b>${escapeHtmlStr(s.name)}</b></td><td class="num">${s.qty}x</td><td>${escapeHtmlStr(s.action)}</td></tr>`).join('')}</tbody>
  </table>` : ''}

  <h2>10. Checklist de Conferência de Bancada e Marcenaria</h2>
  <div class="chk-grid">
    <div class="chk-item"><span class="chk-box"></span><span>Conferir espessura real da chapa MDF (${dm.t} mm) antes do corte</span></div>
    <div class="chk-item"><span class="chk-box"></span><span>Validar esquadro interno [A=${dm.A} × B=${dm.B} mm] na montagem seca</span></div>
    <div class="chk-item"><span class="chk-box"></span><span>Conferir furação do driver com o aro real do alto-falante antes de serrar</span></div>
    <div class="chk-item"><span class="chk-box"></span><span>Verificar comprimento real do duto Lv = ${lvMmVal} mm e folga interna</span></div>
    <div class="chk-item"><span class="chk-box"></span><span>Aplicar cola PVA/PU + vedação interna contínua nas juntas (zero vazamento)</span></div>
    <div class="chk-item"><span class="chk-box"></span><span>Testar impedância final e polaridade do conjunto antes de energizar o amplificador</span></div>
  </div>

  <div class="doc-foot">
    <span>BassForge · Engenharia Eletroacústica</span>
    <span>Código: ${escapeHtmlStr(docCode)} · Gerado em ${escapeHtmlStr(dateBr)}</span>
  </div>
</body>
</html>`;
}

function generateBuildPackHtml() {
  updateWoodlock();
  if (!lastBuildPack || !lastBuildPack.validation.valid) {
    return { ok: false, validation: lastBuildPack ? lastBuildPack.validation : null, html: null };
  }
  const ac = lastBuildPack.acoustics;
  const profile = getAnalysisProfile(ac.analysisEnv || getAnalysisEnv());
  const isSealedLike = (ac.boxType === 'sealed' || ac.boxType === 'free-air');
  const targetCount = 8;
  const selectedSlots = [];
  for (let i = 0; i < profile.order.length && selectedSlots.length < targetCount; i++) {
    const id = profile.order[i];
    const entry = CHART_REGISTRY[id];
    if (!entry || entry.availability === 'unimplemented') continue;
    if (isSealedLike && id === 'G9') continue;
    selectedSlots.push({ id, posIndex: i, entry });
  }
  // Em Sala / Estúdio, garante inclusão de #12 Room Gain e #13 SPL in Room nos gráficos congelados
  if (profile.id === 'architectural') {
    ['SLOT_ROOM_GAIN', 'SLOT_SPL_ROOM'].forEach(slotId => {
      const posIdx = profile.order.indexOf(slotId);
      const entry = CHART_REGISTRY[slotId];
      if (posIdx >= 0 && entry && entry.key && !selectedSlots.some(s => s.id === slotId)) {
        selectedSlots.push({ id: slotId, posIndex: posIdx, entry });
      }
    });
  }
  const tuneSubtitle = isSealedLike
    ? `Fc=${fmtNumSafe(ac.fc || 0, 1)}Hz`
    : `Fb=${fmtNumSafe(ac.Fb, 1)}Hz`;
  const hpfSubtitle = ac.hpfEnabled ? ` | HPF=${fmtNumSafe(ac.hpfHz, 0)}Hz` : '';
  const lpfHzMeta = (currentCurves && currentCurves.meta && currentCurves.meta.lpfHz) || 0;
  const lpfSubtitle = lpfHzMeta > 0 ? ` | LPF=${fmtNumSafe(lpfHzMeta, 0)}Hz` : '';
  const exportSubtitle = `${lastBuildPack.driver.name} | Vb=${fmtNumSafe(ac.Vb, 1)}L | ${tuneSubtitle}${hpfSubtitle}${lpfSubtitle} | ${profile.label}`;
  const chartImages = [];
  if (currentCurves && typeof document !== 'undefined') {
    selectedSlots.forEach(({ id, posIndex, entry }) => {
      const cfg = CHART_REGISTRY[id] || CHARTS_INFO.find(c => c.id === id);
      if (!cfg || !cfg.key || !currentCurves[cfg.key]) return;
      const displayTitle = formatChartDisplayTitle(entry, posIndex);
      const off = document.createElement('canvas');
      drawLogChart(off, currentCurves.frequencies, currentCurves[cfg.key], cfg, {
        isExpanded: true, exportW: 720, exportH: 380, exportHeaderH: 36,
        exportTitle: displayTitle, exportSubtitle,
        overlaySeries: getBp6DualPortVelSeries(cfg)
      });
      if (typeof off.toDataURL === 'function') {
        chartImages.push({ id, title: displayTitle, dataUrl: off.toDataURL('image/png') });
      }
    });
  }
  let bpDataUrl = '';
  const bpCanvas = document.createElement('canvas');
  bpCanvas.width = 920;
  bpCanvas.height = 360;
  const dm = lastBuildPack.dimensions;
  drawWoodlockBlueprint({
    A: dm.A, B: dm.B, C_top: dm.C_top, D_bot: dm.D_bot, F_ext: dm.F_ext, E_ext: dm.E_ext, t: dm.t,
    isTrap: dm.shape === 'trapezoidal',
    isVented: ['bass-reflex', 'bp4', 'bp6'].includes(ac.boxType),
    lvMm: ac.lvMm,
    bpChambers: ac.bpChambers,
    mountMode: ac.mountMode,
    validation: lastBuildPack.validation
  }, bpCanvas);
  if (typeof bpCanvas.toDataURL === 'function') bpDataUrl = bpCanvas.toDataURL('image/png');

  let expDataUrl = '';
  const expCanvas = document.createElement('canvas');
  expCanvas.width = 920;
  expCanvas.height = 360;
  drawWoodlockExploded3D(lastBuildPack, expCanvas);
  if (typeof expCanvas.toDataURL === 'function') expDataUrl = expCanvas.toDataURL('image/png');

  let nestDataUrl = '';
  const nestCanvas = document.createElement('canvas');
  nestCanvas.width = 920;
  nestCanvas.height = 340;
  drawWoodlockNesting2D(lastBuildPack, nestCanvas);
  if (typeof nestCanvas.toDataURL === 'function') nestDataUrl = nestCanvas.toDataURL('image/png');

  const html = buildPackHtmlString(lastBuildPack, chartImages, bpDataUrl, expDataUrl, nestDataUrl);
  return { ok: true, validation: lastBuildPack.validation, html, pack: lastBuildPack };
}

function printBuildPackA4() {
  const res = generateBuildPackHtml();
  if (!res.ok) {
    const msgs = res.validation ? res.validation.issues.filter(i => i.level === 'critical').map(i => '- ' + i.msg).join('\n') : 'Geometria inválida.';
    alert('Impressão bloqueada por erro crítico de geometria:\n\n' + msgs + '\n\nCorrija as cotas na aba Marcenaria CAD antes de imprimir.');
    return false;
  }
  const win = (typeof window !== 'undefined' && typeof window.open === 'function') ? window.open('', '_blank') : null;
  if (win && win.document) {
    win.document.open();
    win.document.write(res.html);
    win.document.close();
    win.focus();
    setTimeout(() => { try { win.print(); } catch (err) { console.warn('[BassForge] Falha ao acionar impressão A4:', err); } }, 350);
    return true;
  }
  return exportBuildPackHtml();
}

// CAD-06: Gate centralizado de exportação CAD (bloqueia erro crítico P0 e exige confirmação explícita em sopro/chuffing v_ar > velLimit)
function checkCadExportGate(pack, opts) {
  if (!pack || !pack.validation || !pack.validation.valid) {
    const msgs = (pack && pack.validation && pack.validation.issues)
      ? pack.validation.issues.filter(i => i.level === 'critical').map(i => '• ' + i.msg).join('\n')
      : 'Geometria inválida.';
    return { ok: false, reason: 'GEOMETRY_CRITICAL', msg: '⛔ Exportação bloqueada por erro crítico de geometria:\n\n' + msgs + '\n\nCorrija as cotas na aba Marcenaria CAD antes de exportar.' };
  }
  const aeroIssue = (pack.validation.issues || []).find(i => i.code === 'PORT_AIR_VELOCITY_CRITICAL');
  if (aeroIssue && !(opts && opts.confirmAeroOverride === true)) {
    if (typeof confirm === 'function' && !(opts && opts.noPrompt)) {
      const accepted = confirm('⚠️ CAD-06 — ALERTA CRÍTICO DE SOPRO (CHUFFING):\n\n' + aeroIssue.msg + '\n\nDeseja confirmar explicitamente a exportação CAD mesmo com velocidade do ar acima do limite laminar?');
      if (!accepted) {
        return { ok: false, reason: 'CAD_06_AIR_VELOCITY_BLOCKED', msg: aeroIssue.msg };
      }
      return { ok: true, aeroConfirmed: true };
    }
    return { ok: false, reason: 'CAD_06_AIR_VELOCITY_BLOCKED', msg: aeroIssue.msg };
  }
  return { ok: true, aeroConfirmed: false };
}

function exportBuildPackHtml(opts) {
  const res = generateBuildPackHtml();
  if (!res.ok) {
    const msgs = res.validation ? res.validation.issues.filter(i => i.level === 'critical').map(i => '• ' + i.msg).join('\n') : 'Geometria inválida.';
    alert('⛔ Exportação bloqueada por erro crítico de geometria:\n\n' + msgs + '\n\nCorrija as cotas na aba Marcenaria CAD antes de exportar.');
    return false;
  }
  const gate = checkCadExportGate(res.pack, opts);
  if (!gate.ok) {
    if (gate.reason === 'GEOMETRY_CRITICAL') alert(gate.msg);
    return false;
  }
  const safe = (res.pack.driver.name || 'Projeto').replace(/[^a-zA-Z0-9_-]+/g, '_').slice(0, 36);
  const blob = new Blob([res.html], { type: 'text/html;charset=utf-8' });
  const a = document.createElement('a');
  a.download = `BassForge_Obra_${safe}.html`;
  a.href = URL.createObjectURL(blob);
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1500);
  return true;
}

function exportBuildPackJson(opts) {
  if (!lastBuildPack) updateWoodlock();
  const gate = checkCadExportGate(lastBuildPack, opts);
  if (!gate.ok) {
    if (gate.reason === 'GEOMETRY_CRITICAL') alert('⛔ Exportação bloqueada: corrija os erros críticos de geometria na aba Marcenaria CAD.');
    return false;
  }
  const safe = (lastBuildPack.driver.name || 'Projeto').replace(/[^a-zA-Z0-9_-]+/g, '_').slice(0, 36);
  const blob = new Blob([JSON.stringify(lastBuildPack, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.download = `BassForge_BuildPack_${safe}.json`;
  a.href = URL.createObjectURL(blob);
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1500);
  return true;
}

/**
 * Gera desenho técnico DXF R12 ASCII em escala 1:1 (milímetros) diretamente da Fonte Única PGS.
 * Camadas: CHAPA_MDF, PECAS_CORTE, BAFFLE_FURACAO, VISTA_LATERAL, TEXTO_COTAS.
 */
function buildPgsDxfString(pack) {
  if (!pack) return '';
  const geom = pack.geometry || buildPgsGeometryModel(pack);
  const dm = pack.dimensions;
  const ac = pack.acoustics;
  const nest = geom.manufacturing.sheetLayout;
  const t = dm.t;
  const F = dm.F_ext, E = dm.E_ext, A = dm.A, B = dm.B;
  const C_top = dm.C_top, D_bot = dm.D_bot;
  const C_ext = dm.C_ext_top, D_ext = dm.D_ext_bot;
  const lines = [];
  const push = (...pairs) => { for (const v of pairs) lines.push(String(v)); };
  const f = n => (Number.isFinite(n) ? n.toFixed(2) : '0.00');
  const ascii = s => String(s || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x20-\x7E]/g, ' ').replace(/\s+/g, ' ').trim();

  const addLine = (layer, x1, y1, x2, y2) => {
    push(0, 'LINE', 8, layer, 10, f(x1), 20, f(y1), 30, '0.00', 11, f(x2), 21, f(y2), 31, '0.00');
  };
  const addRect = (layer, x, y, w, h) => {
    addLine(layer, x, y, x + w, y);
    addLine(layer, x + w, y, x + w, y + h);
    addLine(layer, x + w, y + h, x, y + h);
    addLine(layer, x, y + h, x, y);
  };
  const addCircle = (layer, cx, cy, r) => {
    if (!(r > 0)) return;
    push(0, 'CIRCLE', 8, layer, 10, f(cx), 20, f(cy), 30, '0.00', 40, f(r));
  };
  const addText = (layer, x, y, height, txt, rotDeg = 0) => {
    push(0, 'TEXT', 8, layer, 10, f(x), 20, f(y), 30, '0.00', 40, f(height), 1, ascii(txt));
    if (rotDeg) push(50, f(rotDeg));
  };
  const addLinearDim = (layer, x1, y1, x2, y2, dimX, dimY, angleDeg = 0, overrideTxt = '') => {
    const midX = (angleDeg === 90) ? dimX : (0.5 * (x1 + x2));
    const midY = (angleDeg === 90) ? (0.5 * (y1 + y2)) : dimY;
    push(
      0, 'DIMENSION', 8, layer,
      10, f(dimX), 20, f(dimY), 30, '0.00',
      11, f(midX), 21, f(midY), 31, '0.00',
      70, 0,
      3, 'Standard',
      13, f(x1), 23, f(y1), 33, '0.00',
      14, f(x2), 24, f(y2), 34, '0.00',
      50, f(angleDeg)
    );
    if (overrideTxt) push(1, ascii(overrideTxt));
  };

  // HEADER (R12 AC1009, mm + estilo de cota em mm)
  push(
    0, 'SECTION', 2, 'HEADER',
    9, '$ACADVER', 1, 'AC1009',
    9, '$INSUNITS', 70, 4,
    9, '$MEASUREMENT', 70, 1,
    9, '$DIMTXT', 40, '20.0',
    9, '$DIMASZ', 40, '14.0',
    9, '$DIMEXE', 40, '10.0',
    9, '$DIMEXO', 40, '8.0',
    9, '$DIMGAP', 40, '6.0',
    0, 'ENDSEC'
  );

  // TABLES: LAYER
  const layers = [
    ['CHAPA_MDF', 8],
    ['PECAS_CORTE', 4],
    ['BAFFLE_FURACAO', 1],
    ['VISTA_LATERAL', 3],
    ['TEXTO_COTAS', 2],
    ['COTAS_DIM', 6]
  ];
  push(0, 'SECTION', 2, 'TABLES', 0, 'TABLE', 2, 'LAYER', 70, layers.length);
  layers.forEach(([name, color]) => {
    push(0, 'LAYER', 2, name, 70, 0, 62, color, 6, 'CONTINUOUS');
  });
  push(0, 'ENDTAB', 0, 'ENDSEC');

  // ENTITIES
  push(0, 'SECTION', 2, 'ENTITIES');

  // 1. Chapas MDF 2750x1830 mm + Nesting 2D real das peças
  const shW = nest.sheetW || 2750;
  const shH = nest.sheetH || 1830;
  const shGap = 200;
  for (let s = 0; s < Math.max(1, nest.sheetsCount); s++) {
    const sx = s * (shW + shGap);
    addRect('CHAPA_MDF', sx, 0, shW, shH);
    addText('TEXTO_COTAS', sx + 20, shH + 25, 32,
      `CHAPA MDF #${s + 1} (${shW}x${shH} mm | MDF ${t} mm | Kerf ${nest.kerfMm} mm | Uso ${nest.utilizationPct}%)`);
  }
  (nest.placements || []).forEach(pl => {
    const ox = pl.sheetIdx * (shW + shGap) + pl.x;
    const oy = pl.y;
    addRect('PECAS_CORTE', ox, oy, pl.w, pl.h);
    const shortN = ascii(pl.name.replace(/\s*\[.*?\]/g, '')).slice(0, 18);
    const dimTxt = `${pl.w.toFixed(0)}x${pl.h.toFixed(0)}mm${pl.rotated ? ' R90' : ''}`;
    if (pl.w < 120 && pl.h > pl.w * 2) {
      const lblH = Math.max(8, Math.min(14, pl.w * 0.28));
      addText('TEXTO_COTAS', ox + pl.w * 0.65, oy + 12, lblH, `${shortN} ${dimTxt}`, 90);
    } else {
      const lblH = Math.max(10, Math.min(24, Math.min(pl.w / 14, pl.h * 0.16)));
      addText('TEXTO_COTAS', ox + 8, oy + Math.max(8, pl.h * 0.56), lblH, shortN);
      addText('TEXTO_COTAS', ox + 8, oy + Math.max(6, pl.h * 0.24), lblH * 0.85, dimTxt);
    }
  });

  // 2. Vista Frontal 1:1 (Baffle + Furação Real) posicionada acima da chapa 0
  const bx0 = 0;
  const by0 = shH + 260;
  addRect('BAFFLE_FURACAO', bx0, by0, F, E);
  if (ac.boxType !== 'free-air') {
    addRect('PECAS_CORTE', bx0 + t, by0 + t, A, B);
  }
  // Chanfros 45° no Baffle Octogonal Planar Triângulo
  if (ac.planarGeom && ac.planarGeom.style === 'triangle' && ac.planarGeom.Z_leg > 0) {
    const zl = ac.planarGeom.Z_leg;
    addLine('BAFFLE_FURACAO', bx0 + t, by0 + t + zl, bx0 + t + zl, by0 + t);
    addLine('BAFFLE_FURACAO', bx0 + t + A - zl, by0 + t, bx0 + t + A, by0 + t + zl);
    addLine('BAFFLE_FURACAO', bx0 + t, by0 + t + B - zl, bx0 + t + zl, by0 + t + B);
    addLine('BAFFLE_FURACAO', bx0 + t + A - zl, by0 + t + B, bx0 + t + A, by0 + t + B - zl);
  }
  // Divisória interna BP4/BP6
  if (ac.bpChambers && ac.bpChambers.isBp) {
    addRect('PECAS_CORTE', bx0 + t + ac.bpChambers.A_rear, by0 + t, t, B);
  }
  // Furos reais no painel frontal (exclui divisórias internas BP, tampo superior e lateral_dir Side-Firing)
  (pack.baffleHoles || []).filter(hl => !String(hl.panel || '').startsWith('divisoria') && hl.panel !== 'topo' && hl.panel !== 'lateral_dir').forEach(hl => {
    const cx = bx0 + hl.xExt;
    const cy = by0 + hl.yExt;
    if (hl.shape === 'round') {
      addCircle('BAFFLE_FURACAO', cx, cy, hl.dia / 2);
      if (hl.kind === 'driver' && hl.flangeDia) {
        addCircle('PECAS_CORTE', cx, cy, hl.flangeDia / 2);
      }
      addText('TEXTO_COTAS', cx - 40, cy - 8, 16, `${hl.label} D=${hl.dia.toFixed(0)}mm`);
    } else if (hl.shape === 'slot') {
      addRect('BAFFLE_FURACAO', cx - hl.w / 2, cy - hl.h / 2, hl.w, hl.h);
      addText('TEXTO_COTAS', cx - hl.w / 2 + 6, cy - 6, 16, `SLOT ${hl.w.toFixed(0)}x${hl.h.toFixed(0)} Lv=${(hl.lvMm || 0).toFixed(0)}`);
    } else if (hl.shape === 'triangle') {
      const ta = hl.triA || 100, tb = hl.triB || 100;
      const xL = bx0 + t, xR = bx0 + F - t, yB = by0 + t, yT = by0 + E - t;
      let pts;
      if (hl.cornerIdx === 0) pts = [[xL, yB], [xL + ta, yB], [xL, yB + tb]];
      else if (hl.cornerIdx === 1) pts = [[xR, yB], [xR - ta, yB], [xR, yB + tb]];
      else if (hl.cornerIdx === 2) pts = [[xL, yT], [xL + ta, yT], [xL, yT - tb]];
      else pts = [[xR, yT], [xR - ta, yT], [xR, yT - tb]];
      addLine('BAFFLE_FURACAO', pts[0][0], pts[0][1], pts[1][0], pts[1][1]);
      addLine('BAFFLE_FURACAO', pts[1][0], pts[1][1], pts[2][0], pts[2][1]);
      addLine('BAFFLE_FURACAO', pts[2][0], pts[2][1], pts[0][0], pts[0][1]);
    }
  });
  addText('TEXTO_COTAS', bx0, by0 + E + 56, 22,
    `VISTA FRONTAL 1:1 — ${pack.driver.name.slice(0, 26)} (${ac.boxType.toUpperCase()})`);
  addText('TEXTO_COTAS', bx0, by0 + E + 22, 18,
    `Ext: F=${F.toFixed(0)} x E=${E.toFixed(0)} mm | Int: A=${A.toFixed(0)} x B=${B.toFixed(0)} mm`);
  // Cotas lineares nativas (DIMENSION) da Vista Frontal: F (base) e E (lateral esquerda)
  addLinearDim('COTAS_DIM', bx0, by0, bx0 + F, by0, bx0 + F / 2, by0 - 55, 0, `F=${F.toFixed(0)} mm`);
  addLinearDim('COTAS_DIM', bx0, by0, bx0, by0 + E, bx0 - 65, by0 + E / 2, 90, `E=${E.toFixed(0)} mm`);

  // 3. Vista Lateral 1:1 (Corte Lateral) à direita do Baffle
  const sx0 = bx0 + Math.max(F + 320, 1280);
  const sy0 = by0;
  addLine('VISTA_LATERAL', sx0, sy0, sx0 + D_ext, sy0);
  addLine('VISTA_LATERAL', sx0 + D_ext, sy0, sx0 + C_ext, sy0 + E);
  addLine('VISTA_LATERAL', sx0 + C_ext, sy0 + E, sx0, sy0 + E);
  addLine('VISTA_LATERAL', sx0, sy0 + E, sx0, sy0);
  if (ac.planarGeom) {
    // Linha do baffle recuado dentro do gabinete Planar (profundidade CG = C + G)
    const zBaf = sx0 + t + ac.planarGeom.C_chamber;
    addLine('BAFFLE_FURACAO', zBaf, sy0 + t, zBaf, sy0 + E - t);
    addText('TEXTO_COTAS', sx0, sy0 - 95, 20, `PLANAR ${ac.planarGeom.style.toUpperCase()} | CG=${ac.planarGeom.CG} mm (C=${ac.planarGeom.C_chamber} + G=${ac.planarGeom.recuoG} mm)`);
  } else if (ac.portRouting === 'side_firing') {
    // CAD-04: Furação Side-Firing real na face lateral direita (eixo Z = xExt, eixo Y = yExt)
    const sideHoles2d = (pack.baffleHoles || []).filter(hl => hl.panel === 'lateral_dir');
    sideHoles2d.forEach(hl => {
      const cx = sx0 + hl.xExt;
      const cy = sy0 + hl.yExt;
      if (hl.shape === 'round') {
        addCircle('BAFFLE_FURACAO', cx, cy, hl.dia / 2);
        addText('TEXTO_COTAS', cx - 50, cy - 8, 16, `SIDE-FIRING D=${hl.dia.toFixed(0)}mm Lv=${(hl.lvMm || ac.lvMm || 0).toFixed(0)}`);
      } else if (hl.shape === 'slot') {
        addRect('BAFFLE_FURACAO', cx - hl.w / 2, cy - hl.h / 2, hl.w, hl.h);
        addText('TEXTO_COTAS', cx - hl.w / 2 + 6, cy - 6, 16, `SIDE-FIRING SLOT ${hl.w.toFixed(0)}x${hl.h.toFixed(0)} Lv=${(hl.lvMm || ac.lvMm || 0).toFixed(0)}`);
      }
    });
    addText('TEXTO_COTAS', sx0, sy0 - 95, 18, `SIDE-FIRING (EIXO A) Lv=${ac.lvMm} mm (${sideHoles2d.length}x recorte lateral)`);
  } else if (ac.portRouting === 'l_bend' && ac.portRoutePlan && ac.portRoutePlan.l2Mm >= 10) {
    // CAD-14: Duto em L (90°) na vista lateral (Trecho 1 + Curva 90° + Trecho 2)
    const rp2d = ac.portRoutePlan;
    const pH = Math.min(B * 0.25, 100);
    const l1 = Math.max(40, rp2d.l1Mm);
    addRect('BAFFLE_FURACAO', sx0 + D_ext - t - l1, sy0 + t + 10, l1, pH);
    addText('TEXTO_COTAS', sx0 + D_ext - t - l1, sy0 + t + pH + 18, 16, `L-PORT L1=${Math.round(l1)} + 90deg + L2=${Math.round(rp2d.l2Mm)} mm (Lv=${ac.lvMm} mm)`);
  } else if (ac.lvMm > 0) {
    const pH = Math.min(B * 0.25, 110);
    addRect('BAFFLE_FURACAO', sx0 + D_ext - t - ac.lvMm, sy0 + t + 10, ac.lvMm, pH);
    addText('TEXTO_COTAS', sx0 + D_ext - t - ac.lvMm, sy0 + t + pH + 18, 18, `DUTO Lv=${ac.lvMm} mm`);
  }
  addLinearDim('COTAS_DIM', sx0, sy0, sx0 + D_ext, sy0, sx0 + D_ext / 2, sy0 - 55, 0, `D_ext=${D_ext.toFixed(0)} mm`);
  addText('TEXTO_COTAS', sx0, sy0 + E + 56, 22,
    `CORTE LATERAL 1:1 | MDF ${t} mm`);
  addText('TEXTO_COTAS', sx0, sy0 + E + 22, 18,
    `C_ext=${C_ext.toFixed(0)} / D_ext=${D_ext.toFixed(0)} mm | E=${E.toFixed(0)} mm`);

  push(0, 'ENDSEC', 0, 'EOF');
  return lines.join('\r\n') + '\r\n';
}

function exportBuildPackDxf(opts) {
  if (!lastBuildPack) updateWoodlock();
  const gate = checkCadExportGate(lastBuildPack, opts);
  if (!gate.ok) {
    if (gate.reason === 'GEOMETRY_CRITICAL') alert('⛔ Exportação bloqueada: corrija os erros críticos de geometria na aba Marcenaria CAD.');
    return false;
  }
  const dxf = buildPgsDxfString(lastBuildPack);
  const safe = (lastBuildPack.driver.name || 'Projeto').replace(/[^a-zA-Z0-9_-]+/g, '_').slice(0, 36);
  const blob = new Blob([dxf], { type: 'application/dxf' });
  const a = document.createElement('a');
  a.download = `BassForge_CAD_2D_${safe}.dxf`;
  a.href = URL.createObjectURL(blob);
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1500);
  return true;
}

/**
 * Gera modelo 3D real em DXF R12 (3DFACE + LINE 3D em mm, Z = altura) a partir da Fonte Única PGS.
 * Conversão PGS (X=larg, Y=alt, Z=prof) -> CAD 3D (X=larg, Y=prof, Z=alt) para o gabinete ficar em pé no Z=0.
 */
function buildPgs3dDxfString(pack, explodeRatio = 0.0) {
  if (!pack) return '';
  const geom = pack.geometry || buildPgsGeometryModel(pack);
  const env = geom.envelope;
  const F = env.F, t = geom.material.thickness;
  const er = Math.max(0, Math.min(1, Number.isFinite(explodeRatio) ? explodeRatio : 0.0));
  const lines = [];
  const push = (...vals) => { for (const v of vals) lines.push(String(v)); };
  const f = n => (Number.isFinite(n) ? n.toFixed(2) : '0.00');

  // Mapeia ponto PGS (px, py, pz) para CAD 3D (X=px, Y=pz, Z=py)
  const pt = (px, py, pz) => [px, pz, py];
  const addLine3d = (layer, a, b) => {
    push(0, 'LINE', 8, layer, 10, f(a[0]), 20, f(a[1]), 30, f(a[2]), 11, f(b[0]), 21, f(b[1]), 31, f(b[2]));
  };
  const addFace3d = (layer, p0, p1, p2, p3) => {
    push(
      0, '3DFACE', 8, layer,
      10, f(p0[0]), 20, f(p0[1]), 30, f(p0[2]),
      11, f(p1[0]), 21, f(p1[1]), 31, f(p1[2]),
      12, f(p2[0]), 22, f(p2[1]), 32, f(p2[2]),
      13, f(p3[0]), 23, f(p3[1]), 33, f(p3[2])
    );
  };
  const addBox3d = (layer, x0, y0, z0, dx, dy, dz) => {
    const v = [
      pt(x0, y0, z0), pt(x0 + dx, y0, z0), pt(x0 + dx, y0, z0 + dz), pt(x0, y0, z0 + dz),
      pt(x0, y0 + dy, z0), pt(x0 + dx, y0 + dy, z0), pt(x0 + dx, y0 + dy, z0 + dz), pt(x0, y0 + dy, z0 + dz)
    ];
    // 6 faces 3DFACE
    addFace3d(layer, v[0], v[1], v[2], v[3]); // base
    addFace3d(layer, v[4], v[5], v[6], v[7]); // topo
    addFace3d(layer, v[0], v[1], v[5], v[4]); // tras
    addFace3d(layer, v[3], v[2], v[6], v[7]); // frente
    addFace3d(layer, v[0], v[3], v[7], v[4]); // esq
    addFace3d(layer, v[1], v[2], v[6], v[5]); // dir
    // 12 arestas wireframe
    [[0,1],[1,2],[2,3],[3,0],[4,5],[5,6],[6,7],[7,4],[0,4],[1,5],[2,6],[3,7]].forEach(([i, j]) => addLine3d(layer, v[i], v[j]));
  };
  const addCylinderZ = (layer, cx, cy, z0, r, len, segs = 20) => {
    if (!(r > 0 && len > 0)) return;
    for (let i = 0; i < segs; i++) {
      const a0 = (i / segs) * Math.PI * 2;
      const a1 = ((i + 1) / segs) * Math.PI * 2;
      const x0 = cx + Math.cos(a0) * r, y0 = cy + Math.sin(a0) * r;
      const x1 = cx + Math.cos(a1) * r, y1 = cy + Math.sin(a1) * r;
      addFace3d(layer, pt(x0, y0, z0), pt(x1, y1, z0), pt(x1, y1, z0 + len), pt(x0, y0, z0 + len));
    }
  };
  const addCylinderX = (layer, x0, cy, cz, r, len, segs = 20) => {
    if (!(r > 0 && len > 0)) return;
    for (let i = 0; i < segs; i++) {
      const a0 = (i / segs) * Math.PI * 2;
      const a1 = ((i + 1) / segs) * Math.PI * 2;
      const y0 = cy + Math.cos(a0) * r, z0 = cz + Math.sin(a0) * r;
      const y1 = cy + Math.cos(a1) * r, z1 = cz + Math.sin(a1) * r;
      addFace3d(layer, pt(x0, y0, z0), pt(x0, y1, z1), pt(x0 + len, y1, z1), pt(x0 + len, y0, z0));
    }
  };
  const addCylinderY = (layer, cx, y0, cz, r, len, segs = 20) => {
    if (!(r > 0 && len > 0)) return;
    for (let i = 0; i < segs; i++) {
      const a0 = (i / segs) * Math.PI * 2;
      const a1 = ((i + 1) / segs) * Math.PI * 2;
      const x0 = cx + Math.cos(a0) * r, z0 = cz + Math.sin(a0) * r;
      const x1 = cx + Math.cos(a1) * r, z1 = cz + Math.sin(a1) * r;
      addFace3d(layer, pt(x0, y0, z0), pt(x1, y0, z1), pt(x1, y0 + len, z1), pt(x0, y0 + len, z0));
    }
  };
  const addElbow90Dxf = (layer, cx, cy, zStart, r, rElbIn, dirX, arcSegs = 6, radSegs = 12) => {
    if (!(r > 0)) return;
    const R = Math.max(r * 1.15, rElbIn);
    const xc = cx + dirX * R;
    const zc = zStart;
    const ringPt = (th, a) => {
      const rx = -dirX * Math.cos(th), rz = -Math.sin(th);
      const ca = Math.cos(a) * r, sa = Math.sin(a) * r;
      return pt(xc + (R + ca) * rx, cy + sa, zc + (R + ca) * rz);
    };
    for (let j = 0; j < arcSegs; j++) {
      const th0 = (j / arcSegs) * (Math.PI * 0.5);
      const th1 = ((j + 1) / arcSegs) * (Math.PI * 0.5);
      for (let i = 0; i < radSegs; i++) {
        const a0 = (i / radSegs) * Math.PI * 2;
        const a1 = ((i + 1) / radSegs) * Math.PI * 2;
        addFace3d(layer, ringPt(th0, a0), ringPt(th0, a1), ringPt(th1, a1), ringPt(th1, a0));
      }
    }
  };
  const addPrismXYDxf = (layer, quadXY, z0, z1) => {
    const pB = quadXY.map(([x, y]) => pt(x, y, z0));
    const pF = quadXY.map(([x, y]) => pt(x, y, z1));
    addFace3d(layer, pB[0], pB[1], pB[2], pB[3]);
    addFace3d(layer, pF[0], pF[1], pF[2], pF[3]);
    for (let i = 0; i < 4; i++) {
      const j = (i + 1) % 4;
      addFace3d(layer, pB[i], pB[j], pF[j], pF[i]);
      addLine3d(layer, pB[i], pB[j]);
      addLine3d(layer, pF[i], pF[j]);
      addLine3d(layer, pB[i], pF[i]);
    }
  };
  const addCircleOnPlaneZ = (layer, cx, cy, zPlane, r, segs = 36) => {
    if (!(r > 0)) return;
    for (let i = 0; i < segs; i++) {
      const a0 = (i / segs) * Math.PI * 2;
      const a1 = ((i + 1) / segs) * Math.PI * 2;
      addLine3d(layer,
        pt(cx + Math.cos(a0) * r, cy + Math.sin(a0) * r, zPlane),
        pt(cx + Math.cos(a1) * r, cy + Math.sin(a1) * r, zPlane));
    }
  };
  const addCircleOnPlaneX = (layer, xPlane, cy, cz, r, segs = 36) => {
    if (!(r > 0)) return;
    for (let i = 0; i < segs; i++) {
      const a0 = (i / segs) * Math.PI * 2;
      const a1 = ((i + 1) / segs) * Math.PI * 2;
      addLine3d(layer,
        pt(xPlane, cy + Math.cos(a0) * r, cz + Math.sin(a0) * r),
        pt(xPlane, cy + Math.cos(a1) * r, cz + Math.sin(a1) * r));
    }
  };

  // HEADER (AC1009, mm)
  push(0, 'SECTION', 2, 'HEADER', 9, '$ACADVER', 1, 'AC1009', 9, '$INSUNITS', 70, 4, 9, '$MEASUREMENT', 70, 1, 0, 'ENDSEC');

  // TABLES: LAYER + VPORT (*ACTIVE em vista isométrica 3D)
  const layers = [
    ['PAINEIS_3D', 4],
    ['DIVISORIAS_3D', 6],
    ['DUTOS_3D', 30],
    ['TRAVAMENTOS_3D', 5],
    ['FURACAO_3D', 1]
  ];
  push(0, 'SECTION', 2, 'TABLES', 0, 'TABLE', 2, 'LAYER', 70, layers.length);
  layers.forEach(([name, color]) => push(0, 'LAYER', 2, name, 70, 0, 62, color, 6, 'CONTINUOUS'));
  push(0, 'ENDTAB');
  // VPORT inicial em câmera isométrica SE (1, -1, 0.75) para já abrir em 3D no CAD
  push(
    0, 'TABLE', 2, 'VPORT', 70, 1,
    0, 'VPORT', 2, '*ACTIVE', 70, 0,
    10, '0.0', 20, '0.0', 11, '1.0', 21, '1.0',
    12, f(F / 2), 22, f(env.D_ext / 2),
    16, '1.0', 26, '-1.0', 36, '0.75',
    17, f(F / 2), 27, f(env.D_ext / 2), 37, f(env.E / 2),
    40, f(Math.max(F, env.E, env.D_ext) * 1.8), 41, '1.6', 42, '50.0',
    0, 'ENDTAB', 0, 'ENDSEC'
  );

  // ENTITIES 3D
  push(0, 'SECTION', 2, 'ENTITIES');

  const ac3d = pack.acoustics || {};
  const portOff3d = Number(ac3d.portOffsetMm || 0);
  const routing3d = ac3d.portRouting || 'straight';
  const rp3d = ac3d.portRoutePlan || null;

  (geom.parts || []).forEach(p => {
    const ex = p.explodeDir[0] * p.explodeDist * er;
    const ey = p.explodeDir[1] * p.explodeDist * er;
    const ez = p.explodeDir[2] * p.explodeDist * er;
    const ox = p.origin[0] + ex;
    const oy = p.origin[1] + ey;
    const oz = p.origin[2] + ez;
    const [dx, dy, dz] = p.size;

    if (p.id === 'P_SIDES') {
      const xRight = F - t + p.explodeDist * er;
      addBox3d('PAINEIS_3D', ox, oy, oz, dx, dy, dz);
      addBox3d('PAINEIS_3D', xRight, oy, oz, dx, dy, dz);
      // CAD-04: Recortes Side-Firing na face lateral direita (+X)
      const xFaceR = xRight + dx + 0.5;
      (geom.cutouts || []).filter(c => c.partId === 'P_SIDES' || c.panel === 'lateral_dir').forEach(c => {
        if (c.shape === 'round' && c.dia) {
          addCircleOnPlaneX('FURACAO_3D', xFaceR, t + c.yInt + ey, t + c.xInt + ez, c.dia / 2, 36);
        } else if (c.shape === 'slot' && c.w && c.h) {
          const z0s = t + c.xInt - c.w / 2 + ez, y0s = t + c.yInt - c.h / 2 + ey;
          const a = pt(xFaceR, y0s, z0s), b = pt(xFaceR, y0s, z0s + c.w), d = pt(xFaceR, y0s + c.h, z0s + c.w), e = pt(xFaceR, y0s + c.h, z0s);
          addLine3d('FURACAO_3D', a, b); addLine3d('FURACAO_3D', b, d); addLine3d('FURACAO_3D', d, e); addLine3d('FURACAO_3D', e, a);
        }
      });
    } else if (p.kind === 'divider') {
      addBox3d('DIVISORIAS_3D', ox, oy, oz, dx, dy, dz);
    } else if (p.kind === 'batten') {
      addBox3d('TRAVAMENTOS_3D', ox, oy, oz, dx, dy, dz);
    } else if (p.kind === 'port') {
      if (p.area <= 0) {
        if (p.bpTopRound) {
          const r = dx / 2;
          const isRear = (p.id === 'P_PORT_REAR');
          const hs = (geom.cutouts || []).filter(c => c.kind === 'port' && c.shape === 'round' && c.partId === 'P_TOP' && ((/Traseir/.test(c.label || '')) === isRear));
          const list = hs.length ? hs : (isRear ? [] : (geom.cutouts || []).filter(c => c.kind === 'port' && c.shape === 'round' && c.partId === 'P_TOP'));
          list.forEach(ch => {
            const lv = ch.lvMm || dy;
            addCylinderY('DUTOS_3D', t + ch.xInt + ex, Math.max(t, env.E + portOff3d - lv) + ey, t + ch.yInt + ez, r, lv, 20);
          });
        } else if (p.id === 'P_PORT_SERIES') {
          const r = dy / 2;
          const hs = (geom.cutouts || []).filter(c => c.partId && c.partId.startsWith('P_BP_DIVIDER') && c.kind === 'port');
          if (hs.length) {
            hs.forEach(ch => addCylinderX('DUTOS_3D', ox, t + ch.yInt + ey, t + ch.xInt + ez, r, Math.min(dx, ch.lvMm || dx), 20));
          } else {
            addCylinderX('DUTOS_3D', ox, oy + r, oz + r, r, dx, 20);
          }
        } else if (routing3d === 'side_firing' || p.sideFiring) {
          // CAD-04 & CAD-14: Duto(s) cilíndrico(s) Side-Firing ao longo do eixo -X
          const r = (p.sideFiring ? dy : dx) / 2;
          const lv = p.sideFiring ? dx : dz;
          const sideHoles = (geom.cutouts || []).filter(c => c.kind === 'port' && c.shape === 'round' && (c.partId === 'P_SIDES' || c.panel === 'lateral_dir'));
          const xStartSide = Math.max(t, F - t + portOff3d - lv);
          if (sideHoles.length) {
            sideHoles.forEach(sh => {
              const lvCur = sh.lvMm || lv;
              addCylinderX('DUTOS_3D', Math.max(t, F - t + portOff3d - lvCur) + ex, t + sh.yInt + ey, t + sh.xInt + ez, r, lvCur, 20);
            });
          } else {
            addCylinderX('DUTOS_3D', xStartSide + ex, oy + r, oz + r, r, lv, 20);
          }
        } else {
          // CAD-14: Suporta numDucts > 1 e l_bend (Trecho 1 + Joelho 90° + Trecho 2)
          const r = dx / 2;
          const frontHoles = (geom.cutouts || []).filter(c => c.kind === 'port' && c.shape === 'round' && c.partId === 'P_FRONT_BAFFLE');
          if (routing3d === 'l_bend' && rp3d && rp3d.l2Mm >= 10 && frontHoles.length) {
            const l1 = Math.max(40, rp3d.l1Mm);
            const l2 = Math.max(10, rp3d.l2Mm);
            const rElb = Math.max(r * 1.15, Number(rp3d.rElbow) || r * 1.6);
            const zBack = Math.max(t + rElb + r, env.D_ext + portOff3d - l1);
            frontHoles.forEach(ch => {
              const cx = t + ch.xInt + ex, cy = t + ch.yInt + ey;
              const dirX = (cx <= F / 2) ? 1 : -1;
              addCylinderZ('DUTOS_3D', cx, cy, zBack + ez, r, l1, 20);
              addElbow90Dxf('DUTOS_3D', cx, cy, zBack + ez, r, rElb, dirX, 6, 12);
              const xStartL2 = (dirX > 0) ? (cx + rElb) : (cx - rElb - l2);
              addCylinderX('DUTOS_3D', xStartL2, cy, zBack - rElb + ez, r, l2, 20);
            });
          } else if (frontHoles.length) {
            frontHoles.forEach(ch => {
              const lv = ch.lvMm || dz;
              addCylinderZ('DUTOS_3D', t + ch.xInt + ex, t + ch.yInt + ey, Math.max(t, env.D_ext + portOff3d - lv) + ez, r, lv, 20);
            });
          } else {
            addCylinderZ('DUTOS_3D', ox + dx / 2, oy + dy / 2, oz, dx / 2, dz, 20);
          }
        }
      } else if (p.triMeta) {
        // CAD-14: Paredes angulares dos dutos triangulares de canto (triMeta)
        const tm = p.triMeta;
        const ta = tm.triA || 140, tb = tm.triB || 140, lv = tm.lvMm || dz;
        const z0t = Math.max(t, env.D_ext + portOff3d - lv) + ez;
        const z1t = z0t + lv;
        const allCorners = [
          [[t, t + tb], [t + ta, t], [tb, ta]],
          [[t + env.A - ta, t], [t + env.A, t + tb], [-tb, ta]],
          [[t, t + env.B - tb], [t + ta, t + env.B], [tb, -ta]],
          [[t + env.A - ta, t + env.B], [t + env.A, t + env.B - tb], [-tb, -ta]]
        ];
        (tm.corners || [0, 1]).forEach(ci => {
          const [p1, p2, n] = allCorners[((ci % 4) + 4) % 4];
          const nl = Math.max(1e-6, Math.hypot(n[0], n[1]));
          const ux = (n[0] / nl) * t, uy = (n[1] / nl) * t;
          addPrismXYDxf('DUTOS_3D', [
            [p1[0] + ex, p1[1] + ey], [p2[0] + ex, p2[1] + ey],
            [p2[0] + ux + ex, p2[1] + uy + ey], [p1[0] + ux + ex, p1[1] + uy + ey]
          ], z0t, z1t);
        });
      } else if (p.sharedCenterSlot) {
        addBox3d('DUTOS_3D', p.sharedCenterSlot.xLeft + ex, oy, oz, dx, dy, dz);
        addBox3d('DUTOS_3D', p.sharedCenterSlot.xRight + ex, oy, oz, dx, dy, dz);
      } else if (p.splitByCenterDiv) {
        addBox3d('DUTOS_3D', p.splitByCenterDiv.xLeft + ex, oy, oz, dx, dy, dz);
        addBox3d('DUTOS_3D', p.splitByCenterDiv.xRight + ex, oy, oz, dx, dy, dz);
      } else {
        addBox3d('DUTOS_3D', ox, oy, oz, dx, dy, dz);
      }
    } else if (p.id === 'P_FRONT_BAFFLE' && p.frontSplit) {
      addBox3d('PAINEIS_3D', p.frontSplit.xLeft + ex, oy, oz, dx, dy, dz);
      addBox3d('PAINEIS_3D', p.frontSplit.xRight + ex, oy, oz, dx, dy, dz);
    } else if (p.id === 'P_TOP' && p.topSplit) {
      addBox3d('PAINEIS_3D', p.topSplit.xLeft + ex, oy, oz, dx, dy, dz);
      addBox3d('PAINEIS_3D', p.topSplit.xRight + ex, oy, oz, dx, dy, dz);
    } else {
      addBox3d('PAINEIS_3D', ox, oy, oz, dx, dy, dz);
    }

    // Recortes 3D na face frontal do baffle
    if (p.id === 'P_FRONT_BAFFLE') {
      const zFront = oz + dz + 0.5;
      (geom.cutouts || []).filter(c => c.partId === 'P_FRONT_BAFFLE').forEach(c => {
        if (c.shape === 'round') {
          addCircleOnPlaneZ('FURACAO_3D', t + c.xInt + ex, t + c.yInt + ey, zFront, c.dia / 2, 36);
          if (c.kind === 'driver' && c.flangeDia) {
            addCircleOnPlaneZ('FURACAO_3D', t + c.xInt + ex, t + c.yInt + ey, zFront, c.flangeDia / 2, 36);
          }
        } else if (c.shape === 'slot') {
          const x0 = t + c.xInt - c.w / 2 + ex, y0 = t + c.yInt - c.h / 2 + ey;
          const a = pt(x0, y0, zFront), b = pt(x0 + c.w, y0, zFront), d = pt(x0 + c.w, y0 + c.h, zFront), e = pt(x0, y0 + c.h, zFront);
          addLine3d('FURACAO_3D', a, b); addLine3d('FURACAO_3D', b, d); addLine3d('FURACAO_3D', d, e); addLine3d('FURACAO_3D', e, a);
        } else if (c.shape === 'triangle' && c.triA && c.triB) {
          const ta = c.triA, tb = c.triB, ci = ((c.cornerIdx || 0) % 4 + 4) % 4;
          const tc = [
            [[t, t], [t + ta, t], [t, t + tb]],
            [[t + env.A, t], [t + env.A - ta, t], [t + env.A, t + tb]],
            [[t, t + env.B], [t + ta, t + env.B], [t, t + env.B - tb]],
            [[t + env.A, t + env.B], [t + env.A - ta, t + env.B], [t + env.A, t + env.B - tb]]
          ][ci].map(([x, y]) => pt(x + ex, y + ey, zFront));
          addLine3d('FURACAO_3D', tc[0], tc[1]); addLine3d('FURACAO_3D', tc[1], tc[2]); addLine3d('FURACAO_3D', tc[2], tc[0]);
        }
      });
    }
  });

  push(0, 'ENDSEC', 0, 'EOF');
  return lines.join('\r\n') + '\r\n';
}

function exportBuildPackDxf3d(opts) {
  if (!lastBuildPack) updateWoodlock();
  const gate = checkCadExportGate(lastBuildPack, opts);
  if (!gate.ok) {
    if (gate.reason === 'GEOMETRY_CRITICAL') alert('⛔ Exportação bloqueada: corrija os erros críticos de geometria na aba Marcenaria CAD.');
    return false;
  }
  const dxf = buildPgs3dDxfString(lastBuildPack, wlViewMode === 'exploded' ? wlExplodeRatio : 0.0);
  const safe = (lastBuildPack.driver.name || 'Projeto').replace(/[^a-zA-Z0-9_-]+/g, '_').slice(0, 36);
  const blob = new Blob([dxf], { type: 'application/dxf' });
  const a = document.createElement('a');
  a.download = `BassForge_CAD_3D_${safe}.dxf`;
  a.href = URL.createObjectURL(blob);
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1500);
  return true;
}

/**
 * Gera malha 3D sólida Wavefront OBJ em milímetros (Y = altura, padrão SketchUp / Blender / Windows 3D Viewer)
 * lendo EXCLUSIVAMENTE pack.geometry.parts (Fonte Única PGS), com objetos separados por peça e aros de furação.
 */
function buildPgsObjString(pack, explodeRatio = 0.0) {
  if (!pack) return '';
  const geom = pack.geometry || buildPgsGeometryModel(pack);
  const env = geom.envelope;
  const F = env.F, t = geom.material.thickness;
  const er = Math.max(0, Math.min(1, Number.isFinite(explodeRatio) ? explodeRatio : 0.0));
  const out = [
    '# BassForge SUITE — Wavefront OBJ 3D Solido (unidades: mm, Y-up)',
    `# Driver: ${pack.driver.name} | Topologia: ${pack.acoustics.boxType.toUpperCase()} | Explosao: ${Math.round(er * 100)}%`,
    `# Externo: F=${env.F} x E=${env.E} x D_ext=${env.D_ext} mm | MDF ${t} mm`,
    ''
  ];
  let vCount = 0;
  const f = n => (Number.isFinite(n) ? n.toFixed(2) : '0.00');
  const addV = (x, y, z) => {
    out.push(`v ${f(x)} ${f(y)} ${f(z)}`);
    return ++vCount;
  };
  const addQuad = (a, b, c, d) => {
    out.push(`f ${a} ${b} ${c}`);
    out.push(`f ${a} ${c} ${d}`);
  };
  const addBox = (objName, x0, y0, z0, dx, dy, dz) => {
    out.push(`o ${objName}`);
    const v1 = addV(x0, y0, z0);
    const v2 = addV(x0 + dx, y0, z0);
    const v3 = addV(x0 + dx, y0, z0 + dz);
    const v4 = addV(x0, y0, z0 + dz);
    const v5 = addV(x0, y0 + dy, z0);
    const v6 = addV(x0 + dx, y0 + dy, z0);
    const v7 = addV(x0 + dx, y0 + dy, z0 + dz);
    const v8 = addV(x0, y0 + dy, z0 + dz);
    // Normais apontando para fora (CCW)
    addQuad(v4, v3, v7, v8); // +Z frente
    addQuad(v2, v1, v5, v6); // -Z tras
    addQuad(v5, v8, v7, v6); // +Y topo
    addQuad(v1, v2, v3, v4); // -Y base
    addQuad(v3, v2, v6, v7); // +X dir
    addQuad(v1, v4, v8, v5); // -X esq
  };
  const addTubeZ = (objName, cx, cy, z0, rOuter, rInner, len, segs = 28) => {
    if (!(rOuter > 0 && len > 0)) return;
    const ri = Math.max(1, Math.min(rOuter - 1, rInner));
    out.push(`o ${objName}`);
    const oFront = [], oBack = [], iFront = [], iBack = [];
    for (let i = 0; i < segs; i++) {
      const ang = (i / segs) * Math.PI * 2;
      const ca = Math.cos(ang), sa = Math.sin(ang);
      oBack.push(addV(cx + ca * rOuter, cy + sa * rOuter, z0));
      oFront.push(addV(cx + ca * rOuter, cy + sa * rOuter, z0 + len));
      iBack.push(addV(cx + ca * ri, cy + sa * ri, z0));
      iFront.push(addV(cx + ca * ri, cy + sa * ri, z0 + len));
    }
    for (let i = 0; i < segs; i++) {
      const n = (i + 1) % segs;
      addQuad(oBack[i], oBack[n], oFront[n], oFront[i]); // parede externa
      addQuad(iBack[n], iBack[i], iFront[i], iFront[n]); // parede interna
      addQuad(oFront[i], oFront[n], iFront[n], iFront[i]); // tampa frontal
      addQuad(iBack[i], iBack[n], oBack[n], oBack[i]); // tampa traseira
    }
  };

  const addTubeX = (objName, x0, cy, cz, rOuter, rInner, len, segs = 28) => {
    if (!(rOuter > 0 && len > 0)) return;
    const ri = Math.max(1, Math.min(rOuter - 1, rInner));
    out.push(`o ${objName}`);
    const oA = [], oB = [], iA = [], iB = [];
    for (let i = 0; i < segs; i++) {
      const ang = (i / segs) * Math.PI * 2;
      const ca = Math.cos(ang), sa = Math.sin(ang);
      oA.push(addV(x0, cy + ca * rOuter, cz + sa * rOuter));
      oB.push(addV(x0 + len, cy + ca * rOuter, cz + sa * rOuter));
      iA.push(addV(x0, cy + ca * ri, cz + sa * ri));
      iB.push(addV(x0 + len, cy + ca * ri, cz + sa * ri));
    }
    for (let i = 0; i < segs; i++) {
      const n = (i + 1) % segs;
      addQuad(oA[i], oA[n], oB[n], oB[i]);
      addQuad(iA[n], iA[i], iB[i], iB[n]);
      addQuad(oB[i], oB[n], iB[n], iB[i]);
      addQuad(iA[i], iA[n], oA[n], oA[i]);
    }
  };
  const addTubeY = (objName, cx, y0, cz, rOuter, rInner, len, segs = 28) => {
    if (!(rOuter > 0 && len > 0)) return;
    const ri = Math.max(1, Math.min(rOuter - 1, rInner));
    out.push(`o ${objName}`);
    const oA = [], oB = [], iA = [], iB = [];
    for (let i = 0; i < segs; i++) {
      const ang = (i / segs) * Math.PI * 2;
      const ca = Math.cos(ang), sa = Math.sin(ang);
      oA.push(addV(cx + ca * rOuter, y0, cz + sa * rOuter));
      oB.push(addV(cx + ca * rOuter, y0 + len, cz + sa * rOuter));
      iA.push(addV(cx + ca * ri, y0, cz + sa * ri));
      iB.push(addV(cx + ca * ri, y0 + len, cz + sa * ri));
    }
    for (let i = 0; i < segs; i++) {
      const n = (i + 1) % segs;
      addQuad(oA[i], oA[n], oB[n], oB[i]);
      addQuad(iA[n], iA[i], iB[i], iB[n]);
      addQuad(oB[i], oB[n], iB[n], iB[i]);
      addQuad(iA[i], iA[n], oA[n], oA[i]);
    }
  };
  const addElbow90Obj = (objName, cx, cy, zStart, rOuter, rElbIn, dirX, arcSegs = 8, radSegs = 16) => {
    if (!(rOuter > 0)) return;
    const R = Math.max(rOuter * 1.15, rElbIn);
    const xc = cx + dirX * R, zc = zStart;
    out.push(`o ${objName}`);
    const rings = [];
    for (let j = 0; j <= arcSegs; j++) {
      const th = (j / arcSegs) * (Math.PI * 0.5);
      const rx = -dirX * Math.cos(th), rz = -Math.sin(th);
      const ring = [];
      for (let i = 0; i < radSegs; i++) {
        const a = (i / radSegs) * Math.PI * 2;
        const ca = Math.cos(a) * rOuter, sa = Math.sin(a) * rOuter;
        ring.push(addV(xc + (R + ca) * rx, cy + sa, zc + (R + ca) * rz));
      }
      rings.push(ring);
    }
    for (let j = 0; j < arcSegs; j++) {
      for (let i = 0; i < radSegs; i++) {
        const n = (i + 1) % radSegs;
        addQuad(rings[j][i], rings[j][n], rings[j + 1][n], rings[j + 1][i]);
      }
    }
  };
  const addPrismXYObj = (objName, quadXY, z0, z1) => {
    out.push(`o ${objName}`);
    const b = quadXY.map(([x, y]) => addV(x, y, z0));
    const fV = quadXY.map(([x, y]) => addV(x, y, z1));
    addQuad(b[0], b[1], b[2], b[3]);
    addQuad(fV[0], fV[3], fV[2], fV[1]);
    for (let i = 0; i < 4; i++) {
      const j = (i + 1) % 4;
      addQuad(b[i], b[j], fV[j], fV[i]);
    }
  };

  const acObj = pack.acoustics || {};
  const portOffObj = Number(acObj.portOffsetMm || 0);
  const routingObj = acObj.portRouting || 'straight';
  const rpObj = acObj.portRoutePlan || null;

  (geom.parts || []).forEach(p => {
    const ex = p.explodeDir[0] * p.explodeDist * er;
    const ey = p.explodeDir[1] * p.explodeDist * er;
    const ez = p.explodeDir[2] * p.explodeDist * er;
    const ox = p.origin[0] + ex;
    const oy = p.origin[1] + ey;
    const oz = p.origin[2] + ez;
    const [dx, dy, dz] = p.size;

    if (p.id === 'P_SIDES') {
      const xRight = F - t + p.explodeDist * er;
      addBox('P_SIDE_LEFT', ox, oy, oz, dx, dy, dz);
      addBox('P_SIDE_RIGHT', xRight, oy, oz, dx, dy, dz);
      // CAD-04: Aros 3D dos dutos Side-Firing na face lateral direita (+X)
      const xFaceR = xRight + dx;
      (geom.cutouts || []).filter(c => c.partId === 'P_SIDES' || c.panel === 'lateral_dir').forEach((c, idx) => {
        if (c.shape === 'round' && c.dia) {
          addTubeX(`RING_SIDE_PORT_${idx + 1}`, xFaceR, t + c.yInt + ey, t + c.xInt + ez, c.dia / 2 + 8, c.dia / 2, 5, 36);
        }
      });
    } else if (p.kind === 'port') {
      if (p.area <= 0) {
        const wall = Math.max(2, p.thickness || 2);
        if (p.bpTopRound) {
          const r = dx / 2;
          const isRear = (p.id === 'P_PORT_REAR');
          const hs = (geom.cutouts || []).filter(c => c.kind === 'port' && c.shape === 'round' && c.partId === 'P_TOP' && ((/Traseir/.test(c.label || '')) === isRear));
          const list = hs.length ? hs : (isRear ? [] : (geom.cutouts || []).filter(c => c.kind === 'port' && c.shape === 'round' && c.partId === 'P_TOP'));
          list.forEach((ch, idx) => {
            const lv = ch.lvMm || dy;
            addTubeY(`${p.id}_${idx + 1}`, t + ch.xInt + ex, Math.max(t, env.E + portOffObj - lv) + ey, t + ch.yInt + ez, r, r - wall, lv, 28);
          });
        } else if (p.id === 'P_PORT_SERIES') {
          const r = dy / 2;
          const hs = (geom.cutouts || []).filter(c => c.partId && c.partId.startsWith('P_BP_DIVIDER') && c.kind === 'port');
          if (hs.length) {
            hs.forEach((ch, idx) => addTubeX(`${p.id}_${idx + 1}`, ox, t + ch.yInt + ey, t + ch.xInt + ez, r, r - wall, Math.min(dx, ch.lvMm || dx), 28));
          } else {
            addTubeX(p.id, ox, oy + r, oz + r, r, r - wall, dx, 28);
          }
        } else if (routingObj === 'side_firing' || p.sideFiring) {
          // CAD-04 & CAD-14: Duto(s) cilíndrico(s) Side-Firing ao longo do eixo -X
          const r = (p.sideFiring ? dy : dx) / 2;
          const lv = p.sideFiring ? dx : dz;
          const sideHoles = (geom.cutouts || []).filter(c => c.kind === 'port' && c.shape === 'round' && (c.partId === 'P_SIDES' || c.panel === 'lateral_dir'));
          if (sideHoles.length) {
            sideHoles.forEach((sh, idx) => {
              const lvCur = sh.lvMm || lv;
              const xStart = Math.max(t, F - t + portOffObj - lvCur);
              addTubeX(`${p.id}_SIDE_${idx + 1}`, xStart + ex, t + sh.yInt + ey, t + sh.xInt + ez, r, r - wall, lvCur, 28);
            });
          } else {
            addTubeX(`${p.id}_SIDE_1`, Math.max(t, F - t + portOffObj - lv) + ex, oy + r, oz + r, r, r - wall, lv, 28);
          }
        } else {
          // CAD-14: Paridade completa para numDucts > 1 e l_bend (Trecho 1 + Joelho 90° + Trecho 2)
          const r = dx / 2;
          const frontHoles = (geom.cutouts || []).filter(c => c.kind === 'port' && c.shape === 'round' && c.partId === 'P_FRONT_BAFFLE');
          if (routingObj === 'l_bend' && rpObj && rpObj.l2Mm >= 10 && frontHoles.length) {
            const l1 = Math.max(40, rpObj.l1Mm);
            const l2 = Math.max(10, rpObj.l2Mm);
            const rElb = Math.max(r * 1.15, Number(rpObj.rElbow) || r * 1.6);
            const zBack = Math.max(t + rElb + r, env.D_ext + portOffObj - l1);
            frontHoles.forEach((ch, idx) => {
              const cx = t + ch.xInt + ex, cy = t + ch.yInt + ey;
              const dirX = (cx <= F / 2) ? 1 : -1;
              addTubeZ(`${p.id}_L1_${idx + 1}`, cx, cy, zBack + ez, r, r - wall, l1, 28);
              addElbow90Obj(`${p.id}_ELBOW_${idx + 1}`, cx, cy, zBack + ez, r, rElb, dirX, 8, 16);
              const xStartL2 = (dirX > 0) ? (cx + rElb) : (cx - rElb - l2);
              addTubeX(`${p.id}_L2_${idx + 1}`, xStartL2, cy, zBack - rElb + ez, r, r - wall, l2, 28);
            });
          } else if (frontHoles.length) {
            frontHoles.forEach((ch, idx) => {
              const lv = ch.lvMm || dz;
              addTubeZ(`${p.id}_${idx + 1}`, t + ch.xInt + ex, t + ch.yInt + ey, Math.max(t, env.D_ext + portOffObj - lv) + ez, r, r - wall, lv, 28);
            });
          } else {
            addTubeZ(p.id, ox + dx / 2, oy + dy / 2, oz, r, r - wall, dz, 28);
          }
        }
      } else if (p.triMeta) {
        // CAD-14: Paredes angulares dos dutos triangulares de canto (triMeta)
        const tm = p.triMeta;
        const ta = tm.triA || 140, tb = tm.triB || 140, lv = tm.lvMm || dz;
        const z0t = Math.max(t, env.D_ext + portOffObj - lv) + ez;
        const z1t = z0t + lv;
        const allCorners = [
          [[t, t + tb], [t + ta, t], [tb, ta]],
          [[t + env.A - ta, t], [t + env.A, t + tb], [-tb, ta]],
          [[t, t + env.B - tb], [t + ta, t + env.B], [tb, -ta]],
          [[t + env.A - ta, t + env.B], [t + env.A, t + env.B - tb], [-tb, -ta]]
        ];
        (tm.corners || [0, 1]).forEach((ci, idx) => {
          const [p1, p2, n] = allCorners[((ci % 4) + 4) % 4];
          const nl = Math.max(1e-6, Math.hypot(n[0], n[1]));
          const ux = (n[0] / nl) * t, uy = (n[1] / nl) * t;
          addPrismXYObj(`P_PORT_TRI_${idx + 1}`, [
            [p1[0] + ex, p1[1] + ey], [p2[0] + ex, p2[1] + ey],
            [p2[0] + ux + ex, p2[1] + uy + ey], [p1[0] + ux + ex, p1[1] + uy + ey]
          ], z0t, z1t);
        });
      } else if (p.sharedCenterSlot) {
        addBox(`${p.id}_L`, p.sharedCenterSlot.xLeft + ex, oy, oz, dx, dy, dz);
        addBox(`${p.id}_R`, p.sharedCenterSlot.xRight + ex, oy, oz, dx, dy, dz);
      } else if (p.splitByCenterDiv) {
        addBox(`${p.id}_L`, p.splitByCenterDiv.xLeft + ex, oy, oz, dx, dy, dz);
        addBox(`${p.id}_R`, p.splitByCenterDiv.xRight + ex, oy, oz, dx, dy, dz);
      } else {
        addBox(p.id, ox, oy, oz, dx, dy, dz);
      }
    } else if (p.id === 'P_FRONT_BAFFLE' && p.frontSplit) {
      addBox('P_FRONT_BAFFLE_L', p.frontSplit.xLeft + ex, oy, oz, dx, dy, dz);
      addBox('P_FRONT_BAFFLE_R', p.frontSplit.xRight + ex, oy, oz, dx, dy, dz);
    } else if (p.id === 'P_TOP' && p.topSplit) {
      addBox('P_TOP_L', p.topSplit.xLeft + ex, oy, oz, dx, dy, dz);
      addBox('P_TOP_R', p.topSplit.xRight + ex, oy, oz, dx, dy, dz);
    } else {
      addBox(p.id, ox, oy, oz, dx, dy, dz);
    }

    // Aros 3D dos alto-falantes e dutos na face frontal do baffle
    if (p.id === 'P_FRONT_BAFFLE') {
      const zFace = oz + dz;
      (geom.cutouts || []).filter(c => c.partId === 'P_FRONT_BAFFLE').forEach((c, idx) => {
        if (c.shape === 'round') {
          const rOut = (c.kind === 'driver' && c.flangeDia) ? (c.flangeDia / 2) : (c.dia / 2 + 8);
          const rIn = c.dia / 2;
          addTubeZ(`RING_${c.kind.toUpperCase()}_${idx + 1}`, t + c.xInt + ex, t + c.yInt + ey, zFace, rOut, rIn, c.kind === 'driver' ? 8 : 5, 36);
        }
      });
    }
  });

  return out.join('\n') + '\n';
}

function exportBuildPackObj(opts) {
  if (!lastBuildPack) updateWoodlock();
  const gate = checkCadExportGate(lastBuildPack, opts);
  if (!gate.ok) {
    if (gate.reason === 'GEOMETRY_CRITICAL') alert('⛔ Exportação bloqueada: corrija os erros críticos de geometria na aba Marcenaria CAD.');
    return false;
  }
  const obj = buildPgsObjString(lastBuildPack, wlViewMode === 'exploded' ? wlExplodeRatio : 0.0);
  const safe = (lastBuildPack.driver.name || 'Projeto').replace(/[^a-zA-Z0-9_-]+/g, '_').slice(0, 36);
  const blob = new Blob([obj], { type: 'text/plain;charset=utf-8' });
  const a = document.createElement('a');
  a.download = `BassForge_3D_${safe}.obj`;
  a.href = URL.createObjectURL(blob);
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1500);
  return true;
}

/**
 * Gera macro autocontida (.FCMacro) para FreeCAD 1.1+ (Qt6/PySide6 & OpenCASCADE B-Rep)
 * com o BuildPack PGS embutido — suporta montagem montada ou explodida + auditoria booleana 3D.
 */
function buildFreeCadMacroString(pack, explodeRatio = 0.0) {
  if (!pack || !pack.geometry) return '';
  const safeDoc = (pack.driver && pack.driver.name ? pack.driver.name : 'BassForge').replace(/[^a-zA-Z0-9_]+/g, '_').slice(0, 32);
  // PRO-05: Sanitiza docstring Python contra quebra de """ e injeção de código
  const safeTitle = String(pack.driver && pack.driver.name ? pack.driver.name : 'Projeto')
    .replace(/"""/g, "''")
    .replace(/[\r\n]+/g, ' ')
    .slice(0, 120);
  const safeTopo = String(pack.acoustics ? pack.acoustics.boxType : 'custom')
    .replace(/"""/g, "''")
    .replace(/[\r\n]+/g, ' ');
  // PRO-12: Sanitiza NaN/Infinity no payload JSON antes de emitir a macro
  const jsonPayload = JSON.stringify(pack, (k, v) => (typeof v === 'number' && !Number.isFinite(v)) ? 0 : v)
    .replace(/'''/g, "\\u0027\\u0027\\u0027");
  const expVal = Math.max(0, Math.min(1, Number(explodeRatio) || 0)).toFixed(2);
  return `"""
BassForge SUITE — Macro Autocontida FreeCAD 1.1+ (PGS bassforge-pgs/v1)
Projeto: ${safeTitle} | Topologia: ${safeTopo}
"""
import json
import math
import FreeCAD
import Part

HAS_GUI = bool(getattr(FreeCAD, "GuiUp", False))
if HAS_GUI:
    import FreeCADGui

PACK_JSON = r'''${jsonPayload}'''
EXPLODE_RATIO = ${expVal}

def pgs_vec(px, py, pz):
    return FreeCAD.Vector(float(px), float(pz), float(py))

def make_box(x0, y0, z0, dx, dy, dz):
    if dx <= 0.05 or dy <= 0.05 or dz <= 0.05:
        return None
    return Part.makeBox(float(dx), float(dz), float(dy), pgs_vec(x0, y0, z0))

def make_tube(cx, cy, z0, r_out, r_in, length, axis_vec=None):
    if r_out <= 0.5 or length <= 0.5:
        return None
    base = pgs_vec(cx, cy, z0)
    axis = axis_vec if axis_vec is not None else FreeCAD.Vector(0.0, 1.0, 0.0)
    outer = Part.makeCylinder(float(r_out), float(length), base, axis)
    off = FreeCAD.Vector(-axis.x, -axis.y, -axis.z)
    inner = Part.makeCylinder(max(0.5, min(float(r_out) - 0.5, float(r_in))), float(length) + 2.0, base.add(off), axis)
    return outer.cut(inner)

def make_elbow_90(cx, cy, z_start, r_out, r_in, r_elb, dir_x):
    R = max(float(r_out) * 1.15, float(r_elb))
    ri = max(0.5, min(float(r_out) - 0.5, float(r_in)))
    xc = float(cx) + float(dir_x) * R
    zc = float(z_start)
    # Torus no plano XZ (PGS) => plano XY (FreeCAD), eixo de revolucao = Z_fc (Y_pgs)
    center = pgs_vec(xc, float(cy), zc)
    axis = FreeCAD.Vector(0.0, 0.0, 1.0)
    t_out = Part.makeTorus(R, float(r_out), center, axis, -180.0, 180.0, 90.0)
    t_in = Part.makeTorus(R, ri, center, axis, -180.0, 180.0, 90.0)
    if float(dir_x) > 0:
        t_out.rotate(center, axis, 180.0)
        t_in.rotate(center, axis, 180.0)
    else:
        t_out.rotate(center, axis, -90.0)
        t_in.rotate(center, axis, -90.0)
    return t_out.cut(t_in)

def make_trapezoid_side(x0, y0, z_rear_bot, z_rear_top, z_front, B, t):
    pts = [pgs_vec(x0, y0, z_rear_bot), pgs_vec(x0, y0, z_front), pgs_vec(x0, y0 + B, z_front), pgs_vec(x0, y0 + B, z_rear_top)]
    pts.append(pts[0])
    return Part.Face(Part.makePolygon(pts)).extrude(FreeCAD.Vector(float(t), 0.0, 0.0))

def make_trapezoid_rear(x0, y0, z_rear_bot, z_rear_top, F, B, t):
    pts = [pgs_vec(x0, y0, z_rear_bot - t), pgs_vec(x0, y0, z_rear_bot), pgs_vec(x0, y0 + B, z_rear_top), pgs_vec(x0, y0 + B, z_rear_top - t)]
    pts.append(pts[0])
    return Part.Face(Part.makePolygon(pts)).extrude(FreeCAD.Vector(float(F), 0.0, 0.0))

def make_trapezoid_batten(x0, y0, z_rear_bot, z_rear_top, dx, B, t):
    pts = [pgs_vec(x0, y0, z_rear_bot), pgs_vec(x0, y0, z_rear_bot + t), pgs_vec(x0, y0 + B, z_rear_top + t), pgs_vec(x0, y0 + B, z_rear_top)]
    pts.append(pts[0])
    return Part.Face(Part.makePolygon(pts)).extrude(FreeCAD.Vector(float(dx), 0.0, 0.0))

def make_window_brace(x0, y0, z_rb, z_rt, z_fr, B, t, is_trap, hole_dia):
    sh = make_trapezoid_side(x0, y0, z_rb, z_rt, z_fr, B, t) if is_trap else make_box(x0, y0, z_rb, t, B, max(10.0, z_fr - z_rb))
    if not sh:
        return None
    r = max(12.0, min(float(hole_dia) / 2.0, B * 0.13, max(20.0, z_fr - z_rt) * 0.18))
    specs = [(0.78, [0.52]), (0.48, [0.32, 0.72]), (0.20, [0.30, 0.72])] if is_trap else [(0.80, [0.30, 0.70]), (0.50, [0.30, 0.70]), (0.20, [0.30, 0.70])]
    for fy, zf in specs:
        cy, zr = y0 + fy * B, z_rb + fy * (z_rt - z_rb)
        sp = max(10.0, z_fr - zr)
        for fz in zf:
            cz = zr + fz * sp
            if cz - r > zr + 10.0 and cz + r < z_fr - 10.0:
                sh = sh.cut(Part.makeCylinder(r, t + 4.0, pgs_vec(x0 - 2.0, cy, cz), FreeCAD.Vector(1.0, 0.0, 0.0)))
    return sh

def make_br_tri_walls(ox, oy, z_front_inner, A, B, lv, ta, tb, t, cidxs):
    walls = []
    if lv <= 1.0 or ta <= 1.0 or tb <= 1.0:
        return walls
    z0 = max(t, z_front_inner - lv)
    z_len = max(1.0, z_front_inner - z0)
    clip = make_box(ox, oy, z0, A, B, z_len)
    all_c = [((ox, oy + tb), (ox + ta, oy), (tb, ta)), ((ox + A - ta, oy), (ox + A, oy + tb), (-tb, ta)), ((ox, oy + B - tb), (ox + ta, oy + B), (tb, -ta)), ((ox + A - ta, oy + B), (ox + A, oy + B - tb), (-tb, -ta))]
    for i, ci in enumerate([int(c) % 4 for c in (cidxs or [0, 1])]):
        (x1, y1), (x2, y2), (nx, ny) = all_c[ci]
        nl = max(1e-6, math.hypot(nx, ny))
        ux, uy = (nx / nl) * t, (ny / nl) * t
        pts = [pgs_vec(x1, y1, z0), pgs_vec(x2, y2, z0), pgs_vec(x2 + ux, y2 + uy, z0), pgs_vec(x1 + ux, y1 + uy, z0)]
        pts.append(pts[0])
        sh = Part.Face(Part.makePolygon(pts)).extrude(FreeCAD.Vector(0.0, float(z_len), 0.0))
        sh = sh.common(clip) if clip else sh
        if sh and sh.Volume > 10.0:
            walls.append((f"P_PORT_TRI_{i + 1}", sh))
    return walls

def make_planar_chamfers(ox_box, oy_box, z0, A, B, z_len, zl, t):
    walls = []
    if zl <= 1.0 or z_len <= 1.0:
        return walls
    inner_clip = make_box(ox_box, oy_box, z0, A, B, z_len)
    diag = [
        ((ox_box, oy_box + zl), (ox_box + zl, oy_box), (1.0, 1.0)),
        ((ox_box + A - zl, oy_box), (ox_box + A, oy_box + zl), (-1.0, 1.0)),
        ((ox_box, oy_box + B - zl), (ox_box + zl, oy_box + B), (1.0, -1.0)),
        ((ox_box + A - zl, oy_box + B), (ox_box + A, oy_box + B - zl), (-1.0, -1.0)),
    ]
    inv = 1.0 / math.sqrt(2.0)
    for idx, ((x1, y1), (x2, y2), (nx, ny)) in enumerate(diag):
        ux, uy = nx * inv * t, ny * inv * t
        pts = [
            pgs_vec(x1, y1, z0),
            pgs_vec(x2, y2, z0),
            pgs_vec(x2 - ux, y2 - uy, z0),
            pgs_vec(x1 - ux, y1 - uy, z0),
        ]
        pts.append(pts[0])
        face = Part.Face(Part.makePolygon(pts))
        prism = face.extrude(FreeCAD.Vector(0.0, float(z_len), 0.0))
        clipped = prism.common(inner_clip) if inner_clip else prism
        if clipped and clipped.Volume > 10.0:
            walls.append((f"P_PLANAR_CHAMFER_{idx + 1}", clipped))
    return walls

def build_all():
    pack = json.loads(PACK_JSON)
    geom = pack["geometry"]
    env = geom["envelope"]
    ac = pack.get("acoustics") or {}
    t = float(geom["material"]["thickness"])
    F, E, A, B, D_ext = float(env["F"]), float(env["E"]), float(env["A"]), float(env["B"]), float(env["D_ext"])
    parts = geom.get("parts") or []
    cutouts = geom.get("cutouts") or []

    doc = FreeCAD.newDocument("BassForge_${safeDoc}")
    solids = []

    def add_solid(name, kind, shape, p_meta, rgb, transp=0):
        if shape is None:
            return
        ed = (p_meta.get("explodeDir") if p_meta else None) or [0, 0, 0]
        dist = float((p_meta.get("explodeDist") if p_meta else 0.0) or 0.0)
        obj = doc.addObject("Part::Feature", name)
        obj.Shape = shape
        try:
            obj.addProperty("App::PropertyVector", "BF_ExplodeVec", "BassForge", "Vetor de explosao 3D (mm)")
            obj.BF_ExplodeVec = pgs_vec(ed[0] * dist, ed[1] * dist, ed[2] * dist)
            if EXPLODE_RATIO > 0.001:
                obj.Placement.Base = pgs_vec(ed[0] * dist * EXPLODE_RATIO, ed[1] * dist * EXPLODE_RATIO, ed[2] * dist * EXPLODE_RATIO)
        except Exception:
            if EXPLODE_RATIO > 0.001:
                sh_c = shape.copy()
                sh_c.translate(pgs_vec(ed[0] * dist * EXPLODE_RATIO, ed[1] * dist * EXPLODE_RATIO, ed[2] * dist * EXPLODE_RATIO))
                obj.Shape = sh_c
        if HAS_GUI and hasattr(obj, "ViewObject") and obj.ViewObject:
            try:
                obj.ViewObject.ShapeColor = rgb
                obj.ViewObject.Transparency = int(transp)
            except Exception:
                pass
        solids.append((name, kind, obj))

    MDF_MAIN = (0.82, 0.67, 0.46)
    MDF_SIDE = (0.76, 0.60, 0.40)
    MDF_FRONT = (0.86, 0.72, 0.52)
    BATTEN_COL = (0.28, 0.56, 0.90)
    PORT_COL = (0.95, 0.45, 0.14)
    DIV_COL = (0.58, 0.36, 0.88)

    is_trap = (env.get("shape") == "trapezoidal" and abs(float(env.get("D", 0)) - float(env.get("C", 0))) > 0.5)
    z_rb, z_rt = t, t + max(0.0, float(env.get("D", D_ext - 2 * t)) - float(env.get("C", D_ext - 2 * t)))
    has_cross = any((pp.get("braceMeta") or {}).get("code") == "CROSS" for pp in parts)
    has_tb = any((pp.get("braceMeta") or {}).get("code") == "TB" for pp in parts)
    is_inv = (ac.get("mountMode") == "inverted")
    drv_fc = [dc for dc in cutouts if dc.get("kind") == "driver" and dc.get("partId") == "P_FRONT_BAFFLE" and dc.get("dia")]
    max_dd = max((float(dc["dia"]) for dc in drv_fc), default=0.0)
    drv_ko = []
    if not is_inv:
        for dc in drv_fc:
            dcx, dcy, dd = t + float(dc["xInt"]), t + float(dc["yInt"]), float(dc["dia"])
            db = min(max(40.0, D_ext - 2.0 * t - 25.0), min(110.0, dd * 0.28))
            dm = min(max(60.0, D_ext - 2.0 * t - 30.0), dd * 0.56)
            drv_ko.append(Part.makeCylinder(dd * 0.50 + 10.0, db + 2.0, pgs_vec(dcx, dcy, D_ext - t - db), FreeCAD.Vector(0.0, 1.0, 0.0)))
            drv_ko.append(Part.makeCylinder(dd * 0.34 + 15.0, dm + 2.0, pgs_vec(dcx, dcy, D_ext - t - dm), FreeCAD.Vector(0.0, 1.0, 0.0)))
    def cut_ko(sh):
        for dk in drv_ko:
            try:
                if sh and sh.BoundBox.intersect(dk.BoundBox):
                    sh = sh.cut(dk)
            except Exception:
                pass
        return sh
    cx0 = F / 2.0 - t / 2.0
    if not is_inv:
        for dc in drv_fc:
            dcx, rc = t + float(dc["xInt"]), float(dc["dia"]) * 0.50 + 18.0
            if abs((cx0 + t / 2.0) - dcx) < rc:
                if dcx - rc - t >= t + 30.0: cx0 = dcx - rc - t
                elif dcx + rc + t <= F - t - 30.0: cx0 = dcx + rc
                else: cx0 = t + 35.0
    tbx0 = t + A * 0.14 - 25.0
    if has_cross and abs((tbx0 + 25.0) - (cx0 + t / 2.0)) < 45.0:
        tbx0 = F - t - A * 0.14 - 25.0
    z_ry = lambda ya: z_rb + max(0.0, min(1.0, (ya - t) / max(1.0, B))) * (z_rt - z_rb)
    wa_cfg = (ac.get("vehicleFit") or {}).get("wheelArch")
    wa_cuts, wa_p = [], None
    if wa_cfg:
        wa_K, wa_J, wa_H = min(float(wa_cfg.get("K", 120.0)), A * 0.30), min(float(wa_cfg.get("J", 180.0)), B * 0.65), min(float(wa_cfg.get("H", 260.0)), max(60.0, (D_ext - 2.0 * t) * 0.78))
        wa_z0 = (D_ext - wa_H) / 2.0
        wa_p = (wa_K, wa_J, wa_H, wa_z0)
        wa_cuts = [make_box(-1.0, -1.0, wa_z0, wa_K + 1.0, wa_J + 1.0, wa_H), make_box(F - wa_K, -1.0, wa_z0, wa_K + 1.0, wa_J + 1.0, wa_H)]
    def cut_wa(sh):
        for wc in wa_cuts:
            if sh and wc:
                sh = sh.cut(wc)
        return sh

    for p in sorted(parts, key=lambda x: x.get("assemblyOrder", 5)):
        pid, kind = p["id"], p["kind"]
        ox, oy, oz = p["origin"]
        dx, dy, dz = p["size"]

        if pid == "P_BASE" and wa_cuts:
            add_solid(pid, "mdf", cut_wa(make_box(ox, oy, oz, dx, dy, dz)), p, MDF_MAIN)
            continue

        if pid == "P_REAR" and is_trap:
            add_solid("P_REAR", "mdf", cut_wa(make_trapezoid_rear(0.0, t, z_rb, z_rt, F, B, t)), p, MDF_MAIN)
            continue

        if pid == "P_SIDES":
            dy_l = dy + t if p.get("leftTopExtend") else dy
            dy_r = dy + t if p.get("rightTopExtend") else dy
            s_l = make_trapezoid_side(0.0, oy, z_rb, z_rt, oz + dz, dy_l, t) if is_trap else make_box(ox, oy, oz, dx, dy_l, dz)
            s_r = make_trapezoid_side(F - t, oy, z_rb, z_rt, oz + dz, dy_r, t) if is_trap else make_box(F - t, oy, oz, dx, dy_r, dz)
            # CAD-04: Furos Side-Firing reais na lateral direita (P_SIDE_RIGHT)
            for c in cutouts:
                if s_r and (c.get("partId") == "P_SIDES" or c.get("panel") == "lateral_dir"):
                    cz_s = (z_rt if is_trap else t) + float(c["xInt"])
                    cy_s = t + float(c["yInt"])
                    if c.get("shape") == "round" and c.get("dia"):
                        cyl_s = Part.makeCylinder(float(c["dia"]) / 2.0, t + 4.0, pgs_vec(F - t - 2.0, cy_s, cz_s), FreeCAD.Vector(1.0, 0.0, 0.0))
                        s_r = s_r.cut(cyl_s)
                    elif c.get("shape") == "slot" and c.get("w") and c.get("h"):
                        sb_s = make_box(F - t - 2.0, cy_s - float(c["h"]) / 2.0, cz_s - float(c["w"]) / 2.0, t + 4.0, float(c["h"]), float(c["w"]))
                        if sb_s:
                            s_r = s_r.cut(sb_s)
            add_solid("P_SIDE_LEFT", "mdf", cut_wa(s_l), p, MDF_SIDE)
            p_r = dict(p, explodeDir=[1, 0, 0])
            add_solid("P_SIDE_RIGHT", "mdf", cut_wa(s_r), p_r, MDF_SIDE)
            continue

        if pid == "P_MATRIX_V" and p.get("matrixMeta"):
            mm = p["matrixMeta"]
            cm, rm, z_fm, z_mm = max(2, int(mm.get("cols", 2))), max(1, int(mm.get("rows", 1))), D_ext - t, (z_rt + D_ext - t) / 2.0
            for k in range(1, cm):
                xk = t + k * (A / cm) - t / 2.0
                sv = make_trapezoid_side(xk, t, z_rb, z_rt, z_fm, B, t) if is_trap else make_box(xk, t, t, t, B, z_fm - t)
                for j in range(1, rm):
                    yj = t + j * (B / rm) - t / 2.0
                    sv = sv.cut(make_box(xk - 1.0, yj, z_rb - 1.0, t + 2.0, t, z_mm - (z_rb - 1.0)))
                add_solid(f"P_MATRIX_V_{k}", "divider", cut_wa(sv), p, DIV_COL)
            continue

        if pid == "P_MATRIX_H" and p.get("matrixMeta"):
            mm = p["matrixMeta"]
            cm, rm, z_fm, z_mm = max(1, int(mm.get("cols", 1))), max(2, int(mm.get("rows", 2))), D_ext - t, (z_rt + D_ext - t) / 2.0
            for j in range(1, rm):
                yj = t + j * (B / rm) - t / 2.0
                zsh = z_ry(yj + t)
                sh = make_box(t, yj, zsh, A, t, max(10.0, z_fm - zsh))
                for k in range(1, cm):
                    xk = t + k * (A / cm) - t / 2.0
                    sh = sh.cut(make_box(xk, yj - 1.0, z_mm, t, t + 2.0, (z_fm + 1.0) - z_mm))
                add_solid(f"P_MATRIX_H_{j}", "divider", cut_wa(sh), p, DIV_COL)
            continue

        if pid == "P_WHEEL_ARCH" and wa_p:
            wa_K, wa_J, wa_H, wa_z0 = wa_p
            ib = make_box(t, t, t, A, B, D_ext - 2.0 * t)
            for sn, xi, xc in [("P_WHEEL_ARCH_L", t, 0.0), ("P_WHEEL_ARCH_R", F - wa_K - t, F - wa_K)]:
                cp = make_box(xi, t, wa_z0 - t, wa_K, wa_J, wa_H + 2.0 * t).cut(make_box(xc, 0.0, wa_z0, wa_K, wa_J, wa_H))
                add_solid(sn, "divider", cp.common(ib) if ib else cp, p, DIV_COL)
            continue

        if pid == "P_TOP":
            tpanels = [("P_TOP_L", float(p["topSplit"]["xLeft"])), ("P_TOP_R", float(p["topSplit"]["xRight"]))] if p.get("topSplit") else [(pid, ox)]
            for tn, tx0 in tpanels:
                ts = make_box(tx0, oy, oz, dx, dy, dz)
                for c in cutouts:
                    if ts and c.get("partId") == "P_TOP" and c.get("shape") == "round" and c.get("dia"):
                        cx, cz = t + float(c["xInt"]), (z_rt if is_trap else t) + float(c["yInt"])
                        if tx0 - 1.0 <= cx <= tx0 + dx + 1.0:
                            ts = ts.cut(Part.makeCylinder(float(c["dia"]) / 2.0, dy + 4.0, pgs_vec(cx, oy - 2.0, cz), FreeCAD.Vector(0.0, 0.0, 1.0)))
                add_solid(tn, "mdf", ts, p, MDF_MAIN, transp=55)
            continue

        if pid == "P_PLANAR_DIV" and p.get("splitByCenterDiv"):
            sp = p["splitByCenterDiv"]
            add_solid("P_PLANAR_DIV_L", "divider", make_box(float(sp["xLeft"]), oy, oz, dx, dy, dz), p, DIV_COL)
            add_solid("P_PLANAR_DIV_R", "divider", make_box(float(sp["xRight"]), oy, oz, dx, dy, dz), p, DIV_COL)
            continue

        if pid == "P_PLANAR_CHAMFER":
            pg = ac.get("planarGeom") or {}
            zl = float(pg.get("Z_leg") or 0.0)
            z_len = max(10.0, float(D_ext - oz))
            if p.get("dualPlanarTri"):
                sub_a = (A - t) / 2.0
                for si, sx0 in enumerate([t, t + sub_a + t]):
                    for cname, cshape in make_planar_chamfers(sx0, t, oz, sub_a, B, z_len, min(zl, sub_a * 0.28), t):
                        add_solid(f"{cname}_{si + 1}", "divider", cshape, p, DIV_COL)
            else:
                for cname, cshape in make_planar_chamfers(t, t, oz, A, B, z_len, zl, t):
                    add_solid(cname, "divider", cshape, p, DIV_COL)
            continue

        if pid == "P_FRONT_BAFFLE":
            panels = [("P_FRONT_BAFFLE_L", float(p["frontSplit"]["xLeft"])), ("P_FRONT_BAFFLE_R", float(p["frontSplit"]["xRight"]))] if p.get("frontSplit") else [(pid, ox)]
            for pname, px0 in panels:
                shape = make_box(px0, oy, oz, dx, dy, dz)
                pg = ac.get("planarGeom")
                if shape and pg and pg.get("style") == "triangle" and pg.get("Z_leg"):
                    zl = min(float(pg["Z_leg"]), dx * 0.28) if p.get("frontSplit") else float(pg["Z_leg"])
                    for tri in [
                        [(px0 - 1, oy - 1), (px0 + zl, oy - 1), (px0 - 1, oy + zl)],
                        [(px0 + dx + 1, oy - 1), (px0 + dx - zl, oy - 1), (px0 + dx + 1, oy + zl)],
                        [(px0 - 1, oy + dy + 1), (px0 + zl, oy + dy + 1), (px0 - 1, oy + dy - zl)],
                        [(px0 + dx + 1, oy + dy + 1), (px0 + dx - zl, oy + dy + 1), (px0 + dx + 1, oy + dy - zl)],
                    ]:
                        pts = [pgs_vec(x, y, oz - 2.0) for (x, y) in tri]
                        pts.append(pts[0])
                        shape = shape.cut(Part.Face(Part.makePolygon(pts)).extrude(FreeCAD.Vector(0.0, dz + 4.0, 0.0)))
                for c in cutouts:
                    if c.get("partId") != "P_FRONT_BAFFLE":
                        continue
                    cx, cy = t + float(c["xInt"]), t + float(c["yInt"])
                    if p.get("frontSplit") and (cx < px0 - 1.0 or cx > px0 + dx + 1.0):
                        continue
                    if c["shape"] == "round" and c.get("dia"):
                        cyl = Part.makeCylinder(float(c["dia"]) / 2.0, dz + 4.0, pgs_vec(cx, cy, oz - 2.0), FreeCAD.Vector(0.0, 1.0, 0.0))
                        shape = shape.cut(cyl)
                    elif c["shape"] == "slot" and c.get("w") and c.get("h") and not p.get("frontSplit"):
                        sb = make_box(cx - float(c["w"]) / 2.0, cy - float(c["h"]) / 2.0, oz - 2.0, float(c["w"]), float(c["h"]), dz + 4.0)
                        if sb:
                            shape = shape.cut(sb)
                    elif c["shape"] == "triangle" and c.get("triA") and c.get("triB"):
                        ta, tb, ci = float(c["triA"]), float(c["triB"]), c.get("cornerIdx")
                        tc = [[(t, t), (t + ta, t), (t, t + tb)], [(t + A, t), (t + A - ta, t), (t + A, t + tb)], [(t, t + B), (t + ta, t + B), (t, t + B - tb)], [(t + A, t + B), (t + A - ta, t + B), (t + A, t + B - tb)]]
                        pts = [pgs_vec(px, py, oz - 2.0) for (px, py) in tc[int(ci or 0) % 4]]
                        pts.append(pts[0])
                        shape = shape.cut(Part.Face(Part.makePolygon(pts)).extrude(FreeCAD.Vector(0.0, dz + 4.0, 0.0)))
                add_solid(pname, "mdf", shape, p, MDF_FRONT)
            continue

        if pid in ("P_BP_DIVIDER", "P_BP_DIVIDER_1", "P_BP_DIVIDER_2", "P_CENTER_DIV"):
            shape = make_trapezoid_side(ox, oy, z_rb, z_rt, oz + dz, dy, t) if is_trap else make_box(ox, oy, oz, dx, dy, dz)
            for c in cutouts:
                if c.get("partId") == pid and c.get("dia"):
                    r = float(c["dia"]) / 2.0
                    cz, cy = (z_rt if is_trap else t) + float(c["xInt"]), t + float(c["yInt"])
                    cyl = Part.makeCylinder(r, dx + 4.0, pgs_vec(ox - 2.0, cy, cz), FreeCAD.Vector(1.0, 0.0, 0.0))
                    shape = shape.cut(cyl)
            add_solid(pid, "divider", shape, p, DIV_COL)
            continue

        if kind == "port" and p.get("sharedCenterSlot"):
            sc = p["sharedCenterSlot"]
            add_solid(f"{pid}_L", "port", make_box(float(sc["xLeft"]), oy, oz, dx, dy, dz), p, PORT_COL)
            add_solid(f"{pid}_R", "port", make_box(float(sc["xRight"]), oy, oz, dx, dy, dz), p, PORT_COL)
            continue

        if kind == "port" and p.get("bpTopRound"):
            r_out = dx / 2.0
            wall = max(1.5, float(p.get("thickness", 1.5)))
            port_off = float(ac.get("portOffsetMm") or 0.0)
            is_rear = (pid == "P_PORT_REAR")
            th = [c for c in cutouts if c.get("kind") == "port" and c.get("shape") == "round" and c.get("partId") == "P_TOP" and (("Traseir" in c.get("label", "")) == is_rear)]
            if not th and not is_rear:
                th = [c for c in cutouts if c.get("kind") == "port" and c.get("shape") == "round" and c.get("partId") == "P_TOP"]
            for idx, ch in enumerate(th):
                cx, cz, lv = t + float(ch["xInt"]), (z_rt if is_trap else t) + float(ch["yInt"]), float(ch.get("lvMm") or dy)
                add_solid(f"{pid}_{idx + 1}", "port", make_tube(cx, max(t, E + port_off - lv), cz, r_out, r_out - wall, lv, FreeCAD.Vector(0.0, 0.0, 1.0)), p, PORT_COL)
            continue

        if kind == "port" and p.get("splitByCenterDiv"):
            sp = p["splitByCenterDiv"]
            add_solid("P_PORT_SLOT_L", "port", make_box(float(sp["xLeft"]), oy, oz, dx, dy, dz), p, PORT_COL)
            add_solid("P_PORT_SLOT_R", "port", make_box(float(sp["xRight"]), oy, oz, dx, dy, dz), p, PORT_COL)
            continue

        if kind == "port" and p.get("triMeta"):
            tm = p["triMeta"]
            port_off = float(ac.get("portOffsetMm") or 0.0)
            for wn, ws in make_br_tri_walls(t, t, D_ext + port_off, A, B, float(tm.get("lvMm") or dz), float(tm.get("triA") or 140.0), float(tm.get("triB") or 140.0), t, tm.get("corners")):
                add_solid(wn, "port", ws, p, PORT_COL)
            continue

        if pid == "P_PORT_SERIES":
            r_out = dy / 2.0
            wall = max(1.5, float(p.get("thickness", 1.5)))
            bp_c = ac.get("bpChambers") or {}
            div_x = (t + float(bp_c["A_rear_side"])) if (bp_c.get("dualDiv") and bp_c.get("A_rear_side")) else ((t + float(bp_c["A_rear"])) if bp_c.get("A_rear") else (F / 2.0 - t / 2.0))
            for idx, ch in enumerate([c for c in cutouts if c.get("partId") in ("P_BP_DIVIDER", "P_BP_DIVIDER_1") and c.get("kind") == "port"]):
                cz, cy, lv = (z_rt if is_trap else t) + float(ch["xInt"]), t + float(ch["yInt"]), float(ch.get("lvMm") or dx)
                x0 = max(t, div_x - lv)
                add_solid(f"{pid}_{idx + 1}", "port", make_tube(x0, cy, cz, r_out, r_out - wall, max(5.0, div_x - x0), FreeCAD.Vector(1.0, 0.0, 0.0)), p, PORT_COL)
            continue

        if kind == "port" and float(p.get("area", 0)) <= 0.0:
            wall = max(1.5, float(p.get("thickness", 1.5)))
            port_off = float(ac.get("portOffsetMm") or 0.0)
            routing_fc = str(ac.get("portRouting") or "straight")
            rp_fc = ac.get("portRoutePlan") or {}
            is_rear = (pid == "P_PORT_REAR")
            if routing_fc == "side_firing" or p.get("sideFiring"):
                # CAD-04 & CAD-14: Duto(s) cilíndrico(s) Side-Firing ao longo do eixo -X
                r_out = (dy if p.get("sideFiring") else dx) / 2.0
                lv_def = dx if p.get("sideFiring") else dz
                side_holes = [c for c in cutouts if c.get("kind") == "port" and c.get("shape") == "round" and (c.get("partId") == "P_SIDES" or c.get("panel") == "lateral_dir")]
                if side_holes:
                    for idx, ch in enumerate(side_holes):
                        lv = float(ch.get("lvMm") or lv_def)
                        x_start = max(t, F - t + port_off - lv)
                        cy, cz = t + float(ch["yInt"]), (z_rt if is_trap else t) + float(ch["xInt"])
                        add_solid(f"{pid}_SIDE_{idx + 1}", "port", make_tube(x_start, cy, cz, r_out, r_out - wall, lv, FreeCAD.Vector(1.0, 0.0, 0.0)), p, PORT_COL)
                else:
                    x_start = max(t, F - t + port_off - lv_def)
                    add_solid(f"{pid}_SIDE_1", "port", make_tube(x_start, oy + r_out, oz + r_out, r_out, r_out - wall, lv_def, FreeCAD.Vector(1.0, 0.0, 0.0)), p, PORT_COL)
                continue
            r_out = dx / 2.0
            port_holes = [c for c in cutouts if c.get("kind") == "port" and c.get("shape") == "round" and c.get("partId") == "P_FRONT_BAFFLE" and (("Traseir" in c.get("label", "")) == is_rear)]
            if not port_holes and not is_rear:
                port_holes = [c for c in cutouts if c.get("kind") == "port" and c.get("shape") == "round" and c.get("partId") == "P_FRONT_BAFFLE"]
            if routing_fc == "l_bend" and float(rp_fc.get("l2Mm") or 0.0) >= 10.0 and port_holes:
                # CAD-14: Duto cilíndrico em L (90°) — Trecho 1 (+Z) + Joelho 90° + Trecho 2 (-X)
                l1 = max(40.0, float(rp_fc.get("l1Mm") or 80.0))
                l2 = max(10.0, float(rp_fc.get("l2Mm") or 40.0))
                r_elb = max(r_out * 1.15, float(rp_fc.get("rElbow") or r_out * 1.6))
                z_back = max(t + r_elb + r_out, D_ext + port_off - l1)
                for idx, ch in enumerate(port_holes):
                    cx, cy = t + float(ch["xInt"]), t + float(ch["yInt"])
                    dir_x = 1.0 if cx <= F / 2.0 else -1.0
                    add_solid(f"{pid}_L1_{idx + 1}", "port", make_tube(cx, cy, z_back, r_out, r_out - wall, l1), p, PORT_COL)
                    add_solid(f"{pid}_ELBOW_{idx + 1}", "port", make_elbow_90(cx, cy, z_back, r_out, r_out - wall, r_elb, dir_x), p, PORT_COL)
                    x_start_l2 = (cx + r_elb) if dir_x > 0 else (cx - r_elb - l2)
                    add_solid(f"{pid}_L2_{idx + 1}", "port", make_tube(x_start_l2, cy, z_back - r_elb, r_out, r_out - wall, l2, FreeCAD.Vector(1.0, 0.0, 0.0)), p, PORT_COL)
            else:
                for idx, ch in enumerate(port_holes):
                    cx, cy = t + float(ch["xInt"]), t + float(ch["yInt"])
                    lv = float(ch.get("lvMm") or dz)
                    z_start = max(t, D_ext + port_off - lv)
                    add_solid(f"{pid}_{idx + 1}", "port", make_tube(cx, cy, z_start, r_out, r_out - wall, lv), p, PORT_COL)
            continue

        if kind == "batten":
            bm = p.get("braceMeta")
            if bm and bm.get("code"):
                bc = bm["code"]
                cc = make_box(cx0 - 0.05, t - 1.0, t - 1.0, t + 0.1, B + 2.0, D_ext) if has_cross else None
                tc = make_box(tbx0 - 0.05, t - 1.0, t - 1.0, 50.1, B + 2.0, D_ext) if has_tb else None
                sb = None
                if bc == "CROSS":
                    sb = make_window_brace(cx0, t, z_rb, z_rt, D_ext - t, B, t, is_trap, float(bm.get("holeDiaMm") or 80.0))
                elif bc == "TB":
                    sb = make_trapezoid_batten(tbx0, t, z_rb, z_rt, 50.0, B, t) if is_trap else make_box(tbx0, t, t, 50.0, B, t)
                elif bc == "LR":
                    zlr = (z_rt + D_ext - t) / 2.0
                    if max_dd > 0 and not is_inv:
                        zlr = max(z_rt + t + 12.0, min(zlr, (D_ext - t) - min(max(60.0, D_ext - 2.0 * t - 45.0), max_dd * 0.56) - t))
                    sb = make_box(t, t + B * 0.5 - 25.0, zlr - t / 2.0, A, 50.0, t)
                    if sb and cc: sb = sb.cut(cc)
                elif bc == "FF":
                    zf = z_ry(t + 20.0 + t) + t
                    xff = t + A * 0.78 - 25.0
                    if not is_inv:
                        for dc in drv_fc:
                            if math.hypot((xff + 25.0) - (t + float(dc["xInt"])), (t + 20.0 + t * 0.5) - (t + float(dc["yInt"]))) < float(dc["dia"]) * 0.50 + 35.0:
                                xff = F - t - 58.0
                    sb = make_box(xff, t + 20.0, zf, 50.0, t, max(20.0, (D_ext - t) - zf))
                elif bc == "BAFFLE":
                    sb = make_box(t, E - t - 50.0, D_ext - 2.0 * t, A, 50.0, t)
                    if sb and cc: sb = sb.cut(cc)
                elif bc == "REAR":
                    yr = t + B * 0.22 - 25.0
                    sb = make_box(t, yr, z_ry(yr + 50.0) + t, A, 50.0, t)
                    if sb and cc: sb = sb.cut(cc)
                    if sb and tc: sb = sb.cut(tc)
                add_solid(pid, "batten", cut_ko(cut_wa(sb)), p, BATTEN_COL)
                continue
            qty = max(1, int(p.get("qty", 1)))
            bp_ch = ac.get("bpChambers")
            bp_slot_w = float(bp_ch.get("slotWidthMm") or 60.0) if (bp_ch and bp_ch.get("isBpSlot")) else 0.0
            pad_l = (bp_slot_w + t) if (bp_ch and bp_ch.get("isBpSlot") and bp_ch.get("isBp6Parallel")) else 0.0
            pad_r = (bp_slot_w + t) if (bp_ch and bp_ch.get("isBpSlot")) else 0.0
            if bp_ch and bp_ch.get("dualDiv") and bp_ch.get("A_rear_side"):
                a_rs = float(bp_ch["A_rear_side"])
                a_fr = float(bp_ch.get("A_front") or max(60.0, A - 2 * t - 2 * a_rs))
                xs = [
                    t + pad_l + max(dx / 2.0, (a_rs - pad_l) / 2.0) - dx / 2.0,
                    t + a_rs + t + a_fr / 2.0 - dx / 2.0,
                    t + a_rs + t + a_fr + t + max(dx / 2.0, (a_rs - pad_r) / 2.0) - dx / 2.0,
                ][:qty]
            elif bp_ch and bp_ch.get("A_rear"):
                a_rear = float(bp_ch["A_rear"])
                a_front = max(60.0, A - t - a_rear)
                q_rear = max(1, min(qty - 1, int(round(qty * a_rear / max(1.0, A - t))))) if qty > 1 else 1
                q_front = max(0, qty - q_rear)
                ar_eff = max(dx + 4.0, a_rear - pad_l)
                af_eff = max(dx + 4.0, a_front - pad_r)
                max_qf = max(1, int(af_eff // (dx + 8.0)) - 1)
                max_qr = max(1, int(ar_eff // (dx + 8.0)) - 1)
                q_front = min(q_front, max_qf)
                q_rear = min(max(1, qty - q_front), max_qr)
                xs = [t + pad_l + ((i + 1) / (q_rear + 1)) * ar_eff - dx / 2.0 for i in range(q_rear)]
                xs += [t + a_rear + t + ((j + 1) / (q_front + 1)) * af_eff - dx / 2.0 for j in range(q_front)]
            elif ac.get("hasCenterDiv"):
                half_a = (A - t) / 2.0
                q_l, q_r = max(1, qty // 2), max(0, qty - max(1, qty // 2))
                xs = [t + ((i + 1) / (q_l + 1)) * half_a - dx / 2.0 for i in range(q_l)]
                xs += [t + half_a + t + ((j + 1) / (q_r + 1)) * half_a - dx / 2.0 for j in range(q_r)]
            else:
                xs = [t + ((i + 1) / (qty + 1)) * A - dx / 2.0 for i in range(qty)]
            for i, bx in enumerate(xs):
                sb = make_trapezoid_batten(bx, t, z_rb, z_rt, dx, B, t) if is_trap else make_box(bx, t, t, dx, min(dy, B), dz)
                add_solid(f"{pid}_{i + 1}", "batten", sb, p, BATTEN_COL)
            continue

        col = DIV_COL if kind == "divider" else (PORT_COL if kind == "port" else MDF_MAIN)
        add_solid(pid, kind, make_box(ox, oy, oz, dx, dy, dz), p, col, transp=55 if pid == "P_TOP" else 0)

    # Organiza em Grupos + Planilhas Nativas FreeCAD (Manual FreeCAD p. 34-35 & p. 133-140)
    try:
        grp_map = {
            "mdf": doc.addObject("App::DocumentObjectGroup", "01_Estrutura_MDF"),
            "divider": doc.addObject("App::DocumentObjectGroup", "02_Divisorias"),
            "port": doc.addObject("App::DocumentObjectGroup", "03_Dutos"),
            "batten": doc.addObject("App::DocumentObjectGroup", "04_Travamentos"),
        }
        for (_, k_g, o_g) in solids:
            grp_map.get(k_g, grp_map["mdf"]).addObject(o_g)
        for gk, gobj in list(grp_map.items()):
            if not gobj.Group:
                doc.removeObject(gobj.Name)
        mdf_kg = round(sum(o.Shape.Volume for (_, k, o) in solids if k in ("mdf", "divider", "batten")) / 1e9 * 750.0, 2)
        sp_p = doc.addObject("Spreadsheet::Sheet", "Parametros_Acusticos")
        sp_p.set("A1", "Parametro"); sp_p.set("B1", "Valor"); sp_p.set("C1", "Unidade")
        dr_m = pack.get("driver") or {}
        for ir, (lb, vl, un, al) in enumerate([
            ("Driver", str(dr_m.get("name") or "Driver"), "-", None),
            ("Topologia", str(ac.get("boxType") or "custom").upper(), "-", None),
            ("Largura_Ext_F", round(F, 2), "mm", "F_ext"),
            ("Altura_Ext_E", round(E, 2), "mm", "E_ext"),
            ("Prof_Ext_D", round(D_ext, 2), "mm", "D_ext"),
            ("Largura_Int_A", round(A, 2), "mm", "A_int"),
            ("Altura_Int_B", round(B, 2), "mm", "B_int"),
            ("Espessura_MDF_t", round(t, 2), "mm", "t_mdf"),
            ("Vol_Vb_VF", round(float(ac.get("Vb") or 0.0), 2), "L", "Vb_L"),
            ("Vol_VR", round(float(ac.get("Vr") or 0.0), 2), "L", "Vr_L"),
            ("Sintonia_Fb", round(float(ac.get("Fb") or 0.0), 2), "Hz", "Fb_Hz"),
            ("Peso_MDF_Real_OCCT", mdf_kg, "kg", "MDF_kg"),
        ], start=2):
            sp_p.set(f"A{ir}", lb); sp_p.set(f"B{ir}", str(vl)); sp_p.set(f"C{ir}", un)
            if al:
                try:
                    sp_p.setAlias(f"B{ir}", al)
                except Exception:
                    pass
        sp_bom = doc.addObject("Spreadsheet::Sheet", "Lista_de_Corte_BOM")
        for cl, ht in [("A1", "Peca"), ("B1", "Categoria"), ("C1", "BBox_X_mm"), ("D1", "BBox_Y_mm"), ("E1", "BBox_Z_mm"), ("F1", "Volume_cm3"), ("G1", "Massa_MDF_kg")]:
            sp_bom.set(cl, ht)
        for ib, (nb, kb, ob) in enumerate(solids, start=2):
            bb = ob.Shape.BoundBox
            sp_bom.set(f"A{ib}", nb); sp_bom.set(f"B{ib}", kb)
            sp_bom.set(f"C{ib}", str(round(bb.XLength, 1))); sp_bom.set(f"D{ib}", str(round(bb.YLength, 1))); sp_bom.set(f"E{ib}", str(round(bb.ZLength, 1)))
            sp_bom.set(f"F{ib}", str(round(float(ob.Shape.Volume) / 1000.0, 1)))
            sp_bom.set(f"G{ib}", str(round((float(ob.Shape.Volume) / 1e9) * 750.0, 2) if kb in ("mdf", "divider", "batten") else 0.0))
    except Exception:
        pass

    doc.recompute()
    if HAS_GUI:
        FreeCADGui.ActiveDocument.ActiveView.viewIsometric()
        FreeCADGui.ActiveDocument.ActiveView.fitAll()
    FreeCAD.Console.PrintMessage(f"[BassForge] {len(solids)} solidos + grupos + planilhas gerados com sucesso.\\n")

build_all()
`;
}

function exportBuildPackFreeCadMacro(opts) {
  if (!lastBuildPack) updateWoodlock();
  const gate = checkCadExportGate(lastBuildPack, opts);
  if (!gate.ok) {
    if (gate.reason === 'GEOMETRY_CRITICAL') alert('⛔ Exportação bloqueada: corrija os erros críticos de geometria na aba Marcenaria CAD.');
    return false;
  }
  const macro = buildFreeCadMacroString(lastBuildPack, wlViewMode === 'exploded' ? wlExplodeRatio : 0.0);
  const safe = (lastBuildPack.driver.name || 'Projeto').replace(/[^a-zA-Z0-9_-]+/g, '_').slice(0, 36);
  const blob = new Blob([macro], { type: 'text/plain;charset=utf-8' });
  const a = document.createElement('a');
  a.download = `BassForge_${safe}.FCMacro`;
  a.href = URL.createObjectURL(blob);
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1500);
  return true;
}
