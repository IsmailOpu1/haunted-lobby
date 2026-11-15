// 
// THIS FILE HAS BEEN GENERATED AUTOMATICALLY
// DO NOT CHANGE IT MANUALLY UNLESS YOU KNOW WHAT YOU'RE DOING
// 
// GENERATED USING @colyseus/schema 5.0.42
// 

public partial class Door : global::Colyseus.Schema.Schema {
#if UNITY_5_3_OR_NEWER
	[global::UnityEngine.Scripting.Preserve]
#endif
	public Door() { }

	[global::Colyseus.Schema.Type(0, "boolean")]
	public bool open = default(bool);

	[global::Colyseus.Schema.Type(1, "boolean")]
	public bool locked = default(bool);
}

