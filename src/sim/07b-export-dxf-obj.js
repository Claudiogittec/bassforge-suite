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