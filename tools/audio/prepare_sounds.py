"""
Makes the game's recorded sounds (GDD 23 audio pass) from the CC0 Freesound downloads in
assets-src/audio/ (listed in docs/ASSETS.md): seamless loops for the ambience and trimmed,
evened-out one-shots for the creaks, written to client/public/assets/sounds/ as 16-bit WAV.

Run with Blender's Python (it has numpy):
  "C:/Program Files/Blender Foundation/Blender 5.2/5.2/python/bin/python.exe" -I tools/audio/prepare_sounds.py
"""
import os
import struct
import sys

import numpy as np

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
SRC = os.path.join(ROOT, "assets-src", "audio")
OUT = os.path.join(ROOT, "client", "public", "assets", "sounds")

# Loops: (output name, source file, loop length in seconds, sample rate, channels, crossfade seconds)
LOOPS = [
    ("room-tone", "210091__yuval__room-small-night.wav", 30, 22050, 1, 3),
    ("rumble", "273805__brainclaim__bass-rumble-in-the-distance.wav", 40, 22050, 1, 4),
    ("wind", "623604__khenshom__strong-winds-inside-house-01.wav", 36, 22050, 1, 3),
]
# One-shots: (output name, source file)
CREAKS = [
    ("creak-1", "502505__rudmer_rotteveel__wood-creak-single-v1.wav"),
    ("creak-2", "502504__rudmer_rotteveel__wood-creak-single-v2.wav"),
    ("creak-3", "502511__rudmer_rotteveel__wood-creak-single-v3.wav"),
    ("creak-4", "326460__miekyj__creaking-floor-owi.wav"),
    ("creak-5", "590169__greg_surr__creaking-in-room-6.wav"),
]
CREAK_RATE = 32000
CREAK_PEAK_DB = -3.0
LOOP_RMS_DB = -20.0
LOOP_PEAK_LIMIT_DB = -1.0
# A creak starts where it first rises this far above its quietest part, and ends where it last does.
TRIM_ABOVE_DB = 30.0
EDGE_FADE_SEC = 0.01


def read_wav(path):
    with open(path, "rb") as f:
        data = f.read()
    if data[:4] != b"RIFF" or data[8:12] != b"WAVE":
        raise ValueError(f"not a WAV file: {path}")
    pos, fmt, raw = 12, None, None
    while pos < len(data) - 8:
        cid, size = data[pos:pos + 4], struct.unpack("<I", data[pos + 4:pos + 8])[0]
        body = data[pos + 8:pos + 8 + size]
        if cid == b"fmt ":
            tag, ch, rate, _, _, bits = struct.unpack("<HHIIHH", body[:16])
            if tag == 0xFFFE:
                tag = struct.unpack("<H", body[24:26])[0]
            fmt = (tag, ch, rate, bits)
        elif cid == b"data":
            raw = body
        pos += 8 + size + (size & 1)
    tag, ch, rate, bits = fmt
    width = bits // 8
    raw = raw[: len(raw) // (width * ch) * (width * ch)]
    if tag == 3:
        x = np.frombuffer(raw, dtype="<f4" if bits == 32 else "<f8").astype(np.float64)
    elif bits == 16:
        x = np.frombuffer(raw, dtype="<i2").astype(np.float64) / 32768
    elif bits == 24:
        b = np.frombuffer(raw, dtype=np.uint8).reshape(-1, 3).astype(np.int32)
        v = b[:, 0] | (b[:, 1] << 8) | (b[:, 2] << 16)
        x = np.where(v >= 1 << 23, v - (1 << 24), v) / float(1 << 23)
    elif bits == 32:
        x = np.frombuffer(raw, dtype="<i4").astype(np.float64) / 2**31
    else:
        raise ValueError(f"{bits}-bit audio not handled: {path}")
    return x.reshape(-1, ch), rate


def write_wav(path, x, rate):
    """16-bit PCM with a little dither so quiet loops do not turn grainy."""
    ch = x.shape[1]
    dither = (np.random.default_rng(1).random(x.shape) - np.random.default_rng(2).random(x.shape)) / 32768
    pcm = np.clip(np.round((x + dither) * 32767), -32768, 32767).astype("<i2").tobytes()
    header = b"RIFF" + struct.pack("<I", 36 + len(pcm)) + b"WAVE"
    header += b"fmt " + struct.pack("<IHHIIHH", 16, 1, ch, rate, rate * ch * 2, ch * 2, 16)
    header += b"data" + struct.pack("<I", len(pcm))
    with open(path, "wb") as f:
        f.write(header + pcm)


def resample(x, src_rate, dst_rate):
    """Band-limited resampling through the spectrum (exact for these lengths, no new dependency)."""
    if src_rate == dst_rate:
        return x
    n_out = int(round(len(x) * dst_rate / src_rate))
    out = np.empty((n_out, x.shape[1]))
    for c in range(x.shape[1]):
        spec = np.fft.rfft(x[:, c])
        keep = n_out // 2 + 1
        spec = spec[:keep] if keep <= len(spec) else np.pad(spec, (0, keep - len(spec)))
        out[:, c] = np.fft.irfft(spec, n_out) * (n_out / len(x))
    return out


def to_channels(x, channels):
    return x.mean(axis=1, keepdims=True) if channels == 1 and x.shape[1] > 1 else x


def db(v):
    return 20 * np.log10(max(float(v), 1e-12))


def steadiest_start(mono, rate, seconds):
    """Where the loop should start: the stretch whose loudness changes least (no knocks, no cars)."""
    win = rate // 4
    n = len(mono) // win
    level = np.sqrt((mono[: n * win].reshape(n, win) ** 2).mean(axis=1) + 1e-12)
    span = int(seconds * 4)
    if n <= span:
        return 0
    best, best_score = 0, None
    for i in range(0, n - span):
        part = 20 * np.log10(level[i:i + span])
        score = part.std() + max(0.0, part.max() - np.median(part) - 6)
        if best_score is None or score < best_score:
            best, best_score = i, score
    return best * win


def make_loop(name, file, seconds, rate, channels, fade):
    x, src_rate = read_wav(os.path.join(SRC, file))
    x = x - x.mean(axis=0)
    total = seconds + fade
    if len(x) / src_rate < total:
        raise ValueError(f"{file} is shorter than {total} s")
    start = steadiest_start(x.mean(axis=1), src_rate, total)
    part = x[start:start + int(total * src_rate)]
    part = resample(to_channels(part, channels), src_rate, rate)
    n_fade = int(fade * rate)
    body, tail = part[:-n_fade].copy(), part[-n_fade:]
    # Equal-power crossfade: the end of the stretch fades into its start, so it loops without a seam.
    t = np.linspace(0, 1, n_fade)[:, None]
    body[:n_fade] = body[:n_fade] * np.sin(t * np.pi / 2) + tail * np.cos(t * np.pi / 2)
    rms = np.sqrt((body**2).mean())
    gain = 10 ** ((LOOP_RMS_DB - db(rms)) / 20)
    gain = min(gain, 10 ** (LOOP_PEAK_LIMIT_DB / 20) / np.abs(body).max())
    body *= gain
    write_wav(os.path.join(OUT, f"{name}.wav"), body, rate)
    print(f"{name}: {len(body) / rate:.1f} s from {start / src_rate:.1f} s, gain {db(gain):+.1f} dB, rms {db(np.sqrt((body**2).mean())):.1f} dB")


def make_creak(name, file):
    x, src_rate = read_wav(os.path.join(SRC, file))
    x = to_channels(x - x.mean(axis=0), 1)
    mono = x[:, 0]
    win = max(1, src_rate // 200)
    n = len(mono) // win
    level = 20 * np.log10(np.sqrt((mono[: n * win].reshape(n, win) ** 2).mean(axis=1)) + 1e-12)
    loud = np.nonzero(level > level.min() + TRIM_ABOVE_DB)[0]
    first, last = (loud[0], loud[-1] + 1) if len(loud) else (0, n)
    pad = int(0.02 * src_rate)
    x = x[max(0, first * win - pad): min(len(x), last * win + pad * 4)]
    x = resample(x, src_rate, CREAK_RATE)
    edge = int(EDGE_FADE_SEC * CREAK_RATE)
    ramp = np.linspace(0, 1, edge)[:, None]
    x[:edge] *= ramp
    x[-edge:] *= ramp[::-1]
    x *= 10 ** (CREAK_PEAK_DB / 20) / np.abs(x).max()
    write_wav(os.path.join(OUT, f"{name}.wav"), x, CREAK_RATE)
    print(f"{name}: {len(x) / CREAK_RATE:.2f} s")


if __name__ == "__main__":
    os.makedirs(OUT, exist_ok=True)
    for loop in LOOPS:
        make_loop(*loop)
    for creak in CREAKS:
        make_creak(*creak)
    sys.exit(0)
