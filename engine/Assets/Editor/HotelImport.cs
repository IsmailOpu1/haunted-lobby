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

        [MenuItem("Haunted/Import dressed hotel")]
        public static void Import()
        {
            if (!File.Exists(Hotel + "/rooms.json")) throw new FileNotFoundException("Run npx tsx tools/engine-rooms.ts first: " + Hotel + "/rooms.json is missing");
            var manifest = (Dictionary<string, object>)Json.Parse(File.ReadAllText(Hotel + "/rooms.json"));

            // Textures were already set up as they imported (HotelTextures below).
            AssetDatabase.StartAssetEditing();
            try
            {
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
                });
            }
            Directory.CreateDirectory(Hotel + "/Resources");
            AssetDatabase.DeleteAsset(Hotel + "/Resources/HotelArt.asset");
            AssetDatabase.CreateAsset(art, Hotel + "/Resources/HotelArt.asset");
            KeepLightmapShaders();
            AssetDatabase.SaveAssets();
            Debug.Log("Dressed hotel: " + art.rooms.Count + " builds imported");
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
    /// Sets the hotel's textures up the first time they import, so each is compressed once: normal
    /// maps as normal maps, data (metal/roughness, occlusion) without sRGB, colour with it, all at
    /// most 2K (the browser's High set), plus the lightmaps (HotelImport.MakeLightmap's EXRs).
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
            bool normal = normals != null && normals.Contains(file);
            importer.textureType = normal ? TextureImporterType.NormalMap : TextureImporterType.Default;
            importer.sRGBTexture = !normal && (data == null || !data.Contains(file));
            importer.maxTextureSize = 2048;
            importer.textureCompression = TextureImporterCompression.CompressedHQ;
            importer.mipmapEnabled = true;
            importer.anisoLevel = 4;
        }
    }
}
