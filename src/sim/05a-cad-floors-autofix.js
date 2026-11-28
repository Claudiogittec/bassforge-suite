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
