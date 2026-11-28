// ============================================================================
// PGS — PARAMETRIC GEOMETRY SPECIFICATION & MANUFACTURING ENGINE (bassforge-pgs/v1)
// Fonte Única de Verdade (XYZ Cartesiano em mm, origem: ext-bottom-left-rear).
// Funções 100% puras: NÃO acessam o DOM, NÃO alteram o Physics Core.
// ============================================================================
function computeSheetNesting2D(parts, sheetW = 2750, sheetH = 1830, kerf = 3) {
  const flatItems = [];
  const oversizedParts = [];
  const invalidParts = [];
  (parts || []).forEach(p => {
    if (p.kind === 'port' && p.area <= 0) return; // tubos PVC não entram na chapa MDF
    const w = p.cutSize ? p.cutSize.w : p.w;
    const h = p.cutSize ? p.cutSize.h : p.h;
    if (!(Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0)) {
      invalidParts.push({ partId: p.id || p.name, name: p.name || 'Peça', w: Number.isFinite(w) ? +w.toFixed(1) : 0, h: Number.isFinite(h) ? +h.toFixed(1) : 0 });
      return;
    }
    const count = Math.max(1, parseInt(p.qty) || 1);
    for (let i = 0; i < count; i++) {
      flatItems.push({ partId: p.id || p.name, name: p.name, kind: p.kind, w: +w.toFixed(1), h: +h.toFixed(1) });
    }
  });
  // Ordena por maior lado decrescente (Shelf NFDH)
  flatItems.sort((a, b) => Math.max(b.w, b.h) - Math.max(a.w, a.h));

  const sheets = [];
  const placements = [];
  const startNewSheet = () => {
    const s = { idx: sheets.length, shelves: [] };
    sheets.push(s);
    return s;
  };
  if (flatItems.length > 0) startNewSheet();

  flatItems.forEach(item => {
    let placed = false;
    const tryOrientations = [
      { w: item.w, h: item.h, rotated: false },
      { w: item.h, h: item.w, rotated: true }
    ].filter(o => o.w <= sheetW && o.h <= sheetH);
    if (tryOrientations.length === 0) {
      oversizedParts.push({ partId: item.partId, name: item.name, w: item.w, h: item.h });
      return;
    }

    for (let sIdx = 0; sIdx < sheets.length && !placed; sIdx++) {
      const sh = sheets[sIdx];
      for (const shelf of sh.shelves) {
        for (const o of tryOrientations) {
          if (o.h <= shelf.h && shelf.curX + o.w <= sheetW) {
            placements.push({ sheetIdx: sIdx, partId: item.partId, name: item.name, kind: item.kind, x: +shelf.curX.toFixed(1), y: +shelf.y.toFixed(1), w: o.w, h: o.h, rotated: o.rotated });
            shelf.curX += o.w + kerf;
            placed = true;
            break;
          }
        }
        if (placed) break;
      }
      if (!placed) {
        const usedY = sh.shelves.reduce((acc, sf) => acc + sf.h + kerf, 0);
        // Escolhe orientação com menor altura para economizar prateleira
        const best = tryOrientations.slice().sort((a, b) => a.h - b.h)[0];
        if (usedY + best.h <= sheetH) {
          const newShelf = { y: usedY, h: best.h, curX: best.w + kerf };
          sh.shelves.push(newShelf);
          placements.push({ sheetIdx: sIdx, partId: item.partId, name: item.name, kind: item.kind, x: 0, y: +usedY.toFixed(1), w: best.w, h: best.h, rotated: best.rotated });
          placed = true;
        }
      }
    }
    if (!placed) {
      const sh = startNewSheet();
      const best = tryOrientations.slice().sort((a, b) => a.h - b.h)[0];
      sh.shelves.push({ y: 0, h: best.h, curX: best.w + kerf });
      placements.push({ sheetIdx: sh.idx, partId: item.partId, name: item.name, kind: item.kind, x: 0, y: 0, w: best.w, h: best.h, rotated: best.rotated });
    }
  });

  const usedAreaMm2 = placements.reduce((acc, pl) => acc + pl.w * pl.h, 0);
  const totalSheetAreaMm2 = Math.max(1, sheets.length * sheetW * sheetH);
  return {
    sheetW, sheetH, kerfMm: kerf,
    sheetsCount: sheets.length,
    utilizationPct: +((usedAreaMm2 / totalSheetAreaMm2) * 100).toFixed(1),
    placements,
    oversizedParts,
    invalidParts
  };
}

function buildAssemblySequence(parts) {
  const sorted = (parts || []).slice().sort((a, b) => (a.assemblyOrder || 99) - (b.assemblyOrder || 99));
  return sorted.map((p, idx) => ({
    step: idx + 1,
    partId: p.id,
    name: p.name,
    qty: p.qty,
    action: p.kind === 'divider'
      ? 'Instalar divisória interna no eixo X da câmara, vedar 100% com cola PVA + massa e fixar driver antes do fechamento.'
      : (p.kind === 'port'
          ? 'Posicionar e colar duto/divisória respeitando o comprimento físico Lv e a folga traseira ≥ 40 mm.'
          : (p.kind === 'batten'
              ? 'Colar e parafusar sarrafos internos nas paredes para elevar f₁₁.'
              : `Posicionar ${p.name} (${p.cutSize.w.toFixed(0)}×${p.cutSize.h.toFixed(0)} mm), aplicar cola PVA e parafusar a cada 120 mm.`))
  }));
}

// CAD-03: Detector puro de colisões 3D entre dutos e ímã/cesta do driver ou travamentos internos (CROSS/FF/TB/LR/MATRIX)
function detectPgs3dCollisions(model, ac) {
  const collisions = [];
  if (!model || !model.envelope) return collisions;
  const env = model.envelope;
  const t = (model.material && model.material.thickness) || 18;
  const F = env.F || 500, E = env.E || 400, A = env.A || 464, B = env.B || 364;
  const D_ext = env.D_ext || 350;
  const C_min = Math.min(env.C || 300, env.D || 300);
  const parts = model.parts || [];
  const cutouts = model.cutouts || [];
  const acSafe = ac || {};
  const routing = acSafe.portRouting || 'straight';
  const rp = acSafe.portRoutePlan || null;
  const portOff = Number(acSafe.portOffsetMm || 0);
  const isInverted = (acSafe.mountMode === 'inverted') || (model.drivers && model.drivers[0] && model.drivers[0].mountMode === 'inverted');
  const tol = 2.0; // 2 mm tolerância numérica

  const clampVal = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const aabbOverlap = (a, b) => (
    Math.min(a[1], b[1]) - Math.max(a[0], b[0]) > tol &&
    Math.min(a[3], b[3]) - Math.max(a[2], b[2]) > tol &&
    Math.min(a[5], b[5]) - Math.max(a[4], b[4]) > tol
  );
  const cylOverlapAabb = (cyl, box) => {
    if (cyl.axis === '+Z') {
      if (Math.min(cyl.z1, box[5]) - Math.max(cyl.z0, box[4]) <= tol) return false;
      const qx = clampVal(cyl.cx, box[0], box[1]);
      const qy = clampVal(cyl.cy, box[2], box[3]);
      return Math.hypot(cyl.cx - qx, cyl.cy - qy) < cyl.r - tol;
    }
    if (cyl.axis === '-X') {
      if (Math.min(cyl.x1, box[1]) - Math.max(cyl.x0, box[0]) <= tol) return false;
      const qy = clampVal(cyl.cy, box[2], box[3]);
      const qz = clampVal(cyl.cz, box[4], box[5]);
      return Math.hypot(cyl.cy - qy, cyl.cz - qz) < cyl.r - tol;
    }
    if (cyl.axis === '-Y') {
      if (Math.min(cyl.y1, box[3]) - Math.max(cyl.y0, box[2]) <= tol) return false;
      const qx = clampVal(cyl.cx, box[0], box[1]);
      const qz = clampVal(cyl.cz, box[4], box[5]);
      return Math.hypot(cyl.cx - qx, cyl.cz - qz) < cyl.r - tol;
    }
    return false;
  };
  const ductOverlapDriverCyl = (du, drv) => {
    if (du.kind === 'box') return cylOverlapAabb(drv, du.box);
    if (du.axis === '+Z') {
      if (Math.min(du.z1, drv.z1) - Math.max(du.z0, drv.z0) <= tol) return false;
      return Math.hypot(du.cx - drv.cx, du.cy - drv.cy) < (du.r + drv.r - tol);
    }
    if (du.axis === '-X') {
      // Cilindro ao longo de X (x0..x1, cy, cz, r) vs cilindro do driver ao longo de Z (cx, cy, z0..z1, r)
      const qx = clampVal(drv.cx, du.x0, du.x1);
      const qz = clampVal(du.cz, drv.z0, drv.z1);
      const d3 = Math.hypot(qx - drv.cx, du.cy - drv.cy, du.cz - qz);
      return d3 < (du.r + drv.r - tol);
    }
    if (du.axis === '-Y') {
      const qy = clampVal(drv.cy, du.y0, du.y1);
      const qz = clampVal(du.cz, drv.z0, drv.z1);
      const d3 = Math.hypot(du.cx - drv.cx, qy - drv.cy, du.cz - qz);
      return d3 < (du.r + drv.r - tol);
    }
    return false;
  };

  // 1. Coleta todos os volumes 3D reais dos dutos (incluindo numDucts > 1, l_bend, side_firing, slot, triMeta)
  const ductPrims = [];
  parts.filter(p => p.kind === 'port').forEach(p => {
    const [ox, oy, oz] = p.origin;
    const [dx, dy, dz] = p.size;
    if (p.area <= 0) {
      if (p.bpTopRound) {
        const r = dx / 2;
        const isRear = (p.id === 'P_PORT_REAR');
        const hs = cutouts.filter(c => c.kind === 'port' && c.shape === 'round' && c.partId === 'P_TOP' && ((/Traseir/.test(c.label || '')) === isRear));
        hs.forEach((ch, idx) => {
          const lv = ch.lvMm || dy;
          const y0 = Math.max(t, E + portOff - lv);
          ductPrims.push({ id: `${p.id}_${idx + 1}`, label: ch.label || p.name, kind: 'cyl', axis: '-Y', cx: t + ch.xInt, y0, y1: y0 + lv, cz: t + ch.yInt, r });
        });
      } else if (p.id === 'P_PORT_SERIES') {
        const r = dy / 2;
        const hs = cutouts.filter(c => c.partId && c.partId.startsWith('P_BP_DIVIDER') && c.kind === 'port');
        if (hs.length) {
          hs.forEach((ch, idx) => {
            const lv = Math.min(dx, ch.lvMm || dx);
            ductPrims.push({ id: `${p.id}_${idx + 1}`, label: ch.label || p.name, kind: 'cyl', axis: '-X', x0: ox, x1: ox + lv, cy: t + ch.yInt, cz: t + ch.xInt, r });
          });
        } else {
          ductPrims.push({ id: p.id, label: p.name, kind: 'cyl', axis: '-X', x0: ox, x1: ox + dx, cy: oy + r, cz: oz + r, r });
        }
      } else if (routing === 'side_firing' || p.sideFiring) {
        const r = dy / 2;
        const lv = dx;
        const hs = cutouts.filter(c => c.kind === 'port' && c.shape === 'round' && (c.partId === 'P_SIDES' || c.panel === 'lateral_dir'));
        if (hs.length) {
          hs.forEach((ch, idx) => {
            const lCur = ch.lvMm || lv;
            const x0 = Math.max(t, F - t + portOff - lCur);
            ductPrims.push({ id: `${p.id}_${idx + 1}`, label: ch.label || p.name, kind: 'cyl', axis: '-X', x0, x1: x0 + lCur, cy: t + ch.yInt, cz: t + ch.xInt, r });
          });
        } else {
          ductPrims.push({ id: p.id, label: p.name, kind: 'cyl', axis: '-X', x0: ox, x1: ox + lv, cy: oy + r, cz: oz + r, r });
        }
      } else {
        const r = dx / 2;
        const hs = cutouts.filter(c => c.kind === 'port' && c.shape === 'round' && c.partId === 'P_FRONT_BAFFLE');
        if (routing === 'l_bend' && rp && rp.l2Mm >= 10 && hs.length) {
          const l1 = Math.max(40, rp.l1Mm);
          const l2 = Math.max(10, rp.l2Mm);
          const rElb = Math.max(r * 1.15, Number(rp.rElbow) || r * 1.6);
          const zBack = Math.max(t + rElb + r, D_ext + portOff - l1);
          hs.forEach((ch, idx) => {
            const cx = t + ch.xInt, cy = t + ch.yInt;
            const dirX = (cx <= F / 2) ? 1 : -1;
            ductPrims.push({ id: `${p.id}_L1_${idx + 1}`, label: `${ch.label || p.name} (Trecho 1)`, kind: 'cyl', axis: '+Z', cx, cy, z0: zBack, z1: zBack + l1, r });
            const xStartL2 = (dirX > 0) ? (cx + rElb) : (cx - rElb - l2);
            ductPrims.push({ id: `${p.id}_L2_${idx + 1}`, label: `${ch.label || p.name} (Trecho 2 · 90°)`, kind: 'cyl', axis: '-X', x0: xStartL2, x1: xStartL2 + l2, cy, cz: zBack - rElb, r });
          });
        } else if (hs.length) {
          hs.forEach((ch, idx) => {
            const lv = ch.lvMm || dz;
            const z0 = Math.max(t, D_ext + portOff - lv);
            ductPrims.push({ id: `${p.id}_${idx + 1}`, label: ch.label || p.name, kind: 'cyl', axis: '+Z', cx: t + ch.xInt, cy: t + ch.yInt, z0, z1: z0 + lv, r });
          });
        } else {
          ductPrims.push({ id: p.id, label: p.name, kind: 'cyl', axis: '+Z', cx: ox + r, cy: oy + r, z0: oz, z1: oz + dz, r });
        }
      }
    } else if (p.triMeta) {
      const tm = p.triMeta;
      const ta = tm.triA || 140, tb = tm.triB || 140, lv = tm.lvMm || dz;
      const z0 = Math.max(t, D_ext + portOff - lv);
      (tm.corners || [0]).forEach((ci, idx) => {
        const c = ((ci % 4) + 4) % 4;
        const x0 = (c === 0 || c === 2) ? t : (t + A - ta);
        const y0 = (c === 0 || c === 1) ? t : (t + B - tb);
        ductPrims.push({ id: `P_PORT_TRI_${idx + 1}`, label: p.name, kind: 'box', box: [x0, x0 + ta, y0, y0 + tb, z0, z0 + lv] });
      });
    } else if (p.sharedCenterSlot) {
      ductPrims.push({ id: `${p.id}_L`, label: p.name, kind: 'box', box: [p.sharedCenterSlot.xLeft, p.sharedCenterSlot.xLeft + dx, oy, oy + dy, oz, oz + dz] });
      ductPrims.push({ id: `${p.id}_R`, label: p.name, kind: 'box', box: [p.sharedCenterSlot.xRight, p.sharedCenterSlot.xRight + dx, oy, oy + dy, oz, oz + dz] });
    } else if (p.splitByCenterDiv) {
      ductPrims.push({ id: `${p.id}_L`, label: p.name, kind: 'box', box: [p.splitByCenterDiv.xLeft, p.splitByCenterDiv.xLeft + dx, oy, oy + dy, oz, oz + dz] });
      ductPrims.push({ id: `${p.id}_R`, label: p.name, kind: 'box', box: [p.splitByCenterDiv.xRight, p.splitByCenterDiv.xRight + dx, oy, oy + dy, oz, oz + dz] });
    } else {
      ductPrims.push({ id: p.id, label: p.name, kind: 'box', box: [ox, ox + dx, oy, oy + dy, oz, oz + dz] });
    }
  });

  if (ductPrims.length === 0) return collisions;

  // 2. Colisão 3D Duto × Ímã/Cesta do Driver (quando montagem normal, ímã interno)
  if (!isInverted) {
    const drvCyls = [];
    cutouts.filter(c => c.kind === 'driver' && c.partId === 'P_FRONT_BAFFLE' && c.dia).forEach(dc => {
      const dcx = t + dc.xInt, dcy = t + dc.yInt, dd = dc.dia;
      const dBasket = Math.min(Math.max(40, C_min - 25), Math.min(110, dd * 0.28));
      const dMagnet = Math.min(Math.max(60, C_min - 30), dd * 0.56);
      drvCyls.push({ id: dc.id, label: dc.label || 'Driver', part: 'cesta', axis: '+Z', cx: dcx, cy: dcy, r: dd * 0.50, z0: D_ext - t - dBasket, z1: D_ext - t });
      drvCyls.push({ id: dc.id, label: dc.label || 'Driver', part: 'ímã', axis: '+Z', cx: dcx, cy: dcy, r: dd * 0.34, z0: D_ext - t - dMagnet, z1: D_ext - t });
    });
    const reportedDrv = new Set();
    ductPrims.forEach(du => {
      drvCyls.forEach(drv => {
        const key = `${du.id}::${drv.id}`;
        if (reportedDrv.has(key)) return;
        if (ductOverlapDriverCyl(du, drv)) {
          reportedDrv.add(key);
          collisions.push({
            code: 'PORT_DRIVER_3D_COLLISION',
            ductId: du.id,
            targetId: drv.id,
            msg: `Colisão 3D (CAD-03): ${du.label} intercepta ${drv.part} do ${drv.label} no interior da caixa. Reposicione o duto, reduza Lv ou aumente a profundidade C.`
          });
        }
      });
    });
  }

  // 3. Colisão 3D Duto × Travamentos Internos (CROSS/FF/TB/LR/BAFFLE/REAR) e Divisórias Matriz (MATRIX_V/H)
  const braceBoxes = [];
  parts.forEach(p => {
    const [ox, oy, oz] = p.origin;
    const [dx, dy, dz] = p.size;
    if (p.kind === 'batten') {
      braceBoxes.push({ id: p.id, label: p.name || p.id, box: [ox, ox + dx, oy, oy + dy, oz, oz + dz] });
    } else if (p.id === 'P_MATRIX_V' && p.matrixMeta) {
      const cols = Math.max(2, parseInt(p.matrixMeta.cols) || 2);
      for (let k = 1; k < cols; k++) {
        const xk = t + k * (A / cols) - t / 2;
        braceBoxes.push({ id: `P_MATRIX_V_${k}`, label: `Divisória Matriz V#${k}`, box: [xk, xk + t, t, t + B, t, D_ext - t] });
      }
    } else if (p.id === 'P_MATRIX_H' && p.matrixMeta) {
      const rows = Math.max(2, parseInt(p.matrixMeta.rows) || 2);
      for (let j = 1; j < rows; j++) {
        const yj = t + j * (B / rows) - t / 2;
        braceBoxes.push({ id: `P_MATRIX_H_${j}`, label: `Divisória Matriz H#${j}`, box: [t, t + A, yj, yj + t, t, D_ext - t] });
      }
    }
  });

  const reportedBrace = new Set();
  ductPrims.forEach(du => {
    braceBoxes.forEach(br => {
      const key = `${du.id}::${br.id}`;
      if (reportedBrace.has(key)) return;
      const hit = (du.kind === 'box') ? aabbOverlap(du.box, br.box) : cylOverlapAabb(du, br.box);
      if (hit) {
        reportedBrace.add(key);
        collisions.push({
          code: 'PORT_BRACE_3D_COLLISION',
          ductId: du.id,
          targetId: br.id,
          msg: `Colisão 3D (CAD-03): ${du.label} intercepta travamento/divisória interna (${br.label}). Ajuste o travamento ou o roteamento do duto.`
        });
      }
    });
  });

  return collisions;
}

function validatePgsGeometry(model, p0Validation) {
  const checks = [];
  const env = model.envelope;
  const t = model.material.thickness;
  const parts = model.parts || [];
  const partMap = {};
  parts.forEach(p => { partMap[p.id] = p; });

  // G01: Dimensões externas
  const g01Pass = Math.abs(env.F - (env.A + 2 * t)) < 0.5 && Math.abs(env.E - (env.B + 2 * t)) < 0.5;
  checks.push({ code: 'G01', label: 'Dimensões externas (F, E, C_ext)', pass: g01Pass, detail: `F=${env.F}mm, E=${env.E}mm, C_ext=${env.C_ext}/${env.D_ext}mm` });

  // G02: Dimensões internas
  const g02Pass = env.A > 0 && env.B > 0 && env.C > 0 && env.D > 0;
  checks.push({ code: 'G02', label: 'Dimensões internas (A, B, C, D)', pass: g02Pass, detail: `A=${env.A}mm, B=${env.B}mm, C=${env.C}/${env.D}mm` });

  // G03: Espessura real dos painéis
  const g03Pass = parts.filter(p => p.kind === 'mdf' || p.kind === 'divider').every(p => Math.abs(p.thickness - t) < 0.1);
  checks.push({ code: 'G03', label: 'Espessura real dos painéis', pass: g03Pass, detail: `MDF ${t} mm consistente em todos os painéis estruturais` });

  // G04: Volume líquido reconstruído vs alvo
  const isFreeAirModel = (model.topology === 'free-air');
  const g04Pass = isFreeAirModel || Math.abs(model.volumes.deltaL) <= 0.35;
  checks.push({ code: 'G04', label: 'Volume líquido verificado', pass: g04Pass, detail: isFreeAirModel ? 'Baffle Infinito (Vb → ∞ · painel plano)' : `Alvo=${(model.volumes.VbTarget + model.volumes.VrTarget).toFixed(1)}L | Reconstruído=${model.volumes.VnetVerified.toFixed(1)}L (Δ=${model.volumes.deltaL.toFixed(2)}L)` });

  // G05: Volume driver
  const g05Pass = model.volumes.Vsub >= 0;
  checks.push({ code: 'G05', label: 'Volume ocupado pelo(s) driver(s)', pass: g05Pass, detail: `Vsub=${model.volumes.Vsub.toFixed(2)}L (${model.drivers[0] ? model.drivers[0].mountMode : 'normal'})` });

  // G06: Volume dutos
  const g06Pass = model.volumes.Vduto >= 0;
  checks.push({ code: 'G06', label: 'Volume ocupado pelos dutos', pass: g06Pass, detail: `Vduto=${model.volumes.Vduto.toFixed(2)}L` });

  // G07: Volume reforços (desconta furos circulares quando Window Brace / Painel Matriz)
  const battenVol = parts.filter(p => p.kind === 'batten').reduce((acc, p) => {
    const holesA = (p.braceMeta && p.braceMeta.holesAreaMm2) ? p.braceMeta.holesAreaMm2 : 0;
    const netA = Math.max(50.0 * p.cutSize.h, p.cutSize.w * p.cutSize.h - holesA);
    return acc + (p.qty * netA * p.thickness) / 1e6;
  }, 0);
  const g07Pass = Math.abs(battenVol - model.volumes.Vbracing) <= 0.15;
  checks.push({ code: 'G07', label: 'Volume ocupado pelos reforços', pass: g07Pass, detail: `Vtravas=${model.volumes.Vbracing.toFixed(2)}L` });

  // G08: Interferências e colisões (2D P0 + 3D profundidade duto + CAD-03 duto×driver/travamentos)
  const p0Crit = (p0Validation && p0Validation.issues) ? p0Validation.issues.filter(i => i.level === 'critical') : [];
  const ductColl3d = (model.ducts || []).some(du => {
    if (du.axis === '-Y') return du.origin[1] < t + 39.5;
    if (du.axis === '-X') return du.origin[0] < t + 39.5;
    return du.origin[2] < t + 39.5;
  });
  const col3d = Array.isArray(model.collisions3d) ? model.collisions3d : [];
  const g08Pass = p0Crit.length === 0 && !ductColl3d && col3d.length === 0;
  const g08Codes = [...p0Crit.map(i => i.code), ...(ductColl3d ? ['DUCT_3D_COLLISION'] : []), ...col3d.map(c => c.code)];
  checks.push({ code: 'G08', label: 'Interferências e colisões (2D + 3D)', pass: g08Pass, detail: g08Pass ? 'Zero colisões de furos e sólidos' : g08Codes.join(', ') });

  // G09: Comprimento físico dos dutos (CAD-02: exige Lv > espessura do painel t)
  const g09Pass = (model.ducts || []).every(du => Number.isFinite(du.lvMm) && du.lvMm > t);
  checks.push({ code: 'G09', label: 'Comprimento físico dos dutos (Lv)', pass: g09Pass, detail: model.ducts.length ? model.ducts.map(d => `${d.id}=${d.lvMm}mm`).join(', ') : 'Sem duto (selada/planar)' });

  // G10: Recortes e furos vinculados a partId válido
  const g10Pass = (model.cutouts || []).every(c => !!partMap[c.partId]);
  checks.push({ code: 'G10', label: 'Recortes e furos vinculados a painéis', pass: g10Pass, detail: `${model.cutouts.length} recorte(s) validados` });

  // G11: Montagem e encaixes
  const seqIds = new Set((model.manufacturing.assemblySequence || []).map(s => s.partId));
  const g11Pass = (model.joints || []).every(j => !!partMap[j.partA] && !!partMap[j.partB]) && parts.every(p => seqIds.has(p.id));
  checks.push({ code: 'G11', label: 'Montagem, uniões e sequência', pass: g11Pass, detail: `${model.joints.length} uniões · ${model.manufacturing.assemblySequence.length} etapas` });

  // G12: Correspondência 3D <-> Plano de Corte
  const cl = model.manufacturing.cutList || [];
  const g12Pass = cl.length === parts.length && cl.every((c, i) => c.id === parts[i].id && Math.abs(c.w - parts[i].cutSize.w) < 0.05 && Math.abs(c.h - parts[i].cutSize.h) < 0.05);
  checks.push({ code: 'G12', label: 'Correspondência 3D ↔ Plano de Corte', pass: g12Pass, detail: `Fonte única: ${parts.length} sólidos === ${cl.length} itens de corte` });

  return checks;
}

function buildPgsGeometryModel(pack) {
  const dm = pack.dimensions;
  const ac = pack.acoustics;
  const dr = pack.driver;
  const t = dm.t;
  const A = dm.A, B = dm.B, C = dm.C_top, D = dm.D_bot, F = dm.F_ext, E = dm.E_ext;
  const C_ext = dm.C_ext_top, D_ext = dm.D_ext_bot;
  const C_med = 0.5 * (C + D);
  const maxD = Math.max(F, E, D_ext, 200);
  const expBase = +(maxD * 0.22).toFixed(1);

  const parts = [];
  const joints = [];
  const ducts = [];
  const cutouts = [];

  // Mapeia cada peça de pack.pieces para um sólido XYZ real (Fonte Única de Verdade)
  const isTrapModel = (dm.shape === 'trapezoidal' && Math.abs(D - C) > 0.5);
  const isBpSlotModel = !!(ac.isBpSlot || (ac.bpChambers && ac.bpChambers.isBpSlot));
  const isBp6ParSlot = !!(isBpSlotModel && ac.bpChambers && ac.bpChambers.isBp6Parallel);
  const isBpDualSlot = !!(isBpSlotModel && ac.bpChambers && ac.bpChambers.dualDiv);
  const bpSlotW = (ac.bpChambers && ac.bpChambers.slotWidthMm) ? ac.bpChambers.slotWidthMm : 60;
  let battenIdx = 0;
  let portIdx = 0;
  (pack.pieces || []).forEach(p => {
    let id = 'P_MISC', origin = [0, 0, 0], size = [p.w, p.h, p.t], explodeDir = [0, 0, 0], explodeDist = expBase, assemblyOrder = 5, frontFace = '+Z', extraMeta = {};
    if (p.orient === 'BASE') {
      id = 'P_BASE'; origin = [0, 0, 0]; size = [F, t, D_ext]; explodeDir = [0, -1, 0]; explodeDist = +(expBase * 0.85).toFixed(1); assemblyOrder = 1; frontFace = '+Y';
    } else if (p.orient === 'TRÁS') {
      id = 'P_REAR'; origin = [0, t, 0]; size = [F, B, t]; explodeDir = [0, 0, -1]; assemblyOrder = 2; frontFace = '+Z';
      if (isTrapModel) extraMeta.trapezoid = { cTop: C, dBot: D, angleDeg: dm.angle || 0, rearH: dm.rearH || B };
    } else if (p.orient === 'LADO ESQ/DIR') {
      // Gera referência espacial da lateral esquerda (e segunda instância em X = F - t)
      const isFlushFrontSide = !!(ac.planarGeom || p.h > C_med + 0.5);
      const sideDepth = isFlushFrontSide ? +(D_ext - t).toFixed(1) : +(D_ext - 2 * t).toFixed(1);
      id = 'P_SIDES'; origin = [0, t, t]; size = [t, B, sideDepth]; explodeDir = [-1, 0, 0]; explodeDist = +(expBase * 0.9).toFixed(1); assemblyOrder = 3; frontFace = '+X';
      if (isTrapModel) extraMeta.trapezoid = { cTop: C, dBot: D, angleDeg: dm.angle || 0 };
      if (isBpSlotModel) {
        if (isBp6ParSlot) {
          extraMeta.leftTopExtend = true;
          extraMeta.rightTopExtend = true;
        } else if (!isBpDualSlot) {
          extraMeta.rightTopExtend = true;
        }
      }
    } else if (p.kind === 'divider') {
      if (p.orient === 'PLANAR_DIV') {
        const c4Val = (ac.planarGeom && ac.planarGeom.C4) ? ac.planarGeom.C4 : (B * 0.80);
        const divY = Math.max(t, E - t - c4Val - t);
        const planarOff = (Number.isFinite(ac.portOffsetMm) && ac.portOffsetMm < 0) ? ac.portOffsetMm : 0;
        const divZ = +(t + D + planarOff).toFixed(1);
        const divLen = Math.max(20, +(D_ext - (t + D)).toFixed(1));
        id = 'P_PLANAR_DIV'; origin = [t, +divY.toFixed(1), divZ]; size = [p.w, t, divLen]; explodeDir = [0, -0.35, 0.5]; explodeDist = +(expBase * 0.7).toFixed(1); assemblyOrder = 5; frontFace = '+Y';
        if (p.qty === 2 && ac.hasCenterDiv) {
          extraMeta.splitByCenterDiv = { xLeft: t, xRight: +(t + p.w + t).toFixed(1) };
        }
      } else if (p.orient === 'PLANAR_TRI') {
        id = 'P_PLANAR_CHAMFER'; origin = [t, t, +(t + D + t).toFixed(1)]; size = [t, p.h, Math.max(10, p.w - t)]; explodeDir = [-0.6, 0.3, 0.6]; explodeDist = +(expBase * 0.75).toFixed(1); assemblyOrder = 5; frontFace = '+X';
        if (ac.hasCenterDiv) extraMeta.dualPlanarTri = true;
      } else if (p.orient === 'CENTER_DIV') {
        const divX = t + (A - t) / 2;
        const divDepth = ac.planarGeom ? +(D_ext - t).toFixed(1) : +(D_ext - 2 * t).toFixed(1);
        id = 'P_CENTER_DIV'; origin = [+divX.toFixed(1), t, t]; size = [t, B, divDepth]; explodeDir = [0, 0.35, 0]; explodeDist = +(expBase * 0.6).toFixed(1); assemblyOrder = 4; frontFace = '+X';
        if (isTrapModel) extraMeta.trapezoid = { cTop: C, dBot: D, angleDeg: dm.angle || 0 };
      } else if (p.orient === 'MATRIX_V') {
        id = 'P_MATRIX_V';
        const vf = ac.vehicleFit || {};
        origin = [+(t + A / Math.max(2, vf.matrixCols || 2) - t / 2).toFixed(1), t, t];
        size = [t, B, +(D_ext - 2 * t).toFixed(1)];
        explodeDir = [0, 0.4, 0]; explodeDist = +(expBase * 0.65).toFixed(1); assemblyOrder = 4; frontFace = '+X';
        extraMeta.matrixMeta = { axis: 'V', cols: vf.matrixCols || 2, rows: vf.matrixRows || 1 };
      } else if (p.orient === 'MATRIX_H') {
        id = 'P_MATRIX_H';
        const vf = ac.vehicleFit || {};
        origin = [t, +(t + B / Math.max(2, vf.matrixRows || 2) - t / 2).toFixed(1), t];
        size = [A, t, +(D_ext - 2 * t).toFixed(1)];
        explodeDir = [0, 0, 0.45]; explodeDist = +(expBase * 0.65).toFixed(1); assemblyOrder = 4; frontFace = '+Y';
        extraMeta.matrixMeta = { axis: 'H', cols: vf.matrixCols || 1, rows: vf.matrixRows || 2 };
      } else if (p.orient === 'WHEEL_ARCH') {
        id = 'P_WHEEL_ARCH';
        const wa = (ac.vehicleFit && ac.vehicleFit.wheelArch) ? ac.vehicleFit.wheelArch : { K: 120, H: 260, J: 180 };
        origin = [0, 0, +(Math.max(t, (D_ext - wa.H) / 2)).toFixed(1)];
        size = [wa.K, wa.J, wa.H];
        explodeDir = [-0.8, -0.3, 0]; explodeDist = +(expBase * 0.8).toFixed(1); assemblyOrder = 4; frontFace = '+X';
        extraMeta.wheelArch = wa;
      } else if (p.orient === 'PROTECT_BAR') {
        id = 'P_PROTECT_BAR';
        origin = [+(F / 2 - 25).toFixed(1), 0, +D_ext.toFixed(1)];
        size = [50, E, t];
        explodeDir = [0, 0, 1.15]; explodeDist = +(expBase * 0.95).toFixed(1); assemblyOrder = 8; frontFace = '+Z';
      } else if (p.orient === 'DIVISÓRIA_1' || p.orient === 'DIVISÓRIA_2') {
        const aRearS = (ac.bpChambers && ac.bpChambers.A_rear_side) ? ac.bpChambers.A_rear_side : (A / 4);
        const aFront = (ac.bpChambers && ac.bpChambers.A_front) ? ac.bpChambers.A_front : (A / 2);
        const divX = (p.orient === 'DIVISÓRIA_1') ? (t + aRearS) : (t + aRearS + t + aFront);
        id = (p.orient === 'DIVISÓRIA_1') ? 'P_BP_DIVIDER_1' : 'P_BP_DIVIDER_2';
        origin = [+divX.toFixed(1), t, t]; size = [t, B, +(D_ext - 2 * t).toFixed(1)]; explodeDir = [0, 0.35, 0]; explodeDist = +(expBase * 0.6).toFixed(1); assemblyOrder = 4; frontFace = '+X';
        if (isTrapModel) extraMeta.trapezoid = { cTop: C, dBot: D, angleDeg: dm.angle || 0 };
      } else {
        const divX = (ac.bpChambers && ac.bpChambers.A_rear) ? (t + ac.bpChambers.A_rear) : (F / 2 - t / 2);
        id = 'P_BP_DIVIDER'; origin = [+divX.toFixed(1), t, t]; size = [t, B, +(D_ext - 2 * t).toFixed(1)]; explodeDir = [0, 0.35, 0]; explodeDist = +(expBase * 0.6).toFixed(1); assemblyOrder = 4; frontFace = '+X';
        if (isTrapModel) extraMeta.trapezoid = { cTop: C, dBot: D, angleDeg: dm.angle || 0 };
      }
    } else if (p.kind === 'batten') {
      battenIdx++;
      const bi = p.braceInfo || null;
      const bCode = bi ? bi.code : (String(p.orient || '').startsWith('TRAVA_') ? String(p.orient).replace('TRAVA_', '') : null);
      id = bCode ? `P_BRACE_${bCode}` : `P_BATTEN_${battenIdx}`;
      const drvFrontList = (ac.mountMode === 'inverted') ? [] : (pack.baffleHoles || []).filter(hl => hl.kind === 'driver' && (!hl.panel || hl.panel === 'frontal') && hl.dia);
      const portFrontList = (pack.baffleHoles || []).filter(hl => hl.kind === 'port' && (!hl.panel || hl.panel === 'frontal'));
      const maxDrvDiaPgs = drvFrontList.reduce((mx, d) => Math.max(mx, d.dia || 0), 0);
      const maxPortLvPgs = portFrontList.reduce((mx, d) => Math.max(mx, d.lvMm || 0), 0);
      if (bCode === 'CROSS') {
        let cxPgs = F * 0.5 - t / 2;
        drvFrontList.forEach(dc => {
          const dcx = t + dc.xInt, rClr = dc.dia * 0.50 + 18;
          if (Math.abs((cxPgs + t / 2) - dcx) < rClr) {
            if (dcx - rClr - t >= t + 30) cxPgs = dcx - rClr - t;
            else if (dcx + rClr + t <= F - t - 30) cxPgs = dcx + rClr;
            else cxPgs = t + 35;
          }
        });
        portFrontList.forEach(pc => {
          const pcx = t + pc.xInt;
          const rClr = (pc.shape === 'round' ? (pc.dia * 0.5) : ((pc.w || 60) * 0.5)) + 14;
          if (Math.abs((cxPgs + t / 2) - pcx) < rClr) {
            if (pcx - rClr - t >= t + 25) cxPgs = pcx - rClr - t;
            else if (pcx + rClr + t <= F - t - 25) cxPgs = pcx + rClr;
          }
        });
        origin = [+cxPgs.toFixed(1), t, t];
        size = [t, B, +(D_ext - 2 * t).toFixed(1)];
        explodeDir = [0, 0.5, 0];
        extraMeta.braceMeta = { code: 'CROSS', axis: 'YZ', isWindow: true, holesCount: bi ? bi.holesCount : (isTrapModel ? 5 : 6), holeDiaMm: bi ? bi.holeDiaMm : 80, holesAreaMm2: bi ? bi.holesAreaMm2 : 0 };
      } else if (bCode === 'TB') {
        origin = [+(t + A * 0.22 - 25).toFixed(1), t, t];
        size = [50, B, t];
        explodeDir = [0, 0.5, 0];
        extraMeta.braceMeta = { code: 'TB', axis: 'Y', isWindow: false, holesAreaMm2: 0 };
      } else if (bCode === 'LR') {
        let zLr = t + C_med * 0.5 - t / 2;
        let yLr = t + B * 0.5 - 25;
        if (maxDrvDiaPgs > 0) {
          const zBehind = (D_ext - t) - Math.min(Math.max(60, D_ext - 2 * t - 45), maxDrvDiaPgs * 0.56) - t;
          zLr = Math.max(t + t + 12, Math.min(zLr, zBehind));
        }
        if (maxPortLvPgs > 0) {
          const zBehindPort = (D_ext - maxPortLvPgs) - t - 12;
          if (zBehindPort >= t + t + 12) {
            zLr = Math.min(zLr, zBehindPort);
          } else {
            // Desvia verticalmente dos dutos frontais se o duto for profundo
            const hitsPortY = yCand => portFrontList.some(pc => {
              const py = t + pc.yInt;
              const pr = pc.shape === 'round' ? (pc.dia * 0.5 + 8) : ((pc.h || 60) * 0.5 + 8);
              return (yCand < py + pr && yCand + 50 > py - pr);
            });
            if (hitsPortY(yLr)) {
              const cands = [t + B * 0.80 - 25, t + B * 0.20 - 25, t + 15, E - t - 65];
              const clearY = cands.find(yc => yc >= t + 8 && yc + 50 <= E - t - 8 && !hitsPortY(yc));
              if (Number.isFinite(clearY)) yLr = clearY;
            }
          }
        }
        origin = [t, +yLr.toFixed(1), +zLr.toFixed(1)];
        size = [A, 50, t];
        explodeDir = [0, 0.4, 0.3];
        extraMeta.braceMeta = { code: 'LR', axis: 'X', isWindow: false, holesAreaMm2: 0 };
      } else if (bCode === 'FF') {
        let xFf = t + A * 0.78 - 25;
        drvFrontList.forEach(dc => {
          if (Math.hypot((xFf + 25) - (t + dc.xInt), (t + 20 + t * 0.5) - (t + dc.yInt)) < dc.dia * 0.50 + 35) xFf = F - t - 58;
        });
        const hitsPortFf = xCand => portFrontList.some(pc => {
          const px = t + pc.xInt, py = t + pc.yInt;
          const rx = pc.shape === 'round' ? (pc.dia * 0.5 + 10) : ((pc.w || 60) * 0.5 + 10);
          const ry = pc.shape === 'round' ? (pc.dia * 0.5 + 10) : ((pc.h || 60) * 0.5 + 10);
          return (xCand < px + rx && xCand + 50 > px - rx) && (t + 20 < py + ry && t + 20 + t > py - ry);
        });
        if (hitsPortFf(xFf)) {
          const xCands = [t + 20, t + A * 0.22 - 25, t + A * 0.5 - 25, F - t - 70];
          const clearX = xCands.find(xc => xc >= t + 10 && xc + 50 <= F - t - 10 && !hitsPortFf(xc));
          if (Number.isFinite(clearX)) xFf = clearX;
        }
        origin = [+xFf.toFixed(1), +(t + 20).toFixed(1), +(t + t).toFixed(1)];
        size = [50, t, Math.max(40, +(D_ext - 3 * t).toFixed(1))];
        explodeDir = [0, 0.3, 0.5];
        extraMeta.braceMeta = { code: 'FF', axis: 'Z', isWindow: false, holesAreaMm2: 0 };
      } else if (bCode === 'BAFFLE') {
        origin = [t, +(E - t - 50).toFixed(1), +(D_ext - 2 * t).toFixed(1)];
        size = [A, 50, t];
        explodeDir = [0, 0.3, 0.6];
        extraMeta.braceMeta = { code: 'BAFFLE', axis: 'X', isWindow: false, holesAreaMm2: 0 };
      } else if (bCode === 'REAR') {
        origin = [t, +(t + B * 0.22 - 25).toFixed(1), +(t + t).toFixed(1)];
        size = [A, 50, t];
        explodeDir = [0, 0.3, -0.5];
        extraMeta.braceMeta = { code: 'REAR', axis: 'X', isWindow: false, holesAreaMm2: 0 };
      } else {
        origin = [+(F * 0.5 - 25).toFixed(1), t, t];
        size = [50, p.h, t];
        explodeDir = [0, 0.5, 0];
      }
      explodeDist = +(expBase * 0.5).toFixed(1); assemblyOrder = 4; frontFace = '+Z';
    } else if (p.kind === 'port') {
      portIdx++;
      const isBpTopSlotP = (p.orient === 'DUTO_BP_TOP' || p.orient === 'DUTO_BP_TOP_VR');
      const isSharedVertP = (p.orient === 'DUTO_UNICO_V');
      const isDualVertP = (p.orient === 'DUTO_DUAL_V');
      const isSlotP = /Régua|Divisória Duto/.test(p.name);
      const isTriP = /Triângulo/.test(p.name);
      const isSeriesP = (p.orient === 'DUTO SERIE' || /Série/.test(p.name));
      const isRearP = !isSeriesP && (p.orient === 'DUTO_BP_TOP_VR' || /Traseira/.test(p.name));
      const isBpTopRoundP = !isBpTopSlotP && !isSeriesP && !!(ac.bpChambers && ac.bpChambers.isBp);
      id = isSeriesP ? 'P_PORT_SERIES' : (isRearP ? 'P_PORT_REAR' : `P_PORT_${portIdx}`);
      const portOff = Number(ac.portOffsetMm || 0);
      const zStart = Math.max(t, D_ext + portOff - p.h);
      let ductAxis = '+Z';
      if (isBpTopSlotP) {
        const isRearTop = (p.orient === 'DUTO_BP_TOP_VR');
        const wallH = Math.min(B - 40, p.h);
        const yTopSlot = Math.max(t, E + portOff - wallH);
        if (isBpDualSlot && !isRearTop) {
          const xL = F / 2 - bpSlotW / 2 - p.t;
          const xR = F / 2 + bpSlotW / 2;
          origin = [+xL.toFixed(1), +yTopSlot.toFixed(1), t];
          size = [p.t, +wallH.toFixed(1), +(D_ext - 2 * t).toFixed(1)];
          extraMeta.sharedCenterSlot = { xLeft: +xL.toFixed(1), xRight: +xR.toFixed(1) };
        } else if (isBpDualSlot && isRearTop) {
          const xL = t + bpSlotW;
          const xR = F - t - bpSlotW - p.t;
          origin = [+xL.toFixed(1), +yTopSlot.toFixed(1), t];
          size = [p.t, +wallH.toFixed(1), +(D_ext - 2 * t).toFixed(1)];
          extraMeta.sharedCenterSlot = { xLeft: +xL.toFixed(1), xRight: +xR.toFixed(1) };
        } else {
          const wallX = isRearTop ? (t + bpSlotW) : (F - t - bpSlotW - p.t);
          origin = [+wallX.toFixed(1), +yTopSlot.toFixed(1), t];
          size = [p.t, +wallH.toFixed(1), +(D_ext - 2 * t).toFixed(1)];
        }
        explodeDir = isRearTop ? [-0.4, 0.5, 0] : [0.4, 0.5, 0];
        extraMeta.bpTopSlot = true;
        extraMeta.axis = '-Y';
        ductAxis = '-Y';
      } else if (isSharedVertP) {
        const slotHole = (pack.baffleHoles || []).find(hl => hl.kind === 'port' && hl.shape === 'slot');
        const a3 = (slotHole && slotHole.w) ? slotHole.w : 70;
        const zStartSlot = Math.max(t, D_ext + portOff - p.h);
        const xLeftWall = t + (A - a3 - 2 * p.t) / 2;
        const xRightWall = xLeftWall + p.t + a3;
        origin = [+xLeftWall.toFixed(1), t, +zStartSlot.toFixed(1)];
        size = [p.t, B, p.h];
        explodeDir = [0, 0, 0.6];
        extraMeta.sharedCenterSlot = { xLeft: +xLeftWall.toFixed(1), xRight: +xRightWall.toFixed(1) };
      } else if (isDualVertP) {
        const slotHole = (pack.baffleHoles || []).find(hl => hl.kind === 'port' && hl.shape === 'slot');
        const sw = (slotHole && slotHole.w) ? slotHole.w : 60;
        const zStartSlot = Math.max(t, D_ext + portOff - p.h);
        const xLeftWall = t + sw;
        const xRightWall = F - t - sw - p.t;
        origin = [+xLeftWall.toFixed(1), t, +zStartSlot.toFixed(1)];
        size = [p.t, B, p.h];
        explodeDir = [0, 0, 0.6];
        extraMeta.sharedCenterSlot = { xLeft: +xLeftWall.toFixed(1), xRight: +xRightWall.toFixed(1) };
      } else if (p.orient === 'DUTO_L2') {
        const isH = (ac.slotOrient !== 'vertical');
        const rp = ac.portRoutePlan || {};
        const l1Eff = Math.max(t, Number(rp.l1Mm) || p.h);
        const zL2 = +Math.max(t + 40, Math.min(D_ext - t - p.t, D_ext + portOff - l1Eff)).toFixed(1);
        const slotHole = (pack.baffleHoles || []).find(hl => hl.kind === 'port' && hl.shape === 'slot');
        if (isH) {
          const sh = slotHole && slotHole.h ? slotHole.h : 55;
          const sx = slotHole && Number.isFinite(slotHole.xInt)
            ? Math.max(t, Math.min(F - t - p.w, t + slotHole.xInt - p.w / 2))
            : t;
          const maxL2Y = Math.max(10, B - sh - p.t);
          const l2Y = Math.min(p.h, maxL2Y);
          origin = [+sx.toFixed(1), +(t + sh + p.t).toFixed(1), zL2];
          size = [p.w, +l2Y.toFixed(1), p.t];
        } else {
          const sw = slotHole && slotHole.w ? slotHole.w : 60;
          const sy = slotHole && Number.isFinite(slotHole.yInt)
            ? Math.max(t, Math.min(E - t - p.w, t + slotHole.yInt - p.w / 2))
            : t;
          const maxL2X = Math.max(10, A - sw - p.t);
          const l2X = Math.min(p.h, maxL2X);
          origin = [+(t + sw + p.t).toFixed(1), +sy.toFixed(1), zL2];
          size = [+l2X.toFixed(1), p.w, p.t];
        }
        explodeDir = [0, 0, -0.45];
      } else if (isSlotP) {
        const isH = (ac.slotOrient !== 'vertical');
        const isSideSlotP = (ac.portRouting === 'side_firing' && ac.boxType === 'bass-reflex');
        const slotHole = (pack.baffleHoles || []).find(hl => hl.kind === 'port' && hl.shape === 'slot');
        if (isSideSlotP) {
          const xStartSide = Math.max(t, F - t + portOff - p.h);
          if (isH) {
            const sh = slotHole && slotHole.h ? slotHole.h : 55;
            origin = [+xStartSide.toFixed(1), +(t + sh).toFixed(1), t];
            size = [p.h, p.t, Math.min(C_med, p.w)];
          } else {
            const sw = slotHole && slotHole.w ? slotHole.w : 60;
            origin = [+xStartSide.toFixed(1), t, +(t + sw).toFixed(1)];
            size = [p.h, Math.min(B, p.w), p.t];
          }
          explodeDir = [0.65, 0, 0];
          extraMeta.axis = '-X';
          extraMeta.sideFiring = true;
          ductAxis = '-X';
        } else {
          const zStartSlot = Math.max(t, D_ext + portOff - p.h);
          if (isH) {
            const sh = slotHole && slotHole.h ? slotHole.h : 55;
            if (p.qty === 2 && ac.hasCenterDiv) {
              origin = [t, +(t + sh).toFixed(1), +zStartSlot.toFixed(1)];
              size = [p.w, p.t, p.h];
              extraMeta.splitByCenterDiv = { xLeft: t, xRight: +(t + p.w + t).toFixed(1) };
            } else {
              const sx = slotHole && Number.isFinite(slotHole.xInt)
                ? Math.max(t, Math.min(F - t - p.w, t + slotHole.xInt - p.w / 2))
                : t;
              origin = [+sx.toFixed(1), +(t + sh).toFixed(1), +zStartSlot.toFixed(1)];
              size = [p.w, p.t, p.h];
            }
          } else {
            const sw = slotHole && slotHole.w ? slotHole.w : 60;
            const sy = slotHole && Number.isFinite(slotHole.yInt)
              ? Math.max(t, Math.min(E - t - p.w, t + slotHole.yInt - p.w / 2))
              : t;
            origin = [+(t + sw).toFixed(1), +sy.toFixed(1), +zStartSlot.toFixed(1)];
            size = [p.t, p.w, p.h];
          }
          explodeDir = isH ? [0, -0.35, 0.5] : [-0.5, 0, 0.5];
        }
      } else if (isTriP) {
        const triHoles = (pack.baffleHoles || []).filter(hl => hl.kind === 'port' && hl.shape === 'triangle');
        const ta = triHoles[0] && triHoles[0].triA ? triHoles[0].triA : 140;
        const tb = triHoles[0] && triHoles[0].triB ? triHoles[0].triB : 140;
        origin = [t, t, +Math.max(t, D_ext + portOff - p.h).toFixed(1)];
        size = [p.w, p.t, p.h];
        explodeDir = [0, 0, 0.65];
        extraMeta.triMeta = {
          count: p.qty, triA: ta, triB: tb, lvMm: p.h,
          corners: triHoles.map(h => h.cornerIdx)
        };
      } else if (isSeriesP) {
        const divX = (ac.bpChambers && ac.bpChambers.dualDiv)
          ? (t + ac.bpChambers.A_rear_side)
          : ((ac.bpChambers && ac.bpChambers.A_rear) ? (t + ac.bpChambers.A_rear) : (F / 2 - t / 2));
        const serHole = (pack.baffleHoles || []).find(hl => hl.panel && hl.panel.startsWith('divisoria') && hl.kind === 'port');
        const sY = serHole ? (t + serHole.yInt - p.w / 2) : (t + 40);
        const sZ = serHole ? (t + serHole.xInt - p.w / 2) : (t + 40);
        origin = [+Math.max(t, divX - p.h).toFixed(1), +sY.toFixed(1), +sZ.toFixed(1)];
        size = [p.h, p.w, p.w];
        explodeDir = [-0.6, 0, 0];
        extraMeta.axis = '-X';
        ductAxis = '-X';
      } else if (isBpTopRoundP) {
        const px = isRearP && ac.bpChambers ? (t + (ac.bpChambers.dualDiv ? ac.bpChambers.A_rear_side : ac.bpChambers.A_rear) / 2) : (F / 2);
        const yStartTop = Math.max(t, E + portOff - p.h);
        origin = [+px.toFixed(1), +yStartTop.toFixed(1), +(D_ext - C_ext + C_ext / 2).toFixed(1)];
        size = [p.w, p.h, p.w];
        explodeDir = [0, 0.75, 0];
        extraMeta.axis = '-Y';
        extraMeta.bpTopRound = true;
        ductAxis = '-Y';
      } else if (ac.portRouting === 'side_firing' && ac.boxType === 'bass-reflex') {
        const xStartSide = Math.max(t, F - t + portOff - p.h);
        origin = [+xStartSide.toFixed(1), +(t + B * 0.5 - p.w * 0.5).toFixed(1), +(t + C_med * 0.5 - p.w * 0.5).toFixed(1)];
        size = [p.h, p.w, p.w];
        explodeDir = [0.75, 0, 0];
        extraMeta.axis = '-X';
        extraMeta.sideFiring = true;
        ductAxis = '-X';
      } else {
        const px = F - t - p.w;
        origin = [+px.toFixed(1), +(t + 40).toFixed(1), +zStart.toFixed(1)];
        size = [p.w, p.w, p.h];
        explodeDir = [0, 0, 0.75];
      }
      assemblyOrder = 5; frontFace = (isSeriesP || extraMeta.sideFiring) ? '-X' : ((isBpTopSlotP || isBpTopRoundP) ? '-Y' : '+Z');
      ducts.push({ id, name: p.name, lvMm: Math.round(p.h), origin, size, axis: ductAxis, chamber: isSeriesP ? 'series' : (isRearP ? 'rear' : 'front') });
    } else if (p.orient === 'CIMA') {
      const topZ = isTrapModel ? +(D_ext - C_ext).toFixed(1) : 0;
      const topX = isBp6ParSlot ? +(t + bpSlotW).toFixed(1) : 0;
      id = 'P_TOP'; origin = [topX, E - t, topZ]; size = [+p.w.toFixed(1), t, C_ext]; explodeDir = [0, 1, 0]; explodeDist = +(expBase * 0.9).toFixed(1); assemblyOrder = 6; frontFace = '-Y';
      if (isBpDualSlot) {
        extraMeta.topSplit = {
          xLeft: isBp6ParSlot ? +(t + bpSlotW).toFixed(1) : 0,
          xRight: +(F / 2 + bpSlotW / 2).toFixed(1)
        };
      }
    } else if (p.orient === 'FRENTE') {
      id = 'P_FRONT_BAFFLE';
      const isSharedVertFront = (p.qty === 2 && ac.isSharedCenterPort);
      const isPlanarDualFront = (p.qty === 2 && !!ac.planarGeom && ac.hasCenterDiv);
      const isSlotVert1Front = (ac.boxType === 'bass-reflex' && ac.slotOrient === 'vertical' && p.w < A - 0.5 && !isSharedVertFront && !ac.isDualVertSlot);
      const fX = (isSharedVertFront || isPlanarDualFront)
        ? t
        : (isSlotVert1Front ? +(F - t - p.w).toFixed(1) : +((F - p.w) / 2).toFixed(1));
      const fY = (ac.boxType === 'free-air')
        ? 0
        : +(E - t - p.h).toFixed(1);
      const fZ = (ac.boxType === 'free-air') ? 0 : (ac.planarGeom ? +(t + D).toFixed(1) : +(D_ext - t).toFixed(1));
      origin = [fX, Math.max(0, fY), fZ];
      size = [p.w, p.h, t];
      if (isSharedVertFront) extraMeta.frontSplit = { xLeft: t, xRight: +(F - t - p.w).toFixed(1) };
      if (isPlanarDualFront) extraMeta.frontSplit = { xLeft: t, xRight: +(t + p.w + t).toFixed(1) };
      explodeDir = [0, 0, 1];
      assemblyOrder = 7;
      frontFace = '+Z';
    }
    parts.push({
      id, name: p.name, kind: p.kind, orient: p.orient, qty: p.qty,
      material: p.kind === 'port' && p.area <= 0 ? 'PVC/ABS' : `MDF ${p.t}mm`,
      thickness: p.t, origin, size,
      cutSize: { w: +p.w.toFixed(1), h: +p.h.toFixed(1), bevelDeg: +p.bev.toFixed(1) },
      rotation: [0, 0, 0], frontFace, explodeDir, explodeDist, assemblyOrder,
      cutoutIds: [], jointIds: [], area: p.area, note: p.note, ...extraMeta
    });
  });

  // Cutouts vinculados ao partId hospedeiro
  const partById = {};
  parts.forEach(p => { partById[p.id] = p; });
  (pack.baffleHoles || []).forEach((hl, i) => {
    const cid = `CUT_${hl.kind === 'driver' ? 'DRV' : 'PORT'}_${i + 1}`;
    let hostId = 'P_FRONT_BAFFLE';
    if (hl.panel === 'divisoria_1' && partById.P_BP_DIVIDER_1) hostId = 'P_BP_DIVIDER_1';
    else if (hl.panel === 'divisoria_2' && partById.P_BP_DIVIDER_2) hostId = 'P_BP_DIVIDER_2';
    else if (hl.panel === 'divisoria' && partById.P_BP_DIVIDER) hostId = 'P_BP_DIVIDER';
    else if (hl.panel === 'topo' && partById.P_TOP) hostId = 'P_TOP';
    else if (hl.panel === 'lateral_dir' && partById.P_SIDES) hostId = 'P_SIDES';
    cutouts.push({
      id: cid, partId: hostId, panel: hl.panel || 'frontal', kind: hl.kind, shape: hl.shape, label: hl.label,
      xInt: hl.xInt, yInt: hl.yInt, xExt: hl.xExt, yExt: hl.yExt,
      dia: hl.dia || null, flangeDia: hl.flangeDia || null, w: hl.w || null, h: hl.h || null,
      triA: hl.triA || null, triB: hl.triB || null, cornerIdx: Number.isFinite(hl.cornerIdx) ? hl.cornerIdx : null,
      lvMm: hl.lvMm || 0
    });
    if (partById[hostId]) partById[hostId].cutoutIds.push(cid);
  });

  // Uniões estruturais verificáveis
  const addJoint = (id, a, b, type) => {
    if (partById[a] && partById[b]) {
      joints.push({ id, partA: a, partB: b, type });
      partById[a].jointIds.push(id);
      partById[b].jointIds.push(id);
    }
  };
  addJoint('J_REAR_BASE', 'P_REAR', 'P_BASE', 'butt_glue_screw');
  addJoint('J_SIDES_BASE', 'P_SIDES', 'P_BASE', 'butt_glue_screw');
  addJoint('J_SIDES_TOP', 'P_SIDES', 'P_TOP', 'butt_glue_screw');
  addJoint('J_FRONT_BASE', 'P_FRONT_BAFFLE', 'P_BASE', 'butt_glue_screw');
  addJoint('J_FRONT_TOP', 'P_FRONT_BAFFLE', 'P_TOP', 'butt_glue_screw');
  if (partById.P_BP_DIVIDER) addJoint('J_DIV_BASE', 'P_BP_DIVIDER', 'P_BASE', 'internal_divider');
  if (partById.P_BP_DIVIDER_1) addJoint('J_DIV1_BASE', 'P_BP_DIVIDER_1', 'P_BASE', 'internal_divider');
  if (partById.P_BP_DIVIDER_2) addJoint('J_DIV2_BASE', 'P_BP_DIVIDER_2', 'P_BASE', 'internal_divider');
  if (partById.P_CENTER_DIV) addJoint('J_CENTER_DIV_BASE', 'P_CENTER_DIV', 'P_BASE', 'internal_divider');
  if (partById.P_PLANAR_DIV) addJoint('J_PLANAR_DIV_BASE', 'P_PLANAR_DIV', 'P_BASE', 'planar_throat');
  if (partById.P_PLANAR_CHAMFER) addJoint('J_PLANAR_CHAMFER_FRONT', 'P_PLANAR_CHAMFER', 'P_FRONT_BAFFLE', 'miter_45');

  const isFreeAirModel = (ac.boxType === 'free-air');
  const isBp = !!(ac.bpChambers && ac.bpChambers.isBp);
  const internalDivCnt = isBp ? (ac.bpChambers.dualDiv ? 2 : 1) : (ac.hasCenterDiv ? 1 : 0);
  const A_net = Math.max(100, A - internalDivCnt * t);
  const VgrossFromParts = isFreeAirModel ? 0 : +((A_net * B * C_med) / 1e6).toFixed(2);
  const VnetVerified = isFreeAirModel ? 0 : +(VgrossFromParts - ac.Vsub - ac.Vduto - ac.Vbracing).toFixed(2);
  const targetNet = isFreeAirModel ? 0 : +(ac.Vb + (ac.Vr || 0)).toFixed(2);

  const sheetLayout = computeSheetNesting2D(parts, 2750, 1830, 3);
  const assemblySequence = buildAssemblySequence(parts);
  const cutList = parts.map(p => ({ id: p.id, name: p.name, qty: p.qty, w: p.cutSize.w, h: p.cutSize.h, t: p.thickness, bevelDeg: p.cutSize.bevelDeg }));

  const model = {
    schema: 'bassforge-pgs/v1',
    topology: ac.boxType,
    units: { length: 'mm', angle: 'deg', volume: 'L' },
    coordinateSystem: { x: 'width', y: 'height', z: 'depth', origin: 'ext-bottom-left-rear' },
    material: { name: 'MDF', thickness: t, densityKgM3: 750, sheetW: 2750, sheetH: 1830, kerfMm: 3 },
    envelope: { shape: dm.shape || 'rectangular', angleDeg: dm.angle || 0, A, B, C, D, F, E, C_ext, D_ext },
    parts, cutouts, ducts,
    drivers: [{ name: dr.name, qty: dr.nDrivers, diaIn: dr.dia_in, mountMode: ac.mountMode || 'normal', vSub: ac.Vsub }],
    joints,
    dimensions: [
      { key: 'F', label: 'Largura Externa', value: F }, { key: 'E', label: 'Altura Externa', value: E },
      { key: 'A', label: 'Largura Interna', value: A }, { key: 'B', label: 'Altura Interna', value: B },
      { key: 'C', label: 'Profundidade Sup. Int.', value: C }, { key: 'D', label: 'Profundidade Inf. Int.', value: D },
      { key: 'T', label: 'Espessura MDF', value: t }
    ],
    volumes: {
      VbTarget: ac.Vb, VrTarget: ac.Vr || 0, Vsub: ac.Vsub, Vduto: ac.Vduto, Vbracing: ac.Vbracing,
      VgrossFromParts, VnetVerified, deltaL: +(VnetVerified - targetNet).toFixed(2)
    },
    manufacturing: { cutList, sheetLayout, assemblySequence },
    collisions3d: [],
    validation: []
  };
  model.collisions3d = detectPgs3dCollisions(model, ac);
  model.validation = validatePgsGeometry(model, pack.validation);
  return model;
}

function setWoodlockExplode(ratio) {
  wlExplodeRatio = Math.max(0, Math.min(1, parseFloat(ratio) || 0));
  document.querySelectorAll('[data-wl-exp]').forEach(b => {
    b.classList.toggle('active', Math.abs(parseFloat(b.getAttribute('data-wl-exp')) - wlExplodeRatio) < 0.05);
  });
  const titleEl = document.getElementById('wlCanvasTitle');
  if (titleEl && wlViewMode === 'exploded') {
    titleEl.textContent = `Vista 3D ${wlExplodeRatio < 0.05 ? 'Montada (0%)' : `Explodida (${Math.round(wlExplodeRatio * 100)}%)`}`;
  }
  renderActiveWoodlockCanvas();
}

function setWoodlockViewMode(mode) {
  wlViewMode = ['blueprint', 'exploded', 'cutplan', 'nesting'].includes(mode) ? mode : 'blueprint';
  document.querySelectorAll('[data-wl-view]').forEach(b => {
    b.classList.toggle('active', b.getAttribute('data-wl-view') === wlViewMode);
  });
  const expBar = document.getElementById('wlExplodeBar');
  if (expBar) expBar.style.display = (wlViewMode === 'exploded') ? 'inline-flex' : 'none';
  const titleEl = document.getElementById('wlCanvasTitle');
  if (titleEl) {
    titleEl.textContent = wlViewMode === 'exploded'
      ? `Vista 3D ${wlExplodeRatio < 0.05 ? 'Montada (0%)' : `Explodida (${Math.round(wlExplodeRatio * 100)}%)`}`
      : (wlViewMode === 'cutplan'
          ? 'Planificação de Peças (Cut-Plan 2D) — Quantidades e Cotas'
          : (wlViewMode === 'nesting'
              ? 'Distribuição na Chapa MDF 2750×1830 mm (Nesting 2D)'
              : 'Blueprint Técnico Lateral (Lv vs C) e Frontal'));
  }
  renderActiveWoodlockCanvas();
}

function renderActiveWoodlockCanvas() {
  if (!lastBuildPack) return;
  const dm = lastBuildPack.dimensions;
  const ac = lastBuildPack.acoustics;
  if (wlViewMode === 'exploded') {
    drawWoodlockExploded3D(lastBuildPack, null, wlExplodeRatio);
  } else if (wlViewMode === 'cutplan') {
    drawWoodlockCutPlan2D(lastBuildPack);
  } else if (wlViewMode === 'nesting') {
    drawWoodlockNesting2D(lastBuildPack);
  } else {
    drawWoodlockBlueprint({
      A: dm.A, B: dm.B, C_top: dm.C_top, D_bot: dm.D_bot, F_ext: dm.F_ext, E_ext: dm.E_ext, t: dm.t,
      isTrap: dm.shape === 'trapezoidal',
      isVented: ['bass-reflex', 'bp4', 'bp6'].includes(ac.boxType),
      lvMm: ac.lvMm,
      bpChambers: ac.bpChambers,
      mountMode: ac.mountMode,
      validation: lastBuildPack.validation
    });
  }
}

let wlCamYaw = -0.58;
let wlCamPitch = 0.40;
let wlCamZoom = 1.0;
let wlCamXray = true;
let _wlOrbitBound = false;

function toggleWoodlockXray() {
  wlCamXray = !wlCamXray;
  const b = document.getElementById('btnWlXray');
  if (b) b.classList.toggle('active', wlCamXray);
  renderActiveWoodlockCanvas();
}

function resetWoodlockCam() {
  wlCamYaw = -0.58;
  wlCamPitch = 0.40;
  wlCamZoom = 1.0;
  renderActiveWoodlockCanvas();
}

function bindWoodlock3dOrbit() {
  if (_wlOrbitBound) return;
  const cv = document.getElementById('woodlockCanvas');
  if (!cv || typeof cv.addEventListener !== 'function') return;
  _wlOrbitBound = true;
  let dragging = false, lx = 0, ly = 0;
  cv.addEventListener('mousedown', e => {
    if (wlViewMode !== 'exploded') return;
    dragging = true; lx = e.clientX; ly = e.clientY;
    cv.style.cursor = 'grabbing';
  });
  window.addEventListener('mousemove', e => {
    if (!dragging || wlViewMode !== 'exploded') return;
    const dx = e.clientX - lx, dy = e.clientY - ly;
    lx = e.clientX; ly = e.clientY;
    wlCamYaw += dx * 0.0085;
    wlCamPitch = Math.max(-1.35, Math.min(1.35, wlCamPitch + dy * 0.0085));
    renderActiveWoodlockCanvas();
  });
  window.addEventListener('mouseup', () => {
    if (dragging) {
      dragging = false;
      cv.style.cursor = 'grab';
    }
  });
  cv.addEventListener('wheel', e => {
    if (wlViewMode !== 'exploded') return;
    e.preventDefault();
    wlCamZoom = Math.max(0.55, Math.min(2.5, wlCamZoom * (e.deltaY > 0 ? 0.92 : 1.08)));
    renderActiveWoodlockCanvas();
  }, { passive: false });
  cv.addEventListener('dblclick', () => {
    if (wlViewMode === 'exploded') resetWoodlockCam();
  });
}

/**
 * Visualizador 3D Sólido Interativo 360° (estilo SketchUp) lendo EXCLUSIVAMENTE pack.geometry.parts (PGS).
 * Suporta arrastar com o mouse (Orbit 360°), scroll (Zoom), Raio-X e explosão 0%/50%/100%.
 */
function drawWoodlockExploded3D(pack, targetCanvas, explodeRatio = 1.0) {
  bindWoodlock3dOrbit();
  const cv = targetCanvas || document.getElementById('woodlockCanvas');
  if (!cv || !pack) return;
  const geom = pack.geometry || buildPgsGeometryModel(pack);
  const ctx = cv.getContext('2d');
  const dpr = targetCanvas ? 1 : (window.devicePixelRatio || 1);
  const w = targetCanvas ? (targetCanvas.width || 920) : (cv.clientWidth || 500);
  const h = targetCanvas ? (targetCanvas.height || 360) : (cv.clientHeight || 350);
  if (!targetCanvas) {
    cv.width = w * dpr;
    cv.height = h * dpr;
    ctx.scale(dpr, dpr);
  }
  ctx.fillStyle = '#060911';
  ctx.fillRect(0, 0, w, h);

  const env = geom.envelope;
  const ac = pack.acoustics;
  const F = env.F, E = env.E, D = env.D_ext, t = geom.material.thickness;
  const er = Math.max(0, Math.min(1, Number.isFinite(explodeRatio) ? explodeRatio : 1.0));
  const yaw = targetCanvas ? -0.58 : wlCamYaw;
  const pitch = targetCanvas ? 0.40 : wlCamPitch;
  const zoom = targetCanvas ? 1.0 : wlCamZoom;
  const xray = targetCanvas ? false : wlCamXray;

  const cy = Math.cos(yaw), sy = Math.sin(yaw);
  const cp = Math.cos(pitch), sp = Math.sin(pitch);
  const maxD = Math.max(F, E, D, 200);
  const exp = maxD * 0.22 * er;
  const sc = (Math.min(w, h) * 0.62 / Math.max(1, maxD + 1.8 * exp)) * zoom;
  const ox = w * 0.50;
  const oy = h * 0.53;

  const project = (x, y, z) => {
    const px = x - F / 2, py = y - E / 2, pz = z - D / 2;
    const rx = px * cy - pz * sy;
    const rz1 = px * sy + pz * cy;
    const ry = py * cp - rz1 * sp;
    const rz = py * sp + rz1 * cp;
    return { x: ox + rx * sc, y: oy - ry * sc, z: rz };
  };

  // Iluminação direcional difusa (estilo SketchUp)
  const L = [0.45, 0.72, 0.53];
  const shadeRgb = (base, nx, ny, nz, alpha) => {
    // Rotaciona normal para o espaço da câmera para sombreamento suave
    const rnx = nx * cy - nz * sy;
    const rnz1 = nx * sy + nz * cy;
    const rny = ny * cp - rnz1 * sp;
    const rnz = ny * sp + rnz1 * cp;
    const dot = Math.max(0, Math.min(1, rnx * L[0] + rny * L[1] + rnz * L[2]));
    const lum = 0.44 + 0.56 * dot;
    return `rgba(${Math.round(base[0] * lum)},${Math.round(base[1] * lum)},${Math.round(base[2] * lum)},${alpha})`;
  };

  const faces = [];
  const pushBoxFaces = (x0, y0, z0, dx, dy, dz, baseRgb, strokeCol, alpha, partId) => {
    const pts = [
      project(x0, y0, z0), project(x0 + dx, y0, z0), project(x0 + dx, y0, z0 + dz), project(x0, y0, z0 + dz),
      project(x0, y0 + dy, z0), project(x0 + dx, y0 + dy, z0), project(x0 + dx, y0 + dy, z0 + dz), project(x0, y0 + dy, z0 + dz)
    ];
    const isFrontP = (partId === 'P_FRONT_BAFFLE');
    const isTopP = (partId === 'P_TOP');
    const isDivP = !!(partId && partId.startsWith('P_BP_DIVIDER'));
    const quads = [
      { idxs: [0, 1, 2, 3], n: [0, -1, 0], cutoutFace: isTopP ? 'top' : null, cutoutCoord: y0 }, // base
      { idxs: [4, 7, 6, 5], n: [0, 1, 0], cutoutFace: isTopP ? 'top' : null, cutoutCoord: y0 + dy }, // topo
      { idxs: [0, 4, 5, 1], n: [0, 0, -1], cutoutFace: isFrontP ? 'front' : null, cutoutCoord: z0 }, // tras
      { idxs: [3, 2, 6, 7], n: [0, 0, 1], cutoutFace: isFrontP ? 'front' : null, cutoutCoord: z0 + dz }, // frente
      { idxs: [0, 3, 7, 4], n: [-1, 0, 0], cutoutFace: isDivP ? 'divider' : null, cutoutCoord: x0 }, // esq
      { idxs: [1, 5, 6, 2], n: [1, 0, 0], cutoutFace: isDivP ? 'divider' : null, cutoutCoord: x0 + dx } // dir
    ];
    quads.forEach(q => {
      const avgZ = (pts[q.idxs[0]].z + pts[q.idxs[1]].z + pts[q.idxs[2]].z + pts[q.idxs[3]].z) * 0.25;
      faces.push({
        depth: avgZ,
        pts: q.idxs.map(i => pts[i]),
        fill: shadeRgb(baseRgb, q.n[0], q.n[1], q.n[2], alpha),
        stroke: strokeCol,
        partId,
        cutoutFace: q.cutoutFace,
        cutoutCoord: q.cutoutCoord,
        xMin: x0,
        xMax: x0 + dx
      });
    });
  };

  const partColors = p => {
    if (p.kind === 'divider') return [[167, 139, 250], '#c4b5fd'];
    if (p.kind === 'port') return [[251, 146, 60], '#fdba74'];
    if (p.kind === 'batten') return [[96, 165, 250], '#93c5fd'];
    return [[203, 174, 134], '#38bdf8']; // MDF madeira natural clara com aresta ciano
  };

  const isTrap3d = (env.shape === 'trapezoidal' && Math.abs((env.D || 0) - (env.C || 0)) > 0.5);
  const zRb3d = t;
  const zRt3d = t + Math.max(0, (env.D || (D - 2 * t)) - (env.C || (D - 2 * t)));

  const pushTrapSideFaces = (x0, y0, zFront, dy, thick, baseRgb, strokeCol, alpha, partId) => {
    const pts = [
      project(x0, y0, zRb3d), project(x0 + thick, y0, zRb3d), project(x0 + thick, y0, zFront), project(x0, y0, zFront),
      project(x0, y0 + dy, zRt3d), project(x0 + thick, y0 + dy, zRt3d), project(x0 + thick, y0 + dy, zFront), project(x0, y0 + dy, zFront)
    ];
    const isDivP = !!(partId && partId.startsWith('P_BP_DIVIDER'));
    const quads = [
      { idxs: [0, 1, 2, 3], n: [0, -1, 0] }, { idxs: [4, 7, 6, 5], n: [0, 1, 0] },
      { idxs: [0, 4, 5, 1], n: [0, 0, -1] }, { idxs: [3, 2, 6, 7], n: [0, 0, 1] },
      { idxs: [0, 3, 7, 4], n: [-1, 0, 0], cutoutFace: isDivP ? 'divider' : null, cutoutCoord: x0 },
      { idxs: [1, 5, 6, 2], n: [1, 0, 0], cutoutFace: isDivP ? 'divider' : null, cutoutCoord: x0 + thick }
    ];
    quads.forEach(q => {
      const avgZ = (pts[q.idxs[0]].z + pts[q.idxs[1]].z + pts[q.idxs[2]].z + pts[q.idxs[3]].z) * 0.25;
      faces.push({
        depth: avgZ,
        pts: q.idxs.map(i => pts[i]),
        fill: shadeRgb(baseRgb, q.n[0], q.n[1], q.n[2], alpha),
        stroke: strokeCol,
        partId,
        cutoutFace: q.cutoutFace,
        cutoutCoord: q.cutoutCoord
      });
    });
  };

  const pushCylinderFaces = (cx, cy0, cz0, r, len, axis, baseRgb, strokeCol, alpha) => {
    const segs = 12;
    for (let i = 0; i < segs; i++) {
      const a0 = (i / segs) * Math.PI * 2, a1 = ((i + 1) / segs) * Math.PI * 2;
      const ca0 = Math.cos(a0) * r, sa0 = Math.sin(a0) * r, ca1 = Math.cos(a1) * r, sa1 = Math.sin(a1) * r;
      let p0, p1, p2, p3;
      if (axis === '-Y') {
        p0 = project(cx + ca0, cy0, cz0 + sa0); p1 = project(cx + ca1, cy0, cz0 + sa1);
        p2 = project(cx + ca1, cy0 + len, cz0 + sa1); p3 = project(cx + ca0, cy0 + len, cz0 + sa0);
      } else if (axis === '-X') {
        p0 = project(cx, cy0 + ca0, cz0 + sa0); p1 = project(cx, cy0 + ca1, cz0 + sa1);
        p2 = project(cx + len, cy0 + ca1, cz0 + sa1); p3 = project(cx + len, cy0 + ca0, cz0 + sa0);
      } else {
        p0 = project(cx + ca0, cy0 + sa0, cz0); p1 = project(cx + ca1, cy0 + sa1, cz0);
        p2 = project(cx + ca1, cy0 + sa1, cz0 + len); p3 = project(cx + ca0, cy0 + sa0, cz0 + len);
      }
      const am = 0.5 * (a0 + a1);
      faces.push({
        depth: (p0.z + p1.z + p2.z + p3.z) * 0.25,
        pts: [p0, p1, p2, p3],
        fill: shadeRgb(baseRgb, Math.cos(am), Math.sin(am), 0, alpha),
        stroke: strokeCol
      });
    }
  };

  const pushElbow90Faces = (cx, cy, zStart, r, R_in, dirX, baseRgb, strokeCol, alpha) => {
    const R = Math.max(r * 1.15, R_in);
    const xc = cx + dirX * R;
    const zc = zStart;
    const arcSegs = 6;
    const radSegs = 12;
    const ringPt = (th, a) => {
      const rx = -dirX * Math.cos(th);
      const rz = -Math.sin(th);
      const ca = Math.cos(a) * r;
      const sa = Math.sin(a) * r;
      return project(xc + (R + ca) * rx, cy + sa, zc + (R + ca) * rz);
    };
    for (let j = 0; j < arcSegs; j++) {
      const th0 = (j / arcSegs) * (Math.PI * 0.5);
      const th1 = ((j + 1) / arcSegs) * (Math.PI * 0.5);
      const thm = 0.5 * (th0 + th1);
      for (let i = 0; i < radSegs; i++) {
        const a0 = (i / radSegs) * Math.PI * 2;
        const a1 = ((i + 1) / radSegs) * Math.PI * 2;
        const am = 0.5 * (a0 + a1);
        const p0 = ringPt(th0, a0), p1 = ringPt(th0, a1);
        const p2 = ringPt(th1, a1), p3 = ringPt(th1, a0);
        const nx = -dirX * Math.cos(thm) * Math.cos(am);
        const ny = Math.sin(am);
        const nz = -Math.sin(thm) * Math.cos(am);
        faces.push({
          depth: (p0.z + p1.z + p2.z + p3.z) * 0.25,
          pts: [p0, p1, p2, p3],
          fill: shadeRgb(baseRgb, nx, ny, nz, alpha),
          stroke: strokeCol
        });
      }
    }
  };

  const pushPrismFaces = (quadXY, z0, z1, baseRgb, strokeCol, alpha) => {
    const pB = quadXY.map(([x, y]) => project(x, y, z0));
    const pF = quadXY.map(([x, y]) => project(x, y, z1));
    const pushQ = (pts, nx, ny, nz) => {
      const avgZ = (pts[0].z + pts[1].z + pts[2].z + pts[3].z) * 0.25;
      faces.push({ depth: avgZ, pts, fill: shadeRgb(baseRgb, nx, ny, nz, alpha), stroke: strokeCol });
    };
    pushQ([pB[0], pB[1], pB[2], pB[3]], 0, 0, -1);
    pushQ([pF[0], pF[3], pF[2], pF[1]], 0, 0, 1);
    for (let i = 0; i < 4; i++) {
      const j = (i + 1) % 4;
      const dx = quadXY[j][0] - quadXY[i][0];
      const dy = quadXY[j][1] - quadXY[i][1];
      const len = Math.max(1e-6, Math.hypot(dx, dy));
      pushQ([pB[i], pB[j], pF[j], pF[i]], dy / len, -dx / len, 0);
    }
  };

  let frontOz = D - t, frontDz = t;
  (geom.parts || []).forEach(p => {
    const [rgb, scCol] = partColors(p);
    const alpha = xray ? (p.kind === 'mdf' ? 0.34 : 0.78) : 0.96;
    const ex = p.explodeDir[0] * p.explodeDist * er;
    const ey = p.explodeDir[1] * p.explodeDist * er;
    const ez = p.explodeDir[2] * p.explodeDist * er;
    const oxP = p.origin[0] + ex, oyP = p.origin[1] + ey, ozP = p.origin[2] + ez;

    if (p.kind === 'port' && p.area <= 0) {
      const pAlpha = xray ? 0.65 : 0.95;
      const portOff3d = Number((pack.acoustics && pack.acoustics.portOffsetMm) || 0);
      if (p.bpTopRound) {
        const r = p.size[0] / 2;
        const isRear = (p.id === 'P_PORT_REAR');
        const holes = (geom.cutouts || []).filter(c => c.kind === 'port' && c.shape === 'round' && c.partId === 'P_TOP' && ((/Traseir/.test(c.label || '')) === isRear));
        const list = holes.length ? holes : (isRear ? [] : (geom.cutouts || []).filter(c => c.kind === 'port' && c.shape === 'round' && c.partId === 'P_TOP'));
        list.forEach(ch => {
          const lv = ch.lvMm || p.size[1];
          const cz = (isTrap3d ? zRt3d : t) + ch.yInt + ez;
          pushCylinderFaces(t + ch.xInt + ex, Math.max(t, E + portOff3d - lv) + ey, cz, r, lv, '-Y', [251, 146, 60], '#fdba74', pAlpha);
        });
      } else if (p.id === 'P_PORT_SERIES') {
        const r = p.size[1] / 2;
        const serHoles = (geom.cutouts || []).filter(c => c.partId && c.partId.startsWith('P_BP_DIVIDER') && c.kind === 'port');
        if (serHoles.length) {
          serHoles.forEach(ch => {
            const cz = (isTrap3d ? zRt3d : t) + ch.xInt + ez;
            const cy = t + ch.yInt + ey;
            const lv = Math.min(p.size[0], ch.lvMm || p.size[0]);
            pushCylinderFaces(oxP, cy, cz, r, lv, '-X', [251, 146, 60], '#fdba74', pAlpha);
          });
        } else {
          pushCylinderFaces(oxP, oyP + r, ozP + r, r, p.size[0], '-X', [251, 146, 60], '#fdba74', pAlpha);
        }
      } else {
        const r = p.size[0] / 2;
        const routing3d = (pack.acoustics && pack.acoustics.portRouting) || 'straight';
        const rp3d = (pack.acoustics && pack.acoustics.portRoutePlan) || null;
        const holes = (geom.cutouts || []).filter(c => c.kind === 'port' && c.shape === 'round' && c.partId === 'P_FRONT_BAFFLE');
        if (routing3d === 'side_firing' || p.sideFiring) {
          const rSide = (p.sideFiring ? p.size[1] : p.size[0]) / 2;
          const lv = p.sideFiring ? p.size[0] : p.size[2];
          const sideHoles = (geom.cutouts || []).filter(c => c.kind === 'port' && c.shape === 'round' && (c.partId === 'P_SIDES' || c.panel === 'lateral_dir'));
          const xStartSide = Math.max(t, F - t + portOff3d - lv);
          if (sideHoles.length) {
            sideHoles.forEach(sh => {
              pushCylinderFaces(xStartSide + ex, t + sh.yInt + ey, t + sh.xInt + ez, rSide, lv, '-X', [251, 146, 60], '#fdba74', pAlpha);
            });
          } else {
            const nCyl = Math.max(1, p.qty || 1);
            const zCenterSide = t + (D - 2 * t) * 0.5;
            for (let ci = 0; ci < nCyl; ci++) {
              const cySide = t + ((ci + 1) / (nCyl + 1)) * (E - 2 * t);
              pushCylinderFaces(xStartSide + ex, cySide + ey, zCenterSide + ez, rSide, lv, '-X', [251, 146, 60], '#fdba74', pAlpha);
            }
          }
        } else if (routing3d === 'l_bend' && rp3d && rp3d.l2Mm >= 10 && holes.length) {
          const l1 = Math.max(40, rp3d.l1Mm);
          const l2 = Math.max(10, rp3d.l2Mm);
          const rElb = Math.max(r * 1.15, Number(rp3d.rElbow) || r * 1.6);
          const zBack = Math.max(t + rElb + r, D + portOff3d - l1);
          holes.forEach(ch => {
            const cx = t + ch.xInt + ex;
            const cy = t + ch.yInt + ey;
            const dirX = (cx <= F / 2) ? 1 : -1;
            // 1. Trecho 1 (frontal ao longo de +Z)
            pushCylinderFaces(cx, cy, zBack + ez, r, l1, '+Z', [251, 146, 60], '#fdba74', pAlpha);
            // 2. Joelho 90° toroidal contínuo (conecta Trecho 1 ao Trecho 2)
            pushElbow90Faces(cx, cy, zBack + ez, r, rElb, dirX, [234, 88, 12], '#fed7aa', pAlpha);
            // 3. Trecho 2 (dobrado 90° paralelo ao painel traseiro ao longo do eixo X)
            const xStartL2 = (dirX > 0) ? (cx + rElb) : (cx - rElb - l2);
            pushCylinderFaces(xStartL2, cy, zBack - rElb + ez, r, l2, '-X', [245, 158, 11], '#fde68a', pAlpha);
          });
        } else if (holes.length) {
          holes.forEach(ch => {
            const lv = ch.lvMm || p.size[2];
            pushCylinderFaces(t + ch.xInt + ex, t + ch.yInt + ey, Math.max(t, D + portOff3d - lv) + ez, r, lv, '+Z', [251, 146, 60], '#fdba74', pAlpha);
          });
        } else {
          pushCylinderFaces(oxP + r, oyP + r, ozP, r, p.size[2], '+Z', [251, 146, 60], '#fdba74', pAlpha);
        }
      }
      return;
    }

    if (p.id === 'P_FRONT_BAFFLE') {
      frontOz = ozP; frontDz = p.size[2];
      if (p.frontSplit) {
        pushBoxFaces(p.frontSplit.xLeft + ex, oyP, ozP, p.size[0], p.size[1], p.size[2], rgb, scCol, alpha, p.id);
        pushBoxFaces(p.frontSplit.xRight + ex, oyP, ozP, p.size[0], p.size[1], p.size[2], rgb, scCol, alpha, p.id);
      } else {
        pushBoxFaces(oxP, oyP, ozP, p.size[0], p.size[1], p.size[2], rgb, scCol, alpha, p.id);
      }
    } else if (p.id === 'P_TOP' && p.topSplit) {
      pushBoxFaces(p.topSplit.xLeft + ex, oyP, ozP, p.size[0], p.size[1], p.size[2], rgb, scCol, alpha, p.id);
      pushBoxFaces(p.topSplit.xRight + ex, oyP, ozP, p.size[0], p.size[1], p.size[2], rgb, scCol, alpha, p.id);
    } else if (p.id === 'P_SIDES') {
      const dyL = p.leftTopExtend ? (p.size[1] + t) : p.size[1];
      const dyR = p.rightTopExtend ? (p.size[1] + t) : p.size[1];
      if (isTrap3d) {
        pushTrapSideFaces(oxP, oyP, ozP + p.size[2], dyL, p.size[0], rgb, scCol, alpha);
        pushTrapSideFaces(F - t + p.explodeDist * er, oyP, ozP + p.size[2], dyR, p.size[0], rgb, scCol, alpha);
      } else {
        pushBoxFaces(F - t + p.explodeDist * er, oyP, ozP, p.size[0], dyR, p.size[2], rgb, scCol, alpha, p.id);
        pushBoxFaces(oxP, oyP, ozP, p.size[0], dyL, p.size[2], rgb, scCol, alpha, p.id);
      }
    } else if (p.id === 'P_REAR' && isTrap3d) {
      const pts = [
        project(0, t, zRb3d - t + ez), project(F, t, zRb3d - t + ez), project(F, t, zRb3d + ez), project(0, t, zRb3d + ez),
        project(0, t + env.B, zRt3d - t + ez), project(F, t + env.B, zRt3d - t + ez), project(F, t + env.B, zRt3d + ez), project(0, t + env.B, zRt3d + ez)
      ];
      [[0,1,5,4],[3,2,6,7],[0,3,7,4],[1,5,6,2]].forEach(idxs => {
        const avgZ = (pts[idxs[0]].z + pts[idxs[1]].z + pts[idxs[2]].z + pts[idxs[3]].z) * 0.25;
        faces.push({ depth: avgZ, pts: idxs.map(i => pts[i]), fill: shadeRgb(rgb, 0, 0, -1, alpha), stroke: scCol });
      });
    } else if (p.triMeta) {
      if (!xray && er < 0.02) return;
      const tm = p.triMeta;
      const ta = Math.max(10, tm.triA || 140);
      const tb = Math.max(10, tm.triB || 140);
      const lv = Math.max(10, tm.lvMm || p.size[2]);
      const wT = p.thickness || t;
      const portOffTri = Number((pack.acoustics && pack.acoustics.portOffsetMm) || 0);
      const z1 = D + portOffTri + ez;
      const z0 = Math.max(t, D + portOffTri - lv) + ez;
      const clampX = x => Math.max(t, Math.min(t + env.A, x));
      const clampY = y => Math.max(t, Math.min(t + env.B, y));
      const allCorners = [
        [[t, t + tb], [t + ta, t], [tb, ta]],
        [[t + env.A - ta, t], [t + env.A, t + tb], [-tb, ta]],
        [[t, t + env.B - tb], [t + ta, t + env.B], [tb, -ta]],
        [[t + env.A - ta, t + env.B], [t + env.A, t + env.B - tb], [-tb, -ta]]
      ];
      const cIdxs = (tm.corners && tm.corners.length) ? tm.corners : Array.from({ length: tm.count || 2 }, (_, k) => k % 4);
      cIdxs.forEach(cidx => {
        const [pt1, pt2, norm] = allCorners[Math.abs(parseInt(cidx) || 0) % 4];
        const nlen = Math.max(1e-6, Math.hypot(norm[0], norm[1]));
        const ux = (norm[0] / nlen) * wT;
        const uy = (norm[1] / nlen) * wT;
        const quadXY = [
          [pt1[0] + ex, pt1[1] + ey],
          [pt2[0] + ex, pt2[1] + ey],
          [clampX(pt2[0] + ux) + ex, clampY(pt2[1] + uy) + ey],
          [clampX(pt1[0] + ux) + ex, clampY(pt1[1] + uy) + ey]
        ];
        pushPrismFaces(quadXY, z0, z1, rgb, scCol, xray ? 0.72 : 0.96);
      });
    } else if (p.id === 'P_PLANAR_CHAMFER' && ac.planarGeom && ac.planarGeom.Z_leg) {
      const zlBase = ac.planarGeom.Z_leg;
      const wT = p.thickness || t;
      const z0 = ozP;
      const z1 = Math.max(z0 + 10, D + ez);
      const bays = p.dualPlanarTri
        ? [[t, (env.A - t) / 2], [t + (env.A - t) / 2 + t, (env.A - t) / 2]]
        : [[t, env.A]];
      bays.forEach(([oxB, bayW]) => {
        const zl = p.dualPlanarTri ? Math.min(zlBase, bayW * 0.28) : zlBase;
        const clampX = x => Math.max(oxB, Math.min(oxB + bayW, x));
        const clampY = y => Math.max(t, Math.min(t + env.B, y));
        const cList = [
          [[oxB, t + zl], [oxB + zl, t], [1, 1]],
          [[oxB + bayW - zl, t], [oxB + bayW, t + zl], [-1, 1]],
          [[oxB, t + env.B - zl], [oxB + zl, t + env.B], [1, -1]],
          [[oxB + bayW - zl, t + env.B], [oxB + bayW, t + env.B - zl], [-1, -1]]
        ];
        cList.forEach(([pt1, pt2, norm]) => {
          const inv = wT / Math.SQRT2;
          const ux = norm[0] * inv, uy = norm[1] * inv;
          const quadXY = [
            [pt1[0] + ex, pt1[1] + ey],
            [pt2[0] + ex, pt2[1] + ey],
            [clampX(pt2[0] - ux) + ex, clampY(pt2[1] - uy) + ey],
            [clampX(pt1[0] - ux) + ex, clampY(pt1[1] - uy) + ey]
          ];
          pushPrismFaces(quadXY, z0, z1, rgb, scCol, xray ? 0.78 : 0.96);
        });
      });
    } else if (p.sharedCenterSlot) {
      pushBoxFaces(p.sharedCenterSlot.xLeft + ex, oyP, ozP, p.size[0], p.size[1], p.size[2], rgb, scCol, alpha, p.id);
      pushBoxFaces(p.sharedCenterSlot.xRight + ex, oyP, ozP, p.size[0], p.size[1], p.size[2], rgb, scCol, alpha, p.id);
    } else if (p.splitByCenterDiv) {
      pushBoxFaces(p.splitByCenterDiv.xLeft + ex, oyP, ozP, p.size[0], p.size[1], p.size[2], rgb, scCol, alpha, p.id);
      pushBoxFaces(p.splitByCenterDiv.xRight + ex, oyP, ozP, p.size[0], p.size[1], p.size[2], rgb, scCol, alpha, p.id);
    } else if (p.id === 'P_MATRIX_V' && p.matrixMeta) {
      const cm = Math.max(2, p.matrixMeta.cols || 2);
      for (let k = 1; k < cm; k++) {
        pushBoxFaces(t + k * (env.A / cm) - t / 2 + ex, oyP, ozP, p.size[0], p.size[1], p.size[2], rgb, scCol, alpha, p.id);
      }
    } else if (p.id === 'P_MATRIX_H' && p.matrixMeta) {
      const rm = Math.max(2, p.matrixMeta.rows || 2);
      for (let j = 1; j < rm; j++) {
        pushBoxFaces(oxP, t + j * (env.B / rm) - t / 2 + ey, ozP, p.size[0], p.size[1], p.size[2], rgb, scCol, alpha, p.id);
      }
    } else if (p.kind === 'batten' && !p.braceMeta && p.qty > 1) {
      const q = Math.max(1, parseInt(p.qty) || 1);
      for (let i = 0; i < q; i++) {
        const bx = t + ((i + 1) / (q + 1)) * env.A - p.size[0] / 2 + ex;
        pushBoxFaces(bx, t + ey, t + ez, p.size[0], Math.min(p.size[1], env.B), t, rgb, scCol, alpha, p.id);
      }
    } else if ((p.id.startsWith('P_BP_DIVIDER') || p.id === 'P_CENTER_DIV') && isTrap3d) {
      pushTrapSideFaces(oxP, oyP, ozP + p.size[2], p.size[1], p.size[0], rgb, scCol, alpha, p.id);
    } else {
      pushBoxFaces(oxP, oyP, ozP, p.size[0], p.size[1], p.size[2], rgb, scCol, alpha, p.id);
    }
  });

  // Painter's Algorithm: desenha do fundo para a frente com furos vazados reais (evenodd)
  faces.sort((a, b) => a.depth - b.depth);
  const getFaceCutoutLoops = fc => {
    const loops = [];
    if (!fc.cutoutFace) return loops;
    const inSpan = x => !Number.isFinite(fc.xMin) || (x >= fc.xMin - 2 && x <= fc.xMax + 2);
    if (fc.cutoutFace === 'front') {
      const zPlane = fc.cutoutCoord;
      (geom.cutouts || []).filter(c => c.partId === 'P_FRONT_BAFFLE' && c.shape === 'round').forEach(c => {
        const cx = t + c.xInt;
        if (!inSpan(cx)) return;
        const pts = [];
        for (let i = 0; i < 32; i++) {
          const ang = (i / 32) * Math.PI * 2;
          pts.push(project(cx + Math.cos(ang) * (c.dia / 2), t + c.yInt + Math.sin(ang) * (c.dia / 2), zPlane));
        }
        loops.push({ pts, stroke: c.kind === 'driver' ? '#f87171' : '#fb923c' });
      });
      (geom.cutouts || []).filter(c => c.partId === 'P_FRONT_BAFFLE' && c.shape === 'triangle' && c.triA && c.triB).forEach(c => {
        const ta = c.triA, tb = c.triB;
        const ci = Math.abs(parseInt(c.cornerIdx) || 0) % 4;
        const triPts = ci === 0
          ? [[t, t], [t + ta, t], [t, t + tb]]
          : ci === 1
            ? [[t + env.A, t], [t + env.A - ta, t], [t + env.A, t + tb]]
            : ci === 2
              ? [[t, t + env.B], [t + ta, t + env.B], [t, t + env.B - tb]]
              : [[t + env.A, t + env.B], [t + env.A - ta, t + env.B], [t + env.A, t + env.B - tb]];
        const cx = (triPts[0][0] + triPts[1][0] + triPts[2][0]) / 3;
        if (!inSpan(cx)) return;
        loops.push({ pts: triPts.map(([px, py]) => project(px, py, zPlane)), stroke: '#fb923c' });
      });
      if (ac.planarGeom && ac.planarGeom.style === 'triangle' && ac.planarGeom.Z_leg) {
        const bx0 = Number.isFinite(fc.xMin) ? fc.xMin : t;
        const bx1 = Number.isFinite(fc.xMax) ? fc.xMax : (t + env.A);
        const zl = Math.min(ac.planarGeom.Z_leg, (bx1 - bx0) * 0.35);
        [
          [[bx0, t], [bx0 + zl, t], [bx0, t + zl]],
          [[bx1, t], [bx1 - zl, t], [bx1, t + zl]],
          [[bx0, t + env.B], [bx0 + zl, t + env.B], [bx0, t + env.B - zl]],
          [[bx1, t + env.B], [bx1 - zl, t + env.B], [bx1, t + env.B - zl]]
        ].forEach(tp => loops.push({ pts: tp.map(([px, py]) => project(px, py, zPlane)), stroke: '#c4b5fd' }));
      }
    } else if (fc.cutoutFace === 'divider') {
      const host = (geom.parts || []).find(pp => pp.id === fc.partId);
      if (!host) return loops;
      const hyOff = host.explodeDir[1] * host.explodeDist * er;
      const hzOff = host.explodeDir[2] * host.explodeDist * er;
      const xPlane = fc.cutoutCoord;
      (geom.cutouts || []).filter(c => c.partId === fc.partId && c.dia).forEach(c => {
        const cz = (isTrap3d ? zRt3d : t) + c.xInt + hzOff;
        const cy = t + c.yInt + hyOff;
        const pts = [];
        for (let i = 0; i < 32; i++) {
          const ang = (i / 32) * Math.PI * 2;
          pts.push(project(xPlane, cy + Math.sin(ang) * (c.dia / 2), cz + Math.cos(ang) * (c.dia / 2)));
        }
        loops.push({ pts, stroke: c.kind === 'driver' ? '#f87171' : '#fb923c' });
      });
    } else if (fc.cutoutFace === 'top') {
      const topPart = (geom.parts || []).find(pp => pp.id === 'P_TOP');
      if (!topPart) return loops;
      const txOff = topPart.explodeDir[0] * topPart.explodeDist * er;
      const tzOff = topPart.explodeDir[2] * topPart.explodeDist * er;
      const yPlane = fc.cutoutCoord;
      (geom.cutouts || []).filter(c => c.partId === 'P_TOP' && c.shape === 'round' && c.dia).forEach(c => {
        const cx = t + c.xInt + txOff;
        if (!inSpan(cx)) return;
        const cz = (isTrap3d ? zRt3d : t) + c.yInt + tzOff;
        const pts = [];
        for (let i = 0; i < 32; i++) {
          const ang = (i / 32) * Math.PI * 2;
          pts.push(project(cx + Math.cos(ang) * (c.dia / 2), yPlane, cz + Math.sin(ang) * (c.dia / 2)));
        }
        loops.push({ pts, stroke: '#fb923c' });
      });
    }
    return loops;
  };

  faces.forEach(fc => {
    const holeLoops = getFaceCutoutLoops(fc);
    ctx.beginPath();
    ctx.moveTo(fc.pts[0].x, fc.pts[0].y);
    for (let i = 1; i < fc.pts.length; i++) ctx.lineTo(fc.pts[i].x, fc.pts[i].y);
    ctx.closePath();
    if (holeLoops.length) {
      holeLoops.forEach(lp => {
        ctx.moveTo(lp.pts[0].x, lp.pts[0].y);
        for (let i = 1; i < lp.pts.length; i++) ctx.lineTo(lp.pts[i].x, lp.pts[i].y);
        ctx.closePath();
      });
      ctx.fillStyle = fc.fill;
      ctx.fill('evenodd');
      // Borda externa da chapa
      ctx.beginPath();
      ctx.moveTo(fc.pts[0].x, fc.pts[0].y);
      for (let i = 1; i < fc.pts.length; i++) ctx.lineTo(fc.pts[i].x, fc.pts[i].y);
      ctx.closePath();
      ctx.strokeStyle = fc.stroke;
      ctx.lineWidth = 0.9;
      ctx.stroke();
      // Contorno de cada furo vazado
      holeLoops.forEach(lp => {
        ctx.beginPath();
        ctx.moveTo(lp.pts[0].x, lp.pts[0].y);
        for (let i = 1; i < lp.pts.length; i++) ctx.lineTo(lp.pts[i].x, lp.pts[i].y);
        ctx.closePath();
        ctx.strokeStyle = lp.stroke;
        ctx.lineWidth = 1.5;
        ctx.stroke();
      });
    } else {
      ctx.fillStyle = fc.fill;
      ctx.fill();
      ctx.strokeStyle = fc.stroke;
      ctx.lineWidth = 0.9;
      ctx.stroke();
    }
  });

  const gPassCount = (geom.validation || []).filter(v => v.pass).length;
  ctx.fillStyle = '#e2e8f0';
  ctx.font = 'bold 11px var(--font)';
  ctx.fillText(`3D INTERATIVO (${Math.round(er * 100)}% EXPLOSÃO${xray ? ' · RAIO-X' : ''}) — ${ac.boxType.toUpperCase()} · PGS ${gPassCount}/${geom.validation.length}`, 14, 18);
  ctx.fillStyle = '#94a3b8';
  ctx.font = '10px var(--font)';
  ctx.fillText('🖱️ Arraste para girar 360° · Scroll = Zoom · Duplo-clique = Reset', 14, 33);
  ctx.fillStyle = '#38bdf8';
  ctx.font = '10px var(--mono)';
  const bpTxt = (ac.bpChambers && ac.bpChambers.isBp) ? ` | VR(A)=${ac.bpChambers.A_rear.toFixed(0)} · VF(G)=${ac.bpChambers.A_front.toFixed(0)}mm` : '';
  ctx.fillText(`F=${F.toFixed(0)} · E=${E.toFixed(0)} · A=${env.A.toFixed(0)} · B=${env.B.toFixed(0)} · C=${env.C.toFixed(0)}/${env.D.toFixed(0)} mm · MDF ${t}mm${bpTxt}`, 14, h - 10);
}

/** Desenha o Nesting 2D real das peças na chapa MDF 2750×1830 mm. */
function drawWoodlockNesting2D(pack, targetCanvas) {
  const cv = targetCanvas || document.getElementById('woodlockCanvas');
  if (!cv || !pack) return;
  const geom = pack.geometry || buildPgsGeometryModel(pack);
  const nest = geom.manufacturing.sheetLayout;
  const ctx = cv.getContext('2d');
  const dpr = targetCanvas ? 1 : (window.devicePixelRatio || 1);
  const w = targetCanvas ? (targetCanvas.width || 920) : (cv.clientWidth || 500);
  const h = targetCanvas ? (targetCanvas.height || 360) : (cv.clientHeight || 290);
  if (!targetCanvas) {
    cv.width = w * dpr;
    cv.height = h * dpr;
    ctx.scale(dpr, dpr);
  }
  ctx.fillStyle = '#060911';
  ctx.fillRect(0, 0, w, h);

  ctx.fillStyle = '#e2e8f0';
  ctx.font = 'bold 11px var(--font)';
  ctx.fillText(`CHAPA MDF ${nest.sheetW}×${nest.sheetH} mm (Kerf ${nest.kerfMm}mm) — ${nest.sheetsCount} chapa(s) · Aproveitamento: ${nest.utilizationPct}%`, 12, 17);

  const pad = 16;
  const sc = Math.min((w - 2 * pad) / nest.sheetW, (h - 40) / nest.sheetH);
  const swPx = nest.sheetW * sc;
  const shPx = nest.sheetH * sc;
  const x0 = (w - swPx) / 2;
  const y0 = 26;

  ctx.fillStyle = 'rgba(30, 41, 59, 0.55)';
  ctx.strokeStyle = '#64748b';
  ctx.lineWidth = 1.4;
  ctx.fillRect(x0, y0, swPx, shPx);
  ctx.strokeRect(x0, y0, swPx, shPx);

  (nest.placements || []).filter(pl => pl.sheetIdx === 0).forEach(pl => {
    const rx = x0 + pl.x * sc;
    const ry = y0 + pl.y * sc;
    const rw = pl.w * sc;
    const rh = pl.h * sc;
    const stroke = pl.kind === 'port' ? '#fb923c' : (pl.kind === 'divider' ? '#c4b5fd' : (pl.kind === 'batten' ? '#a78bfa' : '#38bdf8'));
    const fill = pl.kind === 'port' ? 'rgba(249,115,22,0.25)' : (pl.kind === 'divider' ? 'rgba(139,92,246,0.28)' : 'rgba(56,189,248,0.18)');
    ctx.fillStyle = fill;
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1.2;
    ctx.fillRect(rx, ry, rw, rh);
    ctx.strokeRect(rx, ry, rw, rh);
    if (rw > 34 && rh > 16) {
      ctx.fillStyle = '#f8fafc';
      ctx.font = '8.5px var(--mono)';
      ctx.fillText(`${pl.w.toFixed(0)}×${pl.h.toFixed(0)}`, rx + 3, ry + 11);
    }
  });
}

/**
 * Desenha Planificação de Peças 2D (Cut-Plan) com quantidades (1x/2x/4x) e cotas reais.
 */
function drawWoodlockCutPlan2D(pack, targetCanvas) {
  const cv = targetCanvas || document.getElementById('woodlockCanvas');
  if (!cv || !pack) return;
  const ctx = cv.getContext('2d');
  const dpr = targetCanvas ? 1 : (window.devicePixelRatio || 1);
  const w = targetCanvas ? (targetCanvas.width || 920) : (cv.clientWidth || 500);
  const h = targetCanvas ? (targetCanvas.height || 360) : (cv.clientHeight || 290);
  if (!targetCanvas) {
    cv.width = w * dpr;
    cv.height = h * dpr;
    ctx.scale(dpr, dpr);
  }
  ctx.fillStyle = '#060911';
  ctx.fillRect(0, 0, w, h);

  const items = (pack.pieces || []).filter(p => p.w > 0 && p.h > 0);
  const cols = Math.min(4, Math.max(2, Math.ceil(items.length / 2)));
  const rows = Math.max(1, Math.ceil(items.length / cols));
  const cellW = (w - 24) / cols;
  const cellH = (h - 36) / rows;
  const maxDim = Math.max(1, ...items.map(p => Math.max(p.w, p.h)));

  ctx.fillStyle = '#e2e8f0';
  ctx.font = 'bold 11px var(--font)';
  ctx.fillText(`PLANIFICAÇÃO DE PEÇAS (${items.length} tipos · MDF ${pack.dimensions.t} mm)`, 12, 17);

  items.forEach((p, idx) => {
    const col = idx % cols;
    const row = Math.floor(idx / cols);
    const x0 = 12 + col * cellW;
    const y0 = 26 + row * cellH;
    const maxW = cellW - 22;
    const maxH = cellH - 36;
    const sc = Math.min(maxW / maxDim, maxH / maxDim) * 1.15;
    const rw = Math.max(22, Math.min(maxW, p.w * sc));
    const rh = Math.max(16, Math.min(maxH, p.h * sc));
    const rx = x0 + (cellW - rw) / 2;
    const ry = y0 + (cellH - 22 - rh) / 2;

    const stroke = p.kind === 'port' ? '#fb923c' : (p.kind === 'divider' ? '#c4b5fd' : (p.kind === 'batten' ? '#a78bfa' : '#38bdf8'));
    const fill = p.kind === 'port' ? 'rgba(249,115,22,0.18)' : (p.kind === 'divider' ? 'rgba(139,92,246,0.22)' : 'rgba(56,189,248,0.12)');
    ctx.fillStyle = fill;
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1.4;
    ctx.fillRect(rx, ry, rw, rh);
    ctx.strokeRect(rx, ry, rw, rh);

    // Quantidade + etiqueta curta
    ctx.fillStyle = '#fbbf24';
    ctx.font = 'bold 10px var(--mono)';
    ctx.fillText(`${p.qty}x`, rx + 4, ry + 12);

    ctx.fillStyle = '#e2e8f0';
    ctx.font = '9.5px var(--font)';
    const shortName = p.name.replace(/\s*\[.*?\]/g, '').slice(0, 22);
    ctx.fillText(shortName, x0 + 6, y0 + cellH - 14);
    ctx.fillStyle = '#94a3b8';
    ctx.font = '9px var(--mono)';
    ctx.fillText(`${p.w.toFixed(0)}×${p.h.toFixed(0)} mm`, x0 + 6, y0 + cellH - 4);
  });
}

function drawWoodlockBlueprint(g, targetCanvas) {
  const cv = targetCanvas || document.getElementById('woodlockCanvas');
  if (!cv) return;
  const ctx = cv.getContext('2d');
  const dpr = targetCanvas ? 1 : (window.devicePixelRatio || 1);
  const w = targetCanvas ? (targetCanvas.width || 920) : (cv.clientWidth || 460);
  const h = targetCanvas ? (targetCanvas.height || 360) : (cv.clientHeight || 290);
  if (!targetCanvas) {
    cv.width = w * dpr;
    cv.height = h * dpr;
    ctx.scale(dpr, dpr);
  }

  ctx.fillStyle = '#060911';
  ctx.fillRect(0, 0, w, h);

  // Vista 1: Corte Lateral (Esquerda) - Cotas B, C, D, E + Duto Lv vs C
  const pad = 28;
  const halfW = w * 0.44;
  const maxDimSide = Math.max(g.D_bot + 2*g.t, g.E_ext, 100);
  const scaleSide = Math.min((halfW - 2*pad) / maxDimSide, (h - 2*pad - 24) / maxDimSide);

  const sideX0 = pad + 10;
  const sideY0 = pad + 14;
  const wTopPx = (g.C_top + 2*g.t) * scaleSide;
  const wBotPx = (g.D_bot + 2*g.t) * scaleSide;
  const hExtPx = g.E_ext * scaleSide;
  const tSidePx = Math.max(2, g.t * scaleSide);

  ctx.strokeStyle = '#38bdf8';
  ctx.lineWidth = 2;
  ctx.fillStyle = 'rgba(56, 189, 248, 0.08)';
  ctx.beginPath();
  ctx.moveTo(sideX0, sideY0);
  ctx.lineTo(sideX0 + wTopPx, sideY0);
  ctx.lineTo(sideX0 + wBotPx, sideY0 + hExtPx);
  ctx.lineTo(sideX0, sideY0 + hExtPx);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Desenha duto real na vista lateral (Lv vs C na frente, ou Lv vs B no tampo em BP4/BP6)
  if (g.isVented && (g.lvMm > 0 || (g.bpChambers && g.bpChambers.lvRearMm > 0))) {
    const portColl = g.validation && g.validation.clearanceMm < 40;
    ctx.lineWidth = 1.6;
    if (g.bpChambers && g.bpChambers.isBp) {
      const hasVrTop = !!(g.bpChambers.isBp6Parallel && g.bpChambers.lvRearMm > 0);
      const pWpx = Math.max(12, Math.min(wTopPx * (hasVrTop ? 0.24 : 0.30), 90 * scaleSide));
      if (g.lvMm > 0) {
        const lvPx = Math.min(hExtPx - 2 * tSidePx, g.lvMm * scaleSide);
        const pX = hasVrTop ? (sideX0 + wTopPx * 0.62 - pWpx * 0.5) : (sideX0 + (wTopPx - pWpx) * 0.5);
        ctx.fillStyle = portColl ? 'rgba(239,68,68,0.35)' : 'rgba(249,115,22,0.28)';
        ctx.strokeStyle = portColl ? '#ef4444' : '#f97316';
        ctx.fillRect(pX, sideY0 + tSidePx, pWpx, lvPx);
        ctx.strokeRect(pX, sideY0 + tSidePx, pWpx, lvPx);
        ctx.fillStyle = portColl ? '#fca5a5' : '#fdba74';
        ctx.font = 'bold 9px var(--mono)';
        ctx.fillText(`VF=${g.lvMm.toFixed(0)}`, pX + 2, sideY0 + tSidePx + lvPx / 2 + 3);
      }
      if (hasVrTop) {
        const lvVrPx = Math.min(hExtPx - 2 * tSidePx, g.bpChambers.lvRearMm * scaleSide);
        const pXVr = sideX0 + wTopPx * 0.30 - pWpx * 0.5;
        ctx.fillStyle = portColl ? 'rgba(239,68,68,0.35)' : 'rgba(192,132,252,0.28)';
        ctx.strokeStyle = portColl ? '#ef4444' : '#c084fc';
        ctx.fillRect(pXVr, sideY0 + tSidePx, pWpx, lvVrPx);
        ctx.strokeRect(pXVr, sideY0 + tSidePx, pWpx, lvVrPx);
        ctx.fillStyle = portColl ? '#fca5a5' : '#e9d5ff';
        ctx.font = 'bold 9px var(--mono)';
        ctx.fillText(`VR=${g.bpChambers.lvRearMm.toFixed(0)}`, pXVr + 2, sideY0 + tSidePx + lvVrPx / 2 + 3);
      }
    } else if (g.lvMm > 0) {
      ctx.fillStyle = portColl ? 'rgba(239,68,68,0.35)' : 'rgba(249,115,22,0.28)';
      ctx.strokeStyle = portColl ? '#ef4444' : '#f97316';
      const lvPx = Math.min(wTopPx - tSidePx, g.lvMm * scaleSide);
      const pHpx = Math.max(12, Math.min(hExtPx * 0.28, 120 * scaleSide));
      const pY = sideY0 + hExtPx - tSidePx - pHpx - 6;
      ctx.fillRect(sideX0 + tSidePx, pY, lvPx, pHpx);
      ctx.strokeRect(sideX0 + tSidePx, pY, lvPx, pHpx);
      ctx.fillStyle = portColl ? '#fca5a5' : '#fdba74';
      ctx.font = 'bold 9.5px var(--mono)';
      ctx.fillText(`Lv=${g.lvMm.toFixed(0)}mm`, sideX0 + tSidePx + 4, pY + pHpx / 2 + 3);
    }
  }

  ctx.fillStyle = '#e5e7eb';
  ctx.font = 'bold 11px var(--font)';
  ctx.fillText((g.bpChambers && g.bpChambers.isBp) ? 'CORTE LATERAL (Lv vs B)' : 'CORTE LATERAL (Lv vs C)', sideX0, 18);
  ctx.fillStyle = '#38bdf8';
  ctx.font = '10px var(--mono)';
  ctx.fillText(`C=${g.C_top.toFixed(0)}mm`, sideX0 + 6, sideY0 + 14);
  if (g.isVented && g.validation) {
    ctx.fillStyle = g.validation.clearanceMm < 40 ? '#f87171' : '#4ade80';
    ctx.fillText(`Folga=${g.validation.clearanceMm.toFixed(0)}mm`, sideX0 + 6, sideY0 + 27);
  }
  ctx.fillStyle = '#38bdf8';
  ctx.fillText(`E=${g.E_ext.toFixed(0)}mm (B=${g.B.toFixed(0)})`, sideX0, sideY0 + hExtPx + 15);

  // Vista 2: Em BP4/BP6 exibe VISTA SUPERIOR (TAMPO A×C) com dutos reais; nas demais, VISTA FRONTAL (A×B)
  const isBpView = !!(g.bpChambers && g.bpChambers.isBp);
  const frontX0 = w * 0.49;
  const viewHExt = isBpView ? (g.C_top + 2 * g.t) : g.E_ext;
  const maxDimFront = Math.max(g.F_ext, viewHExt, 100);
  const scaleFront = Math.min((w - frontX0 - pad) / maxDimFront, (h - 2*pad - 24) / maxDimFront);
  const fPx = g.F_ext * scaleFront;
  const ePx = viewHExt * scaleFront;
  const tPx = Math.max(2, g.t * scaleFront);

  ctx.fillStyle = '#e5e7eb';
  ctx.font = 'bold 11px var(--font)';
  ctx.fillText(isBpView ? 'VISTA SUPERIOR — TAMPO (A×C / F×C_ext)' : 'VISTA FRONTAL — FURAÇÃO REAL (A×B / F×E)', frontX0, 18);

  // Contorno externo
  ctx.strokeStyle = '#38bdf8';
  ctx.lineWidth = 2;
  ctx.fillStyle = 'rgba(56, 189, 248, 0.06)';
  ctx.fillRect(frontX0, sideY0, fPx, ePx);
  ctx.strokeRect(frontX0, sideY0, fPx, ePx);

  // Contorno interno
  ctx.strokeStyle = '#64748b';
  ctx.lineWidth = 1;
  ctx.setLineDash([3, 3]);
  ctx.strokeRect(frontX0 + tPx, sideY0 + tPx, fPx - 2*tPx, ePx - 2*tPx);
  ctx.setLineDash([]);

  // Em BP4/BP6, desenha a(s) Divisória(s) Interna(s) separando VR e VF
  if (isBpView) {
    const divW = Math.max(2, g.t * scaleFront);
    ctx.fillStyle = 'rgba(167, 139, 250, 0.45)';
    ctx.strokeStyle = '#a78bfa';
    ctx.lineWidth = 1.5;
    if (g.bpChambers.dualDiv) {
      const div1X = frontX0 + tPx + g.bpChambers.A_rear_side * scaleFront;
      const div2X = frontX0 + tPx + (g.bpChambers.A_rear_side + g.t + g.bpChambers.A_front) * scaleFront;
      ctx.fillRect(div1X, sideY0 + tPx, divW, ePx - 2 * tPx);
      ctx.strokeRect(div1X, sideY0 + tPx, divW, ePx - 2 * tPx);
      ctx.fillRect(div2X, sideY0 + tPx, divW, ePx - 2 * tPx);
      ctx.strokeRect(div2X, sideY0 + tPx, divW, ePx - 2 * tPx);
      ctx.fillStyle = '#c4b5fd';
      ctx.font = 'bold 9px var(--mono)';
      ctx.fillText(`VR1`, frontX0 + tPx + 4, sideY0 + tPx + 12);
      ctx.fillText(`VF=${g.bpChambers.A_front.toFixed(0)}`, div1X + divW + 4, sideY0 + tPx + 12);
      ctx.fillText(`VR2`, div2X + divW + 4, sideY0 + tPx + 12);
    } else {
      const divX = frontX0 + tPx + g.bpChambers.A_rear * scaleFront;
      ctx.fillRect(divX, sideY0 + tPx, divW, ePx - 2 * tPx);
      ctx.strokeRect(divX, sideY0 + tPx, divW, ePx - 2 * tPx);
      ctx.fillStyle = '#c4b5fd';
      ctx.font = 'bold 9px var(--mono)';
      ctx.fillText(`VR: A=${g.bpChambers.A_rear.toFixed(0)}mm`, frontX0 + tPx + 4, sideY0 + tPx + 12);
      ctx.fillText(`VF: G=${g.bpChambers.A_front.toFixed(0)}mm`, divX + divW + 4, sideY0 + tPx + 12);
    }
  }

  // Desenha furos reais do painel ativo (tampo em BP4/BP6, frontal nas demais)
  const holes = (g.validation && g.validation.holes) ? g.validation.holes : [];
  const activeHoles = isBpView
    ? holes.filter(hl => hl.panel === 'topo')
    : holes.filter(hl => !hl.panel || hl.panel === 'frontal');
  activeHoles.forEach(hl => {
    const cx = frontX0 + tPx + hl.xInt * scaleFront;
    const cy = isBpView
      ? (sideY0 + tPx + hl.yInt * scaleFront)
      : (sideY0 + ePx - tPx - hl.yInt * scaleFront);
    const isErr = !!hl.collision;
    const isVrPort = /Traseir|\(VR\d?\)/.test(hl.label || '');
    if (hl.shape === 'round') {
      const rCut = (hl.dia / 2) * scaleFront;
      const rFlg = ((hl.flangeDia || hl.dia) / 2) * scaleFront;
      if (hl.kind === 'driver') {
        ctx.strokeStyle = isErr ? '#ef4444' : 'rgba(248, 113, 113, 0.55)';
        ctx.lineWidth = 1.2;
        ctx.setLineDash([4, 3]);
        ctx.beginPath();
        ctx.arc(cx, cy, rFlg, 0, 2 * Math.PI);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      ctx.fillStyle = isErr ? 'rgba(239, 68, 68, 0.25)' : (hl.kind === 'driver' ? 'rgba(15, 23, 42, 0.85)' : (isVrPort ? 'rgba(192, 132, 252, 0.24)' : 'rgba(249, 115, 22, 0.22)'));
      ctx.strokeStyle = isErr ? '#ef4444' : (hl.kind === 'driver' ? '#f87171' : (isVrPort ? '#c084fc' : '#f97316'));
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.arc(cx, cy, rCut, 0, 2 * Math.PI);
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = '#e2e8f0';
      ctx.lineWidth = 0.8;
      ctx.beginPath(); ctx.moveTo(cx - 4, cy); ctx.lineTo(cx + 4, cy); ctx.moveTo(cx, cy - 4); ctx.lineTo(cx, cy + 4); ctx.stroke();
    } else if (hl.shape === 'slot') {
      const sw = hl.w * scaleFront;
      const sh = hl.h * scaleFront;
      ctx.fillStyle = isErr ? 'rgba(239,68,68,0.3)' : (isVrPort ? 'rgba(192,132,252,0.28)' : 'rgba(249,115,22,0.28)');
      ctx.strokeStyle = isErr ? '#ef4444' : (isVrPort ? '#c084fc' : '#f97316');
      ctx.lineWidth = 1.6;
      const slotY = isBpView ? (sideY0 + tPx) : (cy - sh / 2);
      const slotHDraw = isBpView ? (ePx - 2 * tPx) : sh;
      ctx.fillRect(cx - sw / 2, slotY, sw, slotHDraw);
      ctx.strokeRect(cx - sw / 2, slotY, sw, slotHDraw);
    } else if (hl.shape === 'triangle') {
      const ta = hl.triA * scaleFront;
      const tb = hl.triB * scaleFront;
      const xL = frontX0 + tPx, xR = frontX0 + fPx - tPx;
      const yT = sideY0 + tPx, yB = sideY0 + ePx - tPx;
      ctx.fillStyle = 'rgba(249,115,22,0.28)';
      ctx.strokeStyle = '#f97316';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      if (hl.cornerIdx === 0) { ctx.moveTo(xL, yB); ctx.lineTo(xL + ta, yB); ctx.lineTo(xL, yB - tb); }
      else if (hl.cornerIdx === 1) { ctx.moveTo(xR, yB); ctx.lineTo(xR - ta, yB); ctx.lineTo(xR, yB - tb); }
      else if (hl.cornerIdx === 2) { ctx.moveTo(xL, yT); ctx.lineTo(xL + ta, yT); ctx.lineTo(xL, yT + tb); }
      else { ctx.moveTo(xR, yT); ctx.lineTo(xR - ta, yT); ctx.lineTo(xR, yT + tb); }
      ctx.closePath(); ctx.fill(); ctx.stroke();
    }
  });

  ctx.fillStyle = '#93c5fd';
  ctx.font = '10px var(--mono)';
  ctx.fillText(`F=${g.F_ext.toFixed(0)}mm (A=${g.A.toFixed(0)}mm) · MDF ${g.t}mm`, frontX0, sideY0 + ePx + 15);
}