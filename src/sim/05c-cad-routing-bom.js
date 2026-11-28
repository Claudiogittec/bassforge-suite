function onWoodlockBracingChange() {
  const ids = ['wlBraceFF', 'wlBraceTB', 'wlBraceLR', 'wlBraceCross', 'wlBraceBaffle', 'wlBraceRear'];
  const activeCount = ids.reduce((acc, id) => acc + (document.getElementById(id)?.checked ? 1 : 0), 0);
  const batEl = document.getElementById('wlBattens');
  if (batEl) batEl.value = String(activeCount);
  updateWoodlock();
}

function getPortOffsetBounds({ boxType, portType, lvMm, t }) {
  const isVented = (boxType === 'bass-reflex' || boxType === 'bp4' || boxType === 'bp6' || boxType === 'planar');
  if (!isVented) return { min: 0, max: 0, disabled: true, hint: 'Sem duto' };
  const tSafe = Math.max(6, parseFloat(t) || 18);
  const lvSafe = Math.max(0, parseFloat(lvMm) || 0);
  if (boxType === 'planar') {
    const minIn = -Math.round(tSafe);
    return { min: minIn, max: 0, disabled: false, hint: `${minIn} a 0 mm (Planar)` };
  }
  if (portType === 'round' || portType === 'flared') {
    // Tubo encaixado/flangeado: nunca negativo (<0 cai p/ dentro do furo); p/ fora mantém engaste mínimo t no painel
    const maxOut = Math.max(0, Math.floor(lvSafe - tSafe));
    return { min: 0, max: maxOut, disabled: false, hint: `0 a +${maxOut} mm` };
  }
  // Régua (slot_wall / slot) e Triângulo (MDF interno): nunca sai voando p/ fora (>0); no máx. recuado até face interna (-t)
  const minIn = -Math.round(tSafe);
  return { min: minIn, max: 0, disabled: false, hint: `${minIn} a 0 mm` };
}

function computePortRoutingPlan(opts) {
  const routing = opts.portRouting || 'straight';
  const portType = opts.portType || 'round';
  const isSlot = (portType === 'slot' || portType === 'slot_wall');
  const slotOrient = opts.slotOrient || 'horizontal';
  const A = Math.max(100, Number(opts.A) || 500);
  const B = Math.max(100, Number(opts.B) || 400);
  const C_min = Math.max(80, Number(opts.C_min) || 350);
  const t = Math.max(6, Number(opts.t) || 18);
  const lvMm = Math.max(0, Number(opts.lvMm) || 0);
  const slotHmm = Math.max(15, Number(opts.slotHmm) || 60);
  const slotWallThick = Math.max(6, Number(opts.slotWallThick) || t);
  const odMm = Math.max(25, Number(opts.odMm) || 104.6);
  const numDucts = Math.max(1, parseInt(opts.numDucts) || 1);
  const hasCenterDiv = Boolean(opts.hasCenterDiv);
  // CAD-01: folga mínima respeita regra física max(40, 0.75*H) ou max(40, 0.50*D)
  const minClearanceMm = Number.isFinite(opts.minClearanceMm)
    ? opts.minClearanceMm
    : (isSlot ? Math.max(40, 0.75 * slotHmm) : Math.max(40, 0.50 * odMm));
  // CAD-05: largura útil real por câmara quando existe divisória central
  const availA = hasCenterDiv ? Math.max(60, (A - t) / 2) : A;

  if (routing === 'side_firing') {
    const clearanceMm = availA - lvMm;
    return {
      routing, fits: clearanceMm >= minClearanceMm, clearanceMm,
      l1Mm: lvMm, l2Mm: 0, bendArcMm: 0, clearBackMm: clearanceMm, maxL2Mm: 0
    };
  }
  if (routing === 'l_bend') {
    if (isSlot) {
      const clearBackMm = Math.max(minClearanceMm, slotHmm);
      const l1Max = C_min - clearBackMm;
      const l1Mm = Math.max(40, Math.min(lvMm, l1Max));
      // Comprimento efetivo de linha de centro no trecho 1 + curva 90° (Small / Dickason)
      const bendArcMm = slotWallThick + slotHmm * 0.5;
      const l2Mm = Math.max(0, lvMm - l1Mm - bendArcMm);
      const transSpan = (slotOrient === 'horizontal') ? B : availA;
      const maxL2Mm = Math.max(0, transSpan - slotHmm - slotWallThick - Math.max(50, minClearanceMm));
      const fits = (l1Max >= 40) && (l2Mm <= maxL2Mm);
      const clearanceMm = Math.min(clearBackMm, maxL2Mm - l2Mm + Math.max(50, minClearanceMm));
      return { routing, fits, clearanceMm, l1Mm, l2Mm, bendArcMm, clearBackMm, maxL2Mm };
    } else {
      // Duto cilíndrico / aeroport com joelho 90° (raio médio ~0.85 * OD, arco = pi/2 * R)
      const rElbow = Math.max(45, odMm * 0.85);
      const bendArcMm = (Math.PI / 2) * rElbow;
      const clearBackMm = Math.max(minClearanceMm, odMm * 0.55);
      const l1Max = C_min - clearBackMm - rElbow;
      const l1Mm = Math.max(40, Math.min(lvMm, l1Max));
      const l2Mm = Math.max(0, lvMm - l1Mm - bendArcMm);
      // CAD-05: se múltiplos dutos na mesma câmara (sem divisória), reserva espaço lateral por duto
      const ductsPerChamber = hasCenterDiv ? Math.ceil(numDucts / 2) : numDucts;
      const perDuctSpan = ductsPerChamber > 1 ? (availA / ductsPerChamber) : availA;
      const maxL2Mm = Math.max(0, perDuctSpan - odMm - Math.max(60, minClearanceMm));
      const fits = (l1Max >= 40) && (l2Mm <= maxL2Mm);
      const clearanceMm = Math.min(clearBackMm, maxL2Mm - l2Mm + Math.max(60, minClearanceMm));
      return { routing, fits, clearanceMm, l1Mm, l2Mm, bendArcMm, clearBackMm, maxL2Mm, rElbow };
    }
  }
  const clearanceMm = C_min - lvMm;
  return {
    routing: 'straight', fits: clearanceMm >= minClearanceMm, clearanceMm,
    l1Mm: lvMm, l2Mm: 0, bendArcMm: 0, clearBackMm: clearanceMm, maxL2Mm: 0
  };
}

function computeSmartPortSuggestion(pack) {
  if (!pack || !pack.acoustics || pack.acoustics.boxType !== 'bass-reflex') return null;
  const ac = pack.acoustics;
  const dims = pack.dims || {};
  const C_avail = Math.max(80, Math.min(dims.C_top || 350, dims.D_bot || 350) - 45);
  const Vb = ac.Vb || 70;
  const Fb = ac.Fb || 40;
  const tempC = parseFloat(document.getElementById('tempInput')?.value) || 20;
  const cVal = 20.0547605 * Math.sqrt(273.15 + tempC);
  const curVel = (currentCurves && currentCurves.meta && currentCurves.meta.airVel) || 18;
  const curSp = (pack.acoustics.portGeom && pack.acoustics.portGeom.Sp) || 0.02;
  const portType = document.getElementById('portType')?.value || 'round';
  const velMaxSafe = (portType === 'flared') ? 24.0 : 18.5;

  if (portType === 'round' || portType === 'flared') {
    const curN = parseInt(document.getElementById('numDucts')?.value) || 2;
    const curD = parseFloat(document.getElementById('ductDia')?.value) || 4;
    const candidates = [];
    const dias = [3, 3.5, 4, 4.5, 5, 6];
    for (let n = 1; n <= 4; n++) {
      for (const d of dias) {
        if (n === curN && Math.abs(d - curD) < 0.05) continue;
        const g = computePortGeometry({ portType, numDucts: n, ductDia: d, ductThick: 1.5, Fb, Vb, c: cVal });
        const lvMm = g.LvCm * 10;
        const estVel = curVel * (curSp / Math.max(1e-6, g.Sp));
        if (lvMm >= 40 && lvMm <= C_avail && estVel <= velMaxSafe * 1.15) {
          candidates.push({ n, d, lvMm, estVel, score: Math.abs(estVel - velMaxSafe * 0.85) + (lvMm / 500) });
        }
      }
    }
    candidates.sort((a, b) => a.score - b.score);
    if (candidates.length) {
      const best = candidates[0];
      return {
        kind: 'round', numDucts: best.n, ductDia: best.d,
        label: `Ajustar p/ ${best.n}× ${best.d}″ (Lv ${(best.lvMm / 10).toFixed(1)}cm · ${best.estVel.toFixed(1)} m/s)`
      };
    }
  } else if (portType === 'slot' || portType === 'slot_wall') {
    const wCm = parseFloat(document.getElementById('slotW')?.value) || 35;
    const curH = parseFloat(document.getElementById('slotH')?.value) || 6;
    for (let h = curH - 0.5; h >= 2.5; h -= 0.5) {
      const g = computePortGeometry({ portType, slotW: wCm, slotH: h, slotWallThick: 18, Fb, Vb, c: cVal });
      const lvMm = g.LvCm * 10;
      const estVel = curVel * (curSp / Math.max(1e-6, g.Sp));
      if (lvMm >= 40 && lvMm <= C_avail && estVel <= velMaxSafe * 1.15) {
        return {
          kind: 'slot', slotH: +h.toFixed(1),
          label: `Reduzir Alt. H p/ ${h.toFixed(1)} cm (Lv ${(lvMm / 10).toFixed(1)}cm · ${estVel.toFixed(1)} m/s)`
        };
      }
    }
  }
  return null;
}

function applyPortFix(action) {
  const pack = lastBuildPack;
  if (!pack) return;
  const routeEl = document.getElementById('wlPortRouting');
  const offEl = document.getElementById('wlPortOffset');

  if (action === 'l_bend') {
    if (routeEl) routeEl.value = 'l_bend';
    if (offEl) offEl.value = '0';
    updateWoodlock();
    return;
  }
  if (action === 'side_firing') {
    if (routeEl) routeEl.value = 'side_firing';
    if (offEl) offEl.value = '0';
    updateWoodlock();
    return;
  }
  if (action === 'slot_l_bend') {
    const ptEl = document.getElementById('portType');
    const curSpCm2 = ((pack.acoustics.portGeom && pack.acoustics.portGeom.Sp) || 0.024) * 10000;
    const A = parseFloat(document.getElementById('wlWidthA')?.value) || 550;
    const wCm = +(A / 10).toFixed(1);
    const hCm = Math.max(3.5, Math.min(12.0, +(curSpCm2 / Math.max(10, wCm)).toFixed(1)));
    if (ptEl) ptEl.value = 'slot_wall';
    const swEl = document.getElementById('slotW');
    const shEl = document.getElementById('slotH');
    if (swEl) swEl.value = wCm.toFixed(1);
    if (shEl) shEl.value = hCm.toFixed(1);
    const soEl = document.getElementById('wlSlotOrient');
    if (soEl) soEl.value = 'horizontal';
    if (routeEl) routeEl.value = 'l_bend';
    if (offEl) offEl.value = '0';
    onPortTypeChange();
    return;
  }
  if (action === 'stretch_depth') {
    const minA = (lastWoodlockFloors && lastWoodlockFloors.minA) ? lastWoodlockFloors.minA : 400;
    const minB = (lastWoodlockFloors && lastWoodlockFloors.minB) ? lastWoodlockFloors.minB : 400;
    const aEl = document.getElementById('wlWidthA');
    const bEl = document.getElementById('wlHeightB');
    if (aEl) aEl.value = String(Math.ceil(minA));
    if (bEl) bEl.value = String(Math.ceil(minB));
    if (routeEl) routeEl.value = 'straight';
    updateWoodlock();
    return;
  }
  if (action === 'reduce_area') {
    const sug = computeSmartPortSuggestion(pack);
    if (!sug) return;
    if (sug.kind === 'round') {
      const nEl = document.getElementById('numDucts');
      const dEl = document.getElementById('ductDia');
      if (nEl) nEl.value = String(sug.numDucts);
      if (dEl) dEl.value = String(sug.ductDia);
    } else if (sug.kind === 'slot') {
      const hEl = document.getElementById('slotH');
      if (hEl) hEl.value = String(sug.slotH);
    }
    if (routeEl) routeEl.value = 'straight';
    if (offEl) offEl.value = '0';
    recalculate();
  }
}

function updateWoodlock() {
  const shapeEl = document.getElementById('wlShape');
  if (!shapeEl) return;

  const shape = shapeEl.value;
  const mountMode = document.getElementById('wlMountMode')?.value || 'normal';
  const slotOrient = document.getElementById('wlSlotOrient')?.value || 'horizontal';
  const portLayout = document.getElementById('wlPortLayout')?.value || 'standard';
  const portRoutingRaw = document.getElementById('wlPortRouting')?.value || 'straight';
  const portOffsetEl = document.getElementById('wlPortOffset');
  let portOffsetMm = parseFloat(portOffsetEl?.value) || 0;
  const planarStyle = document.getElementById('wlPlanarStyle')?.value || 'square';
  const t = parseFloat(document.getElementById('wlThickness').value) || 18.0;
  const A = parseFloat(document.getElementById('wlWidthA').value) || 800.0;
  const B = parseFloat(document.getElementById('wlHeightB').value) || 450.0;
  const angle = parseFloat(document.getElementById('wlAngle').value) || 15.0;
  const battens = parseInt(document.getElementById('wlBattens').value) || 0;

  const boxType = document.getElementById('boxType').value;
  const isFreeAir = (boxType === 'free-air');
  const isPlanar = (boxType === 'planar');
  const isVented = (boxType === 'bass-reflex' || boxType === 'bp4' || boxType === 'bp6');
  const isBp = (boxType === 'bp4' || boxType === 'bp6');
  const bp6Mode = document.getElementById('bp6Mode')?.value || 'parallel';
  const isBp6Parallel = (boxType === 'bp6' && bp6Mode === 'parallel');
  const isBp6Series = (boxType === 'bp6' && bp6Mode === 'series');
  const nDrivers = Math.max(1, parseInt(document.getElementById('simNumDrivers')?.value) || 1);
  const Vb = isFreeAir ? 0.0 : (parseFloat(document.getElementById('vbInput').value) || 130.0);
  const VsubRaw = (parseFloat(document.getElementById('tsVsub').value) || 9.0) * nDrivers;
  const Vsub = (isFreeAir || mountMode === 'inverted') ? 0.0 : VsubRaw;
  const tempC = parseFloat(document.getElementById('tempInput').value) || 20.0;
  const cVal = 20.0547605 * Math.sqrt(273.15 + tempC);
  const portType = document.getElementById('portType')?.value || 'round';
  const isSlotType = (portType === 'slot' || portType === 'slot_wall');
  const isBpSlot = (isBp && (boxType === 'bp4' || isBp6Parallel) && isSlotType);
  const isSharedCenterPort = (boxType === 'bass-reflex' && nDrivers === 2 && portLayout === 'center_shared' && (portType === 'round' || isSlotType));
  const isDualVertSlot = (boxType === 'bass-reflex' && nDrivers === 2 && !isSharedCenterPort && isSlotType && slotOrient === 'vertical');
  const hasCenterDiv = (!isFreeAir && !isBp && nDrivers === 2 && !isSharedCenterPort && !isDualVertSlot);
  const numDucts = isSharedCenterPort && portType === 'round' ? 1 : (parseInt(document.getElementById('numDucts').value) || 2);
  const ductDia = parseFloat(document.getElementById('ductDia').value) || 6.0;
  const ductThick = parseFloat(document.getElementById('ductThick').value) || 1.5;
  const numDuctsVr = Math.max(1, parseInt(document.getElementById('numDuctsVr')?.value) || 1);
  const ductDiaVr = Math.max(1.0, parseFloat(document.getElementById('ductDiaVr')?.value) || 4.0);
  const ductThickVr = Math.max(0.5, parseFloat(document.getElementById('ductThickVr')?.value) || 1.5);
  const slotW = parseFloat(document.getElementById('slotW')?.value) || 35.0;
  const slotH = parseFloat(document.getElementById('slotH')?.value) || 6.0;
  const slotWallThick = parseFloat(document.getElementById('slotWallThick')?.value) || 18.0;
  const triCount = parseInt(document.getElementById('triCount')?.value) || 2;
  const triA = parseFloat(document.getElementById('triA')?.value) || 14.0;
  const triB = parseFloat(document.getElementById('triB')?.value) || 14.0;
  const Fb = parseFloat(document.getElementById('fbInput').value) || 44.62;
  const fbVr = parseFloat(document.getElementById('fbVrInput')?.value) || 35.0;

  let Vduto = 0.0;
  let VdutoRear = 0.0;
  let portGeom = null;
  let portGeomRear = null;
  const VbpRear = isBp ? (parseFloat(document.getElementById('vrInput')?.value) || 0) : 0;
  if (isVented) {
    portGeom = computePortGeometry({
      portType, numDucts, ductDia, ductThick, slotW, slotH, slotWallThick,
      triCount, triA, triB, Fb, Vb, c: cVal
    });
    const lvForBounds = Math.max(0, (portGeom.LvCm || 0) * 10.0);
    const offBounds = getPortOffsetBounds({ boxType, portType, lvMm: lvForBounds, t });
    portOffsetMm = Math.max(offBounds.min, Math.min(offBounds.max, portOffsetMm));
    if (portOffsetEl) {
      portOffsetEl.min = String(offBounds.min);
      portOffsetEl.max = String(offBounds.max);
      portOffsetEl.disabled = !!offBounds.disabled;
      if (parseFloat(portOffsetEl.value) !== portOffsetMm) portOffsetEl.value = String(portOffsetMm);
    }
    const offLbl = document.getElementById('wlPortOffsetLabel');
    if (offLbl) offLbl.textContent = `Posição Duto (${offBounds.hint})`;
    const intFracF = (portOffsetMm > 0 && portGeom.LvCm > 0) ? Math.max(0, 1.0 - (portOffsetMm / 10.0) / portGeom.LvCm) : 1.0;
    Vduto = portGeom.vDuto * intFracF;
    if ((isBp6Parallel || isBp6Series) && VbpRear > 0) {
      portGeomRear = computePortGeometry({
        portType: (isBp6Parallel && isSlotType) ? portType : (portType === 'flared' ? 'flared' : 'round'),
        numDucts: numDuctsVr, ductDia: ductDiaVr, ductThick: ductThickVr, slotW, slotH, slotWallThick,
        triCount, triA, triB, Fb: fbVr, Vb: VbpRear, c: cVal
      });
      const intFracR = (portOffsetMm > 0 && portGeomRear.LvCm > 0) ? Math.max(0, 1.0 - (portOffsetMm / 10.0) / portGeomRear.LvCm) : 1.0;
      VdutoRear = portGeomRear.vDuto * intFracR;
    }
  } else if (isPlanar) {
    // Planar Horn (Dutada + Túnel λ/4): duto interno na boca frontal permite recuo [-t, 0 mm]
    const offBounds = getPortOffsetBounds({ boxType, portType, lvMm: 200, t });
    portOffsetMm = Math.max(offBounds.min, Math.min(offBounds.max, portOffsetMm));
    if (portOffsetEl) {
      portOffsetEl.min = String(offBounds.min);
      portOffsetEl.max = String(offBounds.max);
      portOffsetEl.disabled = !!offBounds.disabled;
      if (parseFloat(portOffsetEl.value) !== portOffsetMm) portOffsetEl.value = String(portOffsetMm);
    }
    const offLbl = document.getElementById('wlPortOffsetLabel');
    if (offLbl) offLbl.textContent = `Posição Duto (${offBounds.hint})`;
  } else {
    const offBounds = getPortOffsetBounds({ boxType, portType, lvMm: 0, t });
    portOffsetMm = 0;
    if (portOffsetEl) {
      portOffsetEl.min = '0';
      portOffsetEl.max = '0';
      portOffsetEl.disabled = true;
      portOffsetEl.value = '0';
    }
    const offLbl = document.getElementById('wlPortOffsetLabel');
    if (offLbl) offLbl.textContent = `Posição Duto (${offBounds.hint})`;
  }
  const lvRearMmCanon = portGeomRear ? Math.round(Math.max(0, portGeomRear.LvCm * 10.0)) : 0;

  // Travamento Estrutural em 6 Eixos (ou modo legado por quantidade de sarrafos)
  const braceDefs = [
    { id: 'wlBraceFF', code: 'FF', label: 'Sarrafo Frente–Fundo (Eixo Z)', lenFn: (a, b, c) => c },
    { id: 'wlBraceTB', code: 'TB', label: 'Sarrafo Topo–Base (Eixo Y)', lenFn: (a, b) => b },
    { id: 'wlBraceLR', code: 'LR', label: 'Sarrafo Esq–Dir (Eixo X)', lenFn: (a) => a },
    { id: 'wlBraceCross', code: 'CROSS', label: 'Painel Matriz / Window Brace (B×C)', lenFn: (a, b, c) => c, isWindow: true },
    { id: 'wlBraceBaffle', code: 'BAFFLE', label: 'Reforço Interno do Baffle', lenFn: (a) => a },
    { id: 'wlBraceRear', code: 'REAR', label: 'Reforço Interno Traseiro', lenFn: (a) => a }
  ];
  const activeBraces = isFreeAir ? [] : braceDefs.filter(d => !!document.getElementById(d.id)?.checked);

  // Alojamento Veicular / Caçamba (Módulo 10: Grade DIV cols×rows, Caixas de Roda CXRODAS, Barra BARRA)
  const matrixCols = isFreeAir ? 1 : Math.max(1, Math.min(6, parseInt(document.getElementById('wlMatrixCols')?.value) || 1));
  const matrixRows = isFreeAir ? 1 : Math.max(1, Math.min(6, parseInt(document.getElementById('wlMatrixRows')?.value) || 1));
  const hasWheelArch = !isFreeAir && !!document.getElementById('wlWheelArch')?.checked;
  const wheelK = Math.max(40, parseFloat(document.getElementById('wlWheelK')?.value) || 120);
  const wheelH = Math.max(80, parseFloat(document.getElementById('wlWheelH')?.value) || 260);
  const wheelJ = Math.max(60, parseFloat(document.getElementById('wlWheelJ')?.value) || 180);
  const hasProtectBar = !isFreeAir && !!document.getElementById('wlProtectBar')?.checked;

  // Desconta espessura das divisórias internas no eixo X para fechamento volumétrico exato G04
  const internalDivCount = isBp ? (nDrivers === 2 ? 2 : 1) : (hasCenterDiv ? 1 : 0);
  const A_net_vol = Math.max(100.0, A - internalDivCount * t);
  // Estimativa inicial de C_med para comprimento de sarrafo Frente-Fundo / Window Brace
  const baseVolNoBrace = Vb + VbpRear + Vsub + Vduto + VdutoRear;
  const cEst = isFreeAir ? t : ((baseVolNoBrace * 1e6) / Math.max(1.0, A_net_vol * B));
  const braceVolMm3 = (d, a, b, cValMm) => {
    if (d.isWindow) {
      const hDia = Math.max(30.0, Math.min(b / 3.8, cValMm / 2.8) * 0.72);
      const holesN = (shape === 'trapezoidal') ? 5 : 6;
      const holesArea = holesN * Math.PI * Math.pow(hDia / 2.0, 2);
      return Math.max(50.0 * cValMm, (b * cValMm) - holesArea) * t;
    }
    return 50.0 * t * Math.max(50.0, d.lenFn(a, b, cValMm));
  };
  const Vbracing = isFreeAir
    ? 0.0
    : (activeBraces.length > 0
        ? activeBraces.reduce((acc, d) => acc + braceVolMm3(d, A, B, cEst) / 1e6, 0.0)
        : ((battens * 50.0 * t * B) / 1e6));
  const Vbruto = isFreeAir ? 0.0 : (baseVolNoBrace + Vbracing);
  const C_med = isFreeAir ? t : ((Vbruto * 1e6) / Math.max(1.0, A_net_vol * B));

  // Recalcula Vbracing final com C_med exato para fechamento perfeito G07
  const finalBraces = activeBraces.map(d => {
    const lenMm = +Math.max(50.0, d.lenFn(A, B, C_med)).toFixed(1);
    const wMm = d.isWindow ? +B.toFixed(1) : 50.0;
    const hDia = d.isWindow ? +Math.max(30.0, Math.min(B / 3.8, C_med / 2.8) * 0.72).toFixed(1) : 0;
    const holesN = d.isWindow ? ((shape === 'trapezoidal') ? 5 : 6) : 0;
    const holesAreaMm2 = d.isWindow ? +(holesN * Math.PI * Math.pow(hDia / 2.0, 2)).toFixed(1) : 0;
    return { ...d, wMm, lenMm, holeDiaMm: hDia, holesCount: holesN, holesAreaMm2 };
  });
  const VbracingExact = isFreeAir
    ? 0.0
    : (finalBraces.length > 0
        ? finalBraces.reduce((acc, d) => acc + Math.max(50.0 * d.lenMm, d.wMm * d.lenMm - d.holesAreaMm2) * t / 1e6, 0.0)
        : Vbracing);
  const VbrutoExact = isFreeAir ? 0.0 : (baseVolNoBrace + VbracingExact);
  const C_medExact = isFreeAir ? t : ((VbrutoExact * 1e6) / Math.max(1.0, A_net_vol * B));

  let bpChambers = null;
  if (isBp) {
    const vRearTot = Math.max(1.0, VbpRear + Vsub + VdutoRear);
    const vFrontTot = Math.max(1.0, Vb + Vduto);
    const A_rear = +(A_net_vol * (vRearTot / (vRearTot + vFrontTot))).toFixed(1);
    const A_front = +(A_net_vol - A_rear).toFixed(1);
    const dualDiv = (nDrivers === 2);
    const A_rear_side = dualDiv ? +(A_rear / 2.0).toFixed(1) : A_rear;
    bpChambers = {
      A_rear, A_front, A_rear_side, dualDiv, t, isBp: true, isBp6Parallel, isBp6Series, isBpSlot,
      lvRearMm: lvRearMmCanon, bp6Mode, slotWidthMm: +(slotH * 10.0).toFixed(1)
    };
  }
  let C_top = C_medExact;
  let D_bot = C_medExact;
  if (!isFreeAir && shape === 'trapezoidal') {
    const thetaRad = (Math.min(45.0, Math.max(0.0, angle)) * Math.PI) / 180.0;
    const deltaC = B * Math.tan(thetaRad);
    C_top = Math.max(50.0, C_medExact - deltaC / 2.0);
    D_bot = (C_top <= 50.001) ? (2.0 * C_medExact - C_top) : (C_medExact + deltaC / 2.0);
  }

  // Geometria Planar Horn (Quadrado: CG, Baffle A×C4, Div. A4×R | Triângulo: Octogonal + 4× 45° V×Z)
  let planarGeom = null;
  if (isPlanar) {
    const recuoGInput = document.getElementById('wlPlanarRecuoG')?.value;
    const tg = resolvePlanarTunnelGeometry({ A, B, t, nDrivers, planarStyle, recuoGInput });
    const recuoG = tg.recuoG;
    const CG = +(C_top + recuoG).toFixed(1);
    const DG = +(D_bot + recuoG).toFixed(1);
    if (tg.style === 'triangle') {
      planarGeom = {
        style: 'triangle', recuoG, isAutoG: tg.isAutoG, CG, DG,
        C_chamber: +C_medExact.toFixed(1), C4: null,
        Z_leg: tg.Z_leg, Z: tg.Z_hyp, S: tg.S_side, St_m2: +tg.St_m2.toFixed(4)
      };
    } else {
      planarGeom = {
        style: 'square', recuoG, isAutoG: tg.isAutoG, CG, DG,
        C_chamber: +C_medExact.toFixed(1), C4: tg.C4,
        Z_leg: null, Z: null, S: null, St_m2: +tg.St_m2.toFixed(4)
      };
    }
  }

  const F_ext = A + 2.0 * t;
  const E_ext = B + 2.0 * t;
  const depthForShellTop = isPlanar ? planarGeom.CG : C_top;
  const depthForShellBot = isPlanar ? planarGeom.DG : D_bot;
  const C_ext_top = isFreeAir ? t : (depthForShellTop + 2.0 * t);
  const D_ext_bot = isFreeAir ? t : (depthForShellBot + 2.0 * t);
  const V_ext = (F_ext * E_ext * 0.5 * (C_ext_top + D_ext_bot)) / 1e6;

  // Rigidez de Placa Kirchhoff-Love (E=3.5 GPa, rho=750 kg/m3, nu=0.25)
  const E_pa = 3.5e9;
  const h_m = t / 1000.0;
  const D_rig = (E_pa * Math.pow(h_m, 3)) / (12.0 * (1.0 - 0.0625));
  const a_m = A / 1000.0;
  const b_m = B / 1000.0;
  const f11_unbraced = (Math.PI / 2.0) * Math.sqrt(D_rig / (750.0 * h_m)) * ((1.0 / (a_m*a_m)) + (1.0 / (b_m*b_m)));
  const effBattenCount = finalBraces.length > 0 ? finalBraces.length : battens;
  const subdiv = 1 + Math.floor(effBattenCount / 2);
  const a_eff = a_m / subdiv;
  const f11_braced = (Math.PI / 2.0) * Math.sqrt(D_rig / (750.0 * h_m)) * ((1.0 / (a_eff*a_eff)) + (1.0 / (b_m*b_m)));

  const isTrap = (!isFreeAir && shape === 'trapezoidal');
  const bev = isTrap ? angle : 0.0;
  const rearH = isTrap ? (B / Math.cos((angle * Math.PI) / 180.0)) : B;

  const isSideFiring = (boxType === 'bass-reflex' && portRoutingRaw === 'side_firing' && !(portGeom && portGeom.isTri));
  const isSlotFrontReduced = (isVented && !isBp && !isSideFiring && portGeom && portGeom.isSlot);
  const isTriFrontEmbedded = (isVented && !isBp && portGeom && portGeom.isTri);
  const isSharedSlotVert = (isSharedCenterPort && isSlotType);
  const slotC4 = Math.max(50.0, B - (slotH * 10.0) - slotWallThick);
  const slotAbaffle = isSharedSlotVert
    ? Math.max(50.0, (A - (slotH * 10.0) - 2.0 * slotWallThick) / 2.0)
    : (isDualVertSlot
        ? Math.max(50.0, A - 2.0 * (slotH * 10.0 + slotWallThick))
        : Math.max(50.0, A - (slotH * 10.0) - slotWallThick));
  const planarSubW = (isPlanar && hasCenterDiv) ? Math.max(50.0, (A - t) / 2.0) : A;
  const frontW = isSharedSlotVert
    ? slotAbaffle
    : (isSlotFrontReduced ? (slotOrient === 'horizontal' ? A : slotAbaffle) : ((isPlanar ? planarSubW : (isTriFrontEmbedded ? A : F_ext))));
  const frontH = isSharedSlotVert
    ? B
    : (isSlotFrontReduced
        ? (slotOrient === 'horizontal' ? slotC4 : B)
        : (isPlanar ? (planarGeom.style === 'square' ? planarGeom.C4 : B) : (isFreeAir ? E_ext : B)));
  const frontQty = (isSharedSlotVert || (isPlanar && hasCenterDiv)) ? 2 : 1;
  const bpSlotPortW = slotH * 10.0;
  const isBpDualSlot = !!(isBpSlot && bpChambers && bpChambers.dualDiv);
  const topQty = isBpDualSlot ? 2 : 1;
  const topW = isBpDualSlot
    ? Math.max(80.0, (F_ext - bpSlotPortW - (isBp6Parallel ? (2.0 * bpSlotPortW + 2.0 * t) : 0.0)) / 2.0)
    : (isBpSlot
        ? Math.max(100.0, F_ext - (isBp6Parallel ? (2.0 * bpSlotPortW + 2.0 * t) : (bpSlotPortW + t)))
        : F_ext);
  const frontNote = isSharedSlotVert
    ? `2× Baffles frontais embutidos (A2=${slotAbaffle.toFixed(0)} × B=${B.toFixed(0)} mm) — abrem duto único vertical central A3=${(slotH * 10).toFixed(0)} mm`
    : (isSlotFrontReduced
        ? (slotOrient === 'horizontal'
            ? `Baffle reduzido embutido (A=${A.toFixed(0)} × C4=${slotC4.toFixed(0)} mm) — abre boca do duto régua horizontal na base`
            : `Baffle reduzido embutido (${slotAbaffle.toFixed(0)} × B=${B.toFixed(0)} mm) — abre boca do duto régua vertical à direita`)
        : (isPlanar
            ? (planarGeom.style === 'square'
                ? `Baffle Planar recuado G=${planarGeom.recuoG} mm (A=${A.toFixed(0)} × C4=${planarGeom.C4} mm) — forma garganta da boca quadrada`
                : `Baffle Octogonal Planar recuado G=${planarGeom.recuoG} mm — chanfrar os 4 cantos em 45° (cateto=${planarGeom.Z_leg} mm, lado S=${planarGeom.S} mm)`)
            : (isBp
                ? (isBpSlot ? `Painel frontal fechado (duto quadrado sai pelo tampo superior F2=${topW.toFixed(0)} mm)` : `Painel frontal fechado sobre as câmaras (furar apenas os dutos conforme gabarito)`)
                : `Corte reto 90° — furar conforme gabarito abaixo${mountMode === 'inverted' ? ' (Montagem Invertida: ímã p/ fora)' : ''}`)));

  const pieces = isFreeAir
    ? [
        {
          kind: 'mdf', orient: 'FRENTE', name: "Painel Baffle Infinito [FRENTE / Tampão]",
          qty: 1, w: F_ext, h: E_ext, t, bev: 0.0, area: (F_ext * E_ext) / 1e6,
          note: `Painel único plano (F=${F_ext.toFixed(0)} × E=${E_ext.toFixed(0)} mm) — vedar 100% frente/trás contra curto-circuito acústico`
        }
      ]
    : [
        { kind: 'mdf', orient: 'CIMA', name: isBpSlot ? (isBpDualSlot ? "Tampo Superior Duplo [2× F2]" : "Tampo Superior Reduzido [F2]") : "Tampo Superior [CIMA]", qty: topQty, w: topW, h: C_ext_top, t, bev: bev, area: (topQty * topW * C_ext_top) / 1e6, note: isBpSlot ? `Tampo reduzido F2=${topW.toFixed(0)} mm para abertura de duto quadrado no topo` : (isPlanar ? `Cobre câmara + boca planar (F × CG_ext=${C_ext_top.toFixed(0)} mm)` : "Sobrepõe laterais, frente e trás (F × C_ext)") },
        { kind: 'mdf', orient: 'BASE', name: "Base Inferior [BASE]", qty: 1, w: F_ext, h: D_ext_bot, t, bev: bev, area: (F_ext * D_ext_bot) / 1e6, note: isPlanar ? `Base completa câmara + boca planar (F × DG_ext=${D_ext_bot.toFixed(0)} mm)` : "Base estrutural completa (F × D_ext)" },
        { kind: 'mdf', orient: 'FRENTE', name: isSharedSlotVert ? "Baffles Frontais Duplos [2× A2×B]" : (isSlotFrontReduced ? "Painel Frontal Reduzido [Baffle A×C4]" : (isPlanar ? (planarGeom.style === 'triangle' ? "Baffle Octogonal Planar [4×45°]" : "Baffle Planar Recuado [A×C4]") : "Painel Frontal [FRENTE / Baffle]")), qty: frontQty, w: frontW, h: frontH, t, bev: (isPlanar && planarGeom.style === 'triangle') ? 45.0 : 0.0, area: (frontQty * frontW * frontH) / 1e6, note: frontNote },
        { kind: 'mdf', orient: 'TRÁS', name: "Painel Traseiro [TRÁS]", qty: 1, w: F_ext, h: rearH, t, bev: bev, area: (F_ext * rearH) / 1e6, note: isTrap ? "Inclinado com chanfro superior/inferior" : "Corte reto 90° (F × E)" },
        { kind: 'mdf', orient: 'LADO ESQ/DIR', name: isPlanar ? "Laterais Embutidas Planar [B×(CG+t)]" : ((isSlotFrontReduced || isTriFrontEmbedded) ? "Laterais Embutidas Flush [B×(C+t)]" : (isBpSlot ? "Laterais BP Duto Topo [B/BM×C]" : "Laterais Embutidas [ESQ + DIR]")), qty: 2, w: B, h: (isPlanar || isSlotFrontReduced || isTriFrontEmbedded) ? (0.5*(depthForShellTop + depthForShellBot) + t) : (0.5*(depthForShellTop + depthForShellBot)), t, bev: bev, area: 2.0 * (B * ((isPlanar || isSlotFrontReduced || isTriFrontEmbedded) ? (0.5 * (depthForShellTop + depthForShellBot) + t) : (0.5 * (depthForShellTop + depthForShellBot)))) / 1e6, note: isPlanar ? `Profundidade média CG+t=${(0.5*(planarGeom.CG + planarGeom.DG) + t).toFixed(1)} mm (rente à boca planar)` : ((isSlotFrontReduced || isTriFrontEmbedded) ? `Avançam até a face frontal (C+t=${(0.5*(C_top + D_bot) + t).toFixed(1)} mm) fechando as quinas e permitindo baffle embutido/recuado (Euclides)` : `Embutidas entre tampo/base e frente/trás (B=${B.toFixed(0)} × C=${C_top.toFixed(0)}/D=${D_bot.toFixed(0)} mm)`) }
      ];

  // Em Planar Horn: adiciona peças exclusivas da boca (Divisória A4×R no Quadrado ou 4×/8× Paredes Triangulares V×Z no Triângulo)
  if (isPlanar && planarGeom) {
    if (planarGeom.style === 'square') {
      const pDivQty = hasCenterDiv ? 2 : 1;
      const pDivW = hasCenterDiv ? planarSubW : A;
      pieces.push({
        kind: 'divider', orient: 'PLANAR_DIV', name: hasCenterDiv ? "Divisória Boca Planar [2× A4×R]" : "Divisória Boca Planar [A4×R]",
        qty: pDivQty, w: pDivW, h: planarGeom.recuoG, t, bev: 0.0,
        area: (pDivQty * pDivW * planarGeom.recuoG) / 1e6,
        note: `Guia superior acima do baffle (A4=${pDivW.toFixed(0)} × R=${planarGeom.recuoG} mm)`
      });
    } else {
      const chQty = hasCenterDiv ? 8 : 4;
      pieces.push({
        kind: 'divider', orient: 'PLANAR_TRI', name: "Parede Triangular Chanfrada [V×Z]",
        qty: chQty, w: planarGeom.recuoG, h: planarGeom.Z, t, bev: 45.0,
        area: (chQty * planarGeom.recuoG * planarGeom.Z) / 1e6,
        note: `${chQty}× paredes em 45° na boca octogonal (V=${planarGeom.recuoG} × Z=${planarGeom.Z} mm · lado S=${planarGeom.S} mm · CG=${planarGeom.CG} mm)`
      });
    }
  }

  // Divisória Central (2 SUBS em Selada / Dutada Independente / Planar)
  if (hasCenterDiv) {
    const divDepth = (isSlotFrontReduced && slotOrient === 'horizontal') ? (0.5 * (C_top + D_bot) + t) : (0.5 * (C_top + D_bot));
    pieces.push({
      kind: 'divider', orient: 'CENTER_DIV', name: "Divisória Central [2 Subs · B×C]",
      qty: 1, w: B, h: divDepth, t, bev: bev,
      area: (B * divDepth) / 1e6,
      note: `Separa as 2 câmaras independentes dos subwoofers (espessura ${t} mm)`
    });
  }

  // Em BP4 / BP6: adiciona Divisória(s) Interna(s) do(s) Falante(s)
  if (isBp && bpChambers) {
    if (bpChambers.dualDiv) {
      pieces.push({
        kind: 'divider', orient: 'DIVISÓRIA_1', name: "Divisória Interna Esq. [BP 2 Subs]",
        qty: 1, w: B, h: 0.5 * (C_top + D_bot), t, bev: bev,
        area: (B * 0.5 * (C_top + D_bot)) / 1e6,
        note: `Separa Câmara Traseira Esq. (${bpChambers.A_rear_side.toFixed(0)} mm) e Frontal Central (${bpChambers.A_front.toFixed(0)} mm) — Driver #1`
      });
      pieces.push({
        kind: 'divider', orient: 'DIVISÓRIA_2', name: "Divisória Interna Dir. [BP 2 Subs]",
        qty: 1, w: B, h: 0.5 * (C_top + D_bot), t, bev: bev,
        area: (B * 0.5 * (C_top + D_bot)) / 1e6,
        note: `Separa Câmara Frontal Central (${bpChambers.A_front.toFixed(0)} mm) e Traseira Dir. (${bpChambers.A_rear_side.toFixed(0)} mm) — Driver #2`
      });
    } else {
      pieces.push({
        kind: 'divider', orient: 'DIVISÓRIA', name: "Divisória Interna do Falante [BP]",
        qty: 1, w: B, h: 0.5 * (C_top + D_bot), t, bev: bev,
        area: (B * 0.5 * (C_top + D_bot)) / 1e6,
        note: `Separa Câmara Traseira A=${bpChambers.A_rear.toFixed(0)} mm (VR) e Frontal G=${bpChambers.A_front.toFixed(0)} mm (VF) — furar driver aqui`
      });
    }
  }

  // Sarrafos de travamento como peças reais de BOM (6 eixos individuais ou legado)
  if (!isFreeAir) {
    if (finalBraces.length > 0) {
      finalBraces.forEach(br => {
        const netAreaMm2 = Math.max(50.0 * br.lenMm, br.wMm * br.lenMm - (br.holesAreaMm2 || 0));
        pieces.push({
          kind: 'batten', orient: `TRAVA_${br.code}`,
          name: `${br.label} (MDF ${t}mm)`, qty: 1, w: br.wMm, h: br.lenMm, t, bev: br.isWindow ? bev : 0.0,
          area: netAreaMm2 / 1e6,
          braceInfo: { code: br.code, isWindow: !!br.isWindow, holesCount: br.holesCount || 0, holeDiaMm: br.holeDiaMm || 0, holesAreaMm2: br.holesAreaMm2 || 0 },
          note: br.isWindow
            ? `Painel matriz ${br.wMm.toFixed(0)} × ${br.lenMm.toFixed(0)} × ${t} mm com ${br.holesCount}× furos Ø ${br.holeDiaMm} mm`
            : `Travamento eixo ${br.code}: 50 × ${br.lenMm.toFixed(0)} × ${t} mm`
        });
      });
    } else if (battens > 0) {
      pieces.push({
        kind: 'batten', orient: 'INTERNO',
        name: `Sarrafo de Travamento (MDF ${t}mm)`, qty: battens, w: 50.0, h: B, t, bev: 0.0,
        area: (battens * 50.0 * B) / 1e6,
        note: `Colar verticalmente nas paredes internas (50 × ${B.toFixed(0)} × ${t} mm)`
      });
    }

    // Módulo 10 — Grade Modular DIV (cols × rows) com encaixe meia-madeira
    if (matrixCols > 1 || matrixRows > 1) {
      const mDepth = 0.5 * (C_top + D_bot);
      if (matrixCols > 1) {
        pieces.push({
          kind: 'divider', orient: 'MATRIX_V',
          name: `Divisória Vertical Matriz [${matrixCols}×${matrixRows}]`,
          qty: matrixCols - 1, w: B, h: mDepth, t, bev: bev,
          area: ((matrixCols - 1) * B * mDepth) / 1e6,
          note: `${matrixCols - 1}× divisórias verticais com rasgo meia-madeira (largura ${t} mm × prof. ${(mDepth / 2).toFixed(0)} mm)`
        });
      }
      if (matrixRows > 1) {
        pieces.push({
          kind: 'divider', orient: 'MATRIX_H',
          name: `Divisória Horizontal Matriz [${matrixCols}×${matrixRows}]`,
          qty: matrixRows - 1, w: A, h: mDepth, t, bev: 0.0,
          area: ((matrixRows - 1) * A * mDepth) / 1e6,
          note: `${matrixRows - 1}× prateleiras horizontais com rasgo meia-madeira complementar`
        });
      }
    }
    if (hasWheelArch) {
      pieces.push({
        kind: 'divider', orient: 'WHEEL_ARCH',
        name: `Fechamento Interno Cx. de Rodas [2× K=${wheelK}×H=${wheelH}]`,
        qty: 2, w: wheelK, h: wheelH, t, bev: 0.0,
        area: (2.0 * (wheelK * wheelH + wheelJ * wheelH + 2.0 * wheelK * wheelJ)) / 1e6,
        note: `Recorte simétrico de caixas de roda na caçamba (K=${wheelK} × H=${wheelH} × J=${wheelJ} mm)`
      });
    }
    if (hasProtectBar) {
      pieces.push({
        kind: 'divider', orient: 'PROTECT_BAR',
        name: `Barra Estrutural de Proteção [50×E×${t}]`,
        qty: 1, w: 50.0, h: E_ext, t, bev: 0.0,
        area: (50.0 * E_ext) / 1e6,
        note: `Barra frontal de proteção/reforço para caçamba/paredão (50 × ${E_ext.toFixed(0)} × ${t} mm)`
      });
    }
  }

  // Dutos como peça real de BOM (com Lv cortado canônico unificado em mm inteiros)
  const lvMmCanon = (isVented && portGeom) ? Math.round(Math.max(0, portGeom.LvCm * 10.0)) : 0;
  const lvCmCanon = +(lvMmCanon / 10.0).toFixed(1);
  const portBom = [];
  if (isVented && portGeom) {
    const lvMm = lvMmCanon;
    const lvCmStr = lvCmCanon.toFixed(1);
    if (portGeom.isTri) {
      const hypMm = portGeom.hypCm * 10.0;
      const pLine = {
        kind: 'port', orient: 'DUTO', name: `Parede Duto Triângulo (${triA}×${triB} cm)`,
        qty: triCount, w: hypMm, h: lvMm, t, bev: 45.0, area: (triCount * hypMm * lvMm) / 1e6,
        note: `MDF ${t}mm em 45° nos cantos — comprimento cortado Lv = ${lvMm} mm (${lvCmStr} cm)`
      };
      pieces.push(pLine);
      portBom.push(pLine);
    } else if (portGeom.isSlot) {
      if (isBpSlot) {
        const bpVfQty = isBpDualSlot ? 2 : 1;
        const pLine = {
          kind: 'port', orient: 'DUTO_BP_TOP', name: isBpDualSlot ? `Parede Duto Quadrado Central VF [2× C×RF]` : `Parede Duto Quadrado Topo VF [C×RF]`,
          qty: bpVfQty, w: 0.5 * (C_top + D_bot), h: lvMm, t: slotWallThick, bev: 0.0, area: (bpVfQty * 0.5 * (C_top + D_bot) * lvMm) / 1e6,
          note: `MDF ${slotWallThick}mm — desce do tampo F2 na câmara VF (prof. C × altura RF = ${lvMm} mm)`
        };
        pieces.push(pLine);
        portBom.push(pLine);
      } else if (isSharedSlotVert) {
        const pLine = {
          kind: 'port', orient: 'DUTO_UNICO_V', name: `Parede Duto Único Vertical [2× B×R]`,
          qty: 2, w: B, h: lvMm, t: slotWallThick, bev: 0.0, area: (2.0 * B * lvMm) / 1e6,
          note: `2× MDF ${slotWallThick}mm paralelas no centro (abertura A3=${(slotH * 10).toFixed(0)} mm × Lv=${lvMm} mm)`
        };
        pieces.push(pLine);
        portBom.push(pLine);
      } else if (isDualVertSlot) {
        const pLine = {
          kind: 'port', orient: 'DUTO_DUAL_V', name: `Parede Duto Régua Vertical Simétrico [2× B×R]`,
          qty: 2, w: B, h: lvMm, t: slotWallThick, bev: 0.0, area: (2.0 * B * lvMm) / 1e6,
          note: `2× MDF ${slotWallThick}mm simétricas (esq. + dir.) — altura BD=${B.toFixed(0)} mm × Lv=${lvMm} mm`
        };
        pieces.push(pLine);
        portBom.push(pLine);
      } else if (hasCenterDiv && slotOrient === 'horizontal') {
        const a4Mm = Math.max(50.0, (A - t) / 2.0);
        const pLine = {
          kind: 'port', orient: 'DUTO', name: `Divisória Duto Régua [2× A4×R] (Horiz.)`,
          qty: 2, w: a4Mm, h: lvMm, t: slotWallThick, bev: 0.0, area: (2.0 * a4Mm * lvMm) / 1e6,
          note: `2× MDF ${slotWallThick}mm (uma por câmara) — largura A4=${a4Mm.toFixed(0)} mm × Lv=${lvMm} mm (${lvCmStr} cm)`
        };
        pieces.push(pLine);
        portBom.push(pLine);
      } else {
        const portRoutingEff = (boxType === 'bass-reflex') ? portRoutingRaw : 'straight';
        const isSideSlot = (portRoutingEff === 'side_firing');
        const a4Mm = isSideSlot
          ? ((slotOrient === 'horizontal') ? Math.min(C_top, D_bot) : B)
          : ((portType === 'slot_wall')
              ? ((slotOrient === 'horizontal') ? A : B)
              : ((slotOrient === 'horizontal') ? Math.min(A, slotW * 10.0) : Math.min(B, slotW * 10.0)));
        const rpSlot = computePortRoutingPlan({
          portRouting: portRoutingEff, portType, slotOrient, A, B, C_min: Math.min(C_top, D_bot), t,
          lvMm: Math.max(0, lvMm - portOffsetMm), slotHmm: slotH * 10.0, slotWallThick, numDucts: 1
        });
        if (portRoutingEff === 'l_bend' && rpSlot.l2Mm >= 10) {
          const l1Cut = Math.round(rpSlot.l1Mm);
          const l2Cut = Math.round(rpSlot.l2Mm);
          const pLine1 = {
            kind: 'port', orient: 'DUTO', name: `Divisória Duto Régua em L — Trecho 1 [A4×L1] (${slotOrient === 'horizontal' ? 'Horiz.' : 'Vert.'})`,
            qty: 1, w: a4Mm, h: l1Cut, t: slotWallThick, bev: 0.0, area: (a4Mm * l1Cut) / 1e6,
            note: `MDF ${slotWallThick}mm — parte do baffle p/ trás: L1 = ${l1Cut} mm (folga fundo ${Math.round(rpSlot.clearBackMm)} mm)`
          };
          const pLine2 = {
            kind: 'port', orient: 'DUTO_L2', name: `Divisória Duto Régua em L — Trecho 2 (90° Fundo) [A4×L2]`,
            qty: 1, w: a4Mm, h: l2Cut, t: slotWallThick, bev: 0.0, area: (a4Mm * l2Cut) / 1e6,
            note: `MDF ${slotWallThick}mm — dobra 90° paralelo ao fundo: L2 = ${l2Cut} mm (Total linha de centro Lv = ${lvMm} mm)`
          };
          pieces.push(pLine1, pLine2);
          portBom.push(pLine1, pLine2);
        } else {
          const pLine = {
            kind: 'port', orient: 'DUTO', name: (isSideSlot ? 'Divisória Duto Régua Lateral [Side-Firing]' : 'Divisória Duto Régua [A4×R]') + ` (${slotOrient === 'horizontal' ? 'Horiz.' : 'Vert.'})`,
            qty: 1, w: a4Mm, h: lvMm, t: slotWallThick, bev: 0.0, area: (a4Mm * lvMm) / 1e6,
            note: isSideSlot
              ? `MDF ${slotWallThick}mm — Side-Firing (Lateral Dir. · Eixo A): largura A4=${a4Mm.toFixed(0)} mm × Lv = ${lvMm} mm (${lvCmStr} cm)`
              : `MDF ${slotWallThick}mm — largura A4=${a4Mm.toFixed(0)} mm × comprimento R = Lv = ${lvMm} mm (${lvCmStr} cm)`
          };
          pieces.push(pLine);
          portBom.push(pLine);
        }
      }
    } else {
      const idMm = ductDia * 25.4;
      const odMm = idMm + 2.0 * ductThick;
      const portRoutingEff = (boxType === 'bass-reflex') ? portRoutingRaw : 'straight';
      const rpCyl = computePortRoutingPlan({
        portRouting: portRoutingEff, portType, slotOrient, A, B, C_min: Math.min(C_top, D_bot), t,
        lvMm: Math.max(0, lvMm - portOffsetMm), odMm, numDucts
      });
      const cylNote = (portRoutingEff === 'l_bend' && rpCyl.l2Mm >= 10)
        ? `Montagem em L (90°): ${numDucts}× [Trecho 1: ${Math.round(rpCyl.l1Mm)} mm + Joelho 90° (${Math.round(rpCyl.bendArcMm)} mm) + Trecho 2: ${Math.round(rpCyl.l2Mm)} mm] · Lv = ${lvMm} mm`
        : (portRoutingEff === 'side_firing'
          ? `Side-Firing (Lateral Dir. · Eixo A): cortar ${numDucts}× tubo(s) com Lv = ${lvMm} mm (${lvCmStr} cm)`
          : `Cortar ${numDucts}× tubo(s) com comprimento exato Lv = ${lvMm} mm (${lvCmStr} cm)`);
      const pLine = {
        kind: 'port', orient: 'DUTO', name: (isBp ? `Tubo Frontal VF Ø ${ductDia}"` : `Tubo PVC/ABS Ø ${ductDia}"`) + ` (Int ${idMm.toFixed(1)} / Ext ${odMm.toFixed(1)} mm)`,
        qty: numDucts, w: odMm, h: lvMm, t: ductThick, bev: 0.0, area: 0.0,
        note: cylNote
      };
      pieces.push(pLine);
      portBom.push(pLine);
    }
    // Em BP6 Paralela, adiciona o duto da câmara traseira (VR) como peça independente
    if (isBp6Parallel && lvRearMmCanon > 0) {
      const lvRCmStr = (lvRearMmCanon / 10.0).toFixed(1);
      if (isBpSlot) {
        const bpVrQty = isBpDualSlot ? 2 : 1;
        const pRear = {
          kind: 'port', orient: 'DUTO_BP_TOP_VR',
          name: isBpDualSlot ? `Parede Duto Quadrado Topo VR [2× C×R]` : `Parede Duto Quadrado Topo VR [C×R]`,
          qty: bpVrQty, w: 0.5 * (C_top + D_bot), h: lvRearMmCanon, t: slotWallThick, bev: 0.0, area: (bpVrQty * 0.5 * (C_top + D_bot) * lvRearMmCanon) / 1e6,
          note: `MDF ${slotWallThick}mm — desce do tampo F2 na câmara VR (${fbVr.toFixed(1)} Hz · altura R=${lvRearMmCanon} mm)`
        };
        pieces.push(pRear);
        portBom.push(pRear);
      } else {
        const idMm = ductDiaVr * 25.4;
        const odMm = idMm + 2.0 * ductThickVr;
        const pRear = {
          kind: 'port', orient: 'DUTO VR',
          name: `Tubo Câmara Traseira VR Ø ${ductDiaVr}" (Int ${idMm.toFixed(1)} / Ext ${odMm.toFixed(1)} mm)`,
          qty: numDuctsVr, w: odMm, h: lvRearMmCanon, t: ductThickVr, bev: 0.0, area: 0.0,
          note: `Câmara traseira VR (${fbVr.toFixed(1)} Hz) — cortar ${numDuctsVr}× tubo(s) Lv_rear = ${lvRearMmCanon} mm (${lvRCmStr} cm)`
        };
        pieces.push(pRear);
        portBom.push(pRear);
      }
    }
  }

  const totalArea = pieces.reduce((acc, p) => acc + p.area, 0.0);
  const woodWeightKg = totalArea * (t / 1000.0) * 750.0;
  const sheetArea = 2.75 * 1.83; // Chapa MDF padrão 2750x1830 mm (5.0325 m²)
  const sheetPrice = parseFloat(document.getElementById('wlSheetPrice')?.value) || 260;
  const sheetsNeeded = Math.max(0.25, (totalArea * 1.12) / sheetArea);
  const estCost = sheetsNeeded * sheetPrice;

  // Pisos mínimos dinâmicos & Validação Geométrica P0
  const drvSel = document.getElementById('driverPreset');
  const drvKey = drvSel ? drvSel.value : '';
  const driverName = activeDbDriverName
    || (PRESETS[drvKey] && PRESETS[drvKey].name)
    || (DB_DRIVERS_MAP[drvKey] && (DB_DRIVERS_MAP[drvKey].name || `${DB_DRIVERS_MAP[drvKey].brand || ''} ${DB_DRIVERS_MAP[drvKey].model || ''}`.trim()))
    || (drvSel && drvSel.selectedIndex >= 0 && drvSel.options[drvSel.selectedIndex] ? drvSel.options[drvSel.selectedIndex].text : 'Driver Atual');
  const tsDiaVal = parseFloat(document.getElementById('tsDia')?.value) || 12;
  const sdVal = parseFloat(document.getElementById('tsSd')?.value) || 500;
  lastWoodlockFloors = computeWoodlockFloors({
    driverName, tsDia: tsDiaVal, Sd_cm2: sdVal, nDrivers, boxType, planarStyle, t,
    VbrutoExact, bpVR: VbpRear + Vsub + VdutoRear, bpVF: Vb + Vduto,
    portType, numDucts, ductDia, ductThick, numDuctsVr, ductDiaVr, ductThickVr, slotW, slotH, slotWallThick, slotOrient, portLayout, bp6Mode, triCount, triA, triB
  });
  const wlAEl = document.getElementById('wlWidthA');
  const wlBEl = document.getElementById('wlHeightB');
  if (wlAEl) wlAEl.min = lastWoodlockFloors.minA;
  if (wlBEl) wlBEl.min = lastWoodlockFloors.minB;
  const minALbl = document.getElementById('wlMinALabel');
  const minBLbl = document.getElementById('wlMinBLabel');
  if (minALbl) minALbl.textContent = `(mín. ${lastWoodlockFloors.minA} mm)`;
  if (minBLbl) minBLbl.textContent = `(mín. ${lastWoodlockFloors.minB} mm)`;

  const meta = (currentCurves && currentCurves.meta) || {};
  const activeEnv = getAnalysisEnv();
  const simConstraints = currentCurves ? evaluatePhysicalConstraints(currentCurves, chartOpts.fMin, chartOpts.fMax) : [];
  const portRouting = (boxType === 'bass-reflex') ? portRoutingRaw : 'straight';
  const portRoutePlan = computePortRoutingPlan({
    portRouting, portType, slotOrient, A, B, C_min: Math.min(C_top, D_bot), t,
    lvMm: Math.max(0, Math.round(lvCmCanon * 10) - portOffsetMm), slotHmm: slotH * 10.0, slotWallThick,
    odMm: ductDia * 25.4 + 2.0 * ductThick, numDucts, hasCenterDiv
  });
  const validation = validateBuildGeometry({
    driverName, tsDia: tsDiaVal, Sd_cm2: sdVal, nDrivers, boxType, portOffsetMm, portRouting,
    A, B, C_top, D_bot, t, F_ext, E_ext, portGeom, planarGeom,
    portType, numDucts, ductDia, ductThick, numDuctsVr, ductDiaVr, ductThickVr, slotW, slotH, slotWallThick, slotOrient, portLayout,
    bpChambers, triCount, triA, triB, matrixCols, matrixRows,
    LvCm: lvCmCanon,
    simConstraints,
    airVel: Number.isFinite(meta.airVel) ? meta.airVel : undefined,
    velLimit: Number.isFinite(meta.velLimit) ? meta.velLimit : (portGeom ? portGeom.velLimit : undefined)
  });

  // Congela snapshot de construção (bassforge-buildpack/v1)
  lastBuildPack = {
    schema: 'bassforge-buildpack/v1',
    generatedAt: new Date().toISOString(),
    driver: {
      name: driverName,
      nDrivers,
      dia_in: tsDiaVal,
      Fs: parseFloat(document.getElementById('tsFs')?.value) || 0,
      Qes: parseFloat(document.getElementById('tsQes')?.value) || 0,
      Qms: parseFloat(document.getElementById('tsQms')?.value) || 0,
      Vas: parseFloat(document.getElementById('tsVas')?.value) || 0,
      Re: parseFloat(document.getElementById('tsRe')?.value) || 0,
      Sd: sdVal,
      Xmax: parseFloat(document.getElementById('tsXmax')?.value) || 0,
      Pe: parseFloat(document.getElementById('tsPe')?.value) || 0,
      Vsub: parseFloat(document.getElementById('tsVsub')?.value) || 0
    },
    acoustics: {
      boxType, Vb, Vr: VbpRear, Fb: meta.Fb || Fb, F3: meta.F3 || 0, FH: meta.FH || 0,
      fc: meta.fc || 0, hpfEnabled: isHpfEnabled, hpfHz: meta.hpfHz || 0,
      deltaT: Number.isFinite(meta.deltaT) ? meta.deltaT : 0,
      analysisEnv: activeEnv,
      mountMode,
      slotOrient,
      portLayout,
      portOffsetMm,
      portRouting,
      portRoutePlan,
      portGeom,
      hasCenterDiv,
      isSharedCenterPort,
      isDualVertSlot,
      isBpSlot,
      bpChambers,
      planarGeom,
      activeBraces: finalBraces.map(b => b.code),
      vehicleFit: {
        matrixCols, matrixRows,
        wheelArch: hasWheelArch ? { K: wheelK, H: wheelH, J: wheelJ } : null,
        protectBar: hasProtectBar
      },
      band: [chartOpts.fMin || 10, chartOpts.fMax || 1000],
      lvMm: lvMmCanon,
      lvRearMm: lvRearMmCanon,
      LvCm: lvCmCanon,
      SpCm2: portGeom ? +(portGeom.Sp * 10000).toFixed(1) : 0,
      Vsub: +Vsub.toFixed(2),
      Vduto: +(Vduto + VdutoRear).toFixed(2),
      Vbracing: +VbracingExact.toFixed(2),
      VtotSim: +(Vb + VbpRear + Vsub + Vduto + VdutoRear).toFixed(2),
      Vbruto: +VbrutoExact.toFixed(2),
      constraints: simConstraints
    },
    dimensions: {
      shape, angle: isTrap ? angle : 0, rearH: +rearH.toFixed(1), t, A, B, C_top: +C_top.toFixed(1), D_bot: +D_bot.toFixed(1),
      CG: planarGeom ? planarGeom.CG : null,
      F_ext: +F_ext.toFixed(1), E_ext: +E_ext.toFixed(1),
      C_ext_top: +C_ext_top.toFixed(1), D_ext_bot: +D_ext_bot.toFixed(1),
      V_ext: +V_ext.toFixed(1), totalAreaM2: +totalArea.toFixed(3),
      sheetsEst: +sheetsNeeded.toFixed(2), weightKg: +woodWeightKg.toFixed(1)
    },
    pieces,
    portBom,
    baffleHoles: validation.holes,
    validation
  };
  lastBuildPack.geometry = buildPgsGeometryModel(lastBuildPack);

  // CAD-11 & CAD-12: Propaga falhas de chapa MDF (2750x1830) e PGS G04/G08 para o bloqueio P0
  const pgsModel = lastBuildPack.geometry;
  const nestingRes = pgsModel && pgsModel.manufacturing ? pgsModel.manufacturing.nesting : null;
  if (nestingRes && Array.isArray(nestingRes.oversizedParts) && nestingRes.oversizedParts.length > 0) {
    const names = nestingRes.oversizedParts.map(p => `${p.name} (${p.w}×${p.h} mm)`).join(', ');
    validation.issues.push({
      level: 'critical',
      code: 'SHEET_OVERFLOW_P0',
      msg: `Peça(s) excedem a chapa MDF padrão (${nestingRes.sheetW}×${nestingRes.sheetH} mm): ${names}.`
    });
  }
  if (nestingRes && Array.isArray(nestingRes.invalidParts) && nestingRes.invalidParts.length > 0) {
    const names = nestingRes.invalidParts.map(p => `${p.name} (${p.w}×${p.h} mm)`).join(', ');
    validation.issues.push({
      level: 'critical',
      code: 'PART_DIM_INVALID_P0',
      msg: `Peça(s) com cota nula ou negativa (≤ 0 mm): ${names}.`
    });
  }
  const pgsChecks = (pgsModel && Array.isArray(pgsModel.validation)) ? pgsModel.validation : [];
  const g04Check = pgsChecks.find(c => c.code === 'G04');
  if (g04Check && !g04Check.pass) {
    validation.issues.push({
      level: 'critical',
      code: 'PGS_G04_VOLUME_DRIFT',
      msg: `Falha PGS G04 (desvio volumétrico > 0.35 L): ${g04Check.detail}.`
    });
  }
  const g08Check = pgsChecks.find(c => c.code === 'G08');
  const col3dList = (pgsModel && Array.isArray(pgsModel.collisions3d)) ? pgsModel.collisions3d : [];
  if (col3dList.length > 0) {
    col3dList.forEach(c3 => {
      if (!validation.issues.some(i => i.code === c3.code && i.msg === c3.msg)) {
        validation.issues.push({ level: 'critical', code: c3.code, msg: c3.msg });
      }
    });
  } else if (g08Check && !g08Check.pass && !validation.issues.some(i => i.code === 'PORT_DEPTH_COLLISION' || i.code === 'BAFFLE_HOLE_COLLISION')) {
    validation.issues.push({
      level: 'critical',
      code: 'PGS_G08_3D_COLLISION',
      msg: `Falha PGS G08 (colisão 3D): ${g08Check.detail}.`
    });
  }
  validation.criticalCount = validation.issues.filter(i => i.level === 'critical').length;
  validation.warnCount = validation.issues.filter(i => i.level === 'warn').length;
  validation.valid = (validation.criticalCount === 0);

  const summaryBox = document.getElementById('wlSummaryBox');
  if (summaryBox) {
    summaryBox.innerHTML = `
      <div><b>Balanço Volumétrico:</b> ${isFreeAir ? '<span style="color:var(--accent);font-weight:700;">Baffle Infinito (Vb → ∞ · Painel Único)</span>' : `Vb=${Vb.toFixed(1)}L${VbpRear > 0 ? ` + VR=${VbpRear.toFixed(1)}L` : ''} + Vsub=${Vsub.toFixed(1)}L + Vduto=${(Vduto + VdutoRear).toFixed(2)}L + Vtravas=${VbracingExact.toFixed(2)}L = <span style="color:var(--accent);font-weight:700;">${VbrutoExact.toFixed(2)} L Brutos</span>`}</div>
      <div><b>Cotas Internas [A×B×C/D]:</b> A=${A.toFixed(0)} mm | B=${B.toFixed(0)} mm | C=${C_top.toFixed(1)} mm | D=${D_bot.toFixed(1)} mm${planarGeom ? ` | <span style="color:#38bdf8;">CG=${planarGeom.CG} mm (Boca G=${planarGeom.recuoG} mm)</span>` : ''}</div>
      <div><b>Cotas Externas [F×E]:</b> F=${F_ext.toFixed(0)} mm | E=${E_ext.toFixed(0)} mm | Vol. Externo=${V_ext.toFixed(1)} L</div>
      <div><b>Modo Fundamental Painel (f₁₁):</b> s/ travas=${f11_unbraced.toFixed(0)} Hz ➔ <span style="color:#10b981;font-weight:700;">c/ travas=${f11_braced.toFixed(0)} Hz</span></div>
      <div><b>Chapa MDF &amp; Orçamento:</b> Área=${totalArea.toFixed(3)} m² (${sheetsNeeded.toFixed(2)} chapa 2750×1830) | Peso=<b>${woodWeightKg.toFixed(1)} kg</b> | Custo Est.: <span style="color:#fbbf24;font-weight:700;">R$ ${estCost.toFixed(2)}</span></div>
    `;
  }

  // Renderiza painel do Validador Geométrico P0 + trava botões de exportação se houver critical
  const valBox = document.getElementById('wlValidationBox');
  // Ocultação contextual de controles irrelevantes para a topologia ativa (mantendo todos os IDs no DOM)
  const toggleFieldGroup = (elId, show) => {
    const el = document.getElementById(elId);
    const grp = el && el.closest ? el.closest('.form-group') : null;
    if (grp) grp.style.display = show ? '' : 'none';
  };
  toggleFieldGroup('wlPlanarStyle', isPlanar);
  toggleFieldGroup('wlPlanarRecuoG', isPlanar);
  toggleFieldGroup('wlAngle', shape === 'trapezoidal');
  toggleFieldGroup('wlSlotOrient', isSlotType && !isPlanar && !isFreeAir);
  toggleFieldGroup('wlPortLayout', nDrivers >= 2 && boxType === 'bass-reflex');
  toggleFieldGroup('wlPortRouting', boxType === 'bass-reflex');
  if (valBox) {
    const hdrColor = validation.valid ? (validation.warnCount > 0 ? 'var(--warning)' : 'var(--success)') : 'var(--danger)';
    const hdrText = validation.valid
      ? (validation.warnCount > 0 ? `VIÁVEL COM AVISOS (${validation.warnCount})` : 'GEOMETRIA APROVADA PARA CORTE E FURAÇÃO')
      : `EXPORTAÇÃO BLOQUEADA — ${validation.criticalCount} ERRO(S) CRÍTICO(S) DE GEOMETRIA`;
    valBox.style.borderColor = hdrColor;
    const hasDepthErr = validation.issues.some(i => i.code === 'PORT_DEPTH_COLLISION');
    let quickFixHtml = '';
    if (hasDepthErr && boxType === 'bass-reflex') {
      const smartSug = computeSmartPortSuggestion(lastBuildPack);
      const isRoundNow = (portType === 'round' || portType === 'flared');
      const btns = [];
      if (portRouting !== 'l_bend') {
        btns.push(`<button type="button" class="chart-pill-btn" style="border-color:var(--accent); color:var(--accent);" onclick="applyPortFix('l_bend')">Dobrar em "L" (90°)</button>`);
      }
      if (isRoundNow) {
        btns.push(`<button type="button" class="chart-pill-btn" style="border-color:var(--accent); color:var(--accent);" onclick="applyPortFix('slot_l_bend')">Converter p/ Régua em "L"</button>`);
      }
      if (portRouting !== 'side_firing' && A > Math.min(C_top, D_bot) + 15) {
        btns.push(`<button type="button" class="chart-pill-btn" onclick="applyPortFix('side_firing')">Duto na Lateral (Eixo A)</button>`);
      }
      if (smartSug) {
        btns.push(`<button type="button" class="chart-pill-btn" style="border-color:var(--success); color:var(--success);" onclick="applyPortFix('reduce_area')">${escapeHtmlStr(smartSug.label)}</button>`);
      }
      btns.push(`<button type="button" class="chart-pill-btn" onclick="applyPortFix('stretch_depth')">Alongar Profundidade C</button>`);
      quickFixHtml = `<div style="margin-top:8px; padding-top:7px; border-top:1px dashed rgba(248,113,113,0.35);">` +
        `<div style="font-size:10px; font-weight:600; color:#cbd5e1; margin-bottom:5px; text-transform:uppercase; letter-spacing:0.4px;">Correção Rápida (1 Clique):</div>` +
        `<div style="display:flex; flex-wrap:wrap; gap:5px;">${btns.join('')}</div></div>`;
    }
    valBox.innerHTML =
      `<div style="font-weight:600; color:${hdrColor}; margin-bottom:4px;">${hdrText}</div>` +
      validation.issues.map(it => {
        const ic = it.level === 'critical' ? '[CRÍTICO]' : (it.level === 'warn' ? '[AVISO]' : '[INFO]');
        const cl = it.level === 'critical' ? '#fca5a5' : (it.level === 'warn' ? '#fde68a' : '#94a3b8');
        return `<div style="color:${cl}; margin-top:2px;"><b>${ic}</b> ${escapeHtmlStr(it.msg)}</div>`;
      }).join('') + quickFixHtml;
  }
  const btnExpHtml = document.getElementById('btnExportBuildPack');
  const btnExpJson = document.getElementById('btnExportBuildJson');
  const btnExpDxf = document.getElementById('btnExportBuildDxf');
  const btnExpDxf3d = document.getElementById('btnExportBuildDxf3d');
  const btnExpObj = document.getElementById('btnExportBuildObj');
  const btnExpFc = document.getElementById('btnExportBuildFreeCad');
  if (btnExpHtml) {
    btnExpHtml.disabled = !validation.valid;
    btnExpHtml.style.opacity = validation.valid ? '1' : '0.45';
    btnExpHtml.title = validation.valid ? 'Exportar arquivo de obra HTML imprimível' : 'Bloqueado: corrija os erros críticos de geometria acima antes de exportar';
  }
  if (btnExpJson) {
    btnExpJson.disabled = !validation.valid;
    btnExpJson.style.opacity = validation.valid ? '1' : '0.45';
  }
  if (btnExpDxf) {
    btnExpDxf.disabled = !validation.valid;
    btnExpDxf.style.opacity = validation.valid ? '1' : '0.45';
    btnExpDxf.title = validation.valid ? 'Exportar desenho técnico 2D DXF R12 em milímetros (1:1) para CAD/CNC' : 'Bloqueado: corrija os erros críticos de geometria antes de exportar';
  }
  if (btnExpDxf3d) {
    btnExpDxf3d.disabled = !validation.valid;
    btnExpDxf3d.style.opacity = validation.valid ? '1' : '0.45';
    btnExpDxf3d.title = validation.valid ? 'Exportar modelo 3D wireframe/3DFACE (.dxf) para CAD' : 'Bloqueado: corrija os erros críticos de geometria antes de exportar';
  }
  if (btnExpObj) {
    btnExpObj.disabled = !validation.valid;
    btnExpObj.style.opacity = validation.valid ? '1' : '0.45';
    btnExpObj.title = validation.valid ? 'Exportar modelo 3D sólido (.obj em mm) para SketchUp, Blender, FreeCAD ou Visualizador 3D' : 'Bloqueado: corrija os erros críticos de geometria antes de exportar';
  }
  if (btnExpFc) {
    btnExpFc.disabled = !validation.valid;
    btnExpFc.style.opacity = validation.valid ? '1' : '0.45';
    btnExpFc.title = validation.valid ? 'Exportar macro autocontida (.FCMacro) para construção 3D B-Rep no FreeCAD 1.1' : 'Bloqueado: corrija os erros críticos de geometria antes de exportar';
  }
  const btnPrintA4 = document.getElementById('btnPrintDossierA4');
  if (btnPrintA4) {
    btnPrintA4.disabled = !validation.valid;
    btnPrintA4.style.opacity = validation.valid ? '1' : '0.45';
    btnPrintA4.title = validation.valid ? 'Imprimir / Salvar Dossiê Técnico A4 em PDF' : 'Bloqueado: corrija os erros críticos de geometria antes de imprimir';
  }
  const menuExpHtml = document.getElementById('menuExportBuildPackHtml');
  if (menuExpHtml) {
    menuExpHtml.disabled = !validation.valid;
    menuExpHtml.style.opacity = validation.valid ? '1' : '0.45';
    menuExpHtml.title = validation.valid ? 'Exportar Pacote de Obra (HTML)' : 'Bloqueado: corrija os erros críticos de geometria antes de exportar';
  }
  const menuPrintA4 = document.getElementById('menuPrintBuildPackA4');
  if (menuPrintA4) {
    menuPrintA4.disabled = !validation.valid;
    menuPrintA4.style.opacity = validation.valid ? '1' : '0.45';
    menuPrintA4.title = validation.valid ? 'Imprimir / Salvar Dossiê A4 (PDF)' : 'Bloqueado: corrija os erros críticos de geometria antes de imprimir';
  }

  // Verificador de Alojamento no Veículo
  const trunkEl = document.getElementById('wlTrunkResult');
  if (trunkEl) {
    const tW = parseFloat(document.getElementById('wlTrunkW')?.value) || 950;
    const tH = parseFloat(document.getElementById('wlTrunkH')?.value) || 500;
    const tD = parseFloat(document.getElementById('wlTrunkD')?.value) || 520;
    const wCut = parseFloat(document.getElementById('wlWheelCut')?.value) || 0;
    const maxExtD = Math.max(C_ext_top, D_ext_bot);
    const trunkAvailL = Math.max(0, ((tW * tH * tD) / 1e6) - wCut);
    const fitsDims = (F_ext <= tW && E_ext <= tH && maxExtD <= tD);
    const fitsVol = (V_ext <= trunkAvailL);
    const ok = fitsDims && fitsVol;
    trunkEl.innerHTML =
      `<div><b>Caixa Externa:</b> ${F_ext.toFixed(0)} × ${E_ext.toFixed(0)} × ${maxExtD.toFixed(0)} mm (${V_ext.toFixed(1)} L)</div>` +
      `<div><b>Espaço Livre Veículo:</b> ${tW} × ${tH} × ${tD} mm − ${wCut}L = <b>${trunkAvailL.toFixed(1)} L</b></div>` +
      `<div style="margin-top:4px; color:${ok ? '#4ade80' : '#f87171'}; font-weight:700;">` +
      (ok ? `✅ CABE COM FOLGA (sobram ${(trunkAvailL - V_ext).toFixed(1)} L no alojamento)` : `⚠️ NÃO CABE: revise Largura A / Altura B ou reduza Vb (${!fitsDims ? 'excede cota externa' : 'excede volume'})`) + `</div>`;
  }
  updateReverseVolume();

  const tbody = document.getElementById('cutSheetTableBody');
  if (tbody) {
    tbody.innerHTML = pieces.map(p => `
      <tr>
        <td style="font-weight:600; color:${p.kind === 'port' ? '#fb923c' : (p.kind === 'batten' ? '#a78bfa' : '#fff')};">${escapeHtmlStr(p.name)}</td>
        <td>${p.qty}x</td>
        <td style="color:var(--accent); font-weight:700;">${p.w.toFixed(1)} mm</td>
        <td style="color:var(--accent); font-weight:700;">${p.h.toFixed(1)} mm</td>
        <td>${p.bev.toFixed(1)}°</td>
        <td>${p.area > 0 ? p.area.toFixed(3) + ' m²' : '—'}</td>
        <td style="color:#9ca3af;">${escapeHtmlStr(p.note)}</td>
      </tr>
    `).join('');
  }

  // Tabela de Furação do Baffle
  const originNote = document.getElementById('wlBaffleOriginNote');
  if (originNote) {
    originNote.textContent = `Painel Frontal externo F=${F_ext.toFixed(0)} × E=${E_ext.toFixed(0)} mm (MDF ${t} mm). Medir X a partir da borda ESQUERDA externa e Y a partir da borda INFERIOR externa.`;
  }
  const hBody = document.getElementById('wlHolesTableBody');
  if (hBody) {
    hBody.innerHTML = validation.holes.map(h => {
      const dimTxt = h.shape === 'round'
        ? `Ø ${h.dia.toFixed(1)} mm`
        : (h.shape === 'slot' ? `${h.w.toFixed(0)} × ${h.h.toFixed(0)} mm` : `Triângulo ${h.triA.toFixed(0)} × ${h.triB.toFixed(0)} mm`);
      const flTxt = h.kind === 'driver'
        ? `Flange Ø ${h.flangeDia} mm (est.)`
        : (h.lvMm ? `Lv = ${h.lvMm.toFixed(0)} mm` : '—');
      const statusColor = h.collision ? '#f87171' : '#e2e8f0';
      return `
        <tr>
          <td style="font-weight:600; color:${statusColor};">${h.collision ? '⛔ ' : ''}${escapeHtmlStr(h.label)}</td>
          <td>${h.kind === 'driver' ? 'Transdutor' : 'Duto'} (${h.shape})</td>
          <td style="color:var(--accent); font-weight:700;">${h.xExt.toFixed(1)} mm</td>
          <td style="color:var(--accent); font-weight:700;">${h.yExt.toFixed(1)} mm</td>
          <td style="font-weight:700;">${dimTxt}</td>
          <td style="color:#9ca3af;">${flTxt}</td>
        </tr>
      `;
    }).join('');
  }

  renderActiveWoodlockCanvas();
}

let wlViewMode = 'exploded';
let wlExplodeRatio = 0.0;
