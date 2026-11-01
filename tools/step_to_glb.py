#!/usr/bin/env python3
"""
STEP -> glTF-Binary (.glb) prevodnik pro room-viewer.

Primarni cesta pouziva OCCT XCAF (STEPCAFControl_Reader + RWGltf_CafWriter),
ktera zachova barvy a nazvy dilu ze STEPu. Kdyz selze, pouzije se jednodussi
cesta pres cadquery.Assembly.save().

Geometrie se zapisuje v puvodnich souradnicich a jednotkach STEPu
(typicky milimetry, Z nahoru). Prevod na metry a Y-nahoru resi az viewer
v prohlizeci, aby se dal prepnout bez noveho buildu.

Pouziti:
    python tools/step_to_glb.py model/room.step web/model/room.glb
    python tools/step_to_glb.py model/room.step web/model/room.glb --tolerance 0.3
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path


def log(msg: str) -> None:
    print(f"[step_to_glb] {msg}", flush=True)


# --------------------------------------------------------------------------
# Primarni cesta: OCCT XCAF (barvy + nazvy dilu)
# --------------------------------------------------------------------------
def convert_xcaf(src: Path, dst: Path, lin_tol: float, ang_tol: float) -> None:
    from OCP.BRepMesh import BRepMesh_IncrementalMesh
    from OCP.IFSelect import IFSelect_ReturnStatus
    from OCP.Message import Message_ProgressRange
    from OCP.RWGltf import RWGltf_CafWriter
    from OCP.STEPCAFControl import STEPCAFControl_Reader
    from OCP.TCollection import TCollection_AsciiString, TCollection_ExtendedString
    from OCP.TColStd import TColStd_IndexedDataMapOfStringString
    from OCP.TDF import TDF_LabelSequence
    from OCP.TDocStd import TDocStd_Document
    from OCP.XCAFApp import XCAFApp_Application
    from OCP.XCAFDoc import XCAFDoc_DocumentTool

    app = XCAFApp_Application.GetApplication_s()
    doc = TDocStd_Document(TCollection_ExtendedString("MDTV-CAF"))
    app.NewDocument_s(TCollection_ExtendedString("MDTV-CAF"), doc)

    reader = STEPCAFControl_Reader()
    reader.SetColorMode(True)
    reader.SetNameMode(True)
    reader.SetLayerMode(True)

    status = reader.ReadFile(str(src))
    if status != IFSelect_ReturnStatus.IFSelect_RetDone:
        raise RuntimeError(f"STEP se nepodarilo nacist (status {status})")

    if not reader.Transfer(doc):
        raise RuntimeError("Prenos STEPu do XCAF dokumentu selhal")

    shape_tool = XCAFDoc_DocumentTool.ShapeTool_s(doc.Main())
    labels = TDF_LabelSequence()
    shape_tool.GetFreeShapes(labels)
    count = labels.Length()
    if count == 0:
        raise RuntimeError("STEP neobsahuje zadnou geometrii")
    log(f"XCAF: {count} korenovych tvaru, trianguluji (lin={lin_tol}, ang={ang_tol})")

    for i in range(1, count + 1):
        shape = shape_tool.GetShape_s(labels.Value(i))
        BRepMesh_IncrementalMesh(shape, lin_tol, False, ang_tol, True)

    writer = RWGltf_CafWriter(TCollection_AsciiString(str(dst)), True)  # True = binarni .glb
    ok = writer.Perform(doc, TColStd_IndexedDataMapOfStringString(), Message_ProgressRange())
    if not ok:
        raise RuntimeError("RWGltf_CafWriter zapis selhal")


# --------------------------------------------------------------------------
# Zalozni cesta: cadquery (bez barev, jeden slouceny dil)
# --------------------------------------------------------------------------
def convert_cadquery(src: Path, dst: Path, lin_tol: float, ang_tol: float) -> None:
    import cadquery as cq

    shape = cq.importers.importStep(str(src))
    assy = cq.Assembly(shape.val(), name=src.stem, color=cq.Color(0.78, 0.79, 0.82))
    assy.save(str(dst), exportType="GLTF", tolerance=lin_tol, angularTolerance=ang_tol)


def main() -> int:
    ap = argparse.ArgumentParser(description="Prevede STEP na .glb pro web viewer")
    ap.add_argument("source", type=Path, help="vstupni .step / .stp soubor")
    ap.add_argument("target", type=Path, help="vystupni .glb soubor")
    ap.add_argument(
        "--tolerance",
        type=float,
        default=0.5,
        help="linearni tolerance triangulace v jednotkach STEPu (mm); vetsi = mensi soubor",
    )
    ap.add_argument(
        "--angular-tolerance",
        type=float,
        default=0.35,
        help="uhlova tolerance triangulace v radianech",
    )
    ap.add_argument(
        "--simple",
        action="store_true",
        help="preskoci XCAF cestu a rovnou pouzije cadquery (bez barev)",
    )
    args = ap.parse_args()

    src: Path = args.source
    dst: Path = args.target

    if not src.is_file():
        log(f"CHYBA: vstupni soubor neexistuje: {src}")
        return 1

    dst.parent.mkdir(parents=True, exist_ok=True)
    started = time.time()
    log(f"vstup:  {src}  ({src.stat().st_size / 1024:.0f} kB)")

    errors: list[str] = []
    if not args.simple:
        try:
            convert_xcaf(src, dst, args.tolerance, args.angular_tolerance)
        except Exception as exc:  # noqa: BLE001 - zalozni cesta je zamer
            errors.append(f"XCAF: {exc}")
            log(f"XCAF cesta selhala ({exc}), zkousim cadquery...")

    if not dst.is_file():
        try:
            convert_cadquery(src, dst, args.tolerance, args.angular_tolerance)
        except Exception as exc:  # noqa: BLE001
            errors.append(f"cadquery: {exc}")

    if not dst.is_file():
        log("CHYBA: prevod se nezdaril ani jednou cestou:")
        for err in errors:
            log(f"  - {err}")
        return 2

    size_kb = dst.stat().st_size / 1024
    log(f"vystup: {dst}  ({size_kb:.0f} kB)  za {time.time() - started:.1f}s")

    meta = {
        "source": src.name,
        "generated": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "sizeBytes": dst.stat().st_size,
        "tolerance": args.tolerance,
        "angularTolerance": args.angular_tolerance,
    }
    (dst.parent / "model-info.json").write_text(json.dumps(meta, indent=2), encoding="utf-8")

    if size_kb > 25_000:
        log("UPOZORNENI: vystup je vetsi nez 25 MB, zvaz vetsi --tolerance")
    return 0


if __name__ == "__main__":
    sys.exit(main())
