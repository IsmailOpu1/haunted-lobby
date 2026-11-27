using System.Collections;
using System.Collections.Generic;
using Haunted.Sim;
using UnityEngine;
using UnityEngine.Networking;

namespace Haunted.Game
{
    /// <summary>
    /// The downloadable build's settings and its update check (step F). Data/release.json names this
    /// build's version, the live server and the itch.io page. The check asks itch.io which version
    /// was last pushed to the page's channel (its public "wharf/latest" address, the one the itch
    /// app uses) and, if it is newer, the Start screen says so.
    /// </summary>
    public static class Release
    {
        static readonly Dictionary<string, object> data =
            (Dictionary<string, object>)Json.Parse(Resources.Load<TextAsset>("Data/release").text);

        static string Get(string key) { object v; return data.TryGetValue(key, out v) ? v as string ?? "" : ""; }

        public static string Version => Get("version");
        public static string Server => Get("server");
        public static string Itch => Get("itch");

        /// <summary>A newer version on itch.io, or null (none, no page set, or no answer).</summary>
        public static string Newer { get; private set; }

        public static IEnumerator Check()
        {
            if (Itch == "") yield break;
            string url = "https://itch.io/api/1/x/wharf/latest?target=" + UnityWebRequest.EscapeURL(Itch) + "&channel_name=" + UnityWebRequest.EscapeURL(Get("channel"));
            using (var req = UnityWebRequest.Get(url))
            {
                req.timeout = 15;
                yield return req.SendWebRequest();
                if (req.result != UnityWebRequest.Result.Success) { Debug.Log("Update check: no answer (" + req.error + ")"); yield break; }
                var answer = Json.Parse(req.downloadHandler.text) as Dictionary<string, object>;
                object latest;
                if (answer == null || !answer.TryGetValue("latest", out latest) || !(latest is string)) yield break;
                Debug.Log("Update check: this " + Version + ", itch.io " + latest);
                if (Compare((string)latest, Version) > 0) Newer = (string)latest;
            }
        }

        /// <summary>Compares dotted versions part by part as numbers (0.10.0 is after 0.9.2).</summary>
        public static int Compare(string a, string b)
        {
            var x = a.Split('.');
            var y = b.Split('.');
            for (int i = 0; i < Mathf.Max(x.Length, y.Length); i++)
            {
                int p = 0, q = 0;
                if (i < x.Length) int.TryParse(x[i], out p);
                if (i < y.Length) int.TryParse(y[i], out q);
                if (p != q) return p.CompareTo(q);
            }
            return 0;
        }
    }
}
