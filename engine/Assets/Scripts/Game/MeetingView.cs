using System;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.UIElements;

namespace Haunted.Game
{
    /// <summary>
    /// Step E5: the meeting (index.html #meeting, main.ts setMeeting, ouijaMove and showMeetingResult,
    /// GDD 16 and 17): who called it, the step and its time, the new photos, the Ouija board with its
    /// planchette, the players with their Voted stamps and Vote buttons, Skip vote and the result.
    /// </summary>
    public partial class Menus
    {
        /// <summary>One player at the meeting table.</summary>
        public struct MeetingSeat
        {
            public string Id, Name;
            public bool Dead, Me, Voted;
        }

        /// <summary>A vote (a player's id or "skip") and a push of the planchette (an id or "unknown").</summary>
        public Action<string> MeetingVote, MeetingOuija;

        const float PlanchetteSec = 1.2f;
        const int PlanchetteW = 34, PlanchetteH = 40, PlanchettePad = 8;

        VisualElement meeting, meetingPhotos, ouija, ouijaBoard, ouijaNames, planchette, meetingPlayers, meetingResult, meetingVotes;
        Label meetingTitle, meetingStep, ouijaLog, meetingVerdict, meetingCounts;
        Button meetingSkip;
        string meetingKey = "", meetingSeats = "";
        List<Night.Photo> meetingShownPhotos;
        object meetingShownResult;
        Vector2 planFrom, planTo;
        float planAt;
        bool planPlaced;
        static Texture2D planchetteTex;
        static readonly Dictionary<long, Texture2D> boards = new Dictionary<long, Texture2D>();

        void BuildMeeting()
        {
            meeting = Div(nightLayer, "", "meeting");
            var scroll = new ScrollView(ScrollViewMode.Vertical) { name = "meeting-box" };
            scroll.horizontalScrollerVisibility = ScrollerVisibility.Hidden;
            meeting.Add(scroll);
            var box = scroll.contentContainer;
            meetingTitle = HudLine(box, "", "meeting-title");
            meetingStep = HudLine(box, "", "meeting-step");
            meetingPhotos = Box(box, "photo-list meeting-photos");

            ouija = Div(box, "", "ouija");
            ouijaBoard = Div(ouija, "", "ouija-board");
            ouijaBoard.RegisterCallback<GeometryChangedEvent>(e => ouijaBoard.style.backgroundImage = Board((int)Mathf.Round(e.newRect.width), (int)Mathf.Round(e.newRect.height)));
            ouijaNames = Div(ouijaBoard, "", "ouija-names");
            planchette = Div(ouijaBoard, "", "planchette");
            planchette.pickingMode = PickingMode.Ignore;
            planchette.style.backgroundImage = Planchette();
            ouijaLog = HudLine(ouija, "", "ouija-log");

            meetingPlayers = Div(box, "", "meeting-players");
            meetingSkip = new Button(() => MeetingVote?.Invoke(MeetingScreen.Skip)) { text = "Skip vote", name = "meeting-skip" };
            meetingSkip.AddToClassList("meeting-button");
            box.Add(meetingSkip);

            meetingResult = Div(box, "", "meeting-result");
            meetingVerdict = HudLine(meetingResult, "", "meeting-verdict");
            meetingCounts = HudLine(meetingResult, "", "meeting-counts");
            meetingVotes = Div(meetingResult, "", "meeting-votes");
            Show(meeting, false);

            // What index.html puts after #meeting is drawn over its dim: the items, the room name and the rest.
            foreach (var e in new[] { items, carrying, roomName, soundCues, workRow, statusWrap, viewfinder, micLostRow }) e.BringToFront();
        }

        /// <summary>
        /// main.ts setMeeting each frame (null title hides it). The players and the board are rebuilt
        /// only when they change: a button replaced between press and release loses the click.
        /// </summary>
        public void SetMeeting(string title, string step, List<Night.Photo> photos, bool ouijaOn, bool canOuija,
            List<MeetingSeat> seats, bool canVote, string ouijaTarget, string ouijaLogText, Night.VoteResult result)
        {
            Show(meeting, title != null);
            if (title == null) { meetingKey = meetingSeats = ""; meetingShownPhotos = null; meetingShownResult = null; planPlaced = false; return; }
            if (title != meetingKey)
            {
                meetingKey = title;
                Set(meetingTitle, title);
            }
            // HTML folds the two spaces main.ts writes into one.
            Set(meetingStep, step);

            if (photos != meetingShownPhotos || meetingPhotos.childCount != photos.Count)
            {
                meetingShownPhotos = photos;
                meetingPhotos.Clear();
                foreach (var p in photos) meetingPhotos.Add(PhotoCard(p));
            }
            // Even empty, the photo list keeps its 12 px margin (a flex box's margins do not fold through it).

            var sig = new System.Text.StringBuilder();
            sig.Append(canVote).Append('|').Append(ouijaOn).Append('|').Append(canOuija);
            foreach (var s in seats) sig.Append('|').Append(s.Id).Append(',').Append(s.Name).Append(',').Append(s.Dead).Append(',').Append(s.Me).Append(',').Append(s.Voted);
            if (sig.ToString() != meetingSeats)
            {
                meetingSeats = sig.ToString();
                BuildOuija(seats, canOuija);
                BuildSeats(seats, canVote);
            }
            Show(ouija, ouijaOn);
            Show(meetingSkip, canVote);
            Set(ouijaLog, ouijaLogText.Replace("  ", " "));
            Show(ouijaLog, ouijaLogText != "");
            PlacePlanchette(ouijaTarget);

            bool showResult = result != null;
            Show(meetingResult, showResult);
            if (showResult && meetingShownResult != result)
            {
                meetingShownResult = result;
                string verdict = result.Removed == null ? (result.Skip > 0 ? "Nobody was removed." : "Nobody was removed: a tie.")
                    : result.Role != null ? result.Removed.ToUpperInvariant() + " WAS " + (result.Role == "possessed" ? "" : "NOT ") + "POSSESSED."
                    : result.Removed + " is gone.";
                Set(meetingVerdict, verdict);
                meetingVerdict.EnableInClassList("possessed", result.Role == "possessed");
                var counts = new List<string>();
                foreach (var t in result.Tally) counts.Add(t.Key + " " + t.Value);
                counts.Add("Skip " + result.Skip);
                Set(meetingCounts, string.Join(" · ", counts.ToArray()));
                meetingVotes.Clear();
                foreach (var v in result.Votes) HudLine(meetingVotes, "meeting-vote-line", null, v);
            }
        }

        void BuildOuija(List<MeetingSeat> seats, bool canOuija)
        {
            ouijaNames.Clear();
            var slots = new List<KeyValuePair<string, string>>();
            foreach (var s in seats) if (!s.Dead) slots.Add(new KeyValuePair<string, string>(s.Id, s.Name));
            slots.Add(new KeyValuePair<string, string>(MeetingScreen.OuijaUnknown, "I don't know"));
            foreach (var slot in slots)
            {
                string id = slot.Key, label = slot.Value;
                var b = new Button(() => MeetingOuija?.Invoke(id)) { text = Plain(label) };
                b.AddToClassList("ouija-slot");
                // The planchette finds its slot by name; "" is "I don't know".
                b.userData = id == MeetingScreen.OuijaUnknown ? "" : label;
                b.SetEnabled(canOuija);
                if (canOuija)
                {
                    b.RegisterCallback<PointerEnterEvent>(e => b.text = "<u>" + Plain(label) + "</u>");
                    b.RegisterCallback<PointerLeaveEvent>(e => b.text = Plain(label));
                }
                ouijaNames.Add(b);
            }
        }

        void BuildSeats(List<MeetingSeat> seats, bool canVote)
        {
            meetingPlayers.Clear();
            foreach (var s in seats)
            {
                var row = Div(meetingPlayers, s.Dead ? "meeting-seat dead" : "meeting-seat", null);
                string name = Plain(s.Me ? s.Name + " (you)" : s.Name);
                // style.css li.dead: text-decoration line-through.
                HudLine(row, "seat-name", null, s.Dead ? "<s>" + name + "</s>" : name);
                if (s.Voted) HudLine(row, "stamp", null, "Voted");
                if (canVote && !s.Dead)
                {
                    Div(row, "seat-gap", null);
                    string id = s.Id;
                    var vote = new Button(() => MeetingVote?.Invoke(id)) { text = "Vote" };
                    vote.AddToClassList("meeting-button");
                    vote.AddToClassList("small");
                    row.Add(vote);
                }
            }
        }

        /// <summary>A name shown as it is, whatever it holds (labels read rich-text tags).</summary>
        static string Plain(string s) { return "<noparse>" + s + "</noparse>"; }

        /// <summary>main.ts placePlanchette, with style.css's 1.2 s ease-in-out slide between names.</summary>
        void PlacePlanchette(string target)
        {
            Show(planchette, target != null);
            if (target == null) { planPlaced = false; return; }
            VisualElement slot = null;
            foreach (var c in ouijaNames.Children()) if ((c.userData as string) == target) slot = c;
            var board = ouijaBoard.worldBound;
            if (slot == null || slot.worldBound.width <= 0 || float.IsNaN(board.x)) return;
            var at = new Vector2(Mathf.Round(slot.worldBound.center.x - board.x), Mathf.Round(slot.worldBound.center.y - board.y));
            float now = Time.realtimeSinceStartup;
            if (!planPlaced) { planFrom = planTo = at; planAt = now - PlanchetteSec; planPlaced = true; }
            else if (at != planTo) { planFrom = PlanchetteAt(now); planTo = at; planAt = now; }
            var p = PlanchetteAt(now);
            planchette.style.left = p.x;
            planchette.style.top = p.y;
        }

        Vector2 PlanchetteAt(float now)
        {
            float t = Mathf.Clamp01((now - planAt) / PlanchetteSec);
            return Vector2.Lerp(planFrom, planTo, EaseInOut(t));
        }

        /// <summary>CSS ease-in-out: cubic-bezier(0.42, 0, 0.58, 1), solved for x by bisection.</summary>
        static float EaseInOut(float x)
        {
            float lo = 0, hi = 1, u = x;
            for (int i = 0; i < 24; i++)
            {
                u = (lo + hi) / 2;
                float bx = 3 * (1 - u) * (1 - u) * u * 0.42f + 3 * (1 - u) * u * u * 0.58f + u * u * u;
                if (bx < x) lo = u; else hi = u;
            }
            return 3 * (1 - u) * u * u + u * u * u;
        }

        /// <summary>
        /// .ouija-board: radial-gradient(ellipse at center, #5a4630, #2a2016) with border-radius
        /// 40px / 24px, drawn at the board's size (USS takes one radius per corner).
        /// </summary>
        static Texture2D Board(int w, int h)
        {
            if (w <= 0 || h <= 0) return null;
            long key = (long)w << 20 | (uint)h;
            Texture2D tex;
            if (boards.TryGetValue(key, out tex)) return tex;
            Color c0 = new Color32(0x5a, 0x46, 0x30, 255), c1 = new Color32(0x2a, 0x20, 0x16, 255);
            float rx = Mathf.Min(40, w / 2f), ry = Mathf.Min(24, h / 2f);
            var px = new Color32[w * h];
            for (int y = 0; y < h; y++)
                for (int x = 0; x < w; x++)
                {
                    float fx = x + 0.5f, fy = y + 0.5f;
                    float u = fx / w * 2 - 1, v = fy / h * 2 - 1;
                    var c = Color.Lerp(c0, c1, Mathf.Clamp01(Mathf.Sqrt(u * u + v * v) / Mathf.Sqrt(2)));
                    c.a = Coverage(RoundBoxDist(fx, h - fy, w, h, rx, ry, rx, ry));
                    px[y * w + x] = c;
                }
            tex = new Texture2D(w, h, TextureFormat.RGBA32, false, false) { wrapMode = TextureWrapMode.Clamp, filterMode = FilterMode.Bilinear };
            tex.SetPixels32(px);
            tex.Apply();
            boards[key] = tex;
            return tex;
        }

        /// <summary>
        /// #planchette: a ring of rgba(230, 214, 180, 0.9) round a clear hole (radial-gradient at 50% 40%,
        /// clear to 7 px, ring from 8 px), border-radius 50% 50% 45% 45%, and its shadow 0 2px 6px
        /// rgba(0, 0, 0, 0.6), which CSS draws only outside the shape. The texture has 8 px round it for the shadow.
        /// </summary>
        static Texture2D Planchette()
        {
            if (planchetteTex != null) return planchetteTex;
            const int s = 2, P = PlanchettePad;
            int w = (PlanchetteW + 2 * P) * s, h = (PlanchetteH + 2 * P) * s;
            var ring = new Color(230 / 255f, 214 / 255f, 180 / 255f, 0.9f);
            var px = new Color32[w * h];
            for (int ty = 0; ty < h; ty++)
                for (int tx = 0; tx < w; tx++)
                {
                    // In CSS pixels from the shape's top-left; texture rows run bottom-up.
                    float x = (tx + 0.5f) / s - P, y = (h - ty - 0.5f) / s - P;
                    float cover = Coverage(Egg(x, y) * s);
                    float hole = Mathf.Sqrt((x - PlanchetteW * 0.5f) * (x - PlanchetteW * 0.5f) + (y - PlanchetteH * 0.4f) * (y - PlanchetteH * 0.4f));
                    float fillA = ring.a * Mathf.Clamp01(hole - 7);
                    float inA = cover * fillA;
                    // The blurred shadow, 2 px down: a 6 px blur is a Gaussian of σ 3 across the edge.
                    float shadow = 0.6f * Phi(-Egg(x, y - 2) / 3f) * (1 - cover);
                    float a = inA + shadow * (1 - inA);
                    var c = a > 0 ? new Color(ring.r * inA / a, ring.g * inA / a, ring.b * inA / a, a) : new Color(0, 0, 0, 0);
                    px[ty * w + tx] = c;
                }
            planchetteTex = new Texture2D(w, h, TextureFormat.RGBA32, false, false) { wrapMode = TextureWrapMode.Clamp, filterMode = FilterMode.Bilinear };
            planchetteTex.SetPixels32(px);
            planchetteTex.Apply();
            return planchetteTex;
        }

        /// <summary>Distance outside the planchette's shape (negative inside), y down from its top.</summary>
        static float Egg(float x, float y)
        {
            // border-radius 50% 50% 45% 45%: the top corners 17 x 20, the bottom ones 15.3 x 18.
            return RoundBoxDist(x, y, PlanchetteW, PlanchetteH, PlanchetteW * 0.5f, PlanchetteH * 0.5f, PlanchetteW * 0.45f, PlanchetteH * 0.45f);
        }

        /// <summary>
        /// About the signed distance to a box w x h, y down, whose top corners are ellipses trx x try
        /// and bottom corners brx x bry (negative inside).
        /// </summary>
        static float RoundBoxDist(float x, float y, float w, float h, float trx, float trY, float brx, float bry)
        {
            bool top = y < h / 2;
            float ex = top ? trx : brx, ey = top ? trY : bry;
            float cx = x < w / 2 ? ex : w - ex, cy = top ? ey : h - ey;
            float dx = x - cx, dy = y - cy;
            if ((x < w / 2 ? dx < 0 : dx > 0) && (top ? dy < 0 : dy > 0))
            {
                // The ellipse's implicit value over its gradient: close to the distance near the edge.
                float q = dx * dx / (ex * ex) + dy * dy / (ey * ey) - 1;
                float gx = 2 * dx / (ex * ex), gy = 2 * dy / (ey * ey);
                return q / Mathf.Max(1e-4f, Mathf.Sqrt(gx * gx + gy * gy));
            }
            float ox = Mathf.Max(-x, x - w), oy = Mathf.Max(-y, y - h);
            if (ox > 0 || oy > 0) return Mathf.Sqrt(Mathf.Max(ox, 0) * Mathf.Max(ox, 0) + Mathf.Max(oy, 0) * Mathf.Max(oy, 0));
            return Mathf.Max(ox, oy);
        }

        /// <summary>How much of a pixel a shape covers, from the distance to its edge (in pixels).</summary>
        static float Coverage(float dist) { return Mathf.Clamp01(0.5f - dist); }

        /// <summary>The normal distribution's cumulative function (a Gaussian blur across a straight edge).</summary>
        static float Phi(float z)
        {
            // Abramowitz and Stegun 7.1.26 for erf.
            float x = Mathf.Abs(z) / Mathf.Sqrt(2), t = 1 / (1 + 0.3275911f * x);
            float erf = 1 - (((((1.061405429f * t - 1.453152027f) * t) + 1.421413741f) * t - 0.284496736f) * t + 0.254829592f) * t * Mathf.Exp(-x * x);
            return 0.5f * (1 + (z < 0 ? -erf : erf));
        }
    }
}
