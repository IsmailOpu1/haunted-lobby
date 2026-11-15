using System.Collections.Generic;
using Haunted.Sim;
using UnityEngine;

namespace Haunted.Game
{
    /// <summary>The characters dealt each night (GDD 26.14), from shared/src/characters.ts via Resources/Data/characters.json.</summary>
    public static class Characters
    {
        static Dictionary<string, string> names;

        /// <summary>"The Priest" for "priest", or null before the first night ("").</summary>
        public static string NameOf(string id)
        {
            if (string.IsNullOrEmpty(id)) return null;
            if (names == null)
            {
                names = new Dictionary<string, string>();
                foreach (var c in (List<object>)Json.Parse(Resources.Load<TextAsset>("Data/characters").text))
                {
                    var d = (Dictionary<string, object>)c;
                    names[(string)d["id"]] = (string)d["name"];
                }
            }
            string name;
            return names.TryGetValue(id, out name) ? name : null;
        }
    }
}
