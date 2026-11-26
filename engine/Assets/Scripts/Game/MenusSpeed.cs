using System;
using System.Globalization;
using System.Linq;
using UnityEngine;
using UnityEngine.UIElements;

namespace Haunted.Game
{
    /// <summary>
    /// The speed test's parts of the menus (step E6, SpeedTest): in Options, the button, a note, and
    /// the result (a verdict, High and Low side by side, the slowest rooms, Copy); while it runs, a
    /// bar at the foot of the picture (what is measured, how far, the frame rate now, Esc stops).
    /// </summary>
    public partial class Menus
    {
        /// <summary>Asked to run the speed test (Game decides whether it can).</summary>
        public Action SpeedTestStart;

        Button speedButton;
        Label speedNote, speedVerdict, speedSaved;
        VisualElement speedResult, speedLevels, speedBanner, speedFill;
        Label speedWhat, speedFps;
        string speedText = "";
        bool speedOn;

        void BuildOptionsSpeed(VisualElement graphics)
        {
            speedButton = Quiet(graphics, "Run the speed test", () => SpeedTestStart?.Invoke());
            speedNote = Text(graphics, "muted-line", "About three minutes. It turns round in every room by torchlight, at High and then Low, with no frame cap, and times the processor and the graphics card. Nothing is sent anywhere.", 20.25f);

            speedResult = new VisualElement();
            speedResult.AddToClassList("speed-result");
            speedResult.style.display = DisplayStyle.None;
            speedVerdict = Text(speedResult, "speed-verdict", "");
            speedLevels = new VisualElement();
            speedLevels.AddToClassList("speed-levels");
            speedResult.Add(speedLevels);
            var buttons = new VisualElement();
            buttons.AddToClassList("speed-buttons");
            Button copy = null;
            copy = Quiet(buttons, "Copy the result", () =>
            {
                GUIUtility.systemCopyBuffer = speedText;
                copy.text = "Copied";
            }, true);
            speedResult.Add(buttons);
            speedSaved = Text(speedResult, "hint", "");
            graphics.Add(speedResult);

            speedBanner = new VisualElement { pickingMode = PickingMode.Ignore };
            speedBanner.AddToClassList("speed-banner");
            var top = new VisualElement { pickingMode = PickingMode.Ignore };
            top.AddToClassList("speed-banner-row");
            var title = new Label("SPEED TEST") { pickingMode = PickingMode.Ignore };
            title.AddToClassList("speed-banner-title");
            top.Add(title);
            speedWhat = new Label("") { pickingMode = PickingMode.Ignore };
            speedWhat.AddToClassList("speed-banner-what");
            top.Add(speedWhat);
            speedFps = new Label("") { pickingMode = PickingMode.Ignore };
            speedFps.AddToClassList("speed-banner-fps");
            top.Add(speedFps);
            speedBanner.Add(top);
            var track = new VisualElement { pickingMode = PickingMode.Ignore };
            track.AddToClassList("speed-track");
            speedFill = new VisualElement { pickingMode = PickingMode.Ignore };
            speedFill.AddToClassList("speed-fill");
            track.Add(speedFill);
            speedBanner.Add(track);
            var esc = new Label("Esc stops the test") { pickingMode = PickingMode.Ignore };
            esc.AddToClassList("speed-banner-esc");
            speedBanner.Add(esc);
            speedBanner.style.display = DisplayStyle.None;
            root.Add(speedBanner);
        }

        /// <summary>A line under the button (why it cannot run now, or that it stopped).</summary>
        public void SpeedNote(string text)
        {
            speedNote.text = "<line-height=20.25px>" + text;
            Lead(speedNote);
        }

        /// <summary>While the test runs: the bar at the foot of the picture.</summary>
        public void SpeedProgress(string what, float fraction, int fps)
        {
            if (!speedOn)
            {
                speedOn = true;
                speedBanner.style.display = DisplayStyle.Flex;
                speedBanner.BringToFront();
                ShowPanel();
            }
            speedWhat.text = what;
            speedFps.text = fps > 0 ? fps + " FPS" : "";
            speedFill.style.width = Length.Percent(Mathf.Clamp01(fraction) * 100);
        }

        /// <summary>The test is over: the bar goes, and the result (or null, stopped) shows in Options.</summary>
        public void SpeedDone(SpeedTest.Result result, string savedTo, string autoNote)
        {
            speedOn = false;
            speedBanner.style.display = DisplayStyle.None;
            ShowPanel();
            if (result == null)
            {
                SpeedNote("Speed test stopped. Nothing was changed.");
                return;
            }
            SpeedNote(autoNote);
            speedText = result.Text;
            speedVerdict.text = result.Verdict;
            speedLevels.Clear();
            foreach (var l in new[] { result.High, result.Low })
            {
                var card = new VisualElement();
                card.AddToClassList("speed-level");
                if (l.Level == result.Recommended) card.AddToClassList("chosen");
                var head = new VisualElement();
                head.AddToClassList("speed-level-head");
                var name = new Label(l.Level == HauntedQuality.Level.High ? "HIGH" : "LOW");
                name.AddToClassList("speed-level-name");
                head.Add(name);
                var mark = new Label(l.Smooth ? "Smooth" : "Too slow");
                mark.AddToClassList("speed-level-mark");
                mark.AddToClassList(l.Smooth ? "good" : "bad");
                head.Add(mark);
                card.Add(head);
                var big = new Label(Math.Round(l.Fps).ToString(CultureInfo.InvariantCulture) + " FPS");
                big.AddToClassList("speed-level-fps");
                card.Add(big);
                string detail = "1% low  " + Math.Round(l.LowFps) + " FPS";
                if (result.GpuTimed) detail += "\nCard  " + l.GpuMs.ToString("0.0", CultureInfo.InvariantCulture) + " ms\nCPU  " + l.CpuMs.ToString("0.0", CultureInfo.InvariantCulture) + " ms";
                var slowest = l.Rooms.OrderBy(x => x.Fps).FirstOrDefault();
                if (slowest != null) detail += "\nSlowest: " + slowest.Name + ", " + Math.Round(slowest.Fps) + " FPS";
                var d = new Label(detail);
                d.AddToClassList("speed-level-detail");
                card.Add(d);
                speedLevels.Add(card);
            }
            speedSaved.text = savedTo != null ? "Also saved as " + savedTo : "";
            speedResult.style.display = DisplayStyle.Flex;
            regapDue = true;
        }

        /// <summary>Tests: Options scrolled so the result shows.</summary>
        public void ScrollToSpeedResult()
        {
            var scroll = speedResult.GetFirstAncestorOfType<ScrollView>();
            if (scroll != null) scroll.ScrollTo(speedResult);
        }
    }
}
