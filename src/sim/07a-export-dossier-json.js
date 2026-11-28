
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