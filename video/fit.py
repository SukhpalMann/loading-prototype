#!/usr/bin/env python3
"""Fits the picture to a voice-over, and the voice-over to the time limit.

  python3 fit.py <audio file> [--out fit/run] [--max 88.8]

What it does:
  1. Converts the recording to mono 48 kHz and finds the stretches of speech from the loudness
     of 20 ms frames.
  2. Finds which stretches belong to which line of the script, two ways: by listening for the
     words (forced alignment, align_ps.py), and by pauses and line lengths alone. It uses the
     first and prints where the two disagree.
  3. Schedules each line on the video's timeline. A line starts at its nominal time, or later if
     the line before it has not finished. The narrator's pauses between lines are not kept as
     they were: each line is placed as its own clip, with room tone from the same recording in
     between. If the result is over the limit, the pauses are tightened first and the tempo is
     raised slightly only if that is not enough.
  4. Writes the voice track, and a timings file for rec.mjs in which every anchor of the
     storyboard is tied to the line it belongs with.
"""
import argparse
import json
import os
import subprocess
import sys
import wave

import numpy as np

ANCHOR_LINE = {
    "problem": 1, "p_slab": 2, "p_tokens": 3,
    "idea": 4, "i_sort": 5,
    "plan": 6, "pl_stop": 7,
    "live": 8, "l_feed": 9, "l_rows": 10, "l_down": 11,
    "results": 12, "r_verdict": 13, "r_card": 14,
    "close": 15, "c_end": 16,
}
SR = 48000
PRE = 0.07  # keep this much before a line's first sound
POST = 0.14  # and this much after its last


def run(cmd):
    return subprocess.run(cmd, check=True, capture_output=True, text=True)


def read_wav(path):
    with wave.open(path, "rb") as f:
        x = np.frombuffer(f.readframes(f.getnframes()), dtype=np.int16).astype(np.float32) / 32768.0
        assert f.getframerate() == SR and f.getnchannels() == 1
    return x


def write_wav(path, x):
    with wave.open(path, "wb") as f:
        f.setnchannels(1)
        f.setsampwidth(2)
        f.setframerate(SR)
        f.writeframes((np.clip(x, -1, 1) * 32767).astype(np.int16).tobytes())


def speech_segments(x, min_speech=0.10, min_gap=0.16):
    hop = int(SR * 0.02)
    n = len(x) // hop
    frames = x[: n * hop].reshape(n, hop)
    db = 20 * np.log10(np.sqrt((frames**2).mean(axis=1)) + 1e-7)
    floor = float(np.percentile(db, 12))
    peak = float(np.percentile(db, 97))
    thr = max(floor + 10.0, peak - 30.0)
    on = db > thr
    segs, i = [], 0
    while i < n:
        if on[i]:
            j = i
            while j < n and on[j]:
                j += 1
            segs.append([i * 0.02, j * 0.02])
            i = j
        else:
            i += 1
    merged = []
    for s in segs:
        if merged and s[0] - merged[-1][1] < min_gap:
            merged[-1][1] = s[1]
        else:
            merged.append(s)
    return [s for s in merged if s[1] - s[0] >= min_speech], dict(floor=floor, peak=peak, thr=thr)


def align(segs, expected):
    """Assign consecutive groups of segments to lines. Returns (first_seg, last_seg) per line."""
    n, m = len(segs), len(expected)
    if n < m:
        raise SystemExit(f"Only {n} stretches of speech were found for {m} lines. Check the recording.")
    scale = sum(e - s for s, e in segs) / sum(expected)
    INF = 1e18
    cost = [[INF] * (n + 1) for _ in range(m + 1)]
    back = [[0] * (n + 1) for _ in range(m + 1)]
    cost[0][0] = 0.0
    for i in range(1, m + 1):
        want = expected[i - 1] * scale
        for j in range(i, n - (m - i) + 1):
            best, arg = INF, -1
            for a in range(i - 1, j):  # line i covers segments a..j-1
                if cost[i - 1][a] >= INF:
                    continue
                spoken = sum(e - s for s, e in segs[a:j])
                inner = sum(segs[q + 1][0] - segs[q][1] for q in range(a, j - 1))
                gap_before = segs[a][0] - segs[a - 1][1] if a > 0 else 1.0
                c = ((spoken - want) / want) ** 2 * 4.0 + inner * 0.6 - min(gap_before, 1.2) * 0.5 + cost[i - 1][a]
                if c < best:
                    best, arg = c, a
            cost[i][j], back[i][j] = best, arg
    out, j = [], n
    for i in range(m, 0, -1):
        a = back[i][j]
        out.append((a, j - 1))
        j = a
    return out[::-1]


def snap(ps_lines, segs):
    """Turn word-level line times into clean edges, using the stretches of speech around them."""
    onset, finish = [], []
    n = len(ps_lines)
    for i, (a, b) in enumerate(ps_lines):
        prev_end = ps_lines[i - 1][1] if i else -1.0
        next_start = ps_lines[i + 1][0] if i + 1 < n else 1e9
        o, f = a - 0.03, b + 0.05
        for s0, s1 in segs:
            if s0 - 0.05 <= a <= s1 and a - s0 <= 0.35 and s0 >= prev_end - 0.05:
                o = s0
            if s0 <= b <= s1 + 0.05 and s1 - b <= 0.5 and s1 <= next_start + 0.05:
                f = s1
        onset.append(max(o, 0.0))
        finish.append(f)
    return onset, finish


def schedule(nominal, dur, gap, first):
    v = [first]
    for n in range(1, len(dur)):
        v.append(max(nominal[n], v[-1] + dur[n - 1] + gap))
    return v


def room_tone(x, segs, length):
    """A stretch of the recording's own background, looped with crossfades, `length` samples long."""
    gaps = [(segs[i][1] + 0.12, segs[i + 1][0] - 0.10) for i in range(len(segs) - 1)]
    gaps += [(0.15, segs[0][0] - 0.15), (segs[-1][1] + 0.2, len(x) / SR - 0.1)]
    gaps = [g for g in gaps if g[1] - g[0] >= 0.25]
    if not gaps:
        return np.zeros(length, dtype=np.float32)
    a, b = max(gaps, key=lambda g: g[1] - g[0])
    tone = x[int(a * SR) : int(b * SR)].copy()
    fade = min(int(0.06 * SR), len(tone) // 4)
    out = np.zeros(length + len(tone), dtype=np.float32)
    pos = 0
    ramp = np.linspace(0, 1, fade, dtype=np.float32)
    while pos < length:
        piece = tone.copy()
        piece[:fade] *= ramp
        piece[-fade:] *= ramp[::-1]
        out[pos : pos + len(piece)] += piece
        pos += len(piece) - fade
    return out[:length]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("audio")
    ap.add_argument("--ref", default="ref.marks.json")
    ap.add_argument("--cues", default="cues.json")
    ap.add_argument("--expected", default="fit/tts/durs.json", help="spoken length of each line in a reference reading")
    ap.add_argument("--out", default="fit/run")
    ap.add_argument("--gap", type=float, default=0.34, help="shortest pause between two lines, seconds")
    ap.add_argument("--tail", type=float, default=1.3, help="seconds of picture after the last word")
    ap.add_argument("--max", type=float, default=88.8, help="longest allowed video, seconds")
    ap.add_argument("--manual", help="JSON list of [start, end] in the recording for each line, to override the detection")
    ap.add_argument("--list", action="store_true", help="print every stretch of speech found")
    ap.add_argument("--no-words", action="store_true", help="skip forced alignment and use pauses only")
    a = ap.parse_args()
    os.makedirs(a.out, exist_ok=True)

    ref = json.load(open(a.ref))
    cues = json.load(open(a.cues))
    nominal = [c["from"] for c in cues]
    expected = json.load(open(a.expected)) if os.path.exists(a.expected) else [len(c["say"].split()) / 2.6 for c in cues]

    raw = os.path.join(a.out, "voice-raw.wav")
    run(["ffmpeg", "-y", "-loglevel", "error", "-i", a.audio, "-ac", "1", "-ar", str(SR), "-af", "highpass=f=70", "-c:a", "pcm_s16le", raw])
    x = read_wav(raw)
    segs, lv = speech_segments(x)
    print(f"recording {len(x) / SR:.2f}s, background {lv['floor']:.1f} dB, speech above {lv['thr']:.1f} dB, {len(segs)} stretches of speech")
    if a.list:
        for i, (s0, s1) in enumerate(segs):
            pause = s0 - segs[i - 1][1] if i else s0
            print(f"  stretch {i:2d}  {s0:7.2f} to {s1:7.2f}  ({s1 - s0:5.2f}s, after a pause of {pause:4.2f}s)")
    groups = align(segs, expected)
    onset = [segs[g[0]][0] for g in groups]
    finish = [segs[g[1]][1] for g in groups]
    how = "pauses and line lengths"
    if a.manual:
        manual = json.load(open(a.manual))
        onset = [m[0] for m in manual]
        finish = [m[1] for m in manual]
        how = "times given by hand"
    elif not a.no_words:
        try:
            from align_ps import align as words_align

            ps, _ = words_align(raw, cues)
            ps_lines = [ps[n] for n in sorted(ps)]
            o2, f2 = snap(ps_lines, segs)
            worst = max(abs(x1 - x2) for x1, x2 in zip(onset, o2))
            print(f"line starts by the words and by the pauses differ by at most {worst:.2f}s")
            for i, (x1, x2) in enumerate(zip(onset, o2)):
                if abs(x1 - x2) > 0.3:
                    print(f"  line {i + 1}: by pauses {x1:.2f}, by words {x2:.2f}")
            onset, finish = o2, f2
            how = "the words (forced alignment)"
        except SystemExit as e:
            print("forced alignment was not possible:", e)
        except Exception as e:  # noqa: BLE001
            print("forced alignment failed:", type(e).__name__, e)
    print("lines located by", how)
    spoken = [f - o for o, f in zip(onset, finish)]

    # Schedule the lines. Tighten pauses, then raise the tempo, only as far as the limit needs.
    tempo, gap = 1.0, a.gap
    tail_min = ref["tail"]["fixed"] + 0.45 * ref["tail"]["scaled"]
    while True:
        dur = [s / tempo for s in spoken]
        v = schedule(nominal, dur, gap, nominal[0])
        c_end = v[15] - (nominal[15] - next(x_["at"] for x_ in ref["anchors"] if x_["name"] == "c_end"))
        end = max(v[-1] + dur[-1] + a.tail, c_end + tail_min)
        if end <= a.max:
            break
        if gap > 0.22:
            gap = round(gap - 0.02, 2)
        elif tempo < 1.08:
            tempo = round(tempo + 0.01, 2)
        else:
            break

    print(f"\npause between lines at least {gap:.2f}s, tempo x{tempo:.2f}")
    print("line  recorded-at  spoken  starts  nominal  shift  pause-before  text")
    for n in range(16):
        pause = v[n] - (v[n - 1] + dur[n - 1]) if n else 0.0
        print(f"{n + 1:4d}  {onset[n]:11.2f}  {dur[n]:6.2f}  {v[n]:6.2f}  {nominal[n]:7.2f}  {v[n] - nominal[n]:+5.2f}  {pause:12.2f}  {cues[n]['say'][:44]}")

    # Anchors follow the lines they belong with.
    at = {x_["name"]: x_ for x_ in ref["anchors"]}
    order = [x_["name"] for x_ in ref["anchors"]]
    targets, prev, notes = {}, None, []
    for name in order:
        line = ANCHOR_LINE[name] - 1
        t = v[line] - (nominal[line] - at[name]["at"])
        if prev is not None:
            least = targets[prev] + at[name]["fixed"] + 0.12 * at[name]["scaled"]
            if t < least:
                notes.append(f"{name}: the picture runs {least - t:.2f}s behind the voice here")
                t = least
        targets[name] = round(max(t, 0.0), 3)
        prev = name
    print("\nanchor       nominal   target   shift")
    for name in order:
        print(f"{name:10s}  {at[name]['at']:8.2f} {targets[name]:8.2f}  {targets[name] - at[name]['at']:+6.2f}")
    last_word = v[-1] + dur[-1]
    print(f"\nlast word ends at {last_word:.2f}s; video length {end:.2f}s" + ("   ** OVER THE LIMIT: a faster read is needed **" if end > a.max else ""))
    for n_ in notes:
        print("note:", n_)

    # Build the voice track: each line as its own clip, room tone in between.
    total = int(round(end * SR))
    track = room_tone(x, segs, total) * 0.9
    edge = int(0.012 * SR)
    ramp = np.linspace(0, 1, edge, dtype=np.float32)
    for n in range(16):
        a0 = max(0, int((onset[n] - PRE) * SR))
        b0 = min(len(x), int((finish[n] + POST) * SR))
        clip_path = os.path.join(a.out, f"line{n + 1:02d}.wav")
        write_wav(clip_path, x[a0:b0])
        if abs(tempo - 1.0) > 1e-6:
            fast = os.path.join(a.out, f"line{n + 1:02d}-t.wav")
            run(["ffmpeg", "-y", "-loglevel", "error", "-i", clip_path, "-af", f"atempo={tempo}", "-ar", str(SR), "-ac", "1", "-c:a", "pcm_s16le", fast])
            clip = read_wav(fast)
        else:
            clip = x[a0:b0].copy()
        start = int(round((v[n] - PRE / tempo) * SR))
        start = max(0, start)
        stop = min(total, start + len(clip))
        clip = clip[: stop - start]
        env = np.ones(len(clip), dtype=np.float32)
        env[:edge] = ramp
        env[-edge:] = ramp[::-1]
        track[start:stop] = track[start:stop] * (1 - env) + clip * env
    placed = os.path.join(a.out, "voice-placed.wav")
    write_wav(placed, track)
    final = os.path.join(a.out, "voice.wav")
    run([
        "ffmpeg", "-y", "-loglevel", "error", "-i", placed,
        "-af", "afftdn=nr=8:nf=-40,acompressor=threshold=-21dB:ratio=2.5:attack=8:release=140:makeup=2,loudnorm=I=-16:TP=-1.5:LRA=11,aresample=48000",
        "-ac", "1", "-c:a", "pcm_s16le", final,
    ])

    timings = {"anchors": targets, "end": round(end, 3), "ref": {"anchors": ref["anchors"], "tail": ref["tail"]}, "lines": [round(t, 3) for t in v], "line_ends": [round(t + d, 3) for t, d in zip(v, dur)], "tempo": tempo, "gap": gap, "last_word": round(last_word, 3)}
    out = os.path.join(a.out, "timings.json")
    json.dump(timings, open(out, "w"), indent=1)
    print("\nwrote", out, "and", final)
    return 1 if end > a.max else 0


if __name__ == "__main__":
    sys.exit(main())
