#!/usr/bin/env python3
"""Forced alignment of the script to a recording, with PocketSphinx.

  python3 align_ps.py <audio> [--cues cues.json]

Prints, and returns as JSON on the last line, where each line of the script starts and ends in
the recording. It is a second opinion beside the loudness-based alignment in fit.py: it listens
for the words themselves, so it is not thrown by a long pause inside a line.
"""
import json
import re
import subprocess
import sys
import wave

from pocketsphinx import Decoder

EXTRA = {
    "razorpay's": "R EY Z ER P EY Z",
    "razorpay": "R EY Z ER P EY",
    "whatsapp": "W AH T S AE P",
    "zoya": "Z OW Y AH",
    "ai": "EY AY",
    "holdout": "HH OW L D AW T",
    "lakh": "L AA K",
    "downtime": "D AW N T AY M",
    "merchant's": "M ER CH AH N T S",
}


def words_of(text):
    t = text.lower().replace("-", " ")
    t = re.sub(r"[^a-z' ]+", " ", t)
    return [w.strip("'") if w not in ("i'd",) else w for w in t.split() if w.strip("'")]


def align(audio, cues):
    raw = subprocess.run(["ffmpeg", "-loglevel", "error", "-i", audio, "-ac", "1", "-ar", "16000", "-f", "s16le", "-"], check=True, capture_output=True).stdout
    dec = Decoder(samprate=16000, loglevel="FATAL")
    seq, owner = [], []
    for c in cues:
        for w in words_of(c["say"]):
            seq.append(w)
            owner.append(c["n"])
    for w in sorted(set(seq)):
        if dec.lookup_word(w) is None:
            if w in EXTRA:
                dec.add_word(w, EXTRA[w], True)
            else:
                raise SystemExit(f"no pronunciation for {w!r}; add it to EXTRA")
    dec.set_align_text(" ".join(seq))
    dec.start_utt()
    dec.process_raw(raw, full_utt=True)
    dec.end_utt()
    segs = [(s.word, s.start_frame / 100.0, (s.end_frame + 1) / 100.0) for s in dec.seg() if not s.word.startswith("<") and s.word != "(NULL)"]
    if len(segs) != len(seq):
        raise SystemExit(f"alignment returned {len(segs)} words for {len(seq)}")
    lines = {}
    for (w, a, b), n in zip(segs, owner):
        if n not in lines:
            lines[n] = [a, b]
        lines[n][1] = b
    return lines, segs


if __name__ == "__main__":
    audio = sys.argv[1]
    cues = json.load(open(sys.argv[3] if len(sys.argv) > 3 else "cues.json"))
    lines, segs = align(audio, cues)
    for n in sorted(lines):
        print(f"{n:2d}  {lines[n][0]:7.2f} to {lines[n][1]:7.2f}  ({lines[n][1] - lines[n][0]:5.2f}s)")
    print(json.dumps([[round(lines[n][0], 2), round(lines[n][1], 2)] for n in sorted(lines)]))
