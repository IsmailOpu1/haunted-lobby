using System.Collections;
using System.Collections.Generic;
using System.Reflection;
using UnityEngine;
using UnityEngine.TextCore.LowLevel;
using FontAsset = UnityEngine.TextCore.Text.FontAsset;

namespace Haunted.Game
{
    /// <summary>
    /// Unity 6.3's font engine gives many of the kerning pairs it reads from a font junk lookup
    /// flags (-688, -576: whatever was in memory), and with them "ignore spacing adjustments". The
    /// text drawer then leaves out the letter-spacing at those pairs, though layout counts it: the
    /// room code "BXMRD" at 0.2em drew as "BXM R D", and "NOT READY" lost its space. Kerning pairs
    /// carry no flags in the fonts (Chrome reads none), so every record's flags are cleared.
    ///
    /// Records are made as glyphs join a font's atlas, which happens as text is drawn. The menus draw
    /// every character the fonts have once at start, clipped to one pixel (Menus' warm-up), run this
    /// every few frames, and redraw their text whenever it cleared some, so a wrong gap lasts a
    /// frame or two at most.
    /// </summary>
    public static class KerningFix
    {
        /// <summary>
        /// Every character the menus' fonts hold that a player could see: Basic Latin, Latin-1,
        /// Latin Extended-A, and the punctuation the pages use.
        /// </summary>
        public static string Characters
        {
            get
            {
                var sb = new System.Text.StringBuilder();
                for (int c = 0x20; c <= 0x7E; c++) sb.Append((char)c);
                for (int c = 0xA0; c <= 0x17F; c++) sb.Append((char)c);
                sb.Append("–—‘’“”…−·•←→✓×");
                return sb.ToString();
            }
        }

        static readonly Dictionary<FontAsset, int> cleared = new Dictionary<FontAsset, int>();
        const BindingFlags Any = BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic;

        /// <summary>How many kerning records all the fonts held at the last call.</summary>
        public static int Records { get; private set; }

        /// <summary>Clears the flags on records made since the last call. Returns how many it changed.</summary>
        public static int Run()
        {
            int changed = 0, records = 0;
            foreach (var font in Resources.FindObjectsOfTypeAll<FontAsset>())
            {
                var table = typeof(FontAsset).GetProperty("fontFeatureTable", Any)?.GetValue(font);
                if (table == null) continue;
                var lists = new List<IList>();
                var lookups = new List<IDictionary>();
                foreach (var field in table.GetType().GetFields(Any))
                {
                    var value = field.GetValue(table);
                    if (value is List<GlyphPairAdjustmentRecord> list) lists.Add(list);
                    else if (value is IDictionary map && field.FieldType.IsGenericType && field.FieldType.GetGenericArguments()[1] == typeof(GlyphPairAdjustmentRecord)) lookups.Add(map);
                }
                int count = 0;
                foreach (var list in lists) count += list.Count;
                records += count;
                if (cleared.TryGetValue(font, out int was) && was == count) continue;
                foreach (var list in lists)
                    for (int i = 0; i < list.Count; i++)
                    {
                        var record = (GlyphPairAdjustmentRecord)list[i];
                        if (record.featureLookupFlags == FontFeatureLookupFlags.None) continue;
                        record.featureLookupFlags = FontFeatureLookupFlags.None;
                        list[i] = record;
                        changed++;
                    }
                foreach (var map in lookups)
                    foreach (var key in new ArrayList(map.Keys))
                    {
                        var record = (GlyphPairAdjustmentRecord)map[key];
                        if (record.featureLookupFlags == FontFeatureLookupFlags.None) continue;
                        record.featureLookupFlags = FontFeatureLookupFlags.None;
                        map[key] = record;
                        changed++;
                    }
                cleared[font] = count;
            }
            Records = records;
            return changed;
        }
    }
}
