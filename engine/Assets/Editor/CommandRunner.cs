using System;
using System.IO;
using UnityEditor;
using UnityEngine;

namespace Haunted.Editor
{
    /// <summary>
    /// Lets Claude drive an open editor without clicks: write a method name ("Setup", "BuildWindows")
    /// (or "ImportHotel", "Refresh", "Resolve")
    /// to engine/Temp/command.txt and the editor runs it, writing "done: ..." or "failed: ..." to
    /// engine/Temp/command-result.txt. Used because the editor's license works only when the
    /// editor is started from Unity Hub, so the command-line batch mode cannot run it.
    /// </summary>
    [InitializeOnLoad]
    static class CommandRunner
    {
        const string CommandPath = "Temp/command.txt";
        const string ResultPath = "Temp/command-result.txt";
        static double nextCheck;

        static CommandRunner()
        {
            EditorApplication.update += Poll;
        }

        static void Poll()
        {
            if (EditorApplication.timeSinceStartup < nextCheck) return;
            nextCheck = EditorApplication.timeSinceStartup + 1;
            if (EditorApplication.isCompiling || EditorApplication.isUpdating || !File.Exists(CommandPath)) return;
            string command = File.ReadAllText(CommandPath).Trim();
            File.Delete(CommandPath);
            try
            {
                switch (command)
                {
                    case "Setup":
                        ProjectSetup.Setup();
                        break;
                    case "BuildWindows":
                        ProjectSetup.BuildWindows();
                        break;
                    case "ImportHotel":
                        HotelImport.Import();
                        break;
                    case "ImportCharacters":
                        CharacterImport.Import();
                        break;
                    case "Refresh":
                        AssetDatabase.Refresh();
                        break;
                    case "Resolve":
                        // Packages/manifest.json changed outside the editor: read it again.
                        UnityEditor.PackageManager.Client.Resolve();
                        break;
                    default:
                        throw new ArgumentException("unknown command " + command);
                }
                File.WriteAllText(ResultPath, "done: " + command + " at " + DateTime.Now.ToString("HH:mm:ss"));
            }
            catch (Exception e)
            {
                Debug.LogException(e);
                File.WriteAllText(ResultPath, "failed: " + command + ": " + e);
            }
        }
    }
}
