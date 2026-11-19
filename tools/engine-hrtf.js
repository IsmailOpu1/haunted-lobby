// Step D4 of docs/plans/engine-port.md: the browser's 3D footsteps go through Web Audio's "HRTF"
// panner (audio.ts step), which Unity does not have. This takes that panner's response for every
// direction, as the browser itself computes it, so the Unity version (HrtfSteps.cs) can give its
// steps the same sound and loudness from each direction.
//
// Run it in the console of the dev client (npm run dev -w client, http://localhost:5173), any page.
// It renders an impulse through an HRTF PannerNode at 48 kHz (the usual rate; Chrome's HRTF is
// louder at other device rates, so the device's own rate is not used) from each direction:
// azimuth every 5 degrees (0 ahead, 90 to the right), elevation -45 to 90 every 7.5 degrees, at
// a distance where the distance gain is 1. Chrome's panner adds 256 samples of latency, so each
// response is kept from there, 320 samples (every response has ended by then).
// It posts the result to the dev server (/__shot, saved as assets-src/build/room-shots/browser/
// hrtf.bytes.png); copy that file to engine/Assets/Resources/Data/hrtf.bytes.
//
// File format (little-endian), a 32-byte header: "HRTF", int32 rate, int32 azimuths,
// int32 elevations, float32 first elevation, float32 elevation step, int32 taps, float32 scale;
// then int16 samples (value = sample / scale) ordered by elevation, azimuth, ear (left, right), tap.
(async () => {
  const RATE = 48000, AZ_STEP = 5, EL_MIN = -45, EL_STEP = 7.5, EL_COUNT = 19, LATENCY = 256, TAPS = 320;
  const azCount = 360 / AZ_STEP;
  const responses = [];
  let peak = 0;
  for (let e = 0; e < EL_COUNT; e++) {
    for (let a = 0; a < azCount; a++) {
      const az = (a * AZ_STEP * Math.PI) / 180, el = ((EL_MIN + e * EL_STEP) * Math.PI) / 180;
      const oc = new OfflineAudioContext(2, LATENCY + TAPS + 128, RATE);
      const impulse = oc.createBuffer(1, 1, RATE);
      impulse.getChannelData(0)[0] = 1;
      const source = oc.createBufferSource();
      source.buffer = impulse;
      const panner = oc.createPanner();
      panner.panningModel = "HRTF";
      panner.distanceModel = "inverse";
      panner.refDistance = 1000;
      panner.maxDistance = 10000;
      panner.positionX.value = Math.sin(az) * Math.cos(el);
      panner.positionY.value = Math.sin(el);
      panner.positionZ.value = -Math.cos(az) * Math.cos(el);
      source.connect(panner).connect(oc.destination);
      source.start();
      const out = await oc.startRendering();
      for (let ear = 0; ear < 2; ear++) {
        const r = out.getChannelData(ear).slice(LATENCY, LATENCY + TAPS);
        for (const v of r) peak = Math.max(peak, Math.abs(v));
        responses.push(r);
      }
    }
  }
  const scale = 32767 / peak;
  const HEAD = 32;
  const buf = new ArrayBuffer(HEAD + responses.length * TAPS * 2);
  const dv = new DataView(buf);
  [..."HRTF"].forEach((c, i) => dv.setUint8(i, c.charCodeAt(0)));
  dv.setInt32(4, RATE, true);
  dv.setInt32(8, azCount, true);
  dv.setInt32(12, EL_COUNT, true);
  dv.setFloat32(16, EL_MIN, true);
  dv.setFloat32(20, EL_STEP, true);
  dv.setInt32(24, TAPS, true);
  dv.setFloat32(28, scale, true);
  let o = HEAD;
  for (const r of responses) for (const v of r) { dv.setInt16(o, Math.round(v * scale), true); o += 2; }
  await fetch("/__shot/hrtf.bytes.png", { method: "POST", body: buf });
  console.log(`HRTF: ${responses.length / 2} directions, peak ${peak.toFixed(3)}, saved`);
})();
