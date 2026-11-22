"""
BassForge SUITE — Construcao AO VIVO no FreeCAD 1.1 GUI (Qt6 / PySide6)
"""
import json
import math
import os
import time
import traceback
import FreeCAD
import FreeCADGui
import Part

try:
    from PySide6 import QtCore
except ImportError:
    try:
        from PySide2 import QtCore
    except ImportError:
        from PySide import QtCore

LOG_PATH = r"C:\Users\Dinalli\Desktop\Projetos acusticos\BassForge_CAD_Biblioteca\06_BuildPacks_JSON\live_build.log"


def log(msg):
    with open(LOG_PATH, "a", encoding="utf-8") as lf:
        lf.write(f"[{time.strftime('%H:%M:%S')}] {msg}\n")
    FreeCAD.Console.PrintMessage(msg + "\n")


def ui_pause(sec=0.55):
    end = time.time() + sec
    while time.time() < end:
        QtCore.QCoreApplication.processEvents()
        time.sleep(0.02)


def pgs_vec(px, py, pz):
    return FreeCAD.Vector(float(px), float(pz), float(py))


def make_box(x0, y0, z0, dx, dy, dz):
    return Part.makeBox(float(dx), float(dz), float(dy), pgs_vec(x0, y0, z0))


def make_tube(cx, cy, z0, r_out, r_in, length):
    axis = FreeCAD.Vector(0.0, 1.0, 0.0)
    outer = Part.makeCylinder(float(r_out), float(length), pgs_vec(cx, cy, z0), axis)
    inner = Part.makeCylinder(max(1.0, float(r_in)), float(length) + 2.0, pgs_vec(cx, cy, z0 - 1.0), axis)
    return outer.cut(inner)


def add_colored(doc, name, shape, rgb, transparency=0):
    obj = doc.addObject("Part::Feature", name)
    obj.Shape = shape
    doc.recompute()
    if hasattr(obj, "ViewObject") and obj.ViewObject:
        try:
            obj.ViewObject.ShapeColor = rgb
            obj.ViewObject.Transparency = int(transparency)
            obj.ViewObject.LineWidth = 1.5
        except Exception:
            pass
    return obj


def run_live_build():
    try:
        log("Iniciando BassForge Live Build no FreeCAD 1.1...")
        json_path = os.environ.get(
            "BF_LIVE_JSON",
            r"C:\Users\Dinalli\Desktop\Projetos acusticos\BassForge_CAD_Biblioteca\06_BuildPacks_JSON\02_dutada_redonda.json",
        )
        out_fcstd = os.environ.get(
            "BF_LIVE_OUT",
            r"C:\Users\Dinalli\Desktop\Projetos acusticos\BassForge_CAD_Biblioteca\01_FreeCAD_FCStd\02_dutada_redonda_LIVE.FCStd",
        )
        with open(json_path, "r", encoding="utf-8") as f:
            pack = json.load(f)

        geom = pack["geometry"]
        env = geom["envelope"]
        t = float(geom["material"]["thickness"])
        F = float(env["F"])
        A = float(env["A"])
        B = float(env["B"])
        D_ext = float(env["D_ext"])
        parts = geom["parts"]
        cutouts = geom["cutouts"]

        doc = FreeCAD.newDocument("BassForge_AoVivo")
        FreeCADGui.activateWorkbench("PartWorkbench")
        view = FreeCADGui.ActiveDocument.ActiveView
        view.viewIsometric()
        ui_pause(0.6)

        MDF_MAIN = (0.82, 0.67, 0.46)
        MDF_SIDE = (0.76, 0.60, 0.40)
        MDF_FRONT = (0.86, 0.72, 0.52)
        BATTEN_COL = (0.28, 0.56, 0.90)
        PORT_COL = (0.95, 0.45, 0.14)
        DIV_COL = (0.58, 0.36, 0.88)

        ordered = sorted(parts, key=lambda p: p.get("assemblyOrder", 5))

        for p in ordered:
            pid = p["id"]
            kind = p["kind"]
            ox, oy, oz = p["origin"]
            dx, dy, dz = p["size"]

            if pid == "P_SIDES":
                add_colored(doc, "P_SIDE_LEFT", make_box(ox, oy, oz, dx, dy, dz), MDF_SIDE)
                view.fitAll()
                ui_pause(0.5)
                add_colored(doc, "P_SIDE_RIGHT", make_box(F - t, oy, oz, dx, dy, dz), MDF_SIDE)
                view.fitAll()
                ui_pause(0.5)
                continue

            if kind == "batten":
                qty = max(1, int(p.get("qty", 1)))
                for i in range(qty):
                    bx = t + ((i + 1) / (qty + 1)) * A - dx / 2.0
                    add_colored(doc, f"{pid}_{i + 1}", make_box(bx, t, t + 0.5, dx, min(dy, B), dz), BATTEN_COL)
                    ui_pause(0.28)
                view.fitAll()
                continue

            if kind == "port" and float(p.get("area", 0)) <= 0.0:
                r_out = dx / 2.0
                wall = max(1.5, float(p.get("thickness", 1.5)))
                port_holes = [c for c in cutouts if c.get("kind") == "port" and c.get("shape") == "round"]
                for idx, ch in enumerate(port_holes):
                    cx = t + float(ch["xInt"])
                    cy = t + float(ch["yInt"])
                    lv = float(ch.get("lvMm") or dz)
                    z_start = max(t, D_ext - t - lv)
                    add_colored(doc, f"{pid}_{idx + 1}", make_tube(cx, cy, z_start, r_out, r_out - wall, lv), PORT_COL)
                    ui_pause(0.45)
                view.fitAll()
                continue

            if pid == "P_FRONT_BAFFLE":
                baffle_obj = add_colored(doc, pid, make_box(ox, oy, oz, dx, dy, dz), MDF_FRONT)
                view.fitAll()
                ui_pause(0.7)
                cur_shape = baffle_obj.Shape
                for c in cutouts:
                    if c.get("partId") != "P_FRONT_BAFFLE":
                        continue
                    cx = t + float(c["xInt"])
                    cy = t + float(c["yInt"])
                    if c["shape"] == "round" and c.get("dia"):
                        r = float(c["dia"]) / 2.0
                        cyl = Part.makeCylinder(r, dz + 4.0, pgs_vec(cx, cy, oz - 2.0), FreeCAD.Vector(0.0, 1.0, 0.0))
                        cur_shape = cur_shape.cut(cyl)
                        baffle_obj.Shape = cur_shape
                        doc.recompute()
                        ui_pause(0.55)
                continue

            if pid == "P_TOP":
                add_colored(doc, pid, make_box(ox, oy, oz, dx, dy, dz), MDF_MAIN, transparency=55)
                view.fitAll()
                ui_pause(0.6)
                continue

            col = DIV_COL if kind == "divider" else (PORT_COL if kind == "port" else MDF_MAIN)
            add_colored(doc, pid, make_box(ox, oy, oz, dx, dy, dz), col)
            view.fitAll()
            ui_pause(0.5)

        doc.saveAs(out_fcstd)
        log("Salvo com sucesso: " + out_fcstd)

        try:
            from pivy import coin
            cam = view.getCameraNode()
            center = coin.SbVec3f(F / 2.0, D_ext / 2.0, float(env["E"]) / 2.0)
            radius = max(F, float(env["E"]), D_ext) * 2.1
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
        log("Live Build concluido!")
    except Exception:
        log("ERRO:\n" + traceback.format_exc())


QtCore.QTimer.singleShot(800, run_live_build)
