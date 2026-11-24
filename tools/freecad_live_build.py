"""
BassForge SUITE — Construcao AO VIVO no FreeCAD 1.1+ (Qt6 / PySide6 + OpenCASCADE B-Rep)
Paridade 100% com PGS bassforge-pgs/v1:
  - Recortes booleanos reais: drivers (frontal & divisoria BP4/BP6), dutos redondos, regua (slot) e triangulo
  - 4 chanfros 45 deg + 4 paredes angulares reais na Planar Triangulo
  - Desvio automatico de sarrafos em BP4/BP6 e suporte a duto traseiro BP6
  - Suporte a Vista Explodida animada (BF_LIVE_EXPLODE=1.0)
  - Auditoria booleana 3D OpenCASCADE automatica + exportacao .FCStd e .step
  - Compativel tanto com FreeCAD GUI (ao vivo) quanto com freecadcmd.exe (teste automatizado)
"""
import json
import math
import os
import time
import traceback
import FreeCAD
import Part

HAS_GUI = bool(getattr(FreeCAD, "GuiUp", False))
if HAS_GUI:
    import FreeCADGui
    try:
        from PySide6 import QtCore
    except ImportError:
        try:
            from PySide2 import QtCore
        except ImportError:
            from PySide import QtCore
else:
    QtCore = None

LOG_PATH = r"C:\Users\Dinalli\Desktop\Projetos acusticos\BassForge_CAD_Biblioteca\06_BuildPacks_JSON\live_build.log"


def log(msg):
    try:
        os.makedirs(os.path.dirname(LOG_PATH), exist_ok=True)
        with open(LOG_PATH, "a", encoding="utf-8") as lf:
            lf.write(f"[{time.strftime('%H:%M:%S')}] {msg}\n")
    except Exception:
        pass
    FreeCAD.Console.PrintMessage(msg + "\n")


def ui_pause(sec=0.45):
    if not HAS_GUI or QtCore is None:
        return
    end = time.time() + sec
    while time.time() < end:
        QtCore.QCoreApplication.processEvents()
        time.sleep(0.02)


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
    ri = max(0.5, min(float(r_out) - 0.5, float(r_in)))
    off = FreeCAD.Vector(-axis.x, -axis.y, -axis.z)
    inner = Part.makeCylinder(ri, float(length) + 2.0, base.add(off), axis)
    return outer.cut(inner)


def make_trapezoid_side(x0, y0, z_rear_bot, z_rear_top, z_front, B, t):
    pts = [
        pgs_vec(x0, y0, z_rear_bot),
        pgs_vec(x0, y0, z_front),
        pgs_vec(x0, y0 + B, z_front),
        pgs_vec(x0, y0 + B, z_rear_top),
    ]
    pts.append(pts[0])
    return Part.Face(Part.makePolygon(pts)).extrude(FreeCAD.Vector(float(t), 0.0, 0.0))


def make_trapezoid_rear(x0, y0, z_rear_bot, z_rear_top, F, B, t):
    pts = [
        pgs_vec(x0, y0, z_rear_bot - t),
        pgs_vec(x0, y0, z_rear_bot),
        pgs_vec(x0, y0 + B, z_rear_top),
        pgs_vec(x0, y0 + B, z_rear_top - t),
    ]
    pts.append(pts[0])
    return Part.Face(Part.makePolygon(pts)).extrude(FreeCAD.Vector(float(F), 0.0, 0.0))


def make_trapezoid_batten(x0, y0, z_rear_bot, z_rear_top, dx, B, t):
    pts = [
        pgs_vec(x0, y0, z_rear_bot),
        pgs_vec(x0, y0, z_rear_bot + t),
        pgs_vec(x0, y0 + B, z_rear_top + t),
        pgs_vec(x0, y0 + B, z_rear_top),
    ]
    pts.append(pts[0])
    return Part.Face(Part.makePolygon(pts)).extrude(FreeCAD.Vector(float(dx), 0.0, 0.0))


def make_window_brace(x0, y0, z_rear_bot, z_rear_top, z_front, B, t, is_trap, hole_dia):
    shape = make_trapezoid_side(x0, y0, z_rear_bot, z_rear_top, z_front, B, t) if is_trap else make_box(x0, y0, z_rear_bot, t, B, max(10.0, z_front - z_rear_bot))
    if not shape:
        return None
    r = max(12.0, min(float(hole_dia) / 2.0, B * 0.13, max(20.0, z_front - z_rear_top) * 0.18))
    specs = [(0.78, [0.52]), (0.48, [0.32, 0.72]), (0.20, [0.30, 0.72])] if is_trap else [(0.80, [0.30, 0.70]), (0.50, [0.30, 0.70]), (0.20, [0.30, 0.70])]
    for fy, z_fracs in specs:
        cy = y0 + fy * B
        zr = z_rear_bot + fy * (z_rear_top - z_rear_bot)
        span = max(10.0, z_front - zr)
        for fz in z_fracs:
            cz = zr + fz * span
            if cz - r > zr + 10.0 and cz + r < z_front - 10.0:
                shape = shape.cut(Part.makeCylinder(r, t + 4.0, pgs_vec(x0 - 2.0, cy, cz), FreeCAD.Vector(1.0, 0.0, 0.0)))
    return shape


def make_br_triangle_port_walls(ox, oy, z_front_inner, A, B, lv, tri_a, tri_b, t, corner_indices):
    walls = []
    if lv <= 1.0 or tri_a <= 1.0 or tri_b <= 1.0:
        return walls
    z0 = max(t, z_front_inner - lv)
    z_len = max(1.0, z_front_inner - z0)
    inner_clip = make_box(ox, oy, z0, A, B, z_len)
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
            pgs_vec(x1, y1, z0),
            pgs_vec(x2, y2, z0),
            pgs_vec(x2 + ux, y2 + uy, z0),
            pgs_vec(x1 + ux, y1 + uy, z0),
        ]
        pts.append(pts[0])
        prism = Part.Face(Part.makePolygon(pts)).extrude(FreeCAD.Vector(0.0, float(z_len), 0.0))
        clipped = prism.common(inner_clip) if inner_clip else prism
        if clipped and clipped.Volume > 10.0:
            walls.append((f"P_PORT_TRI_{i + 1}", clipped))
    return walls


def make_planar_chamfer_walls(ox_box, oy_box, z0, A, B, z_len, zl, t):
    walls = []
    if zl <= 1.0 or z_len <= 1.0:
        return walls
    inner_clip = make_box(ox_box, oy_box, z0, A, B, z_len)
    diagonals = [
        ((ox_box, oy_box + zl), (ox_box + zl, oy_box), (1.0, 1.0)),
        ((ox_box + A - zl, oy_box), (ox_box + A, oy_box + zl), (-1.0, 1.0)),
        ((ox_box, oy_box + B - zl), (ox_box + zl, oy_box + B), (1.0, -1.0)),
        ((ox_box + A - zl, oy_box + B), (ox_box + A, oy_box + B - zl), (-1.0, -1.0)),
    ]
    inv = 1.0 / math.sqrt(2.0)
    for idx, ((x1, y1), (x2, y2), (nx, ny)) in enumerate(diagonals):
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


def add_colored(doc, name, shape, rgb, transparency=0):
    if shape is None:
        return None
    obj = doc.addObject("Part::Feature", name)
    obj.Shape = shape
    doc.recompute()
    if HAS_GUI and hasattr(obj, "ViewObject") and obj.ViewObject:
        try:
            obj.ViewObject.ShapeColor = rgb
            obj.ViewObject.Transparency = int(transparency)
            obj.ViewObject.LineWidth = 1.5
        except Exception:
            pass
    return obj


def run_live_build():
    try:
        json_path = os.environ.get(
            "BF_LIVE_JSON",
            r"C:\Users\Dinalli\Desktop\Projetos acusticos\BassForge_CAD_Biblioteca\06_BuildPacks_JSON\02_dutada_redonda.json",
        )
        explode_target = float(os.environ.get("BF_LIVE_EXPLODE", "0.0") or "0.0")
        base_name = os.path.splitext(os.path.basename(json_path))[0]
        suffix = "_EXPLODIDA_LIVE" if explode_target > 0.01 else "_LIVE"
        out_fcstd = os.environ.get(
            "BF_LIVE_OUT",
            os.path.join(
                r"C:\Users\Dinalli\Desktop\Projetos acusticos\BassForge_CAD_Biblioteca\01_FreeCAD_FCStd",
                f"{base_name}{suffix}.FCStd",
            ),
        )
        out_step = os.path.splitext(out_fcstd)[0] + ".step"

        log(f"Iniciando BassForge Live Build ({base_name}, explode={explode_target:.2f})...")
        with open(json_path, "r", encoding="utf-8") as f:
            pack = json.load(f)

        geom = pack["geometry"]
        env = geom["envelope"]
        ac = pack.get("acoustics") or {}
        t = float(geom["material"]["thickness"])
        F = float(env["F"])
        E = float(env["E"])
        A = float(env["A"])
        B = float(env["B"])
        D_ext = float(env["D_ext"])
        parts = geom["parts"]
        cutouts = geom["cutouts"]

        doc = FreeCAD.newDocument(f"BassForge_{base_name}")
        view = None
        if HAS_GUI:
            FreeCADGui.activateWorkbench("PartWorkbench")
            view = FreeCADGui.ActiveDocument.ActiveView
            view.viewIsometric()
            ui_pause(0.5)

        MDF_MAIN = (0.82, 0.67, 0.46)
        MDF_SIDE = (0.76, 0.60, 0.40)
        MDF_FRONT = (0.86, 0.72, 0.52)
        BATTEN_COL = (0.28, 0.56, 0.90)
        PORT_COL = (0.95, 0.45, 0.14)
        DIV_COL = (0.58, 0.36, 0.88)

        built = []  # (name, kind, obj, explodeDir, explodeDist)
        ordered = sorted(parts, key=lambda p: p.get("assemblyOrder", 5))

        def register(name, kind, shape, p_meta, rgb, transp=0):
            obj = add_colored(doc, name, shape, rgb, transp)
            if obj is not None:
                ed = p_meta.get("explodeDir") or [0, 0, 0]
                dist = float(p_meta.get("explodeDist") or 0.0)
                built.append((name, kind, obj, ed, dist))
            return obj

        is_trap = (env.get("shape") == "trapezoidal" and abs(float(env.get("D", 0)) - float(env.get("C", 0))) > 0.5)
        z_rear_bot = t
        z_rear_top = t + max(0.0, float(env.get("D", D_ext - 2 * t)) - float(env.get("C", D_ext - 2 * t)))
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
            wa_cuts = [make_box(-1.0, -1.0, wa_z0, wa_K + 1.0, wa_J + 1.0, wa_H), make_box(F - wa_K, -1.0, wa_z0, wa_K + 1.0, wa_J + 1.0, wa_H)]

        def apply_wa_cut(sh):
            if not sh or not wa_cuts:
                return sh
            out = sh
            for wc in wa_cuts:
                if wc:
                    out = out.cut(wc)
            return out

        for p in ordered:
            pid = p["id"]
            kind = p["kind"]
            ox, oy, oz = p["origin"]
            dx, dy, dz = p["size"]

            if pid == "P_BASE" and wa_cuts:
                register(pid, "mdf", apply_wa_cut(make_box(ox, oy, oz, dx, dy, dz)), p, MDF_MAIN)
                continue

            if pid == "P_REAR" and is_trap:
                register("P_REAR", "mdf", apply_wa_cut(make_trapezoid_rear(0.0, t, z_rear_bot, z_rear_top, F, B, t)), p, MDF_MAIN)
                if view:
                    view.fitAll()
                ui_pause(0.4)
                continue

            if pid == "P_SIDES":
                dy_l = dy + t if p.get("leftTopExtend") else dy
                dy_r = dy + t if p.get("rightTopExtend") else dy
                if is_trap:
                    s_l = make_trapezoid_side(0.0, oy, z_rear_bot, z_rear_top, oz + dz, dy_l, t)
                    s_r = make_trapezoid_side(F - t, oy, z_rear_bot, z_rear_top, oz + dz, dy_r, t)
                else:
                    s_l = make_box(ox, oy, oz, dx, dy_l, dz)
                    s_r = make_box(F - t, oy, oz, dx, dy_r, dz)
                register("P_SIDE_LEFT", "mdf", apply_wa_cut(s_l), p, MDF_SIDE)
                if view:
                    view.fitAll()
                ui_pause(0.4)
                register("P_SIDE_RIGHT", "mdf", apply_wa_cut(s_r), dict(p, explodeDir=[1, 0, 0]), MDF_SIDE)
                if view:
                    view.fitAll()
                ui_pause(0.4)
                continue

            if pid == "P_MATRIX_V" and p.get("matrixMeta"):
                mm = p["matrixMeta"]
                cols_m, rows_m = max(2, int(mm.get("cols", 2))), max(1, int(mm.get("rows", 1)))
                z_fm, z_mm = D_ext - t, (z_rear_top + D_ext - t) / 2.0
                for k in range(1, cols_m):
                    xk = t + k * (A / cols_m) - t / 2.0
                    sh_v = make_trapezoid_side(xk, t, z_rear_bot, z_rear_top, z_fm, B, t) if is_trap else make_box(xk, t, t, t, B, z_fm - t)
                    if sh_v and rows_m > 1:
                        for j in range(1, rows_m):
                            yj = t + j * (B / rows_m) - t / 2.0
                            sh_v = sh_v.cut(make_box(xk - 1.0, yj, z_rear_bot - 1.0, t + 2.0, t, z_mm - (z_rear_bot - 1.0)))
                    register(f"P_MATRIX_V_{k}", "divider", apply_wa_cut(sh_v), p, DIV_COL)
                continue

            if pid == "P_MATRIX_H" and p.get("matrixMeta"):
                mm = p["matrixMeta"]
                cols_m, rows_m = max(1, int(mm.get("cols", 1))), max(2, int(mm.get("rows", 2)))
                z_fm, z_mm = D_ext - t, (z_rear_top + D_ext - t) / 2.0
                for j in range(1, rows_m):
                    yj = t + j * (B / rows_m) - t / 2.0
                    z_sh = z_rear_at_y(yj + t)
                    sh_h = make_box(t, yj, z_sh, A, t, max(10.0, z_fm - z_sh))
                    if sh_h and cols_m > 1:
                        for k in range(1, cols_m):
                            xk = t + k * (A / cols_m) - t / 2.0
                            sh_h = sh_h.cut(make_box(xk, yj - 1.0, z_mm, t, t + 2.0, (z_fm + 1.0) - z_mm))
                    register(f"P_MATRIX_H_{j}", "divider", apply_wa_cut(sh_h), p, DIV_COL)
                continue

            if pid == "P_WHEEL_ARCH" and wa_params:
                wa_K, wa_J, wa_H, wa_z0 = wa_params
                inner_box = make_box(t, t, t, A, B, D_ext - 2.0 * t)
                for sname, x_in, x_cut in [("P_WHEEL_ARCH_L", t, 0.0), ("P_WHEEL_ARCH_R", F - wa_K - t, F - wa_K)]:
                    cap = make_box(x_in, t, wa_z0 - t, wa_K, wa_J, wa_H + 2.0 * t).cut(make_box(x_cut, 0.0, wa_z0, wa_K, wa_J, wa_H))
                    if inner_box:
                        cap = cap.common(inner_box)
                    register(sname, "divider", cap, p, DIV_COL)
                continue

            if pid == "P_TOP":
                top_panels = [("P_TOP_L", float(p["topSplit"]["xLeft"])), ("P_TOP_R", float(p["topSplit"]["xRight"]))] if p.get("topSplit") else [(pid, ox)]
                for tname, tx0 in top_panels:
                    tsh = make_box(tx0, oy, oz, dx, dy, dz)
                    if tsh:
                        for c in cutouts:
                            if c.get("partId") == "P_TOP" and c.get("shape") == "round" and c.get("dia"):
                                cx = t + float(c["xInt"])
                                cz = (z_rear_top if is_trap else t) + float(c["yInt"])
                                if tx0 - 1.0 <= cx <= tx0 + dx + 1.0:
                                    tsh = tsh.cut(Part.makeCylinder(float(c["dia"]) / 2.0, dy + 4.0, pgs_vec(cx, oy - 2.0, cz), FreeCAD.Vector(0.0, 0.0, 1.0)))
                        register(tname, "mdf", tsh, p, MDF_MAIN, transp=55)
                continue

            if pid == "P_PLANAR_DIV" and p.get("splitByCenterDiv"):
                sp = p["splitByCenterDiv"]
                register("P_PLANAR_DIV_L", "divider", make_box(float(sp["xLeft"]), oy, oz, dx, dy, dz), p, DIV_COL)
                register("P_PLANAR_DIV_R", "divider", make_box(float(sp["xRight"]), oy, oz, dx, dy, dz), p, DIV_COL)
                continue

            if pid == "P_PLANAR_CHAMFER":
                pg = ac.get("planarGeom") or {}
                zl = float(pg.get("Z_leg") or 0.0)
                z_len = max(10.0, float(D_ext - oz))
                if p.get("dualPlanarTri"):
                    sub_a = (A - t) / 2.0
                    zl_sub = min(zl, sub_a * 0.28)
                    for s_idx, sx0 in enumerate([t, t + sub_a + t]):
                        for cname, cshape in make_planar_chamfer_walls(sx0, t, oz, sub_a, B, z_len, zl_sub, t):
                            register(f"{cname}_{s_idx + 1}", "divider", cshape, p, DIV_COL)
                else:
                    for cname, cshape in make_planar_chamfer_walls(t, t, oz, A, B, z_len, zl, t):
                        register(cname, "divider", cshape, p, DIV_COL)
                        ui_pause(0.25)
                if view:
                    view.fitAll()
                continue

            if kind == "batten":
                bm = p.get("braceMeta")
                if bm and bm.get("code"):
                    bcode = bm["code"]
                    cross_cut = make_box(cross_x0 - 0.05, t - 1.0, t - 1.0, t + 0.1, B + 2.0, D_ext) if has_cross_brace else None
                    tb_cut = make_box(tb_x0 - 0.05, t - 1.0, t - 1.0, 50.1, B + 2.0, D_ext) if has_tb_brace else None
                    sh_b = None
                    if bcode == "CROSS":
                        sh_b = make_window_brace(cross_x0, t, z_rear_bot, z_rear_top, D_ext - t, B, t, is_trap, float(bm.get("holeDiaMm") or 80.0))
                    elif bcode == "TB":
                        sh_b = make_trapezoid_batten(tb_x0, t, z_rear_bot, z_rear_top, 50.0, B, t) if is_trap else make_box(tb_x0, t, t, 50.0, B, t)
                    elif bcode == "LR":
                        sh_b = make_box(t, t + B * 0.5 - 25.0, (z_rear_top + D_ext - t) / 2.0 - t / 2.0, A, 50.0, t)
                        if sh_b and cross_cut:
                            sh_b = sh_b.cut(cross_cut)
                    elif bcode == "FF":
                        y_ff = t + 20.0
                        z_sff = z_rear_at_y(y_ff + t) + t
                        sh_b = make_box(t + A * 0.78 - 25.0, y_ff, z_sff, 50.0, t, max(20.0, (D_ext - t) - z_sff))
                    elif bcode == "BAFFLE":
                        sh_b = make_box(t, E - t - 50.0, D_ext - 2.0 * t, A, 50.0, t)
                        if sh_b and cross_cut:
                            sh_b = sh_b.cut(cross_cut)
                    elif bcode == "REAR":
                        y_r = t + B * 0.22 - 25.0
                        z_r = z_rear_at_y(y_r + 50.0) + t
                        sh_b = make_box(t, y_r, z_r, A, 50.0, t)
                        if sh_b and cross_cut:
                            sh_b = sh_b.cut(cross_cut)
                        if sh_b and tb_cut:
                            sh_b = sh_b.cut(tb_cut)
                    register(pid, "batten", apply_wa_cut(sh_b), p, BATTEN_COL)
                    if view:
                        view.fitAll()
                    ui_pause(0.25)
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
                    s_bat = make_trapezoid_batten(bx, t, z_rear_bot, z_rear_top, dx, B, t) if is_trap else make_box(bx, t, t, dx, min(dy, B), dz)
                    register(f"{pid}_{i + 1}", "batten", s_bat, p, BATTEN_COL)
                    ui_pause(0.2)
                if view:
                    view.fitAll()
                continue

            if kind == "port" and p.get("sharedCenterSlot"):
                sc = p["sharedCenterSlot"]
                register(f"{pid}_L", "port", make_box(float(sc["xLeft"]), oy, oz, dx, dy, dz), p, PORT_COL)
                register(f"{pid}_R", "port", make_box(float(sc["xRight"]), oy, oz, dx, dy, dz), p, PORT_COL)
                if view:
                    view.fitAll()
                continue

            if kind == "port" and p.get("bpTopRound"):
                r_out = dx / 2.0
                wall = max(1.5, float(p.get("thickness", 1.5)))
                is_rear = (pid == "P_PORT_REAR")
                top_holes = [c for c in cutouts if c.get("kind") == "port" and c.get("shape") == "round" and c.get("partId") == "P_TOP" and (("Traseir" in c.get("label", "")) == is_rear)]
                if not top_holes and not is_rear:
                    top_holes = [c for c in cutouts if c.get("kind") == "port" and c.get("shape") == "round" and c.get("partId") == "P_TOP"]
                for idx, ch in enumerate(top_holes):
                    cx = t + float(ch["xInt"])
                    cz = (z_rear_top if is_trap else t) + float(ch["yInt"])
                    lv = min(B - 20.0, float(ch.get("lvMm") or dy))
                    y_start = max(t, E - t - lv)
                    register(f"{pid}_{idx + 1}", "port", make_tube(cx, y_start, cz, r_out, r_out - wall, lv, FreeCAD.Vector(0.0, 0.0, 1.0)), p, PORT_COL)
                continue

            if kind == "port" and p.get("splitByCenterDiv"):
                sp = p["splitByCenterDiv"]
                register("P_PORT_SLOT_L", "port", make_box(float(sp["xLeft"]), oy, oz, dx, dy, dz), p, PORT_COL)
                register("P_PORT_SLOT_R", "port", make_box(float(sp["xRight"]), oy, oz, dx, dy, dz), p, PORT_COL)
                if view:
                    view.fitAll()
                continue

            if kind == "port" and p.get("triMeta"):
                tm = p["triMeta"]
                for wname, wshape in make_br_triangle_port_walls(
                    t, t, D_ext - t, A, B,
                    float(tm.get("lvMm") or dz),
                    float(tm.get("triA") or 140.0),
                    float(tm.get("triB") or 140.0),
                    t,
                    tm.get("corners") or list(range(int(tm.get("count") or 2))),
                ):
                    register(wname, "port", wshape, p, PORT_COL)
                    ui_pause(0.25)
                if view:
                    view.fitAll()
                continue

            if pid == "P_PORT_SERIES":
                r_out = dy / 2.0
                wall = max(1.5, float(p.get("thickness", 1.5)))
                bp_c = ac.get("bpChambers") or {}
                div_x = (t + float(bp_c["A_rear_side"])) if (bp_c.get("dualDiv") and bp_c.get("A_rear_side")) else ((t + float(bp_c["A_rear"])) if bp_c.get("A_rear") else (F / 2.0 - t / 2.0))
                ser_holes = [c for c in cutouts if c.get("partId") in ("P_BP_DIVIDER", "P_BP_DIVIDER_1") and c.get("kind") == "port"]
                for idx, ch in enumerate(ser_holes):
                    cz = (z_rear_top if is_trap else t) + float(ch["xInt"])
                    cy = t + float(ch["yInt"])
                    lv = float(ch.get("lvMm") or dx)
                    x_start = max(t, div_x - lv)
                    register(f"{pid}_{idx + 1}", "port", make_tube(x_start, cy, cz, r_out, r_out - wall, max(5.0, div_x - x_start), FreeCAD.Vector(1.0, 0.0, 0.0)), p, PORT_COL)
                    ui_pause(0.35)
                if view:
                    view.fitAll()
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
                for idx, ch in enumerate(port_holes):
                    cx = t + float(ch["xInt"])
                    cy = t + float(ch["yInt"])
                    lv = float(ch.get("lvMm") or dz)
                    z_start = max(t, D_ext - t - lv)
                    register(f"{pid}_{idx + 1}", "port", make_tube(cx, cy, z_start, r_out, r_out - wall, lv), p, PORT_COL)
                    ui_pause(0.35)
                if view:
                    view.fitAll()
                continue

            if pid in ("P_BP_DIVIDER", "P_BP_DIVIDER_1", "P_BP_DIVIDER_2", "P_CENTER_DIV"):
                div_sh = make_trapezoid_side(ox, oy, z_rear_bot, z_rear_top, oz + dz, dy, t) if is_trap else make_box(ox, oy, oz, dx, dy, dz)
                div_obj = register(pid, "divider", div_sh, p, DIV_COL)
                if view:
                    view.fitAll()
                ui_pause(0.45)
                if div_obj is not None:
                    cur_shape = div_obj.Shape
                    for c in cutouts:
                        if c.get("partId") == pid and c.get("dia"):
                            r = float(c["dia"]) / 2.0
                            cz = (z_rear_top if is_trap else t) + float(c["xInt"])
                            cy = t + float(c["yInt"])
                            cyl = Part.makeCylinder(r, dx + 4.0, pgs_vec(ox - 2.0, cy, cz), FreeCAD.Vector(1.0, 0.0, 0.0))
                            cur_shape = cur_shape.cut(cyl)
                            div_obj.Shape = cur_shape
                            doc.recompute()
                            ui_pause(0.45)
                continue

            if pid == "P_FRONT_BAFFLE":
                panels = [("P_FRONT_BAFFLE_L", float(p["frontSplit"]["xLeft"])), ("P_FRONT_BAFFLE_R", float(p["frontSplit"]["xRight"]))] if p.get("frontSplit") else [(pid, ox)]
                for pname, px0 in panels:
                    baffle_obj = register(pname, "mdf", make_box(px0, oy, oz, dx, dy, dz), p, MDF_FRONT)
                    if view:
                        view.fitAll()
                    ui_pause(0.45)
                    if baffle_obj is not None:
                        cur_shape = baffle_obj.Shape
                        pg = ac.get("planarGeom")
                        if pg and pg.get("style") == "triangle" and pg.get("Z_leg"):
                            zl = float(pg["Z_leg"])
                            for tri in [
                                [(px0 - 1, oy - 1), (px0 + zl, oy - 1), (px0 - 1, oy + zl)],
                                [(px0 + dx + 1, oy - 1), (px0 + dx - zl, oy - 1), (px0 + dx + 1, oy + zl)],
                                [(px0 - 1, oy + dy + 1), (px0 + zl, oy + dy + 1), (px0 - 1, oy + dy - zl)],
                                [(px0 + dx + 1, oy + dy + 1), (px0 + dx - zl, oy + dy + 1), (px0 + dx + 1, oy + dy - zl)],
                            ]:
                                pts = [pgs_vec(x, y, oz - 2.0) for (x, y) in tri]
                                pts.append(pts[0])
                                prism = Part.Face(Part.makePolygon(pts)).extrude(FreeCAD.Vector(0.0, dz + 4.0, 0.0))
                                cur_shape = cur_shape.cut(prism)
                            baffle_obj.Shape = cur_shape
                            doc.recompute()
                            ui_pause(0.35)
                        for c in cutouts:
                            if c.get("partId") != "P_FRONT_BAFFLE":
                                continue
                            cx = t + float(c["xInt"])
                            cy = t + float(c["yInt"])
                            if p.get("frontSplit") and (cx < px0 - 1.0 or cx > px0 + dx + 1.0):
                                continue
                            if c["shape"] == "round" and c.get("dia"):
                                r = float(c["dia"]) / 2.0
                                cyl = Part.makeCylinder(r, dz + 4.0, pgs_vec(cx, cy, oz - 2.0), FreeCAD.Vector(0.0, 1.0, 0.0))
                                cur_shape = cur_shape.cut(cyl)
                            elif c["shape"] == "slot" and c.get("w") and c.get("h") and not p.get("frontSplit"):
                                sb = make_box(cx - float(c["w"]) / 2.0, cy - float(c["h"]) / 2.0, oz - 2.0, float(c["w"]), float(c["h"]), dz + 4.0)
                                if sb:
                                    cur_shape = cur_shape.cut(sb)
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
                                    pts = [pgs_vec(px, py, oz - 2.0) for (px, py) in tri_corners[int(cidx) % 4]]
                                else:
                                    pts = [
                                        pgs_vec(cx - ta / 3.0, cy - tb / 3.0, oz - 2.0),
                                        pgs_vec(cx + 2.0 * ta / 3.0, cy - tb / 3.0, oz - 2.0),
                                        pgs_vec(cx - ta / 3.0, cy + 2.0 * tb / 3.0, oz - 2.0),
                                    ]
                                pts.append(pts[0])
                                cur_shape = cur_shape.cut(Part.Face(Part.makePolygon(pts)).extrude(FreeCAD.Vector(0.0, dz + 4.0, 0.0)))
                            baffle_obj.Shape = cur_shape
                            doc.recompute()
                            ui_pause(0.35)
                continue

            if pid == "P_TOP":
                tpanels = [("P_TOP_L", float(p["topSplit"]["xLeft"])), ("P_TOP_R", float(p["topSplit"]["xRight"]))] if p.get("topSplit") else [(pid, ox)]
                for tn, tx0 in tpanels:
                    top_sh = make_box(tx0, oy, oz, dx, dy, dz)
                    for c in cutouts:
                        if top_sh and c.get("partId") == "P_TOP" and c.get("shape") == "round" and c.get("dia"):
                            cx = t + float(c["xInt"])
                            cz = (z_rear_top if is_trap else t) + float(c["yInt"])
                            if tx0 - 1.0 <= cx <= tx0 + dx + 1.0:
                                top_sh = top_sh.cut(Part.makeCylinder(float(c["dia"]) / 2.0, dy + 4.0, pgs_vec(cx, oy - 2.0, cz), FreeCAD.Vector(0.0, 0.0, 1.0)))
                    register(tn, "mdf", top_sh, p, MDF_MAIN, transp=55)
                if view:
                    view.fitAll()
                ui_pause(0.5)
                continue

            col = DIV_COL if kind == "divider" else (PORT_COL if kind == "port" else MDF_MAIN)
            register(pid, kind, make_box(ox, oy, oz, dx, dy, dz), p, col)
            if view:
                view.fitAll()
            ui_pause(0.4)

        # Auditoria booleana 3D real no kernel OpenCASCADE (antes de explodir)
        collisions = []
        for i in range(len(built)):
            n1, k1, o1, _, _ = built[i]
            s1 = o1.Shape
            bb1 = s1.BoundBox
            for j in range(i + 1, len(built)):
                n2, k2, o2, _, _ = built[j]
                s2 = o2.Shape
                if not bb1.intersect(s2.BoundBox):
                    continue
                try:
                    vol_mm3 = float(s1.common(s2).Volume)
                    if vol_mm3 > 5.0:
                        collisions.append((n1, n2, round(vol_mm3 / 1000.0, 2)))
                except Exception:
                    pass
        mdf_kg = round(sum(o.Shape.Volume for (_, k, o, _, _) in built if k in ("mdf", "divider", "batten")) / 1e9 * 750.0, 2)
        log(f"Auditoria OpenCASCADE: {len(built)} solidos | MDF real: {mdf_kg} kg | Colisoes 3D: {len(collisions)}")
        for c1, c2, v in collisions:
            log(f"  [COLISAO] {c1} x {c2} = {v} cm3")

        # Organiza pecas em Grupos + Planilhas Nativas (Manual FreeCAD p. 34-35 & p. 133-140)
        try:
            grp_map = {
                "mdf": doc.addObject("App::DocumentObjectGroup", "01_Estrutura_MDF"),
                "divider": doc.addObject("App::DocumentObjectGroup", "02_Divisorias"),
                "port": doc.addObject("App::DocumentObjectGroup", "03_Dutos"),
                "batten": doc.addObject("App::DocumentObjectGroup", "04_Travamentos"),
            }
            for (_, k_g, o_g, _, _) in built:
                grp_map.get(k_g, grp_map["mdf"]).addObject(o_g)
            for gk, gobj in list(grp_map.items()):
                if not gobj.Group:
                    doc.removeObject(gobj.Name)

            sp_p = doc.addObject("Spreadsheet::Sheet", "Parametros_Acusticos")
            sp_p.set("A1", "Parametro"); sp_p.set("B1", "Valor"); sp_p.set("C1", "Unidade")
            dr_meta = pack.get("driver") or {}
            sp_rows = [
                ("Driver", str(dr_meta.get("name") or "Driver"), "-", None),
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
                ("Colisoes_3D_OCCT", len(collisions), "un", None),
            ]
            for idx_r, (lbl, val, unit, alias) in enumerate(sp_rows, start=2):
                sp_p.set(f"A{idx_r}", lbl); sp_p.set(f"B{idx_r}", str(val)); sp_p.set(f"C{idx_r}", unit)
                if alias:
                    try:
                        sp_p.setAlias(f"B{idx_r}", alias)
                    except Exception:
                        pass

            sp_bom = doc.addObject("Spreadsheet::Sheet", "Lista_de_Corte_BOM")
            for cell, htxt in [("A1", "Peca"), ("B1", "Categoria"), ("C1", "BBox_X_mm"), ("D1", "BBox_Y_mm"), ("E1", "BBox_Z_mm"), ("F1", "Volume_cm3"), ("G1", "Massa_MDF_kg")]:
                sp_bom.set(cell, htxt)
            for idx_b, (n_b, k_b, o_b, _, _) in enumerate(built, start=2):
                bb = o_b.Shape.BoundBox
                vol_cm3 = round(float(o_b.Shape.Volume) / 1000.0, 1)
                mass_kg = round((float(o_b.Shape.Volume) / 1e9) * 750.0, 2) if k_b in ("mdf", "divider", "batten") else 0.0
                sp_bom.set(f"A{idx_b}", n_b); sp_bom.set(f"B{idx_b}", k_b)
                sp_bom.set(f"C{idx_b}", str(round(bb.XLength, 1))); sp_bom.set(f"D{idx_b}", str(round(bb.YLength, 1))); sp_bom.set(f"E{idx_b}", str(round(bb.ZLength, 1)))
                sp_bom.set(f"F{idx_b}", str(vol_cm3)); sp_bom.set(f"G{idx_b}", str(mass_kg))
            # Metadados de explosao no proprio objeto para controle ao vivo no BassForge Studio
            for (_, _, o_m, ed_m, dist_m) in built:
                try:
                    if not hasattr(o_m, "BF_ExplodeVec"):
                        o_m.addProperty("App::PropertyVector", "BF_ExplodeVec", "BassForge", "Vetor de explosao 3D (mm)")
                    o_m.BF_ExplodeVec = pgs_vec(ed_m[0] * dist_m, ed_m[1] * dist_m, ed_m[2] * dist_m)
                except Exception:
                    pass
            doc.recompute()
        except Exception as se:
            log("Aviso grupos/planilhas: " + str(se))

        # Animacao suave para Vista Explodida 3D se solicitado
        if explode_target > 0.01:
            steps = 12 if HAS_GUI else 1
            for st in range(1, steps + 1):
                frac = (st / float(steps)) * explode_target
                for (_, _, obj, ed, dist) in built:
                    obj.Placement.Base = pgs_vec(ed[0] * dist * frac, ed[1] * dist * frac, ed[2] * dist * frac)
                doc.recompute()
                if view:
                    view.fitAll()
                ui_pause(0.06)

        os.makedirs(os.path.dirname(out_fcstd), exist_ok=True)
        doc.saveAs(out_fcstd)
        try:
            Part.export([o for (_, _, o, _, _) in built], out_step)
        except Exception:
            pass
        log("Salvo com sucesso: " + out_fcstd)

        if HAS_GUI and view is not None:
            try:
                from pivy import coin
                cam = view.getCameraNode()
                center = coin.SbVec3f(F / 2.0, D_ext / 2.0, E / 2.0)
                radius = max(F, E, D_ext) * (2.6 if explode_target > 0.01 else 2.1)
                for step in range(48):
                    ang = math.radians(-35 + step * 7.5)
                    cam.position.setValue(
                        center[0] + radius * math.cos(ang),
                        center[1] + radius * math.sin(ang),
                        center[2] + radius * 0.45,
                    )
                    cam.pointAt(center, coin.SbVec3f(0, 0, 1))
                    ui_pause(0.04)
            except Exception as ce:
                log("Aviso orbita: " + str(ce))
            view.viewIsometric()
            view.fitAll()
        else:
            FreeCAD.closeDocument(doc.Name)

        log("Live Build concluido!")
    except Exception:
        log("ERRO:\n" + traceback.format_exc())
        raise


if HAS_GUI and QtCore is not None:
    QtCore.QTimer.singleShot(500, run_live_build)
else:
    run_live_build()
