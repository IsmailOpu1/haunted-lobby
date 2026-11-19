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


SPACES = (0x20, 0xA0, 0x2002, 0x2003, 0x2009, 0x200A, 0x202F)


def unkern_spaces(font: TTFont) -> int:
    """Takes the space out of the font's kerning (step E3).

    Chrome shapes text word by word, so a kerning pair with a space (Manrope has T and Y before
    one, -60 and -80 of 2000) is never applied there. Unity applies it many times too big: after
    T or Y in letter-spaced capitals the whole space went ("NOT READY" drew as "NOTREADY").
    Returns how many pair values were cleared.
    """
    if "GPOS" not in font:
        return 0
    cmap = font.getBestCmap()
    spaces = {cmap[c] for c in SPACES if c in cmap}
    cleared = 0
    for lookup in font["GPOS"].table.LookupList.Lookup:
        for sub in lookup.SubTable:
            st = sub.ExtSubTable if lookup.LookupType == 9 else sub
            if getattr(st, "LookupType", lookup.LookupType) != 2:
                continue
            if st.Format == 1:
                for first, pairs in zip(st.Coverage.glyphs, st.PairSet):
                    for rec in pairs.PairValueRecord:
                        if (first in spaces or rec.SecondGlyph in spaces) and rec.Value1 is not None and getattr(rec.Value1, "XAdvance", 0):
                            rec.Value1.XAdvance = 0
                            cleared += 1
            else:
                firsts = {st.ClassDef1.classDefs.get(g, 0) for g in spaces if g in st.Coverage.glyphs}
                seconds = {st.ClassDef2.classDefs.get(g, 0) for g in spaces}
                for c1, row in enumerate(st.Class1Record):
                    for c2, rec in enumerate(row.Class2Record):
                        if (c1 in firsts or c2 in seconds) and rec.Value1 is not None and getattr(rec.Value1, "XAdvance", 0):
                            # A class may hold more than spaces: only clear it when it is spaces alone.
                            members1 = {g for g, c in st.ClassDef1.classDefs.items() if c == c1} if c1 in firsts else spaces
                            members2 = {g for g, c in st.ClassDef2.classDefs.items() if c == c2} if c2 in seconds else spaces
                            if not (members1 <= spaces or members2 <= spaces):
                                raise SystemExit(f"a kerning class mixes spaces with other glyphs: {sorted(members1 | members2)[:8]}")
                            rec.Value1.XAdvance = 0
                            cleared += 1
    return cleared


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
    print(f"{full}: {unkern_spaces(font)} kerning values with a space cleared")
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
