// Every gameplay number lives here (PRD Section 10.7, defaults from PRD Appendix A).
// Times are seconds, distances meters, speeds meters per second unless the key says otherwise.
// Lobby settings override these at match start. No gameplay number may appear anywhere else.

export const config = {
  players: { min: 4, max: 8 },
  possessed: {
    autoByPlayers: { 4: 1, 5: 1, 6: 1, 7: 2, 8: 2 },
    maxByPlayers: { 4: 1, 5: 1, 6: 2, 7: 2, 8: 2 },
    knowEachOther: true,
  },
  match: {
    lengthMin: 12,
    lengthOptionsMin: [10, 12, 15, 20],
    introSec: 10,
    countdownSec: 5,
    quietSec: 60, // ghost asleep, no powers, no meetings
    partSplitsPct: [33.3, 66.7], // Calm | Restless | Furious after Quiet
    overtimeSec: 30,
  },
  movement: {
    walk: 2.1,
    run: 3.3,
    crouch: 1.1,
    crawl: 0.6,
    staminaSec: 5,
    staminaRegenDelaySec: 3,
    staminaRefillSec: 15,
    relicSlowPct: 15,
    hideEnterExitSec: 1,
    breathHoldSec: 6,
    breathCooldownSec: 12,
    eyeHeightM: 1.7,
    crouchEyeHeightM: 1.0,
    downedEyeHeightM: 0.4,
  },
  body: { radiusM: 0.3, heightM: 1.8 },
  interact: { rangeM: 2, reviveRangeM: 1.5, hideRangeM: 1.5 },
  health: { reviveSec: 5, bleedOutSec: 30, postReviveImmunitySec: 3 },
  flashlight: { coneM: 12, darkVisionM: 2, flickerGhostM: 15, deadGhostM: 5, deadSec: 2 },
  camera: {
    shotsPerPlayer: 1,
    shotOptions: [0, 1, 2, 3],
    curseGlowSec: 10,
    captureRangeM: 10,
    flashVisibleM: 15,
    flashGhostHearM: 10,
    photoFovDeg: 60, // what counts as "in the frame"
  },
  salt: {
    perPlayer: 2,
    options: [1, 2, 3, 4],
    carryMax: 4,
    placeSec: 1,
    lineWidthM: 2,
    ghostFreezeSec: 3,
    jarsPerPlayerSlot: 1,
    // Chosen in Phase 4: where the line lands and how close the ghost must come to trigger it.
    placeAheadM: 1.0,
    triggerRadiusM: 0.35,
    jarRangeM: 1.5,
  },
  tasks: {
    perPlayer: 3,
    options: [2, 3, 4, 5],
    minSec: 10,
    maxSec: 20,
    noisyFailGhostHearM: 10,
    // Chosen in Phase 4: how close you must stand, and the shortest time the server accepts
    // for a finished minigame (a little under minSec so fast players are not refused).
    useRangeM: 1.5,
    serverMinSec: 7,
    // Minigame tuning (chosen in Phase 4), each aimed at 10 to 20 s. Distances are in
    // minigame units: the board is 640 wide and 400 tall, whatever the screen size.
    // How often one player's noisy fails can reach the ghost.
    noiseCooldownSec: 1,
    minigames: {
      // Shared by every task that uses a match: striking time, and the speed that blows it out.
      match: { strikeSec: 0.8, outSpeed: 1100 },
      candelabra: { wicks: 5, lightSec: 1.6 },
      stove: { knobs: 3, turnDegPerSec: 55, onMinDeg: 140, onMaxDeg: 220, offSnapDeg: 6 },
      clock: { tickSec: 0.75, turnsNeeded: 14, onBeatSec: 0.16 },
      // The letter sways in the draught; keep the flame under it. Heat fades when you lose it.
      letter: { catchSec: 6, swayUnits: 45, swayPeriodSec: 2.6, coolPerSec: 0.5, burnSec: 1.5 },
      // Follow the swinging guide; rocking too fast makes the baby cry (a noisy fail).
      cradle: { periodSec: 2.2, swingUnits: 150, matchUnits: 40, minUnitsPerSec: 60, fillSec: 11, cryUnitsPerSec: 900, cryLoseSec: 2, cryPauseSec: 1.5 },
      // Press the symbol keys in the order shown; a wrong note is a noisy fail and restarts the round.
      piano: { keys: 8, rounds: 3, notesPerRound: 5 },
      // Pressure from 0 to 1. Each valve position gives a steady pressure (fully open lowers it
      // by dropFullOpen); the needle follows with a lag, and draughts push it about a little.
      boiler: { startPressure: 0.95, safeMin: 0.45, safeMax: 0.6, holdSec: 3, dropFullOpen: 0.8, followPerSec: 1.5, wobble: 0.07, turnDegPerSec: 30, maxOpenDeg: 360 },
    },
  },
  relics: {
    count: 3,
    options: [2, 3, 4, 5],
    minSpacingM: 20,
    whisperM: 8,
    extractMinSec: 10,
    extractMaxSec: 15,
    placeSec: 3,
    carryHearingBonusPct: 25,
    dropGhostHearM: 8,
  },
  ritual: {
    baseSec: 45,
    options: [30, 45, 60],
    circleRadiusM: 4,
    circleMinByPlayers: { 4: 2, 5: 2, 6: 2, 7: 3, 8: 3 },
    extraPlayerSpeedPct: 25,
    maxSpeedBonusPct: 50,
    drainPctPerSec: 1,
  },
  taint: {
    minProgressPct: 20,
    windowSec: 5,
    cleanseSec: 2,
    cleanseSaltCost: 1,
    progressMultiplier: 0.5,
    maxPerMatch: 2,
    cooldownSec: 45,
  },
  ghost: {
    hearingM: { run: 16, walk: 8, crouch: 3, door: 12, hiddenBreath: 2 },
    sightM: { flashlightOn: 20, flashlightOff: 8 },
    preHuntSilenceSec: 2,
    hidingChecks: 2,
    hidingCheckSec: 3,
    parts: {
      calm: { wander: 1.1, hunt: 1.9, betweenHuntsSec: 75, huntSec: 20 },
      restless: { wander: 1.4, hunt: 2.2, betweenHuntsSec: 50, huntSec: 25 },
      furious: { wander: 1.8, hunt: 2.5, betweenHuntsSec: 30, huntSec: 30 },
    },
    difficulty: {
      easy: { intervalMult: 1.25, speedMult: 0.9 },
      normal: { intervalMult: 1.0, speedMult: 1.0 },
      hard: { intervalMult: 0.8, speedMult: 1.05 },
    },
    playerCountIntervalMult: { 4: 1.1, 5: 1.0, 6: 1.0, 7: 0.9, 8: 0.9 },
    ritualBetweenHuntsSec: 15,
    postMeetingGraceSec: 15,
    blackoutSpeedMult: 1.1,
    // Body and behaviour details not set in the GDD (chosen in Phase 2, tune in playtests).
    radiusM: 0.3,
    heightM: 2.1,
    catchRangeM: 0.8,
    sightFovDeg: 140,
    investigateLookSec: 3,
    // After investigating a spot, clues near it are ignored for a while so the ghost moves on.
    investigateCooldownSec: 8,
    investigateIgnoreRadiusM: 4,
    retreatSec: 8,
    reappearMinDistM: 12,
    repathSec: 0.25,
    stuckSec: 4,
    hidingCheckRadiusM: 6,
    doorOpenRangeM: 1.0,
    // Clients receive the ghost's position only within this range (anti wall-hack, PRD 10.3).
    interestRangeM: 25,
  },
  voice: {
    whisperBelowNormalDb: 10,
    shoutAboveNormalDb: 8,
    playerHearM: { whisper: 3, normal: 15, shout: 25 },
    ghostHearM: { whisper: 0, normal: 6, shout: 20 },
    fullVolumeWithinM: 3,
    wallVolumeMult: 0.5,
    subscriptionRefreshMs: 250,
    micRequired: true,
    openMicOnly: true,
    micLostAfterSec: 10,
    micLostCountsAs: "normal",
    // Loudness measurement (server side, from the real audio). dBFS: 0 is the loudest possible.
    silenceDbfs: -50, // quieter than this counts as not talking
    micCheckSec: 4, // how long the mic check listens to "your normal"
    micCheckMinVoicedSec: 1, // how much of that must be actual talking
    defaultNormalDbfs: -30, // used until a player has done the mic check
    // Voices are delivered (routed) within the loudest range; the volume curve does the rest.
    routeRangeM: 25,
    // How long your talking level is kept after you go quiet, so pauses between words do not
    // cut the start of the next word. The ghost still uses your loudness right now.
    levelHoldSec: 1.5,
    // Quiet mics are boosted toward this level when played to others (whispers stay quieter).
    playbackTargetDbfs: -20,
    maxPlaybackBoost: 4,
  },
  powers: {
    slamDoor: { unlockSec: 60, cooldownSec: 30, rangeM: 6, lockSec: 15, breakPushers: 2, breakSec: 2, ghostHearM: 12, sameVictimSec: 60 },
    summon: { unlockSec: 120, cooldownSec: 60, targetRangeM: 15, spawnMinM: 6, spawnMaxM: 10, whisperM: 5, eyeGlowSec: 1, protectAfterHitSec: 30 },
    blackout: { unlockAtPart: "restless", usesPerMatch: 1, fuseFixSec: 5, autoRestoreSec: 60 },
    cooldownSpeed: { slow: 1.25, normal: 1.0, fast: 0.75 },
  },
  meetings: {
    bellUsesPerPlayer: 1,
    bellOptions: [0, 1, 2, 3],
    bellHoldSec: 2,
    reportRangeM: 3,
    minGapSec: 30,
    evidenceSec: 30,
    evidenceOptions: [15, 30, 45, 60],
    discussionSec: 60,
    discussionOptions: [30, 60, 90, 120],
    voteSec: 20,
    voteOptions: [15, 20, 30],
    revealRole: true,
    anonymousVoting: false,
  },
  wisps: { speed: 3, canDoTasks: true, ouija: true },
  identity: { nameLitRangeM: 10, nameAlwaysWithinM: 2 },
  disconnect: { holdSec: 60 },
  // Possessed draw weight is 1 / (1 + timesPossessedThisSession) (GDD Section 19).
  rotation: { baseWeight: 1 },
  net: {
    tickRate: 20,
    slowStateRate: 5,
    interpolationMs: 100,
    // Anti speed-hack: a player may run at most this far ahead of server time.
    maxInputAheadSec: 0.25,
    maxQueuedInputs: 30,
  },
  room: { codeLength: 5, codeAlphabet: "ABCDEFGHJKLMNPQRSTUVWXYZ", nameMaxLength: 16 },
} as const;

export type Config = typeof config;
