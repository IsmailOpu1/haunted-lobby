// 
// THIS FILE HAS BEEN GENERATED AUTOMATICALLY
// DO NOT CHANGE IT MANUALLY UNLESS YOU KNOW WHAT YOU'RE DOING
// 
// GENERATED USING @colyseus/schema 5.0.42
// 

public partial class SaltLine : global::Colyseus.Schema.Schema {
#if UNITY_5_3_OR_NEWER
	[global::UnityEngine.Scripting.Preserve]
#endif
	public SaltLine() { }

	[global::Colyseus.Schema.Type(0, "float32")]
	public double x = default(double);

	[global::Colyseus.Schema.Type(1, "float32")]
	public double z = default(double);

	[global::Colyseus.Schema.Type(2, "float32")]
	public double yaw = default(double);
}

