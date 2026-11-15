// 
// THIS FILE HAS BEEN GENERATED AUTOMATICALLY
// DO NOT CHANGE IT MANUALLY UNLESS YOU KNOW WHAT YOU'RE DOING
// 
// GENERATED USING @colyseus/schema 5.0.42
// 

public partial class GameState : global::Colyseus.Schema.Schema {
#if UNITY_5_3_OR_NEWER
	[global::UnityEngine.Scripting.Preserve]
#endif
	public GameState() { }

	[global::Colyseus.Schema.Type(0, "map", typeof(global::Colyseus.Schema.MapSchema<Player>))]
	public global::Colyseus.Schema.MapSchema<Player> players = new global::Colyseus.Schema.MapSchema<Player>();

	[global::Colyseus.Schema.Type(1, "map", typeof(global::Colyseus.Schema.MapSchema<Door>))]
	public global::Colyseus.Schema.MapSchema<Door> doors = new global::Colyseus.Schema.MapSchema<Door>();

	[global::Colyseus.Schema.Type(2, "map", typeof(global::Colyseus.Schema.MapSchema<SaltLine>))]
	public global::Colyseus.Schema.MapSchema<SaltLine> saltLines = new global::Colyseus.Schema.MapSchema<SaltLine>();

	[global::Colyseus.Schema.Type(3, "map", typeof(global::Colyseus.Schema.MapSchema<SaltJar>))]
	public global::Colyseus.Schema.MapSchema<SaltJar> saltJars = new global::Colyseus.Schema.MapSchema<SaltJar>();

	[global::Colyseus.Schema.Type(4, "map", typeof(global::Colyseus.Schema.MapSchema<TaskStation>))]
	public global::Colyseus.Schema.MapSchema<TaskStation> stations = new global::Colyseus.Schema.MapSchema<TaskStation>();

	[global::Colyseus.Schema.Type(5, "map", typeof(global::Colyseus.Schema.MapSchema<Relic>))]
	public global::Colyseus.Schema.MapSchema<Relic> relics = new global::Colyseus.Schema.MapSchema<Relic>();

	[global::Colyseus.Schema.Type(6, "map", typeof(global::Colyseus.Schema.MapSchema<SearchPlace>))]
	public global::Colyseus.Schema.MapSchema<SearchPlace> searchPlaces = new global::Colyseus.Schema.MapSchema<SearchPlace>();

	[global::Colyseus.Schema.Type(7, "uint16")]
	public ushort tasksDone = default(ushort);

	[global::Colyseus.Schema.Type(8, "uint16")]
	public ushort tasksTotal = default(ushort);

	[global::Colyseus.Schema.Type(9, "string")]
	public string stage = default(string);

	[global::Colyseus.Schema.Type(10, "float32")]
	public double stageLeft = default(double);

	[global::Colyseus.Schema.Type(11, "string")]
	public string host = default(string);

	[global::Colyseus.Schema.Type(12, "float32")]
	public double nightTime = default(double);

	[global::Colyseus.Schema.Type(13, "float32")]
	public double nightLength = default(double);

	[global::Colyseus.Schema.Type(14, "string")]
	public string part = default(string);

	[global::Colyseus.Schema.Type(15, "boolean")]
	public bool overtime = default(bool);

	[global::Colyseus.Schema.Type(16, "boolean")]
	public bool ritualReady = default(bool);

	[global::Colyseus.Schema.Type(17, "boolean")]
	public bool ritualStarted = default(bool);

	[global::Colyseus.Schema.Type(18, "float32")]
	public double ritualProgress = default(double);

	[global::Colyseus.Schema.Type(19, "uint8")]
	public byte circleCount = default(byte);

	[global::Colyseus.Schema.Type(20, "uint8")]
	public byte circleNeeded = default(byte);

	[global::Colyseus.Schema.Type(21, "boolean")]
	public bool blackout = default(bool);

	[global::Colyseus.Schema.Type(22, "string")]
	public string meeting = default(string);

	[global::Colyseus.Schema.Type(23, "float32")]
	public double meetingLeft = default(double);

	[global::Colyseus.Schema.Type(24, "string")]
	public string meetingCaller = default(string);

	[global::Colyseus.Schema.Type(25, "string")]
	public string meetingBody = default(string);

	[global::Colyseus.Schema.Type(26, "string")]
	public string ghostNamed = default(string);

	[global::Colyseus.Schema.Type(27, "float32")]
	public double altarWait = default(double);

	[global::Colyseus.Schema.Type(28, "float32")]
	public double taintLeft = default(double);

	[global::Colyseus.Schema.Type(29, "string")]
	public string winner = default(string);

	[global::Colyseus.Schema.Type(30, "string")]
	public string endReason = default(string);

	[global::Colyseus.Schema.Type(31, "string")]
	public string settings = default(string);

	[global::Colyseus.Schema.Type(32, "string")]
	public string settingsCode = default(string);
}

