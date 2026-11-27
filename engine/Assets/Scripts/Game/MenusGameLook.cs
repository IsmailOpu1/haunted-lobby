using System.Collections.Generic;
using UnityEngine;
using UnityEngine.UIElements;

namespace Haunted.Game
{
    /// <summary>
    /// The screens as a game's menus rather than a web page's (owner, 2026-11-27: "you have seen
    /// games' options… it's supposed to go with the background… do this for everything"): the parts
    /// of a screen sit in dark glass panels over the hotel, Options is split into tabs so a tab fits
    /// without scrolling, and no screen shows a scroll bar.
    /// </summary>
    public partial class Menus
    {
        /// <summary>A screen's tabs: each tab's button and the panel it shows.</summary>
        class TabSet
        {
            public readonly List<Button> Buttons = new List<Button>();
            public readonly List<VisualElement> Pages = new List<VisualElement>();
            public int Open = -1;
        }

        readonly List<TabSet> tabSets = new List<TabSet>();

        /// <summary>
        /// Tabs over a column's groups: one tab per group, named by its title, one group shown at a
        /// time. The bar goes where the first group was. A group hidden on its own (the microphone's,
        /// while voice is off) hides its tab too.
        /// </summary>
        void Tabs(VisualElement col)
        {
            var set = new TabSet();
            var bar = new VisualElement();
            bar.AddToClassList("opt-tabs");
            VisualElement first = null;
            foreach (var g in col.Children())
            {
                if (!g.ClassListContains("group")) continue;
                if (first == null) first = g;
                var title = g.Q<Label>(className: "group-title");
                int index = set.Pages.Count;
                var b = new Button(() => OpenTab(set, index)) { text = title != null ? title.text : "" };
                b.AddToClassList("opt-tab");
                bar.Add(b);
                g.AddToClassList("tabbed");
                set.Buttons.Add(b);
                set.Pages.Add(g);
            }
            if (first == null) return;
            col.Insert(col.IndexOf(first), bar);
            tabSets.Add(set);
            OpenTab(set, 0);
        }

        void OpenTab(TabSet set, int index)
        {
            if (index == set.Open) return;
            set.Open = index;
            for (int i = 0; i < set.Pages.Count; i++)
            {
                set.Pages[i].EnableInClassList("tab-hidden", i != index);
                set.Buttons[i].EnableInClassList("on", i == index);
            }
            StopListening();
            if (openList != null) openList.style.display = DisplayStyle.None;
            var body = set.Pages[index].GetFirstAncestorOfType<ScrollView>();
            if (body != null) body.scrollOffset = Vector2.zero;
            regapDue = true;
        }

        /// <summary>Each frame: a tab shows only while its group may show (the microphone's needs voice).</summary>
        void TickTabs()
        {
            foreach (var set in tabSets)
                for (int i = 0; i < set.Pages.Count; i++)
                {
                    var want = set.Pages[i].style.display == DisplayStyle.None ? DisplayStyle.None : DisplayStyle.Flex;
                    if (set.Buttons[i].style.display != want) set.Buttons[i].style.display = want;
                }
        }

        /// <summary>Opens the tab holding e, if it is in one (a test pointing at it clicks its tab first, as a player would).</summary>
        void RevealTabOf(VisualElement e)
        {
            foreach (var set in tabSets)
                for (int i = 0; i < set.Pages.Count; i++)
                    if (set.Pages[i] == e || set.Pages[i].Contains(e)) { OpenTab(set, i); return; }
        }

        /// <summary>A dark glass panel in a column, for a screen's fields and buttons.</summary>
        static VisualElement Panel(VisualElement col)
        {
            var p = new VisualElement();
            p.AddToClassList("glass");
            col.Add(p);
            Gap(p, 16);
            return p;
        }
    }
}
