using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using Haunted.Game;
using Haunted.Sim;
using UnityEditor;
using UnityEngine;

namespace Haunted.Editor
{
    /// <summary>
    /// Step D1 of docs/plans/engine-port.md: brings the browser's dressed rooms into Unity. First run
    /// `npx tsx tools/engine-rooms.ts` (it writes engine/Assets/Hotel), then this (CommandRunner
    /// "ImportHotel"). It sets each texture up for what the rooms use it for (colour, normal map, or
    /// the packed metal/roughness), turns each baked lightmap PNG into a Unity lightmap, and lists
    /// every build in Assets/Hotel/Resources/HotelArt.asset for the game (DressedRooms) to place.
    /// Open the editor with the folder named Assets/Hotel~ (Unity skips it), then rename it to
    /// Assets/Hotel and run this: HotelTextures sets each texture up as it first imports.
    /// </summary>
    public static class HotelImport
    {
        const string Hotel = "Assets/Hotel";
        const string Rooms = Hotel + "/Rooms";
        const string Lightmaps = Hotel + "/Lightmaps";
        const string Models = Hotel + "/Models";

        [MenuItem("Haunted/Import dressed hotel")]
        public static void Import()
        {
            if (!File.Exists(Hotel + "/rooms.json")) throw new FileNotFoundException("Run npx tsx tools/engine-rooms.ts first: " + Hotel + "/rooms.json is missing");
            var manifest = (Dictionary<string, object>)Json.Parse(File.ReadAllText(Hotel + "/rooms.json"));

            // Textures were already set up as they imported (HotelTextures below); any imported under
            // older rules are brought in line.
            AssetDatabase.StartAssetEditing();
            try
            {
                HotelTextures.Recheck();
                foreach (var entry in manifest)
                {
                    var e = (Dictionary<string, object>)entry.Value;
                    string name = Path.GetFileNameWithoutExtension(Json.Text(e, "glb"));
                    MakeLightmap(name, Json.Num(e, "lightmapScale"));
                }
            }
            finally
            {
                AssetDatabase.StopAssetEditing();
            }
            AssetDatabase.Refresh();

            var art = ScriptableObject.CreateInstance<HotelArt>();
            foreach (var entry in manifest)
            {
                var e = (Dictionary<string, object>)entry.Value;
                string name = Path.GetFileNameWithoutExtension(Json.Text(e, "glb"));
                var model = AssetDatabase.LoadAssetAtPath<GameObject>(Rooms + "/" + name + ".gltf");
                var lightmap = AssetDatabase.LoadAssetAtPath<Texture2D>(Lightmaps + "/" + name + ".exr");
                if (model == null || lightmap == null)
                {
                    Debug.LogWarning("Dressed hotel: " + entry.Key + " is not imported (run tools/engine-rooms.ts for it)");
                    continue;
                }
                art.rooms.Add(new RoomArt
                {
                    name = entry.Key,
                    rooms = e.ContainsKey("rooms") ? ((List<object>)e["rooms"]).Cast<string>().ToArray() : new[] { entry.Key },
                    model = model,
                    lightmap = lightmap,
                    drawn = e.ContainsKey("drawn") ? ((List<object>)e["drawn"]).Cast<string>().ToArray() : new string[0],
                    probes = e.ContainsKey("probes")
                        ? ((List<object>)e["probes"]).Cast<Dictionary<string, object>>().Select(p => new Vector2((float)Json.Num(p, "x"), (float)Json.Num(p, "z"))).ToArray()
                        : new Vector2[0],
                });
            }
            // Step D2: the doors and the stations' own models.
            art.doors = AssetDatabase.LoadAssetAtPath<GameObject>(Models + "/doors.gltf");
            art.clockHands = AssetDatabase.LoadAssetAtPath<GameObject>(Models + "/clock_hands.gltf");
            art.cradle = AssetDatabase.LoadAssetAtPath<GameObject>(Models + "/cradle.gltf");
            art.trunk = AssetDatabase.LoadAssetAtPath<GameObject>(Models + "/trunk.gltf");
            if (File.Exists(Models + "/door-styles.json")) art.doorStyles = File.ReadAllText(Models + "/door-styles.json");
            art.glass = ReadGlass();
            if (art.doors == null || art.clockHands == null || art.cradle == null || art.trunk == null)
                Debug.LogWarning("Dressed hotel: a model in " + Models + " is not imported (run tools/engine-rooms.ts --models)");
            Directory.CreateDirectory(Hotel + "/Resources");
            AssetDatabase.DeleteAsset(Hotel + "/Resources/HotelArt.asset");
            AssetDatabase.CreateAsset(art, Hotel + "/Resources/HotelArt.asset");
            KeepLightmapShaders();
            AssetDatabase.SaveAssets();
            Debug.Log("Dressed hotel: " + art.rooms.Count + " builds imported, doors " + (art.doors != null) + ", station models " + (art.clockHands != null && art.cradle != null && art.trunk != null));
        }

        /// <summary>
        /// Every glass material (KHR_materials_transmission) of the rooms and models, read from their
        /// glTF files: its transmission (and map), base colour and alpha mode. One per material name;
        /// the same name is the same glass in every file.
        /// </summary>
        static List<GlassArt> ReadGlass()
        {
            var glass = new Dictionary<string, GlassArt>();
            foreach (var dir in new[] { Rooms, Models })
            {
                if (!Directory.Exists(dir)) continue;
                foreach (var file in Directory.GetFiles(dir, "*.gltf"))
                {
                    var gltf = (Dictionary<string, object>)Json.Parse(File.ReadAllText(file));
                    if (!gltf.ContainsKey("materials")) continue;
                    foreach (Dictionary<string, object> m in (List<object>)gltf["materials"])
                    {
                        var ext = m.ContainsKey("extensions") ? (Dictionary<string, object>)m["extensions"] : null;
                        if (ext == null || !ext.ContainsKey("KHR_materials_transmission")) continue;
                        string name = m.ContainsKey("name") ? (string)m["name"] : "";
                        if (glass.ContainsKey(name)) continue;
                        var t = (Dictionary<string, object>)ext["KHR_materials_transmission"];
                        var pbr = m.ContainsKey("pbrMetallicRoughness") ? (Dictionary<string, object>)m["pbrMetallicRoughness"] : new Dictionary<string, object>();
                        var c = pbr.ContainsKey("baseColorFactor") ? ((List<object>)pbr["baseColorFactor"]).Select(v => (float)Convert.ToDouble(v)).ToArray() : new[] { 1f, 1f, 1f, 1f };
                        glass[name] = new GlassArt
                        {
                            material = name,
                            transmission = t.ContainsKey("transmissionFactor") ? (float)Json.Num(t, "transmissionFactor") : 0,
                            transmissionMap = t.ContainsKey("transmissionTexture") ? TextureOf(gltf, file, (int)Json.Num((Dictionary<string, object>)t["transmissionTexture"], "index")) : null,
                            baseColor = new Color(c[0], c[1], c[2], c[3]),
                            blend = m.ContainsKey("alphaMode") && (string)m["alphaMode"] == "BLEND",
                        };
                    }
                }
            }
            return glass.Values.ToList();
        }

        /// <summary>The imported texture a glTF texture index points at (its image's file beside the room files).</summary>
        static Texture2D TextureOf(Dictionary<string, object> gltf, string file, int index)
        {
            var texture = (Dictionary<string, object>)((List<object>)gltf["textures"])[index];
            var image = (Dictionary<string, object>)((List<object>)gltf["images"])[(int)Json.Num(texture, "source")];
            string path = Path.GetFullPath(Path.Combine(Path.GetDirectoryName(file), (string)image["uri"]));
            string project = Path.GetFullPath(".") + Path.DirectorySeparatorChar;
            return AssetDatabase.LoadAssetAtPath<Texture2D>(path.Substring(project.Length).Replace('\\', '/'));
        }

        /// <summary>
        /// The bake stores sRGB(light / scale) in a byte PNG (tools/art/blender/build_room.py); the
        /// browser multiplies back by scale. Unity's lightmaps hold the light itself, so this writes
        /// light = linear(png) * scale to an EXR and imports it as a lightmap.
        /// </summary>
        static void MakeLightmap(string name, double scale)
        {
            string png = Lightmaps + "/" + name + ".png";
            string exr = Lightmaps + "/" + name + ".exr";
            if (!File.Exists(png)) return;
            if (!File.Exists(exr) || File.GetLastWriteTimeUtc(exr) < File.GetLastWriteTimeUtc(png))
            {
                var source = new Texture2D(2, 2, TextureFormat.RGBA32, false, true);
                source.LoadImage(File.ReadAllBytes(png));
                var px = source.GetPixels32();
                var light = new Color[px.Length];
                var table = new float[256];
                for (int i = 0; i < 256; i++)
                {
                    float v = i / 255f;
                    table[i] = (float)((v <= 0.04045 ? v / 12.92 : Math.Pow((v + 0.055) / 1.055, 2.4)) * scale);
                }
                for (int i = 0; i < px.Length; i++) light[i] = new Color(table[px[i].r], table[px[i].g], table[px[i].b], 1);
                var hdr = new Texture2D(source.width, source.height, TextureFormat.RGBAHalf, false, true);
                hdr.SetPixels(light);
                File.WriteAllBytes(exr, hdr.EncodeToEXR(Texture2D.EXRFlags.CompressZIP));
                UnityEngine.Object.DestroyImmediate(source);
                UnityEngine.Object.DestroyImmediate(hdr);
            }
            AssetDatabase.ImportAsset(exr); // HotelTextures makes it a lightmap
        }

        /// <summary>
        /// The game's scene has no baked lighting or fog of its own (Game.SetUpLight turns fog on as
        /// it starts), so the build would strip the shader variants that read a lightmap or draw fog:
        /// keep the plain (non-directional) lightmap ones and linear fog.
        /// </summary>
        static void KeepLightmapShaders()
        {
            var graphics = new SerializedObject(AssetDatabase.LoadAllAssetsAtPath("ProjectSettings/GraphicsSettings.asset")[0]);
            var stripping = graphics.FindProperty("m_LightmapStripping");
            var plain = graphics.FindProperty("m_LightmapKeepPlain");
            var fogStripping = graphics.FindProperty("m_FogStripping");
            var linearFog = graphics.FindProperty("m_FogKeepLinear");
            if (stripping == null || plain == null || fogStripping == null || linearFog == null)
            {
                Debug.LogWarning("Dressed hotel: could not find the lightmap or fog stripping settings");
                return;
            }
            stripping.intValue = 1; // custom
            plain.boolValue = true;
            fogStripping.intValue = 1; // custom
            linearFog.boolValue = true;
            graphics.ApplyModifiedProperties();
        }
    }

    /// <summary>
    /// Sets the hotel's textures up the first time they import, so each is compressed once: data
    /// (normal maps, metal/roughness, occlusion) without sRGB, colour with it, all at most 2K (the
    /// browser's High set), plus the lightmaps (HotelImport.MakeLightmap's EXRs). Normal maps stay
    /// plain RGB pictures, not Unity normal maps: glTFast's shaders read x and y from red and green
    /// (its Normal.cginc), as they come from a glTF file; Unity's normal-map packing moves them, and
    /// the walls then face sideways (step D2: the torch lit only one side of its beam).
    /// Roles come from Assets/Hotel/texture-roles.json, written by tools/engine-rooms.ts.
    /// </summary>
    public class HotelTextures : AssetPostprocessor
    {
        const string Textures = "Assets/Hotel/Textures/";
        const string Lightmaps = "Assets/Hotel/Lightmaps/";
        static HashSet<string> normals, data;
        static DateTime rolesRead;

        static void ReadRoles()
        {
            const string path = "Assets/Hotel/texture-roles.json";
            if (!File.Exists(path)) return;
            var stamp = File.GetLastWriteTimeUtc(path);
            if (normals != null && stamp == rolesRead) return;
            var roles = (Dictionary<string, object>)Json.Parse(File.ReadAllText(path));
            normals = new HashSet<string>(((List<object>)roles["normals"]).Cast<string>());
            data = new HashSet<string>(((List<object>)roles["data"]).Cast<string>());
            rolesRead = stamp;
        }

        static bool IsData(string file)
        {
            return (normals != null && normals.Contains(file)) || (data != null && data.Contains(file));
        }

        /// <summary>Re-imports any hotel texture whose type or sRGB is not what these rules give now.</summary>
        public static void Recheck()
        {
            ReadRoles();
            foreach (var guid in AssetDatabase.FindAssets("t:Texture2D", new[] { Textures.TrimEnd('/') }))
            {
                string path = AssetDatabase.GUIDToAssetPath(guid);
                var importer = AssetImporter.GetAtPath(path) as TextureImporter;
                if (importer == null) continue;
                bool srgb = !IsData(Path.GetFileName(path));
                string group = GroupOf(importer);
                if (importer.textureType == TextureImporterType.Default && importer.sRGBTexture == srgb && importer.mipmapLimitGroupName == group) continue;
                importer.textureType = TextureImporterType.Default;
                importer.sRGBTexture = srgb;
                importer.mipmapLimitGroupName = group;
                importer.SaveAndReimport();
            }
        }

        void OnPreprocessTexture()
        {
            var importer = (TextureImporter)assetImporter;
            if (assetPath.StartsWith(Lightmaps, StringComparison.Ordinal))
            {
                if (assetPath.EndsWith(".exr", StringComparison.Ordinal))
                {
                    importer.textureType = TextureImporterType.Lightmap;
                    importer.textureCompression = TextureImporterCompression.CompressedHQ;
                }
                // The baked PNG is only the EXR's source; the game never draws it.
                else importer.maxTextureSize = 32;
                importer.maxTextureSize = Math.Min(importer.maxTextureSize, 2048);
                return;
            }
            if (!assetPath.StartsWith(Textures, StringComparison.Ordinal)) return;
            ReadRoles();
            string file = Path.GetFileName(assetPath);
            importer.textureType = TextureImporterType.Default;
            importer.sRGBTexture = !IsData(file);
            importer.maxTextureSize = 2048;
            importer.textureCompression = TextureImporterCompression.CompressedHQ;
            importer.mipmapEnabled = true;
            importer.anisoLevel = 4;
            importer.mipmapLimitGroupName = GroupOf(importer);
        }

        /// <summary>
        /// Textures over 1024 pixels go in Low quality's group (HauntedQuality.LargeTextures), which
        /// drops their top level: the browser's 1K set halves exactly those and keeps the rest.
        /// </summary>
        static string GroupOf(TextureImporter importer)
        {
            importer.GetSourceTextureWidthAndHeight(out int w, out int h);
            return Math.Max(w, h) > 1024 ? Haunted.Game.HauntedQuality.LargeTextures : "";
        }
    }

    /// <summary>
    /// The recorded sounds (step D4, copied by tools/engine-rooms.ts): kept as plain PCM at their
    /// own rate, decoded when loaded, as the browser's decodeAudioData keeps them. Unity's default
    /// (Vorbis) would change the quiet loops' level and give the loops a seam.
    /// </summary>
    public class HotelSounds : AssetPostprocessor
    {
        const string Sounds = "Assets/Hotel/Resources/Sounds/";

        void OnPreprocessAudio()
        {
            if (!assetPath.StartsWith(Sounds, StringComparison.Ordinal)) return;
            var importer = (AudioImporter)assetImporter;
            importer.forceToMono = false;
            importer.loadInBackground = false;
            var settings = importer.defaultSampleSettings;
            settings.loadType = AudioClipLoadType.DecompressOnLoad;
            settings.compressionFormat = AudioCompressionFormat.PCM;
            settings.sampleRateSetting = AudioSampleRateSetting.PreserveSampleRate;
            settings.preloadAudioData = true;
            importer.defaultSampleSettings = settings;
        }
    }
}
