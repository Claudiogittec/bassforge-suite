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
