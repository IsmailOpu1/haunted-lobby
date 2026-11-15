// 
// THIS FILE HAS BEEN GENERATED AUTOMATICALLY
// DO NOT CHANGE IT MANUALLY UNLESS YOU KNOW WHAT YOU'RE DOING
// 
// GENERATED USING @colyseus/schema 5.0.42
// 

public partial class Relic : global::Colyseus.Schema.Schema {
#if UNITY_5_3_OR_NEWER
	[global::UnityEngine.Scripting.Preserve]
#endif
	public Relic() { }

	[global::Colyseus.Schema.Type(0, "string")]
	public string name = default(string);

	[global::Colyseus.Schema.Type(1, "string")]
	public string status = default(string);

	[global::Colyseus.Schema.Type(2, "string")]
	public string carrier = default(string);
}

