r"""
BassForge SUITE — PGS (bassforge-pgs/v1) -> FreeCAD 1.1 B-Rep 3D Builder & Boolean Auditor
Executar via:
  "C:\Program Files\FreeCAD 1.1\bin\freecadcmd.exe" pgs_to_freecad.py <input_buildpack.json> <output_dir>
Variáveis de ambiente opcionais:
  BF_JSON, BF_OUT, BF_OUT_FCSTD, BF_OUT_STEP, BF_OUT_AUDIT, BF_EXPLODE (0.0 .. 1.0)
"""
import json
import math
import os
import sys
import FreeCAD
import Part


def pgs_to_cad_vec(px, py, pz):
    # PGS: X=largura, Y=altura, Z=profundidade -> CAD 3D: X=largura, Y=profundidade, Z=altura (caixa em pe em Z=0)
    return FreeCAD.Vector(float(px), float(pz), float(py))


def make_box_pgs(x0, y0, z0, dx, dy, dz):
    if dx <= 0.01 or dy <= 0.01 or dz <= 0.01:
        return None
    # Em CAD: dimX = dx, dimY = dz (profundidade), dimZ = dy (altura)
    return Part.makeBox(float(dx), float(dz), float(dy), pgs_to_cad_vec(x0, y0, z0))


def make_hollow_cylinder_pgs(cx, cy, z0, r_outer, r_inner, length, axis_vec=None):
    if r_outer <= 0.1 or length <= 0.1:
        return None
    base = pgs_to_cad_vec(cx, cy, z0)
    axis = axis_vec if axis_vec is not None else FreeCAD.Vector(0.0, 1.0, 0.0)
    outer = Part.makeCylinder(float(r_outer), float(length), base, axis)
    ri = max(0.5, min(float(r_outer) - 0.5, float(r_inner)))
    off = FreeCAD.Vector(-axis.x, -axis.y, -axis.z)
    inner = Part.makeCylinder(ri, float(length) + 2.0, base.add(off), axis)
    return outer.cut(inner)


def make_trapezoid_side(x0, y0, z_rear_bot, z_rear_top, z_front, B, t):
    pts = [
        pgs_to_cad_vec(x0, y0, z_rear_bot),
        pgs_to_cad_vec(x0, y0, z_front),
        pgs_to_cad_vec(x0, y0 + B, z_front),
        pgs_to_cad_vec(x0, y0 + B, z_rear_top),
    ]
    pts.append(pts[0])
    return Part.Face(Part.makePolygon(pts)).extrude(FreeCAD.Vector(float(t), 0.0, 0.0))


def make_trapezoid_rear(x0, y0, z_rear_bot, z_rear_top, F, B, t):
    pts = [
        pgs_to_cad_vec(x0, y0, z_rear_bot - t),
        pgs_to_cad_vec(x0, y0, z_rear_bot),
        pgs_to_cad_vec(x0, y0 + B, z_rear_top),
        pgs_to_cad_vec(x0, y0 + B, z_rear_top - t),
    ]
    pts.append(pts[0])
    return Part.Face(Part.makePolygon(pts)).extrude(FreeCAD.Vector(float(F), 0.0, 0.0))


def make_trapezoid_batten(x0, y0, z_rear_bot, z_rear_top, dx, B, t):
    pts = [
        pgs_to_cad_vec(x0, y0, z_rear_bot),
        pgs_to_cad_vec(x0, y0, z_rear_bot + t),
        pgs_to_cad_vec(x0, y0 + B, z_rear_top + t),
        pgs_to_cad_vec(x0, y0 + B, z_rear_top),
    ]
    pts.append(pts[0])
    return Part.Face(Part.makePolygon(pts)).extrude(FreeCAD.Vector(float(dx), 0.0, 0.0))


def make_window_brace(x0, y0, z_rear_bot, z_rear_top, z_front, B, t, is_trap, hole_dia):
    shape = make_trapezoid_side(x0, y0, z_rear_bot, z_rear_top, z_front, B, t) if is_trap else make_box_pgs(x0, y0, z_rear_bot, t, B, max(10.0, z_front - z_rear_bot))
    if not shape:
        return None
    r = max(12.0, min(float(hole_dia) / 2.0, B * 0.13, max(20.0, z_front - z_rear_top) * 0.18))
    def z_rear_at(frac_y):
        return z_rear_bot + frac_y * (z_rear_top - z_rear_bot)
    if is_trap:
        specs = [(0.78, [0.52]), (0.48, [0.32, 0.72]), (0.20, [0.30, 0.72])]
    else:
        specs = [(0.80, [0.30, 0.70]), (0.50, [0.30, 0.70]), (0.20, [0.30, 0.70])]
    for fy, z_fracs in specs:
        cy = y0 + fy * B
        zr = z_rear_at(fy)
        span = max(10.0, z_front - zr)
        for fz in z_fracs:
            cz = zr + fz * span
            if cz - r > zr + 10.0 and cz + r < z_front - 10.0:
                cyl = Part.makeCylinder(r, t + 4.0, pgs_to_cad_vec(x0 - 2.0, cy, cz), FreeCAD.Vector(1.0, 0.0, 0.0))
                shape = shape.cut(cyl)
    return shape


def make_br_triangle_port_walls(ox, oy, z_front_inner, A, B, lv, tri_a, tri_b, t, corner_indices):
    walls = []
    if lv <= 1.0 or tri_a <= 1.0 or tri_b <= 1.0:
        return walls
    z0 = max(t, z_front_inner - lv)
    z_len = max(1.0, z_front_inner - z0)
    inner_clip = make_box_pgs(ox, oy, z0, A, B, z_len)
    all_corners = [
        ((ox, oy + tri_b), (ox + tri_a, oy), (tri_b, tri_a)),
        ((ox + A - tri_a, oy), (ox + A, oy + tri_b), (-tri_b, tri_a)),
        ((ox, oy + B - tri_b), (ox + tri_a, oy + B), (tri_b, -tri_a)),
        ((ox + A - tri_a, oy + B), (ox + A, oy + B - tri_b), (-tri_b, -tri_a)),
    ]
    idxs = [int(c) % 4 for c in corner_indices] if corner_indices else [0, 1]
    for i, cidx in enumerate(idxs):
        (x1, y1), (x2, y2), (nx, ny) = all_corners[cidx]
        nlen = max(1e-6, math.hypot(nx, ny))
        ux, uy = (nx / nlen) * t, (ny / nlen) * t
        pts = [
            pgs_to_cad_vec(x1, y1, z0),
            pgs_to_cad_vec(x2, y2, z0),
            pgs_to_cad_vec(x2 + ux, y2 + uy, z0),
            pgs_to_cad_vec(x1 + ux, y1 + uy, z0),
        ]
        pts.append(pts[0])
        prism = Part.Face(Part.makePolygon(pts)).extrude(FreeCAD.Vector(0.0, float(z_len), 0.0))
        clipped = prism.common(inner_clip) if inner_clip else prism
        if clipped and clipped.Volume > 10.0:
            walls.append((f"P_PORT_TRI_{i + 1}", clipped))
    return walls


def make_planar_chamfer_walls(ox_box, oy_box, z0, A, B, z_len, zl, t):
    """Constroi as 4 paredes chanfradas a 45 deg na boca octogonal da Planar Triangulo (0 colisoes)."""
    walls = []
    if zl <= 1.0 or z_len <= 1.0:
        return walls
    inner_clip = make_box_pgs(ox_box, oy_box, z0, A, B, z_len)
    diagonals = [
        # (p1, p2, normal_para_dentro_da_boca)
        ((ox_box, oy_box + zl), (ox_box + zl, oy_box), (1.0, 1.0)),
        ((ox_box + A - zl, oy_box), (ox_box + A, oy_box + zl), (-1.0, 1.0)),
        ((ox_box, oy_box + B - zl), (ox_box + zl, oy_box + B), (1.0, -1.0)),
        ((ox_box + A - zl, oy_box + B), (ox_box + A, oy_box + B - zl), (-1.0, -1.0)),
    ]
    inv = 1.0 / math.sqrt(2.0)
    for idx, ((x1, y1), (x2, y2), (nx, ny)) in enumerate(diagonals):
        # Espessura t projetada para o canto externo (atras da diagonal, mantendo boca livre)
        ux, uy = nx * inv * t, ny * inv * t
        pts = [
            pgs_to_cad_vec(x1, y1, z0),
            pgs_to_cad_vec(x2, y2, z0),
            pgs_to_cad_vec(x2 - ux, y2 - uy, z0),
            pgs_to_cad_vec(x1 - ux, y1 - uy, z0),
        ]
        pts.append(pts[0])
        face = Part.Face(Part.makePolygon(pts))
        prism = face.extrude(FreeCAD.Vector(0.0, float(z_len), 0.0))
        clipped = prism.common(inner_clip) if inner_clip else prism
        if clipped and clipped.Volume > 10.0:
            walls.append((f"P_PLANAR_CHAMFER_{idx + 1}", clipped))
    return walls


def build_freecad_from_buildpack(json_path, out_dir, explode_ratio=0.0):
    with open(json_path, "r", encoding="utf-8") as f:
        pack = json.load(f)

    geom = pack.get("geometry") or {}
    env = geom.get("envelope") or {}
    ac = pack.get("acoustics") or {}
    dr = pack.get("driver") or {}
    t = float(geom.get("material", {}).get("thickness", pack.get("dimensions", {}).get("t", 18.0)))
    F = float(env.get("F", 800.0))
    E = float(env.get("E", 500.0))
    A = float(env.get("A", F - 2 * t))
    B = float(env.get("B", E - 2 * t))
    D_ext = float(env.get("D_ext", 400.0))

    base_name = os.path.splitext(os.path.basename(json_path))[0]
    suffix = "_EXPLODIDA" if explode_ratio > 0.01 else ""
    doc = FreeCAD.newDocument(base_name + suffix)

    solids = []  # lista de (name, kind, shape, part_meta)
    parts = geom.get("parts") or []
    cutouts = geom.get("cutouts") or []

    def push_solid(name, kind, shape, p_meta):
        if not shape:
            return
        if explode_ratio > 0.001 and p_meta:
            ed = p_meta.get("explodeDir") or [0, 0, 0]
            dist = float(p_meta.get("explodeDist") or 0.0) * explode_ratio
            shape = shape.copy()
            shape.translate(pgs_to_cad_vec(ed[0] * dist, ed[1] * dist, ed[2] * dist))
        solids.append((name, kind, shape))

    # 1. Constroi cada solido B-Rep real a partir de pack.geometry.parts
    is_trap = (env.get("shape") == "trapezoidal" and abs(float(env.get("D", 0)) - float(env.get("C", 0))) > 0.5)
    c_top_env = float(env.get("C", D_ext - 2 * t))
    d_bot_env = float(env.get("D", D_ext - 2 * t))
    z_rear_bot = t
    z_rear_top = t + max(0.0, d_bot_env - c_top_env)
    has_cross_brace = any((pp.get("braceMeta") or {}).get("code") == "CROSS" for pp in parts)
    has_tb_brace = any((pp.get("braceMeta") or {}).get("code") == "TB" for pp in parts)
    cross_x0 = F / 2.0 - t / 2.0
    for dc in cutouts:
        if dc.get("kind") == "driver" and dc.get("partId") == "P_FRONT_BAFFLE" and dc.get("dia"):
            dcx = t + float(dc["xInt"])
            r_mag = float(dc["dia"]) * 0.45 + 15.0
            if abs((cross_x0 + t / 2.0) - dcx) < r_mag:
                cand_l = dcx - r_mag - t
                cand_r = dcx + r_mag
                if cand_l >= t + 35.0:
                    cross_x0 = cand_l
                elif cand_r + t <= F - t - 35.0:
                    cross_x0 = cand_r
    tb_x0 = t + A * 0.14 - 25.0
    if has_cross_brace and abs((tb_x0 + 25.0) - (cross_x0 + t / 2.0)) < 45.0:
        tb_x0 = F - t - A * 0.14 - 25.0

    def z_rear_at_y(y_abs):
        frac = max(0.0, min(1.0, (y_abs - t) / max(1.0, B)))
        return z_rear_bot + frac * (z_rear_top - z_rear_bot)

    vf = ac.get("vehicleFit") or {}
    wa_cfg = vf.get("wheelArch")
    wa_cuts = []
    wa_params = None
    if wa_cfg:
        wa_K = min(float(wa_cfg.get("K", 120.0)), A * 0.30)
        wa_J = min(float(wa_cfg.get("J", 180.0)), B * 0.65)
        wa_H = min(float(wa_cfg.get("H", 260.0)), max(60.0, (D_ext - 2.0 * t) * 0.78))
        wa_z0 = (D_ext - wa_H) / 2.0
        wa_params = (wa_K, wa_J, wa_H, wa_z0)
        wa_cuts = [
            make_box_pgs(-1.0, -1.0, wa_z0, wa_K + 1.0, wa_J + 1.0, wa_H),
            make_box_pgs(F - wa_K, -1.0, wa_z0, wa_K + 1.0, wa_J + 1.0, wa_H),
        ]

    def apply_wa_cut(sh):
        if not sh or not wa_cuts:
            return sh
        out = sh
        for wc in wa_cuts:
            if wc:
                out = out.cut(wc)
        return out

    for p in parts:
        pid = p["id"]
        kind = p["kind"]
        ox, oy, oz = p["origin"]
        dx, dy, dz = p["size"]

        if pid == "P_BASE" and wa_cuts:
            push_solid(pid, "mdf", apply_wa_cut(make_box_pgs(ox, oy, oz, dx, dy, dz)), p)
            continue

        if pid == "P_REAR" and is_trap:
            s_rear = make_trapezoid_rear(0.0, t, z_rear_bot, z_rear_top, F, B, t)
            push_solid("P_REAR", "mdf", apply_wa_cut(s_rear), p)
            continue

        if pid == "P_SIDES":
            dy_l = dy + t if p.get("leftTopExtend") else dy
            dy_r = dy + t if p.get("rightTopExtend") else dy
            if is_trap:
                z_front_side = oz + dz
                s_left = make_trapezoid_side(0.0, oy, z_rear_bot, z_rear_top, z_front_side, dy_l, t)
                s_right = make_trapezoid_side(F - t, oy, z_rear_bot, z_rear_top, z_front_side, dy_r, t)
            else:
                s_left = make_box_pgs(ox, oy, oz, dx, dy_l, dz)
                s_right = make_box_pgs(F - t, oy, oz, dx, dy_r, dz)
            push_solid("P_SIDE_LEFT", "mdf", apply_wa_cut(s_left), p)
            push_solid("P_SIDE_RIGHT", "mdf", apply_wa_cut(s_right), dict(p, explodeDir=[1, 0, 0]))
            continue

        if pid == "P_MATRIX_V" and p.get("matrixMeta"):
            mm = p["matrixMeta"]
            cols_m = max(2, int(mm.get("cols", 2)))
            rows_m = max(1, int(mm.get("rows", 1)))
            z_fm = D_ext - t
            z_mm = (z_rear_top + z_fm) / 2.0
            for k in range(1, cols_m):
                xk = t + k * (A / cols_m) - t / 2.0
                sh_v = make_trapezoid_side(xk, t, z_rear_bot, z_rear_top, z_fm, B, t) if is_trap else make_box_pgs(xk, t, t, t, B, z_fm - t)
                if sh_v and rows_m > 1:
                    for j in range(1, rows_m):
                        yj = t + j * (B / rows_m) - t / 2.0
                        slot = make_box_pgs(xk - 1.0, yj, z_rear_bot - 1.0, t + 2.0, t, z_mm - (z_rear_bot - 1.0))
                        if slot:
                            sh_v = sh_v.cut(slot)
                push_solid(f"P_MATRIX_V_{k}", "divider", apply_wa_cut(sh_v), p)
            continue

        if pid == "P_MATRIX_H" and p.get("matrixMeta"):
            mm = p["matrixMeta"]
            cols_m = max(1, int(mm.get("cols", 1)))
            rows_m = max(2, int(mm.get("rows", 2)))
            z_fm = D_ext - t
            z_mm = (z_rear_top + z_fm) / 2.0
            for j in range(1, rows_m):
                yj = t + j * (B / rows_m) - t / 2.0
                z_sh = z_rear_at_y(yj + t)
                sh_h = make_box_pgs(t, yj, z_sh, A, t, max(10.0, z_fm - z_sh))
                if sh_h and cols_m > 1:
                    for k in range(1, cols_m):
                        xk = t + k * (A / cols_m) - t / 2.0
                        slot = make_box_pgs(xk, yj - 1.0, z_mm, t, t + 2.0, (z_fm + 1.0) - z_mm)
                        if slot:
                            sh_h = sh_h.cut(slot)
                push_solid(f"P_MATRIX_H_{j}", "divider", apply_wa_cut(sh_h), p)
            continue

        if pid == "P_WHEEL_ARCH" and wa_params:
            wa_K, wa_J, wa_H, wa_z0 = wa_params
            inner_box = make_box_pgs(t, t, t, A, B, D_ext - 2.0 * t)
            for side_name, x_in, x_cut in [("P_WHEEL_ARCH_L", t, 0.0), ("P_WHEEL_ARCH_R", F - wa_K - t, F - wa_K)]:
                outer_shell = make_box_pgs(x_in, t, wa_z0 - t, wa_K, wa_J, wa_H + 2.0 * t)
                cut_vol = make_box_pgs(x_cut, 0.0, wa_z0, wa_K, wa_J, wa_H)
                if outer_shell and cut_vol:
                    cap = outer_shell.cut(cut_vol)
                    if inner_box:
                        cap = cap.common(inner_box)
                    push_solid(side_name, "divider", cap, p)
            continue

        if pid == "P_TOP":
            top_panels = [("P_TOP_L", float(p["topSplit"]["xLeft"])), ("P_TOP_R", float(p["topSplit"]["xRight"]))] if p.get("topSplit") else [(pid, ox)]
            for tname, tx0 in top_panels:
                tsh = make_box_pgs(tx0, oy, oz, dx, dy, dz)
                if tsh:
                    for c in cutouts:
                        if c.get("partId") == "P_TOP" and c.get("shape") == "round" and c.get("dia"):
                            cx = t + float(c["xInt"])
                            cz = (z_rear_top if is_trap else t) + float(c["yInt"])
                            if tx0 - 1.0 <= cx <= tx0 + dx + 1.0:
                                cyl = Part.makeCylinder(float(c["dia"]) / 2.0, dy + 4.0, pgs_to_cad_vec(cx, oy - 2.0, cz), FreeCAD.Vector(0.0, 0.0, 1.0))
                                tsh = tsh.cut(cyl)
                    push_solid(tname, "mdf", tsh, p)
            continue

        if pid == "P_PLANAR_DIV" and p.get("splitByCenterDiv"):
            sp = p["splitByCenterDiv"]
            push_solid("P_PLANAR_DIV_L", "divider", make_box_pgs(float(sp["xLeft"]), oy, oz, dx, dy, dz), p)
            push_solid("P_PLANAR_DIV_R", "divider", make_box_pgs(float(sp["xRight"]), oy, oz, dx, dy, dz), p)
            continue

        if pid == "P_PLANAR_CHAMFER":
            pg = ac.get("planarGeom") or {}
            zl = float(pg.get("Z_leg") or 0.0)
            z_len = max(10.0, float(D_ext - oz))
            if p.get("dualPlanarTri"):
                sub_a = (A - t) / 2.0
                zl_sub = min(zl, sub_a * 0.28)
                for s_idx, sx0 in enumerate([t, t + sub_a + t]):
                    walls = make_planar_chamfer_walls(sx0, t, oz, sub_a, B, z_len, zl_sub, t)
                    for cname, cshape in walls:
                        push_solid(f"{cname}_{s_idx + 1}", "divider", cshape, p)
            else:
                walls = make_planar_chamfer_walls(t, t, oz, A, B, z_len, zl, t)
                if walls:
                    for cname, cshape in walls:
                        push_solid(cname, "divider", cshape, p)
                else:
                    push_solid(pid, "divider", make_box_pgs(ox, oy, oz, dx, dy, dz), p)
            continue

        if pid == "P_FRONT_BAFFLE":
            if p.get("frontSplit"):
                fs_meta = p["frontSplit"]
                panels = [
                    ("P_FRONT_BAFFLE_L", float(fs_meta["xLeft"])),
                    ("P_FRONT_BAFFLE_R", float(fs_meta["xRight"])),
                ]
            else:
                panels = [(pid, ox)]
            for pname, px0 in panels:
                shape = make_box_pgs(px0, oy, oz, dx, dy, dz)
                if not shape:
                    continue
                # Chanfros 45 deg nos 4 cantos se Planar Triangulo
                pg = ac.get("planarGeom")
                if pg and pg.get("style") == "triangle" and pg.get("Z_leg"):
                    zl = float(pg["Z_leg"])
                    corners = [
                        [(px0 - 1, oy - 1), (px0 + zl, oy - 1), (px0 - 1, oy + zl)],
                        [(px0 + dx + 1, oy - 1), (px0 + dx - zl, oy - 1), (px0 + dx + 1, oy + zl)],
                        [(px0 - 1, oy + dy + 1), (px0 + zl, oy + dy + 1), (px0 - 1, oy + dy - zl)],
                        [(px0 + dx + 1, oy + dy + 1), (px0 + dx - zl, oy + dy + 1), (px0 + dx + 1, oy + dy - zl)],
                    ]
                    for tri in corners:
                        pts = [pgs_to_cad_vec(x, y, oz - 2.0) for (x, y) in tri]
                        pts.append(pts[0])
                        wire = Part.makePolygon(pts)
                        face = Part.Face(wire)
                        prism = face.extrude(FreeCAD.Vector(0.0, dz + 4.0, 0.0))
                        shape = shape.cut(prism)

                # Cortes booleanos reais de drivers e dutos no painel frontal
                for c in cutouts:
                    if c.get("partId") != "P_FRONT_BAFFLE":
                        continue
                    cx = t + float(c["xInt"])
                    cy = t + float(c["yInt"])
                    if p.get("frontSplit") and (cx < px0 - 1.0 or cx > px0 + dx + 1.0):
                        continue
                    if c["shape"] == "round" and c.get("dia"):
                        r = float(c["dia"]) / 2.0
                        cyl = Part.makeCylinder(r, dz + 4.0, pgs_to_cad_vec(cx, cy, oz - 2.0), FreeCAD.Vector(0.0, 1.0, 0.0))
                        shape = shape.cut(cyl)
                    elif c["shape"] == "slot" and c.get("w") and c.get("h") and not p.get("frontSplit"):
                        sw, sh = float(c["w"]), float(c["h"])
                        slot_box = make_box_pgs(cx - sw / 2.0, cy - sh / 2.0, oz - 2.0, sw, sh, dz + 4.0)
                        if slot_box:
                            shape = shape.cut(slot_box)
                    elif c["shape"] == "triangle" and c.get("triA") and c.get("triB"):
                        ta, tb = float(c["triA"]), float(c["triB"])
                        cidx = c.get("cornerIdx")
                        if cidx is not None:
                            tri_corners = [
                                [(t, t), (t + ta, t), (t, t + tb)],
                                [(t + A, t), (t + A - ta, t), (t + A, t + tb)],
                                [(t, t + B), (t + ta, t + B), (t, t + B - tb)],
                                [(t + A, t + B), (t + A - ta, t + B), (t + A, t + B - tb)],
                            ]
                            tpts = tri_corners[int(cidx) % 4]
                            pts = [pgs_to_cad_vec(px, py, oz - 2.0) for (px, py) in tpts]
                        else:
                            pts = [
                                pgs_to_cad_vec(cx - ta / 3.0, cy - tb / 3.0, oz - 2.0),
                                pgs_to_cad_vec(cx + 2.0 * ta / 3.0, cy - tb / 3.0, oz - 2.0),
                                pgs_to_cad_vec(cx - ta / 3.0, cy + 2.0 * tb / 3.0, oz - 2.0),
                            ]
                        pts.append(pts[0])
                        tri_prism = Part.Face(Part.makePolygon(pts)).extrude(FreeCAD.Vector(0.0, dz + 4.0, 0.0))
                        shape = shape.cut(tri_prism)
                push_solid(pname, "mdf", shape, p)
            continue

        if pid in ("P_BP_DIVIDER", "P_BP_DIVIDER_1", "P_BP_DIVIDER_2", "P_CENTER_DIV"):
            if is_trap:
                shape = make_trapezoid_side(ox, oy, z_rear_bot, z_rear_top, oz + dz, dy, t)
            else:
                shape = make_box_pgs(ox, oy, oz, dx, dy, dz)
            if shape:
                for c in cutouts:
                    if c.get("partId") == pid and c.get("dia"):
                        r = float(c["dia"]) / 2.0
                        cz = (z_rear_top if is_trap else t) + float(c["xInt"])
                        cy = t + float(c["yInt"])
                        cyl = Part.makeCylinder(r, dx + 4.0, pgs_to_cad_vec(ox - 2.0, cy, cz), FreeCAD.Vector(1.0, 0.0, 0.0))
                        shape = shape.cut(cyl)
                push_solid(pid, "divider", shape, p)
            continue

        if kind == "port" and p.get("sharedCenterSlot"):
            sc = p["sharedCenterSlot"]
            push_solid(f"{pid}_L", "port", make_box_pgs(float(sc["xLeft"]), oy, oz, dx, dy, dz), p)
            push_solid(f"{pid}_R", "port", make_box_pgs(float(sc["xRight"]), oy, oz, dx, dy, dz), p)
            continue

        if kind == "port" and p.get("bpTopRound"):
            r_out = dx / 2.0
            wall = max(1.5, float(p.get("thickness", 1.5)))
            is_rear = (pid == "P_PORT_REAR")
            top_holes = [
                c for c in cutouts
                if c.get("kind") == "port" and c.get("shape") == "round"
                and c.get("partId") == "P_TOP"
                and (("Traseir" in c.get("label", "")) == is_rear)
            ]
            if not top_holes and not is_rear:
                top_holes = [c for c in cutouts if c.get("kind") == "port" and c.get("shape") == "round" and c.get("partId") == "P_TOP"]
            for idx, ch in enumerate(top_holes):
                cx = t + float(ch["xInt"])
                cz = (z_rear_top if is_trap else t) + float(ch["yInt"])
                lv = min(B - 20.0, float(ch.get("lvMm") or dy))
                y_start = max(t, E - t - lv)
                tube = make_hollow_cylinder_pgs(cx, y_start, cz, r_out, r_out - wall, lv, FreeCAD.Vector(0.0, 0.0, 1.0))
                push_solid(f"{pid}_{idx + 1}", "port", tube, p)
            continue

        if kind == "port" and p.get("splitByCenterDiv"):
            sp = p["splitByCenterDiv"]
            push_solid("P_PORT_SLOT_L", "port", make_box_pgs(float(sp["xLeft"]), oy, oz, dx, dy, dz), p)
            push_solid("P_PORT_SLOT_R", "port", make_box_pgs(float(sp["xRight"]), oy, oz, dx, dy, dz), p)
            continue

        if kind == "port" and p.get("triMeta"):
            tm = p["triMeta"]
            walls = make_br_triangle_port_walls(
                t, t, D_ext - t, A, B,
                float(tm.get("lvMm") or dz),
                float(tm.get("triA") or 140.0),
                float(tm.get("triB") or 140.0),
                t,
                tm.get("corners") or list(range(int(tm.get("count") or 2))),
            )
            for wname, wshape in walls:
                push_solid(wname, "port", wshape, p)
            continue

        if pid == "P_PORT_SERIES":
            r_out = dy / 2.0
            wall = max(1.5, float(p.get("thickness", 1.5)))
            bp_c = ac.get("bpChambers") or {}
            if bp_c.get("dualDiv") and bp_c.get("A_rear_side"):
                div_x = t + float(bp_c["A_rear_side"])
            elif bp_c.get("A_rear"):
                div_x = t + float(bp_c["A_rear"])
            else:
                div_x = F / 2.0 - t / 2.0
            ser_holes = [c for c in cutouts if c.get("partId") in ("P_BP_DIVIDER", "P_BP_DIVIDER_1") and c.get("kind") == "port"]
            for idx, ch in enumerate(ser_holes):
                cz = (z_rear_top if is_trap else t) + float(ch["xInt"])
                cy = t + float(ch["yInt"])
                lv = float(ch.get("lvMm") or dx)
                x_start = max(t, div_x - lv)
                tube = make_hollow_cylinder_pgs(x_start, cy, cz, r_out, r_out - wall, max(5.0, div_x - x_start), FreeCAD.Vector(1.0, 0.0, 0.0))
                push_solid(f"{pid}_{idx + 1}", "port", tube, p)
            continue

        if kind == "port" and float(p.get("area", 0)) <= 0.0:
            r_out = dx / 2.0
            wall = max(1.5, float(p.get("thickness", 1.5)))
            is_rear = (pid == "P_PORT_REAR")
            port_holes = [
                c for c in cutouts
                if c.get("kind") == "port" and c.get("shape") == "round"
                and c.get("partId") == "P_FRONT_BAFFLE"
                and (("Traseir" in c.get("label", "")) == is_rear)
            ]
            if not port_holes and not is_rear:
                port_holes = [c for c in cutouts if c.get("kind") == "port" and c.get("shape") == "round" and c.get("partId") == "P_FRONT_BAFFLE"]
            if port_holes:
                for idx, ch in enumerate(port_holes):
                    cx = t + float(ch["xInt"])
                    cy = t + float(ch["yInt"])
                    lv = float(ch.get("lvMm") or dz)
                    z_start = max(t, D_ext - t - lv)
                    tube = make_hollow_cylinder_pgs(cx, cy, z_start, r_out, r_out - wall, lv)
                    push_solid(f"{pid}_{idx + 1}", "port", tube, p)
            else:
                tube = make_hollow_cylinder_pgs(ox + r_out, oy + r_out, oz, r_out, r_out - wall, dz)
                push_solid(pid, "port", tube, p)
            continue

        if kind == "batten":
            bm = p.get("braceMeta")
            if bm and bm.get("code"):
                bcode = bm["code"]
                cross_cut = make_box_pgs(cross_x0 - 0.05, t - 1.0, t - 1.0, t + 0.1, B + 2.0, D_ext) if has_cross_brace else None
                tb_cut = make_box_pgs(tb_x0 - 0.05, t - 1.0, t - 1.0, 50.1, B + 2.0, D_ext) if has_tb_brace else None
                sh_b = None
                if bcode == "CROSS":
                    sh_b = make_window_brace(cross_x0, t, z_rear_bot, z_rear_top, D_ext - t, B, t, is_trap, float(bm.get("holeDiaMm") or 80.0))
                elif bcode == "TB":
                    sh_b = make_trapezoid_batten(tb_x0, t, z_rear_bot, z_rear_top, 50.0, B, t) if is_trap else make_box_pgs(tb_x0, t, t, 50.0, B, t)
                elif bcode == "LR":
                    z_mid_b = (z_rear_top + (D_ext - t)) / 2.0
                    sh_b = make_box_pgs(t, t + B * 0.5 - 25.0, z_mid_b - t / 2.0, A, 50.0, t)
                    if sh_b and cross_cut:
                        sh_b = sh_b.cut(cross_cut)
                elif bcode == "FF":
                    y_ff = t + 20.0
                    z_sff = z_rear_at_y(y_ff + t) + t
                    sh_b = make_box_pgs(t + A * 0.78 - 25.0, y_ff, z_sff, 50.0, t, max(20.0, (D_ext - t) - z_sff))
                elif bcode == "BAFFLE":
                    sh_b = make_box_pgs(t, E - t - 50.0, D_ext - 2.0 * t, A, 50.0, t)
                    if sh_b and cross_cut:
                        sh_b = sh_b.cut(cross_cut)
                elif bcode == "REAR":
                    y_r = t + B * 0.22 - 25.0
                    z_r = z_rear_at_y(y_r + 50.0) + t
                    sh_b = make_box_pgs(t, y_r, z_r, A, 50.0, t)
                    if sh_b and cross_cut:
                        sh_b = sh_b.cut(cross_cut)
                    if sh_b and tb_cut:
                        sh_b = sh_b.cut(tb_cut)
                push_solid(pid, "batten", apply_wa_cut(sh_b), p)
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
                q_l = max(1, qty // 2)
                q_r = max(0, qty - q_l)
                xs = [t + ((i + 1) / (q_l + 1)) * half_a - dx / 2.0 for i in range(q_l)]
                xs += [t + half_a + t + ((j + 1) / (q_r + 1)) * half_a - dx / 2.0 for j in range(q_r)]
            else:
                xs = [t + ((i + 1) / (qty + 1)) * A - dx / 2.0 for i in range(qty)]
            for i, bx in enumerate(xs):
                if is_trap:
                    s_bat = make_trapezoid_batten(bx, t, z_rear_bot, z_rear_top, dx, B, t)
                else:
                    s_bat = make_box_pgs(bx, t, t, dx, min(dy, B), dz)
                push_solid(f"{pid}_{i + 1}", "batten", s_bat, p)
            continue

        shape = make_box_pgs(ox, oy, oz, dx, dy, dz)
        push_solid(pid, kind, shape, p)

    # 2. Adiciona ao documento FreeCAD organizado em Grupos (Manual FreeCAD p. 34-35)
    grp_map = {
        "mdf": doc.addObject("App::DocumentObjectGroup", "01_Estrutura_MDF"),
        "divider": doc.addObject("App::DocumentObjectGroup", "02_Divisorias"),
        "port": doc.addObject("App::DocumentObjectGroup", "03_Dutos"),
        "batten": doc.addObject("App::DocumentObjectGroup", "04_Travamentos"),
    }
    created_objs = []
    for name, kind, shape in solids:
        obj = doc.addObject("Part::Feature", name)
        obj.Shape = shape
        grp = grp_map.get(kind, grp_map["mdf"])
        grp.addObject(obj)
        created_objs.append((name, kind, obj))

    # Remove grupos vazios para manter a arvore limpa
    for gk, gobj in list(grp_map.items()):
        if not gobj.Group:
            doc.removeObject(gobj.Name)

    doc.recompute()

    # 3. Auditoria Booleana 3D real no kernel OpenCASCADE (colisao par-a-par > 5 mm3)
    collisions = []
    if explode_ratio <= 0.01:
        for i in range(len(solids)):
            n1, k1, s1 = solids[i]
            bb1 = s1.BoundBox
            for j in range(i + 1, len(solids)):
                n2, k2, s2 = solids[j]
                if not bb1.intersect(s2.BoundBox):
                    continue
                try:
                    inter = s1.common(s2)
                    vol_mm3 = float(inter.Volume)
                    if vol_mm3 > 5.0:
                        collisions.append({
                            "partA": n1,
                            "partB": n2,
                            "overlapCm3": round(vol_mm3 / 1000.0, 2)
                        })
                except Exception:
                    pass

    mdf_vol_m3 = sum(s.Volume for (_, k, s) in solids if k in ("mdf", "divider", "batten")) / 1e9
    mdf_weight_kg = round(mdf_vol_m3 * 750.0, 2)

    # 3B. Planilhas Nativas FreeCAD (Parametros_Acusticos + Lista_de_Corte_BOM, sem ciclo — Manual p. 133-140)
    try:
        sp_p = doc.addObject("Spreadsheet::Sheet", "Parametros_Acusticos")
        sp_p.set("A1", "Parametro")
        sp_p.set("B1", "Valor")
        sp_p.set("C1", "Unidade")
        sp_rows = [
            ("Driver", str(dr.get("name") or "Driver"), "-", None),
            ("Topologia", str(ac.get("boxType") or "custom").upper(), "-", None),
            ("Largura_Ext_F", round(F, 2), "mm", "F_ext"),
            ("Altura_Ext_E", round(E, 2), "mm", "E_ext"),
            ("Prof_Ext_D", round(D_ext, 2), "mm", "D_ext"),
            ("Largura_Int_A", round(A, 2), "mm", "A_int"),
            ("Altura_Int_B", round(B, 2), "mm", "B_int"),
            ("Prof_Topo_C", round(c_top_env, 2), "mm", "C_top"),
            ("Prof_Base_D", round(d_bot_env, 2), "mm", "D_bot"),
            ("Espessura_MDF_t", round(t, 2), "mm", "t_mdf"),
            ("Vol_Vb_VF", round(float(ac.get("Vb") or 0.0), 2), "L", "Vb_L"),
            ("Vol_VR", round(float(ac.get("Vr") or 0.0), 2), "L", "Vr_L"),
            ("Sintonia_Fb", round(float(ac.get("Fb") or 0.0), 2), "Hz", "Fb_Hz"),
            ("Comprimento_Duto_Lv", round(float(ac.get("lvMm") or 0.0), 1), "mm", "Lv_mm"),
            ("Peso_MDF_Real_OCCT", mdf_weight_kg, "kg", "MDF_kg"),
            ("Colisoes_3D_OCCT", len(collisions), "un", None),
        ]
        for idx_r, (lbl, val, unit, alias) in enumerate(sp_rows, start=2):
            sp_p.set(f"A{idx_r}", lbl)
            sp_p.set(f"B{idx_r}", str(val))
            sp_p.set(f"C{idx_r}", unit)
            if alias:
                try:
                    sp_p.setAlias(f"B{idx_r}", alias)
                except Exception:
                    pass

        sp_bom = doc.addObject("Spreadsheet::Sheet", "Lista_de_Corte_BOM")
        headers = [("A1", "Peca"), ("B1", "Categoria"), ("C1", "BBox_X_mm"), ("D1", "BBox_Y_mm"), ("E1", "BBox_Z_mm"), ("F1", "Volume_cm3"), ("G1", "Massa_MDF_kg")]
        for cell, htxt in headers:
            sp_bom.set(cell, htxt)
        for idx_b, (n_b, k_b, s_b) in enumerate(solids, start=2):
            bb = s_b.BoundBox
            vol_cm3 = round(float(s_b.Volume) / 1000.0, 1)
            mass_kg = round((float(s_b.Volume) / 1e9) * 750.0, 2) if k_b in ("mdf", "divider", "batten") else 0.0
            sp_bom.set(f"A{idx_b}", n_b)
            sp_bom.set(f"B{idx_b}", k_b)
            sp_bom.set(f"C{idx_b}", str(round(bb.XLength, 1)))
            sp_bom.set(f"D{idx_b}", str(round(bb.YLength, 1)))
            sp_bom.set(f"E{idx_b}", str(round(bb.ZLength, 1)))
            sp_bom.set(f"F{idx_b}", str(vol_cm3))
            sp_bom.set(f"G{idx_b}", str(mass_kg))
        doc.recompute()
    except Exception:
        pass

    out_fcstd_dir = os.environ.get("BF_OUT_FCSTD") or out_dir
    out_step_dir = os.environ.get("BF_OUT_STEP") or out_dir
    out_audit_dir = os.environ.get("BF_OUT_AUDIT") or out_dir
    for d in (out_fcstd_dir, out_step_dir, out_audit_dir):
        os.makedirs(d, exist_ok=True)

    fcstd_path = os.path.join(out_fcstd_dir, f"{base_name}{suffix}.FCStd")
    step_path = os.path.join(out_step_dir, f"{base_name}{suffix}.step")
    report_path = os.path.join(out_audit_dir, f"{base_name}{suffix}_audit.json")

    doc.saveAs(fcstd_path)
    Part.export([doc.getObject(n) for (n, _, _) in solids], step_path)

    report = {
        "project": base_name,
        "driver": dr.get("name"),
        "topology": ac.get("boxType"),
        "explodeRatio": explode_ratio,
        "freecadVersion": ".".join(FreeCAD.Version()[:3]),
        "solidsCount": len(solids),
        "mdfWeightKgReal": mdf_weight_kg,
        "collisionsCount": len(collisions),
        "collisions": collisions,
        "fcstd": fcstd_path,
        "step": step_path
    }
    with open(report_path, "w", encoding="utf-8") as rf:
        json.dump(report, rf, indent=2, ensure_ascii=False)

    print(json.dumps(report, ensure_ascii=False))
    FreeCAD.closeDocument(doc.Name)


_exp = float(os.environ.get("BF_EXPLODE", "0.0") or "0.0")
if os.environ.get("BF_JSON") and (os.environ.get("BF_OUT") or os.environ.get("BF_OUT_FCSTD")):
    build_freecad_from_buildpack(os.environ["BF_JSON"], os.environ.get("BF_OUT") or os.environ["BF_OUT_FCSTD"], _exp)
elif __name__ == "__main__":
    args = [a for a in sys.argv[1:] if not a.endswith(".py")]
    if len(args) < 2:
        print("Uso: BF_JSON=in.json BF_OUT=dir freecadcmd.exe pgs_to_freecad.py")
        sys.exit(1)
    build_freecad_from_buildpack(args[0], args[1], _exp)
