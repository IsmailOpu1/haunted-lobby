using System;
using UnityEngine;
using UnityEngine.UIElements;

namespace Haunted.Game
{
    /// <summary>
    /// Step E4: the mic check (index.html #screen-mic, main.ts setVoice). The server refuses Ready
    /// until it has heard you read the line at your normal volume, unless voice is off there or it is
    /// a debug server (micOptional). The screen opens by itself the first time a check is needed.
    /// </summary>
    public partial class Menus
    {
        /// <summary>The voice states main.ts shows.</summary>
        public enum MicState { Off, Connecting, NoMic, Failed, NeedsCheck, Checking, Ready }

        /// <summary>Sends "micCheck" to the server.</summary>
        public Action StartMicCheck;
        /// <summary>Your own microphone, 0 to 1.</summary>
        public Func<float> MicLevel;

        Label micSentence, micStatus, optionsMicStatus;
        VisualElement micFill, optionsMic;
        Button micCheckButton, micDone, micGo;
        bool micNeeded, micScreenShown, micInRoom;

        void BuildMic()
        {
            Screen("mic", out var col);
            Text(col, "eyebrow", "Before the night", 15);
            Text(col, "screen-title", "Mic check");
            Text(col, "lead", "The ghost hears your real voice. Read the line below at your normal speaking volume, so the game knows what normal sounds like for you. Later, whisper to stay hidden.", 23.25f);
            micSentence = Text(col, "mic-line", "The old hotel is quiet tonight, but someone is still walking upstairs.", 29.4f);
            var meter = Box(col, "mic-meter");
            micFill = Box(meter, "mic-fill");
            micStatus = Text(col, "muted-line", "", 20.25f);
            micCheckButton = Primary(col, "Start mic check", () => StartMicCheck?.Invoke());
            // One button in the browser (data-back: a step back) that turns primary (with its arrow) once you can play: two
            // here, one shown. The quiet one comes first so a test's click finds the one on show.
            micDone = Quiet(col, "Continue to the room", Back);
            micGo = Primary(col, "Continue to the room", Back);
            micGo.style.display = DisplayStyle.None;
            Gap(col, 16);
        }

        /// <summary>Options' Microphone group (hidden while voice is off), built in BuildOptions.</summary>
        void BuildOptionsMic(VisualElement col)
        {
            optionsMic = Group(col, "Microphone");
            optionsMicStatus = Text(optionsMic, "muted-line", "", 20.25f);
            Quiet(optionsMic, "Test your mic or check it again", () => Go("mic"));
            optionsMic.style.display = DisplayStyle.None;
        }

        /// <summary>main.ts setVoice: the mic screen's words and buttons for a voice state.</summary>
        public void SetVoice(MicState state, string error = null, bool optional = false)
        {
            optionsMic.style.display = state == MicState.Off ? DisplayStyle.None : DisplayStyle.Flex;
            micStatus.RemoveFromClassList("error");
            micCheckButton.style.display = DisplayStyle.None;
            micSentence.style.display = DisplayStyle.Flex;
            bool canPlay = state == MicState.Off || state == MicState.Ready;
            string status = "";
            switch (state)
            {
                case MicState.Connecting: status = "Connecting voice chat..."; break;
                case MicState.NoMic:
                    status = "A microphone is required. Plug one in or allow microphone access in Windows, then restart the game.";
                    micStatus.AddToClassList("error");
                    break;
                case MicState.Failed:
                    status = "Voice chat could not connect. You can still play without voice.";
                    micStatus.AddToClassList("error");
                    canPlay = true;
                    break;
                case MicState.NeedsCheck:
                    status = error ?? "Press the button, then read the line out loud.";
                    if (error != null) micStatus.AddToClassList("error");
                    micCheckButton.style.display = DisplayStyle.Flex;
                    break;
                case MicState.Checking: status = "Listening... keep reading at your normal volume."; break;
                case MicState.Ready:
                    status = "Mic check done. Remember: whisper to hide from the ghost.";
                    micSentence.style.display = DisplayStyle.None;
                    break;
            }
            // A debug server lets you play without a mic; the ghost hears you as talking normally.
            if ((state == MicState.NoMic || state == MicState.NeedsCheck) && optional)
            {
                canPlay = true;
                const string note = "This is a test server, so you can play without a mic (the ghost hears you as talking normally).";
                if (state == MicState.NoMic)
                {
                    micStatus.RemoveFromClassList("error");
                    status = "No microphone. " + note;
                }
                else status += " Or skip it: " + char.ToLowerInvariant(note[0]) + note.Substring(1);
            }
            micNeeded = !canPlay;
            micStatus.text = "<line-height=20.25px>" + status;
            optionsMicStatus.text = micStatus.text;
            // Done (or not needed): the way on is the main button. Not done yet: you can come back later.
            bool main = canPlay && state != MicState.NeedsCheck;
            micDone.text = canPlay ? "Continue to the room" : "Do it later";
            micDone.style.display = main ? DisplayStyle.None : DisplayStyle.Flex;
            micGo.style.display = main ? DisplayStyle.Flex : DisplayStyle.None;
            hintKey = "";
            regapDue = true;
            // The first time a check is needed (or a required mic is missing), the screen opens by itself.
            bool attention = state == MicState.NeedsCheck || (state == MicState.NoMic && !canPlay);
            if (attention && micInRoom && !micScreenShown && Current == "room")
            {
                micScreenShown = true;
                Go("mic");
            }
        }

        /// <summary>In a room or not: the mic screen only opens itself in one.</summary>
        public void MicInRoom(bool inRoom)
        {
            micInRoom = inRoom;
            if (!inRoom) { micScreenShown = false; micNeeded = false; }
        }

        /// <summary>The room page's foot line: what is missing first (main.ts showLookHint).</summary>
        string LookHintText(string otherwise) => micNeeded ? "Do the mic check before you play." : otherwise;

        void TickMic()
        {
            if (Current != "mic" || micFill == null) return;
            float level = MicLevel != null ? Mathf.Clamp01(MicLevel()) : 0;
            float pct = Mathf.Round(level * 100);
            micFill.style.width = Length.Percent(pct);
            // The meter's rounded clip draws white in the menus' texture, so the fill rounds itself:
            // its right end only once it reaches the meter's.
            var right = new StyleLength(pct >= 99 ? 3f : 0f);
            micFill.style.borderTopRightRadius = right;
            micFill.style.borderBottomRightRadius = right;
        }
    }
}
