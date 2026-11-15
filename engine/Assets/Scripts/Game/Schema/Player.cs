// 
// THIS FILE HAS BEEN GENERATED AUTOMATICALLY
// DO NOT CHANGE IT MANUALLY UNLESS YOU KNOW WHAT YOU'RE DOING
// 
// GENERATED USING @colyseus/schema 5.0.42
// 

public partial class Player : global::Colyseus.Schema.Schema {
#if UNITY_5_3_OR_NEWER
	[global::UnityEngine.Scripting.Preserve]
#endif
	public Player() { }

	[global::Colyseus.Schema.Type(0, "string")]
	public string name = default(string);

	[global::Colyseus.Schema.Type(1, "float32")]
	public double x = default(double);

	[global::Colyseus.Schema.Type(2, "float32")]
	public double z = default(double);

	[global::Colyseus.Schema.Type(3, "float32")]
	public double yaw = default(double);

	[global::Colyseus.Schema.Type(4, "float32")]
	public double pitch = default(double);

	[global::Colyseus.Schema.Type(5, "boolean")]
	public bool crouching = default(bool);

	[global::Colyseus.Schema.Type(6, "boolean")]
	public bool flashlightOn = default(bool);

	[global::Colyseus.Schema.Type(7, "float32")]
	public double stamina = default(double);

	[global::Colyseus.Schema.Type(8, "float32")]
	public double regenWait = default(double);

	[global::Colyseus.Schema.Type(9, "uint32")]
	public uint lastSeq = default(uint);

	[global::Colyseus.Schema.Type(10, "string")]
	public string health = default(string);

	[global::Colyseus.Schema.Type(11, "float32")]
	public double bleedLeft = default(double);

	[global::Colyseus.Schema.Type(12, "string")]
	public string hidingSpot = default(string);

	[global::Colyseus.Schema.Type(13, "boolean")]
	public bool holdingBreath = default(bool);

	[global::Colyseus.Schema.Type(14, "float32")]
	public double breathCooldown = default(double);

	[global::Colyseus.Schema.Type(15, "string")]
	public string action = default(string);

	[global::Colyseus.Schema.Type(16, "float32")]
	public double actionProgress = default(double);

	[global::Colyseus.Schema.Type(17, "uint8")]
	public byte salt = default(byte);

	[global::Colyseus.Schema.Type(18, "uint8")]
	public byte cameraShots = default(byte);

	[global::Colyseus.Schema.Type(19, "string")]
	public string relic = default(string);

	[global::Colyseus.Schema.Type(20, "boolean")]
	public bool voted = default(bool);

	[global::Colyseus.Schema.Type(21, "boolean")]
	public bool bodyGone = default(bool);

	[global::Colyseus.Schema.Type(22, "uint8")]
	public byte bellUses = default(byte);

	[global::Colyseus.Schema.Type(23, "float32")]
	public double bodyX = default(double);

	[global::Colyseus.Schema.Type(24, "float32")]
	public double bodyZ = default(double);

	[global::Colyseus.Schema.Type(25, "string")]
	public string character = default(string);

	[global::Colyseus.Schema.Type(26, "boolean")]
	public bool ready = default(bool);

	[global::Colyseus.Schema.Type(27, "boolean")]
	public bool connected = default(bool);
}

