// ============================================================================
// MOTOR WOODLOCK CAD + VALIDADOR GEOMÉTRICO P0 + AUTOFIX + PACOTE DE CONSTRUÇÃO
// ============================================================================
let lastBuildPack = null;
let lastWoodlockFloors = { minA: 150, minB: 150, diaIn: 12, flangeOD: 315, cutoutDia: 282 };

function computeWoodlockFloors(opts) {
  const nDrivers = Math.max(1, parseInt(opts.nDrivers) || 1);
  const tsDia = parseFloat(opts.tsDia) || 12;
  const Sd_cm2 = parseFloat(opts.Sd_cm2) || 500;
  const driverName = String(opts.driverName || '');
  const boxType = opts.boxType || 'bass-reflex';
  const isVented = (boxType === 'bass-reflex' || boxType === 'bp4' || boxType === 'bp6');
  const portType = opts.portType || 'round';
  const isSlot = (portType === 'slot' || portType === 'slot_wall');
  const isTri = (portType === 'triangle');
  const numDucts = Math.max(1, parseInt(opts.numDucts) || 1);
  const ductHoleDia = (parseFloat(opts.ductDia) || 4.0) * 25.4 + 2.0 * (parseFloat(opts.ductThick) || 1.5);
  const numDuctsVr = Math.max(1, parseInt(opts.numDuctsVr) || 1);
  const ductHoleDiaVr = (parseFloat(opts.ductDiaVr) || parseFloat(opts.ductDia) || 4.0) * 25.4 + 2.0 * (parseFloat(opts.ductThickVr) || parseFloat(opts.ductThick) || 1.5);
  const slotWmm = (parseFloat(opts.slotW) || 35.0) * 10.0;
  const slotHmm = (parseFloat(opts.slotH) || 6.0) * 10.0;
  const slotWallThick = parseFloat(opts.slotWallThick) || 18.0;
  const slotOrient = opts.slotOrient || 'horizontal';
  const portLayout = opts.portLayout || 'standard';
  const bp6Mode = opts.bp6Mode || 'parallel';
  const planarStyle = opts.planarStyle || 'square';
  const t = parseFloat(opts.t) || 18.0;
  const isBp = (boxType === 'bp4' || boxType === 'bp6');
  const isBp6Parallel = (boxType === 'bp6' && bp6Mode === 'parallel');
  const isBpSlot = (isBp && (boxType === 'bp4' || isBp6Parallel) && isSlot);
  const isPlanar = (boxType === 'planar');
  const isFreeAir = (boxType === 'free-air');
  const isSharedCenterPort = (boxType === 'bass-reflex' && nDrivers === 2 && portLayout === 'center_shared' && (portType === 'round' || isSlot));
  const isDualVertSlot = (boxType === 'bass-reflex' && nDrivers === 2 && !isSharedCenterPort && isSlot && slotOrient === 'vertical');
  const hasCenterDiv = (!isFreeAir && !isBp && nDrivers === 2 && !isSharedCenterPort && !isDualVertSlot);

  const pistonDiaCm = 2.0 * Math.sqrt(Math.max(1, Sd_cm2) / Math.PI);
  const diaRatio = pistonDiaCm / (tsDia * 2.54);
  const estDiaFromSd = Math.round(pistonDiaCm / (2.54 * 0.84));
  let effectiveDiaIn = tsDia;
  const sdConsistent = (diaRatio >= 0.65 && diaRatio <= 0.94);
  if (!sdConsistent) {
    effectiveDiaIn = Math.max(tsDia, estDiaFromSd);
    const nameMatch = driverName.match(/(?:^|[\s\-_])(6\.5|8|10|12|15|18|21)(?:"|″|\s*pol|\s*SUB|\s*W\d|\s*SWT)/i);
    if (nameMatch) {
      const nd = parseFloat(nameMatch[1]);
      if (Number.isFinite(nd) && Math.abs(nd - tsDia) >= 1.5) effectiveDiaIn = Math.max(effectiveDiaIn, nd);
    }
  }

  const drvGeom = estimateDriverCutoutAndFlange(effectiveDiaIn);
  const flangeOD = drvGeom.flangeOD;
  const cols = nDrivers <= 2 ? nDrivers : Math.ceil(nDrivers / 2);
  const rows = nDrivers <= 2 ? 1 : 2;
  const edgeMargin = 16;
  const minGap = 18;

  let minB = rows * flangeOD + (rows - 1) * minGap + 20;
  let minA = cols * flangeOD + (cols - 1) * minGap + 20 + (hasCenterDiv ? t + 2 * edgeMargin : 0);

  if (isVented && !isTri && !isBp) {
    if (isSharedCenterPort) {
      if (isSlot) {
        minA = Math.max(minA, 2 * flangeOD + slotHmm + 2 * slotWallThick + 4 * edgeMargin);
        minB = Math.max(minB, flangeOD + 20);
      } else {
        minA = Math.max(minA, 2 * flangeOD + ductHoleDia + 2 * minGap + 2 * edgeMargin);
        minB = Math.max(minB, flangeOD + 20, ductHoleDia + 2 * edgeMargin);
      }
    } else if (isSlot) {
      if (slotOrient === 'horizontal') {
        minA = Math.max(minA, cols * flangeOD + 20 + (hasCenterDiv ? t + 2 * edgeMargin : 0));
        minB = Math.max(minB, rows * flangeOD + slotHmm + slotWallThick + 2 * edgeMargin);
      } else {
        minA = Math.max(minA, cols * flangeOD + (isDualVertSlot ? 2 : 1) * (slotHmm + slotWallThick) + 2 * edgeMargin + minGap + (hasCenterDiv ? t + 2 * edgeMargin : 0));
        minB = Math.max(minB, Math.min(slotWmm, rows * flangeOD + 20));
      }
    } else if (nDrivers === 1) {
      minA = Math.max(minA, flangeOD + ductHoleDia + 2 * edgeMargin + minGap + 12);
      const minBPortStack = numDucts * ductHoleDia + (numDucts - 1) * minGap + 2 * edgeMargin;
      minB = Math.max(minB, minBPortStack);
    } else {
      minA = Math.max(minA, numDucts * ductHoleDia + (numDucts + 1) * edgeMargin + (hasCenterDiv ? t : 0));
      minB = Math.max(minB, rows * flangeOD + ductHoleDia + minGap + 2 * edgeMargin);
    }
  } else if (isBp) {
    // Em BP4/BP6, o baffle é a divisória interna B×C (driver na divisória, dutos no tampo)
    minB = Math.max(minB, rows * flangeOD + (rows - 1) * minGap + 20);
    const nDivBp = (nDrivers === 2) ? 2 : 1;
    const minRearW = Math.max(
      Math.round(0.36 * flangeOD + 20),
      isBp6Parallel
        ? (isBpSlot ? (slotHmm + slotWallThick + 2 * edgeMargin) : (ductHoleDiaVr + 2 * edgeMargin))
        : 90
    );
    const minFrontW = Math.max(
      85,
      isBpSlot ? (slotHmm + slotWallThick + 2 * edgeMargin) : (ductHoleDia + 2 * edgeMargin)
    );
    const bpVR = Math.max(1.0, parseFloat(opts.bpVR) || 50.0);
    const bpVF = Math.max(1.0, parseFloat(opts.bpVF) || 50.0);
    const fRear = bpVR / (bpVR + bpVF);
    const fFront = bpVF / (bpVR + bpVF);
    const minANetRear = (nDrivers === 2 ? 2 : 1) * minRearW / Math.max(0.18, fRear);
    const minANetFront = minFrontW / Math.max(0.18, fFront);
    let minABp = Math.max(280, minANetRear + nDivBp * t, minANetFront + nDivBp * t);
    // Garante que A não cresça tanto a ponto de reduzir C abaixo do flange do driver na divisória B×C
    const vBrutoBp = parseFloat(opts.VbrutoExact) || 0;
    if (vBrutoBp > 0) {
      const maxAForDivider = (vBrutoBp * 1e6) / Math.max(1, minB * (flangeOD + 15)) + nDivBp * t;
      if (Number.isFinite(maxAForDivider) && maxAForDivider >= 240) {
        minABp = Math.min(minABp, Math.floor(maxAForDivider));
      }
    }
    minA = Math.max(240, minABp);
  } else if (isPlanar && planarStyle === 'square') {
    // Em Planar Quadrada, o baffle útil tem altura C4 = B - min(110, 0.18*B) - t acima da divisória
    const throatReserve = 110 + t;
    minB = Math.max(minB, rows * flangeOD + throatReserve + 20);
  }

  return {
    minA: Math.ceil(Math.max(150, minA)),
    minB: Math.ceil(Math.max(150, minB)),
    diaIn: effectiveDiaIn,
    flangeOD,
    cutoutDia: drvGeom.cutoutDia
  };
}

function showWlAutofixBanner(msg, isGuard = false) {
  const el = document.getElementById('wlAutofixBanner');
  if (!el) return;
  if (!msg) { el.style.display = 'none'; el.innerHTML = ''; return; }
  el.style.display = 'block';
  el.style.borderColor = isGuard ? 'rgba(245,158,11,0.55)' : 'rgba(0,212,255,0.45)';
  el.style.background = isGuard ? 'rgba(245,158,11,0.12)' : 'rgba(0,212,255,0.10)';
  el.style.color = isGuard ? '#fde68a' : '#bae6fd';
  el.innerHTML = msg;
}

function autofixWoodlockGeometry(reason = '', opts = {}) {
  const elA = document.getElementById('wlWidthA');
  const elB = document.getElementById('wlHeightB');
  if (!elA || !elB) return { fixed: false, changes: [] };

  updateWoodlock();
  if (!lastBuildPack) return { fixed: false, changes: [] };

  let floors = lastWoodlockFloors;
  const changes = [];
  let A = parseFloat(elA.value) || floors.minA;
  let B = parseFloat(elB.value) || floors.minB;
  const origA = A, origB = B;

  // 0. Corrige tsDia se inconsistente com Sd / nome (sem alterar parâmetros acústicos)
  const tsDiaEl = document.getElementById('tsDia');
  if (tsDiaEl) {
    const curDia = parseFloat(tsDiaEl.value) || 12;
    if (Math.abs(curDia - floors.diaIn) >= 1.5) {
      tsDiaEl.value = floors.diaIn;
      changes.push(`Ø nominal ${curDia}″→${floors.diaIn}″`);
    }
  }

  // 0.5. Corrige PORT_LV_NEGATIVE (área do duto insuficiente para Lv > 0 em régua, triângulo ou cilíndrico)
  if (lastBuildPack && lastBuildPack.validation.issues.some(i => i.code === 'PORT_LV_NEGATIVE')) {
    const ac0 = lastBuildPack.acoustics || {};
    const pType = document.getElementById('portType')?.value || 'round';
    const isSlot0 = (pType === 'slot' || pType === 'slot_wall');
    const isTri0 = (pType === 'triangle');
    const boxType0 = document.getElementById('boxType')?.value || 'bass-reflex';
    const isBp0 = (boxType0 === 'bp4' || boxType0 === 'bp6');
    const kEnd0 = (pType === 'slot_wall' || isTri0) ? 1.343 : (pType === 'flared' ? 0.850 : 0.732);
    const minAreaCm2For = (vbL, fbHz, targetLvM = 0.06) => {
      const w = 2.0 * Math.PI * Math.max(1.0, fbHz);
      const aCoef = (339.8 * 339.8) / (w * w * Math.max(0.001, vbL / 1000.0));
      const bCoef = kEnd0 * 2.0 / Math.sqrt(Math.PI);
      const u = (bCoef + Math.sqrt(bCoef * bCoef + 4.0 * aCoef * targetLvM)) / (2.0 * aCoef);
      return u * u * 10000.0;
    };
    const vb0 = Math.max(1, parseFloat(document.getElementById('vbInput')?.value) || 50);
    const fb0 = Math.max(10, parseFloat(document.getElementById('fbInput')?.value) || 40);
    const vr0 = Math.max(1, parseFloat(document.getElementById('vrInput')?.value) || 50);
    const fbVr0 = Math.max(10, parseFloat(document.getElementById('fbVrInput')?.value) || 35);
    let needAreaCm2 = (ac0.lvMm <= 0) ? minAreaCm2For(vb0, fb0, 0.065) : 0;
    if (boxType0 === 'bp6' && ac0.lvRearMm <= 0) {
      needAreaCm2 = Math.max(needAreaCm2, minAreaCm2For(vr0, fbVr0, 0.065));
    }
    if (isSlot0 && needAreaCm2 > 0) {
      const swEl = document.getElementById('slotW');
      const shEl = document.getElementById('slotH');
      if (swEl && shEl) {
        let sw = Math.max(10, parseFloat(swEl.value) || 35);
        let sh = Math.max(2, parseFloat(shEl.value) || 6);
        const origSw = sw, origSh = sh;
        const slotOr0 = document.getElementById('wlSlotOrient')?.value || 'horizontal';
        const cAvailMm = Math.min(lastBuildPack?.dimensions?.C_top || 420, lastBuildPack?.dimensions?.D_bot || 420);
        const dimSpanMm = isBp0 ? cAvailMm : (slotOr0 === 'vertical' ? B : A);
        const maxSw = Math.max(20, Math.min(58, Math.floor(dimSpanMm / 10.0) - 2));
        const maxSh = isBp0 ? 18.0 : 20.0;
        let shTry = Math.ceil((needAreaCm2 / sw) * 2) / 2;
        if (shTry > 12.0 && sw < maxSw) {
          sw = Math.min(maxSw, Math.ceil((needAreaCm2 / 11.0) * 2) / 2);
          shTry = Math.ceil((needAreaCm2 / sw) * 2) / 2;
        }
        sh = Math.max(sh, Math.min(maxSh, shTry));
        if (sw > maxSw) sw = maxSw;
        swEl.value = sw.toFixed(1);
        shEl.value = sh.toFixed(1);
        if (sw !== origSw || sh !== origSh) {
          changes.push(`Régua ${origSw.toFixed(0)}×${origSh.toFixed(1)}→${sw.toFixed(0)}×${sh.toFixed(1)} cm (Lv>0)`);
          recalculate();
          updateWoodlock();
        }
      }
    } else if (isTri0 && needAreaCm2 > 0) {
      const nTri = Math.max(1, Math.min(4, parseInt(document.getElementById('triCount')?.value) || 2));
      const aEl = document.getElementById('triA');
      const bEl = document.getElementById('triB');
      if (aEl && bEl) {
        const leg = Math.ceil(Math.sqrt((2.0 * needAreaCm2) / nTri) * 2) / 2;
        aEl.value = leg.toFixed(1);
        bEl.value = leg.toFixed(1);
        changes.push(`Triângulo catetos→${leg.toFixed(1)} cm (Lv>0)`);
        recalculate();
        updateWoodlock();
      }
    } else if (!isSlot0 && !isTri0) {
      const nEl = document.getElementById('numDucts');
      const dEl = document.getElementById('ductDia');
      if (ac0.lvMm <= 0 && nEl && dEl) {
        for (const [tryN, tryD] of [[1, 6], [1, 8], [1, 10], [2, 6], [2, 8]]) {
          nEl.value = String(tryN);
          dEl.value = String(tryD);
          recalculate();
          updateWoodlock();
          if (lastBuildPack && lastBuildPack.acoustics && lastBuildPack.acoustics.lvMm >= 50) {
            changes.push(`Duto VF→${tryN}×${tryD}″ (Lv>0)`);
            break;
          }
        }
      }
      const nVrEl = document.getElementById('numDuctsVr');
      const dVrEl = document.getElementById('ductDiaVr');
      if (boxType0 === 'bp6' && lastBuildPack?.acoustics?.lvRearMm <= 0 && nVrEl && dVrEl) {
        for (const [tryN, tryD] of [[1, 5], [1, 6], [1, 8], [2, 6], [2, 8]]) {
          nVrEl.value = String(tryN);
          dVrEl.value = String(tryD);
          recalculate();
          updateWoodlock();
          if (lastBuildPack && lastBuildPack.acoustics && lastBuildPack.acoustics.lvRearMm >= 50) {
            changes.push(`Duto VR→${tryN}×${tryD}″ (Lv>0)`);
            break;
          }
        }
      }
    }
  }

  floors = lastWoodlockFloors;
  // 1. Sobe B (ou inicia no mínimo exato quando resetToMin=true)
  const roundUp5 = v => Math.ceil(v / 5) * 5;
  if (opts.resetToMin) {
    if (B !== floors.minB) {
      B = floors.minB;
      elB.value = B;
      changes.push(`B ${origB.toFixed(0)}→${B} mm (mín.)`);
    }
    if (A !== floors.minA) {
      A = floors.minA;
      elA.value = A;
      changes.push(`A ${origA.toFixed(0)}→${A} mm (mín.)`);
    }
  } else {
    if (B < floors.minB) {
      B = floors.minB;
      elB.value = B;
      changes.push(`B ${origB.toFixed(0)}→${B} mm`);
    }

    // 2. Sobe A até o piso de drivers + dutos + gaps
    if (A < floors.minA) {
      A = floors.minA;
      elA.value = A;
      changes.push(`A ${origA.toFixed(0)}→${A} mm`);
    }
  }

  // 3. Revalida; em BP4/BP6 dutos descem do tampo ao longo de B (cresce B se PORT_DEPTH_COLLISION); em dutada frontal/divisória BP reduz A/B p/ crescer C
  updateWoodlock();
  if (lastBuildPack && !lastBuildPack.validation.valid) {
    const boxTypeP = String(document.getElementById('boxType')?.value || '').toLowerCase();
    const isBpActive = (boxTypeP === 'bp4' || boxTypeP === 'bp6');
    const hasPortDepthErr = () => lastBuildPack.validation.issues.some(i => i.code === 'PORT_DEPTH_COLLISION');
    const hasBpDivDepthErr = () => lastBuildPack.validation.issues.some(i => i.code === 'BP_DIVIDER_DEPTH_FIT');
    const acP0 = lastBuildPack.acoustics || {};
    let lvNeedBp = isBpActive ? Math.max(acP0.lvMm || 0, boxTypeP === 'bp6' ? (acP0.lvRearMm || 0) : 0) : 0;
    let minBForBpPort = isBpActive ? roundUp5(Math.max(floors.minB, lvNeedBp + 55)) : floors.minB;
    if (isBpActive && hasPortDepthErr()) {
      // Primeiro tenta manter B saudável reduzindo Ø do duto (ou slotH) se Lv estoura B atual
      const pTypeBp = document.getElementById('portType')?.value || 'round';
      if (pTypeBp === 'round' || pTypeBp === 'flared') {
        const shrinkChamberDuct = (dId, isRear) => {
          const dEl = document.getElementById(dId);
          if (!dEl) return;
          for (let step = 0; step < 5; step++) {
            const acNow = lastBuildPack?.acoustics || {};
            const lvCheck = isRear ? (acNow.lvRearMm || 0) : (acNow.lvMm || 0);
            if (lvCheck <= B - 55) break;
            const curD = parseFloat(dEl.value) || 6;
            if (curD <= 3) break;
            const nextD = Math.max(3, curD - 1);
            dEl.value = String(nextD);
            recalculate();
            updateWoodlock();
            changes.push(`Duto ${isRear ? 'VR' : 'VF'} Ø ${curD}→${nextD}″ (folga B)`);
          }
        };
        shrinkChamberDuct('ductDia', false);
        if (boxTypeP === 'bp6') shrinkChamberDuct('ductDiaVr', true);
      } else if (pTypeBp === 'slot' || pTypeBp === 'slot_wall') {
        const shEl = document.getElementById('slotH');
        if (shEl) {
          for (let step = 0; step < 6; step++) {
            if (!hasPortDepthErr()) break;
            const curSh = parseFloat(shEl.value) || 6;
            if (curSh <= 2.5) break;
            const nextSh = Math.max(2.5, Math.round((curSh - 1.0) * 2) / 2);
            shEl.value = nextSh.toFixed(1);
            recalculate();
            updateWoodlock();
            if ((lastBuildPack?.acoustics?.lvMm || 0) <= 0 || (boxTypeP === 'bp6' && (lastBuildPack?.acoustics?.lvRearMm || 0) <= 0)) {
              shEl.value = curSh.toFixed(1);
              recalculate();
              updateWoodlock();
              break;
            }
            changes.push(`Régua BP H ${curSh.toFixed(1)}→${nextSh.toFixed(1)} cm (folga B)`);
          }
        }
      }
      const acNow2 = lastBuildPack?.acoustics || {};
      lvNeedBp = Math.max(acNow2.lvMm || 0, boxTypeP === 'bp6' ? (acNow2.lvRearMm || 0) : 0);
      minBForBpPort = roundUp5(Math.max(floors.minB, lvNeedBp + 55));
      if (hasPortDepthErr()) {
        const targetB = minBForBpPort;
        if (targetB > B && targetB <= 650) {
          const prevB = B;
          B = targetB;
          elB.value = B;
          changes.push(`B ${prevB.toFixed(0)}→${B} mm (folga duto topo)`);
          updateWoodlock();
        }
      }
      // Atualiza floors após ajuste de Ø/H do duto BP e recolhe A ao mínimo físico se resetToMin
      floors = lastWoodlockFloors;
      if (opts.resetToMin && A > floors.minA) {
        const prevA = A;
        A = floors.minA;
        elA.value = A;
        changes.push(`A ${prevA.toFixed(0)}→${A} mm (mín. BP)`);
        updateWoodlock();
      }
    }
    floors = lastWoodlockFloors;
    const needsMoreDepth = () => isBpActive ? hasBpDivDepthErr() : (hasPortDepthErr() || hasBpDivDepthErr());
    let hasDepthErr = needsMoreDepth();
    if (hasDepthErr && A > floors.minA) {
      const targetA = roundUp5(floors.minA);
      if (targetA < A) {
        const prevA = A;
        A = targetA;
        elA.value = A;
        changes.push(`A ${prevA.toFixed(0)}→${A} mm (profundidade C)`);
        updateWoodlock();
        hasDepthErr = needsMoreDepth();
      }
    }
    if (hasDepthErr && !(isBpActive && hasPortDepthErr()) && B > minBForBpPort) {
      const targetB = roundUp5(minBForBpPort);
      if (targetB < B) {
        const prevB = B;
        B = targetB;
        elB.value = B;
        changes.push(`B ${prevB.toFixed(0)}→${B} mm (profundidade C)`);
        updateWoodlock();
      }
    }
    // Se em caixa dutada frontal ainda houver PORT_DEPTH_COLLISION com régua, reduz slotH mantendo Lv >= 6 cm
    const pTypeNow = document.getElementById('portType')?.value || 'round';
    if (!isBpActive && hasPortDepthErr() && (pTypeNow === 'slot' || pTypeNow === 'slot_wall')) {
      const shEl = document.getElementById('slotH');
      if (shEl) {
        let shCur = parseFloat(shEl.value) || 8.0;
        const origSh = shCur;
        while (shCur > 3.5 && hasPortDepthErr()) {
          const nextSh = +(shCur - 1.0).toFixed(1);
          shEl.value = nextSh.toFixed(1);
          recalculate();
          updateWoodlock();
          if (lastBuildPack?.acoustics?.lvMm <= 45) {
            shEl.value = shCur.toFixed(1);
            recalculate();
            updateWoodlock();
            break;
          }
          shCur = nextSh;
        }
        if (shCur !== origSh) changes.push(`Régua H ${origSh.toFixed(1)}→${shCur.toFixed(1)} cm (folga C)`);
      }
    }
  }

  // 4. Se ainda houver colisão residual de borda/furos, dá um passo de segurança em A e B
  if (lastBuildPack && !lastBuildPack.validation.valid) {
    const hasBaffleErr = lastBuildPack.validation.issues.some(i => i.code === 'BAFFLE_BORDER_OVERFLOW' || i.code === 'BAFFLE_HOLE_COLLISION');
    if (hasBaffleErr) {
      const prevA = A, prevB = B;
      A = Math.max(A, roundUp5(floors.minA + 25));
      B = Math.max(B, roundUp5(floors.minB + 15));
      elA.value = A;
      elB.value = B;
      if (A !== prevA) changes.push(`A ${prevA.toFixed(0)}→${A} mm`);
      if (B !== prevB) changes.push(`B ${prevB.toFixed(0)}→${B} mm`);
      updateWoodlock();
    }
  }

  // 4.5. Em resetToMin, evita caixas excessivamente profundas ("túnel fino" C >> B, ex. BP4/BP6 com 160L+)
  if (opts.resetToMin && lastBuildPack && lastBuildPack.dimensions) {
    floors = lastWoodlockFloors;
    const btReset = String(document.getElementById('boxType')?.value || '').toLowerCase();
    const isBpReset = (btReset === 'bp4' || btReset === 'bp6');
    const cNow = lastBuildPack.dimensions.C_top || 0;
    const cCap = isBpReset
      ? Math.max(floors.flangeOD + 90, 480)
      : Math.max(580, Math.round(B * 1.55));
    if (btReset !== 'free-air' && cNow > cCap && lastBuildPack.acoustics && lastBuildPack.acoustics.Vbruto > 0) {
      const nDrvReset = Math.max(1, parseInt(document.getElementById('simNumDrivers')?.value) || 1);
      const tReset = lastBuildPack.dimensions.t || 18;
      const divThick = isBpReset ? (nDrvReset === 2 ? 2 * tReset : tReset) : 0;
      const targetA = Math.min(1400, Math.max(floors.minA, Math.ceil((lastBuildPack.acoustics.Vbruto * 1e6) / Math.max(1, B * cCap) + divThick)));
      if (targetA > A + 10) {
        const prevA = A;
        A = targetA;
        elA.value = A;
        updateWoodlock();
        if (!lastBuildPack.validation.valid) {
          A = prevA;
          elA.value = A;
          updateWoodlock();
        } else {
          changes.push(`A→${A} mm (proporção C≤${cCap} mm)`);
        }
      }
    }
  }

  if (changes.length > 0) {
    const rTxt = reason ? ` (${escapeHtmlStr(reason)})` : '';
    showWlAutofixBanner(`<b>Ajuste geométrico automático${rTxt}:</b> ${escapeHtmlStr(changes.join(' · '))}. Motivo: flange ${floors.diaIn}″ (${floors.flangeOD} mm) e folga de dutos. Vb/Fb mantidos intactos.`);
  } else {
    showWlAutofixBanner('');
  }
  return { fixed: changes.length > 0, changes, valid: lastBuildPack ? lastBuildPack.validation.valid : false };
}

function onWoodlockDimChange(axis) {
  const elA = document.getElementById('wlWidthA');
  const elB = document.getElementById('wlHeightB');
  if (!elA || !elB) return;
  let floors = lastWoodlockFloors;
  if (axis === 'A') {
    const val = parseFloat(elA.value);
    if (!Number.isFinite(val) || val < floors.minA) {
      elA.value = floors.minA;
      showWlAutofixBanner(`<b>Piso mínimo aplicado:</b> largura A ajustada para <b>${floors.minA} mm</b> (mínimo físico para driver ${floors.diaIn}″ + dutos).`, true);
    } else {
      showWlAutofixBanner('');
    }
  } else if (axis === 'B') {
    const val = parseFloat(elB.value);
    if (!Number.isFinite(val) || val < floors.minB) {
      elB.value = floors.minB;
      showWlAutofixBanner(`<b>Piso mínimo aplicado:</b> altura B ajustada para <b>${floors.minB} mm</b> (mínimo físico para flange ${floors.diaIn}″ ≈ ${floors.flangeOD} mm).`, true);
    } else {
      showWlAutofixBanner('');
    }
  }
  if (document.getElementById('boxType')?.value === 'planar') recalculate();
  else updateWoodlock();
}

function escapeHtmlStr(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function fmtNumSafe(val, dec = 1, fallback = '—') {
  const n = Number(val);
  return Number.isFinite(n) ? n.toFixed(dec) : fallback;
}

function estimateDriverCutoutAndFlange(diaIn) {
  const d = Math.max(4, parseFloat(diaIn) || 12);
  const table = [
    [6.5, 168, 145],
    [8,   212, 185],
    [10,  264, 232],
    [12,  315, 282],
    [15,  392, 354],
    [18,  468, 422],
    [21,  546, 496]
  ];
  for (let i = 0; i < table.length; i++) {
    if (Math.abs(d - table[i][0]) < 0.25) {
      return { diaIn: d, flangeOD: table[i][1], cutoutDia: table[i][2], estimated: true };
    }
  }
  return {
    diaIn: d,
    flangeOD: Math.round(d * 25.4 + 10),
    cutoutDia: Math.round(d * 25.4 * 0.922),
    estimated: true
  };
}

function validateBuildGeometry(opts) {
  const issues = [];
  const A = Math.max(50, opts.A || 800);
  const B = Math.max(50, opts.B || 450);
  const tRaw = parseFloat(opts.t);
  const t = Math.max(6, Number.isFinite(tRaw) ? tRaw : 18);
  const C_min = Math.min(opts.C_top || 300, opts.D_bot || 300);
  const nDrivers = Math.max(1, opts.nDrivers || 1);
  const tsDia = parseFloat(opts.tsDia) || 12;
  const Sd_cm2 = parseFloat(opts.Sd_cm2) || 500;
  const driverName = String(opts.driverName || '');
  const boxType = opts.boxType || 'bass-reflex';
  const isVented = (boxType === 'bass-reflex' || boxType === 'bp4' || boxType === 'bp6');

  // CAD-10: Espessura estrutural mínima MDF >= 15 mm
  if (Number.isFinite(tRaw) && tRaw < 15) {
    issues.push({
      level: 'critical',
      code: 'MDF_THICKNESS_TOO_THIN',
      msg: `Espessura de MDF (${tRaw.toFixed(0)} mm) abaixo do mínimo estrutural de 15 mm (risco de ressonância e ruptura de painel).`
    });
  }
  const slotWallThickRaw = parseFloat(opts.slotWallThick);
  const portTypePre = opts.portType || 'round';
  if (isVented && (portTypePre === 'slot' || portTypePre === 'slot_wall') && Number.isFinite(slotWallThickRaw) && slotWallThickRaw < 15) {
    issues.push({
      level: 'critical',
      code: 'PORT_WALL_TOO_THIN',
      msg: `Espessura da parede do duto régua (${slotWallThickRaw.toFixed(0)} mm) abaixo do mínimo estrutural de 15 mm.`
    });
  }

  const pistonDiaCm = 2.0 * Math.sqrt(Math.max(1, Sd_cm2) / Math.PI);
  const diaRatio = pistonDiaCm / (tsDia * 2.54);
  const estDiaFromSd = Math.round(pistonDiaCm / (2.54 * 0.84));
  let effectiveDiaIn = tsDia;

  // 1. Consistência tsDia vs Sd
  if (diaRatio < 0.65 || diaRatio > 0.94) {
    issues.push({
      level: 'critical',
      code: 'DIA_SD_MISMATCH',
      msg: `Inconsistência crítica: Sd = ${Sd_cm2.toFixed(0)} cm² (Ø pistão ${pistonDiaCm.toFixed(1)} cm) incompatível com o diâmetro nominal informado (${tsDia}″; sugere ~${estDiaFromSd}″). Corrija o diâmetro nominal do driver.`
    });
    effectiveDiaIn = Math.max(tsDia, estDiaFromSd);
  }

  // 2. Consistência tsDia vs nome declarado do driver
  const nameMatch = driverName.match(/(?:^|[\s\-_])(6\.5|8|10|12|15|18|21)(?:"|″|\s*pol|\s*SUB|\s*W\d|\s*SWT)/i);
  if (nameMatch) {
    const nameDia = parseFloat(nameMatch[1]);
    if (Number.isFinite(nameDia) && Math.abs(nameDia - tsDia) >= 1.5) {
      issues.push({
        level: 'critical',
        code: 'DIA_NAME_MISMATCH',
        msg: `Nome do driver indica ${nameDia}″ ("${driverName}"), mas o diâmetro nominal está definido como ${tsDia}″.`
      });
      effectiveDiaIn = Math.max(effectiveDiaIn, nameDia);
    }
  }

  const drvGeom = estimateDriverCutoutAndFlange(effectiveDiaIn);
  drvGeom.pistonDiaCm = +pistonDiaCm.toFixed(1);
  const flangeOD = drvGeom.flangeOD;
  const cutoutDia = drvGeom.cutoutDia;
  const edgeMargin = 16; // mm mínimo até parede interna
  const minGap = 18;     // mm mínimo entre recortes

  // 3. Checagem de altura/largura para o(s) driver(s)
  const cols = nDrivers <= 2 ? nDrivers : Math.ceil(nDrivers / 2);
  const rows = nDrivers <= 2 ? 1 : 2;
  const minBForDriver = Math.ceil(rows * flangeOD + (rows - 1) * minGap + 2 * 10);
  if (B < rows * flangeOD) {
    issues.push({
      level: 'critical',
      code: 'DRIVER_HEIGHT_FIT',
      msg: `Altura interna B = ${B.toFixed(0)} mm não comporta flange estimado de ${effectiveDiaIn}″ (Ø flange ≈ ${flangeOD} mm, recorte ${cutoutDia} mm). Aumente B para ≥ ${minBForDriver} mm.`
    });
  } else if (B < minBForDriver) {
    issues.push({
      level: 'warn',
      code: 'DRIVER_HEIGHT_TIGHT',
      msg: `Altura interna B = ${B.toFixed(0)} mm está muito justa para flange de ${effectiveDiaIn}″ (${flangeOD} mm). Recomendado B ≥ ${minBForDriver} mm.`
    });
  }

  // 4. Posicionamento real dos furos no baffle (coordenadas internas [0..A, 0..B], origem canto inferior-esquerdo)
  const holes = [];
  const portType = opts.portType || 'round';
  const isSlot = (portType === 'slot' || portType === 'slot_wall');
  const isTri = (portType === 'triangle');
  const numDucts = Math.max(1, parseInt(opts.numDucts) || 1);
  const ductHoleDia = (parseFloat(opts.ductDia) || 4.0) * 25.4 + 2.0 * (parseFloat(opts.ductThick) || 1.5);
  const numDuctsVr = Math.max(1, parseInt(opts.numDuctsVr) || 1);
  const ductHoleDiaVr = (parseFloat(opts.ductDiaVr) || parseFloat(opts.ductDia) || 4.0) * 25.4 + 2.0 * (parseFloat(opts.ductThickVr) || parseFloat(opts.ductThick) || 1.5);
  const slotWmm = (parseFloat(opts.slotW) || 35.0) * 10.0;
  const slotHmm = (parseFloat(opts.slotH) || 6.0) * 10.0;
  const slotWallThick = parseFloat(opts.slotWallThick) || 18.0;
  const slotOrient = opts.slotOrient || 'horizontal';
  const portLayout = opts.portLayout || 'standard';
  const planarStyle = opts.planarStyle || 'square';
  const isBp = (boxType === 'bp4' || boxType === 'bp6');
  const isPlanar = (boxType === 'planar');
  const isFreeAir = (boxType === 'free-air');
  const portRouting = (!isBp && boxType === 'bass-reflex') ? (opts.portRouting || 'straight') : 'straight';
  const isSideFiring = (portRouting === 'side_firing' && !isTri);
  const bpChambers = opts.bpChambers || null;
  const isBpSlot = !!(isBp && bpChambers && (boxType === 'bp4' || bpChambers.isBp6Parallel) && isSlot);
  const isSharedCenterPort = (boxType === 'bass-reflex' && nDrivers === 2 && portLayout === 'center_shared' && !isSideFiring && (portType === 'round' || isSlot));
  const isDualVertSlot = (boxType === 'bass-reflex' && nDrivers === 2 && !isSharedCenterPort && !isSideFiring && isSlot && slotOrient === 'vertical');
  const hasCenterDiv = (!isFreeAir && !isBp && nDrivers === 2 && !isSharedCenterPort && !isDualVertSlot);
  const triCount = Math.max(1, Math.min(4, parseInt(opts.triCount) || 2));
  const triAmm = (parseFloat(opts.triA) || 14.0) * 10.0;
  const triBmm = (parseFloat(opts.triB) || 14.0) * 10.0;
  const lvMm = isVented ? ((opts.LvCm || 0) * 10.0) : 0;

  // Reserva de área para duto (quando 1+ driver + dutos redondos ou régua H/V no frontal; side_firing fura lateral_dir)
  const planarGeomOpt = opts.planarGeom || null;
  let portReserveLeft = 0;
  let portReserveRight = 0;
  let portReserveBottom = 0;
  let portReserveTop = 0;
  if (isVented && !isTri && !isBp && !isSharedCenterPort && !isSideFiring) {
    if (isSlot) {
      if (slotOrient === 'horizontal') portReserveBottom = slotHmm + slotWallThick;
      else if (isDualVertSlot) {
        portReserveLeft = slotHmm + slotWallThick;
        portReserveRight = slotHmm + slotWallThick;
      } else {
        portReserveLeft = slotHmm + slotWallThick;
      }
    } else if (nDrivers === 1) {
      portReserveRight = ductHoleDia + 2 * edgeMargin;
    } else if (nDrivers >= 2) {
      portReserveBottom = ductHoleDia + edgeMargin + minGap;
    }
  } else if (boxType === 'planar' && planarGeomOpt && planarGeomOpt.style === 'square' && planarGeomOpt.C4) {
    portReserveBottom = Math.max(0, B - planarGeomOpt.C4);
  }

  const drvZoneW = Math.max(flangeOD, A - portReserveLeft - portReserveRight);
  const drvZoneH = Math.max(flangeOD, B - portReserveBottom - portReserveTop);
  const cellW = drvZoneW / cols;
  const cellH = drvZoneH / rows;
  const isMatrixDiv = (parseInt(opts.matrixCols) || 1) > 1 || (parseInt(opts.matrixRows) || 1) > 1;
  for (let i = 0; i < (isMatrixDiv ? 0 : nDrivers); i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    let xInt, yInt;
    if (isBp) {
      xInt = C_min / 2;
      yInt = (nDrivers === 2) ? (B / 2) : ((row + 0.5) * (B / rows));
    } else if (isSharedCenterPort && isSlot) {
      const a2 = Math.max(flangeOD, (A - slotHmm - 2 * slotWallThick) / 2);
      xInt = (i === 0) ? (a2 / 2) : (A - a2 / 2);
      yInt = B / 2;
    } else if (isSharedCenterPort && !isSlot) {
      const sideW = Math.max(flangeOD, (A - ductHoleDia - 2 * minGap) / 2);
      xInt = (i === 0) ? (sideW / 2) : (A - sideW / 2);
      yInt = B / 2;
    } else if (hasCenterDiv) {
      const subW = Math.max(flangeOD, (drvZoneW - t) / 2);
      xInt = portReserveLeft + ((i === 0) ? (subW / 2) : (subW + t + subW / 2));
      yInt = portReserveBottom + (row + 0.5) * cellH;
    } else {
      xInt = portReserveLeft + (col + 0.5) * cellW;
      yInt = portReserveBottom + (row + 0.5) * cellH;
    }
    const divPanel = isBp ? (nDrivers === 2 ? `divisoria_${i + 1}` : 'divisoria') : 'frontal';
    holes.push({
      kind: 'driver',
      panel: divPanel,
      shape: 'round',
      label: (nDrivers > 1 ? `Driver #${i + 1}` : 'Driver Principal') + (isBp ? ` (Divisória Interna${nDrivers === 2 ? ' #' + (i + 1) : ''})` : ''),
      xInt: +xInt.toFixed(1),
      yInt: +yInt.toFixed(1),
      xExt: +(xInt + (isBp ? 0 : t)).toFixed(1),
      yExt: +(yInt + (isBp ? 0 : t)).toFixed(1),
      dia: cutoutDia,
      flangeDia: flangeOD,
      collision: false
    });
  }

  // Posiciona dutos se caixa dutada / band-pass
  if (isVented) {
    if (isBpSlot) {
      // BP4 / BP6 Paralelo com Duto Quadrado de Topo (não fura o painel frontal)
      const vfSlotX = (bpChambers && bpChambers.dualDiv)
        ? (bpChambers.A_rear_side + t + bpChambers.A_front / 2)
        : (A - slotHmm / 2);
      holes.push({
        kind: 'port',
        panel: 'topo',
        shape: 'slot',
        label: 'Duto Quadrado Topo (VF)',
        xInt: +vfSlotX.toFixed(1),
        yInt: +(B / 2).toFixed(1),
        xExt: +(vfSlotX + t).toFixed(1),
        yExt: +(B / 2 + t).toFixed(1),
        w: +slotHmm.toFixed(1),
        h: +C_min.toFixed(1),
        lvMm: +lvMm.toFixed(1),
        collision: false
      });
      if (bpChambers && bpChambers.isBp6Parallel && bpChambers.lvRearMm > 0) {
        const vrSlotXs = bpChambers.dualDiv ? [slotHmm / 2, A - slotHmm / 2] : [slotHmm / 2];
        vrSlotXs.forEach((vx, vIdx) => {
          holes.push({
            kind: 'port',
            panel: 'topo',
            shape: 'slot',
            label: bpChambers.dualDiv ? `Duto Quadrado Topo (VR${vIdx + 1})` : 'Duto Quadrado Topo (VR)',
            xInt: +vx.toFixed(1),
            yInt: +(B / 2).toFixed(1),
            xExt: +(t + vx).toFixed(1),
            yExt: +(B / 2 + t).toFixed(1),
            w: +slotHmm.toFixed(1),
            h: +C_min.toFixed(1),
            lvMm: +bpChambers.lvRearMm.toFixed(1),
            collision: false
          });
        });
      }
    } else if (isTri) {
      const corners = [
        { x: triAmm / 3, y: triBmm / 3, corner: 'Inf-Esq' },
        { x: A - triAmm / 3, y: triBmm / 3, corner: 'Inf-Dir' },
        { x: triAmm / 3, y: B - triBmm / 3, corner: 'Sup-Esq' },
        { x: A - triAmm / 3, y: B - triBmm / 3, corner: 'Sup-Dir' }
      ];
      for (let i = 0; i < triCount; i++) {
        const cPos = corners[i % 4];
        holes.push({
          kind: 'port',
          panel: 'frontal',
          shape: 'triangle',
          label: `Duto Triângulo #${i + 1} (${cPos.corner})`,
          xInt: +cPos.x.toFixed(1),
          yInt: +cPos.y.toFixed(1),
          xExt: +(cPos.x + t).toFixed(1),
          yExt: +(cPos.y + t).toFixed(1),
          triA: +triAmm.toFixed(1),
          triB: +triBmm.toFixed(1),
          cornerIdx: i % 4,
          lvMm: +lvMm.toFixed(1),
          collision: false
        });
      }
    } else if (isSharedCenterPort && isSlot) {
      holes.push({
        kind: 'port',
        panel: 'frontal',
        shape: 'slot',
        label: 'Duto Único Vertical Central [A3×B]',
        xInt: +(A / 2).toFixed(1),
        yInt: +(B / 2).toFixed(1),
        xExt: +(A / 2 + t).toFixed(1),
        yExt: +(B / 2 + t).toFixed(1),
        w: +slotHmm.toFixed(1),
        h: +B.toFixed(1),
        lvMm: +lvMm.toFixed(1),
        collision: false
      });
    } else if (isSharedCenterPort && !isSlot) {
      holes.push({
        kind: 'port',
        panel: 'frontal',
        shape: 'round',
        label: 'Duto Único Redondo Central',
        xInt: +(A / 2).toFixed(1),
        yInt: +(B / 2).toFixed(1),
        xExt: +(A / 2 + t).toFixed(1),
        yExt: +(B / 2 + t).toFixed(1),
        dia: +ductHoleDia.toFixed(1),
        flangeDia: +(ductHoleDia + 22).toFixed(1),
        lvMm: +lvMm.toFixed(1),
        collision: false
      });
    } else if (isDualVertSlot) {
      // 2SUB Dutada Quadrada Vertical: 2 dutos verticais simétricos (esq + dir) com baffle central
      holes.push({
        kind: 'port', panel: 'frontal', shape: 'slot',
        label: 'Duto Régua Vertical Esq. [R×BD]',
        xInt: +(slotHmm / 2).toFixed(1), yInt: +(B / 2).toFixed(1),
        xExt: +(slotHmm / 2 + t).toFixed(1), yExt: +(B / 2 + t).toFixed(1),
        w: +slotHmm.toFixed(1), h: +B.toFixed(1), lvMm: +lvMm.toFixed(1), collision: false
      });
      holes.push({
        kind: 'port', panel: 'frontal', shape: 'slot',
        label: 'Duto Régua Vertical Dir. [R×BD]',
        xInt: +(A - slotHmm / 2).toFixed(1), yInt: +(B / 2).toFixed(1),
        xExt: +(A - slotHmm / 2 + t).toFixed(1), yExt: +(B / 2 + t).toFixed(1),
        w: +slotHmm.toFixed(1), h: +B.toFixed(1), lvMm: +lvMm.toFixed(1), collision: false
      });
    } else if (isSideFiring && isSlot) {
      // CAD-04: Duto Régua Side-Firing na face lateral direita (eixo Z=[0..C_min], eixo Y=[0..B])
      const isHoriz = (slotOrient === 'horizontal');
      const wSlot = isHoriz ? Math.min(C_min, slotWmm) : slotHmm;
      const hSlot = isHoriz ? slotHmm : Math.min(B, slotWmm);
      const xInt = isHoriz ? (C_min / 2) : (wSlot / 2);
      const yInt = isHoriz ? (hSlot / 2) : (B / 2);
      holes.push({
        kind: 'port',
        panel: 'lateral_dir',
        shape: 'slot',
        label: 'Duto Régua Lateral (Side-Firing)' + (isHoriz ? ' [Horiz.]' : ' [Vert.]'),
        xInt: +xInt.toFixed(1),
        yInt: +yInt.toFixed(1),
        xExt: +(xInt + t).toFixed(1),
        yExt: +(yInt + t).toFixed(1),
        w: +wSlot.toFixed(1),
        h: +hSlot.toFixed(1),
        lvMm: +lvMm.toFixed(1),
        collision: false
      });
    } else if (isSideFiring) {
      // CAD-04: Duto(s) Cilíndrico(s) Side-Firing na face lateral direita (xInt = prof. Z [0..C_min], yInt = alt. Y [0..B])
      for (let i = 0; i < numDucts; i++) {
        const xInt = C_min / 2;
        let yInt;
        if (numDucts === 1) {
          yInt = B / 2;
        } else {
          const yMin = edgeMargin + ductHoleDia / 2;
          const yMax = Math.max(yMin + 10, B - edgeMargin - ductHoleDia / 2);
          yInt = yMin + (i / (numDucts - 1)) * (yMax - yMin);
        }
        holes.push({
          kind: 'port',
          panel: 'lateral_dir',
          shape: 'round',
          label: `Duto Lateral (Side-Firing) #${i + 1}`,
          xInt: +xInt.toFixed(1),
          yInt: +yInt.toFixed(1),
          xExt: +(xInt + t).toFixed(1),
          yExt: +(yInt + t).toFixed(1),
          dia: +ductHoleDia.toFixed(1),
          flangeDia: +(ductHoleDia + 22).toFixed(1),
          lvMm: +lvMm.toFixed(1),
          collision: false
        });
      }
    } else if (isSlot) {
      const isHoriz = (slotOrient === 'horizontal');
      const wSlot = isHoriz ? Math.min(A, slotWmm) : slotHmm;
      const hSlot = isHoriz ? slotHmm : Math.min(B, slotWmm);
      const xInt = isBp && bpChambers
        ? (bpChambers.A_rear + t + bpChambers.A_front / 2)
        : (isHoriz ? (A / 2) : (wSlot / 2));
      const yInt = isHoriz ? (hSlot / 2) : (B / 2);
      holes.push({
        kind: 'port',
        panel: 'frontal',
        shape: 'slot',
        label: (portType === 'slot_wall' ? 'Duto Régua (Parede)' : 'Duto Retangular') + (isHoriz ? ' [Horiz.]' : ' [Vert.]'),
        xInt: +xInt.toFixed(1),
        yInt: +yInt.toFixed(1),
        xExt: +(xInt + t).toFixed(1),
        yExt: +(yInt + t).toFixed(1),
        w: +wSlot.toFixed(1),
        h: +hSlot.toFixed(1),
        lvMm: +lvMm.toFixed(1),
        collision: false
      });
    } else {
      // Dutos cilíndricos / flared (em BP4/BP6 saem pelo tampo superior P_TOP, painel frontal fechado)
      const vfCenterX = (isBp && bpChambers)
        ? (bpChambers.dualDiv ? (bpChambers.A_rear_side + t + bpChambers.A_front / 2) : (bpChambers.A_rear + t + bpChambers.A_front / 2))
        : ((nDrivers === 1) ? (A - edgeMargin - ductHoleDia / 2) : null);
      const bpTopCount = (isBp && bpChambers && bpChambers.dualDiv) ? 1 : numDucts;
      for (let i = 0; i < (isBp ? bpTopCount : numDucts); i++) {
        let xInt, yInt;
        if (isBp && bpChambers) {
          xInt = vfCenterX;
          if (bpTopCount === 1) yInt = C_min / 2;
          else {
            const zMin = t + edgeMargin + ductHoleDia / 2;
            const zMax = Math.max(zMin + 10, C_min - edgeMargin - ductHoleDia / 2);
            yInt = zMin + (i / (bpTopCount - 1)) * (zMax - zMin);
          }
        } else if (nDrivers === 1) {
          xInt = vfCenterX;
          if (numDucts === 1) {
            yInt = B / 2;
          } else {
            const yMin = edgeMargin + ductHoleDia / 2;
            const yMax = B - edgeMargin - ductHoleDia / 2;
            yInt = yMin + (i / (numDucts - 1)) * (yMax - yMin);
          }
        } else if (hasCenterDiv) {
          const subW = (A - t) / 2;
          const isLeft = (i % 2 === 0);
          xInt = isLeft ? (subW / 2) : (subW + t + subW / 2);
          yInt = edgeMargin + ductHoleDia / 2;
        } else {
          xInt = ((i + 1) / (numDucts + 1)) * A;
          yInt = edgeMargin + ductHoleDia / 2;
        }
        holes.push({
          kind: 'port',
          panel: isBp ? 'topo' : 'frontal',
          shape: 'round',
          label: isBp ? `Duto Topo (VF) #${i + 1}` : `Duto Cilíndrico #${i + 1}`,
          xInt: +xInt.toFixed(1),
          yInt: +yInt.toFixed(1),
          xExt: +(xInt + t).toFixed(1),
          yExt: +(yInt + t).toFixed(1),
          dia: +ductHoleDia.toFixed(1),
          flangeDia: +(ductHoleDia + 22).toFixed(1),
          lvMm: +lvMm.toFixed(1),
          collision: false
        });
      }
      // Em BP6 Paralelo, adiciona duto(s) independentes da câmara traseira (VR) no tampo superior
      if (isBp && bpChambers && bpChambers.isBp6Parallel && bpChambers.lvRearMm > 0) {
        const rearXs = bpChambers.dualDiv
          ? [bpChambers.A_rear_side / 2, A - bpChambers.A_rear_side / 2]
          : [bpChambers.A_rear / 2];
        const vrPerSide = bpChambers.dualDiv ? Math.max(1, Math.ceil(numDuctsVr / 2)) : numDuctsVr;
        let vrIdxGlobal = 0;
        rearXs.forEach(rx => {
          for (let j = 0; j < vrPerSide; j++) {
            vrIdxGlobal++;
            let ry;
            if (vrPerSide === 1) {
              ry = C_min / 2;
            } else {
              const zMinVr = t + edgeMargin + ductHoleDiaVr / 2;
              const zMaxVr = Math.max(zMinVr + 10, C_min - edgeMargin - ductHoleDiaVr / 2);
              ry = zMinVr + (j / (vrPerSide - 1)) * (zMaxVr - zMinVr);
            }
            holes.push({
              kind: 'port',
              panel: 'topo',
              shape: 'round',
              label: (rearXs.length * vrPerSide > 1) ? `Duto Câmara Traseira (VR) #${vrIdxGlobal}` : 'Duto Câmara Traseira (VR)',
              xInt: +rx.toFixed(1),
              yInt: +ry.toFixed(1),
              xExt: +(rx + t).toFixed(1),
              yExt: +(ry + t).toFixed(1),
              dia: +ductHoleDiaVr.toFixed(1),
              flangeDia: +(ductHoleDiaVr + 22).toFixed(1),
              lvMm: +bpChambers.lvRearMm.toFixed(1),
              collision: false
            });
          }
        });
      }
    }
  }

  // 5. Verificação matemática de bordas e colisões par-a-par (no mesmo painel) — CAD-08 & CAD-09
  let hasBorderError = false;
  let hasBpDepthError = false;
  let hasCollisionError = false;
  const minEdgeMdf = 15; // CAD-09: margem estrutural mínima de borda (15 mm)

  const getHoleBbox = h => {
    if (h.shape === 'slot') {
      return { x0: h.xInt - h.w / 2, x1: h.xInt + h.w / 2, y0: h.yInt - h.h / 2, y1: h.yInt + h.h / 2 };
    }
    if (h.shape === 'triangle') {
      const aT = h.triA || 100, bT = h.triB || 100;
      const cIdx = h.cornerIdx || 0;
      const x0 = (cIdx === 0 || cIdx === 2) ? 0 : (A - aT);
      const y0 = (cIdx === 0 || cIdx === 1) ? 0 : (B - bT);
      return { x0, x1: x0 + aT, y0, y1: y0 + bT };
    }
    const r = (h.kind === 'driver') ? (h.flangeDia / 2) : (h.dia / 2);
    return { x0: h.xInt - r, x1: h.xInt + r, y0: h.yInt - r, y1: h.yInt + r };
  };

  holes.forEach(h => {
    if (h.panel === 'topo') {
      // CAD-09: Verifica limites no tampo superior [0..A] x [0..C_min] (a aba externa do tampo já possui margem MDF >= t)
      if (h.shape === 'round') {
        const rCheck = h.dia / 2;
        if (h.xInt - rCheck < -0.5 || h.xInt + rCheck > A + 0.5 || h.yInt - rCheck < -0.5 || h.yInt + rCheck > C_min + 0.5) {
          h.collision = true;
          hasBorderError = true;
        }
      } else if (h.shape === 'slot') {
        if (h.xInt - h.w / 2 < -0.5 || h.xInt + h.w / 2 > A + 0.5 || h.h > C_min + 0.5) {
          h.collision = true;
          hasBorderError = true;
        }
      }
      return;
    }
    if (h.panel === 'lateral_dir') {
      // CAD-04 & CAD-09: Verifica limites na face lateral direita [0..C_min] x [0..B]
      if (h.shape === 'round') {
        const rCheck = h.dia / 2 + minEdgeMdf;
        if (h.xInt - rCheck < -0.5 || h.xInt + rCheck > C_min + 0.5 || h.yInt - rCheck < -0.5 || h.yInt + rCheck > B + 0.5) {
          h.collision = true;
          hasBorderError = true;
        }
      } else if (h.shape === 'slot') {
        if (h.xInt - h.w / 2 < -0.5 || h.xInt + h.w / 2 > C_min + 0.5 || h.yInt - h.h / 2 < -0.5 || h.yInt + h.h / 2 > B + 0.5) {
          h.collision = true;
          hasBorderError = true;
        }
      }
      return;
    }
    if (h.panel && h.panel.startsWith('divisoria')) {
      const rCheck = (h.kind === 'driver') ? (h.flangeDia / 2) : (h.dia / 2 + minEdgeMdf);
      if (h.xInt - rCheck < 0 || h.xInt + rCheck > C_min) {
        h.collision = true;
        hasBpDepthError = true;
      }
      if (h.yInt - rCheck < 0 || h.yInt + rCheck > B) {
        h.collision = true;
        hasBorderError = true;
      }
      return;
    }
    if (h.shape === 'round') {
      // CAD-09: duto redondo exige margem de borda >= 15 mm (driver usa flangeOD)
      const rCheck = (h.kind === 'driver') ? (h.flangeDia / 2) : (h.dia / 2 + minEdgeMdf);
      const minYBound = (h.kind === 'driver' && boxType === 'planar' && planarGeomOpt && planarGeomOpt.style === 'square' && planarGeomOpt.C4) ? Math.max(0, B - planarGeomOpt.C4) : 0;
      if (h.xInt - rCheck < -0.5 || h.xInt + rCheck > A + 0.5 || h.yInt - rCheck < minYBound - 0.5 || h.yInt + rCheck > B + 0.5) {
        h.collision = true;
        hasBorderError = true;
      }
    } else if (h.shape === 'slot') {
      if (h.xInt - h.w / 2 < -0.5 || h.xInt + h.w / 2 > A + 0.5 || h.yInt - h.h / 2 < -0.5 || h.yInt + h.h / 2 > B + 0.5) {
        h.collision = true;
        hasBorderError = true;
      }
    } else if (h.shape === 'triangle') {
      const bb = getHoleBbox(h);
      if (bb.x0 < -0.5 || bb.x1 > A + 0.5 || bb.y0 < -0.5 || bb.y1 > B + 0.5) {
        h.collision = true;
        hasBorderError = true;
      }
    }
  });

  for (let i = 0; i < holes.length; i++) {
    for (let j = i + 1; j < holes.length; j++) {
      const h1 = holes[i], h2 = holes[j];
      if ((h1.panel || 'frontal') !== (h2.panel || 'frontal')) continue;
      if (h1.shape === 'round' && h2.shape === 'round') {
        const dist = Math.hypot(h1.xInt - h2.xInt, h1.yInt - h2.yInt);
        const r1 = (h1.kind === 'driver') ? (h1.flangeDia / 2) : (h1.dia / 2);
        const r2 = (h2.kind === 'driver') ? (h2.flangeDia / 2) : (h2.dia / 2);
        if (dist < r1 + r2 + minGap) {
          h1.collision = true;
          h2.collision = true;
          hasCollisionError = true;
        }
      } else if ((h1.shape === 'round' && h2.shape === 'slot') || (h1.shape === 'slot' && h2.shape === 'round')) {
        const rc = h1.shape === 'round' ? h1 : h2;
        const sl = h1.shape === 'slot' ? h1 : h2;
        const r = (rc.kind === 'driver') ? (rc.flangeDia / 2) : (rc.dia / 2);
        const cx = Math.max(sl.xInt - sl.w / 2, Math.min(rc.xInt, sl.xInt + sl.w / 2));
        const cy = Math.max(sl.yInt - sl.h / 2, Math.min(rc.yInt, sl.yInt + sl.h / 2));
        if (Math.hypot(rc.xInt - cx, rc.yInt - cy) < r + minGap) {
          h1.collision = true;
          h2.collision = true;
          hasCollisionError = true;
        }
      } else if (h1.shape === 'slot' && h2.shape === 'slot') {
        // CAD-08: Sobreposição slot x slot (incl. BP6 topo e réguas verticais)
        const b1 = getHoleBbox(h1), b2 = getHoleBbox(h2);
        const gap = 4; // folga mínima entre aberturas slot
        if (b1.x0 < b2.x1 + gap && b1.x1 + gap > b2.x0 && b1.y0 < b2.y1 + gap && b1.y1 + gap > b2.y0) {
          h1.collision = true;
          h2.collision = true;
          hasCollisionError = true;
        }
      } else if (h1.shape === 'triangle' || h2.shape === 'triangle') {
        // CAD-08: Sobreposição envolvendo duto triângulo (triangle x round, triangle x triangle, triangle x slot)
        if (h1.shape === 'triangle' && h2.shape === 'triangle') {
          const b1 = getHoleBbox(h1), b2 = getHoleBbox(h2);
          if (b1.x0 < b2.x1 + 4 && b1.x1 + 4 > b2.x0 && b1.y0 < b2.y1 + 4 && b1.y1 + 4 > b2.y0) {
            h1.collision = true;
            h2.collision = true;
            hasCollisionError = true;
          }
        } else {
          const tri = h1.shape === 'triangle' ? h1 : h2;
          const oth = h1.shape === 'triangle' ? h2 : h1;
          const bt = getHoleBbox(tri);
          if (oth.shape === 'round') {
            const r = (oth.kind === 'driver') ? (oth.flangeDia / 2) : (oth.dia / 2);
            // Verifica distância do centro do círculo à hipotenusa do triângulo de canto
            const aT = tri.triA || 100, bT = tri.triB || 100;
            const cIdx = tri.cornerIdx || 0;
            const dxCorner = (cIdx === 0 || cIdx === 2) ? oth.xInt : (A - oth.xInt);
            const dyCorner = (cIdx === 0 || cIdx === 1) ? oth.yInt : (B - oth.yInt);
            // Ponto interno ao triângulo se dx/aT + dy/bT <= 1; distância à hipotenusa = (dx/aT + dy/bT - 1) / hypot(1/aT, 1/bT)
            const distHyp = (dxCorner / aT + dyCorner / bT - 1.0) / Math.hypot(1.0 / aT, 1.0 / bT);
            if (distHyp < r + minGap * 0.5) {
              h1.collision = true;
              h2.collision = true;
              hasCollisionError = true;
            }
          } else {
            const bo = getHoleBbox(oth);
            if (bt.x0 < bo.x1 + 4 && bt.x1 + 4 > bo.x0 && bt.y0 < bo.y1 + 4 && bt.y1 + 4 > bo.y0) {
              h1.collision = true;
              h2.collision = true;
              hasCollisionError = true;
            }
          }
        }
      }
    }
  }

  if (hasBpDepthError) {
    issues.push({
      level: 'critical',
      code: 'BP_DIVIDER_DEPTH_FIT',
      msg: `Profundidade interna C = ${C_min.toFixed(0)} mm é menor que o flange do driver na divisória BP (Ø ${flangeOD} mm). Reduza Largura A ou Altura B para aumentar C ≥ ${flangeOD + 10} mm.`
    });
  }
  if (hasBorderError) {
    const minReqA = Math.ceil(cols * flangeOD + (isVented && !isTri ? (isSlot ? slotHmm : ductHoleDia) + 45 : 30));
    issues.push({
      level: 'critical',
      code: 'BAFFLE_BORDER_OVERFLOW',
      msg: `Um ou mais recortes/flanges ultrapassam o vão interno A×B (${A.toFixed(0)}×${B.toFixed(0)} mm). Sugestão: A ≥ ${minReqA} mm e B ≥ ${minBForDriver} mm.`
    });
  }
  if (hasCollisionError) {
    const minReqA = Math.ceil(cols * flangeOD + (isVented && !isTri ? (isSlot ? slotHmm : ductHoleDia) + 60 : 40));
    issues.push({
      level: 'critical',
      code: 'BAFFLE_HOLE_COLLISION',
      msg: `Colisão geométrica detectada no baffle entre driver e/ou dutos (folga mínima exigida: ${minGap} mm). Aumente A (sugestão ≥ ${minReqA} mm) ou B (≥ ${Math.ceil(Math.max(minBForDriver, numDucts * ductHoleDia + 70))} mm).`
    });
  }

  // 6. Profundidade útil do duto (Lv vs C_min, ou L-Port 90°, ou Side-Firing ao longo de A, ou B em BP Slot de Topo)
  const portOffsetVal = Number(opts.portOffsetMm || 0);
  const lvMaxCheck = (bpChambers && bpChambers.isBp6Parallel && bpChambers.lvRearMm > 0)
    ? Math.max(lvMm, bpChambers.lvRearMm)
    : lvMm;
  const lvInternalCheck = Math.max(0, lvMaxCheck - portOffsetVal);
  // CAD-01: Folga mínima física na boca interna do duto: max(40, 0.50*D_int) cil./tri. e max(40, 0.75*H) slot
  const ductInnerDiaMm = (parseFloat(opts.ductDia) || 4.0) * 25.4;
  const triEqDiaMm = Math.sqrt(Math.max(1, 2.0 * triAmm * triBmm / Math.PI));
  const mouthDimMm = isSlot ? slotHmm : (isTri ? triEqDiaMm : ductInnerDiaMm);
  const minPortClearanceMm = isSlot
    ? Math.max(40, 0.75 * slotHmm)
    : Math.max(40, 0.50 * mouthDimMm);
  const warnPortClearanceMm = Math.max(minPortClearanceMm + 5, 1.0 * mouthDimMm);

  const routePlan = computePortRoutingPlan({
    portRouting, portType, slotOrient, A, B, C_min, t,
    lvMm: lvInternalCheck, slotHmm, slotWallThick: slotWallThick || t,
    odMm: ductHoleDia, numDucts, hasCenterDiv, minClearanceMm: minPortClearanceMm
  });
  const clearanceMm = isVented
    ? (isBp ? (B - lvInternalCheck) : routePlan.clearanceMm)
    : C_min;
  if (isVented) {
    if (lvMm <= 0) {
      issues.push({
        level: 'critical',
        code: 'PORT_LV_NEGATIVE',
        msg: `Comprimento cortado do duto VF Lv = ${(lvMm / 10).toFixed(1)} cm é nulo/negativo. Aumente a área do duto ou baixe Fb.`
      });
    } else if (lvMm <= t) {
      // CAD-02: 0 < Lv <= espessura do painel t
      issues.push({
        level: 'critical',
        code: 'PORT_LV_SHORTER_THAN_WALL',
        msg: `Comprimento do duto Lv = ${lvMm.toFixed(1)} mm é menor ou igual à espessura do MDF (${t.toFixed(0)} mm) — duto não atravessa o baffle. Aumente a área do duto ou baixe Fb.`
      });
    } else if (boxType === 'bp6' && bpChambers && bpChambers.lvRearMm <= 0) {
      issues.push({
        level: 'critical',
        code: 'PORT_LV_NEGATIVE',
        msg: `Comprimento cortado do duto VR Lv_VR é nulo/negativo. Ajuste Diâm. VR / Qtde. VR ou Sintonia VR.`
      });
    } else if (boxType === 'bp6' && bpChambers && bpChambers.lvRearMm <= t) {
      issues.push({
        level: 'critical',
        code: 'PORT_LV_SHORTER_THAN_WALL',
        msg: `Comprimento do duto VR Lv_VR = ${bpChambers.lvRearMm.toFixed(1)} mm ≤ espessura do MDF (${t.toFixed(0)} mm).`
      });
    } else if (!isBp && portRouting === 'l_bend') {
      if (!routePlan.fits) {
        issues.push({
          level: 'critical',
          code: 'PORT_DEPTH_COLLISION',
          msg: `Duto em L (Lv = ${lvMaxCheck.toFixed(0)} mm) excede o espaço interno mesmo dobrado em 90° (Trecho 1 = ${routePlan.l1Mm.toFixed(0)} mm, Trecho 2 = ${routePlan.l2Mm.toFixed(0)} mm > limite ${routePlan.maxL2Mm.toFixed(0)} mm${hasCenterDiv ? ' c/ divisória central' : ''}).`
        });
      } else {
        issues.push({
          level: 'ok',
          code: 'PORT_L_BEND_ACTIVE',
          msg: `Duto em L (90° interno) ativo: Trecho 1 = ${routePlan.l1Mm.toFixed(0)} mm + Curva 90° (${routePlan.bendArcMm.toFixed(0)} mm) + Trecho 2 = ${routePlan.l2Mm.toFixed(0)} mm (folga útil ${clearanceMm.toFixed(0)} mm).`
        });
      }
    } else if (!isBp && portRouting === 'side_firing') {
      if (clearanceMm < minPortClearanceMm) {
        issues.push({
          level: 'critical',
          code: 'PORT_DEPTH_COLLISION',
          msg: `Duto Lateral Side-Firing (Lv = ${lvMaxCheck.toFixed(0)} mm) não cabe na largura interna A = ${A.toFixed(0)} mm (folga ${clearanceMm.toFixed(0)} mm < mínimo ${Math.round(minPortClearanceMm)} mm).`
        });
      } else {
        issues.push({
          level: 'ok',
          code: 'PORT_SIDE_FIRING_ACTIVE',
          msg: `Duto Lateral (Side-Firing) montado na face direita ao longo de A = ${A.toFixed(0)} mm (Lv = ${lvMaxCheck.toFixed(0)} mm, folga oposta ${clearanceMm.toFixed(0)} mm).`
        });
      }
    } else if (clearanceMm < minPortClearanceMm) {
      issues.push({
        level: 'critical',
        code: 'PORT_DEPTH_COLLISION',
        msg: isBp
          ? `Duto de topo (Lv = ${lvMaxCheck.toFixed(0)} mm) não cabe na altura interna B = ${B.toFixed(0)} mm (folga inferior ${clearanceMm.toFixed(0)} mm < mínimo ${Math.round(minPortClearanceMm)} mm).`
          : `Duto (Lv = ${lvMaxCheck.toFixed(0)} mm) viola folga mínima na boca interna (folga ${clearanceMm.toFixed(0)} mm < ${Math.round(minPortClearanceMm)} mm = ${isSlot ? 'max(40, 0.75×H)' : 'max(40, 0.50×D)'}).`
      });
    } else if (clearanceMm < warnPortClearanceMm) {
      issues.push({
        level: 'warn',
        code: 'PORT_CLEARANCE_TIGHT',
        msg: `Folga atrás da boca do duto (${clearanceMm.toFixed(0)} mm) abaixo do ideal 1.0×${isSlot ? 'H' : 'D'} (≥ ${Math.round(warnPortClearanceMm)} mm).`
      });
    }
  }

  // 7. Aviso documentado de flange estimado e isolamento Free-Air
  if (boxType === 'free-air') {
    issues.push({
      level: 'ok',
      code: 'FREE_AIR_ISOLATION',
      msg: 'Baffle Infinito (Free-Air): garanta vedação hermética entre a face frontal e traseira do painel (porta-malas/parede) para evitar curto-circuito acústico.'
    });
  }
  issues.push({
    level: 'ok',
    code: 'FLANGE_ESTIMATED',
    msg: `Recorte (${cutoutDia} mm) e flange (${flangeOD} mm) estimados para ${effectiveDiaIn}″ — confirme no datasheet físico antes de furar.`
  });

  // CAD-06: Velocidade do ar no duto (v_ar > velLimit: 17 m/s liso / 24 m/s flared) no gate de validação/exportação CAD
  let aeroBlocked = false;
  let aeroInfo = null;
  if (isVented) {
    const velConstraint = Array.isArray(opts.simConstraints)
      ? opts.simConstraints.find(c => c && c.code === 'PORT_VELOCITY_OVER_LIMIT')
      : null;
    const velLimitEff = Number.isFinite(opts.velLimit) && opts.velLimit > 0
      ? opts.velLimit
      : (velConstraint && Number.isFinite(velConstraint.limit) ? velConstraint.limit : ((portType === 'flared') ? 24.0 : 17.0));
    const airVelEff = Number.isFinite(opts.airVel)
      ? opts.airVel
      : (velConstraint && Number.isFinite(velConstraint.value) ? velConstraint.value : null);
    if (Number.isFinite(airVelEff) && airVelEff > velLimitEff) {
      aeroBlocked = true;
      aeroInfo = { airVel: +airVelEff.toFixed(1), velLimit: +velLimitEff.toFixed(1), freq: velConstraint && Number.isFinite(velConstraint.freq) ? +velConstraint.freq.toFixed(1) : null };
      issues.push({
        level: 'warn',
        code: 'PORT_AIR_VELOCITY_CRITICAL',
        requiresConfirm: true,
        airVel: aeroInfo.airVel,
        velLimit: aeroInfo.velLimit,
        msg: `CAD-06 (Sopro/Chuffing Crítico): Velocidade do ar (${aeroInfo.airVel} m/s) excede o limite laminar (${aeroInfo.velLimit} m/s${portType === 'flared' ? ' flared' : ' reto'}). Exportação CAD exige confirmação explícita ou aumento da área do duto.`
      });
    }
  }

  const criticalCount = issues.filter(i => i.level === 'critical').length;
  const warnCount = issues.filter(i => i.level === 'warn').length;

  return {
    valid: criticalCount === 0,
    criticalCount,
    warnCount,
    aeroBlocked,
    aeroInfo,
    issues,
    driverGeom: drvGeom,
    holes,
    clearanceMm: +clearanceMm.toFixed(1),
    minC: +C_min.toFixed(1)
  };
}

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
