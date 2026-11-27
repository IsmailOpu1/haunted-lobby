"""The engine port's name labels (step E5): Manrope SemiBold's ligatures and kerning, for NameLabel.cs.

The browser draws a name with ctx.fillText, which shapes it as any text: the standard ligatures
(fi, fl, ff, ffl, tt), the kerning pairs, and advances to a fraction of a pixel. Unity's font API
gives none of them (its advances are whole pixels), so this reads them from the same TTF Unity
draws (engine/Assets/Resources/Fonts/Manrope-SemiBold.ttf) for every character a player could
type (KerningFix.Characters). Unity cannot draw a ligature's own glyph, so NameLabel spreads the
letters over the ligature's width. All in font units:

    {"unitsPerEm": 2000,
     "advances": {"W": 1890, ...},
     "ligatures": [{"chars": "ffl", "advance": 2040}, ...],      longest first
     "kerning": {"W	A": -110, "fi	x": -12, ...}}               non-zero pairs; a ligature by its letters

Needs fontTools:  python -m pip install fonttools
Run from the repository root:  python tools/engine-label-shaping.py
"""

import json
import os

from fontTools.ttLib import TTFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FONT = os.path.join(ROOT, "engine", "Assets", "Resources", "Fonts", "Manrope-SemiBold.ttf")
OUT = os.path.join(ROOT, "engine", "Assets", "Resources", "Data", "label-shaping.json")


def characters() -> str:
    """KerningFix.Characters: Basic Latin, Latin-1, Latin Extended-A and the pages' punctuation."""
    chars = [chr(c) for c in range(0x20, 0x7F)] + [chr(c) for c in range(0xA0, 0x180)]
    return "".join(chars) + "–—‘’“”…−·•←→✓×"


def lookups(table, tag):
    found = []
    for record in table.FeatureList.FeatureRecord:
        if record.FeatureTag == tag:
            for i in record.Feature.LookupListIndex:
                if i not in found:
                    found.append(i)
    return [table.LookupList.Lookup[i] for i in sorted(found)]


def subtables(lookup):
    for st in lookup.SubTable:
        yield getattr(st, "ExtSubTable", st)


def main():
    font = TTFont(FONT)
    cmap = font.getBestCmap()
    by_glyph = {cmap[ord(c)]: c for c in characters() if ord(c) in cmap}

    # Ligatures whose parts are all characters a name can hold.
    ligatures = []
    for lookup in lookups(font["GSUB"].table, "liga"):
        for st in subtables(lookup):
            for first, ligs in getattr(st, "ligatures", {}).items():
                for lig in ligs:
                    parts = [first] + list(lig.Component)
                    if all(p in by_glyph for p in parts) and all(by_glyph[p].isalpha() for p in parts):
                        ligatures.append({"chars": "".join(by_glyph[p] for p in parts), "glyph": lig.LigGlyph})
    ligatures.sort(key=lambda l: -len(l["chars"]))

    text_of = dict(by_glyph)
    for l in ligatures:
        text_of[l["glyph"]] = l["chars"]
    glyphs = list(text_of)
    kerning = {}
    for lookup in lookups(font["GPOS"].table, "kern"):
        for a in glyphs:
            for b in glyphs:
                for st in subtables(lookup):
                    if a not in st.Coverage.glyphs:
                        continue
                    value = 0
                    if st.Format == 1:
                        pairs = st.PairSet[st.Coverage.glyphs.index(a)].PairValueRecord
                        match = next((p for p in pairs if p.SecondGlyph == b), None)
                        if match is None:
                            continue
                        value = getattr(match.Value1, "XAdvance", 0) or 0
                    else:
                        c1 = st.ClassDef1.classDefs.get(a, 0)
                        c2 = st.ClassDef2.classDefs.get(b, 0)
                        value = getattr(st.Class1Record[c1].Class2Record[c2].Value1, "XAdvance", 0) or 0
                    # The first subtable that covers the pair decides it (OpenType PairPos).
                    if value:
                        key = f"{text_of[a]}	{text_of[b]}"
                        kerning[key] = kerning.get(key, 0) + value
                    break
    with open(OUT, "w", encoding="utf-8") as f:
        hmtx = font["hmtx"]
        advances = {c: hmtx[g][0] for g, c in by_glyph.items()}
        ligs = [{"chars": l["chars"], "advance": hmtx[l["glyph"]][0]} for l in ligatures]
        json.dump({"unitsPerEm": font["head"].unitsPerEm, "advances": advances, "ligatures": ligs, "kerning": kerning}, f, separators=(",", ":"), ensure_ascii=False)
    print(f"{len(ligatures)} ligatures, {len(kerning)} kerning pairs, {os.path.getsize(OUT) // 1024} KB -> {OUT}")


if __name__ == "__main__":
    main()
