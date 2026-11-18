"""The engine port's font pair (step E1): the browser's own font files, made into the TTFs Unity reads.

The browser loads Instrument Serif (regular and italic) and Manrope (variable weight) as woff2
pieces, one per alphabet. Unity reads only TTF/OTF and takes no weights from a variable font, so
this joins the Latin and Latin Extended pieces of each and cuts Manrope at the weights style.css
uses (400, 500, 600, 700). Both are under the SIL Open Font License; the licences go alongside.

Needs fontTools and brotli:  python -m pip install fonttools brotli
Run from the repository root:  python tools/engine-fonts.py
"""

import io
import os
import shutil

from fontTools.merge import Merger
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "engine", "Assets", "UI", "Fonts")
MANROPE = os.path.join(ROOT, "node_modules", "@fontsource-variable", "manrope")
SERIF = os.path.join(ROOT, "node_modules", "@fontsource", "instrument-serif")
PIECES = ["latin", "latin-ext"]
WEIGHTS = {400: "Regular", 500: "Medium", 600: "SemiBold", 700: "Bold"}


def as_ttf(font: TTFont) -> bytes:
    font.flavor = None
    buf = io.BytesIO()
    font.save(buf)
    return buf.getvalue()


def join(pieces: list[bytes], name: str, style: str, path: str) -> None:
    """Joins one font's alphabet pieces into one TTF named `name` `style`."""
    tmp = []
    for i, data in enumerate(pieces):
        p = path + f".{i}.tmp.ttf"
        with open(p, "wb") as f:
            f.write(data)
        tmp.append(p)
    font = Merger().merge(tmp) if len(tmp) > 1 else TTFont(tmp[0])
    for p in tmp:
        os.remove(p)
    names = font["name"]
    full = f"{name} {style}"
    for rec in list(names.names):
        if rec.nameID in (16, 17, 21, 22):
            names.removeNames(nameID=rec.nameID)
    names.setName(name, 1, 3, 1, 0x409)
    names.setName(style, 2, 3, 1, 0x409)
    names.setName(full, 4, 3, 1, 0x409)
    names.setName(full.replace(" ", "-"), 6, 3, 1, 0x409)
    font.save(path)


def main() -> None:
    os.makedirs(OUT, exist_ok=True)
    for weight, style in WEIGHTS.items():
        pieces = []
        for piece in PIECES:
            font = TTFont(os.path.join(MANROPE, "files", f"manrope-{piece}-wght-normal.woff2"))
            font = instantiateVariableFont(font, {"wght": weight}, updateFontNames=False)
            font["OS/2"].usWeightClass = weight
            pieces.append(as_ttf(font))
        join(pieces, "Manrope", style, os.path.join(OUT, f"Manrope-{style}.ttf"))
    for style, file in (("Regular", "normal"), ("Italic", "italic")):
        pieces = [as_ttf(TTFont(os.path.join(SERIF, "files", f"instrument-serif-{piece}-400-{file}.woff2"))) for piece in PIECES]
        join(pieces, "Instrument Serif", style, os.path.join(OUT, f"InstrumentSerif-{style}.ttf"))
    shutil.copy(os.path.join(MANROPE, "LICENSE"), os.path.join(OUT, "Manrope-OFL.txt"))
    shutil.copy(os.path.join(SERIF, "LICENSE"), os.path.join(OUT, "InstrumentSerif-OFL.txt"))
    for f in sorted(os.listdir(OUT)):
        print(f, os.path.getsize(os.path.join(OUT, f)))


if __name__ == "__main__":
    main()
