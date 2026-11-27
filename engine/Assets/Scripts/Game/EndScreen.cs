using System;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.UIElements;

namespace Haunted.Game
{
    /// <summary>
    /// Step E5: the end screen (index.html #end-screen, main.ts showEndScreen, GDD 19): who won and
    /// why, every role, the awards, the timeline, the photos, and Rematch (the host) and Leave.
    /// </summary>
    public partial class Menus
    {
        /// <summary>Rematch (the host's) and Leave on the end screen.</summary>
        public Action EndRematch, EndLeave;

        /// <summary>Tests: whether the end screen is up.</summary>
        public bool EndUp => endScreen != null && endScreen.style.display == DisplayStyle.Flex;

        VisualElement endScreen, endRoles, endAwardsBox, endAwards, endTimelineBox, endTimeline, endPhotosBox, endPhotos;
        Label endTitle, endText, endWait;
        Button endRematch;
        object endShown;

        void BuildEnd()
        {
            endScreen = Div(topLayer, "", "end-screen");
            var scroll = new ScrollView(ScrollViewMode.Vertical) { name = "end-box" };
            scroll.horizontalScrollerVisibility = ScrollerVisibility.Hidden;
            endScreen.Add(scroll);
            var box = scroll.contentContainer;
            endTitle = HudLine(box, "", "end-title");
            endText = HudLine(box, "", "end-text");
            HudLine(box, "end-h3", null, "Roles");
            endRoles = Div(box, "", "end-roles");
            endAwardsBox = Div(box, "", null);
            HudLine(endAwardsBox, "end-h3", null, "Awards");
            endAwards = Div(endAwardsBox, "end-list", null);
            endTimelineBox = Div(box, "", null);
            HudLine(endTimelineBox, "end-h3", null, "Timeline");
            var timeline = new ScrollView(ScrollViewMode.Vertical) { name = "end-timeline" };
            timeline.AddToClassList("end-list");
            timeline.horizontalScrollerVisibility = ScrollerVisibility.Hidden;
            endTimelineBox.Add(timeline);
            endTimeline = timeline.contentContainer;
            endPhotosBox = Div(box, "", null);
            HudLine(endPhotosBox, "end-h3", null, "Photos");
            endPhotos = Box(endPhotosBox, "photo-list end-photos");
            var buttons = Div(box, "", "end-buttons");
            endRematch = new Button(() => EndRematch?.Invoke()) { text = "Rematch" };
            endRematch.AddToClassList("end-button");
            buttons.Add(endRematch);
            var leave = new Button(() => EndLeave?.Invoke()) { text = "Leave" };
            leave.AddToClassList("end-button");
            buttons.Add(leave);
            endWait = HudLine(box, "", "end-wait");
            Show(endScreen, false);
        }

        /// <summary>main.ts showEndScreen, filled once per match end; null hides it.</summary>
        public void SetEnd(Night.MatchEnd end, List<Night.Photo> photos, bool host)
        {
            Show(endScreen, end != null);
            if (end == null) { endShown = null; return; }
            Show(endRematch, host);
            Set(endWait, host ? "Rematch takes everyone back to the lobby with the same settings. Everyone gets a new character." : "Waiting for the host to start a rematch.");
            if (endShown == end) return;
            endShown = end;
            string[] text;
            if (!Night.EndText.TryGetValue(end.Reason ?? "", out text)) text = new[] { end.Winner, "" };
            // style.css h2: text-transform uppercase (USS has none).
            Set(endTitle, text[0].ToUpperInvariant());
            endTitle.EnableInClassList("possessed", end.Winner == "possessed");
            Set(endText, end.Ghost != null ? text[1] + " The ghost was " + end.Ghost + "." : text[1]);

            endRoles.Clear();
            foreach (var r in end.Roles)
            {
                var row = Div(endRoles, "end-row", null);
                HudLine(row, "", null, r.Name);
                HudLine(row, r.Role == "possessed" ? "end-role possessed" : "end-role", null, r.Role == "possessed" ? "Possessed" : "Investigator");
            }

            Show(endAwardsBox, end.Awards.Count > 0);
            endAwards.Clear();
            foreach (var a in end.Awards)
            {
                // <strong>title</strong> names <span class="award-why">why</span>, wrapping as one line of text.
                var row = Div(endAwards, "award", null);
                HudLine(row, "award-title", null, a.Title);
                HudLine(row, "", null, " " + string.Join(", ", a.Names));
                HudLine(row, "award-why", null, " " + a.Why);
            }

            Show(endTimelineBox, end.Timeline.Count > 0);
            endTimeline.Clear();
            foreach (var l in end.Timeline)
            {
                var row = Div(endTimeline, "timeline-row", null);
                HudLine(row, "timeline-time", null, l.Time);
                HudLine(row, "timeline-text", null, l.Text);
            }

            Show(endPhotosBox, photos.Count > 0);
            endPhotos.Clear();
            foreach (var p in photos) endPhotos.Add(PhotoCard(p));
        }
    }
}
