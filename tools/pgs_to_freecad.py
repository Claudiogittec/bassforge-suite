"""
BassForge SUITE — PGS (bassforge-pgs/v1) -> FreeCAD 1.1 B-Rep 3D Builder & Boolean Auditor
Executar via:
  "C:\Program Files\FreeCAD 1.1\bin\freecadcmd.exe" pgs_to_freecad.py <input_buildpack.json> <output_dir>
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


def make_hollow_cylinder_pgs(cx, cy, z0, r_outer, r_inner, length):
    if r_outer <= 0.1 or length <= 0.1:
        return None
    base = pgs_to_cad_vec(cx, cy, z0)
    axis = FreeCAD.Vector(0.0, 1.0, 0.0)  # eixo +Y no CAD = +Z no PGS (profundidade)
    outer = Part.makeCylinder(float(r_outer), float(length), base, axis)
    ri = max(0.5, min(float(r_outer) - 0.5, float(r_inner)))
    inner = Part.makeCylinder(ri, float(length) + 2.0, pgs_to_cad_vec(cx, cy, z0 - 1.0), axis)
    return outer.cut(inner)


def build_freecad_from_buildpack(json_path, out_dir):
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
    C_med = 0.5 * (float(env.get("C", 300.0)) + float(env.get("D", 300.0)))

    base_name = os.path.splitext(os.path.basename(json_path))[0]
    doc = FreeCAD.newDocument(base_name)

    solids = []  # lista de (name, kind, shape)
    parts = geom.get("parts") or []
    cutouts = geom.get("cutouts") or []

    # 1. Constroi cada solido B-Rep real a partir de pack.geometry.parts
    for p in parts:
        pid = p["id"]
        kind = p["kind"]
        ox, oy, oz = p["origin"]
        dx, dy, dz = p["size"]

        if pid == "P_SIDES":
            s_left = make_box_pgs(ox, oy, oz, dx, dy, dz)
            s_right = make_box_pgs(F - t, oy, oz, dx, dy, dz)
            if s_left:
                solids.append(("P_SIDE_LEFT", "mdf", s_left))
            if s_right:
                solids.append(("P_SIDE_RIGHT", "mdf", s_right))
            continue

        if pid == "P_FRONT_BAFFLE":
            shape = make_box_pgs(ox, oy, oz, dx, dy, dz)
            if not shape:
                continue
            # Chanfros 45 deg nos 4 cantos se Planar Triangulo
            pg = ac.get("planarGeom")
            if pg and pg.get("style") == "triangle" and pg.get("Z_leg"):
                zl = float(pg["Z_leg"])
                corners = [
                    [(ox - 1, oy - 1), (ox + zl, oy - 1), (ox - 1, oy + zl)],
                    [(ox + dx + 1, oy - 1), (ox + dx - zl, oy - 1), (ox + dx + 1, oy + zl)],
                    [(ox - 1, oy + dy + 1), (ox + zl, oy + dy + 1), (ox - 1, oy + dy - zl)],
                    [(ox + dx + 1, oy + dy + 1), (ox + dx - zl, oy + dy + 1), (ox + dx + 1, oy + dy - zl)],
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
                if c["shape"] == "round" and c.get("dia"):
                    r = float(c["dia"]) / 2.0
                    cyl = Part.makeCylinder(r, dz + 4.0, pgs_to_cad_vec(cx, cy, oz - 2.0), FreeCAD.Vector(0.0, 1.0, 0.0))
                    shape = shape.cut(cyl)
                elif c["shape"] == "slot" and c.get("w") and c.get("h"):
                    sw, sh = float(c["w"]), float(c["h"])
                    slot_box = make_box_pgs(cx - sw / 2.0, cy - sh / 2.0, oz - 2.0, sw, sh, dz + 4.0)
                    if slot_box:
                        shape = shape.cut(slot_box)
            solids.append((pid, "mdf", shape))
            continue

        if pid == "P_BP_DIVIDER":
            shape = make_box_pgs(ox, oy, oz, dx, dy, dz)
            if shape:
                # Furo booleano real do driver na divisoria interna BP4/BP6 (eixo X)
                for c in cutouts:
                    if c.get("partId") == "P_BP_DIVIDER" and c.get("dia"):
                        r = float(c["dia"]) / 2.0
                        cz = t + float(c["xInt"])
                        cy = t + float(c["yInt"])
                        cyl = Part.makeCylinder(r, dx + 4.0, pgs_to_cad_vec(ox - 2.0, cy, cz), FreeCAD.Vector(1.0, 0.0, 0.0))
                        shape = shape.cut(cyl)
                solids.append((pid, "divider", shape))
            continue

        if kind == "port" and float(p.get("area", 0)) <= 0.0:
            # Tubo PVC vazado real alinhado exatamente com cada furo de duto redondo
            r_out = dx / 2.0
            wall = max(1.5, float(p.get("thickness", 1.5)))
            port_holes = [c for c in cutouts if c.get("kind") == "port" and c.get("shape") == "round"]
            if port_holes:
                for idx, ch in enumerate(port_holes):
                    cx = t + float(ch["xInt"])
                    cy = t + float(ch["yInt"])
                    lv = float(ch.get("lvMm") or dz)
                    z_start = max(t, D_ext - t - lv)
                    tube = make_hollow_cylinder_pgs(cx, cy, z_start, r_out, r_out - wall, lv)
                    if tube:
                        solids.append((f"{pid}_{idx + 1}", "port", tube))
            else:
                tube = make_hollow_cylinder_pgs(ox + r_out, oy + r_out, oz, r_out, r_out - wall, dz)
                if tube:
                    solids.append((pid, "port", tube))
            continue

        if kind == "batten":
            # Posiciona sarrafos encostados na face interna da parede traseira (desviando da divisoria BP se houver)
            qty = max(1, int(p.get("qty", 1)))
            bp_div_x = None
            if ac.get("bpChambers") and ac["bpChambers"].get("A_rear"):
                bp_div_x = t + float(ac["bpChambers"]["A_rear"])
            for i in range(qty):
                bx = t + ((i + 1) / (qty + 1)) * A - dx / 2.0
                if bp_div_x is not None and abs((bx + dx / 2.0) - (bp_div_x + t / 2.0)) < (dx / 2.0 + t + 10.0):
                    bx = bp_div_x - dx - 20.0 if bx < bp_div_x else bp_div_x + t + 20.0
                s_bat = make_box_pgs(bx, t, t + 0.5, dx, min(dy, B), dz)
                if s_bat:
                    solids.append((f"{pid}_{i + 1}", "batten", s_bat))
            continue

        shape = make_box_pgs(ox, oy, oz, dx, dy, dz)
        if shape:
            solids.append((pid, kind, shape))

    # 2. Adiciona ao documento FreeCAD
    for name, kind, shape in solids:
        obj = doc.addObject("Part::Feature", name)
        obj.Shape = shape

    doc.recompute()

    # 3. Auditoria Booleana 3D real no kernel OpenCASCADE (colisao par-a-par > 5 mm3)
    collisions = []
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

    os.makedirs(out_dir, exist_ok=True)
    fcstd_path = os.path.join(out_dir, f"{base_name}.FCStd")
    step_path = os.path.join(out_dir, f"{base_name}.step")
    report_path = os.path.join(out_dir, f"{base_name}_audit.json")

    doc.saveAs(fcstd_path)
    Part.export([doc.getObject(n) for (n, _, _) in solids], step_path)

    report = {
        "project": base_name,
        "driver": dr.get("name"),
        "topology": ac.get("boxType"),
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


if os.environ.get("BF_JSON") and os.environ.get("BF_OUT"):
    build_freecad_from_buildpack(os.environ["BF_JSON"], os.environ["BF_OUT"])
elif __name__ == "__main__":
    args = [a for a in sys.argv[1:] if not a.endswith(".py")]
    if len(args) < 2:
        print("Uso: BF_JSON=in.json BF_OUT=dir freecadcmd.exe pgs_to_freecad.py")
        sys.exit(1)
    build_freecad_from_buildpack(args[0], args[1])
