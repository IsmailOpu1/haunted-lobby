// 
// THIS FILE HAS BEEN GENERATED AUTOMATICALLY
// DO NOT CHANGE IT MANUALLY UNLESS YOU KNOW WHAT YOU'RE DOING
// 
// GENERATED USING @colyseus/schema 5.0.42
// 

public partial class TaskStation : global::Colyseus.Schema.Schema {
#if UNITY_5_3_OR_NEWER
	[global::UnityEngine.Scripting.Preserve]
#endif
	public TaskStation() { }

	[global::Colyseus.Schema.Type(0, "boolean")]
	public bool done = default(bool);

	[global::Colyseus.Schema.Type(1, "string")]
	public string clue = default(string);
}

