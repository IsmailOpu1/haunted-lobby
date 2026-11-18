using System;
using System.Collections.Generic;
using UnityEngine;

namespace Haunted.Game
{
    /// <summary>One of the eight characters (GDD 22.1): its body, its Low copy, and your hand holding the torch.</summary>
    [Serializable]
    public class CharacterModelArt
    {
        /// <summary>shared/src/characters.ts id ("priest").</summary>
        public string id;
        /// <summary>The imported glTF (engine/Assets/Hotel/Characters), a Mixamo skeleton standing at its origin.</summary>
        public GameObject model;
        /// <summary>Low quality's copy (characters/low): a quarter of the triangles, 1K textures, the same skeleton.</summary>
        public GameObject low;
        /// <summary>The torch in this character's own hand and sleeve (assets/held/held_&lt;id&gt;).</summary>
        public GameObject held;
    }

    /// <summary>
    /// The people (step D3 of docs/plans/engine-port.md), made by the editor command ImportCharacters
    /// (Haunted.Editor.CharacterImport) from tools/engine-rooms.ts --characters. Lives in
    /// engine/Assets/Hotel/Resources, which is never committed: without it players stay plain bodies.
    /// </summary>
    public class CharacterArt : ScriptableObject
    {
        public List<CharacterModelArt> characters = new List<CharacterModelArt>();
        /// <summary>The torch in a plain hand, before you are dealt a character.</summary>
        public GameObject heldTorch;
        /// <summary>
        /// The torch's lens glass ready to glow (glTFast's _EMISSIVE on): the glTF's own has no glow,
        /// so the game would have no shader for it. HeldTorch puts it on every held torch's lens.
        /// </summary>
        public Material heldLens;
        /// <summary>
        /// characterModels.ts CLIPS, made ready as it makes them: only the hips move the body, without
        /// drifting across the floor (the server moves the player), and the fall trimmed to the landing.
        /// Legacy clips by bone path; every character has the same skeleton.
        /// </summary>
        public List<AnimationClip> clips = new List<AnimationClip>();
        /// <summary>How far the animations' own body has its hips from its root (m): each body scales the hips' movement to its legs.</summary>
        public float animHipsM;

        public CharacterModelArt Of(string id)
        {
            foreach (var c in characters) if (c.id == id) return c;
            return null;
        }

        static CharacterArt loaded;
        static bool tried;

        public static CharacterArt Load()
        {
            if (!tried)
            {
                tried = true;
                loaded = Resources.Load<CharacterArt>("CharacterArt");
            }
            return loaded;
        }
    }
}
