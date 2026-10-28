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
  // coneHalfAngleDeg: how wide the beam is, for what it lights (the client's beam and a possessed's glowing eyes).
  flashlight: { coneM: 12, coneHalfAngleDeg: 26, darkVisionM: 2, flickerGhostM: 15, deadGhostM: 5, deadSec: 2 },
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
    // How often one player's noisy fails can reach the ghost.
    noiseCooldownSec: 1,
    // Hands-on tasks in the 3D world (GDD 26.5), each aimed at 10 to 20 s. Mouse movement is
    // in screen pixels; "Px" numbers are how far you move the mouse while holding the button.
    hands: {
      // A match in your hand (candelabra, letter): flick down while holding the button to strike
      // it (a weaker flick only sparks). It burns burnSec; turning the view faster than
      // outRadPerSec blows it out, and a new one takes newMatchSec to reach for.
      match: { burnSec: 8, strikePxPerSec: 1500, sparkPxPerSec: 600, newMatchSec: 1, outRadPerSec: 3.5 },
      // Hold the flame on each wick (within aimM of its tip) until it catches; it cools off the flame.
      candelabra: { wicks: 5, lightSec: 1.5, coolPerSec: 1, aimM: 0.045 },
      // The letter hangs from the mantel and sways in the draught (swayM each way). Keep the flame
      // within aimM under it until it has had catchSec of heat; it cools off the flame. Then it
      // burns for burnSec and drops into the grate.
      letter: { catchSec: 6, coolPerSec: 0.6, burnSec: 1.5, swayM: 0.14, swayPeriodSec: 2.6, aimM: 0.07 },
      // A puzzle (GDD 26.5): set the stopped clock to the time in the guest book. Grab the face and
      // drag to turn the minute hand (degPerPx, at most maxDegPerSec); it ticks every tickMin. Let go
      // within toleranceMin of the time and after settleSec it starts.
      clock: { degPerPx: 0.6, maxDegPerSec: 300, toleranceMin: 2, settleSec: 0.6, tickMin: 5 },
      // Turn the heavy valve wheel (at most maxDegPerSec) to bring the gauge's needle into the safe
      // band and keep it there holdSec. Each wheel position gives a steady pressure (fully open lowers
      // it by dropFullOpen); the needle follows with a lag and draughts wobble it.
      boiler: { degPerPx: 0.3, maxDegPerSec: 60, maxOpenDeg: 360, startPressure: 0.95, dropFullOpen: 0.8, followPerSec: 1.2, wobble: 0.04, safeMin: 0.45, safeMax: 0.6, holdSec: 5 },
      // Grab a crooked portrait and drag sideways to level it (heavy: at most maxDegPerSec). Let go
      // within levelDeg and it settles after holdSec. One is haunted and swings crooked once more.
      portraits: { count: 3, minTiltDeg: 20, maxTiltDeg: 35, degPerPx: 0.15, maxDegPerSec: 18, levelDeg: 2, holdSec: 1, hauntedReturnDeg: 25 },
      // A puzzle (GDD 26.5): two jugs, a pump and a bucket. Get exactly target into the vase (it
      // holds vaseCap). One puzzle is picked at random; each fill, pour or tip takes pourSec.
      roses: {
        puzzles: [
          { jugs: [3, 5], target: 4 },
          { jugs: [5, 7], target: 3 },
          { jugs: [4, 9], target: 6 },
        ],
        vaseCap: 12,
        pourSec: 1.2,
      },
      // Grab a plug from its hook and drag it (mPerPx, at most maxMPerSec) onto the socket with the
      // same colour; hold it there seatSec while it seats. The wrong socket sparks and throws it back.
      switchboard: { cables: 4, mPerPx: 0.0012, maxMPerSec: 0.6, snapM: 0.05, seatSec: 1.5 },
      // A cloth in your hand: hold the button on the mirror and move the mouse to wipe (a brushM
      // wide patch). Faster than maxMPerSec (judged over paceSec) only smears. Done at clearPct.
      // Sometimes a face shows in the glass for faceSec once it is faceAtPct clear (a scare only).
      mirror: { cols: 12, rows: 16, widthM: 0.6, heightM: 0.9, brushM: 0.08, mPerPx: 0.0012, maxMPerSec: 0.35, paceSec: 0.15, clearPct: 90, faceChance: 0.5, faceAtPct: 55, faceSec: 0.9 },
      // Press the sprung lid down (pressPx of dragging) and hold it shut pressSec until it clicks. Then
      // turn each latch a quarter (degPerPx, at most maxDegPerSec), each within popSec of the last,
      // or the lid bursts open again.
      trunk: { pressPx: 160, springPerSec: 2, pressSec: 2, latches: 3, degPerPx: 0.5, maxDegPerSec: 45, popSec: 5 },
      // A puzzle (GDD 26.5): the piano plays a tune (a note every notePlaySec, its key down for
      // noteShowSec) after listenPauseSec; play it back. Each of the rounds adds a note to the
      // firstNotes. A key rings ringSec. A wrong key is a sour, noisy note, and after wrongPauseSec
      // the tune plays again.
      piano: { keys: 8, rounds: 3, firstNotes: 4, notePlaySec: 0.55, noteShowSec: 0.35, ringSec: 0.3, listenPauseSec: 0.8, wrongPauseSec: 1.2 },
      // Fold the sheet in half three times: grab it and pull (pxPerFold of dragging, at most
      // maxPerSec of a fold a second). Let go short of snapAt and it slides back (dropPerSec).
      sheets: { folds: 3, pxPerFold: 500, maxPerSec: 0.35, snapAt: 0.97, dropPerSec: 3 },
      // Rock the cradle by pushing it with the mouse (pushRadPerPx). It swings on its own with
      // periodSec and slows by dampPerSec. While the swing stays between minAmpRad and maxAmpRad the
      // baby calms; fillSec of that and it sleeps. Past cryAmpRad, or a push faster than
      // cryPxPerSec, the baby cries (a noise), losing cryLoseSec and calming for none of cryPauseSec.
      cradle: { periodSec: 2.2, pushRadPerPx: 0.002, dampPerSec: 0.25, minAmpRad: 0.12, maxAmpRad: 0.3, cryAmpRad: 0.42, cryPxPerSec: 1500, fillSec: 11, cryLoseSec: 2, cryPauseSec: 1.5 },
      // Drag each shutter shut (open 1 to shut 0) and hold it until the latch clicks. The wind
      // pulls on it, and gusts you can hear coming pull harder. Let go nearly shut and it slams.
      shutters: { count: 3, pxToClose: 420, windPerSec: 0.08, gustEverySec: [2.5, 4.5], warnSec: 0.9, gustSec: 1.1, gustPerSec: 0.9, heldGustFactor: 0.6, latchAt: 0.05, latchSec: 2.2, slamBelow: 0.4 },
      // Turn each knob to its narrow "off" notch at 0 degrees. Turned slower than catchDegPerSec
      // it clicks into the notch and the flame dies over settleSec; faster, it slips past.
      stove: { knobs: 3, degPerPx: 0.25, startMinDeg: 90, startMaxDeg: 240, notchDeg: 8, catchDegPerSec: 120, detentDeg: 10, settleSec: 2 },
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
    // Chosen in Phase 4: reach for searching a spot or picking a relic up, the shortest time
    // the server accepts for a taking minigame, how far away a dropped relic can be seen,
    // and how often each player hears where nearby relics are.
    useRangeM: 1.5,
    serverMinSec: 6,
    seeDroppedM: 15,
    nearUpdateHz: 5,
    // Searching a group of places (GDD 26.5): an empty place takes a short search and makes a
    // small noise; the server refuses a search shorter than serverMinSec. The whisper is
    // "close" within closeM and "very close" within veryCloseM; its arrow shows only beyond closeM.
    search: { serverMinSec: 2, noiseM: 5, closeM: 3, veryCloseM: 1 },
    hands: {
      // Scoop by moving the mouse down while holding the button. Searching a place takes
      // searchPx of scooping; taking the relic out takes takePx more. Faster than maxPxPerSec
      // only counts fastFactor of the extra and throws soil (a noise).
      dig: { searchPx: 1800, takePx: 4200, maxPxPerSec: 700, fastFactor: 0.3 },
      // A dial lock: turn the dial (degPerPx) right to the first pin, left to the next, and so on.
      // A pin clicks if the dial passes it no faster than clickDegPerSec; each is minGapDeg to
      // maxGapDeg on from the last. The dial ticks every tickDeg so you can hear your speed.
      lockbox: { pins: 4, degPerPx: 0.4, clickDegPerSec: 70, minGapDeg: 90, maxGapDeg: 200, tickDeg: 15 },
      // Reach into the dark water: the hand moves mPerPx (at most maxMPerSec) in a sizeM square. Within
      // feelM of the relic, hold still (under stillMPerSec) for grabSec to grip it, then pull up
      // pullPx (at most pullPxPerSec). Let go while pulling and it slips back.
      drain: { sizeM: 0.5, relicMinM: 0.18, mPerPx: 0.0008, maxMPerSec: 0.12, feelM: 0.07, stillMPerSec: 0.03, grabSec: 2.5, pullPx: 500, pullPxPerSec: 200 },
    },
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
    // How often a possessed player is told their cooldowns and curse glow.
    statusEverySec: 0.5,
  },
  meetings: {
    bellUsesPerPlayer: 1,
    bellOptions: [0, 1, 2, 3],
    bellHoldSec: 2,
    reportRangeM: 3,
    // How long to hold E on a body to report it, and how long the vote's result stays up (GDD 26.12).
    reportHoldSec: 1,
    resultSec: 6,
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
