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
